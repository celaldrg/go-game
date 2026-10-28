import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE } from '../src/board.js';
import {
  createGame,
  playMove,
  passMove,
  checkMove,
  undo,
  resign,
  getState,
  handicapPoints,
  maxHandicap,
  pointLabel,
  defaultKomi,
  serializeGame,
  restoreGame,
  resultString,
} from '../src/game.js';
import { createDemoGame } from '../src/demo.js';
import { fromDiagram, toDiagram } from './helpers.js';

const EMPTY9 = Array(9).fill('.........');

function withRows(changes) {
  const rows = EMPTY9.slice();
  for (const [y, row] of Object.entries(changes)) rows[y] = row;
  return rows;
}

test('a single stone in the middle is captured', () => {
  const game = fromDiagram(withRows({ 3: '....X....', 4: '...XO....', 5: '....X....' }));
  const r = playMove(game, 5, 4);
  assert.equal(r.ok, true);
  assert.deepEqual(r.captured, [{ x: 4, y: 4 }]);
  assert.equal(game.board.get(4, 4), 0);
  assert.equal(getState(game).captures.black, 1);
});

test('a single stone on the edge and one in the corner are captured', () => {
  const edge = fromDiagram(withRows({ 3: 'X........', 4: 'O........', 5: '.........' }));
  playMove(edge, 1, 4);
  passMove(edge);
  assert.equal(edge.board.get(0, 4), WHITE);
  assert.equal(playMove(edge, 0, 5).captured.length, 1);
  assert.equal(edge.board.get(0, 4), 0);

  const corner = fromDiagram(withRows({ 0: 'OX.......' }));
  assert.deepEqual(playMove(corner, 0, 1).captured, [{ x: 0, y: 0 }]);
});

test('a group is captured in the middle, on the edge and in the corner', () => {
  const game = fromDiagram(
    withRows({
      2: '...XX....',
      3: '..XOOX...',
      4: '..XOOX...',
      5: '...X.....',
    }),
  );
  assert.equal(playMove(game, 4, 5).captured.length, 4);
  assert.deepEqual(toDiagram(game).slice(2, 6), ['...XX....', '..X..X...', '..X..X...', '...XX....']);

  const edge = fromDiagram(withRows({ 6: '.XXX.....', 7: 'XOOOX....', 8: 'XOOO.X...' }));
  assert.equal(playMove(edge, 4, 8).captured.length, 6);

  const corner = fromDiagram(withRows({ 0: 'OOX......', 1: 'O.X......', 2: 'XX.......' }));
  assert.equal(playMove(corner, 1, 1).captured.length, 3);
  assert.equal(corner.board.get(0, 0), 0);
});

test('one move captures two groups at once', () => {
  const game = fromDiagram(
    withRows({
      3: '...X.X...',
      4: '..XO.OX..',
      5: '...X.X...',
    }),
  );
  const r = playMove(game, 4, 4);
  assert.equal(r.ok, true);
  assert.equal(r.captured.length, 2);
  assert.equal(game.board.get(3, 4), 0);
  assert.equal(game.board.get(5, 4), 0);
});

test('suicide is rejected, a move without liberties that captures is legal', () => {
  const suicide = fromDiagram(withRows({ 0: '.O.......', 1: 'O........' }));
  assert.deepEqual(checkMove(suicide, 0, 0), { ok: false, reason: 'suicide' });
  assert.equal(playMove(suicide, 0, 0).ok, false);
  assert.equal(suicide.toMove, BLACK, 'a rejected move does not change the turn');

  const groupSuicide = fromDiagram(withRows({ 0: 'X.O......', 1: 'XO.......', 2: 'O........' }));
  assert.equal(checkMove(groupSuicide, 1, 0).reason, 'suicide');

  const capture = fromDiagram(withRows({ 0: '.OX......', 1: 'O.X......', 2: 'XX.......' }));
  playMove(capture, 1, 1);
  passMove(capture);
  const r = playMove(capture, 0, 0);
  assert.equal(r.ok, true, 'the stone at the corner has no liberty of its own but captures');
  assert.equal(r.captured.length, 2);
});

const KO_ROWS = withRows({
  0: '.XO......',
  1: 'XO.O.....',
  2: '.XO......',
  5: '......OX.',
  6: '.....OX.X',
  7: '......OX.',
});

test('the simple ko recapture is rejected', () => {
  const game = fromDiagram(KO_ROWS);
  assert.equal(playMove(game, 2, 1).captured.length, 1);
  assert.deepEqual(checkMove(game, 1, 1), { ok: false, reason: 'ko' });
  playMove(game, 7, 6);
  playMove(game, 4, 4);
  assert.equal(checkMove(game, 1, 1).ok, true, 'after a ko threat elsewhere the ko may be retaken');
});

test('positional superko rejects a repeated whole-board position that is not a simple ko', () => {
  const game = fromDiagram(KO_ROWS);
  const start = toDiagram(game);
  assert.ok(playMove(game, 2, 1).ok, 'black takes the first ko');
  assert.ok(playMove(game, 7, 6).ok, 'white takes the second ko');
  assert.ok(passMove(game), 'black passes');
  assert.ok(playMove(game, 1, 1).ok, 'white retakes the first ko');
  const b = game.board;
  assert.notEqual(b.ko, b.index(6, 6), 'the point is not the simple-ko point');
  assert.equal(b.isLegal(b.index(6, 6), BLACK), true, 'the basic rules alone would allow it');
  assert.deepEqual(checkMove(game, 6, 6), { ok: false, reason: 'superko' });
  const r = playMove(game, 6, 6);
  assert.equal(r.ok, false);
  const next = game.board.clone();
  next.play(next.index(6, 6), BLACK);
  game.board = next;
  assert.deepEqual(toDiagram(game), start, 'the move would recreate the starting position');
});

test('two passes end the play phase, undo reopens it', () => {
  const game = createGame({ size: 9 });
  playMove(game, 4, 4);
  passMove(game);
  assert.equal(game.phase, 'play');
  passMove(game);
  assert.equal(game.phase, 'scoring');
  assert.equal(playMove(game, 3, 3).reason, 'over');
  assert.ok(undo(game));
  assert.equal(game.phase, 'play');
  assert.equal(game.toMove, BLACK);
  assert.equal(game.passes, 1);
});

test('undo restores the board, the turn and the captures', () => {
  const game = fromDiagram(withRows({ 3: '....X....', 4: '...XO....', 5: '....X....' }));
  const before = toDiagram(game);
  playMove(game, 5, 4);
  assert.equal(getState(game).captures.black, 1);
  assert.ok(undo(game));
  assert.deepEqual(toDiagram(game), before);
  assert.equal(game.toMove, BLACK);
  assert.equal(getState(game).captures.black, 0);
  assert.equal(undo(game), false, 'nothing left to undo');
});

test('resignation ends the game', () => {
  const game = createGame({ size: 9 });
  playMove(game, 2, 2);
  assert.ok(resign(game));
  assert.equal(game.phase, 'over');
  assert.deepEqual(game.result, { winner: 'black', reason: 'resign', margin: 0 });
  assert.equal(resultString(game), 'B+R');
  assert.equal(passMove(game), false);
});

test('handicap stones sit on the star points and white moves first', () => {
  const pts = (size, n) =>
    handicapPoints(size, n)
      .map(({ x, y }) => pointLabel(size, x, y))
      .sort();
  assert.deepEqual(pts(19, 2), ['D4', 'Q16']);
  assert.deepEqual(pts(19, 4), ['D16', 'D4', 'Q16', 'Q4']);
  assert.deepEqual(pts(19, 5), ['D16', 'D4', 'K10', 'Q16', 'Q4']);
  assert.deepEqual(pts(19, 6), ['D10', 'D16', 'D4', 'Q10', 'Q16', 'Q4']);
  assert.deepEqual(pts(19, 9), ['D10', 'D16', 'D4', 'K10', 'K16', 'K4', 'Q10', 'Q16', 'Q4']);
  assert.deepEqual(pts(13, 3), ['D4', 'K10', 'K4']);
  assert.deepEqual(pts(9, 5), ['C3', 'C7', 'E5', 'G3', 'G7']);
  assert.equal(maxHandicap(9), 5);
  assert.throws(() => handicapPoints(9, 6), RangeError);
  for (let n = 2; n <= 9; n++) assert.equal(handicapPoints(19, n).length, n);

  const game = createGame({ size: 13, handicap: 4 });
  assert.equal(game.toMove, WHITE);
  assert.equal(game.komi, 0.5);
  assert.equal(defaultKomi(0), 6.5);
  assert.equal(getState(game).stones.filter((c) => c === BLACK).length, 4);
});

test('point labels skip the letter I and count rows from the bottom', () => {
  assert.equal(pointLabel(19, 0, 18), 'A1');
  assert.equal(pointLabel(19, 8, 0), 'J19');
  assert.equal(pointLabel(9, 8, 0), 'J9');
});

test('a game survives serialisation (Web Worker transport)', () => {
  const game = createDemoGame();
  const copy = restoreGame(JSON.parse(JSON.stringify(serializeGame(game))));
  assert.deepEqual(toDiagram(copy), toDiagram(game));
  assert.equal(copy.toMove, game.toMove);
  assert.deepEqual(getState(copy).captures, getState(game).captures);
});

test('the demo game is a 9x9 middle game with a fresh capture and a marked last move', () => {
  const state = getState(createDemoGame());
  assert.equal(state.size, 9);
  assert.ok(state.moveCount >= 38 && state.moveCount <= 46);
  assert.ok(state.lastCaptured.length > 0);
  assert.equal(state.lastMove.pass, false);
  assert.equal(state.phase, 'play');
});
