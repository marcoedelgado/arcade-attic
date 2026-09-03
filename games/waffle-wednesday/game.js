import { crewSpriteEl } from './sprites.js';

const BEST_KEY = 'waffle-wednesday:best';
const root = document.getElementById('game');

const content = { crew: [], toppings: [], names: [], lines: {}, donenessVocab: [], syrupChoices: [], roasts: {} };
const state = { phase: 'title' };

/* ---------- Persistence ---------- */
function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    return typeof rec?.score === 'number' ? rec : null;
  } catch {
    return null;
  }
}
function saveBest(record) {
  try {
    const prev = loadBest();
    if (!prev || record.score > prev.score) {
      localStorage.setItem(BEST_KEY, JSON.stringify(record));
    }
  } catch { /* private mode — ignore */ }
}
function resetBest() {
  try { localStorage.removeItem(BEST_KEY); } catch { /* ignore */ }
}

/* ---------- Title ---------- */
function showTitle() {
  state.phase = 'title';
  root.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'ww-title';

  const h = document.createElement('h2');
  h.textContent = 'Waffle Wednesday';

  const blurb = document.createElement('p');
  blurb.textContent = 'One shift. Twenty customers. Toast it right, top it faster. Three walkouts and it’s a bad Wednesday.';

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'aa-btn ww-start';
  start.textContent = '🧇 Start shift';
  start.addEventListener('click', () => startShift());

  wrap.append(h, blurb, start);

  const best = loadBest();
  if (best) {
    const b = document.createElement('div');
    b.className = 'ww-best';
    b.textContent = `Best Wednesday: ${best.score.toLocaleString()} · "${best.rating}"`;
    wrap.appendChild(b);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ww-reset';
    reset.textContent = 'reset best';
    reset.addEventListener('click', () => { resetBest(); showTitle(); });
    wrap.appendChild(reset);
  }

  root.appendChild(wrap);
}

/* ---------- Shift (built out in later tasks) ---------- */
function startShift() {
  state.phase = 'shift';
  root.replaceChildren();
  const placeholder = document.createElement('p');
  placeholder.style.padding = '24px';
  placeholder.textContent = 'Shift starting…';
  root.appendChild(placeholder);
  // Task 7+ replaces this with the real shift.
}

/* ---------- Boot ---------- */
async function main() {
  try {
    const [crew, cust] = await Promise.all([
      fetch('crew.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('customers.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]);
    content.crew = crew.crew;
    content.toppings = cust.toppings;
    content.names = cust.names;
    content.lines = cust.lines;
    content.donenessVocab = cust.donenessVocab;
    content.syrupChoices = cust.syrupChoices;
    content.roasts = cust.roasts;
  } catch {
    root.textContent = 'Could not load the game.';
    return;
  }
  showTitle();
}

main();
