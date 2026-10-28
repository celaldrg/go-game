/**
 * Go game state and rules: moves, captures, suicide, positional superko, passing,
 * resignation, undo, the dead-stone phase and area scoring.
 *
 * Coordinates are 0-based: x from the left, y from the top. Point indices are `y * size + x`.
 */
import { Board, EMPTY, BLACK, WHITE, opponent } from './board.js';
import { createRng } from './rng.js';
import { areaScore, proposeDeadStones } from './score.js';

/** Board sizes offered by the app. */
export const BOARD_SIZES = [9, 13, 19];
/** Komi values offered by the app. */
export const KOMI_OPTIONS = [0.5, 5.5, 6.5, 7.5];
/** Column letters of the coordinates (the letter I is skipped). */
export const COLUMN_LETTERS = 'ABCDEFGHJKLMNOPQRST';

/**
 * Default komi: 6.5 for an even game, 0.5 with handicap.
 * @param {number} handicap
 * @returns {number}
 */
export function defaultKomi(handicap) {
  return handicap >= 2 ? 0.5 : 6.5;
}

/**
 * Largest fixed handicap for a board size (9 on 13x13 and larger, 5 on 9x9).
 * @param {number} size
 * @returns {number}
 */
export function maxHandicap(size) {
  return size >= 13 ? 9 : 5;
}

/**
 * Fixed handicap stones on the star points.
 * @param {number} size
 * @param {number} count 0 or 2..maxHandicap(size)
 * @returns {{x: number, y: number}[]}
 */
export function handicapPoints(size, count) {
  if (count < 2) return [];
  if (count > maxHandicap(size)) throw new RangeError(`Handicap ${count} is not available on ${size}x${size}`);
  const lo = size >= 13 ? 3 : 2;
  const hi = size - 1 - lo;
  const mid = (size - 1) / 2;
  const corners = [
    [hi, lo],
    [lo, hi],
    [hi, hi],
    [lo, lo],
  ];
  const sides = [
    [lo, mid],
    [hi, mid],
    [mid, lo],
    [mid, hi],
  ];
  let list = corners.slice(0, Math.min(count, 4));
  if (count >= 6) list = list.concat(sides.slice(0, count >= 8 ? 4 : 2));
  if (count % 2 === 1 && count >= 5) list.push([mid, mid]);
  return list.map(([x, y]) => ({ x, y }));
}

/**
 * Human readable point name such as "D4" (letters skip I, rows counted from the bottom).
 * @param {number} size
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
export function pointLabel(size, x, y) {
  return COLUMN_LETTERS[x] + String(size - y);
}

/**
 * Creates a new game.
 * @param {object} [opts]
 * @param {number} [opts.size=9]
 * @param {number} [opts.handicap=0] fixed handicap stones (white moves first when >= 2)
 * @param {number} [opts.komi] defaults to defaultKomi(handicap)
 * @param {{black: number[], white: number[]}} [opts.setup] explicit setup stones (point indices), replaces the handicap stones
 * @param {number} [opts.toMove] colour to move first (BLACK/WHITE)
 * @param {number} [opts.seed=1] seed for the dead-stone estimate
 * @param {{black: string, white: string}} [opts.players] player names
 * @returns {object} game state, driven by the functions of this module
 */
export function createGame(opts = {}) {
  const size = opts.size ?? 9;
  const handicap = opts.handicap ?? 0;
  const setup = opts.setup ?? {
    black: handicapPoints(size, handicap).map(({ x, y }) => y * size + x),
    white: [],
  };
  const game = {
    size,
    handicap,
    komi: opts.komi ?? defaultKomi(handicap),
    seed: opts.seed ?? 1,
    players: { black: '', white: '', ...opts.players },
    setup: { black: [...setup.black], white: [...(setup.white ?? [])] },
    startColor: opts.toMove ?? (handicap >= 2 ? WHITE : BLACK),
    moves: [],
  };
  rebuild(game);
  return game;
}

/** Recreates the board and derived state from the setup and the move list. */
function rebuild(game) {
  const board = new Board(game.size);
  for (const [color, list] of [
    [BLACK, game.setup.black],
    [WHITE, game.setup.white],
  ]) {
    for (const i of list) board.play(board.index(i % game.size, Math.floor(i / game.size)), color);
  }
  board.captures = [0, 0, 0];
  board.ko = -1;
  Object.assign(game, {
    board,
    toMove: game.startColor,
    positions: new Set([board.key]),
    passes: 0,
    phase: 'play',
    result: null,
    dead: new Set(),
    lastCaptured: [],
  });
  const moves = game.moves;
  game.moves = [];
  for (const m of moves) {
    game.toMove = m.color;
    if (m.point < 0) passMove(game);
    else playMove(game, m.point % game.size, Math.floor(m.point / game.size));
  }
}

/**
 * Checks whether the side to move may play at (x, y).
 * @param {object} game
 * @param {number} x
 * @param {number} y
 * @returns {{ok: true} | {ok: false, reason: 'over'|'outside'|'occupied'|'ko'|'superko'|'suicide'}}
 */
export function checkMove(game, x, y) {
  if (game.phase !== 'play') return { ok: false, reason: 'over' };
  if (!(x >= 0 && y >= 0 && x < game.size && y < game.size)) return { ok: false, reason: 'outside' };
  const b = game.board;
  const p = b.index(x, y);
  if (b.color[p] !== EMPTY) return { ok: false, reason: 'occupied' };
  if (p === b.ko) return { ok: false, reason: 'ko' };
  if (!b.isLegal(p, game.toMove)) return { ok: false, reason: 'suicide' };
  const next = b.clone();
  next.play(p, game.toMove);
  if (game.positions.has(next.key)) return { ok: false, reason: 'superko' };
  return { ok: true };
}

/**
 * Plays a stone for the side to move.
 * @param {object} game
 * @param {number} x
 * @param {number} y
 * @returns {{ok: boolean, reason?: string, captured: {x: number, y: number}[]}}
 */
export function playMove(game, x, y) {
  const check = checkMove(game, x, y);
  if (!check.ok) return { ...check, captured: [] };
  const b = game.board;
  const p = b.index(x, y);
  const c = game.toMove;
  const captured = [];
  for (const d of b.dirs) {
    const q = p + d;
    if (b.color[q] === opponent(c) && b.inAtari(b.head[q]) && !captured.includes(q)) {
      for (const s of b.chainStones(q)) if (!captured.includes(s)) captured.push(s);
    }
  }
  b.play(p, c);
  game.positions.add(b.key);
  game.moves.push({ color: c, point: y * game.size + x });
  game.toMove = opponent(c);
  game.passes = 0;
  game.lastCaptured = captured.map((s) => b.coords(s));
  return { ok: true, captured: game.lastCaptured };
}

/**
 * Passes. Two passes in a row start the dead-stone phase with a proposal of dead groups.
 * @param {object} game
 * @returns {boolean} false when the game is not in the play phase
 */
export function passMove(game) {
  if (game.phase !== 'play') return false;
  game.board.pass();
  game.moves.push({ color: game.toMove, point: -1 });
  game.toMove = opponent(game.toMove);
  game.passes++;
  game.lastCaptured = [];
  if (game.passes >= 2) enterScoring(game);
  return true;
}

/** Starts the dead-stone phase with the estimated dead groups. */
function enterScoring(game) {
  game.phase = 'scoring';
  const playouts = game.size <= 9 ? 300 : game.size <= 13 ? 200 : 120;
  const rng = createRng(game.seed * 7919 + game.moves.length);
  game.dead = proposeDeadStones(game.board, { rng, playouts });
}

/**
 * Resigns the game.
 * @param {object} game
 * @param {number} [color=game.toMove] the resigning colour
 * @returns {boolean}
 */
export function resign(game, color = game.toMove) {
  if (game.phase === 'over') return false;
  game.phase = 'over';
  game.result = { winner: color === BLACK ? 'white' : 'black', reason: 'resign', margin: 0 };
  return true;
}

/**
 * Takes back moves (passes count as moves). Reopens a finished game.
 * @param {object} game
 * @param {number} [count=1]
 * @returns {boolean} false when there is nothing to undo
 */
export function undo(game, count = 1) {
  if (game.moves.length === 0) return false;
  game.moves = game.moves.slice(0, Math.max(0, game.moves.length - count));
  rebuild(game);
  return true;
}

/**
 * Toggles the dead/alive mark of the chain at (x, y) during the dead-stone phase.
 * @param {object} game
 * @param {number} x
 * @param {number} y
 * @returns {boolean} true when something changed
 */
export function toggleDead(game, x, y) {
  if (game.phase !== 'scoring') return false;
  const b = game.board;
  const p = b.index(x, y);
  if (b.color[p] !== BLACK && b.color[p] !== WHITE) return false;
  const indices = b.chainStones(p).map((s) => {
    const c = b.coords(s);
    return c.y * game.size + c.x;
  });
  const wasDead = game.dead.has(indices[0]);
  for (const i of indices) {
    if (wasDead) game.dead.delete(i);
    else game.dead.add(i);
  }
  return true;
}

/**
 * Leaves the dead-stone phase and continues playing.
 * @param {object} game
 * @returns {boolean}
 */
export function resumePlay(game) {
  if (game.phase !== 'scoring') return false;
  game.phase = 'play';
  game.passes = 0;
  game.dead = new Set();
  return true;
}

/**
 * Area score of the current position with the current dead-stone marks.
 * @param {object} game
 * @returns {ReturnType<typeof areaScore>}
 */
export function scoreGame(game) {
  return areaScore(game.board, game.phase === 'play' ? new Set() : game.dead, game.komi);
}

/**
 * Accepts the dead-stone marks and ends the game with the area score.
 * @param {object} game
 * @returns {boolean}
 */
export function finishScoring(game) {
  if (game.phase !== 'scoring') return false;
  const score = scoreGame(game);
  game.phase = 'over';
  game.result = { winner: score.winner, reason: 'score', margin: score.margin, score };
  return true;
}

/**
 * Result in SGF notation, e.g. "B+3.5", "W+R" or "0" for a draw; "" while the game runs.
 * @param {object} game
 * @returns {string}
 */
export function resultString(game) {
  const r = game.result;
  if (!r) return '';
  if (r.winner === 'draw') return '0';
  return `${r.winner === 'black' ? 'B' : 'W'}+${r.reason === 'resign' ? 'R' : r.margin}`;
}

/**
 * Snapshot of everything a UI needs to draw the game.
 * @param {object} game
 * @returns {object}
 */
export function getState(game) {
  const { size, board } = game;
  const stones = new Int8Array(size * size);
  for (let i = 0; i < size * size; i++) stones[i] = board.get(i % size, Math.floor(i / size));
  const moveNumbers = new Int16Array(size * size);
  game.moves.forEach((m, k) => {
    if (m.point >= 0) moveNumbers[m.point] = k + 1;
  });
  const last = game.moves[game.moves.length - 1];
  const scoring = game.phase === 'scoring' || (game.phase === 'over' && game.result?.reason === 'score');
  const score = scoring ? scoreGame(game) : null;
  return {
    size,
    stones,
    moveNumbers,
    toMove: game.toMove,
    phase: game.phase,
    komi: game.komi,
    handicap: game.handicap,
    moveCount: game.moves.length,
    passes: game.passes,
    lastMove: last
      ? { color: last.color, pass: last.point < 0, x: last.point % size, y: Math.floor(last.point / size) }
      : null,
    lastCaptured: game.lastCaptured,
    captures: { black: board.captures[BLACK], white: board.captures[WHITE] },
    dead: [...game.dead],
    territory: score ? score.owner : null,
    score,
    result: game.result,
  };
}

/**
 * Plain JSON form of a game (for a Web Worker or storage).
 * @param {object} game
 * @returns {object}
 */
export function serializeGame(game) {
  const { size, komi, handicap, seed, players, setup, startColor, moves } = game;
  return { size, komi, handicap, seed, players, setup, toMove: startColor, moves };
}

/**
 * Rebuilds a game from serializeGame output.
 * @param {object} data
 * @returns {object} game
 */
export function restoreGame(data) {
  const game = createGame(data);
  game.moves = data.moves.map((m) => ({ color: m.color, point: m.point }));
  rebuild(game);
  return game;
}
