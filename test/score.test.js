import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK } from '../src/board.js';
import { createRng } from '../src/rng.js';
import { areaScore, proposeDeadStones } from '../src/score.js';
import { passMove, toggleDead, finishScoring, resumePlay, getState, scoreGame, resultString } from '../src/game.js';
import { fromDiagram, indices } from './helpers.js';

// Position A: black owns columns A-E, white F-J.
const WALLS = Array(9).fill('....XO...');

// Position B: black wall on D, white wall on F, neutral points on E, a dead white stone at B5.
const DAME = Array(9)
  .fill('...X.O...')
  .map((row, y) => (y === 4 ? '.O.X.O...' : row));

// Position C: black lives in the upper-left corner, white owns the rest; a dead black stone at H2.
const CORNER = [
  '....XO...',
  '....XO...',
  '....XO...',
  '....XO...',
  'XXXXXO...',
  'OOOOOO...',
  '.........',
  '.......X.',
  '.........',
];

const set = (size, points) => new Set(indices(size, points));

test('area score of position A (two walls) matches the hand count', () => {
  const game = fromDiagram(WALLS, { komi: 6.5 });
  const s = areaScore(game.board, new Set(), 6.5);
  assert.deepEqual(s.black, { stones: 9, territory: 36, total: 45 });
  assert.deepEqual(s.white, { stones: 9, territory: 27, komi: 6.5, total: 42.5 });
  assert.equal(s.winner, 'black');
  assert.equal(s.margin, 2.5);
});

test('area score of position B (neutral points and a dead stone) matches the hand count', () => {
  const game = fromDiagram(DAME);
  const s = areaScore(game.board, set(9, [[1, 4]]), 6.5);
  assert.deepEqual(s.black, { stones: 9, territory: 27, total: 36 });
  assert.deepEqual(s.white, { stones: 9, territory: 27, komi: 6.5, total: 42.5 });
  assert.equal(s.winner, 'white');
  assert.equal(s.margin, 6.5);
  assert.equal(s.owner[4 * 9 + 1], BLACK, 'the dead stone point is black territory');
  assert.equal(s.owner[4 * 9 + 4], 0, 'E5 is neutral');

  const unmarked = areaScore(game.board, new Set(), 6.5);
  assert.equal(unmarked.black.total, 9, 'with the white stone alive black has no territory');
  assert.equal(unmarked.white.total, 10 + 27 + 6.5);
});

test('area score of position C (corner and a dead stone) matches the hand count', () => {
  const game = fromDiagram(CORNER, { komi: 0.5 });
  const s = areaScore(game.board, set(9, [[7, 7]]), 0.5);
  assert.deepEqual(s.black, { stones: 9, territory: 16, total: 25 });
  assert.deepEqual(s.white, { stones: 11, territory: 45, komi: 0.5, total: 56.5 });
  assert.equal(s.winner, 'white');
  assert.equal(s.margin, 31.5);
});

test('dead-stone proposal: lone invaders on both sides of two walls', () => {
  const rows = WALLS.map((row, y) => (y === 4 ? '.O..XO.X.' : row));
  const game = fromDiagram(rows);
  const dead = proposeDeadStones(game.board, { rng: createRng(11), playouts: 200 });
  assert.deepEqual(
    [...dead].sort((a, b) => a - b),
    indices(9, [
      [1, 4],
      [7, 4],
    ]),
  );
});

test('dead-stone proposal: two-stone groups inside the corner and inside the big area', () => {
  const rows = CORNER.slice();
  rows[1] = '.OO.XO...';
  rows[7] = '......XX.';
  const game = fromDiagram(rows);
  const dead = proposeDeadStones(game.board, { rng: createRng(12), playouts: 200 });
  assert.deepEqual(
    [...dead].sort((a, b) => a - b),
    indices(9, [
      [1, 1],
      [2, 1],
      [6, 7],
      [7, 7],
    ]),
  );
});

test('dead-stone proposal: a three-stone group in a corner, neutral points stay neutral', () => {
  const rows = DAME.slice();
  rows[4] = '...X.O...';
  rows[7] = 'OO.X.O...';
  rows[8] = '.O.X.O...';
  const game = fromDiagram(rows);
  const dead = proposeDeadStones(game.board, { rng: createRng(13), playouts: 200 });
  assert.deepEqual(
    [...dead].sort((a, b) => a - b),
    indices(9, [
      [0, 7],
      [1, 7],
      [1, 8],
    ]),
  );
});

test('scoring phase: proposal after two passes, toggling groups and the final result', () => {
  const rows = WALLS.map((row, y) => (y === 4 ? '.O..XO...' : row));
  const game = fromDiagram(rows, { seed: 5 });
  passMove(game);
  passMove(game);
  assert.equal(game.phase, 'scoring');
  assert.deepEqual(getState(game).dead, indices(9, [[1, 4]]));
  assert.equal(scoreGame(game).black.total, 45);

  assert.ok(toggleDead(game, 1, 4));
  assert.equal(scoreGame(game).black.total, 9, 'marking the invader alive removes black territory');
  assert.ok(toggleDead(game, 1, 4));
  assert.ok(toggleDead(game, 4, 0), 'a whole wall can be toggled');
  assert.equal(getState(game).dead.length, 10);
  assert.ok(toggleDead(game, 4, 8));
  assert.equal(toggleDead(game, 2, 2), false, 'empty points cannot be toggled');

  assert.ok(finishScoring(game));
  assert.equal(game.phase, 'over');
  assert.equal(game.result.winner, 'black');
  assert.equal(resultString(game), 'B+2.5');
  assert.ok(getState(game).territory, 'territory is exposed for drawing');
});

test('resuming play from the scoring phase clears the marks', () => {
  const game = fromDiagram(WALLS);
  passMove(game);
  passMove(game);
  assert.ok(resumePlay(game));
  assert.equal(game.phase, 'play');
  assert.deepEqual(getState(game).dead, []);
  assert.equal(game.toMove, BLACK);
});
