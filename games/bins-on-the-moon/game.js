import { levelConfig, pickItems } from './levels.js';
import { buildScene } from './scene.js';
import { binAtPoint, makeDraggable } from './drag.js';

const PROGRESS_KEY = 'bins-on-the-moon:progress';
const root = document.getElementById('game');

let pool = [];               // loaded from items.json
let scene = null;            // current scene controller
const state = {
  phase: 'title',            // 'title' | 'playing' | 'complete'
  level: 1,
  queue: [],                 // Item[] not yet drifting
  pad: [],                   // { item, el, drag, x, y, vx, vy, dragging }[] — items adrift in the play field
  total: 0,
  sorted: 0,
  visible: 0,                // how many items drift at once (set per level)
  reduced: false,            // prefers-reduced-motion — static layout instead of drift
  fieldToken: 0,             // bumped per level so a stale rAF loop stops
};

/* ---------- Persistence ---------- */
function loadProgress() {
  try {
    const n = parseInt(localStorage.getItem(PROGRESS_KEY), 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}
function saveProgress(n) {
  try {
    const next = Math.max(loadProgress(), Math.max(1, Math.floor(n)));
    localStorage.setItem(PROGRESS_KEY, String(next));
  } catch {}
}
function resetProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch {}
}

/* ---------- Title ---------- */
function showTitle() {
  clearIdleTimer();
  state.phase = 'title';
  root.replaceChildren();
  root.classList.add('bm-scene');

  const wrap = document.createElement('div');
  wrap.className = 'bm-title';

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'aa-btn bm-play';
  play.textContent = '🚀';
  play.setAttribute('aria-label', 'Play');
  play.addEventListener('click', () => startLevel(loadProgress()));

  const over = document.createElement('button');
  over.type = 'button';
  over.className = 'bm-startover';
  over.textContent = '↺';
  over.setAttribute('aria-label', 'Start from the beginning');
  over.addEventListener('click', () => { resetProgress(); startLevel(1); });

  wrap.append(play);
  root.appendChild(wrap);
  root.appendChild(over);   // pinned to a scene corner, out of the centered flow (for a parent)
}

/* ---------- Level ---------- */
function reducedMotion() {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function startLevel(n) {
  state.phase = 'playing';
  state.level = Math.max(1, Math.floor(n));
  const cfg = levelConfig(state.level);
  state.queue = pickItems(pool, cfg.bins, cfg.count);
  state.pad = [];
  state.total = cfg.count;
  state.sorted = 0;
  state.visible = cfg.visible;
  state.reduced = reducedMotion();

  scene = buildScene(root, cfg.bins);
  scene.setProgress(0, state.total);

  for (let i = 0; i < state.visible; i++) spawnNext();
  if (state.reduced) {
    layoutStatic();
  } else {
    state.fieldToken = (state.fieldToken || 0) + 1;
    runField(state.fieldToken);
  }
}

let idleTimer = null;

function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}
function startIdleTimer() {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    const oldest = state.pad[0];
    if (state.phase === 'playing' && oldest) {
      scene.pulseBin(oldest.item.bin);
      scene.arcTo(oldest.item.bin, oldest.el);
      startIdleTimer();
    }
  }, 5000);
}

/* ---------- Drifting items ---------- */
function randAngle() {
  let a;
  do { a = Math.random() * Math.PI * 2; }
  while (Math.abs(Math.sin(a)) < 0.35 || Math.abs(Math.cos(a)) < 0.35);
  return a;
}

function giveVelocity(entry) {
  const speed = 16 + Math.random() * 10;   // px/sec — gentle
  const a = randAngle();
  entry.vx = Math.cos(a) * speed;
  entry.vy = Math.sin(a) * speed;
}

function measure(entry) {
  entry.w = entry.el.offsetWidth || entry.w || 64;
  entry.h = entry.el.offsetHeight || entry.h || 64;
}

function positionEntry(entry) {
  entry.el.style.left = `${Math.round(entry.x)}px`;
  entry.el.style.top = `${Math.round(entry.y)}px`;
}

function clampEntry(entry) {
  const b = scene.playBounds();
  measure(entry);
  entry.x = Math.max(b.left, Math.min(entry.x, b.right - entry.w));
  entry.y = Math.max(b.top, Math.min(entry.y, b.bottom - entry.h));
}

function placeEntry(entry) {
  const b = scene.playBounds();
  measure(entry);
  const { w, h } = entry;
  const spanX = Math.max(1, b.right - b.left - w);
  const spanY = Math.max(1, b.bottom - b.top - h);
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = b.left + Math.random() * spanX;
    const y = b.top + Math.random() * spanY;
    const clear = state.pad.every((e) =>
      e === entry || Math.hypot(e.x - x, e.y - y) > w * 1.15);
    if (clear || attempt === 11) { entry.x = x; entry.y = y; break; }
  }
  positionEntry(entry);
}

// Bake the drag transform into the item's position, then clear it.
function bakePosition(entry) {
  const t = getComputedStyle(entry.el).transform;
  const m = t && t !== 'none' ? new DOMMatrixReadOnly(t) : new DOMMatrixReadOnly();
  entry.x += m.m41;
  entry.y += m.m42;
  entry.el.style.transform = '';
  clampEntry(entry);
  positionEntry(entry);
}

function releaseIntoField(entry) {
  bakePosition(entry);
  giveVelocity(entry);
  entry.dragging = false;
}

function runField(token) {
  let last = performance.now();
  const step = (now) => {
    if (state.fieldToken !== token || state.phase !== 'playing') return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;

    // Reads first, then writes — one layout flush per frame.
    const b = scene.playBounds();
    for (const e of state.pad) measure(e);

    for (const e of state.pad) {
      if (e.dragging) continue;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.x <= b.left)          { e.x = b.left;          e.vx = Math.abs(e.vx); }
      if (e.x >= b.right - e.w)   { e.x = b.right - e.w;   e.vx = -Math.abs(e.vx); }
      if (e.y <= b.top)           { e.y = b.top;           e.vy = Math.abs(e.vy); }
      if (e.y >= b.bottom - e.h)  { e.y = b.bottom - e.h;  e.vy = -Math.abs(e.vy); }
      positionEntry(e);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Reduced-motion fallback: a tidy centred, wrapping row — no drifting.
function layoutStatic() {
  if (!state.pad.length) return;
  const b = scene.playBounds();
  const fieldW = b.right - b.left;
  state.pad.forEach(measure);
  const { w, h } = state.pad[0];
  const gap = 16;
  const perRow = Math.max(1, Math.floor((fieldW + gap) / (w + gap)));
  state.pad.forEach((e, i) => {
    const row = Math.floor(i / perRow);
    const rowCount = Math.min(perRow, state.pad.length - row * perRow);
    const rowW = rowCount * w + (rowCount - 1) * gap;
    e.x = b.left + (fieldW - rowW) / 2 + (i % perRow) * (w + gap);
    e.y = b.top + 24 + row * (h + gap);
    e.el.style.transform = '';
    positionEntry(e);
  });
}

function spawnNext() {
  if (state.queue.length === 0) return;
  const item = state.queue.shift();

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'bm-item';
  el.textContent = item.emoji;
  el.setAttribute('aria-label', item.name);

  const entry = { item, el, drag: null, x: 0, y: 0, vx: 0, vy: 0, w: 64, h: 64, dragging: false };
  entry.drag = makeDraggable(el, {
    onGrab: () => { entry.dragging = true; clearIdleTimer(); },
    onDrop: (point) => handleDrop(entry, point),
  });

  state.pad.push(entry);
  scene.padEl.appendChild(el);

  placeEntry(entry);
  giveVelocity(entry);
  if (state.reduced) layoutStatic();

  startIdleTimer();
}

function handleDrop(entry, point) {
  const hit = binAtPoint(point, scene.binRects());
  if (hit === entry.item.bin) { onCorrect(entry); return true; }
  if (hit !== null) {
    onWrong(entry, entry.item.bin);             // manages its own idle timer
  } else {
    if (state.reduced) { entry.el.style.transform = ''; layoutStatic(); entry.dragging = false; }
    else releaseIntoField(entry);
    startIdleTimer();
  }
  return true;                                   // game fully owns item placement
}

function onCorrect(entry) {
  entry.drag.destroy();
  clearIdleTimer();
  state.pad = state.pad.filter((e) => e !== entry);
  state.sorted += 1;

  const reduce = state.reduced;
  const bin = scene.binEls.get(entry.item.bin);
  let done = false;
  let fallback = null;
  const finish = () => {
    if (done) return;
    done = true;
    if (fallback) { clearTimeout(fallback); fallback = null; }
    entry.el.removeEventListener('transitionend', finish);
    entry.el.remove();
    scene.setProgress(state.sorted, state.total);
    scene.wiggleBin(entry.item.bin);
    scene.spawnSparkle(entry.item.bin);
    scene.setMascot('cheer');
    setTimeout(() => scene.setMascot('idle'), 900);
    spawnNext();
    checkLevelDone();
  };

  if (reduce || !bin) { finish(); return; }

  // The item still carries the drag transform, which is measured from its
  // layout box (its drift position), so fold the current translate back into
  // the delta — otherwise it's computed from the dragged position but applied
  // from the box and the item slides back instead of into the bin.
  const t = getComputedStyle(entry.el).transform;
  const m = t && t !== 'none' ? new DOMMatrixReadOnly(t) : new DOMMatrixReadOnly();
  const a = entry.el.getBoundingClientRect();
  const b = bin.getBoundingClientRect();
  const dx = m.m41 + (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = m.m42 + (b.top + b.height / 2) - (a.top + a.height / 2);
  entry.el.style.zIndex = '20';   // stay above the bins/mascot while flying in
  entry.el.style.transition = 'transform 0.28s ease-in, opacity 0.28s ease-in';
  entry.el.style.transform = `translate(${dx}px, ${dy}px) scale(0.2)`;
  entry.el.style.opacity = '0';
  entry.el.addEventListener('transitionend', finish);
  fallback = setTimeout(finish, 450);
}

function onWrong(entry, correctBinId) {
  bakePosition(entry);            // drop the drag transform; entry.dragging stays true (frozen for the shake)

  scene.setMascot('oops');
  setTimeout(() => scene.setMascot('idle'), 900);
  scene.pulseBin(correctBinId);
  scene.arcTo(correctBinId, entry.el);

  entry.el.classList.remove('bm-shake');
  void entry.el.offsetWidth;
  entry.el.classList.add('bm-shake');
  let shakeCleared = false;
  let shakeFallback = null;
  const clearShake = () => {
    if (shakeCleared) return;
    shakeCleared = true;
    if (shakeFallback) clearTimeout(shakeFallback);
    entry.el.removeEventListener('animationend', clearShake);
    entry.el.classList.remove('bm-shake');
    if (state.reduced) { layoutStatic(); }
    else { giveVelocity(entry); }
    entry.dragging = false;       // resume drifting
  };
  entry.el.addEventListener('animationend', clearShake, { once: true });
  shakeFallback = setTimeout(clearShake, 600);   // fallback: `animation: none` never fires animationend
  startIdleTimer();
}

function checkLevelDone() {
  if (state.queue.length === 0 && state.pad.length === 0) {
    showLevelComplete();
  }
}

function showLevelComplete() {
  if (state.phase === 'complete') return;
  clearIdleTimer();
  state.phase = 'complete';
  scene.celebrate();

  const overlay = document.createElement('div');
  overlay.className = 'bm-complete';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'aa-btn bm-next';
  next.textContent = '→';
  next.setAttribute('aria-label', 'Next level');
  next.addEventListener('click', () => {
    saveProgress(state.level + 1);
    startLevel(state.level + 1);
  });

  overlay.appendChild(next);
  root.appendChild(overlay);
}

/* ---------- Boot ---------- */
async function main() {
  try {
    const res = await fetch('items.json', { cache: 'no-cache' });
    pool = (await res.json()).items;
  } catch (err) {
    root.textContent = 'Could not load the game.';
    return;
  }
  showTitle();
}

main();
