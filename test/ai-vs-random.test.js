// The computer (about 200 playouts per move) against a random-legal player on 9x9.
// The 20 seeded games run in four worker threads to keep the suite fast.
import { isMainThread, Worker, parentPort, workerData } from 'node:worker_threads';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE } from '../src/board.js';
import { createRng } from '../src/rng.js';
import { chooseMove } from '../src/ai.js';
import { createGame, checkMove, playMove, passMove, finishScoring } from '../src/game.js';

const GAMES = 20;
const WORKERS = 4;
const TEST_PLAYOUTS = 200;
const MAX_PLIES = 250;

/** A uniformly random legal move that does not fill one of its own eyes, or a pass. */
function randomLegalMove(game, rng) {
  const b = game.board;
  const moves = [];
  for (let y = 0; y < game.size; y++) {
    for (let x = 0; x < game.size; x++) {
      if (checkMove(game, x, y).ok && !b.isEye(b.index(x, y), game.toMove)) moves.push([x, y]);
    }
  }
  return moves.length ? moves[rng.int(moves.length)] : null;
}

/** Plays one seeded game; the computer takes black in even games and white in odd ones. */
function playGame(index) {
  const game = createGame({ size: 9, komi: 6.5, seed: index + 1 });
  const computer = index % 2 === 0 ? BLACK : WHITE;
  const aiRng = createRng(100 + index);
  const randomRng = createRng(200 + index);
  for (let ply = 0; game.phase === 'play' && ply < MAX_PLIES; ply++) {
    if (game.toMove === computer) {
      const m = chooseMove(game, { playouts: TEST_PLAYOUTS, rng: aiRng, timeLimitMs: 60000 });
      if (m.pass) passMove(game);
      else assert.ok(playMove(game, m.x, m.y).ok, 'the computer plays only legal moves');
    } else {
      const m = randomLegalMove(game, randomRng);
      if (m) playMove(game, m[0], m[1]);
      else passMove(game);
    }
  }
  while (game.phase === 'play') passMove(game);
  finishScoring(game);
  const winner = computer === BLACK ? 'black' : 'white';
  return { index, won: game.result.winner === winner, margin: game.result.margin, moves: game.moves.length };
}

if (isMainThread) {
  test(`DONE: the computer beats a random-legal player in at least 19 of ${GAMES} seeded 9x9 games`, async () => {
    const batches = Array.from({ length: WORKERS }, (_, w) => {
      const games = [];
      for (let i = w; i < GAMES; i += WORKERS) games.push(i);
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { games } });
        worker.once('message', resolve);
        worker.once('error', reject);
      });
    });
    const results = (await Promise.all(batches)).flat();
    assert.equal(results.length, GAMES);
    const wins = results.filter((r) => r.won).length;
    assert.ok(wins >= 19, `won ${wins} of ${GAMES}: ${JSON.stringify(results)}`);
  });
} else {
  parentPort.postMessage(workerData.games.map(playGame));
}
