// sprites.js — the procedural sprite atlas. buildAtlas() draws every actor once
// with Canvas 2D into a single offscreen 2048x1024 canvas on a fixed CELL grid
// and returns { canvas, frames }, each frame carrying its UV rect (0-1) plus
// pixel size. game.js uploads the canvas as a GL texture; batch.js reads
// `frames`. Same authoring pattern as pocket-pairs/sprites.js — Canvas 2D into
// an offscreen canvas — the destination is just a texture, not the DOM.
//
// The ART is not here: creatures.js holds the diver and every creature as data
// (ellipses and blobs, per-frame animation), and this file only interprets it.
// 2048 wide because 3 frames x 21 actors + 3 plankton = 66 cells, past the old
// 1024-square's 64; 2048 is WebGL2's guaranteed minimum MAX_TEXTURE_SIZE.
//
// THE CRITICAL RULE: these sprites are drawn additively in-game. A sprite whose
// alpha does not reach a hard zero before its cell border shows a bright square
// halo on screen. So after each sprite is painted, a radial "destination-in"
// mask clips it to a disc well inside the cell (opaque to MASK_SOLID, linearly
// to zero by MASK_ZERO < CELL/2). Nothing survives past that disc — and a test
// in creatures.js's suite checks no art is painted far enough out to be cut.

import { CELL, MASK_SOLID, MASK_ZERO, F, CREATURES, DIVER_OPS, opsAt, frameId } from './creatures.js';

const ATLAS_W = 2048;
const ATLAS_H = 1024;
const COLS = ATLAS_W / CELL;
const SLOTS = COLS * (ATLAS_H / CELL);

// Plankton stay single-frame, plain blobs: [id, radius, rgb].
const PLANKTON = [
  ['plankton-a', 26, [255, 244, 214]], // larger, warm cream
  ['plankton-b', 15, [206, 232, 255]], // small, cool
  ['plankton-c', 32, [255, 214, 168]], // largest, amber
];

let built = null;

export function buildAtlas() {
  if (built) return built;

  // Every cell as [frame id, painter(ctx, cx, cy)].
  const cells = [];
  for (const [id, r, rgb] of PLANKTON) {
    cells.push([id, (ctx, cx, cy) => drawBlob(ctx, cx, cy, r, rgb, 1)]);
  }
  for (const { id, ops } of [{ id: 'diver', ops: DIVER_OPS }, ...CREATURES]) {
    for (let f = 0; f < F; f++) {
      const frameOps = opsAt(ops, f);
      cells.push([frameId(id, f), (ctx, cx, cy) => drawOps(ctx, cx, cy, frameOps)]);
    }
  }
  if (cells.length > SLOTS) throw new Error(`Deep Glow atlas needs ${cells.length} cells, has ${SLOTS}`);

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  const frames = {};

  cells.forEach(([id, paint], i) => {
    const x0 = (i % COLS) * CELL;
    const y0 = Math.floor(i / COLS) * CELL;
    ctx.drawImage(drawCell(paint), x0, y0);
    frames[id] = {
      u0: x0 / ATLAS_W,
      v0: y0 / ATLAS_H,
      u1: (x0 + CELL) / ATLAS_W,
      v1: (y0 + CELL) / ATLAS_H,
      w: CELL,
      h: CELL,
    };
  });

  built = { canvas, frames };
  return built;
}

// Paint one sprite into its own CELL x CELL canvas, then clip it to the safe disc.
function drawCell(paint) {
  const c = document.createElement('canvas');
  c.width = CELL;
  c.height = CELL;
  const ctx = c.getContext('2d');
  const cx = CELL / 2;
  const cy = CELL / 2;

  ctx.globalCompositeOperation = 'lighter';   // overlapping glows accumulate
  paint(ctx, cx, cy);

  // THE GUARANTEE: keep only what falls inside the safe disc, fading to a hard
  // zero by MASK_ZERO. destination-in multiplies existing alpha by the mask's.
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(cx, cy, 0, cx, cy, MASK_ZERO);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(MASK_SOLID / MASK_ZERO, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, CELL, CELL);

  return c;
}

// Interpret one frame's resolved ops (creatures.js opsAt) in order.
function drawOps(ctx, cx, cy, ops) {
  for (const o of ops) {
    const rgb = hexRgb(o.c);
    if (o.k === 'b') drawBlob(ctx, cx + o.x, cy + o.y, o.r, rgb, o.a);
    else paintEllipse(ctx, cx + o.x, cy + o.y, o.rx, o.ry, rgb, o.a);
  }
}

function hexRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// A soft radial blob: peak alpha at the core, transparent by `r`. rgb is 0-255.
function drawBlob(ctx, x, y, r, [red, grn, blu], peak) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${red},${grn},${blu},${peak})`);
  g.addColorStop(0.45, `rgba(${red},${grn},${blu},${peak * 0.55})`);
  g.addColorStop(1, `rgba(${red},${grn},${blu},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// An axis-aligned soft ellipse via a scaled radial gradient.
function paintEllipse(ctx, x, y, rx, ry, [red, grn, blu], peak) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx / ry, 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
  g.addColorStop(0, `rgba(${red},${grn},${blu},${peak})`);
  g.addColorStop(0.6, `rgba(${red},${grn},${blu},${peak * 0.4})`);
  g.addColorStop(1, `rgba(${red},${grn},${blu},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, ry, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
