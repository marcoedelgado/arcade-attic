// sprites.js — the procedural sprite atlas. buildAtlas() draws every actor once
// with Canvas 2D into a single offscreen 1024x1024 canvas laid out on a fixed
// 128px grid, and returns { canvas, frames } where each frame carries its UV
// rect (0-1) plus pixel size. game.js uploads the canvas as a GL texture; batch.js
// reads `frames`. This is the same authoring pattern as pocket-pairs/sprites.js
// and waffle-wednesday/sprites.js — Canvas 2D into an offscreen canvas — the only
// difference is the destination is a texture, not the DOM.
//
// THE CRITICAL RULE: these sprites are drawn additively in-game. A sprite whose
// alpha does not reach a hard zero before its cell border shows a bright square
// halo on screen. So after each sprite is painted, a radial "destination-in" mask
// clips it to a disc well inside the cell (opaque to r=MASK_SOLID, linearly to
// zero by r=MASK_ZERO, and MASK_ZERO < CELL/2). Nothing survives past that disc,
// so no frame can ever have a lit pixel touching its border. Softness of the art
// itself is done with radial gradients on top of that guarantee.

const ATLAS = 1024;
const CELL = 128;
const COLS = ATLAS / CELL; // 8

// Mask radii, in pixels from the cell centre. CELL/2 is 64; we stop well short.
const MASK_SOLID = 40; // fully opaque out to here
const MASK_ZERO = 56; // fully transparent from here to the border (8px clear margin)

// Grid slots, in draw order. Row 0 for now; later tasks append more ids.
const LAYOUT = ['diver', 'plankton-a', 'plankton-b', 'plankton-c', 'lamp-glow'];

let built = null;

export function buildAtlas() {
  if (built) return built;

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const ctx = canvas.getContext('2d');

  const frames = {};

  LAYOUT.forEach((id, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x0 = col * CELL;
    const y0 = row * CELL;

    const cell = drawCell(id);

    ctx.drawImage(cell, x0, y0);

    frames[id] = {
      u0: x0 / ATLAS,
      v0: y0 / ATLAS,
      u1: (x0 + CELL) / ATLAS,
      v1: (y0 + CELL) / ATLAS,
      w: CELL,
      h: CELL,
    };
  });

  built = { canvas, frames };
  return built;
}

// Draw one sprite into its own 128x128 canvas, then clip it to the safe disc.
function drawCell(id) {
  const c = document.createElement('canvas');
  c.width = CELL;
  c.height = CELL;
  const ctx = c.getContext('2d');
  const cx = CELL / 2;
  const cy = CELL / 2;

  // Build the art additively so overlapping glows accumulate.
  ctx.globalCompositeOperation = 'lighter';

  if (id === 'diver') {
    drawDiver(ctx, cx, cy);
  } else if (id === 'plankton-a') {
    drawBlob(ctx, cx, cy, 26, [255, 244, 214]); // larger, warm cream
  } else if (id === 'plankton-b') {
    drawBlob(ctx, cx, cy, 15, [206, 232, 255]); // small, cool
  } else if (id === 'plankton-c') {
    drawBlob(ctx, cx, cy, 32, [255, 214, 168]); // largest, amber
  } else if (id === 'lamp-glow') {
    drawGlow(ctx, cx, cy); // the lamp's pool of light — scaled way up in-game
  }

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

// The lamp glow: a single very soft white disc, full white at the core and a
// hard zero by MASK_ZERO. game.js pushes this one frame scaled to a multiple of
// the lamp's pixel radius and tinted (vColor) by the current zone, so the light
// pools into the water around the diver and shrinks as the fuel drains. White
// here so the in-game tint is a straight multiply.
function drawGlow(ctx, x, y) {
  const r = MASK_ZERO;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// A soft radial blob: bright core, transparent by `r`. rgb is 0-255.
function drawBlob(ctx, x, y, r, [red, grn, blu]) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${red},${grn},${blu},1)`);
  g.addColorStop(0.45, `rgba(${red},${grn},${blu},0.55)`);
  g.addColorStop(1, `rgba(${red},${grn},${blu},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// diver — a small fish silhouette facing +x with a lamp bulb on a forward stalk.
// Everything is a radial gradient fading to zero: no strokes, no hard outline.
function drawDiver(ctx, cx, cy) {
  // Body: a soft blue-white ellipse, centre pulled slightly aft (-x).
  const bx = cx - 6;
  paintEllipse(ctx, bx, cy, 24, 13, [150, 205, 230], 1);

  // Tail: a dimmer fan trailing behind the body.
  paintEllipse(ctx, bx - 22, cy, 12, 15, [110, 170, 205], 0.7);

  // Stalk: a faint thin taper from the snout forward to the bulb.
  paintEllipse(ctx, cx + 20, cy - 6, 12, 3, [180, 210, 225], 0.5);

  // Lamp bulb: the brightest thing in the cell, warm white, on the forward stalk.
  drawBlob(ctx, cx + 30, cy - 9, 11, [255, 246, 222]);
  drawBlob(ctx, cx + 30, cy - 9, 5, [255, 255, 255]);
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
