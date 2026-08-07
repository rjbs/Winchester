import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Game, MAX_TICK_MS, parseGuess } from '../game.mjs';

// A clock we can shove forward by hand, so none of this waits on real time.
function fakeClock () {
  let t = 0;
  return { now: () => t, advance (ms) { t += ms } };
}

function newGame (opts = {}) {
  const clock = fakeClock();
  const game  = new Game({ now: clock.now, ...opts });
  return { game, clock };
}

// Advance the clock in small steps, ticking as a browser's setInterval would,
// so the per-tick clamp doesn't eat the time we meant to give.
function runFor (game, clock, ms, stepMs = 200) {
  for (let spent = 0; spent < ms; spent += stepMs) {
    clock.advance(Math.min(stepMs, ms - spent));
    game.tick();
  }
}

function parses (input, want) {
  test(`parseGuess(${JSON.stringify(input)}) is ${want}`, () => {
    assert.equal(parseGuess(input), want);
  });
}

function opponent_has_after (elapsedMs, want) {
  test(`opponent has ${want} after ${elapsedMs}ms`, () => {
    const { game, clock } = newGame();
    runFor(game, clock, elapsedMs);
    assert.equal(game.opponentScore, want);
  });
}

parses('7', 7);
parses('0', 0);
parses(' 12 ', 12);
parses('19', 0);      // nineteen is no hand at all
parses('', undefined);
parses('four', undefined);
parses('-2', undefined);
parses('1 2', undefined);

opponent_has_after(0, 0);
opponent_has_after(9_800, 0);
opponent_has_after(10_000, 2);
opponent_has_after(19_800, 2);
opponent_has_after(20_000, 4);
opponent_has_after(60_000, 12);

test('a hand is on the table from the start', () => {
  const { game } = newGame();
  assert.equal(game.hand.cards.length, 4);
  assert.ok(game.hand.starter);
  assert.equal(game.handsPlayed, 0);
});

test('a correct guess pegs two and deals again', () => {
  const { game } = newGame();
  const first = game.hand;

  const entry = game.guess(String(first.score));

  assert.equal(entry.correct, true);
  assert.equal(game.playerScore, 2);
  assert.equal(game.handsPlayed, 1);
  assert.equal(game.handsRight, 1);
  assert.notEqual(game.hand, first);
});

test('a wrong guess pegs nothing but still deals again', () => {
  const { game } = newGame();
  const first  = game.hand;
  const actual = first.score;

  const entry = game.guess(String(actual + 1));

  assert.equal(entry.correct, false);
  assert.equal(entry.guessed, actual + 1);
  assert.equal(entry.actual, actual);
  assert.equal(game.playerScore, 0);
  assert.equal(game.handsPlayed, 1);
  assert.equal(game.handsRight, 0);
  assert.notEqual(game.hand, first);
});

test('an unparseable guess is not a turn', () => {
  const { game } = newGame();
  const first = game.hand;

  assert.equal(game.guess('lots'), undefined);
  assert.equal(game.handsPlayed, 0);
  assert.equal(game.hand, first);
});

test('the log keeps the hand, so the review can score it again', () => {
  const { game } = newGame();
  game.guess('4');
  game.guess('4');

  assert.deepEqual(game.log.map(e => e.n), [ 1, 2 ]);
  for (const entry of game.log) {
    assert.equal(entry.guessed, 4);
    assert.equal(entry.hand.scoreBoard.score, entry.actual);
  }
});

test('the player wins by reaching the target', () => {
  const { game } = newGame({ winning: 4 });

  game.guess(String(game.hand.score));
  assert.equal(game.winner, undefined);

  game.guess(String(game.hand.score));
  assert.equal(game.winner, 'player');
  assert.equal(game.playerScore, 4);
});

test('the opponent wins by reaching the target', () => {
  const { game, clock } = newGame({ winning: 4 });
  runFor(game, clock, 20_000);

  assert.equal(game.winner, 'opponent');
  assert.equal(game.opponentScore, 4);
});

test('nothing moves once someone has won', () => {
  const { game, clock } = newGame({ winning: 2 });
  runFor(game, clock, 10_000);
  assert.equal(game.winner, 'opponent');

  const hand = game.hand;
  assert.equal(game.guess(String(hand.score)), undefined);
  assert.equal(game.playerScore, 0);

  runFor(game, clock, 60_000);
  assert.equal(game.opponentScore, 2);
});

test('the opponent does not bank time while the page sleeps', () => {
  const { game, clock } = newGame();

  clock.advance(5 * 60_000);
  game.tick();

  assert.equal(game.opponentScore, 0, 'one long tick only credits the clamp');

  // ...and the clamp is the only thing that saved us.
  const { game: greedy, clock: greedyClock } = newGame({ maxTickMs: Infinity });
  greedyClock.advance(5 * 60_000);
  greedy.tick();
  assert.equal(greedy.opponentScore, 60);
});

test('resuming forgets the time nobody was watching', () => {
  const { game, clock } = newGame({ maxTickMs: Infinity });

  clock.advance(5 * 60_000);
  game.resume();
  game.tick();

  assert.equal(game.opponentScore, 0);
  assert.ok(MAX_TICK_MS > 0);
});
