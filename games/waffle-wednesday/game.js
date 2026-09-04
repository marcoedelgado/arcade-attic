import { crewSpriteEl } from './sprites.js';
import { waffleFrameUrl, waffleFrameFor } from './waffle-sprite.js';
import { scoreServe } from './scoring.js';
import { mulberry32 } from './shift.js';
import { makeDirector } from './director.js';
import { makeMenu } from './menu.js';
import { makeSlot } from './toaster.js';
import { scatter } from './scatter.js';

const BEST_KEY = 'waffle-wednesday:best';
const root = document.getElementById('game');

const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let menu = null;   // the content catalogue — set once in main()
const state = {
  phase: 'title',
  shift: [],
  patienceRaf: 0, patienceStart: 0, patienceMs: 0,
  resolving: false,   // a customer is leaving the counter — hold input until the next one lands
};

// The running shift: index, strikes, score, and the serve/walkout transitions.
// Rebuilt by startShift(); everything below reads it rather than a local counter.
let director = null;
const current = () => director.current();

const TOAST = { SETTLE_MS: 600 };   // marker glide after eject — cosmetic only

let slots = [];   // slot record[]

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

  const glyph = document.createElement('div');
  glyph.className = 'ww-title-glyph';
  glyph.textContent = '🧇';

  const h = document.createElement('h2');
  h.innerHTML = 'Waffle<br>Wednesday';

  const blurb = document.createElement('p');
  blurb.textContent = 'One shift. Twenty customers. Toast it right, top it faster. Three walkouts and it’s a bad Wednesday.';

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'aa-btn ww-start';
  start.textContent = '🧇 Start shift';
  start.addEventListener('click', () => startShift());

  wrap.append(glyph, h, blurb, start);

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

  const shelf = document.createElement('div');
  shelf.className = 'ww-title-shelf';
  shelf.setAttribute('aria-hidden', 'true');
  for (const e of ['🍓', '🍌', '🍫', '🥕', '🍯', '🍦']) {
    const s = document.createElement('span');
    s.textContent = e;
    shelf.appendChild(s);
  }
  wrap.append(shelf);

  root.appendChild(wrap);
}

/* ---------- Toaster slot + doneness meter ----------
   The doneness simulation lives in toaster.js (makeSlot). Here a slot is a
   record { el, sim, forId, incomingFor, fly } — `sim` is a toaster.makeSlot()
   instance while a waffle is in it, or null when the slot is empty. */
function buildSlot() {
  const el = document.createElement('div');
  el.className = 'ww-slot';
  el.dataset.empty = 'true';

  const hint = document.createElement('div');
  hint.className = 'ww-slot-hint';
  hint.textContent = 'empty';

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

  const rec = {
    el, waffleEl: waffle, meterEl: meter, markerEl: marker, bandEl: band, hintEl: hint,
    sim: null, forId: null, incomingFor: null, fly: null,
  };
  el.addEventListener('click', () => onSlotClick(rec));
  return rec;
}

const meterPct = (v) => `${100 - v}%`;   // 0 at the bottom, 100 at the top

function paintSlot(rec) {
  const st = rec.sim?.status();
  if (!st) {
    rec.markerEl.style.top = meterPct(0);
    rec.waffleEl.style.backgroundImage = 'none';
    return;
  }
  rec.markerEl.style.top = meterPct(st.value);
  const [lo, hi] = st.band;
  rec.bandEl.style.top = meterPct(hi);
  rec.bandEl.style.height = `${hi - lo}%`;
  rec.waffleEl.style.backgroundImage = `url("${waffleFrameUrl(waffleFrameFor(st.value))}")`;
}

// One rAF loop drives every toasting slot: step the sim, repaint. A slot that
// crosses the burn line while it's ticking (nobody ejected it) burns in place.
// Ejected slots hold still — their settle glide runs in ejectWaffle.
let toasterRaf = 0;
function toasterLoop(tPrev) {
  return (tNow) => {
    for (const rec of slots) {
      if (rec.sim?.status().phase !== 'toasting') continue;
      rec.sim.tick(tNow - tPrev);
      paintSlot(rec);
      if (rec.sim.status().phase === 'burnt') burntInSlot(rec);
    }
    toasterRaf = requestAnimationFrame(toasterLoop(tNow));
  };
}

// The slot's waffle is burnt (ejected too late, or left to burn on its own).
function burntInSlot(rec) {
  rec.el.querySelector('.ww-steam')?.remove();
  rec.el.classList.add('is-burnt');
  rec.hintEl.textContent = 'burnt!';
}
function startToasterLoop() {
  cancelAnimationFrame(toasterRaf);
  toasterRaf = requestAnimationFrame(toasterLoop(performance.now()));
}
function stopToasterLoop() { cancelAnimationFrame(toasterRaf); }

function dropWaffle(rec, order, customerId) {
  rec.sim = makeSlot(order);
  rec.forId = customerId;
  rec.el.dataset.empty = 'false';
  if (!reduceMotion() && !rec.el.querySelector('.ww-steam')) {
    const steam = document.createElement('div');
    steam.className = 'ww-steam';
    rec.el.appendChild(steam);
  }
  rec.hintEl.textContent = 'tap to eject';
  paintSlot(rec);
}

// Pull the waffle: the sim settles instantly; the marker glide is cosmetic.
function ejectWaffle(rec) {
  const from = rec.sim.status().value;
  const { settled, burnt } = rec.sim.eject();
  rec.el.querySelector('.ww-steam')?.remove();

  const start = performance.now();
  const glide = (now) => {
    const k = Math.min(1, (now - start) / TOAST.SETTLE_MS);
    const shown = from + (settled - from) * k;
    rec.markerEl.style.top = meterPct(shown);
    rec.waffleEl.style.backgroundImage = `url("${waffleFrameUrl(waffleFrameFor(shown))}")`;
    if (k < 1) { requestAnimationFrame(glide); return; }
    if (burnt) burntInSlot(rec);
    else rec.hintEl.textContent = 'plated';
  };
  requestAnimationFrame(glide);

  return { settled, burnt };
}

function resetSlot(rec) {
  rec.sim = null;
  rec.forId = null;
  rec.el.querySelector('.ww-steam')?.remove();
  if (rec.fly) {                       // a carry-in was still in flight — cancel it
    rec.fly.remove();
    rec.fly = null;
    rec.incomingFor = null;
  }
  rec.el.dataset.empty = 'true';
  rec.el.classList.remove('is-burnt', 'is-plated');
  rec.hintEl.textContent = 'empty';
  paintSlot(rec);
}

// A transient waffle that carries between the pile, a slot and the plate.
// Cosmetic only — the real .ww-waffle / .ww-plate-waffle carry the game state.
function flyWaffle(fromEl, toEl, frameId, done, opts = {}) {
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'ww-fly';
  fly.style.backgroundImage = `url("${waffleFrameUrl(frameId)}")`;
  fly.style.left = `${a.left + a.width / 2}px`;
  fly.style.top = `${a.top + a.height / 2}px`;
  document.body.appendChild(fly);
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  const rot = opts.arc ? ' rotate(9deg)' : '';
  requestAnimationFrame(() => {
    fly.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)${rot}`;
  });
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    fly.remove();
    done();
  };
  fly.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 900);   // fallback when transitionend is throttled (background tab)
  return fly;
}

let sayTimer = 0;
function say(text, opts = {}) {
  clearTimeout(sayTimer);
  let el = root.querySelector('.ww-say');
  if (!el) {
    el = document.createElement('div');
    el.className = 'ww-say';
    root.appendChild(el);
  }
  const show = () => {
    el.textContent = text;
    el.classList.add('is-shown');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => el.classList.remove('is-shown'), opts.hold ?? 3400);
  };
  if (opts.delay) {
    el.classList.remove('is-shown');
    sayTimer = setTimeout(show, opts.delay);
  } else {
    show();
  }
}

function confetti() {
  if (reduceMotion()) return;
  const colors = ['#ffd34d', '#ff5d73', '#3ddc97', '#6fb3ff'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'ww-confetti';
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animation = `ww-fall ${1 + Math.random()}s ease-in ${Math.random() * 0.3}s forwards`;
    root.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }
}
/* ---------- Counter + queue ---------- */
function faceEl(customer) {
  if (customer.kind === 'crew') return crewSpriteEl(customer.who, 'ww-sprite');
  const span = document.createElement('span');
  span.className = 'ww-sprite-fallback';
  span.textContent = ['🧑', '👩', '🧔', '👴', '👱', '🧑‍🦱'][customer.id % 6];
  return span;
}

function renderCounter() {
  root.querySelector('.ww-top')?.remove();
  root.querySelector('.ww-serve')?.removeAttribute('disabled');
  const cur = current();
  if (!cur) return;

  const top = document.createElement('div');
  top.className = 'ww-top';

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
  const orderLine = document.createElement('span');
  orderLine.className = 'ww-ticket-order';
  orderLine.textContent = menu.ticketText(cur.order);
  ticket.append(orderLine);
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

  const queue = document.createElement('div');
  queue.className = 'ww-queue';
  const label = document.createElement('div');
  label.className = 'ww-queue-label';
  label.textContent = 'NEXT UP';
  queue.appendChild(label);
  const rail = document.createElement('div');
  rail.className = 'ww-queue-rail';
  director.upcoming(3).forEach((nxt, i) => {
    const f = document.createElement('div');
    f.className = 'ww-queue-face';
    f.style.setProperty('--depth', [0.78, 0.62, 0.5][i]);
    f.append(faceEl(nxt));
    const qt = document.createElement('div');
    qt.className = 'ww-queue-ticket';
    qt.textContent = menu.ticketText(nxt.order);
    f.appendChild(qt);
    rail.appendChild(f);
  });
  queue.appendChild(rail);

  top.append(counter, queue);
  root.appendChild(top);
}

function startPatience() {
  const cur = current();
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
// walkout() and onServe() tell the director a customer left the counter, then
// play the reaction for a beat before resolveStep() shows whatever comes next —
// the director has already advanced, so a late timer has nothing to corrupt.
function walkout() {
  if (state.resolving) return;
  stopPatience();
  const cur = current();
  const step = director.walkout();
  say(menu.line(cur, 'walkout'));
  slots.forEach(resetSlot);
  resetPlate();
  state.resolving = true;
  updateHud();
  setTimeout(() => resolveStep(step), 1400);
}

function resolveStep(step) {
  if (step.done) { endShift(step.done); return; }
  showNextCustomer();
}

function showNextCustomer() {
  state.resolving = false;
  for (const s of slots) {
    if (s.forId != null && s.forId < current().id) resetSlot(s);
  }
  resetPlate();
  renderCounter();
  say(menu.line(current(), 'greet'), { delay: 1800 });
  updateHud();
  startPatience();
  paintPlate();
  syncChips();
}

function ratingFor(score, kind) {
  if (kind === 'bad') return { key: 'badWednesday', title: 'Bad Wednesday' };
  if (score >= 3200) return { key: 'chefsKiss', title: "Chef's kiss" };
  if (score >= 1800) return { key: 'solid', title: 'Solid Wednesday' };
  return { key: 'rough', title: 'Rough Wednesday' };
}

function endShift(kind) {
  stopPatience();
  stopToasterLoop();
  resetPlate();
  slots.forEach(resetSlot);
  state.phase = kind === 'bad' ? 'bad' : 'complete';
  state.resolving = false;

  const tally = director.stats();
  const rating = ratingFor(tally.score, kind);
  saveBest({ score: tally.score, rating: rating.title, perfects: tally.perfects, served: tally.served });

  const roast = menu.roast(rating.key, tally.walkers);   // { text, who }

  const looks = {
    chefsKiss:   { cls: 'is-kiss',  emoji: '👌' },
    solid:       { cls: 'is-solid', emoji: '🧇' },
    rough:       { cls: 'is-rough', emoji: '😕' },
    badWednesday:{ cls: 'is-bad',   emoji: null },
  }[rating.key] ?? { cls: 'is-rough', emoji: '😕' };
  const highlight = tally.strikes > 0 ? 'walked' : 'perfect';

  root.replaceChildren();
  root.classList.toggle('ww-bad', rating.key === 'badWednesday');
  if (rating.key === 'chefsKiss') confetti();

  const card = document.createElement('div');
  card.className = `ww-report ${looks.cls}`;

  const crest = document.createElement('div');
  crest.className = 'ww-report-crest';
  if (looks.emoji) crest.textContent = looks.emoji;
  else crest.innerHTML = '<span></span><span></span><span></span>';

  const h2 = document.createElement('h2');
  h2.innerHTML = rating.title.replace(' ', '<br>');

  const score = document.createElement('div');
  score.className = 'ww-report-score';
  score.textContent = tally.score.toLocaleString();

  const roastEl = document.createElement('div');
  roastEl.className = 'ww-report-roast';
  const roastFace = crewSpriteEl(roast.who, 'ww-report-face');
  roastFace.alt = '';   // decorative — the line names the speaker
  const roastLine = document.createElement('p');
  roastLine.textContent = roast.text;
  roastEl.append(roastFace, roastLine);

  const stats = document.createElement('div');
  stats.className = 'ww-report-stats';
  for (const [label, n] of [['perfect', tally.perfects], ['served', tally.served], ['walked', tally.strikes]]) {
    const cell = document.createElement('div');
    if (label === highlight) cell.className = 'is-lit';
    cell.innerHTML = `<b>${n}</b><span>${label}</span>`;
    stats.appendChild(cell);
  }

  const actions = document.createElement('div');
  actions.className = 'ww-report-actions';
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'aa-btn ww-report-new';
  again.textContent = 'New shift';
  again.addEventListener('click', () => startShift());
  actions.append(again);   // the top-of-page "← The Attic" link covers going back

  card.append(crest, h2, score, roastEl, stats, actions);
  root.appendChild(card);
}

function onSlotClick(rec) {
  if (!rec.sim) return;
  const phase = rec.sim.status().phase;
  if (phase === 'burnt') { resetSlot(rec); return; }   // bin it — free up the slot for a fresh one
  if (phase !== 'toasting') return;                    // already plated, waiting to be served

  const { settled, burnt } = ejectWaffle(rec);   // sim settles now; marker glide runs on
  if (burnt || reduceMotion()) { paintPlate(); return; }
  // once the marker settles, the toasted waffle arcs onto the plate
  setTimeout(() => {
    flyWaffle(rec.waffleEl, root.querySelector('.ww-plate-waffle'), waffleFrameFor(settled), () => {
      rec.el.classList.add('is-plated');
      paintPlate();
    }, { arc: true });
  }, TOAST.SETTLE_MS);
}

// Tap the batter pile to send a fresh waffle to the toaster.
function onStockClick() {
  if (!current()) return;   // shift over — a reaction beat is still playing out
  const rec = slots.find((r) => !r.sim && !r.incomingFor);
  if (!rec) return;   // the toaster is occupied
  const target = current();

  const land = () => {
    rec.fly = null;
    rec.incomingFor = null;
    const cur = current();
    if (!cur || target.id < cur.id) return;   // that customer already left
    dropWaffle(rec, { ...target.order, meterRate: target.ramp.meterRate }, target.id);
  };

  if (reduceMotion()) { land(); return; }
  rec.incomingFor = target.id;
  rec.fly = flyWaffle(root.querySelector('.ww-stock-pile'), rec.el, 'pale', () => {
    if (rec.fly) land();   // still ours — a reset would have cleared it
  });
}

function startShift() {
  state.phase = 'shift';
  root.classList.remove('ww-bad');
  state.resolving = false;
  state.shift = menu.roster(mulberry32(Date.now() >>> 0));
  director = makeDirector(state.shift);
  root.replaceChildren();

  const station = document.createElement('div');
  station.className = 'ww-station';

  const bench = document.createElement('div');
  bench.className = 'ww-bench';

  const stock = document.createElement('div');
  stock.className = 'ww-stock';
  stock.innerHTML = '<div class="ww-stock-pile"><span></span><span></span><span></span></div>';
  stock.addEventListener('click', onStockClick);
  bench.append(stock);

  const toaster = document.createElement('div');
  toaster.className = 'ww-toaster';
  slots = [buildSlot()];
  toaster.append(...slots.map((r) => r.el));
  bench.append(toaster);

  const serve = document.createElement('button');
  serve.type = 'button';
  serve.className = 'aa-btn ww-serve';
  serve.textContent = 'SERVE';
  serve.addEventListener('click', onServe);

  station.append(bench);
  renderStationExtras(bench, station);   // plate-area -> bench, shelf -> station
  station.append(serve);
  root.appendChild(station);

  renderCounter();
  say(menu.line(current(), 'greet'), { delay: 1800 });
  renderHud();
  startToasterLoop();
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
  const s = director.stats();
  hud.querySelector('.ww-hud-cust').textContent = `Customers ${Math.min(s.index + 1, 20)}/20`;
  hud.querySelector('.ww-hud-score').textContent = `${s.score.toLocaleString()}`;
  hud.querySelectorAll('.ww-strikes span').forEach((pip, i) => pip.classList.toggle('is-lit', i < s.strikes));
}

let flashDone = null;
function flash(verdict) {
  if (reduceMotion()) return;
  if (flashDone) root.removeEventListener('animationend', flashDone);   // supersede any in-flight flash
  const cls = `flash-${verdict}`;
  root.classList.remove('flash-perfect', 'flash-good', 'flash-sloppy', 'flash-burnt');
  void root.offsetWidth;
  root.classList.add(cls);
  flashDone = (e) => {
    if (e.target !== root) return;
    root.classList.remove(cls);
    root.removeEventListener('animationend', flashDone);
    flashDone = null;
  };
  root.addEventListener('animationend', flashDone);
}

// Artboard 04b — a translucent receipt over the plate right after serve: a medal
// per category, a recoloured score delta, ~1.8s then it fades. Burnt serves skip
// it (they get the full-screen burnt flash instead — result.stamps is null).
const STAMP_MEDALS = { gold: '🥇', silver: '🥈', bronze: '🥉' };
function serveStamp(result) {
  if (!result.stamps) return;
  const area = root.querySelector('.ww-plate-area');
  if (!area) return;
  area.querySelector('.ww-stamp')?.remove();

  const badges = ['doneness', 'toppings', 'syrup'].map((cat) => {
    const tier = result.stamps[cat];
    const mark = STAMP_MEDALS[tier] ?? '<span class="ww-stamp-x">&times;</span>';
    return `<span class="ww-stamp-badge"><span class="ww-stamp-mark">${mark}</span>`
      + `<span class="ww-stamp-cat">${cat}</span></span>`;
  }).join('');

  const delta = result.points + result.tip;
  const deltaText = result.perfect
    ? `+${result.bonus} perfect`
    : `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`;
  const tone = result.verdict === 'perfect' ? 'perfect'
    : result.verdict === 'sloppy' ? 'rough' : 'plain';

  const el = document.createElement('div');
  el.className = 'ww-stamp';
  el.dataset.tone = tone;
  if (reduceMotion()) el.classList.add('is-still');
  el.innerHTML = `<span class="ww-stamp-badges">${badges}</span>`
    + `<span class="ww-stamp-delta">${deltaText}</span>`;
  area.appendChild(el);

  setTimeout(() => el.classList.add('is-leaving'), 1500);
  setTimeout(() => el.remove(), 1850);
}

function onServe() {
  if (state.resolving) return;
  const cur = current();
  const plated = (r) => r.sim && r.sim.status().phase !== 'toasting';
  const rec = slots.find((r) => r.forId === cur.id && plated(r)) ?? slots.find(plated);
  if (!rec) { say('Toast something first.'); return; }

  state.resolving = true;
  stopPatience();
  root.querySelector('.ww-serve')?.setAttribute('disabled', '');   // no double-serve; shows it registered

  const result = scoreServe({
    doneness: rec.sim.status().settled,
    band: cur.order.band,
    toppings: [...plate.toppings],
    wanted: cur.order.toppings,
    syrupLevel: plate.syrupLevel || null,
    syrupOverflow: plate.syrupOverflow,
    wantedSyrup: cur.order.syrup,
    patienceLeft: patienceLeft(),
  });

  const step = director.serve(result);

  flash(result.verdict);
  serveStamp(result);
  const lineKey = result.verdict === 'perfect' ? 'happy'
    : result.verdict === 'good' ? 'happy'
    : result.verdict === 'sloppy' ? 'meh'
    : 'angry';
  say(menu.line(cur, lineKey));

  resetSlot(rec);
  resetPlate();
  updateHud();

  setTimeout(() => resolveStep(step), 900);
}

/* ---------- Plating ---------- */
function renderStationExtras(bench, station) {
  const area = document.createElement('div');
  area.className = 'ww-plate-area';

  const plateEl = document.createElement('div');
  plateEl.className = 'ww-plate';
  plateEl.dataset.empty = 'true';
  plateEl.innerHTML = '<div class="ww-plate-waffle"><div class="ww-plate-syrup"></div></div>';

  const syrup = document.createElement('div');
  syrup.className = 'ww-syrup';
  syrup.innerHTML = '<span class="ww-syrup-bottle" aria-hidden="true">🍯</span>'
    + '<div class="ww-syrup-gauge"><div class="ww-syrup-gauge-fill"></div></div>';
  syrup.addEventListener('pointerdown', (e) => { e.preventDefault(); pourStart(); });
  syrup.addEventListener('pointerup', pourStop);
  syrup.addEventListener('pointercancel', pourStop);
  syrup.addEventListener('pointerleave', pourStop);
  syrup.addEventListener('contextmenu', (e) => e.preventDefault());   // no press-and-hold menu on the bottle

  area.append(syrup, plateEl);

  const shelf = document.createElement('div');
  shelf.className = 'ww-shelf';
  for (const t of menu.toppings) {
    const chip = document.createElement('div');
    chip.className = 'ww-chip';
    chip.textContent = t.emoji;
    chip.dataset.topping = t.id;
    chip.title = t.label;
    makeChipDraggable(chip, plateEl);
    shelf.appendChild(chip);
  }

  bench.append(area);
  station.append(shelf);
}

function platedSlot() {
  return slots.find((r) => r.sim?.status().phase === 'plated');
}

function paintPlate() {
  const plateEl = root.querySelector('.ww-plate');
  if (!plateEl) return;
  const rec = platedSlot();
  plateEl.dataset.empty = rec ? 'false' : 'true';
  const waffle = plateEl.querySelector('.ww-plate-waffle');
  waffle.style.backgroundImage = rec
    ? `url("${waffleFrameUrl(waffleFrameFor(rec.sim.status().value))}")`
    : 'none';
  waffle.querySelectorAll('.ww-plate-topping').forEach((n) => n.remove());
  const toppings = [...plate.toppings].map((id) => ({ id, emoji: menu.toppingEmoji(id) }));
  for (const pc of scatter(toppings)) {
    const dot = document.createElement('span');
    dot.className = 'ww-plate-topping';
    dot.textContent = pc.emoji;
    const { left, top, transform, fontSize } = pc;
    Object.assign(dot.style, { left, top, transform, fontSize });
    dot.addEventListener('click', () => { plate.toppings.delete(pc.id); syncChips(); paintPlate(); });
    waffle.appendChild(dot);
  }
  waffle.querySelector('.ww-plate-syrup').style.height = `${plate.syrupLevel}%`;
  root.querySelector('.ww-syrup-gauge-fill').style.width = `${plate.syrupLevel}%`;
  plateEl.classList.toggle('is-overflow', plate.syrupOverflow);
}

const HINT_UNTIL = 4;   // green "wanted" chip borders help for the opening tier, then off
function syncChips() {
  const wanted = new Set(current()?.order.toppings ?? []);
  const hint = director.stats().index < HINT_UNTIL;
  root.querySelectorAll('.ww-chip').forEach((c) => {
    c.classList.toggle('is-on', plate.toppings.has(c.dataset.topping));
    c.classList.toggle('is-wanted', hint && wanted.has(c.dataset.topping) && !plate.toppings.has(c.dataset.topping));
  });
}

function makeChipDraggable(chip, plateEl) {
  chip.addEventListener('pointerdown', (e) => {
    if (!platedSlot()) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    const ghost = chip.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    ghost.style.transform = 'translate(-50%, -50%)';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '50';
    document.body.appendChild(ghost);
    chip.classList.add('dragging');
    try { chip.setPointerCapture(pointerId); } catch { /* ignore */ }

    const move = (ev) => { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; };
    let done = false;
    const teardown = (ev) => {
      if (done) return;
      done = true;
      chip.removeEventListener('pointermove', move);
      chip.removeEventListener('pointerup', teardown);
      chip.removeEventListener('pointercancel', teardown);
      window.removeEventListener('pointerup', teardown);
      window.removeEventListener('pointercancel', teardown);
      try { chip.releasePointerCapture(pointerId); } catch { /* already released */ }
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
    chip.addEventListener('pointerup', teardown);
    chip.addEventListener('pointercancel', teardown);
    // backstops in case the captured element never delivers the release
    window.addEventListener('pointerup', teardown);
    window.addEventListener('pointercancel', teardown);
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
    const [crew, customers] = await Promise.all([
      fetch('crew.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('customers.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]);
    menu = makeMenu({ crew, customers });
  } catch {
    root.textContent = 'Could not load the game.';
    return;
  }
  showTitle();
}

main();
