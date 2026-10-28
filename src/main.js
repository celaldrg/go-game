/**
 * App entry: wires the board view, controls, dialogs, language, storage and the computer player.
 */
import { BLACK, WHITE } from './board.js';
import {
  createGame,
  checkMove,
  playMove,
  passMove,
  resign,
  undo,
  toggleDead,
  resumePlay,
  finishScoring,
  getState,
  serializeGame,
  restoreGame,
} from './game.js';
import { chooseMove, levelsForSize } from './ai.js';
import { toSGF, gameFromSGF } from './sgf.js';
import { createDemoGame } from './demo.js';
import { loadValue, saveValue } from './storage.js';
import { LANGUAGES, translate, formatNumber } from './i18n.js';
import { createBoardView } from './board-view.js';
import { createSetupDialog } from './setup-dialog.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_SETTINGS = {
  size: 9,
  mode: 'computer',
  level: 'medium',
  color: BLACK,
  handicap: 0,
  komi: 6.5,
  moveNumbers: false,
  tapTwice: null,
};

const isDemo = new URLSearchParams(location.search).has('demo');
const storedLang = loadValue('lang', 'en');

const app = {
  lang: LANGUAGES.includes(storedLang) ? storedLang : 'en',
  settings: { ...DEFAULT_SETTINGS, ...loadValue('settings', {}) },
  game: null,
  thinking: false,
  requestId: 0,
  hover: null,
  cursor: null,
  pending: null,
  message: null,
  resignTimer: 0,
};

const t = (key, vars) => translate(app.lang, key, vars);
const num = (value) => formatNumber(app.lang, value);
const colorName = (c) => t(c === BLACK ? 'black' : 'white');
const mode = () => (isDemo ? 'two' : app.settings.mode);
const humanColor = () => app.settings.color;

const view = createBoardView($('board'), { onTap: handleTap, onHover: handleHover });
const setup = createSetupDialog({
  dialog: $('setup'),
  form: $('setup-form'),
  t,
  onStart: (choice) => {
    app.settings = { ...app.settings, ...choice };
    saveValue('settings', app.settings);
    startGame();
  },
});

// ---------- computer player ----------

let worker = createWorker();

function createWorker() {
  try {
    const w = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    w.addEventListener('message', (e) => applyComputerMove(e.data.id, e.data.move));
    w.addEventListener('error', () => {
      worker = null;
      if (app.thinking) thinkOnMainThread(app.requestId, computerLevel());
    });
    return w;
  } catch {
    return null;
  }
}

function computerLevel() {
  const levels = levelsForSize(app.game.size);
  return levels.includes(app.settings.level) ? app.settings.level : levels[0];
}

function isComputerTurn() {
  return mode() === 'computer' && app.game.phase === 'play' && app.game.toMove !== humanColor();
}

function maybeComputerMove() {
  if (app.thinking || !isComputerTurn()) return;
  app.thinking = true;
  const id = ++app.requestId;
  const level = computerLevel();
  render();
  if (worker) worker.postMessage({ id, game: serializeGame(app.game), level });
  else thinkOnMainThread(id, level);
}

/** Fallback when Web Workers are unavailable: think after the spinner has been painted. */
function thinkOnMainThread(id, level) {
  setTimeout(() => {
    if (id === app.requestId) applyComputerMove(id, chooseMove(app.game, { level }));
  }, 30);
}

function applyComputerMove(id, move) {
  if (id !== app.requestId || !app.thinking) return;
  app.thinking = false;
  if (move.pass) passMove(app.game);
  else playMove(app.game, move.x, move.y);
  app.message = moveMessage();
  update();
}

function cancelThinking() {
  app.requestId++;
  app.thinking = false;
}

// ---------- game lifecycle ----------

/** A fresh game with the current settings and a time-based seed. */
function newGameFromSettings() {
  const s = app.settings;
  return createGame({ size: s.size, handicap: s.handicap, komi: s.komi, seed: (Date.now() % 1e9) + 1 });
}

function startGame() {
  cancelThinking();
  app.game = newGameFromSettings();
  app.pending = null;
  app.cursor = null;
  app.message = null;
  update();
}

function saveGame() {
  if (isDemo) return;
  const g = app.game;
  saveValue('game', {
    data: serializeGame(g),
    dead: [...g.dead],
    phase: g.phase,
    resigned: g.result?.reason === 'resign' ? (g.result.winner === 'black' ? WHITE : BLACK) : 0,
  });
}

function loadGame() {
  const saved = loadValue('game', null);
  if (!saved) return null;
  try {
    const g = restoreGame(saved.data);
    if (g.phase === 'scoring') g.dead = new Set(saved.dead);
    if (saved.resigned) resign(g, saved.resigned);
    else if (saved.phase === 'over') finishScoring(g);
    return g;
  } catch {
    return null;
  }
}

/** Saves, redraws and lets the computer move when it is its turn. */
function update() {
  saveGame();
  render();
  maybeComputerMove();
}

// ---------- moves ----------

function moveMessage() {
  const g = app.game;
  const last = g.moves[g.moves.length - 1];
  if (!last) return null;
  if (last.point < 0) return { key: 'passed', color: last.color };
  if (g.lastCaptured.length) return { key: 'capturedN', color: last.color, n: g.lastCaptured.length };
  return null;
}

function humanCanMove() {
  return app.game.phase === 'play' && !app.thinking && !isComputerTurn();
}

function tryPlay(x, y) {
  if (!humanCanMove()) return;
  app.pending = null;
  const result = playMove(app.game, x, y);
  app.message = result.ok ? moveMessage() : { key: `reason.${result.reason}` };
  if (result.ok) update();
  else render();
}

function tapTwiceActive() {
  return app.settings.tapTwice ?? (app.game.size === 19 && window.innerWidth < 700);
}

function handleTap(x, y, pointerType) {
  app.cursor = null;
  const g = app.game;
  if (g.phase === 'scoring') {
    if (toggleDead(g, x, y)) update();
    return;
  }
  if (!humanCanMove()) return;
  const confirmFirst = pointerType !== 'mouse' && tapTwiceActive();
  if (!confirmFirst || (app.pending && app.pending.x === x && app.pending.y === y)) {
    tryPlay(x, y);
    return;
  }
  const check = checkMove(g, x, y);
  app.pending = check.ok ? { x, y } : null;
  app.message = check.ok ? { key: 'tapAgain' } : { key: `reason.${check.reason}` };
  render();
}

function handleHover(point) {
  app.hover = point;
  view.drawOverlay(overlay());
}

function doPass() {
  if (!humanCanMove()) return;
  passMove(app.game);
  app.pending = null;
  app.message = moveMessage();
  update();
}

function doUndo() {
  const g = app.game;
  cancelThinking();
  app.pending = null;
  app.message = null;
  if (g.phase === 'over' && g.result?.reason === 'resign') {
    app.game = restoreGame(serializeGame(g));
  } else if (undo(g)) {
    while (mode() === 'computer' && g.moves.length > 0 && g.toMove !== humanColor()) undo(g);
  }
  update();
}

function doResign() {
  const g = app.game;
  if (g.phase === 'over') return;
  const btn = $('btn-resign');
  if (!app.resignTimer) {
    btn.textContent = t('resignConfirm');
    btn.classList.add('armed');
    app.resignTimer = setTimeout(disarmResign, 3000);
    return;
  }
  disarmResign();
  cancelThinking();
  resign(g, mode() === 'computer' ? humanColor() : g.toMove);
  update();
  showResult();
}

function disarmResign() {
  clearTimeout(app.resignTimer);
  app.resignTimer = 0;
  $('btn-resign').textContent = t('resign');
  $('btn-resign').classList.remove('armed');
}

// ---------- keyboard ----------

const KEY_STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function handleKey(e) {
  if (document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  const onControl = ['BUTTON', 'A', 'SUMMARY'].includes(tag);
  const g = app.game;
  if (KEY_STEPS[e.key]) {
    e.preventDefault();
    const [dx, dy] = KEY_STEPS[e.key];
    const c = app.cursor ?? { x: (g.size - 1) / 2, y: (g.size - 1) / 2 };
    app.cursor = app.cursor
      ? { x: Math.min(g.size - 1, Math.max(0, c.x + dx)), y: Math.min(g.size - 1, Math.max(0, c.y + dy)) }
      : c;
    view.drawOverlay(overlay());
  } else if ((e.key === 'Enter' || e.key === ' ') && !onControl && app.cursor) {
    e.preventDefault();
    if (g.phase === 'scoring') {
      if (toggleDead(g, app.cursor.x, app.cursor.y)) update();
    } else tryPlay(app.cursor.x, app.cursor.y);
  } else if (e.key === 'p' || e.key === 'P') doPass();
  else if (e.key === 'u' || e.key === 'U') doUndo();
}

// ---------- SGF ----------

function downloadSGF() {
  const blob = new Blob([toSGF(app.game)], { type: 'application/x-go-sgf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `go-${app.game.size}x${app.game.size}.sgf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function uploadSGF(file) {
  try {
    const game = gameFromSGF(await file.text(), { seed: (Date.now() % 1e9) + 1 });
    cancelThinking();
    app.game = game;
    app.settings = { ...app.settings, mode: 'two', size: game.size, handicap: game.handicap, komi: game.komi };
    saveValue('settings', app.settings);
    app.message = null;
  } catch {
    app.message = { key: 'sgfError' };
  }
  app.pending = null;
  update();
}

// ---------- rendering ----------

function overlay() {
  const g = app.game;
  let ghost = null;
  if (app.pending) ghost = { ...app.pending, color: g.toMove, pending: true };
  else if (app.hover && humanCanMove() && checkMove(g, app.hover.x, app.hover.y).ok) {
    ghost = { ...app.hover, color: g.toMove };
  }
  return { ghost, cursor: app.cursor, showNumbers: app.settings.moveNumbers };
}

function messageText() {
  const m = app.message;
  if (!m) return '';
  return t(m.key, { color: m.color ? colorName(m.color) : '', n: m.n ?? '' });
}

function resultText(result) {
  if (result.winner === 'draw') return t('draw');
  const color = colorName(result.winner === 'black' ? BLACK : WHITE);
  return result.reason === 'resign' ? t('winsResign', { color }) : t('winsBy', { color, margin: result.margin });
}

function statusText(state) {
  if (app.thinking) return t('thinking');
  if (state.phase === 'over') return resultText(state.result);
  if (state.phase === 'scoring') return t('scoringLead', { black: state.score.black.total, white: state.score.white.total });
  return `${t('toPlay', { color: colorName(state.toMove) })} · ${t('moveCount', { n: state.moveCount + 1 })}`;
}

function renderPlayers(state) {
  $('cap-black').textContent = String(state.captures.black);
  $('cap-white').textContent = String(state.captures.white);
  $('komi').textContent = num(state.komi);
  const vsComputer = mode() === 'computer';
  for (const [c, id] of [
    [BLACK, 'black'],
    [WHITE, 'white'],
  ]) {
    const who = vsComputer ? t(c === humanColor() ? 'you' : 'computer') : '';
    $(`who-${id}`).textContent = who ? `(${who})` : '';
    $(`player-${id}`).classList.toggle('active', state.phase === 'play' && state.toMove === c);
  }
}

function renderControls(state) {
  const canAct = humanCanMove();
  $('btn-pass').disabled = !canAct;
  $('btn-resign').disabled = state.phase === 'over';
  $('btn-undo').disabled = state.moveCount === 0 && state.phase !== 'over';
  $('scoring').hidden = state.phase !== 'scoring';
  $('spinner').hidden = !app.thinking;
  $('opt-numbers').checked = app.settings.moveNumbers;
  $('opt-tap').checked = tapTwiceActive();
}

function render() {
  const state = getState(app.game);
  view.render(state, overlay());
  view.setLabel(t('boardLabel', { size: state.size }));
  renderPlayers(state);
  renderControls(state);
  $('status-text').textContent = statusText(state);
  $('message').textContent = messageText();
}

function showResult() {
  if (!app.game.result) return;
  showResultText();
  $('result').showModal();
}

function showResultText() {
  const { result } = app.game;
  if (!result) return;
  $('result-line').textContent = resultText(result);
  const score = result.score;
  $('score-table').hidden = !score;
  if (score) {
    const cells = {
      'r-bs': score.black.stones,
      'r-ws': score.white.stones,
      'r-bt': score.black.territory,
      'r-wt': score.white.territory,
      'r-wk': score.white.komi,
      'r-btot': score.black.total,
      'r-wtot': score.white.total,
    };
    for (const [id, value] of Object.entries(cells)) $(id).textContent = num(value);
  }
}

function applyLanguage() {
  document.documentElement.lang = app.lang;
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-label]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nLabel));
  }
  document.title = t('title');
  setup.refreshText(num);
  if (app.resignTimer) disarmResign();
  render();
  if ($('result').open) showResultText();
}

// ---------- wiring ----------

function wire() {
  $('btn-lang').addEventListener('click', () => {
    app.lang = app.lang === 'en' ? 'tr' : 'en';
    saveValue('lang', app.lang);
    applyLanguage();
  });
  $('btn-restart').addEventListener('click', startGame);
  $('btn-new').addEventListener('click', () => setup.open(app.settings));
  $('btn-pass').addEventListener('click', doPass);
  $('btn-undo').addEventListener('click', doUndo);
  $('btn-resign').addEventListener('click', doResign);
  $('btn-finish').addEventListener('click', () => {
    if (finishScoring(app.game)) {
      update();
      showResult();
    }
  });
  $('btn-resume').addEventListener('click', () => {
    if (resumePlay(app.game)) update();
  });
  $('btn-setup-cancel').addEventListener('click', () => $('setup').close());
  $('btn-result-close').addEventListener('click', () => $('result').close());
  $('btn-result-new').addEventListener('click', () => {
    $('result').close();
    setup.open(app.settings);
  });
  $('opt-numbers').addEventListener('change', (e) => {
    app.settings.moveNumbers = e.target.checked;
    saveValue('settings', app.settings);
    render();
  });
  $('opt-tap').addEventListener('change', (e) => {
    app.settings.tapTwice = e.target.checked;
    app.pending = null;
    saveValue('settings', app.settings);
    render();
  });
  $('btn-sgf-save').addEventListener('click', downloadSGF);
  $('sgf-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) uploadSGF(file);
    e.target.value = '';
  });
  $('board').addEventListener('pointerdown', () => {
    if (app.cursor) {
      app.cursor = null;
      view.drawOverlay(overlay());
    }
  });
  document.addEventListener('keydown', handleKey);
}

function init() {
  wire();
  app.game = isDemo ? createDemoGame() : (loadGame() ?? newGameFromSettings());
  if (isDemo) app.message = moveMessage();
  applyLanguage();
  maybeComputerMove();
}

init();
