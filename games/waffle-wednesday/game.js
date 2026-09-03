import { crewSpriteEl } from './sprites.js';
import { isBurnt, scoreServe } from './scoring.js';
import { rampFor, buildShift } from './shift.js';

const BEST_KEY = 'waffle-wednesday:best';
const root = document.getElementById('game');

const content = { crew: [], toppings: [], names: [], lines: {}, donenessVocab: [], syrupChoices: [], roasts: {} };
const state = { phase: 'title' };

const TOAST = { CARRYOVER: 8, SETTLE_MS: 600 };
const clampDoneness = (n) => Math.max(0, Math.min(100, n));
const settle = (raw) => clampDoneness(raw + TOAST.CARRYOVER);

let slots = [];   // Slot[]

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

/* ---------- Toaster slot + doneness meter ---------- */
function makeSlot() {
  const el = document.createElement('div');
  el.className = 'ww-slot';
  el.dataset.empty = 'true';

  const hint = document.createElement('div');
  hint.className = 'ww-slot-hint';
  hint.textContent = 'tap to toast';

  const waffle = document.createElement('div');
  waffle.className = 'ww-waffle';

  const meter = document.createElement('div');
  meter.className = 'ww-meter';
  const band = document.createElement('div');
  band.className = 'ww-meter-band';
  const marker = document.createElement('div');
  marker.className = 'ww-meter-marker';
  meter.append(band, marker);

  el.append(hint, meter, waffle);

  const slot = {
    el, meterEl: meter, markerEl: marker, bandEl: band, waffleEl: waffle,
    value: 0, cooking: false, raf: 0, rate: 14, forCustomerId: null, order: null,
  };
  el.addEventListener('click', () => onSlotClick(slot));
  return slot;
}

function paintMeter(slot) {
  const pct = (v) => `${100 - v}%`;                 // 0 at bottom, 100 at top
  slot.markerEl.style.top = pct(slot.value);
  if (slot.order) {
    const [lo, hi] = slot.order.band;
    slot.bandEl.style.top = pct(hi);
    slot.bandEl.style.height = `${hi - lo}%`;
  }
  // waffle colour tracks doneness: pale -> golden -> dark
  const v = slot.value;
  const col = v < 50
    ? `hsl(41 55% ${88 - v * 0.5}%)`
    : `hsl(${Math.max(18, 41 - (v - 50) * 0.5)} ${55 + (v - 50) * 0.4}% ${63 - (v - 50) * 0.6}%)`;
  slot.waffleEl.style.setProperty('--waffle-color', col);
}

function tick(slot, tPrev) {
  return (tNow) => {
    if (!slot.cooking) return;
    const dt = (tNow - tPrev) / 1000;
    slot.value = clampDoneness(slot.value + slot.rate * dt);
    paintMeter(slot);
    if (slot.value >= 100) { slot.value = 100; }
    slot.raf = requestAnimationFrame(tick(slot, tNow));
  };
}

function dropWaffle(slot, order, customerId) {
  slot.order = order;
  slot.forCustomerId = customerId;
  slot.value = 0;
  slot.rate = order.meterRate ?? rampFor(customerId ?? 1).meterRate;
  slot.cooking = true;
  slot.el.dataset.empty = 'false';
  slot.el.querySelector('.ww-slot-hint').textContent = 'tap to eject';
  paintMeter(slot);
  slot.raf = requestAnimationFrame(tick(slot, performance.now()));
}

function ejectWaffle(slot) {
  slot.cooking = false;
  cancelAnimationFrame(slot.raf);
  const settled = settle(slot.value);
  const burnt = isBurnt(settled, slot.order.band);
  // animate marker from current value to settled over SETTLE_MS
  const from = slot.value;
  const start = performance.now();
  return new Promise((resolve) => {
    const step = (now) => {
      const k = Math.min(1, (now - start) / TOAST.SETTLE_MS);
      slot.value = from + (settled - from) * k;
      paintMeter(slot);
      if (k < 1) { requestAnimationFrame(step); return; }
      slot.el.querySelector('.ww-slot-hint').textContent = burnt ? 'burnt!' : 'plated';
      if (burnt) { slot.el.classList.add('is-burnt'); }
      resolve({ settled, burnt });
    };
    requestAnimationFrame(step);
  });
}

function resetSlot(slot) {
  slot.cooking = false;
  cancelAnimationFrame(slot.raf);
  slot.value = 0;
  slot.order = null;
  slot.forCustomerId = null;
  slot.el.dataset.empty = 'true';
  slot.el.classList.remove('is-burnt');
  slot.el.querySelector('.ww-slot-hint').textContent = 'tap to toast';
}

/* ---------- Shift (single hardcoded customer — Tasks 8–10 replace this) ---------- */
const HARDCODED_ORDER = { band: [48, 56], toppings: ['blueberry', 'honey'], syrup: null, meterRate: 16 };

function onSlotClick(slot) {
  if (slot.el.dataset.empty === 'true') {
    dropWaffle(slot, HARDCODED_ORDER, 1);
  } else if (slot.cooking) {
    ejectWaffle(slot).then(({ settled, burnt }) => {
      slot._settled = settled;
      slot._burnt = burnt;
    });
  }
}

function startShift() {
  state.phase = 'shift';
  root.replaceChildren();

  const station = document.createElement('div');
  station.className = 'ww-station';
  const toaster = document.createElement('div');
  toaster.className = 'ww-toaster';

  slots = [makeSlot()];
  toaster.append(...slots.map((s) => s.el));

  const serve = document.createElement('button');
  serve.type = 'button';
  serve.className = 'aa-btn';
  serve.textContent = 'SERVE';
  serve.addEventListener('click', () => {
    const slot = slots[0];
    if (slot._settled == null) return;
    const r = scoreServe({
      doneness: slot._settled,
      band: HARDCODED_ORDER.band,
      toppings: [], wanted: HARDCODED_ORDER.toppings,
      syrupLevel: null, wantedSyrup: HARDCODED_ORDER.syrup,
      patienceLeft: 0.5,
    });
    console.log('scoreServe →', r);
    slot._settled = null;
    resetSlot(slot);
  });

  station.append(toaster, serve);
  root.appendChild(station);
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
