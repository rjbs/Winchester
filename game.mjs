// The game around the rules: two pegs, a hand to score, and an opponent who
// pegs on a timer whether or not you're ready.  Nothing here touches the DOM,
// and the clock is injected, so the whole thing is testable in node.

import { Deck, Hand } from './cribbage.mjs';

// Twelve points a hand means a game is about eleven deals, which is a game of
// cribbage rather than a spelling test.  The opponent gets the same twelve on a
// ten-second beat, so the two sides need the same number of turns and you have
// about ten seconds a hand. -- claude, 2026-08-07
export const OPPONENT     = { points: 12, everyMs: 10_000 };
export const CORRECT_PEGS = 12;
export const WINNING      = 121;

// A wrong answer pays the opponent.  Without it, a guess costs nothing but the
// seconds it took, so firing off numbers to see what sticks is faintly
// rewarded.  Two is enough to make guessing worse than thinking without making
// one slip fatal. -- claude, 2026-08-07
export const PENALTY = 2;

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
    pegs     = CORRECT_PEGS,
    penalty  = PENALTY,
    deck,
  } = {}) {
    this.#now       = now;
    this.#maxTickMs = maxTickMs;
    this.#opponent  = opponent;
    this.#deck      = (deck ?? new Deck).shuffle();

    this.pegs          = pegs;
    this.penalty       = penalty;
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

  // The skunk lines, cribbage's own: reach the post while the loser is thirty
  // short of it and they're skunked, sixty short and it's a double.  Measured
  // from the winning post rather than fixed at 91 and 61, so a shortened game
  // keeps the shape a full board draws at those two holes.  undefined until
  // there's a winner, and for a win by an ordinary margin. -- claude, 2026-08-08
  get skunk() {
    if (this.winner === undefined) return undefined;

    const loser = this.winner === 'player' ? this.opponentScore : this.playerScore;

    const level = loser < this.winning - 60 ? 2
                : loser < this.winning - 30 ? 1
                : 0;

    return level === 0 ? undefined : { level, who: this.winner };
  }

  get handsPlayed() { return this.log.length }

  get handsRight() { return this.log.filter(entry => entry.correct).length }

  #peg(who, points) {
    if (this.isOver) return;

    if (who === 'player') this.playerScore   += points;
    else                  this.opponentScore += points;

    const total = who === 'player' ? this.playerScore : this.opponentScore;
    if (total >= this.winning) this.winner = who;
  }

  // Score the current hand against the player's guess, log it, pay whoever
  // earned it, and deal the next one.  Returns the log entry, or undefined if
  // the guess wasn't a number or the game is already over.
  guess(text) {
    if (this.isOver) return undefined;

    const guessed = parseGuess(text);
    if (guessed === undefined) return undefined;

    const hand    = this.hand;
    const actual  = hand.scoreBoard.score;
    const correct = guessed === actual;

    const entry = {
      n: this.log.length + 1,
      hand, guessed, actual, correct,
      pegged:   correct ? this.pegs    : 0,
      conceded: correct ? 0            : this.penalty,
    };

    this.log.push(entry);

    if (entry.pegged)   this.#peg('player',   entry.pegged);
    if (entry.conceded) this.#peg('opponent', entry.conceded);

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
