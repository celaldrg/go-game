/**
 * SGF (Smart Game Format) export and import of the main line.
 * Supported properties: SZ, KM, HA, AB, AW, PB, PW, RE, B, W.
 */
import { BLACK, WHITE } from './board.js';
import { createGame, passMove, playMove, resultString } from './game.js';

const A = 'a'.charCodeAt(0);

function escapeValue(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/]/g, '\\]');
}

function pointToSgf(size, index) {
  const x = index % size;
  const y = Math.floor(index / size);
  return String.fromCharCode(A + x, A + y);
}

/**
 * Writes the game (setup stones and main line) as an SGF string.
 * @param {object} game a game from createGame
 * @returns {string}
 */
export function toSGF(game) {
  const { size } = game;
  const props = [`GM[1]FF[4]CA[UTF-8]AP[go-game:1.0.0]SZ[${size}]KM[${game.komi}]`];
  if (game.handicap >= 2) props.push(`HA[${game.handicap}]`);
  if (game.players.black) props.push(`PB[${escapeValue(game.players.black)}]`);
  if (game.players.white) props.push(`PW[${escapeValue(game.players.white)}]`);
  const result = resultString(game);
  if (result) props.push(`RE[${result}]`);
  for (const [tag, list] of [
    ['AB', game.setup.black],
    ['AW', game.setup.white],
  ]) {
    if (list.length) props.push(tag + list.map((i) => `[${pointToSgf(size, i)}]`).join(''));
  }
  const moves = game.moves.map((m) => {
    const value = m.point < 0 ? '' : pointToSgf(size, m.point);
    return `;${m.color === BLACK ? 'B' : 'W'}[${value}]`;
  });
  return `(;${props.join('')}\n${moves.join('')})\n`;
}

/** Recursive-descent reader that returns the nodes of the main line. */
function readMainLine(text) {
  let pos = 0;
  const skipSpace = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  };
  const expect = (ch) => {
    skipSpace();
    if (text[pos] !== ch) throw new SyntaxError(`SGF: expected "${ch}" at ${pos}`);
    pos++;
  };
  const readValue = () => {
    let value = '';
    pos++;
    while (pos < text.length && text[pos] !== ']') {
      if (text[pos] === '\\') pos++;
      value += text[pos++] ?? '';
    }
    if (text[pos] !== ']') throw new SyntaxError('SGF: unterminated value');
    pos++;
    return value;
  };
  const readNode = () => {
    const node = {};
    for (;;) {
      skipSpace();
      const match = /^[A-Za-z]+/.exec(text.slice(pos, pos + 16));
      if (!match) return node;
      pos += match[0].length;
      const ident = match[0].replace(/[a-z]/g, '');
      const values = [];
      skipSpace();
      while (text[pos] === '[') {
        values.push(readValue());
        skipSpace();
      }
      if (!values.length) throw new SyntaxError(`SGF: property ${ident} has no value`);
      node[ident] = (node[ident] ?? []).concat(values);
    }
  };
  const readTree = () => {
    expect('(');
    const nodes = [];
    skipSpace();
    while (text[pos] === ';') {
      pos++;
      nodes.push(readNode());
      skipSpace();
    }
    let first = null;
    while (text[pos] === '(') {
      const sub = readTree();
      if (!first) first = sub;
      skipSpace();
    }
    expect(')');
    return first ? nodes.concat(first) : nodes;
  };
  const start = text.indexOf('(');
  if (start < 0) throw new SyntaxError('SGF: no game tree');
  pos = start;
  return readTree();
}

function sgfToPoint(size, value) {
  if (value === '' || (value === 'tt' && size <= 19)) return -1;
  const x = value.charCodeAt(0) - A;
  const y = value.charCodeAt(1) - A;
  if (!(x >= 0 && y >= 0 && x < size && y < size)) throw new RangeError(`SGF: point "${value}" is off the board`);
  return y * size + x;
}

/**
 * Parses the main line of an SGF string.
 * @param {string} text
 * @returns {{size: number, komi: number|null, handicap: number, setup: {black: number[], white: number[]},
 *   moves: {color: number, point: number}[], players: {black: string, white: string}, result: string}}
 */
export function parseSGF(text) {
  const nodes = readMainLine(text);
  if (!nodes.length) throw new SyntaxError('SGF: empty game');
  const root = nodes[0];
  const size = root.SZ ? parseInt(root.SZ[0], 10) : 19;
  if (!(size >= 2 && size <= 19)) throw new RangeError(`SGF: unsupported board size ${root.SZ}`);
  const komi = root.KM ? parseFloat(root.KM[0]) : null;
  const moves = [];
  for (const node of nodes) {
    for (const [tag, color] of [
      ['B', BLACK],
      ['W', WHITE],
    ]) {
      if (node[tag]) moves.push({ color, point: sgfToPoint(size, node[tag][0]) });
    }
  }
  return {
    size,
    komi: Number.isFinite(komi) ? komi : null,
    handicap: root.HA ? parseInt(root.HA[0], 10) || 0 : 0,
    setup: {
      black: (root.AB ?? []).map((v) => sgfToPoint(size, v)).filter((p) => p >= 0),
      white: (root.AW ?? []).map((v) => sgfToPoint(size, v)).filter((p) => p >= 0),
    },
    moves,
    players: { black: root.PB?.[0] ?? '', white: root.PW?.[0] ?? '' },
    result: root.RE?.[0] ?? '',
  };
}

/**
 * Builds a playable game from an SGF string; throws on illegal moves.
 * @param {string} text
 * @param {{seed?: number}} [opts]
 * @returns {object} game
 */
export function gameFromSGF(text, opts = {}) {
  const data = parseSGF(text);
  const firstColor = data.moves[0]?.color ?? (data.handicap >= 2 ? WHITE : BLACK);
  const game = createGame({
    size: data.size,
    handicap: data.handicap,
    komi: data.komi ?? undefined,
    setup: data.setup,
    toMove: firstColor,
    players: data.players,
    seed: opts.seed,
  });
  data.moves.forEach((m, k) => {
    game.toMove = m.color;
    const ok = m.point < 0 ? passMove(game) : playMove(game, m.point % data.size, Math.floor(m.point / data.size)).ok;
    if (!ok) throw new Error(`SGF: illegal move ${k + 1}`);
  });
  return game;
}
