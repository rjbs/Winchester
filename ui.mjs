// Wiring: events in, DOM out.  The rules live in cribbage.mjs, the state in
// game.mjs, and the drawing in render.mjs.

import { Game, CORRECT_PEGS, OPPONENT, PENALTY, WINNING } from './game.mjs';
import { buildBoard, faceDownHandEl, handEl, reviewEl } from './render.mjs';

const $ = (id) => document.getElementById(id);

const TICK_MS  = 200;
const MAX_HAND = 121; // a peg never shows more than the winning post

const board = buildBoard($('board'));

// The tuneables live in the query string, so the settings dialog and a
// hand-typed ?pace=6 are the same mechanism: a tuned game survives a reload and
// can be bookmarked, and there's no storage layer to go stale. -- claude, 2026-08-07
const DEFAULTS = {
  pegs: CORRECT_PEGS,
  pace: OPPONENT.everyMs / 1000,
  to:   WINNING,
  miss: PENALTY,
};

function readSettings () {
  const params = new URLSearchParams(location.search);

  // Absence is checked before reading, because Number(null) is 0 and `miss` is
  // allowed to be zero -- otherwise leaving it out would read as "no penalty".
  const read = (key, least) => {
    if (! params.has(key)) return DEFAULTS[key];

    const value = Number(params.get(key));
    return Number.isFinite(value) && value >= least ? value : DEFAULTS[key];
  };

  return {
    pegs: read('pegs', 1),
    pace: read('pace', 1),
    to:   read('to',   1),
    miss: read('miss', 0),
  };
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

// 'ready' is a dealt game sitting face down, waiting for you to say go.  The
// clock belongs to 'playing' alone, so loading the page costs nothing.
let phase = 'ready';

function mmss (seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Say what the numbers mean, since 12 points and 10 seconds don't obviously add
// up to a game length until you've done the division.
function describe (what) {
  const turns = Math.ceil(what.to / what.pegs);

  const line = `${turns} right answers to win.`
    + `  The opponent gets there in ${mmss(turns * what.pace)}.`;

  return what.miss ? `${line}  A wrong answer gives them ${what.miss}.` : line;
}

function paint () {
  board.setScores(
    Math.min(game.playerScore,   MAX_HAND),
    Math.min(game.opponentScore, MAX_HAND),
  );

  if (phase === 'ready') {
    $('status').textContent = describe(settings);
    return;
  }

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
// a second.  It shows what the answer cost or earned, but never what the answer
// was: that reckoning is saved for the review.
function stamp (kind, points) {
  const node = $('flash');

  node.className = '';
  node.replaceChildren();
  void node.offsetWidth;

  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.textContent = kind === 'hit' ? '★' : '✗';
  node.append(glyph);

  if (points) {
    const change = document.createElement('span');
    change.className = 'gain';
    change.textContent = kind === 'hit' ? `+${points}` : `−${points}`;
    node.append(change);
  }

  node.className = kind;
}

// The board is done; wait for the winning peg to actually arrive before covering
// it with the review.  Walking the last twelve holes in is the whole payoff, and
// snapping there was throwing it away.
function finish () {
  clearInterval(timer);
  phase = 'over';
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

// A skunk earns a line beyond the result, in the English manner: for a beaten
// opponent, contempt kept behind the teeth; for a drubbing of one's own, no
// more than a tight nod that it happened.  Deep feeling, said as flatly as it
// can be, and worse the second time either way. -- claude, 2026-08-08
const SKUNK_LINES = {
  player: {
    1: 'You win.  A skunk; the opponent fell short of the line, and would sooner it went unmentioned.',
    2: 'You win.  A double skunk.  One does try not to stare.',
  },
  opponent: {
    1: 'The opponent wins.  Skunked.  A poor showing, but there it is.',
    2: "The opponent wins.  A double skunk against you.  We shan't speak of it again.",
  },
};

function outcomeText () {
  const skunk = game.skunk;
  if (skunk) return SKUNK_LINES[skunk.who][skunk.level];

  return game.winner === 'player' ? 'You win.' : 'The opponent wins.';
}

function review () {
  $('play').hidden   = true;
  $('review').hidden = false;

  $('outcome').textContent = outcomeText();

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

// Deal a game but don't start it: cards face down, a Start button where the
// score entry goes, and no clock running.
function setUp () {
  clearInterval(timer);
  phase = 'ready';

  game = new Game({
    winning:  settings.to,
    pegs:     settings.pegs,
    penalty:  settings.miss,
    opponent: { points: settings.pegs, everyMs: settings.pace * 1000 },
  });

  $('review').hidden     = true;
  $('play').hidden       = false;
  $('pregame').hidden    = false;
  $('guess-form').hidden = true;
  $('keypad').hidden     = true;
  $('guess').value       = '';
  $('flash').className   = '';

  $('hand-area').replaceChildren(faceDownHandEl());
  paint();
  board.snap(); // straight back to nil, rather than retreating a hole at a time

  $('start').focus();
}

function begin () {
  phase = 'playing';

  $('pregame').hidden    = true;
  $('guess-form').hidden = false;
  $('keypad').hidden     = ! isTouch;

  showHand();
  paint();
  if (! isTouch) $('guess').focus();

  game.resume(); // the clock starts now, not when the page loaded
  runClock();
}

$('guess-form').addEventListener('submit', (event) => {
  event.preventDefault();

  if (phase !== 'playing') return; // not started, or the pegs are still walking

  const entry = game.guess($('guess').value);

  if (entry === undefined) {
    shakeBox();
    return;
  }

  $('guess').value = '';

  if (entry.correct) {
    stamp('hit', entry.pegged);
  } else {
    stamp('miss', entry.conceded);
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

$('start').addEventListener('click', begin);
$('again').addEventListener('click', setUp);

// ---- settings -------------------------------------------------------------

const SLIDERS = {
  pegs: 'set-pegs',
  miss: 'set-miss',
  pace: 'set-pace',
  to:   'set-to',
};

function draftSettings () {
  const draft = {};
  for (const [ key, id ] of Object.entries(SLIDERS)) draft[key] = Number($(id).value);
  return draft;
}

function describeDraft () {
  const draft = draftSettings();

  for (const key of Object.keys(SLIDERS)) $(`out-${key}`).textContent = draft[key];

  $('set-note').textContent = describe(draft);
}

$('gear').addEventListener('click', () => {
  // The opponent doesn't peg while you're fiddling with the dials.  Only while
  // playing, though: in 'over' the winning peg may still be walking, and
  // stopping that clock means the review never arrives.
  if (phase === 'playing') clearInterval(timer);

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
    setUp();
    return;
  }

  if (phase === 'playing') {
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

setUp();

window.winchesterReady = true; // watched by the boot check in index.html
