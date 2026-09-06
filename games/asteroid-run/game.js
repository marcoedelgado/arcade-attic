import { makeCamera } from './camera.js';
import { makeRun } from './run.js';
import { makeField } from './field.js';
import { makeShip } from './ship.js';
import { makeLoop } from './loop.js';
import { checkHits } from './collision.js';
import { render, readPalette } from './render.js';
import { drawHud, drawOverlay } from './hud.js';

const BEST_KEY = 'asteroid-run:best';
const host = document.getElementById('game');
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- persistence ---------- */
function loadBest() {
  try {
    const n = parseInt(localStorage.getItem(BEST_KEY), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}
function saveBest(ms) {
  try {
    if (ms > loadBest()) localStorage.setItem(BEST_KEY, String(Math.floor(ms)));
  } catch { /* private mode */ }
}

/* ---------- viewport ---------- */
let vp = { width: host.clientWidth, height: host.clientHeight };
function sizeCanvas() {
  vp.width = host.clientWidth;
  vp.height = host.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = vp.width * dpr;
  canvas.height = vp.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.resize(vp);
  ship.setViewport(vp);
}

/* ---------- world ---------- */
const asteroids = [];
const stars = [];
const debris = [];
const palette = readPalette();

const camera = makeCamera(vp);
const run = makeRun({ reducedMotion: reduceMotion() });
let lastSector = run.advance(0).sector;   // effective sector, cached for the 'dying' branch
const field = makeField({ rng: Math.random, asteroids, stars });
const ship = makeShip({ camera, viewport: vp });
const loop = makeLoop();

let state = 'title';         // 'title' | 'playing' | 'dying' | 'dead'
let runMs = 0;
let dyingMs = 0;
let bannerMs = 0;
let shake = 0;
let sectorName = run.snapshot().sectorName;
let sectorProgress = 0;
let scoreWeight = 1;

const DYING_MS = 1200;

function startRun() {
  asteroids.length = 0;
  debris.length = 0;
  run.reset();
  field.reset();
  ship.reset();
  ship.setViewport(vp);
  runMs = 0;
  bannerMs = 0;
  shake = 0;
  scoreWeight = 1;
  state = 'playing';
  sectorName = run.snapshot().sectorName;
}

function enterDying() {
  state = 'dying';
  dyingMs = DYING_MS;
  shake = 14;
  spawnDebris(ship.worldPos(), 30);
}
function enterDead() {
  state = 'dead';
  saveBest(runMs);
}

function spawnDebris(at, n) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 120;
    debris.push({
      x: at.x, y: at.y, z: at.z,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 60 + Math.random() * 120,
      life: 1,
    });
  }
}
function stepDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    d.life -= dt * 1.4;
    if (d.life <= 0) debris.splice(i, 1);
  }
}

/* ---------- frame ---------- */
function frame(dt) {
  if (state === 'playing') {
    runMs += dt * 1000 * scoreWeight;
    const r = run.advance(dt);
    lastSector = r.sector;
    scoreWeight = 0.8 + (r.sector.speed / 320) * 0.2;
    sectorProgress = r.sectorProgress;
    if (r.justCleared) {
      ship.refillShields();
      sectorName = run.snapshot().sectorName;
      bannerMs = 1500;
    }
    if (bannerMs > 0) bannerMs -= dt * 1000;

    const s = ship.update(dt);
    s.loop = r.loop;
    field.step(dt, r.sector, s);
    stepDebris(dt);

    for (const hit of checkHits(ship.worldPos(), asteroids, camera.project)) {
      const idx = asteroids.indexOf(hit);
      if (idx >= 0) asteroids.splice(idx, 1);
      spawnDebris({ x: hit.x, y: hit.y, z: hit.z }, 12);
      if (ship.hit()) shake = Math.max(shake, 8);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 40);
    if (ship.shields <= 0) enterDying();
  } else if (state === 'dying') {
    dyingMs -= dt * 1000;
    run.advance(dt); // field keeps moving
    field.step(dt, lastSector, { x: 0, y: 0, loop: 0 });
    stepDebris(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 20);
    if (dyingMs <= 0) enterDead();
  } else {
    // title / dead: drift the starfield only
    field.step(dt, { speed: 40, spawnRate: 0, sizeRange: [10, 10], spread: 260, pattern: 'scatter' }, { x: 0, y: 0, loop: 0 });
  }

  // draw
  const shipSnap = ship.update(0);
  shipSnap.blink = ship.invulnerable ? (performance.now() % 1000) / 1000 : 0;
  render(ctx, camera, { asteroids, stars, debris, ship: shipSnap, shake }, { vp, palette, reducedMotion: reduceMotion() });
  if (state === 'playing' || state === 'dying') {
    drawHud(ctx, vp, { timeMs: runMs, shields: ship.shields, sectorName, sectorProgress, bannerMs });
  }
  if (state === 'title') drawOverlay(ctx, vp, { kind: 'title', bestMs: loadBest() });
  if (state === 'dead') drawOverlay(ctx, vp, { kind: 'gameover', runMs, bestMs: loadBest() });
}

/* ---------- input ---------- */
function launchOrRestart() {
  if (state === 'title' || state === 'dead') startRun();
}
function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top, touch: !!e.touches || e.pointerType === 'touch' };
}
canvas.addEventListener('pointerdown', (e) => {
  launchOrRestart();
  const p = pointerPos(e);
  ship.aim(p.x, p.y, p.touch ? 'touch' : 'mouse');
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pressure === 0 && e.pointerType === 'touch') return;
  const p = pointerPos(e);
  if (state === 'playing') ship.aim(p.x, p.y, p.touch ? 'touch' : 'mouse');
});
const keys = { ArrowLeft: 0, ArrowRight: 0, ArrowUp: 0, ArrowDown: 0, a: 0, d: 0, w: 0, s: 0 };
function applyKeys() {
  const x = (keys.ArrowRight || keys.d) - (keys.ArrowLeft || keys.a);
  const y = (keys.ArrowDown || keys.s) - (keys.ArrowUp || keys.w);
  ship.setThrust(Math.sign(x), Math.sign(y));
}
window.addEventListener('keydown', (e) => {
  if (state === 'title' || state === 'dead') { e.preventDefault(); launchOrRestart(); return; }
  if (e.key in keys) { keys[e.key] = 1; applyKeys(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (e.key in keys) { keys[e.key] = 0; applyKeys(); }
});
window.addEventListener('resize', sizeCanvas);

/* ---------- boot ---------- */
field.reset();
sizeCanvas();
try { canvas.focus(); } catch { /* focus can throw in odd embeddings */ }
loop.start(frame);
