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

// Grid slots, in draw order. Row 0 is the diver + plankton from earlier tasks; Task 9 appends one frame per creature id in depth.js's ZONES,
// grouped by zone (5 zones x 4 creatures = 20 ids), row 1 onward. The
// round-1 fix added the fifth id per zone — the non-rare bumper — after the
// first pass left every zone with no obstacle at all (every rare is a
// drifter, and the original roster had no non-rare bumper to fall back on).
const LAYOUT = [
  'diver', 'plankton-a', 'plankton-b', 'plankton-c',
  // Sunlit Shallows
  'bubble-fish', 'silver-dart', 'lazy-turtle', 'sunfish',
  // The Blue
  'blue-dancer', 'phantom-squid', 'slow-manta', 'electric-eel',
  // The Twilight
  'lantern-jelly', 'shadow-fish', 'round-puffer', 'anglerfish',
  // The Midnight
  'glowing-squid', 'depth-lurker', 'blob-fish', 'fangtooth',
  // The Trench
  'vent-worm', 'black-smoker', 'boulder-crab', 'giant-octopus',
];

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
  } else if (id === 'bubble-fish') {
    drawBubbleFish(ctx, cx, cy);
  } else if (id === 'silver-dart') {
    drawSilverDart(ctx, cx, cy);
  } else if (id === 'lazy-turtle') {
    drawLazyTurtle(ctx, cx, cy);
  } else if (id === 'sunfish') {
    drawSunfish(ctx, cx, cy);
  } else if (id === 'blue-dancer') {
    drawBlueDancer(ctx, cx, cy);
  } else if (id === 'phantom-squid') {
    drawPhantomSquid(ctx, cx, cy);
  } else if (id === 'slow-manta') {
    drawSlowManta(ctx, cx, cy);
  } else if (id === 'electric-eel') {
    drawElectricEel(ctx, cx, cy);
  } else if (id === 'lantern-jelly') {
    drawLanternJelly(ctx, cx, cy);
  } else if (id === 'shadow-fish') {
    drawShadowFish(ctx, cx, cy);
  } else if (id === 'round-puffer') {
    drawRoundPuffer(ctx, cx, cy);
  } else if (id === 'anglerfish') {
    drawAnglerfish(ctx, cx, cy);
  } else if (id === 'glowing-squid') {
    drawGlowingSquid(ctx, cx, cy);
  } else if (id === 'depth-lurker') {
    drawDepthLurker(ctx, cx, cy);
  } else if (id === 'blob-fish') {
    drawBlobFish(ctx, cx, cy);
  } else if (id === 'fangtooth') {
    drawFangtooth(ctx, cx, cy);
  } else if (id === 'vent-worm') {
    drawVentWorm(ctx, cx, cy);
  } else if (id === 'black-smoker') {
    drawBlackSmoker(ctx, cx, cy);
  } else if (id === 'boulder-crab') {
    drawBoulderCrab(ctx, cx, cy);
  } else if (id === 'giant-octopus') {
    drawGiantOctopus(ctx, cx, cy);
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
  // Bigger and higher-contrast than the first pass, which read as an
  // indistinct smudge inside its own lamp glow. This is the character the
  // player is meant to identify with, so it has to survive being the brightest
  // area on screen: a solid opaque core, a readable silhouette, and an
  // unambiguous nose-right facing so a child can tell which way it is pointing.

  // Tail: a dim fan well behind the body, giving the silhouette a direction.
  paintEllipse(ctx, cx - 30, cy, 15, 19, [96, 156, 196], 0.65);
  paintEllipse(ctx, cx - 24, cy, 11, 13, [126, 186, 220], 0.8);

  // Body: a broad soft halo, then an opaque core so the shape holds up against
  // the lamp behind it instead of dissolving into it.
  const bx = cx - 6;
  paintEllipse(ctx, bx, cy, 32, 19, [120, 180, 215], 0.55);
  paintEllipse(ctx, bx, cy, 25, 14, [186, 226, 244], 1);
  paintEllipse(ctx, bx - 2, cy - 3, 16, 6, [236, 250, 255], 0.9);  // dorsal highlight

  // A dark eye — the single cheapest thing that turns a blob into a creature.
  drawBlob(ctx, cx + 7, cy - 2, 3.2, [16, 30, 48]);

  // Stalk: a thin taper from the snout forward to the bulb.
  paintEllipse(ctx, cx + 21, cy - 7, 13, 3, [198, 226, 240], 0.6);

  // Lamp bulb: the brightest point in the whole atlas, warm white, with a
  // tight white centre so it stays a distinct point rather than a soft wash.
  drawBlob(ctx, cx + 32, cy - 11, 14, [255, 240, 200]);
  drawBlob(ctx, cx + 32, cy - 11, 8, [255, 250, 232]);
  drawBlob(ctx, cx + 32, cy - 11, 4, [255, 255, 255]);
}

// ---- Creature art (Task 9) --------------------------------------------------
// Same rules as the diver and the plankton blobs above: only paintEllipse (a
// soft axis-aligned ellipse) and drawBlob (a soft radial dot) — no strokes, no
// hard edges — and the destination-in mask in drawCell() guarantees a clean
// fade to zero before the cell border either way. Each zone's family leans on
// its zone colour (depth.js ZONES[].colour) lifted to something legible against
// black; rare creatures (sunfish, electric-eel, anglerfish, fangtooth,
// giant-octopus) get one extra bright accent so they read as special at a
// glance, at the ~30px on-screen size these are actually seen at.

// Sunlit Shallows — bright cyan family.
function drawBubbleFish(ctx, cx, cy) {
  paintEllipse(ctx, cx - 20, cy, 10, 12, [70, 150, 170], 0.6);   // tail
  paintEllipse(ctx, cx, cy, 22, 13, [140, 230, 235], 1);          // body
  drawBlob(ctx, cx + 6, cy - 16, 6, [220, 255, 250]);             // rising bubbles
  drawBlob(ctx, cx + 14, cy - 24, 4, [220, 255, 250]);
}
function drawSilverDart(ctx, cx, cy) {               // shy — sleek, no tail, quick to read
  paintEllipse(ctx, cx, cy, 26, 7, [225, 240, 250], 1);
  drawBlob(ctx, cx + 20, cy, 4, [255, 255, 255]);
}
function drawLazyTurtle(ctx, cx, cy) {               // bumper — big soft shell, harmless "oops"
  paintEllipse(ctx, cx, cy, 30, 22, [80, 170, 165], 0.6);   // shell dome, low peak so it reads soft
  paintEllipse(ctx, cx + 26, cy + 4, 9, 6, [140, 220, 210], 0.5); // small head nub
  drawBlob(ctx, cx - 4, cy - 4, 5, [200, 250, 235]);        // one dim shell highlight
}
function drawSunfish(ctx, cx, cy) {                  // rare — big warm disc
  drawBlob(ctx, cx, cy, 34, [255, 214, 120]);
  paintEllipse(ctx, cx, cy, 30, 22, [255, 236, 180], 0.6);
  drawBlob(ctx, cx, cy, 12, [255, 250, 220]);
}

// The Blue — mid ocean blue family.
function drawBlueDancer(ctx, cx, cy) {
  paintEllipse(ctx, cx - 18, cy, 9, 10, [50, 100, 190], 0.5);
  paintEllipse(ctx, cx, cy, 20, 10, [110, 170, 235], 1);
}
function drawPhantomSquid(ctx, cx, cy) {             // shy — pale, translucent, trailing tentacles
  paintEllipse(ctx, cx, cy - 6, 18, 16, [190, 215, 255], 0.55);
  drawBlob(ctx, cx - 10, cy + 16, 5, [180, 210, 255]);
  drawBlob(ctx, cx, cy + 20, 5, [180, 210, 255]);
  drawBlob(ctx, cx + 10, cy + 16, 5, [180, 210, 255]);
}
function drawSlowManta(ctx, cx, cy) {                // bumper — wide flat glide, no urgency
  paintEllipse(ctx, cx, cy, 32, 14, [40, 90, 175], 0.55);   // wide flat body
  paintEllipse(ctx, cx - 26, cy, 8, 5, [50, 100, 190], 0.4); // small trailing tail nub
}
function drawElectricEel(ctx, cx, cy) {              // rare — long body, bright spark accents
  paintEllipse(ctx, cx, cy, 30, 7, [90, 170, 230], 0.9);
  drawBlob(ctx, cx - 10, cy, 4, [255, 255, 190]);
  drawBlob(ctx, cx + 10, cy, 4, [255, 255, 190]);
}

// The Twilight — indigo/violet family.
function drawLanternJelly(ctx, cx, cy) {
  paintEllipse(ctx, cx, cy + 4, 20, 16, [120, 100, 210], 0.6);
  drawBlob(ctx, cx, cy - 10, 9, [255, 235, 190]);     // the lantern
}
function drawShadowFish(ctx, cx, cy) {               // shy — dim, easy to lose in the dark
  paintEllipse(ctx, cx - 16, cy, 8, 9, [50, 40, 100], 0.35);
  paintEllipse(ctx, cx, cy, 20, 11, [90, 75, 160], 0.5);
}
function drawRoundPuffer(ctx, cx, cy) {              // bumper — round and slow, puffed up
  drawBlob(ctx, cx, cy, 28, [95, 75, 175]);
  paintEllipse(ctx, cx, cy, 24, 22, [150, 130, 220], 0.45);
  drawBlob(ctx, cx + 8, cy - 6, 3, [255, 250, 235]);        // one small eye-glint
}
function drawAnglerfish(ctx, cx, cy) {               // rare — dark body, one very bright lure
  paintEllipse(ctx, cx, cy, 24, 15, [60, 45, 90], 0.6);
  drawBlob(ctx, cx + 22, cy - 12, 7, [255, 250, 210]);
}

// The Midnight — deep violet-black family.
function drawGlowingSquid(ctx, cx, cy) {
  paintEllipse(ctx, cx, cy - 6, 16, 15, [90, 60, 160], 0.55);
  drawBlob(ctx, cx - 8, cy + 16, 4, [150, 220, 255]); // glowing tentacle tips
  drawBlob(ctx, cx + 8, cy + 16, 4, [150, 220, 255]);
}
function drawDepthLurker(ctx, cx, cy) {              // shy — barely there
  paintEllipse(ctx, cx, cy, 22, 10, [45, 30, 70], 0.3);
  drawBlob(ctx, cx + 14, cy, 3, [120, 150, 210]);
}
function drawBlobFish(ctx, cx, cy) {                 // bumper — droopy, soft, comically slow
  paintEllipse(ctx, cx, cy, 28, 20, [70, 55, 110], 0.4);    // big droopy body, low peak
  paintEllipse(ctx, cx + 14, cy + 10, 9, 6, [90, 70, 130], 0.35); // sagging nose
}
function drawFangtooth(ctx, cx, cy) {                // rare — dark body, bright teeth accent
  paintEllipse(ctx, cx, cy, 20, 13, [90, 20, 25], 0.6);
  drawBlob(ctx, cx + 8, cy + 3, 3, [255, 255, 255]);
  drawBlob(ctx, cx + 14, cy + 3, 3, [255, 255, 255]);
}

// The Trench — ember red/orange family.
function drawVentWorm(ctx, cx, cy) {                 // vertical tube, bright plume tip
  paintEllipse(ctx, cx, cy, 8, 26, [180, 70, 30], 0.7);
  drawBlob(ctx, cx, cy - 22, 7, [255, 150, 60]);
}
function drawBlackSmoker(ctx, cx, cy) {              // shy — smoky, low-alpha, one vent glow
  paintEllipse(ctx, cx, cy, 22, 18, [60, 25, 15], 0.35);
  drawBlob(ctx, cx, cy - 6, 8, [255, 130, 50]);
}
function drawBoulderCrab(ctx, cx, cy) {              // bumper — bulky, low, two stubby claws
  paintEllipse(ctx, cx, cy, 30, 18, [140, 60, 25], 0.55);   // bulky rounded shell
  drawBlob(ctx, cx - 22, cy - 2, 6, [180, 90, 40]);         // stubby claw
  drawBlob(ctx, cx + 22, cy - 2, 6, [180, 90, 40]);         // stubby claw
}
function drawGiantOctopus(ctx, cx, cy) {             // rare — big warm body, four limb accents
  drawBlob(ctx, cx, cy, 30, [230, 90, 40]);
  paintEllipse(ctx, cx, cy, 26, 20, [255, 140, 90], 0.5);
  drawBlob(ctx, cx - 18, cy + 14, 6, [230, 90, 40]);
  drawBlob(ctx, cx + 18, cy + 14, 6, [230, 90, 40]);
  drawBlob(ctx, cx - 10, cy + 22, 5, [230, 90, 40]);
  drawBlob(ctx, cx + 10, cy + 22, 5, [230, 90, 40]);
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
