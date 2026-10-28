import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { chooseMove, levelsForSize, LEVELS } from '../src/ai.js';
import { createGame, passMove, playMove } from '../src/game.js';
import { fromDiagram } from './helpers.js';

const E = '.........';
const TEST_PLAYOUTS = 200;

const POSITIONS = {
  'capture a four-stone group in the middle': {
    rows: [E, E, '...XXXX..', '...OOOOX.', '...XXXX..', E, '......O..', '..O......', E],
    expect: [2, 3],
  },
  'capture two stones on the edge': {
    rows: ['..XOO....', '...XX....', E, E, '.....O...', E, '..O...X..', E, E],
    expect: [5, 0],
  },
  'capture three stones in the corner': {
    rows: ['OOX......', 'O.X......', 'XX.......', E, '....O....', E, '......X..', '...O.....', E],
    expect: [1, 1],
  },
  'capture the cutting stone to save a group in atari': {
    rows: [E, '...O.....', '..O.O....', '..OXO....', '..OXO....', '..XOX....', E, E, E],
    expect: [3, 6],
  },
  'capture by playing into the last eye': {
    rows: ['OOOX.....', 'O.OX.....', 'OOOX.....', 'XXXX.....', E, '.....O...', '......O..', E, E],
    expect: [1, 1],
  },
};

for (const [name, { rows, expect }] of Object.entries(POSITIONS)) {
  test(`the computer finds the capture: ${name}`, () => {
    for (const seed of [1, 2, 3]) {
      const game = fromDiagram(rows);
      const move = chooseMove(game, { playouts: TEST_PLAYOUTS, rng: createRng(seed), timeLimitMs: 60000 });
      assert.equal(move.pass, false);
      assert.deepEqual([move.x, move.y], expect, `seed ${seed}`);
      assert.equal(move.playouts, TEST_PLAYOUTS);
    }
  });
}

test('the computer passes after the opponent passed when passing wins', () => {
  const rows = Array(9).fill('...XXO...');
  const game = fromDiagram(rows, { komi: 0.5, toMove: 2 });
  passMove(game);
  assert.equal(game.toMove, 1);
  const move = chooseMove(game, { playouts: TEST_PLAYOUTS, rng: createRng(4), timeLimitMs: 60000 });
  assert.equal(move.pass, true);
});

test('the computer never returns an illegal move and respects the time cap', () => {
  const game = createGame({ size: 9 });
  let clock = 0;
  const move = chooseMove(game, { playouts: 100000, rng: createRng(2), timeLimitMs: 50, now: () => (clock += 1) });
  assert.ok(move.playouts <= 51);
  assert.ok(playMove(game, move.x, move.y).ok);
});

test('levels: 19x19 offers only easy, budgets grow with the level', () => {
  assert.deepEqual(levelsForSize(19), ['easy']);
  assert.deepEqual(levelsForSize(9), ['easy', 'medium', 'hard']);
  assert.deepEqual(levelsForSize(13), ['easy', 'medium', 'hard']);
  assert.ok(LEVELS.easy.playouts < LEVELS.medium.playouts && LEVELS.medium.playouts < LEVELS.hard.playouts);
});
