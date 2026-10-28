/**
 * Light random playouts shared by the computer player and the dead-stone estimate.
 * Playouts never fill their own single-point eyes and always capture a chain that the
 * previous move left in atari.
 */
import { EMPTY, BLACK, WHITE, EDGE } from './board.js';

/**
 * Picks a random legal move for `c` that does not fill its own eye, or -1.
 * @param {import('./board.js').Board} b
 * @param {number} c
 * @param {{int: (n: number) => number}} rng
 * @param {Int8Array} [forbidden] per padded point the colour that may only play there to capture
 * @returns {number}
 */
export function randomMove(b, c, rng, forbidden) {
  const count = b.emptyCount;
  if (count === 0) return -1;
  const start = rng.int(count);
  for (let k = start, end = start + count; k < end; k++) {
    const p = b.emptyList[k < count ? k : k - count];
    if (!b.isLegal(p, c) || b.isEye(p, c)) continue;
    if (!forbidden || forbidden[p] !== c || b.captureSize(p, c) > 0) return p;
  }
  return -1;
}

/** Move that captures the chain of the previous move when it is in atari, or -1. */
function captureLastMove(b, last, c) {
  if (last < 0 || b.color[last] !== 3 - c) return -1;
  const r = b.head[last];
  if (!b.inAtari(r)) return -1;
  const lib = b.atariLiberty(r);
  return b.isLegal(lib, c) ? lib : -1;
}

/**
 * Plays random moves until both sides pass (or a move cap) - mutates the board.
 * @param {import('./board.js').Board} b
 * @param {number} toMove colour to move
 * @param {{int: (n: number) => number}} rng
 * @param {{passes?: number, lastMove?: number, forbidden?: Int8Array}} [opts] consecutive passes and last move
 *   before the playout, and points where a colour may only play to capture (see randomMove)
 */
export function playout(b, toMove, rng, opts = {}) {
  let c = toMove;
  let passes = opts.passes || 0;
  let last = opts.lastMove ?? -1;
  const maxMoves = b.size * b.size * 3;
  for (let m = 0; m < maxMoves && passes < 2; m++) {
    let p = captureLastMove(b, last, c);
    if (p < 0) p = randomMove(b, c, rng, opts.forbidden);
    if (p < 0) {
      b.pass();
      passes++;
    } else {
      b.play(p, c);
      passes = 0;
    }
    last = p;
    c = 3 - c;
  }
}

/**
 * Owner of a point at the end of a playout: the stone, or the only colour adjacent to an empty point.
 * @param {import('./board.js').Board} b
 * @param {number} p padded index
 * @returns {number} BLACK, WHITE or EMPTY (neutral)
 */
export function pointOwner(b, p) {
  const c = b.color[p];
  if (c !== EMPTY) return c;
  let seen = 0;
  for (let k = 0; k < 4; k++) {
    const cq = b.color[p + b.dirs[k]];
    if (cq === BLACK || cq === WHITE) seen |= cq;
  }
  return seen === BLACK || seen === WHITE ? seen : EMPTY;
}

/**
 * Black area minus white area minus komi of a finished playout board.
 * @param {import('./board.js').Board} b
 * @param {number} komi
 * @returns {number}
 */
export function playoutScore(b, komi) {
  let score = -komi;
  for (let p = b.stride + 1; p < b.cells - b.stride; p++) {
    if (b.color[p] === EDGE) continue;
    const owner = pointOwner(b, p);
    if (owner === BLACK) score++;
    else if (owner === WHITE) score--;
  }
  return score;
}
