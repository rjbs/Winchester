// Turning game data into DOM.  Everything here takes plain data and returns
// elements; the one exception is buildBoard, which builds the 242 holes once and
// hands back a closure for moving the pegs, because rebuilding them on every
// tick would be silly.

const SVG_NS = 'http://www.w3.org/2000/svg';

const X0         = 3;    // the start hole, "hole zero", where a peg sits at nil
const STREET_GAP = 0.5;  // extra space after every fifth hole
const HOLES      = 121;

const TRACK_Y  = { opponent: 9, player: 22 };
const TICKS    = [ 0, 30, 60, 90, 121 ];

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

// Draw both tracks into an <svg> and return { setScores }.
export function buildBoard (svg) {
  svg.setAttribute('viewBox', `0 0 ${holeX(HOLES) + 18} 31`);
  svg.setAttribute('role', 'img');
  svg.replaceChildren();

  const pegs = {};

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
    const num = svgEl('text', { class: 'tally', x: holeX(HOLES) + 4, y: y + 2.4 });
    num.textContent = '0';

    track.append(peg, num);
    svg.append(track);

    pegs[who] = { peg, num };
  }

  for (const tick of TICKS) {
    const label = svgEl('text', {
      class: 'tick', x: holeX(tick), y: TRACK_Y.player + 6,
    });
    label.textContent = String(tick);
    svg.append(label);
  }

  return {
    setScores (player, opponent) {
      for (const [ who, score ] of Object.entries({ player, opponent })) {
        const shown = Math.min(score, HOLES);
        pegs[who].peg.setAttribute('cx', holeX(shown));
        pegs[who].num.textContent = String(shown);
      }
    },
  };
}

export function cardEl (card) {
  const node = el('div', `card ${card.isRed ? 'red' : 'black'}`);
  node.setAttribute('aria-label', `${card.rank} of ${card.suit}`);
  node.append(el('span', 'corner', card.rank), el('span', 'pip', card.glyph));
  return node;
}

// The cut card sits off to the left, the way it sits above the deck.
export function handEl (hand) {
  const node = el('div', 'hand');

  const cut = el('div', 'cut');
  cut.append(cardEl(hand.starter), el('span', 'cut-label', 'cut'));

  const held = el('div', 'held');
  for (const card of hand.cards) held.append(cardEl(card));

  node.append(cut, held);
  return node;
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
