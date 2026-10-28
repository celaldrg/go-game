/**
 * Area scoring, ownership estimate and dead-stone proposal.
 * Point sets use plain board indices `y * size + x`.
 */
import { EMPTY, BLACK, WHITE } from './board.js';
import { playout, pointOwner } from './playout.js';

/**
 * Area score: alive stones plus empty points (and dead stones) surrounded only by one colour, plus komi.
 * @param {import('./board.js').Board} board
 * @param {Set<number>} dead indices of dead stones
 * @param {number} komi
 * @returns {{black: {stones: number, territory: number, total: number},
 *   white: {stones: number, territory: number, komi: number, total: number},
 *   winner: 'black'|'white'|'draw', margin: number, owner: Int8Array}}
 *   `owner` holds BLACK/WHITE for territory points (including dead stones), EMPTY otherwise.
 */
export function areaScore(board, dead, komi) {
  const n = board.size;
  const grid = new Int8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    grid[i] = dead.has(i) ? EMPTY : board.get(i % n, Math.floor(i / n));
  }
  const owner = new Int8Array(n * n);
  const seen = new Uint8Array(n * n);
  const counts = { [BLACK]: { stones: 0, territory: 0 }, [WHITE]: { stones: 0, territory: 0 } };
  for (let i = 0; i < n * n; i++) {
    if (grid[i] !== EMPTY) counts[grid[i]].stones++;
    else if (!seen[i]) fillRegion(grid, n, i, seen, owner, counts);
  }
  const black = { ...counts[BLACK], total: counts[BLACK].stones + counts[BLACK].territory };
  const whiteBase = counts[WHITE].stones + counts[WHITE].territory;
  const white = { ...counts[WHITE], komi, total: whiteBase + komi };
  const diff = black.total - white.total;
  const winner = diff > 0 ? 'black' : diff < 0 ? 'white' : 'draw';
  return { black, white, winner, margin: Math.abs(diff), owner };
}

/** Flood-fills one empty region and credits it to the colour that alone borders it. */
function fillRegion(grid, n, start, seen, owner, counts) {
  const region = [start];
  seen[start] = 1;
  let borders = 0;
  for (let k = 0; k < region.length; k++) {
    const i = region[k];
    const x = i % n;
    const y = (i - x) / n;
    const around = [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, y > 0 ? i - n : -1, y < n - 1 ? i + n : -1];
    for (const j of around) {
      if (j < 0) continue;
      if (grid[j] !== EMPTY) borders |= grid[j];
      else if (!seen[j]) {
        seen[j] = 1;
        region.push(j);
      }
    }
  }
  if (borders !== BLACK && borders !== WHITE) return;
  counts[borders].territory += region.length;
  for (const i of region) owner[i] = borders;
}

/**
 * Settled areas of a finished position: each empty region belongs to the colour with more stones
 * on its border. Returns, per padded point, the colour that may enter it only to capture.
 * @param {import('./board.js').Board} board
 * @returns {Int8Array}
 */
export function settledRegions(board) {
  const forbidden = new Int8Array(board.cells);
  const seen = new Uint8Array(board.cells);
  for (let k = 0; k < board.emptyCount; k++) {
    const start = board.emptyList[k];
    if (seen[start]) continue;
    const region = [start];
    const border = new Set();
    seen[start] = 1;
    for (let i = 0; i < region.length; i++) {
      for (const d of board.dirs) {
        const q = region[i] + d;
        const c = board.color[q];
        if (c === BLACK || c === WHITE) border.add(q);
        else if (c === EMPTY && !seen[q]) {
          seen[q] = 1;
          region.push(q);
        }
      }
    }
    let balance = 0;
    for (const q of border) balance += board.color[q] === BLACK ? 1 : -1;
    if (balance === 0) continue;
    for (const p of region) forbidden[p] = balance > 0 ? WHITE : BLACK;
  }
  return forbidden;
}

/**
 * Ownership estimate of a finished position from seeded random playouts. The playouts respect the
 * settled areas (see settledRegions): a colour enters the other colour's area only to capture.
 * @param {import('./board.js').Board} board
 * @param {{rng: {int: (n: number) => number}, playouts?: number}} opts
 * @returns {Float32Array} per index a value in [-1, 1]; +1 = always black, -1 = always white
 */
export function estimateOwnership(board, { rng, playouts = 200 }) {
  const n = board.size;
  const sum = new Float32Array(n * n);
  const forbidden = settledRegions(board);
  for (let k = 0; k < playouts; k++) {
    const b = board.clone();
    playout(b, k % 2 === 0 ? BLACK : WHITE, rng, { forbidden });
    for (let i = 0; i < n * n; i++) {
      const owner = pointOwner(b, board.index(i % n, Math.floor(i / n)));
      if (owner === BLACK) sum[i]++;
      else if (owner === WHITE) sum[i]--;
    }
  }
  for (let i = 0; i < n * n; i++) sum[i] /= playouts;
  return sum;
}

/**
 * Chains whose stones mostly end up owned by the opponent in the ownership estimate.
 * @param {import('./board.js').Board} board
 * @param {Float32Array} ownership from estimateOwnership
 * @param {number} [threshold=-0.2] a chain is dead when its mean own-colour ownership is below this
 * @returns {Set<number>} indices of dead stones
 */
export function deadFromOwnership(board, ownership, threshold = -0.2) {
  const n = board.size;
  const dead = new Set();
  const done = new Set();
  for (let i = 0; i < n * n; i++) {
    const p = board.index(i % n, Math.floor(i / n));
    const c = board.color[p];
    if (c === EMPTY || done.has(p)) continue;
    const stones = board.chainStones(p);
    const sign = c === BLACK ? 1 : -1;
    let total = 0;
    for (const s of stones) {
      done.add(s);
      const { x, y } = board.coords(s);
      total += sign * ownership[y * n + x];
    }
    if (total / stones.length < threshold) {
      for (const s of stones) {
        const { x, y } = board.coords(s);
        dead.add(y * n + x);
      }
    }
  }
  return dead;
}

/**
 * Proposes the dead stones of a finished position.
 * @param {import('./board.js').Board} board
 * @param {{rng: {int: (n: number) => number}, playouts?: number}} opts
 * @returns {Set<number>} indices of dead stones
 */
export function proposeDeadStones(board, opts) {
  return deadFromOwnership(board, estimateOwnership(board, opts));
}
