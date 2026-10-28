/**
 * Web Worker that runs the computer player off the main thread.
 * Message in: {id, game (serializeGame output), level}. Message out: {id, move}.
 */
import { restoreGame } from './game.js';
import { chooseMove } from './ai.js';

self.addEventListener('message', (event) => {
  const { id, game, level } = event.data;
  const move = chooseMove(restoreGame(game), { level });
  self.postMessage({ id, move });
});
