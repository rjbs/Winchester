// The game around the rules: two pegs, a hand to score, and an opponent who
// pegs on a timer whether or not you're ready.  Nothing here touches the DOM,
// and the clock is injected, so the whole thing is testable in node.

import { Deck, Hand } from './cribbage.mjs';

export const OPPONENT     = { points: 2, everyMs: 10_000 };
export const CORRECT_PEGS = 2;
export const WINNING      = 121;

// The most wall time a single tick may claim.  Without this, locking your phone
// for five minutes means the opponent has pegged out by the time you unlock, so
// "the opponent never stops" really means "never stops while the page is
// awake". -- claude, 2026-08-07
export const MAX_TICK_MS = 500;

// Nineteen is the cribbage player's name for a hand worth nothing, there being
// no way to make nineteen, so we take it as a claim of zero.
export function parseGuess (text) {
  const digits = String(text).trim();
  if (! /^[0-9]+$/.test(digits)) return undefined;

  const guess = parseInt(digits, 10);
  return guess === 19 ? 0 : guess;
}

export class Game {
  #now;
  #maxTickMs;
  #opponent;
  #deck;

  #lastTick;
  #owedMs = 0; // opponent time credited but not yet spent on pegs

  constructor({
    now      = Date.now,
    maxTickMs = MAX_TICK_MS,
    opponent = OPPONENT,
    winning  = WINNING,
    deck,
  } = {}) {
    this.#now       = now;
    this.#maxTickMs = maxTickMs;
    this.#opponent  = opponent;
    this.#deck      = (deck ?? new Deck).shuffle();

    this.winning       = winning;
    this.playerScore   = 0;
    this.opponentScore = 0;
    this.winner        = undefined;
    this.log           = [];

    this.#lastTick = now();
    this.deal();
  }

  // Five cards off the top, the first of which is the starter.  They go back in
  // and the deck reshuffles, so hands may share cards across deals.  For a
  // trainer that's fine, and it keeps every hand equally likely.
  deal() {
    const cards = this.#deck.pick(5);
    this.hand = new Hand(cards[0], cards.slice(1));

    this.#deck.replace(cards);
    this.#deck.shuffle();
  }

  get isOver() { return this.winner !== undefined }

  get handsPlayed() { return this.log.length }

  get handsRight() { return this.log.filter(entry => entry.correct).length }

  #peg(who, points) {
    if (this.isOver) return;

    if (who === 'player') this.playerScore   += points;
    else                  this.opponentScore += points;

    const total = who === 'player' ? this.playerScore : this.opponentScore;
    if (total >= this.winning) this.winner = who;
  }

  // Score the current hand against the player's guess, log it, and deal the
  // next one.  Returns the log entry, or undefined if the guess wasn't a number
  // or the game is already over.
  guess(text) {
    if (this.isOver) return undefined;

    const guessed = parseGuess(text);
    if (guessed === undefined) return undefined;

    const hand    = this.hand;
    const actual  = hand.scoreBoard.score;
    const correct = guessed === actual;

    const entry = { n: this.log.length + 1, hand, guessed, actual, correct };
    this.log.push(entry);

    if (correct) this.#peg('player', CORRECT_PEGS);
    if (! this.isOver) this.deal();

    return entry;
  }

  // Advance the opponent by however much wall time has gone by, clamped; see
  // MAX_TICK_MS.  Call this often -- several times a second.
  tick() {
    const now     = this.#now();
    const elapsed = Math.max(0, Math.min(now - this.#lastTick, this.#maxTickMs));
    this.#lastTick = now;

    if (this.isOver) return;

    this.#owedMs += elapsed;
    while (this.#owedMs >= this.#opponent.everyMs && ! this.isOver) {
      this.#owedMs -= this.#opponent.everyMs;
      this.#peg('opponent', this.#opponent.points);
    }
  }

  // Forget the time that passed while nobody was watching.  The clamp in tick()
  // handles this too, but resetting the mark on the way back in is cheaper than
  // relying on it.
  resume() {
    this.#lastTick = this.#now();
  }
}
