import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Deck, Hand } from '../cribbage.mjs';

// Each case is one call below.  The hand string is Hand.ez notation: the first
// card is the starter, then the four cards held, and T means ten.  wantHits is
// a count of scoring combinations by type, which is what catches the scorer
// double-counting (six pairs inside four of a kind) or under-counting (only one
// leg of a double run).
function hand_scores (handString, wantScore, wantHits, { isCrib = false } = {}) {
  const what = isCrib ? 'crib' : 'hand';

  test(`${what} ${handString} scores ${wantScore}`, () => {
    const scoreBoard = Hand.ez(handString, { isCrib }).scoreBoard;

    const gotHits = {};
    for (const hit of scoreBoard.hits) {
      gotHits[ hit.type ] ??= 0;
      gotHits[ hit.type ]++;
    }

    assert.deepEqual(gotHits, wantHits, 'scoring combinations found');
    assert.equal(scoreBoard.score, wantScore, 'total score');

    const summed = scoreBoard.hits.reduce((n, hit) => n + hit.score, 0);
    assert.equal(summed, wantScore, 'hits sum to the total');

    for (const hit of scoreBoard.hits) {
      assert.ok(hit.cards.length >= 1, `${hit.type} names the cards involved`);
    }
  });
}

function crib_scores (handString, wantScore, wantHits) {
  hand_scores(handString, wantScore, wantHits, { isCrib: true });
}

// The famous 29: four fives and the jack matching the starter's suit.  Eight
// fifteens (four J+5, four 5+5+5), four of a kind, and nobs.
hand_scores('5D  JD 5C 5S 5H', 29, {
  'Fifteen': 8,
  'Double Pair Royal': 1,
  'His Nobs': 1,
});

hand_scores('7C  AD 3H JS KH', 0, {});

// A double run of four: both fives extend 3-4-_-6 independently.
hand_scores('5H  3C 4D 5S 6H', 14, {
  'Run of Four': 2,
  'Pair': 1,
  'Fifteen': 2,
});

// A triple run: three ways to make 4-5-6, plus pair royal.
hand_scores('4H  4C 4D 5S 6H', 21, {
  'Run of Three': 3,
  'Pair Royal': 1,
  'Fifteen': 3,
});

// A run of five must swallow its own runs of three and four rather than
// scoring 5 + 3 + 3 + 3 + 4 + 4.
hand_scores('3C  4D 5H 6S 7C', 9, {
  'Run of Five': 1,
  'Fifteen': 2,
});

// Four of a kind is 12, not 12 plus the six pairs inside it.
hand_scores('7H  7C 7D 7S 2H', 12, {
  'Double Pair Royal': 1,
});

// Four hearts held, starter a club: a hand flush, but nothing in the crib.
hand_scores('2C  3H 6H 9H KH', 8, { 'Hand Flush': 1, 'Fifteen': 2 });
crib_scores('2C  3H 6H 9H KH', 4, { 'Fifteen': 2 });

// Five of a suit counts everywhere, crib included.
hand_scores('2H  3H 6H 9H KH', 9, { 'Five Card Flush': 1, 'Fifteen': 2 });
crib_scores('2H  3H 6H 9H KH', 9, { 'Five Card Flush': 1, 'Fifteen': 2 });

hand_scores('AS  3S 5S 7S 9S', 9, { 'Five Card Flush': 1, 'Fifteen': 2 });

// Nobs is the jack of the starter's suit, and only that suit.
hand_scores('5S  JS 2C 3D 4H', 9, {
  'His Nobs': 1,
  'Run of Four': 1,
  'Fifteen': 2,
});

hand_scores('5D  JS 2C 3D 4H', 8, {
  'Run of Four': 1,
  'Fifteen': 2,
});

test('a hand knows its own score', () => {
  assert.equal(Hand.ez('5D  JD 5C 5S 5H').score, 29);
});

test('a deck holds fifty-two distinct cards', () => {
  const deck = new Deck;
  const names = new Set(deck.pick(52).map(c => `${c.rank}${c.glyph}`));
  assert.equal(names.size, 52);
});

test('picked cards can be put back', () => {
  const deck = new Deck;
  const picked = deck.pick(5);
  deck.replace(picked);
  assert.equal(deck.shuffle().pick(52).length, 52);
});

test('a deck refuses to deal what it does not have', () => {
  const deck = new Deck;
  deck.pick(50);
  assert.throws(() => deck.pick(5), /can't pick 5 cards/);
});
