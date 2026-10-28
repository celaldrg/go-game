// Shared test helpers (no tests in this file).
import { createGame } from '../src/game.js';
import { BLACK, WHITE } from '../src/board.js';

/**
 * Builds a game from rows of 'X' (black), 'O' (white) and '.' (empty).
 * @param {string[]} rows
 * @param {object} [opts] extra createGame options (toMove defaults to black)
 */
export function fromDiagram(rows, opts = {}) {
  const size = rows.length;
  const setup = { black: [], white: [] };
  rows.forEach((row, y) => {
    row
      .replace(/\s+/g, '')
      .split('')
      .forEach((ch, x) => {
        if (ch === 'X') setup.black.push(y * size + x);
        else if (ch === 'O') setup.white.push(y * size + x);
      });
  });
  return createGame({ size, setup, toMove: BLACK, ...opts });
}

/** Diagram of the current board, for readable assertions. */
export function toDiagram(game) {
  const rows = [];
  for (let y = 0; y < game.size; y++) {
    let row = '';
    for (let x = 0; x < game.size; x++) {
      const c = game.board.get(x, y);
      row += c === BLACK ? 'X' : c === WHITE ? 'O' : '.';
    }
    rows.push(row);
  }
  return rows;
}

/** Converts a list of [x, y] pairs to a sorted list of point indices. */
export function indices(size, points) {
  return points.map(([x, y]) => y * size + x).sort((a, b) => a - b);
}
