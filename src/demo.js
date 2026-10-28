/**
 * Deterministic mid-game position for the README screenshot (?demo).
 */
import { createGame, playMove } from './game.js';

/** 44 moves of a 9x9 game (point indices y * 9 + x); move 44 captures four stones. */
const DEMO_MOVES = [
  29, 10, 60, 30, 19, 69, 41, 68, 21, 38, 61, 56, 28, 22, 39, 31, 42, 48, 40, 15, 46, 23, 47, 51, 55, 12, 37, 58, 13,
  14, 65, 59, 66, 43, 50, 52, 71, 70, 62, 34, 77, 53, 57, 80,
];

/**
 * Builds the demo game: a 9x9 game around move 44 with territory taking shape and a fresh capture.
 * @returns {object} game
 */
export function createDemoGame() {
  const game = createGame({ size: 9, komi: 6.5, seed: 2 });
  for (const point of DEMO_MOVES) {
    if (!playMove(game, point % 9, Math.floor(point / 9)).ok) throw new Error(`Demo move ${point} is illegal`);
  }
  return game;
}
