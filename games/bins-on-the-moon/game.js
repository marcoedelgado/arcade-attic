import { levelConfig, pickItems, BIN_IDS } from './levels.js';
import { buildScene } from './scene.js';

const PROGRESS_KEY = 'bins-on-the-moon:progress';
const root = document.getElementById('game');

let pool = [];               // loaded from items.json
let scene = null;            // current scene controller
const state = {
  phase: 'title',            // 'title' | 'playing' | 'complete'
  level: 1,
  queue: [],                 // Item[] not yet on the pad
  pad: [],                   // { item, el }[]
  total: 0,
  sorted: 0,
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
  // Item spawning + drag wiring arrive in Task 7.
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
