import { levelConfig, pickItems, BIN_IDS } from './levels.js';
import { buildScene } from './scene.js';
import { binAtPoint, makeDraggable } from './drag.js';

const PROGRESS_KEY = 'bins-on-the-moon:progress';
const root = document.getElementById('game');

let pool = [];               // loaded from items.json
let scene = null;            // current scene controller
const state = {
  phase: 'title',            // 'title' | 'playing' | 'complete'
  level: 1,
  queue: [],                 // Item[] not yet on the pad
  pad: [],                   // { item, el, drag }[]
  total: 0,
  sorted: 0,
  visible: 0,                // how many items sit on the pad at once (set per level)
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
  try { localStorage.setItem(PROGRESS_KEY, String(Math.max(1, Math.floor(n)))); } catch {}
}
function resetProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch {}
}

/* ---------- Title ---------- */
function showTitle() {
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

  wrap.append(play, over);
  root.appendChild(wrap);
}

/* ---------- Level ---------- */
function startLevel(n) {
  state.phase = 'playing';
  state.level = Math.max(1, Math.floor(n));
  const cfg = levelConfig(state.level);
  state.queue = pickItems(pool, cfg.bins, cfg.count);
  state.pad = [];
  state.total = cfg.count;
  state.sorted = 0;

  scene = buildScene(root, cfg.bins);
  scene.setProgress(0, state.total);
  state.visible = cfg.visible;
  for (let i = 0; i < state.visible; i++) spawnNext();
}

function spawnNext() {
  if (state.queue.length === 0) return;
  const item = state.queue.shift();

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'bm-item';
  el.textContent = item.emoji;
  el.setAttribute('aria-label', item.name);
  el.style.animationDelay = `${(state.pad.length * 0.4).toFixed(2)}s`;

  const entry = { item, el, drag: null };
  entry.drag = makeDraggable(el, {
    onGrab: () => { el.style.animationPlayState = 'paused'; },
    onDrop: (point) => handleDrop(entry, point),
    onReturn: () => { el.style.animationPlayState = ''; },
  });

  state.pad.push(entry);
  scene.padEl.appendChild(el);
}

function handleDrop(entry, point) {
  const hit = binAtPoint(point, scene.binRects());
  if (hit === null) return false;               // dropped on no bin → snap back, no penalty
  if (hit === entry.item.bin) { onCorrect(entry); return true; }
  onWrong(entry, entry.item.bin);
  return false;                                  // wrong bin → snap back
}

function onCorrect(entry) {
  entry.drag.destroy();
  entry.el.remove();
  state.pad = state.pad.filter((e) => e !== entry);
  state.sorted += 1;
  scene.setProgress(state.sorted, state.total);
  spawnNext();
  checkLevelDone();
}

function onWrong(entry, correctBinId) {
  // Visual feedback (bin pulse, arc, mascot) is added in Task 9.
  scene.setMascot('oops');
  setTimeout(() => scene.setMascot('idle'), 900);
}

function checkLevelDone() {
  if (state.queue.length === 0 && state.pad.length === 0) {
    // Level-complete screen is added in Task 8; for now, log.
    console.log(`level ${state.level} complete`);
  }
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
