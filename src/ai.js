/**
 * Computer player: Monte Carlo tree search (UCT) with light random playouts and simple priors
 * (captures, escaping atari, avoiding self-atari and the first line).
 */
import { BLACK, EMPTY, EDGE } from './board.js';
import { checkMove } from './game.js';
import { playout, playoutScore, pointOwner } from './playout.js';
import { areaScore, deadFromOwnership } from './score.js';
import { createRng } from './rng.js';

/** Playout budget per level. */
export const LEVELS = {
  easy: { playouts: 300 },
  medium: { playouts: 1500 },
  hard: { playouts: 6000 },
};

/** Hard cap on thinking time per move (ms). */
export const TIME_LIMIT_MS = 1200;

const PASS = -1;
const EXPLORATION = 0.4;

/**
 * Levels the computer offers on a board size (19x19 only easy).
 * @param {number} size
 * @returns {string[]}
 */
export function levelsForSize(size) {
  return size >= 19 ? ['easy'] : Object.keys(LEVELS);
}

function createNode(move, color, priorVisits, priorWins) {
  return { move, color, children: null, prior: priorVisits, priorWins, visits: priorVisits, wins: priorWins };
}

/** Prior [visits, wins] for a candidate move: captures and escapes first, self-atari and the edge last. */
function prior(b, p, c) {
  const capture = b.captureSize(p, c);
  if (capture) return [22, 19 + Math.min(capture, 3)];
  if (b.isSelfAtari(p, c)) return [14, 1];
  let danger = false;
  let firstLine = false;
  for (const d of b.dirs) {
    const cq = b.color[p + d];
    if (cq === EDGE) firstLine = true;
    else if (cq === c && b.inAtari(b.head[p + d])) danger = true;
  }
  if (danger) return [18, 15];
  if (firstLine) return [6, 2];
  return [2, 1];
}

function expand(node, b, c, isCandidate) {
  node.children = [];
  for (let k = 0; k < b.emptyCount; k++) {
    const p = b.emptyList[k];
    if (b.isLegal(p, c) && !b.isEye(p, c) && isCandidate(p)) {
      const [v, w] = prior(b, p, c);
      node.children.push(createNode(p, c, v, w));
    }
  }
  node.children.push(createNode(PASS, c, 1, 0.1));
}

function select(node) {
  const logN = Math.log(node.visits + 1);
  let best = null;
  let bestValue = -Infinity;
  for (const ch of node.children) {
    const value = ch.wins / ch.visits + EXPLORATION * Math.sqrt(logN / ch.visits);
    if (value > bestValue) {
      bestValue = value;
      best = ch;
    }
  }
  return best;
}

function apply(b, move, color) {
  if (move === PASS) b.pass();
  else b.play(move, color);
}

/** True when passing now would win by the ownership-based dead-stone estimate. */
function passingWins(game, ownership) {
  const dead = deadFromOwnership(game.board, ownership);
  const score = areaScore(game.board, dead, game.komi);
  return score.winner === (game.toMove === BLACK ? 'black' : 'white');
}

/**
 * Chooses a move for the side to move.
 * @param {object} game a game from createGame (phase 'play')
 * @param {object} [opts]
 * @param {string} [opts.level='medium'] key of LEVELS
 * @param {number} [opts.playouts] overrides the level budget
 * @param {number} [opts.timeLimitMs=TIME_LIMIT_MS]
 * @param {{next: () => number, int: (n: number) => number}} [opts.rng] seeded RNG (default seeded from the move number)
 * @param {() => number} [opts.now] clock in ms (default performance.now)
 * @returns {{pass: boolean, x?: number, y?: number, winrate: number, playouts: number}}
 */
export function chooseMove(game, opts = {}) {
  const budget = opts.playouts ?? LEVELS[opts.level ?? 'medium'].playouts;
  const timeLimit = opts.timeLimitMs ?? TIME_LIMIT_MS;
  const now = opts.now ?? (() => performance.now());
  const rng = opts.rng ?? createRng(game.seed * 31 + game.moves.length + 1);
  const board = game.board;
  const toMove = game.toMove;
  const n = game.size;
  const last = game.moves[game.moves.length - 1];
  const lastPoint = last && last.point >= 0 ? board.index(last.point % n, Math.floor(last.point / n)) : -1;

  const root = createNode(PASS, 3 - toMove, 0, 0);
  expand(root, board, toMove, (p) => {
    const { x, y } = board.coords(p);
    return checkMove(game, x, y).ok;
  });
  if (root.children.length === 1) return { pass: true, winrate: 0, playouts: 0 };

  const ownership = game.passes > 0 ? new Float32Array(n * n) : null;
  const start = now();
  let done = 0;
  while (done < budget && (done === 0 || now() - start < timeLimit)) {
    runSimulation(root, board, toMove, game, rng, lastPoint, ownership);
    done++;
  }

  const best = mostVisited(root);
  const winrate = (best.wins - best.priorWins) / Math.max(1, best.visits - best.prior);
  if (
    best.move === PASS ||
    (ownership &&
      passingWins(
        game,
        ownership.map((v) => v / done),
      ))
  ) {
    return { pass: true, winrate, playouts: done };
  }
  return { pass: false, ...board.coords(best.move), winrate, playouts: done };
}

function mostVisited(root) {
  let best = root.children[0];
  for (const ch of root.children) {
    if (ch.visits > best.visits || (ch.visits === best.visits && ch.wins / ch.visits > best.wins / best.visits))
      best = ch;
  }
  return best;
}

/** One selection - expansion - playout - backup cycle. */
function runSimulation(root, rootBoard, toMove, game, rng, lastPoint, ownership) {
  const b = rootBoard.clone();
  const path = [root];
  let node = root;
  let color = toMove;
  let passes = game.passes;
  let last = lastPoint;
  for (;;) {
    if (!node.children) {
      if (node.visits - node.prior < 1 || passes >= 2) break;
      expand(node, b, color, () => true);
    }
    node = select(node);
    apply(b, node.move, color);
    passes = node.move === PASS ? passes + 1 : 0;
    last = node.move;
    path.push(node);
    color = 3 - color;
    if (passes >= 2) break;
  }
  playout(b, color, rng, { lastMove: last });
  const blackWins = playoutScore(b, game.komi) > 0 ? 1 : 0;
  for (const v of path) {
    v.visits++;
    v.wins += v.color === BLACK ? blackWins : 1 - blackWins;
  }
  if (ownership) addOwnership(b, ownership);
}

/** Adds the final owner of every point (+1 black, -1 white) to the running ownership sums. */
function addOwnership(b, ownership) {
  const n = b.size;
  for (let i = 0; i < ownership.length; i++) {
    const owner = pointOwner(b, b.index(i % n, Math.floor(i / n)));
    ownership[i] += owner === BLACK ? 1 : owner === EMPTY ? 0 : -1;
  }
}
