import { crewSpriteEl } from './sprites.js';
import { isBurnt, scoreServe } from './scoring.js';
import { rampFor, buildShift } from './shift.js';

const BEST_KEY = 'waffle-wednesday:best';
const root = document.getElementById('game');

const content = { crew: [], toppings: [], names: [], lines: {}, donenessVocab: [], syrupChoices: [], roasts: {} };
const state = {
  phase: 'title',
  shift: [], index: 0,
  strikes: 0, score: 0, perfects: 0, served: 0,
  walkers: [],
  patienceRaf: 0, patienceStart: 0, patienceMs: 0,
  resolving: false,
};

const TOAST = { CARRYOVER: 8, SETTLE_MS: 600 };
const clampDoneness = (n) => Math.max(0, Math.min(100, n));
const settle = (raw) => clampDoneness(raw + TOAST.CARRYOVER);

let slots = [];   // Slot[]

let plate = { toppings: new Set(), syrupLevel: 0, syrupOverflow: false };
let pourRaf = 0;
function resetPlate() {
  plate = { toppings: new Set(), syrupLevel: 0, syrupOverflow: false };
  cancelAnimationFrame(pourRaf);
  pourRaf = 0;
}

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
  cancelAnimationFrame(slot.raf);
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
      if (k < 1) { slot.raf = requestAnimationFrame(step); return; }
      slot.el.querySelector('.ww-slot-hint').textContent = burnt ? 'burnt!' : 'plated';
      if (burnt) { slot.el.classList.add('is-burnt'); }
      resolve({ settled, burnt });
    };
    slot.raf = requestAnimationFrame(step);
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
  slot._settled = null;
  slot._burnt = null;
}

/* ---------- Ticket + RNG helpers ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function donenessWord(target) {
  for (const v of content.donenessVocab) if (target <= v.max) return v.word;
  return content.donenessVocab.at(-1).word;
}
function toppingLabel(id) {
  return content.toppings.find((t) => t.id === id)?.label ?? id;
}
function syrupWord(syrup) {
  if (!syrup) return null;
  const match = content.syrupChoices.find((c) => c.target === syrup.target);
  return match?.word ?? 'some syrup';
}
function ticketText(order) {
  const centre = (order.band[0] + order.band[1]) / 2;
  const parts = [`${donenessWord(centre)} waffle`];
  if (order.toppings.length) parts.push(order.toppings.map(toppingLabel).join(', '));
  const sw = syrupWord(order.syrup);
  if (sw) parts.push(sw);
  return parts.join(' · ');
}

function say(text) {
  const el = document.createElement('div');
  el.className = 'ww-say';
  el.textContent = text;
  root.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}
function pickLine(customer, key) {
  const pool = (customer.kind === 'crew' && customer.lines?.[key]?.length)
    ? customer.lines[key]
    : (content.lines[key] ?? ['…']);
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- Counter + queue ---------- */
function faceEl(customer, small = false) {
  if (customer.kind === 'crew') return crewSpriteEl(customer.who, small ? 'ww-sprite' : 'ww-sprite');
  const span = document.createElement('span');
  span.className = 'ww-sprite-fallback';
  span.textContent = ['🧑', '👩', '🧔', '👴', '👱', '🧑‍🦱'][customer.id % 6];
  return span;
}

function renderCounter() {
  root.querySelector('.ww-counter')?.remove();
  root.querySelector('.ww-queue')?.remove();
  const cur = state.shift[state.index];
  if (!cur) return;

  const counter = document.createElement('div');
  counter.className = 'ww-counter';

  const who = document.createElement('div');
  who.className = 'ww-customer';
  who.append(faceEl(cur));
  const name = document.createElement('div');
  name.className = 'ww-customer-name';
  name.textContent = cur.name;
  who.append(name);

  const ticket = document.createElement('div');
  ticket.className = 'ww-ticket';
  ticket.innerHTML = '<h3>Order</h3>';
  ticket.append(document.createTextNode(ticketText(cur.order)));
  if (cur.order.ticketText) {
    const flav = document.createElement('span');
    flav.className = 'ww-ticket-flavour';
    flav.textContent = `“${cur.order.ticketText}”`;
    ticket.append(flav);
  }
  const patience = document.createElement('div');
  patience.className = 'ww-patience';
  patience.innerHTML = '<div class="ww-patience-fill"></div>';
  ticket.append(patience);

  counter.append(who, ticket);
  root.appendChild(counter);

  const queue = document.createElement('div');
  queue.className = 'ww-queue';
  for (let i = 1; i <= 3; i++) {
    const nxt = state.shift[state.index + i];
    if (!nxt) break;
    const f = document.createElement('div');
    f.className = 'ww-queue-face';
    f.append(faceEl(nxt, true));
    queue.appendChild(f);
  }
  root.appendChild(queue);
}

function startPatience() {
  const cur = state.shift[state.index];
  state.patienceMs = cur.ramp.patience * 1000;
  state.patienceStart = performance.now();
  const fill = root.querySelector('.ww-patience-fill');
  const step = (now) => {
    const left = Math.max(0, 1 - (now - state.patienceStart) / state.patienceMs);
    if (fill) {
      fill.style.width = `${left * 100}%`;
      fill.classList.toggle('is-low', left < 0.25);
    }
    if (left <= 0) { walkout(); return; }
    state.patienceRaf = requestAnimationFrame(step);
  };
  state.patienceRaf = requestAnimationFrame(step);
}
function stopPatience() { cancelAnimationFrame(state.patienceRaf); }
function patienceLeft() {
  return Math.max(0, 1 - (performance.now() - state.patienceStart) / state.patienceMs);
}

/* ---------- Shift flow ---------- */
function walkout() {
  stopPatience();
  const cur = state.shift[state.index];
  state.strikes += 1;
  state.walkers.push(cur.name);
  state.score -= 120;
  say(pickLine(cur, 'walkout'));
  slots.forEach(resetSlot);
  state.resolving = false;
  const at = state.index;
  setTimeout(() => {
    if (state.index !== at) return;   // a serve already advanced us
    if (state.strikes >= 3) endShift('bad');
    else nextCustomer();
  }, 1400);
}

function nextCustomer() {
  state.index += 1;
  state.resolving = false;
  if (state.index >= 20) { endShift('complete'); return; }
  for (const s of slots) {
    if (s.forCustomerId != null && s.forCustomerId < state.shift[state.index].id) resetSlot(s);
  }
  resetPlate();
  syncSlotCount();
  renderCounter();
  updateHud();
  startPatience();
  paintPlate();
  syncChips();
}

function syncSlotCount() {
  const want = state.shift[state.index].ramp.slots;
  const toaster = root.querySelector('.ww-toaster');
  while (slots.length < want) {
    const s = makeSlot();
    s.el.classList.add('ww-slot-new');
    s.el.addEventListener('animationend', () => s.el.classList.remove('ww-slot-new'), { once: true });
    slots.push(s);
    toaster.appendChild(s.el);
    say('Second toaster — you can pre-toast for the queue now.');
  }
}

function endShift(kind) {
  stopPatience();
  state.phase = kind === 'bad' ? 'bad' : 'complete';
  console.log(`endShift(${kind})`, { score: state.score, perfects: state.perfects, served: state.served, walkers: state.walkers });
  // Task 12 renders the report card.
}

function onSlotClick(slot) {
  if (slot.el.dataset.empty === 'true') {
    const frontId = state.shift[state.index].id;
    const frontBusy = slots.some((s) => s.forCustomerId === frontId && (s.cooking || s._settled != null));
    const target = frontBusy ? state.shift[state.index + 1] : state.shift[state.index];
    if (!target) return;
    dropWaffle(slot, { ...target.order, meterRate: target.ramp.meterRate }, target.id);
    slot.el.querySelector('.ww-slot-hint').textContent = target.id === frontId ? 'tap to eject' : `for ${target.name}`;
  } else if (slot.cooking) {
    ejectWaffle(slot).then(({ settled, burnt }) => { slot._settled = settled; slot._burnt = burnt; });
  }
}

function startShift() {
  state.phase = 'shift';
  Object.assign(state, { index: 0, strikes: 0, score: 0, perfects: 0, served: 0, walkers: [], resolving: false });
  state.shift = buildShift(
    { crew: content.crew, toppings: content.toppings, names: content.names, syrupChoices: content.syrupChoices },
    mulberry32(Date.now() >>> 0),
  );
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
  serve.addEventListener('click', onServe);
  station.append(toaster, serve);
  renderStationExtras(station);
  root.appendChild(station);

  renderCounter();
  renderHud();
  startPatience();
  resetPlate();
  paintPlate();
  syncChips();
}

function renderHud() {
  root.querySelector('.ww-hud')?.remove();
  const hud = document.createElement('div');
  hud.className = 'ww-hud';
  hud.innerHTML = `
    <span class="ww-hud-cust"></span>
    <span class="ww-hud-score"></span>
    <span class="ww-strikes"><span></span><span></span><span></span></span>`;
  root.appendChild(hud);
  updateHud();
}
function updateHud() {
  const hud = root.querySelector('.ww-hud');
  if (!hud) return;
  hud.querySelector('.ww-hud-cust').textContent = `Cust ${Math.min(state.index + 1, 20)}/20`;
  hud.querySelector('.ww-hud-score').textContent = `${state.score.toLocaleString()}`;
  hud.querySelectorAll('.ww-strikes span').forEach((s, i) => s.classList.toggle('is-lit', i < state.strikes));
}

function flash(verdict) {
  const cls = `flash-${verdict}`;
  root.classList.remove('flash-perfect', 'flash-good', 'flash-sloppy', 'flash-burnt');
  void root.offsetWidth;
  root.classList.add(cls);
  root.addEventListener('animationend', () => root.classList.remove(cls), { once: true });
}

function onServe() {
  if (state.resolving) return;
  const cur = state.shift[state.index];
  const slot = slots.find((s) => s.forCustomerId === cur.id && s._settled != null)
    ?? slots.find((s) => s._settled != null);
  if (!slot) { say('Toast something first.'); return; }

  state.resolving = true;
  stopPatience();

  const result = scoreServe({
    doneness: slot._settled,
    band: cur.order.band,
    toppings: [...plate.toppings],
    wanted: cur.order.toppings,
    syrupLevel: plate.syrupOverflow ? 100 : (plate.syrupLevel || null),
    wantedSyrup: cur.order.syrup,
    patienceLeft: patienceLeft(),
  });

  state.score += result.points + result.tip;
  if (result.perfect) state.perfects += 1;
  state.served += 1;

  flash(result.verdict);
  const lineKey = result.verdict === 'perfect' ? 'happy'
    : result.verdict === 'good' ? 'happy'
    : result.verdict === 'sloppy' ? 'meh'
    : 'angry';
  say(pickLine(cur, lineKey));

  slot._settled = null;
  resetSlot(slot);
  resetPlate();
  updateHud();

  const at = state.index;
  setTimeout(() => {
    if (state.index !== at) return;
    nextCustomer();
  }, 900);
}

/* ---------- Plating ---------- */
function renderStationExtras(station) {
  const area = document.createElement('div');
  area.className = 'ww-plate-area';

  const plateEl = document.createElement('div');
  plateEl.className = 'ww-plate';
  plateEl.dataset.empty = 'true';
  plateEl.innerHTML = '<div class="ww-plate-waffle"></div>';

  const syrup = document.createElement('div');
  syrup.className = 'ww-syrup';
  syrup.innerHTML = '🍯<div class="ww-syrup-gauge"><div class="ww-syrup-gauge-fill"></div></div>';
  syrup.addEventListener('pointerdown', (e) => { e.preventDefault(); pourStart(); });
  syrup.addEventListener('pointerup', pourStop);
  syrup.addEventListener('pointercancel', pourStop);
  syrup.addEventListener('pointerleave', pourStop);

  area.append(syrup, plateEl);

  const shelf = document.createElement('div');
  shelf.className = 'ww-shelf';
  for (const t of content.toppings) {
    const chip = document.createElement('div');
    chip.className = 'ww-chip';
    chip.textContent = t.emoji;
    chip.dataset.topping = t.id;
    chip.title = t.label;
    makeChipDraggable(chip, plateEl);
    shelf.appendChild(chip);
  }

  station.append(area, shelf);
}

function platedSlot() {
  return slots.find((s) => s._settled != null && !s._burnt);
}

function paintPlate() {
  const plateEl = root.querySelector('.ww-plate');
  const slot = platedSlot();
  plateEl.dataset.empty = slot ? 'false' : 'true';
  if (slot) plateEl.querySelector('.ww-plate-waffle').style.setProperty('--plated-color', slot.waffleEl.style.getPropertyValue('--waffle-color'));

  const waffle = plateEl.querySelector('.ww-plate-waffle');
  waffle.querySelectorAll('.ww-plate-topping').forEach((n) => n.remove());
  let i = 0;
  for (const id of plate.toppings) {
    const dot = document.createElement('span');
    dot.className = 'ww-plate-topping';
    dot.textContent = content.toppings.find((t) => t.id === id)?.emoji ?? '';
    dot.style.left = `${30 + (i % 3) * 20}%`;
    dot.style.top = `${30 + Math.floor(i / 3) * 22}%`;
    dot.addEventListener('click', () => { plate.toppings.delete(id); syncChips(); paintPlate(); });
    waffle.appendChild(dot);
    i++;
  }
  root.querySelector('.ww-syrup-gauge-fill').style.width = `${plate.syrupLevel}%`;
  plateEl.classList.toggle('is-overflow', plate.syrupOverflow);
}

function syncChips() {
  root.querySelectorAll('.ww-chip').forEach((c) => {
    c.classList.toggle('is-on', plate.toppings.has(c.dataset.topping));
  });
}

function makeChipDraggable(chip, plateEl) {
  chip.addEventListener('pointerdown', (e) => {
    if (!platedSlot()) return;
    const ghost = chip.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    ghost.style.transform = 'translate(-50%, -50%)';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '50';
    document.body.appendChild(ghost);
    chip.classList.add('dragging');
    try { chip.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    const move = (ev) => { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; };
    const up = (ev) => {
      chip.removeEventListener('pointermove', move);
      chip.removeEventListener('pointerup', up);
      chip.removeEventListener('pointercancel', up);
      chip.classList.remove('dragging');
      ghost.remove();
      const r = plateEl.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (inside && platedSlot()) {
        plate.toppings.add(chip.dataset.topping);
        syncChips();
        paintPlate();
      }
    };
    chip.addEventListener('pointermove', move);
    chip.addEventListener('pointerup', up);
    chip.addEventListener('pointercancel', up);
  });
}

function pourStart() {
  cancelAnimationFrame(pourRaf);
  if (!platedSlot() || plate.syrupOverflow) return;
  let prev = performance.now();
  const step = (now) => {
    plate.syrupLevel = Math.min(100, plate.syrupLevel + 60 * ((now - prev) / 1000));
    prev = now;
    paintPlate();
    if (plate.syrupLevel >= 100) { plate.syrupOverflow = true; paintPlate(); return; }
    pourRaf = requestAnimationFrame(step);
  };
  pourRaf = requestAnimationFrame(step);
}
function pourStop() { cancelAnimationFrame(pourRaf); pourRaf = 0; }

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
