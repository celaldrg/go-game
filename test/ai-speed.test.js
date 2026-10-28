import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { chooseMove, LEVELS, TIME_LIMIT_MS } from '../src/ai.js';
import { createGame, playMove, passMove } from '../src/game.js';
import { randomMove } from '../src/playout.js';

test('with the hard budget the slowest of the first six computer moves of a seeded 9x9 game (the opening, where playouts are longest) stays under 1.5 s', () => {
  assert.ok(TIME_LIMIT_MS < 1500);
  const game = createGame({ size: 9, seed: 3 });
  const aiRng = createRng(31);
  const otherRng = createRng(32);
  let slowest = 0;
  let aiMoves = 0;
  while (aiMoves < 6 && game.phase === 'play') {
    const t0 = performance.now();
    const m = chooseMove(game, { level: 'hard', rng: aiRng });
    slowest = Math.max(slowest, performance.now() - t0);
    aiMoves++;
    if (m.pass) passMove(game);
    else playMove(game, m.x, m.y);
    const p = randomMove(game.board, game.toMove, otherRng);
    const reply = p < 0 ? null : game.board.coords(p);
    if (!reply || !playMove(game, reply.x, reply.y).ok) passMove(game);
  }
  assert.equal(aiMoves, 6);
  assert.ok(slowest < 1500, `slowest move took ${slowest.toFixed(0)} ms (hard = ${LEVELS.hard.playouts} playouts)`);
});

test('an easy move on 19x19 also stays under 1.5 s', () => {
  const game = createGame({ size: 19 });
  const t0 = performance.now();
  const m = chooseMove(game, { level: 'easy', rng: createRng(5) });
  assert.ok(performance.now() - t0 < 1500);
  assert.ok(playMove(game, m.x, m.y).ok);
});
