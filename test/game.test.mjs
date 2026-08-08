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

// Tests that care about exact numbers name their own pegs and pacing, so tuning
// the defaults doesn't break them.
const SLOW = { points: 2, everyMs: 10_000 };

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
opponent_has_after(10_000, 12);
opponent_has_after(19_800, 12);
opponent_has_after(20_000, 24);
opponent_has_after(60_000, 72);

// Both sides need the same number of turns, so a game is about eleven deals for
// whoever gets there.
test('the two sides are paced alike', () => {
  const { game } = newGame();
  assert.equal(Math.ceil(game.winning / game.pegs), 11);
});

test('a hand is on the table from the start', () => {
  const { game } = newGame();
  assert.equal(game.hand.cards.length, 4);
  assert.ok(game.hand.starter);
  assert.equal(game.handsPlayed, 0);
});

test('a correct guess pegs the hand and deals again', () => {
  const { game } = newGame({ pegs: 12 });
  const first = game.hand;

  const entry = game.guess(String(first.score));

  assert.equal(entry.correct, true);
  assert.equal(entry.pegged, 12);
  assert.equal(game.playerScore, 12);
  assert.equal(game.handsPlayed, 1);
  assert.equal(game.handsRight, 1);
  assert.notEqual(game.hand, first);
});

test('a wrong guess pays the opponent and deals again', () => {
  const { game } = newGame({ penalty: 2 });
  const first  = game.hand;
  const actual = first.score;

  const entry = game.guess(String(actual + 1));

  assert.equal(entry.correct, false);
  assert.equal(entry.guessed, actual + 1);
  assert.equal(entry.actual, actual);
  assert.equal(entry.pegged, 0);
  assert.equal(entry.conceded, 2);
  assert.equal(game.playerScore, 0);
  assert.equal(game.opponentScore, 2, 'the opponent takes the penalty');
  assert.equal(game.handsPlayed, 1);
  assert.equal(game.handsRight, 0);
  assert.notEqual(game.hand, first);
});

test('a right guess concedes nothing', () => {
  const { game } = newGame({ penalty: 2 });

  const entry = game.guess(String(game.hand.score));

  assert.equal(entry.conceded, 0);
  assert.equal(game.opponentScore, 0);
});

test('the penalty can be switched off', () => {
  const { game } = newGame({ penalty: 0 });

  const entry = game.guess(String(game.hand.score + 1));

  assert.equal(entry.conceded, 0);
  assert.equal(game.opponentScore, 0);
});

test('enough wrong answers lose the game outright', () => {
  const { game } = newGame({ winning: 4, penalty: 2, opponent: SLOW });

  game.guess(String(game.hand.score + 1));
  assert.equal(game.winner, undefined);

  game.guess(String(game.hand.score + 1));
  assert.equal(game.winner, 'opponent', 'no clock needed, just bad guessing');
  assert.equal(game.opponentScore, 4);
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
  const { game } = newGame({ winning: 4, pegs: 2 });

  game.guess(String(game.hand.score));
  assert.equal(game.winner, undefined);

  game.guess(String(game.hand.score));
  assert.equal(game.winner, 'player');
  assert.equal(game.playerScore, 4);
});

test('the opponent wins by reaching the target', () => {
  const { game, clock } = newGame({ winning: 4, opponent: SLOW });
  runFor(game, clock, 20_000);

  assert.equal(game.winner, 'opponent');
  assert.equal(game.opponentScore, 4);
});

test('nothing moves once someone has won', () => {
  const { game, clock } = newGame({ winning: 2, opponent: SLOW });
  runFor(game, clock, 10_000);
  assert.equal(game.winner, 'opponent');

  const hand = game.hand;
  assert.equal(game.guess(String(hand.score)), undefined);
  assert.equal(game.playerScore, 0);

  runFor(game, clock, 60_000);
  assert.equal(game.opponentScore, 2);
});

// Guess every hand right until the target is reached; the opponent's score is
// left wherever the clock has already put it.
function playerWinsOut (game) {
  while (! game.isOver) game.guess(String(game.hand.score));
}

test('no skunk before there is a winner', () => {
  const { game } = newGame();
  assert.equal(game.skunk, undefined);
});

test('a win with the opponent at nil is a double skunk', () => {
  const { game } = newGame({ winning: 121, pegs: 12 });
  playerWinsOut(game);

  assert.equal(game.winner, 'player');
  assert.deepEqual(game.skunk, { level: 2, who: 'player' });
});

test('a win with the opponent between the lines is a single skunk', () => {
  const { game, clock } = newGame({ winning: 121, pegs: 12 });
  runFor(game, clock, 60_000); // six opponent turns of twelve: 72, past 61
  assert.equal(game.opponentScore, 72);

  playerWinsOut(game);

  assert.equal(game.winner, 'player');
  assert.deepEqual(game.skunk, { level: 1, who: 'player' });
});

test('a win with the opponent past the skunk line is no skunk', () => {
  const { game, clock } = newGame({ winning: 121, pegs: 12 });
  runFor(game, clock, 80_000); // eight turns: 96, past 91
  assert.equal(game.opponentScore, 96);

  playerWinsOut(game);

  assert.equal(game.winner, 'player');
  assert.equal(game.skunk, undefined);
});

test('losing badly is a skunk against you', () => {
  const { game, clock } = newGame({ winning: 121 });
  runFor(game, clock, 110_000); // the opponent pegs out while you sit at nil

  assert.equal(game.winner, 'opponent');
  assert.deepEqual(game.skunk, { level: 2, who: 'opponent' });
});

// The board draws its lines at 61 and 91 for a game to 121; a shortened game
// slides them to keep the same thirty-and-sixty shape.
test('the skunk lines follow the winning post', () => {
  const { game } = newGame({ winning: 61, pegs: 61 });
  playerWinsOut(game); // one right hand carries the whole game

  assert.equal(game.winner, 'player');
  assert.deepEqual(game.skunk, { level: 2, who: 'player' }, 'opponent at nil, sixty short');
});

test('no perfect game before there is a winner', () => {
  const { game } = newGame();
  assert.equal(game.perfect, false);
});

test('winning without a wrong answer is a perfect game', () => {
  const { game } = newGame({ winning: 24, pegs: 12 });
  playerWinsOut(game);

  assert.equal(game.winner, 'player');
  assert.equal(game.perfect, true);
});

test('one wrong answer spoils it, even in a win', () => {
  // penalty 0 so the miss can't hand the game away; the win still stands, but
  // the record no longer does.
  const { game } = newGame({ winning: 24, pegs: 12, penalty: 0 });

  game.guess(String(game.hand.score + 1)); // a miss that costs nothing
  while (! game.isOver) game.guess(String(game.hand.score));

  assert.equal(game.winner, 'player');
  assert.ok(game.handsRight < game.handsPlayed);
  assert.equal(game.perfect, false);
});

test('an opponent win is never perfect', () => {
  const { game, clock } = newGame({ winning: 4, opponent: SLOW });
  runFor(game, clock, 20_000); // the opponent pegs out while you sit at nil

  assert.equal(game.winner, 'opponent');
  assert.equal(game.perfect, false, 'no hands played, but still not yours to claim');
});

const ENDLESS = { winning: Infinity, opponent: SLOW };

test('the opponent does not bank time while the page sleeps', () => {
  const { game, clock } = newGame(ENDLESS);

  clock.advance(5 * 60_000);
  game.tick();

  assert.equal(game.opponentScore, 0, 'one long tick only credits the clamp');

  // ...and the clamp is the only thing that saved us.
  const greedy = newGame({ ...ENDLESS, maxTickMs: Infinity });
  greedy.clock.advance(5 * 60_000);
  greedy.game.tick();
  assert.equal(greedy.game.opponentScore, 60);
});

test('resuming forgets the time nobody was watching', () => {
  const { game, clock } = newGame({ ...ENDLESS, maxTickMs: Infinity });

  clock.advance(5 * 60_000);
  game.resume();
  game.tick();

  assert.equal(game.opponentScore, 0);
  assert.ok(MAX_TICK_MS > 0);
});
