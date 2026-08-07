// Wiring: events in, DOM out.  The rules live in cribbage.mjs, the state in
// game.mjs, and the drawing in render.mjs.

import { Game, OPPONENT } from './game.mjs';
import { buildBoard, handEl, reviewEl } from './render.mjs';

const $ = (id) => document.getElementById(id);

const TICK_MS  = 200;
const MAX_HAND = 121; // a peg never shows more than the winning post

const board = buildBoard($('board'));

// Knobs on the query string, for tuning without editing anything: `?to=48`
// shortens the game, `?pace=4` sets the opponent's seconds-per-turn, and
// `?pegs=8` changes what a correct answer is worth.
const params  = new URLSearchParams(location.search);
const winning = Number(params.get('to'))   || undefined;
const pegs    = Number(params.get('pegs')) || undefined;
const paceSec = Number(params.get('pace'));

// ?pegs= moves the opponent too, so the two sides always need the same number of
// turns and changing one number doesn't quietly rig the game.
const opponent = (pegs !== undefined || paceSec > 0)
               ? {
                   points:  pegs ?? OPPONENT.points,
                   everyMs: paceSec > 0 ? paceSec * 1000 : OPPONENT.everyMs,
                 }
               : undefined;

// A readonly input still displays its value and still takes focus, but iOS
// won't raise the system keyboard over the cards for it.  So on touch devices we
// drive the field from our own keypad instead.
const isTouch = window.matchMedia('(hover: none)').matches;

let game;
let timer;

function paint () {
  board.setScores(
    Math.min(game.playerScore,   MAX_HAND),
    Math.min(game.opponentScore, MAX_HAND),
  );

  $('status').textContent = game.handsPlayed === 0
    ? 'first hand'
    : `hand ${game.handsPlayed + 1} · ${game.handsRight} right of ${game.handsPlayed}`;
}

function showHand () {
  $('hand-area').replaceChildren(handEl(game.hand));
}

function rejectGuess () {
  const input = $('guess');
  input.classList.remove('bad');
  void input.offsetWidth; // restart the animation even on a repeat offence
  input.classList.add('bad');
}

function finish () {
  clearInterval(timer);
  paint();
  board.snap();

  $('play').hidden   = true;
  $('review').hidden = false;

  $('outcome').textContent = game.winner === 'player'
                           ? 'You win.'
                           : 'The opponent wins.';

  $('tally').textContent = `${game.handsRight} of ${game.handsPlayed} hands right`
    + ` · ${Math.min(game.playerScore, MAX_HAND)}`
    + ` to ${Math.min(game.opponentScore, MAX_HAND)}`;

  $('log-area').replaceChildren(reviewEl(game.log));
  $('again').focus();
}

function start () {
  clearInterval(timer);

  game = new Game({ winning, opponent, pegs });

  $('review').hidden = true;
  $('play').hidden   = false;
  $('guess').value   = '';

  showHand();
  paint();
  if (! isTouch) $('guess').focus();

  timer = setInterval(() => {
    game.tick();
    if (game.isOver) finish();
    else paint();
  }, TICK_MS);
}

$('guess-form').addEventListener('submit', (event) => {
  event.preventDefault();

  const entry = game.guess($('guess').value);

  if (entry === undefined) {
    rejectGuess();
    return;
  }

  $('guess').value = '';

  if (game.isOver) {
    finish();
    return;
  }

  showHand();
  paint();
});

$('guess').addEventListener('input', (event) => {
  const input = event.target;
  const clean = input.value.replace(/[^0-9]/g, '').slice(0, 2);
  if (clean !== input.value) input.value = clean;
});

$('again').addEventListener('click', start);

document.addEventListener('visibilitychange', () => {
  if (! document.hidden) game?.resume();
});

if (isTouch) {
  const pad   = $('keypad');
  const input = $('guess');

  input.readOnly = true;

  for (const key of [ '1','2','3','4','5','6','7','8','9','C','0','⏎' ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = key;
    button.textContent = key;
    pad.append(button);
  }

  pad.hidden = false;

  pad.addEventListener('click', (event) => {
    const key = event.target.dataset?.key;
    if (! key) return;

    if      (key === 'C') input.value = '';
    else if (key === '⏎') $('guess-form').requestSubmit();
    else if (input.value.length < 2) input.value += key;
  });
}

start();
