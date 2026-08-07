// Turning game data into DOM.  Everything here takes plain data and returns
// elements; the one exception is buildBoard, which builds the 242 holes once and
// hands back a closure for moving the pegs, because rebuilding them on every
// tick would be silly.

import { SKUNK_ORIGIN, SKUNK_PATH, SKUNK_SIZE } from './skunk.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

const X0         = 3;    // the start hole, "hole zero", where a peg sits at nil
const STREET_GAP = 0.5;  // extra space after every fifth hole
const HOLES      = 121;

const TRACK_Y  = { opponent: 9, player: 22 };

// Thirty and sixty short of the end: reach 121 while your opponent is short of
// 91 and they're skunked, short of 61 and it's a double skunk.  These are the
// positions a real board bothers to mark, so they're the ticks too, in place of
// a plain every-thirty ruler. -- claude, 2026-08-07
const SKUNKS = [
  { at: 61, count: 2 },
  { at: 91, count: 1 },
];

const TICKS = [ 0, 61, 91, 121 ];

// The tallies are right-justified against this, so a lone 0 sits where the 0 of
// 110 sits.  Left-justified, a one-digit score left the board looking lopsided.
const TALLY_RIGHT = 152;

const SKUNK_HEIGHT = 4.8;  // board units
const SKUNK_GAP    = 0.5;  // between the two of them at the double line
const SKUNK_TOP    = 0.4;

// A peg walks to its new hole rather than teleporting.  Twelve points at once
// is a big enough jump to read as a windfall; crawling it makes it read as
// progress, which is the truer feeling. -- claude, 2026-08-07
const HOLE_MS = 300;

function svgEl (name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [ key, value ] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function el (name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Holes are grouped in streets of five, as on a real board, so the gap falls
// after the fifth hole and not before it.
function holeX (hole) {
  if (hole <= 0) return X0;
  return X0 + hole + Math.floor((hole - 1) / 5) * STREET_GAP;
}

// Midway between a hole and the one before it, which is where a boundary line
// belongs: the skunk line marks "you have to reach 61", not hole 61 itself, so
// drawing it through that hole is wrong.  At 61 and 91 the midpoint lands in a
// street gap, which is where a wooden board puts it too. -- claude, 2026-08-07
function beforeHole (hole) {
  return (holeX(hole - 1) + holeX(hole)) / 2;
}

// Draw both tracks into an <svg> and return { setScores }.
export function buildBoard (svg) {
  svg.setAttribute('viewBox', `0 0 ${holeX(HOLES) + 18} 31`);
  svg.setAttribute('role', 'img');
  svg.replaceChildren();

  const pegs = {};

  // Drawn first, so the holes and pegs sit over them rather than under.
  for (const skunk of SKUNKS) {
    const x = beforeHole(skunk.at);

    svg.append(svgEl('line', {
      class: 'skunk-line',
      x1: x, y1: TRACK_Y.opponent - 3.4,
      x2: x, y2: TRACK_Y.player + 3.4,
    }));

    // One skunk for the skunk line, two for the double, centred on the line.
    const scale = SKUNK_HEIGHT / SKUNK_SIZE.height;
    const width = SKUNK_SIZE.width * scale;
    const span  = skunk.count * width + (skunk.count - 1) * SKUNK_GAP;

    for (let n = 0; n < skunk.count; n++) {
      const left = x - span / 2 + n * (width + SKUNK_GAP);

      const mark = svgEl('g', {
        class: 'skunk-mark',
        transform: `translate(${left} ${SKUNK_TOP}) scale(${scale}) ${SKUNK_ORIGIN}`,
      });

      mark.append(svgEl('path', { d: SKUNK_PATH }));
      svg.append(mark);
    }
  }

  for (const who of [ 'opponent', 'player' ]) {
    const y     = TRACK_Y[who];
    const track = svgEl('g', { class: `track ${who}` });

    track.append(svgEl('line', {
      class: 'start-mark',
      x1: X0, y1: y - 2.2, x2: X0, y2: y + 2.2,
    }));

    for (let hole = 1; hole <= HOLES; hole++) {
      track.append(svgEl('circle', {
        class: hole === HOLES ? 'hole game-hole' : 'hole',
        cx: holeX(hole), cy: y, r: hole === HOLES ? 0.7 : 0.42,
      }));
    }

    const label = svgEl('text', { class: 'track-label', x: X0, y: y - 4.4 });
    label.textContent = who === 'player' ? 'YOU' : 'OPPONENT';
    track.append(label);

    const peg = svgEl('circle', { class: 'peg', cx: holeX(0), cy: y, r: 1.7 });
    const num = svgEl('text', { class: 'tally', x: TALLY_RIGHT, y: y + 2.4 });
    num.textContent = '0';

    track.append(peg, num);
    svg.append(track);

    pegs[who] = { peg, num };
  }

  // A skunk tick names the line above it, so it sits with the line; 0 and 121 are
  // the ends of the track and sit on their holes.
  const skunkAt = new Set(SKUNKS.map(skunk => skunk.at));

  for (const tick of TICKS) {
    const label = svgEl('text', {
      class: 'tick',
      x: skunkAt.has(tick) ? beforeHole(tick) : holeX(tick),
      y: TRACK_Y.player + 6,
    });
    label.textContent = String(tick);
    svg.append(label);
  }

  const shown  = { player: 0, opponent: 0 };
  const target = { player: 0, opponent: 0 };
  let crawl;

  const WHO = [ 'player', 'opponent' ];

  function place (who) {
    const at = Math.min(shown[who], HOLES);
    pegs[who].peg.setAttribute('cx', holeX(at));
    pegs[who].num.textContent = String(at);
  }

  function step () {
    let moved = false;

    for (const who of WHO) {
      if (shown[who] === target[who]) continue;
      shown[who] += Math.sign(target[who] - shown[who]);
      place(who);
      moved = true;
    }

    if (! moved) {
      clearInterval(crawl);
      crawl = undefined;
    }
  }

  return {
    // Where the pegs are headed.  Safe to call on every frame; the walk only
    // starts if there's somewhere to walk to.
    setScores (player, opponent) {
      target.player   = Math.min(player,   HOLES);
      target.opponent = Math.min(opponent, HOLES);

      const settled = WHO.every(who => shown[who] === target[who]);
      if (! settled && crawl === undefined) crawl = setInterval(step, HOLE_MS);
    },

    // Asked of the pegs, not of the timer: the interval doesn't notice it's done
    // until the step after the last one, and that's 300ms of nothing.
    get walking () { return WHO.some(who => shown[who] !== target[who]) },

    // Stop walking and be where you were going.  For starting a new game, where
    // the alternative is watching both pegs retreat 121 holes.
    snap () {
      clearInterval(crawl);
      crawl = undefined;

      for (const who of WHO) { shown[who] = target[who]; place(who) }
    },
  };
}

export function cardEl (card) {
  const node = el('div', `card ${card.isRed ? 'red' : 'black'}`);
  node.setAttribute('aria-label', `${card.rank} of ${card.suit}`);
  node.append(el('span', 'corner', card.rank), el('span', 'pip', card.glyph));
  return node;
}

function backEl () {
  const node = el('div', 'card back');
  node.setAttribute('aria-hidden', 'true');
  return node;
}

// The cut card sits off to the left, the way it sits above the deck.
function tableEl (starter, held) {
  const node = el('div', 'hand');

  const cut = el('div', 'cut');
  cut.append(starter, el('span', 'cut-label', 'cut'));

  const heldBox = el('div', 'held');
  for (const card of held) heldBox.append(card);

  node.append(cut, heldBox);
  return node;
}

export function handEl (hand) {
  return tableEl(cardEl(hand.starter), hand.cards.map(cardEl));
}

// The table before the deal: the same five places, all face down.
export function faceDownHandEl () {
  return tableEl(backEl(), [ backEl(), backEl(), backEl(), backEl() ]);
}

function cardListEl (cards) {
  const node = el('span', 'card-list');
  for (const card of cards) {
    node.append(el('span', `mini ${card.isRed ? 'red' : 'black'}`, card.toString()));
  }
  return node;
}

// The scorecard: one row per combination, with the cards that made it.  The
// layout is the one sketched in the old PrettyPrinter, minus the padding hacks.
export function breakdownEl (scoreBoard) {
  const table = el('table', 'breakdown');
  const body  = el('tbody');

  if (scoreBoard.hits.length === 0) {
    const row = el('tr', 'nothing');
    row.append(el('td'), el('td', null, 'nothing at all'), el('td', 'pts', '0'));
    body.append(row);
  }

  for (const hit of scoreBoard.hits) {
    const row = el('tr');
    const cards = el('td', 'cards');
    cards.append(cardListEl(hit.cards));
    row.append(cards, el('td', 'what', hit.type), el('td', 'pts', String(hit.score)));
    body.append(row);
  }

  const foot = el('tfoot');
  const total = el('tr');
  total.append(
    el('td'),
    el('td', 'what', 'TOTAL'),
    el('td', 'pts', String(scoreBoard.score)),
  );
  foot.append(total);

  table.append(body, foot);
  return table;
}

// One <details> per hand played.  <details> gets us click-to-open, keyboard
// access, and phone behaviour for free.
export function reviewEl (log) {
  const list = el('ol', 'log');

  for (const entry of log) {
    const item    = el('li');
    const details = el('details', entry.correct ? 'right' : 'wrong');
    const summary = el('summary');

    summary.append(
      el('span', 'hand-no', `#${entry.n}`),
      el('span', 'mark', entry.correct ? '✓' : '✗'),
      el('span', 'said', entry.correct
        ? `${entry.actual}`
        : `said ${entry.guessed}, was ${entry.actual}`),
    );

    const detail = el('div', 'detail');
    detail.append(handEl(entry.hand), breakdownEl(entry.hand.scoreBoard));

    details.append(summary, detail);
    item.append(details);
    list.append(item);
  }

  return list;
}
