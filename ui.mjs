// Wiring: events in, DOM out.  The rules live in cribbage.mjs, the state in
// game.mjs, and the drawing in render.mjs.

import { Game, OPPONENT, WINNING } from './game.mjs';
import { buildBoard, handEl, reviewEl } from './render.mjs';

const $ = (id) => document.getElementById(id);

const TICK_MS  = 200;
const MAX_HAND = 121; // a peg never shows more than the winning post

const board = buildBoard($('board'));

// The tuneables live in the query string, so the settings dialog and a
// hand-typed ?pace=6 are the same mechanism: a tuned game survives a reload and
// can be bookmarked, and there's no storage layer to go stale. -- claude, 2026-08-07
const DEFAULTS = {
  pegs: OPPONENT.points,
  pace: OPPONENT.everyMs / 1000,
  to:   WINNING,
};

function readSettings () {
  const params = new URLSearchParams(location.search);

  const positive = (key) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && value > 0 ? value : DEFAULTS[key];
  };

  return { pegs: positive('pegs'), pace: positive('pace'), to: positive('to') };
}

// Only what differs from the defaults, so an ordinary game keeps a clean URL.
function writeSettings (next) {
  const params = new URLSearchParams();
  for (const [ key, value ] of Object.entries(next)) {
    if (value !== DEFAULTS[key]) params.set(key, String(value));
  }

  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

// A readonly input still displays its value and still takes focus, but iOS
// won't raise the system keyboard over the cards for it.  So on touch devices we
// drive the field from our own keypad instead.
const isTouch = window.matchMedia('(hover: none)').matches;

let settings = readSettings();
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

function shakeBox () {
  const input = $('guess');
  input.classList.remove('bad');
  void input.offsetWidth; // restart the animation even on a repeat offence
  input.classList.add('bad');
}

// A star for a hit, a cross for a miss, stamped over the table and gone in half
// a second.  A miss must not give the answer away, so it says nothing.
function stamp (kind, gained) {
  const node = $('flash');

  node.className = '';
  node.replaceChildren();
  void node.offsetWidth;

  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.textContent = kind === 'hit' ? '★' : '✗';
  node.append(glyph);

  if (kind === 'hit') {
    const gain = document.createElement('span');
    gain.className = 'gain';
    gain.textContent = `+${gained}`;
    node.append(gain);
  }

  node.className = kind;
}

// The board is done; wait for the winning peg to actually arrive before covering
// it with the review.  Walking the last twelve holes in is the whole payoff, and
// snapping there was throwing it away.
function finish () {
  clearInterval(timer);
  paint();

  if (board.walking) {
    timer = setInterval(() => {
      if (board.walking) return;
      clearInterval(timer);
      review();
    }, TICK_MS);

    return;
  }

  review();
}

function review () {
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

function runClock () {
  clearInterval(timer);

  timer = setInterval(() => {
    game.tick();
    if (game.isOver) finish();
    else paint();
  }, TICK_MS);
}

function start () {
  clearInterval(timer);

  game = new Game({
    winning:  settings.to,
    pegs:     settings.pegs,
    opponent: { points: settings.pegs, everyMs: settings.pace * 1000 },
  });

  $('review').hidden  = true;
  $('play').hidden    = false;
  $('guess').value    = '';
  $('flash').className = '';

  showHand();
  paint();
  board.snap(); // straight back to nil, rather than retreating a hole at a time
  if (! isTouch) $('guess').focus();

  runClock();
}

$('guess-form').addEventListener('submit', (event) => {
  event.preventDefault();

  if (game.isOver) return; // the pegs are still walking; the game isn't

  const entry = game.guess($('guess').value);

  if (entry === undefined) {
    shakeBox();
    return;
  }

  $('guess').value = '';

  if (entry.correct) {
    stamp('hit', entry.pegged);
  } else {
    stamp('miss');
    shakeBox();
  }

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

// ---- settings -------------------------------------------------------------

const SLIDERS = { pegs: 'set-pegs', pace: 'set-pace', to: 'set-to' };

function mmss (seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function draftSettings () {
  const draft = {};
  for (const [ key, id ] of Object.entries(SLIDERS)) draft[key] = Number($(id).value);
  return draft;
}

// Say what the numbers mean, since "12" and "10 seconds" don't obviously add up
// to a game length until you've done the division.
function describeDraft () {
  const draft = draftSettings();

  for (const key of Object.keys(SLIDERS)) $(`out-${key}`).textContent = draft[key];

  const turns = Math.ceil(draft.to / draft.pegs);
  $('set-note').textContent = `${turns} right answers to win.`
    + `  The opponent gets there in ${mmss(turns * draft.pace)}.`;
}

$('gear').addEventListener('click', () => {
  // The opponent doesn't peg while you're fiddling with the dials.  Leave the
  // clock alone once the game is over, or the winning peg stops mid-walk and the
  // review never arrives.
  if (! game.isOver) clearInterval(timer);

  for (const [ key, id ] of Object.entries(SLIDERS)) $(id).value = String(settings[key]);

  describeDraft();
  $('settings').showModal();
});

for (const id of Object.values(SLIDERS)) {
  $(id).addEventListener('input', describeDraft);
}

$('set-cancel').addEventListener('click', () => $('settings').close('cancel'));

// Escape closes with an empty returnValue, so anything but Apply is a cancel.
$('settings').addEventListener('close', () => {
  if ($('settings').returnValue === 'apply') {
    settings = draftSettings();
    writeSettings(settings);
    start();
    return;
  }

  if (! game.isOver) {
    game.resume(); // no credit for the time the dialog was open
    runClock();
  }
});

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
