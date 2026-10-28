/**
 * Fast Go board used by the rules, the scorer and the computer player.
 *
 * Points are stored on a padded grid (one border row/column of EDGE cells) so neighbour
 * lookups need no bounds checks. Chains keep pseudo-liberty counts plus the sum and the sum of
 * squares of their liberty points, which makes "is this chain in atari?" an O(1) question.
 * A Zobrist hash of the stones is maintained incrementally for superko checks.
 */
import { createRng } from './rng.js';

/** Point states: empty, black stone, white stone, off-board border. */
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const EDGE = 3;

/**
 * Returns the other colour.
 * @param {number} color BLACK or WHITE
 * @returns {number}
 */
export function opponent(color) {
  return 3 - color;
}

const zobristTables = new Map();
let markStamp = 0;

/** Builds (once per board size) two 32-bit random words per colour and point. */
function zobristTable(cells) {
  if (!zobristTables.has(cells)) {
    const rng = createRng(0x60b0a2d + cells);
    const table = new Uint32Array(cells * 4);
    for (let i = 0; i < table.length; i++) table[i] = Math.floor(rng.next() * 4294967296);
    zobristTables.set(cells, table);
  }
  return zobristTables.get(cells);
}

/** Mutable Go position with chains, liberties, simple ko, capture counts and a Zobrist hash. */
export class Board {
  /**
   * @param {number} size board size (e.g. 9, 13 or 19)
   */
  constructor(size) {
    this.size = size;
    this.stride = size + 2;
    const cells = this.stride * this.stride;
    this.cells = cells;
    this.color = new Int8Array(cells).fill(EDGE);
    this.head = new Int16Array(cells);
    this.next = new Int16Array(cells);
    this.chainSize = new Int16Array(cells);
    this.plib = new Int16Array(cells);
    this.lsum = new Int32Array(cells);
    this.lsq = new Float64Array(cells);
    this.emptyList = new Int16Array(size * size);
    this.emptyPos = new Int16Array(cells);
    this.emptyCount = 0;
    this.ko = -1;
    this.captures = [0, 0, 0];
    this.h1 = 0;
    this.h2 = 0;
    this.zobrist = zobristTable(cells);
    this.dirs = [-this.stride, 1, this.stride, -1];
    this.diagonals = [-this.stride - 1, -this.stride + 1, this.stride - 1, this.stride + 1];
    this.mark = new Int32Array(cells);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = this.index(x, y);
        this.color[p] = EMPTY;
        this.addEmpty(p);
      }
    }
  }

  /**
   * Padded index of a board coordinate (x from the left, y from the top, both 0-based).
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  index(x, y) {
    return (y + 1) * this.stride + x + 1;
  }

  /**
   * Board coordinate of a padded index.
   * @param {number} p
   * @returns {{x: number, y: number}}
   */
  coords(p) {
    return { x: (p % this.stride) - 1, y: Math.floor(p / this.stride) - 1 };
  }

  /**
   * Colour at a board coordinate.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  get(x, y) {
    return this.color[this.index(x, y)];
  }

  /** @returns {Board} independent copy */
  clone() {
    const b = Object.create(Board.prototype);
    Object.assign(b, this);
    for (const key of ['color', 'head', 'next', 'chainSize', 'plib', 'lsum', 'lsq', 'emptyList', 'emptyPos']) {
      b[key] = this[key].slice();
    }
    b.captures = this.captures.slice();
    return b;
  }

  /**
   * Hash of the stone configuration (53 bits, safe as a Map/Set key).
   * @returns {number}
   */
  get key() {
    return (this.h1 & 0x1fffff) * 4294967296 + (this.h2 >>> 0);
  }

  addEmpty(p) {
    this.emptyPos[p] = this.emptyCount;
    this.emptyList[this.emptyCount++] = p;
  }

  removeEmpty(p) {
    const i = this.emptyPos[p];
    const last = this.emptyList[--this.emptyCount];
    this.emptyList[i] = last;
    this.emptyPos[last] = i;
  }

  toggleHash(p, color) {
    const z = (p * 2 + color - 1) * 2;
    this.h1 ^= this.zobrist[z];
    this.h2 ^= this.zobrist[z + 1];
  }

  addLib(r, p) {
    this.plib[r]++;
    this.lsum[r] += p;
    this.lsq[r] += p * p;
  }

  removeLib(r, p) {
    this.plib[r]--;
    this.lsum[r] -= p;
    this.lsq[r] -= p * p;
  }

  /**
   * True when the chain with representative `r` has exactly one liberty.
   * @param {number} r chain representative (head)
   * @returns {boolean}
   */
  inAtari(r) {
    const n = this.plib[r];
    return n > 0 && this.lsum[r] * this.lsum[r] === n * this.lsq[r];
  }

  /**
   * The single liberty of a chain in atari.
   * @param {number} r chain representative
   * @returns {number}
   */
  atariLiberty(r) {
    return this.lsum[r] / this.plib[r];
  }

  /**
   * Distinct liberties of the chain containing stone `p` (stops early after `max`).
   * @param {number} p a stone of the chain
   * @param {number} [max=Infinity]
   * @returns {number[]}
   */
  liberties(p, max = Infinity) {
    const libs = [];
    const stamp = ++markStamp;
    let s = p;
    do {
      for (let k = 0; k < 4; k++) {
        const d = this.dirs[k];
        const q = s + d;
        if (this.color[q] === EMPTY && this.mark[q] !== stamp) {
          this.mark[q] = stamp;
          libs.push(q);
          if (libs.length >= max) return libs;
        }
      }
      s = this.next[s];
    } while (s !== p);
    return libs;
  }

  /**
   * Stones of the chain containing `p`.
   * @param {number} p
   * @returns {number[]}
   */
  chainStones(p) {
    const stones = [];
    let s = p;
    do {
      stones.push(s);
      s = this.next[s];
    } while (s !== p);
    return stones;
  }

  /**
   * Basic legality: empty, not the simple-ko point and not suicide. (Superko is checked by the game.)
   * @param {number} p padded index
   * @param {number} c colour to play
   * @returns {boolean}
   */
  isLegal(p, c) {
    if (this.color[p] !== EMPTY || p === this.ko) return false;
    for (let k = 0; k < 4; k++) {
      const d = this.dirs[k];
      const q = p + d;
      const cq = this.color[q];
      if (cq === EMPTY) return true;
      if (cq === EDGE) continue;
      const atari = this.inAtari(this.head[q]);
      if (cq === c ? !atari : atari) return true;
    }
    return false;
  }

  /**
   * True when `p` is a single-point eye of colour `c` (filling it would be self-harm).
   * @param {number} p
   * @param {number} c
   * @returns {boolean}
   */
  isEye(p, c) {
    for (let k = 0; k < 4; k++) {
      const d = this.dirs[k];
      const cq = this.color[p + d];
      if (cq !== c && cq !== EDGE) return false;
    }
    let enemies = 0;
    let atEdge = false;
    for (let k = 0; k < 4; k++) {
      const d = this.diagonals[k];
      const cq = this.color[p + d];
      if (cq === EDGE) atEdge = true;
      else if (cq === 3 - c) enemies++;
    }
    return atEdge ? enemies === 0 : enemies <= 1;
  }

  /**
   * Plays a stone (the caller has checked legality). Removes captured chains.
   * @param {number} p padded index
   * @param {number} c colour
   * @returns {number} number of captured stones
   */
  play(p, c) {
    const o = 3 - c;
    this.ko = -1;
    this.color[p] = c;
    this.toggleHash(p, c);
    this.removeEmpty(p);
    this.head[p] = p;
    this.next[p] = p;
    this.chainSize[p] = 1;
    this.plib[p] = 0;
    this.lsum[p] = 0;
    this.lsq[p] = 0;
    for (let k = 0; k < 4; k++) {
      const d = this.dirs[k];
      const q = p + d;
      const cq = this.color[q];
      if (cq === EMPTY) this.addLib(p, q);
      else if (cq !== EDGE) this.removeLib(this.head[q], p);
    }
    for (let k = 0; k < 4; k++) {
      const d = this.dirs[k];
      const q = p + d;
      if (this.color[q] === c && this.head[q] !== this.head[p]) this.merge(this.head[p], this.head[q]);
    }
    let captured = 0;
    let capturedAt = -1;
    for (let k = 0; k < 4; k++) {
      const d = this.dirs[k];
      const q = p + d;
      if (this.color[q] === o && this.plib[this.head[q]] === 0) {
        captured += this.removeChain(this.head[q]);
        capturedAt = q;
      }
    }
    this.captures[c] += captured;
    const r = this.head[p];
    if (captured === 1 && this.chainSize[r] === 1 && this.plib[r] === 1) this.ko = capturedAt;
    return captured;
  }

  /**
   * Total size of the opponent chains a move at `p` would capture.
   * @param {number} p
   * @param {number} c
   * @returns {number}
   */
  captureSize(p, c) {
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const q = p + this.dirs[k];
      if (this.color[q] === 3 - c && this.inAtari(this.head[q])) total += this.chainSize[this.head[q]];
    }
    return total;
  }

  /**
   * True when a move at `p` captures nothing and leaves its own chain with a single liberty.
   * @param {number} p
   * @param {number} c
   * @returns {boolean}
   */
  isSelfAtari(p, c) {
    const libs = [];
    for (let k = 0; k < 4; k++) {
      const q = p + this.dirs[k];
      if (this.color[q] === EMPTY && !libs.includes(q)) libs.push(q);
    }
    if (libs.length >= 2) return false;
    for (let k = 0; k < 4; k++) {
      const q = p + this.dirs[k];
      if (this.color[q] !== c) continue;
      for (const lib of this.liberties(q, 3)) {
        if (lib !== p && !libs.includes(lib)) libs.push(lib);
        if (libs.length >= 2) return false;
      }
    }
    return this.captureSize(p, c) === 0;
  }

  /** A pass: only clears the simple-ko point. */
  pass() {
    this.ko = -1;
  }

  merge(a, b) {
    if (this.chainSize[a] < this.chainSize[b]) [a, b] = [b, a];
    let s = b;
    do {
      this.head[s] = a;
      s = this.next[s];
    } while (s !== b);
    const tmp = this.next[a];
    this.next[a] = this.next[b];
    this.next[b] = tmp;
    this.chainSize[a] += this.chainSize[b];
    this.plib[a] += this.plib[b];
    this.lsum[a] += this.lsum[b];
    this.lsq[a] += this.lsq[b];
  }

  removeChain(r) {
    const stones = this.chainStones(r);
    const c = this.color[r];
    for (const s of stones) {
      this.color[s] = EMPTY;
      this.toggleHash(s, c);
      this.addEmpty(s);
    }
    for (const s of stones) {
      for (let k = 0; k < 4; k++) {
        const d = this.dirs[k];
        const q = s + d;
        const cq = this.color[q];
        if (cq === BLACK || cq === WHITE) this.addLib(this.head[q], s);
      }
    }
    return stones.length;
  }
}
