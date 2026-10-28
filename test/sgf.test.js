import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE } from '../src/board.js';
import { createRng } from '../src/rng.js';
import { randomMove } from '../src/playout.js';
import { createGame, playMove, passMove, resign, finishScoring, getState } from '../src/game.js';
import { toSGF, parseSGF, gameFromSGF } from '../src/sgf.js';
import { toDiagram } from './helpers.js';

/** A seeded random game with captures and a pass in the middle. */
function randomGame(opts, plies, seed) {
  const game = createGame(opts);
  const rng = createRng(seed);
  for (let i = 0; i < plies; i++) {
    const p = i === 20 ? -1 : randomMove(game.board, game.toMove, rng);
    const c = p < 0 ? null : game.board.coords(p);
    if (!c || !playMove(game, c.x, c.y).ok) passMove(game);
  }
  return game;
}

function assertSameGame(a, b) {
  assert.equal(b.size, a.size);
  assert.equal(b.komi, a.komi);
  assert.equal(b.handicap, a.handicap);
  assert.deepEqual(b.setup, a.setup);
  assert.deepEqual(b.players, a.players);
  assert.deepEqual(b.moves, a.moves);
  assert.deepEqual(toDiagram(b), toDiagram(a));
  assert.deepEqual(getState(b).captures, getState(a).captures);
  assert.equal(b.toMove, a.toMove);
}

test('SGF export then import gives the same game (handicap, captures, pass, resignation)', () => {
  const game = randomGame({ size: 9, handicap: 3, players: { black: 'Ada [B]', white: 'Can\\W' } }, 90, 7);
  assert.ok(getState(game).captures.black + getState(game).captures.white > 0, 'the game contains captures');
  resign(game, BLACK);
  const sgf = toSGF(game);
  assert.match(sgf, /SZ\[9\]/);
  assert.match(sgf, /HA\[3\]/);
  assert.match(sgf, /KM\[0\.5\]/);
  assert.match(sgf, /AB\[/);
  assert.match(sgf, /RE\[W\+R\]/);
  assert.match(sgf, /PB\[Ada \[B\\\]\]/);
  assert.match(sgf, /PW\[Can\\\\W\]/);
  const copy = gameFromSGF(sgf);
  assertSameGame(game, copy);
  assert.equal(copy.startColor, WHITE);
  assert.equal(parseSGF(sgf).result, 'W+R');
  assert.equal(copy.phase, 'over', 'an imported resigned game opens finished');
  assert.deepEqual(copy.result, game.result);
  assert.equal(toSGF(copy), sgf, 'a second export is identical');
});

test('SGF round trip of a scored 13x13 game keeps the result', () => {
  const game = randomGame({ size: 13, komi: 7.5 }, 40, 9);
  passMove(game);
  passMove(game);
  finishScoring(game);
  const sgf = toSGF(game);
  const data = parseSGF(sgf);
  assert.equal(data.result, `${game.result.winner === 'black' ? 'B' : 'W'}+${game.result.margin}`);
  const copy = gameFromSGF(sgf);
  assert.deepEqual(copy.moves, game.moves);
  assert.equal(copy.phase, 'scoring', 'two final passes put the imported game in the dead-stone phase');
});

test('SGF import applies a black resignation and leaves other results live', () => {
  const resigned = gameFromSGF('(;GM[1]SZ[9]RE[W+R];B[ee];W[cc])');
  assert.equal(resigned.phase, 'over');
  assert.deepEqual(resigned.result, { winner: 'white', reason: 'resign', margin: 0 });
  const blackWins = gameFromSGF('(;GM[1]SZ[9]RE[B+Resign];B[ee])');
  assert.equal(blackWins.result.winner, 'black');
  const scored = gameFromSGF('(;GM[1]SZ[9]RE[B+3.5];B[ee])');
  assert.notEqual(scored.phase, 'over');
  assert.equal(scored.result, null);
});

test('SGF import follows the main line and reads setup stones', () => {
  const text = `(;GM[1]FF[4]SZ[9]KM[5.5]PB[Black]PW[White]AB[cc][gg]AW[cg]
    ;W[ee] C[comment with \\] bracket]
    (;B[dd];W[]  ;B[tt])
    (;B[ff]))`;
  const data = parseSGF(text);
  assert.equal(data.size, 9);
  assert.equal(data.komi, 5.5);
  assert.deepEqual(data.setup, { black: [20, 60], white: [56] });
  assert.deepEqual(data.moves, [
    { color: WHITE, point: 40 },
    { color: BLACK, point: 30 },
    { color: WHITE, point: -1 },
    { color: BLACK, point: -1 },
  ]);
  const game = gameFromSGF(text);
  assert.equal(game.phase, 'scoring');
  assert.equal(game.board.get(4, 4), WHITE);
});

test('SGF import rejects broken files and illegal moves', () => {
  assert.throws(() => parseSGF('no game here'), SyntaxError);
  assert.throws(() => parseSGF('(;SZ[9];B[ee'), SyntaxError);
  assert.throws(() => parseSGF('(;SZ[25])'), RangeError);
  assert.throws(() => gameFromSGF('(;SZ[9];B[ee];W[ee])'), /illegal move 2/);
});
