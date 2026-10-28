/**
 * SVG board renderer: wooden board, grid, star points, coordinates, shaded stones, markers,
 * territory squares, ghost stone and keyboard cursor. Reports taps and hovers as board points.
 */
import { BLACK, WHITE } from './board.js';
import { COLUMN_LETTERS, handicapPoints, maxHandicap } from './game.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL = 40;
const PAD = 44;
const STONE_R = CELL * 0.47;

/**
 * Creates an SVG element with attributes.
 * @param {string} tag
 * @param {Record<string, string|number>} [attrs]
 * @param {Element} [parent]
 * @returns {SVGElement}
 */
function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

const at = (i) => PAD + i * CELL;

function addDefs(svg) {
  const defs = el('defs', {}, svg);
  const wood = el('linearGradient', { id: 'wood', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  el('stop', { offset: '0', 'stop-color': '#e2b866' }, wood);
  el('stop', { offset: '0.55', 'stop-color': '#d4a24f' }, wood);
  el('stop', { offset: '1', 'stop-color': '#c08a3e' }, wood);
  const black = el('radialGradient', { id: 'stone-b', cx: '0.4', cy: '0.38', r: '0.65', fx: '0.32', fy: '0.28' }, defs);
  el('stop', { offset: '0', 'stop-color': '#6b7280' }, black);
  el('stop', { offset: '0.35', 'stop-color': '#262b35' }, black);
  el('stop', { offset: '1', 'stop-color': '#07090d' }, black);
  const white = el('radialGradient', { id: 'stone-w', cx: '0.42', cy: '0.4', r: '0.65', fx: '0.34', fy: '0.3' }, defs);
  el('stop', { offset: '0', 'stop-color': '#ffffff' }, white);
  el('stop', { offset: '0.6', 'stop-color': '#eceef1' }, white);
  el('stop', { offset: '1', 'stop-color': '#b9bec7' }, white);
  const blur = el('filter', { id: 'soft', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
  el('feGaussianBlur', { stdDeviation: 2.2 }, blur);
}

/** Draws gentle, deterministic wood grain lines. */
function addGrain(svg, view) {
  const g = el('g', { opacity: 0.16, fill: 'none', stroke: '#7c4a1a', 'stroke-width': 1.2 }, svg);
  for (let k = 0; k < 14; k++) {
    const y0 = (view / 14) * k + 9;
    const a = 6 + ((k * 37) % 11);
    let d = `M0 ${y0}`;
    for (let x = 0; x <= view; x += view / 8) d += ` L${x.toFixed(1)} ${(y0 + Math.sin(x / 70 + k) * a).toFixed(1)}`;
    el('path', { d }, g);
  }
}

function addGrid(svg, size) {
  const g = el('g', { stroke: '#3b2a14', 'stroke-width': 1.3, 'stroke-linecap': 'square' }, svg);
  const end = at(size - 1);
  for (let i = 0; i < size; i++) {
    el('line', { x1: at(0), y1: at(i), x2: end, y2: at(i) }, g);
    el('line', { x1: at(i), y1: at(0), x2: at(i), y2: end }, g);
  }
  el('rect', { x: at(0), y: at(0), width: end - at(0), height: end - at(0), fill: 'none', 'stroke-width': 2.2 }, g);
  const stars = el('g', { fill: '#3b2a14' }, svg);
  for (const { x, y } of handicapPoints(size, maxHandicap(size))) el('circle', { cx: at(x), cy: at(y), r: 4 }, stars);
}

function addCoordinates(svg, size, view) {
  const g = el('g', { class: `coords coords-${size}`, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);
  const edge = PAD * 0.42;
  for (let i = 0; i < size; i++) {
    for (const y of [edge, view - edge]) el('text', { x: at(i), y }, g).textContent = COLUMN_LETTERS[i];
    for (const x of [edge, view - edge]) el('text', { x, y: at(i) }, g).textContent = String(size - i);
  }
}

function drawStone(layer, shadows, x, y, color, opacity = 1) {
  if (opacity === 1) el('circle', { cx: at(x) + 2, cy: at(y) + 3, r: STONE_R, fill: 'rgba(0,0,0,0.45)' }, shadows);
  const stone = el('circle', {
    cx: at(x),
    cy: at(y),
    r: STONE_R,
    fill: color === BLACK ? 'url(#stone-b)' : 'url(#stone-w)',
    class: 'stone',
  }, layer);
  if (opacity !== 1) stone.setAttribute('opacity', String(opacity));
  return stone;
}

/**
 * Creates the board view inside an <svg> element.
 * @param {SVGSVGElement} svg
 * @param {{onTap: (x: number, y: number, pointerType: string) => void,
 *   onHover: (point: {x: number, y: number} | null) => void}} handlers
 * @returns {{render: (state: object, opts: object) => void, setLabel: (text: string) => void,
 *   drawOverlay: (opts: object) => void}}
 */
export function createBoardView(svg, handlers) {
  let size = 0;
  let view = 0;
  let dynamic = null;
  let overlay = null;
  let down = null;

  function build(n) {
    size = n;
    view = PAD * 2 + (n - 1) * CELL;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${view} ${view}`);
    addDefs(svg);
    el('rect', { x: 0, y: 0, width: view, height: view, rx: 14, fill: 'url(#wood)' }, svg);
    addGrain(svg, view);
    addGrid(svg, n);
    addCoordinates(svg, n, view);
    dynamic = el('g', {}, svg);
    overlay = el('g', { 'pointer-events': 'none' }, svg);
  }

  function pointAt(event) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return null;
    const vx = ((event.clientX - rect.left) / rect.width) * view;
    const vy = ((event.clientY - rect.top) / rect.height) * view;
    const x = Math.round((vx - PAD) / CELL);
    const y = Math.round((vy - PAD) / CELL);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y };
  }

  svg.addEventListener('pointerdown', (e) => {
    down = pointAt(e);
  });
  svg.addEventListener('pointerup', (e) => {
    const p = pointAt(e);
    if (p && down && p.x === down.x && p.y === down.y) handlers.onTap(p.x, p.y, e.pointerType || 'mouse');
    down = null;
  });
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') handlers.onHover(pointAt(e));
  });
  svg.addEventListener('pointerleave', () => handlers.onHover(null));

  function drawTerritory(state) {
    if (!state.territory) return;
    const g = el('g', {}, dynamic);
    const s = CELL * 0.32;
    state.territory.forEach((owner, i) => {
      if (owner !== BLACK && owner !== WHITE) return;
      const x = i % size;
      const y = Math.floor(i / size);
      el('rect', {
        x: at(x) - s / 2,
        y: at(y) - s / 2,
        width: s,
        height: s,
        rx: 2,
        fill: owner === BLACK ? '#111827' : '#f8fafc',
        stroke: owner === BLACK ? '#f8fafc' : '#111827',
        'stroke-width': 1,
        opacity: 0.9,
      }, g);
    });
  }

  function drawStones(state, showNumbers) {
    const shadows = el('g', { filter: 'url(#soft)' }, dynamic);
    const stones = el('g', {}, dynamic);
    const labels = el('g', { class: 'move-num', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, dynamic);
    const dead = new Set(state.dead);
    state.stones.forEach((c, i) => {
      if (c !== BLACK && c !== WHITE) return;
      const x = i % size;
      const y = Math.floor(i / size);
      drawStone(stones, shadows, x, y, c, dead.has(i) ? 0.42 : 1);
      if (showNumbers && state.moveNumbers[i]) {
        const t = el('text', { x: at(x), y: at(y) + 0.5, fill: c === BLACK ? '#f1f5f9' : '#111827' }, labels);
        t.textContent = String(state.moveNumbers[i]);
        if (state.moveNumbers[i] > 99) t.setAttribute('font-size', '13');
      }
    });
  }

  function drawMarkers(state, showNumbers) {
    for (const { x, y } of state.lastCaptured) {
      el('circle', { cx: at(x), cy: at(y), r: STONE_R * 0.55, class: 'captured-mark' }, dynamic);
    }
    const last = state.lastMove;
    if (last && !last.pass && !showNumbers) {
      el('circle', {
        cx: at(last.x),
        cy: at(last.y),
        r: STONE_R * 0.36,
        fill: 'none',
        stroke: last.color === BLACK ? '#a3e635' : '#4d7c0f',
        'stroke-width': 3.5,
      }, dynamic);
    }
  }

  /**
   * Redraws the hover/pending ghost stone and the keyboard cursor only.
   * @param {{ghost?: {x: number, y: number, color: number, pending?: boolean} | null,
   *   cursor?: {x: number, y: number} | null}} opts
   */
  function drawOverlay(opts) {
    overlay.replaceChildren();
    const { ghost, cursor } = opts;
    if (ghost) {
      const stone = drawStone(overlay, overlay, ghost.x, ghost.y, ghost.color, ghost.pending ? 0.75 : 0.5);
      if (ghost.pending) {
        stone.setAttribute('class', 'stone pending');
        el('circle', { cx: at(ghost.x), cy: at(ghost.y), r: STONE_R + 4, class: 'pending-ring' }, overlay);
      }
    }
    if (cursor) {
      const h = CELL * 0.5;
      el('rect', { x: at(cursor.x) - h, y: at(cursor.y) - h, width: CELL, height: CELL, rx: 6, class: 'cursor' }, overlay);
    }
  }

  return {
    /**
     * Draws a game state from getState().
     * @param {object} state
     * @param {{showNumbers: boolean, ghost?: object|null, cursor?: object|null}} opts
     */
    render(state, opts) {
      if (state.size !== size) build(state.size);
      dynamic.replaceChildren();
      drawStones(state, opts.showNumbers);
      drawTerritory(state);
      drawMarkers(state, opts.showNumbers);
      drawOverlay(opts);
    },
    drawOverlay,
    /** @param {string} text accessible name of the board */
    setLabel(text) {
      svg.setAttribute('aria-label', text);
    },
  };
}
