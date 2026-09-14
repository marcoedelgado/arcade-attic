// game.js — wiring only. Owns the DOM, the canvases, the loop and the run state;
// every rule lives in a pure module next door (spec §6).
//
// SKELETON STATUS (spec §8 step 2). The structure below is the real structure,
// but most of what it calls is still a stub that throws. What works today:
//   - the page boots, sizes both canvases, and shows the menu
//   - the backdrop paints for real, through sky.js's 2D fallback
//   - the menu drifts slowly through all four act palettes, so the act colours
//     can be judged in a browser BEFORE the art pass rather than after
// What does not work yet: flying. Pressing Fly says so instead of throwing.

import { makeLoop } from './loop.js';
import { makeSky } from './sky.js';
import { ACTS } from './journey.js';

const host = document.querySelector('.fs-stage-wrap');
const skyCanvas = document.getElementById('sky');
const stage = document.getElementById('stage');
const menu = document.getElementById('fs-menu');
const startBtn = document.getElementById('fs-start');

const ctx = stage.getContext('2d');
const sky = makeSky(skyCanvas);

let vp = { width: host.clientWidth, height: host.clientHeight };

function sizeCanvases() {
  vp = { width: host.clientWidth, height: host.clientHeight };
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  sky.resize(vp.width, vp.height, dpr);
  stage.width = Math.max(1, Math.round(vp.width * dpr));
  stage.height = Math.max(1, Math.round(vp.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---- skeleton-only: drift through the act palettes on the menu ----
// Delete this once the real run loop lands. It exists so the four act colours in
// journey.js can be looked at, together, in a real browser at real size.
const SECONDS_PER_ACT = 4;
let t = 0;

function blendActColours(elapsed) {
  const span = elapsed / SECONDS_PER_ACT;
  const i = Math.floor(span) % ACTS.length;
  const k = span - Math.floor(span);
  const a = ACTS[i].colour;
  const b = ACTS[(i + 1) % ACTS.length].colour;
  return a.map((n, j) => n + (b[j] - n) * k);
}

const loop = makeLoop();

function frame(dt) {
  t += dt;
  sky.paint(blendActColours(t), vp);
  ctx.clearRect(0, 0, vp.width, vp.height);
}

startBtn.addEventListener('click', () => {
  startBtn.textContent = 'Not built yet';
  startBtn.disabled = true;
});

window.addEventListener('resize', sizeCanvases);
sizeCanvases();
menu.hidden = false;
loop.start(frame);

// Renderer actually in use, so a silent fall back to 2D is visible in the console
// rather than mistaken for "the shader looks flat today".
console.log(`[feathered-serpent] sky renderer: ${sky.mode}`);
