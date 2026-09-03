# Waffle Wednesday Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-shift waffle-counter arcade game (toast to the right doneness, match toppings, serve 20 customers, 3 walkouts ends it) as a self-contained game in the `arcade-attic` collection, with the Waffle Wednesday crew as recurring regulars.

**Architecture:** Two pure ES modules — `scoring.js` (`scoreServe`) and `shift.js` (`rampFor`, `buildShift`) — hold all the testable logic and are covered by `node --test`. Content lives in `crew.json` and `customers.json`. `crew-sprites.js` is generated once from the `world-cup-sweepstake` headshots by `scripts/pixelate-crew.py` and committed as plain data (no binaries). `sprites.js` paints that pixel data to an `<img>`. `game.js` is the state machine and owns all gameplay DOM. `game.css` is the game's full stylesheet. No build step, no framework, no runtime dependencies — consistent with the rest of the repo.

**Tech Stack:** Vanilla ES modules, Pointer Events, `<canvas>` (sprite rasterisation only), CSS animations, `localStorage`, `node --test` (built in, no runner/deps). One-off tooling: Python 3 + Pillow (dev-time only, not a project dependency).

**Spec:** `.scratch/waffle-wednesday/spec.md`

## Global Constraints

- **No build step, no frameworks, no runtime dependencies.** Plain `.html` / `.css` / `.js` served as-is.
- **All paths relative** — never leading-slash. The game page references shared assets as `../../assets/...`.
- **Reuse the shared shell:** `../../assets/styles.css` provides design tokens (`--panel`, `--panel-bright`, `--edge`, `--ink`, `--ink-dim`, `--neon`, `--neon-pink`, `--neon-green`, `--neon-blue`, `--shadow`, `--font-display`, `--font-body`, `--radius`), the `.aa-game` wrapper, `.aa-game-top`, `.aa-back`, `.aa-game-title`, `.aa-btn`.
- **Slug is `waffle-wednesday`.** Folder `games/waffle-wednesday/`. Title "Waffle Wednesday". Emoji 🧇.
- **Fixed shift of 20 customers.** No endless mode. **3 walkouts → "a bad Wednesday"**, shift ends early.
- **Doneness scale is 0–100** everywhere (`0` raw, `~50` golden, `~80` dark, `≥92` burnt).
- **Six crew ids, exactly these strings:** `marriott`, `pitt`, `nash`, `marco`, `james`, `groves`.
- **`shift.js` and `scoring.js` are pure** — no `window`, no `document`, no `fetch`. They take data and an injectable `rng` as arguments. `game.js` loads the JSON and passes it in.
- **Draggable elements set `touch-action: none`** so the browser does not treat the drag as a scroll.
- **Respect `prefers-reduced-motion: reduce`** — the doneness meter still animates (it is the mechanic); decorative motion (steam, customer bob, confetti, gold flash) becomes instant state changes.
- **Only persisted value:** `localStorage['waffle-wednesday:best']` = `JSON.stringify({ score, rating, perfects, served })`, written on shift end only if `score` beats the stored value. All access wrapped in `try`/`catch`.
- **Node ≥ 20** for `node --test` (dev machine has v24).
- **Commit messages** end with the two trailer lines used elsewhere in this repo:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Uk7R5q3eCSwhfuCHS6ReUH
  ```
  (Per-task commit commands below show the short `-m` form; append the trailer to each.)

---

## File Structure

| File | Responsibility |
| --- | --- |
| `games/waffle-wednesday/index.html` | Page shell: shared `.aa-game` chrome + `<div id="game" class="ww">` |
| `games/waffle-wednesday/scoring.js` | **Pure.** `isBurnt(doneness, band)`, `scoreServe(input)` |
| `games/waffle-wednesday/shift.js` | **Pure.** `rampFor(index)`, `buildShift(data, rng)` |
| `games/waffle-wednesday/crew.json` | 6 regulars: `id`, `name`, `vibe`, `order`, `lines` |
| `games/waffle-wednesday/customers.json` | `toppings` catalogue, generic `names`, line pools, `donenessVocab` |
| `games/waffle-wednesday/crew-sprites.js` | **Generated.** `export const CREW_SPRITES` — 28×28 indexed pixel portraits |
| `games/waffle-wednesday/sprites.js` | `spriteDataUrl(id)`, `crewSpriteEl(id, cls)` — rasterise pixel data to an `<img>` (DOM) |
| `games/waffle-wednesday/game.js` | State machine: title → shift → shiftComplete / badWednesday; toaster, queue, toppings, syrup, scoring wiring, persistence |
| `games/waffle-wednesday/game.css` | Everything visual for this game + `prefers-reduced-motion` block |
| `scripts/pixelate-crew.py` | One-off: regenerate `crew-sprites.js` from the sweepstake headshots (needs Pillow) |
| `tests/waffle-wednesday.test.mjs` | `node --test` suite: `scoring.js`, `shift.js`, both JSON files, `crew-sprites.js` shape |
| `games.json` | **Modify** — append the game's metadata entry |

**Deviation from the spec's file list:** the spec folds sprite rasterisation into `game.js`. This plan splits it into `sprites.js` (one clear job: pixel data → `<img>`), keeping `game.js` focused on game state. Everything else matches the spec.

---

## Task 1: `scoring.js` — `isBurnt` and `scoreServe`

**Files:**
- Create: `games/waffle-wednesday/scoring.js`
- Create: `tests/waffle-wednesday.test.mjs`

**Interfaces:**
- Produces:
  - `export function isBurnt(doneness, band)` → `boolean`. `true` when `doneness >= 92` **or** `doneness > band[1] + 15`.
  - `export function scoreServe(input)` → `{ points: number, tip: number, perfect: boolean, verdict: 'perfect' | 'good' | 'sloppy' | 'burnt' }`.
    - `input = { doneness, band: [lo, hi], toppings: string[], wanted: string[], syrupLevel: number|null, wantedSyrup: {target, tolerance}|null, patienceLeft: number }`.
    - `patienceLeft` is a `0..1` fraction. `toppings`/`wanted` are topping **id** strings; order does not matter, duplicates ignored.
    - On burnt: returns `{ points: -80, tip: 0, perfect: false, verdict: 'burnt' }` and ignores toppings/syrup.
    - `tip` is `0` when burnt; otherwise `round(clamp01(patienceLeft) * 100)`.

- [ ] **Step 1: Write the failing test**

Create `tests/waffle-wednesday.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBurnt, scoreServe } from '../games/waffle-wednesday/scoring.js';

const base = {
  doneness: 50,
  band: [40, 60],
  toppings: [],
  wanted: [],
  syrupLevel: null,
  wantedSyrup: null,
  patienceLeft: 0,
};

test('isBurnt: past the hard threshold', () => {
  assert.equal(isBurnt(92, [40, 60]), true);
  assert.equal(isBurnt(95, [80, 90]), true);
});

test('isBurnt: too far past the top of the band', () => {
  assert.equal(isBurnt(80, [40, 60]), true);   // 80 > 60 + 15
  assert.equal(isBurnt(74, [40, 60]), false);  // 74 <= 60 + 15
});

test('scoreServe: burnt short-circuits everything', () => {
  const r = scoreServe({ ...base, doneness: 95, toppings: ['x'], wanted: ['x'] });
  assert.equal(r.verdict, 'burnt');
  assert.equal(r.points, -80);
  assert.equal(r.tip, 0);
  assert.equal(r.perfect, false);
});

test('scoreServe: doneness at band centre beats doneness at band edge', () => {
  const centre = scoreServe({ ...base, doneness: 50 }).points;
  const edge = scoreServe({ ...base, doneness: 60 }).points;
  assert.ok(centre > edge, `centre ${centre} should beat edge ${edge}`);
});

test('scoreServe: doneness outside the band gives only the flat partial', () => {
  const r = scoreServe({ ...base, doneness: 20 });
  // 20 (out of band) + 40 (syrup correctly none) = 60
  assert.equal(r.points, 60);
  assert.equal(r.perfect, false);
});

test('scoreServe: each correct topping adds, each wrong/missing subtracts', () => {
  const good = scoreServe({ ...base, toppings: ['a', 'b'], wanted: ['a', 'b'] });
  const missing = scoreServe({ ...base, toppings: ['a'], wanted: ['a', 'b'] });
  const extra = scoreServe({ ...base, toppings: ['a', 'b', 'c'], wanted: ['a', 'b'] });
  assert.equal(good.points - missing.points, 55);   // +30 vs -25
  assert.equal(good.points - extra.points, 55);
});

test('scoreServe: syrup within tolerance credits, outside penalises', () => {
  const ok = scoreServe({ ...base, syrupLevel: 52, wantedSyrup: { target: 50, tolerance: 15 } });
  const off = scoreServe({ ...base, syrupLevel: 90, wantedSyrup: { target: 50, tolerance: 15 } });
  assert.equal(ok.points - off.points, 80);          // +40 vs -40
});

test('scoreServe: pouring syrup on an order that did not want it penalises', () => {
  const clean = scoreServe({ ...base });
  const messy = scoreServe({ ...base, syrupLevel: 40 });
  assert.equal(clean.points - messy.points, 80);
});

test('scoreServe: perfect serve adds the +150 bonus and verdict "perfect"', () => {
  const r = scoreServe({
    ...base,
    doneness: 50,
    toppings: ['a', 'b'],
    wanted: ['a', 'b'],
    syrupLevel: 50,
    wantedSyrup: { target: 50, tolerance: 15 },
    patienceLeft: 1,
  });
  assert.equal(r.perfect, true);
  assert.equal(r.verdict, 'perfect');
  // 100 (centre) + 60 (2 toppings) + 40 (syrup) + 150 (bonus) = 350
  assert.equal(r.points, 350);
  assert.equal(r.tip, 100);
});

test('scoreServe: tip scales with patienceLeft and is 0 when burnt', () => {
  assert.equal(scoreServe({ ...base, patienceLeft: 0.5 }).tip, 50);
  assert.equal(scoreServe({ ...base, patienceLeft: 0.2 }).tip, 20);
  assert.equal(scoreServe({ ...base, doneness: 99, patienceLeft: 1 }).tip, 0);
});

test('scoreServe: verdict is "good" above the threshold, else "sloppy"', () => {
  const good = scoreServe({ ...base, doneness: 50, toppings: ['a'], wanted: ['a'] });
  assert.equal(good.verdict, 'good');   // 100 + 30 + 40 = 170 >= 120
  const sloppy = scoreServe({ ...base, doneness: 15, toppings: [], wanted: ['a'] });
  assert.equal(sloppy.verdict, 'sloppy'); // 20 - 25 + 40 = 35
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/waffle-wednesday.test.mjs`
Expected: FAIL — `Cannot find module '.../scoring.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `games/waffle-wednesday/scoring.js`:

```js
// scoring.js — pure. No DOM, no fetch. Imported by game.js and the test suite.
// Every constant here is TUNABLE — playtesting will move these numbers.

const T = {
  BURN_THRESHOLD: 92,
  BURN_OVER: 15,
  IN_BAND_BASE: 60,
  IN_BAND_SPAN: 40,
  OUT_OF_BAND: 20,
  BURN_PENALTY: -80,
  TOPPING_OK: 30,
  TOPPING_BAD: -25,   // applied per missing AND per unwanted topping
  SYRUP_OK: 40,
  SYRUP_BAD: -40,
  SYRUP_NEGLIGIBLE: 5,
  PERFECT_BONUS: 150,
  TIP_MAX: 100,
  GOOD_THRESHOLD: 120,
};

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

export function isBurnt(doneness, band) {
  return doneness >= T.BURN_THRESHOLD || doneness > band[1] + T.BURN_OVER;
}

export function scoreServe(input) {
  const {
    doneness,
    band,
    toppings = [],
    wanted = [],
    syrupLevel = null,
    wantedSyrup = null,
    patienceLeft = 0,
  } = input;

  if (isBurnt(doneness, band)) {
    return { points: T.BURN_PENALTY, tip: 0, perfect: false, verdict: 'burnt' };
  }

  let points = 0;
  const [lo, hi] = band;

  // --- Doneness ---
  const inBand = doneness >= lo && doneness <= hi;
  if (inBand) {
    const centre = (lo + hi) / 2;
    const half = (hi - lo) / 2 || 1;
    const closeness = 1 - Math.abs(doneness - centre) / half; // 0..1
    points += T.IN_BAND_BASE + T.IN_BAND_SPAN * closeness;
  } else {
    points += T.OUT_OF_BAND;
  }

  // --- Toppings (set comparison, order/dupes ignored) ---
  const wantedSet = new Set(wanted);
  const gotSet = new Set(toppings);
  let toppingsOk = true;
  for (const w of wantedSet) {
    if (gotSet.has(w)) points += T.TOPPING_OK;
    else { points += T.TOPPING_BAD; toppingsOk = false; }
  }
  for (const g of gotSet) {
    if (!wantedSet.has(g)) { points += T.TOPPING_BAD; toppingsOk = false; }
  }

  // --- Syrup ---
  const poured = syrupLevel ?? 0;
  let syrupOk;
  if (wantedSyrup) {
    syrupOk = Math.abs(poured - wantedSyrup.target) <= wantedSyrup.tolerance;
  } else {
    syrupOk = poured < T.SYRUP_NEGLIGIBLE;
  }
  points += syrupOk ? T.SYRUP_OK : T.SYRUP_BAD;

  // --- Perfect ---
  const perfect = inBand && toppingsOk && syrupOk;
  if (perfect) points += T.PERFECT_BONUS;

  points = Math.round(points);
  const tip = Math.round(clamp01(patienceLeft) * T.TIP_MAX);

  let verdict;
  if (perfect) verdict = 'perfect';
  else if (points >= T.GOOD_THRESHOLD) verdict = 'good';
  else verdict = 'sloppy';

  return { points, tip, perfect, verdict };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/waffle-wednesday.test.mjs`
Expected: PASS (all `scoring` tests, 0 failures).

- [ ] **Step 5: Commit**

```bash
git add games/waffle-wednesday/scoring.js tests/waffle-wednesday.test.mjs
git commit -m "feat(waffle-wednesday): serve scoring (doneness, toppings, syrup, tips)"
```

---

## Task 2: `shift.js` — `rampFor` and `buildShift`

**Files:**
- Create: `games/waffle-wednesday/shift.js`
- Modify: `tests/waffle-wednesday.test.mjs`

**Interfaces:**
- Produces:
  - `export function rampFor(index)` → `{ bandWidth, meterRate, toppingCount: [min, max], syrupChance, slots, patience }`. `index` clamped to `1..20`.
  - `export function buildShift(data, rng = Math.random)` → `Customer[]` of length 20.
    - `data = { crew: CrewMember[], toppings: {id,...}[], names: string[], syrupChoices: {target,tolerance}[] }`.
    - `Customer = { id: 1..20, kind: 'crew'|'generic', who: string|null, name: string, order: Order, ramp: Ramp, lines?: object }`.
    - `Order = { band: [lo, hi], toppings: string[], syrup: {target,tolerance}|null, ticketText: string|null }`.
    - Rules: slots 1–2 are always `generic`; each crew id appears exactly once in slots 3–20; no two adjacent customers are both `crew`; deterministic for a given `rng`.

- [ ] **Step 1: Write the failing test**

Append to `tests/waffle-wednesday.test.mjs`:

```js
import { rampFor, buildShift } from '../games/waffle-wednesday/shift.js';

// mulberry32 — deterministic PRNG for tests
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIX = {
  crew: ['marriott', 'pitt', 'nash', 'marco', 'james', 'groves'].map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    vibe: 'test',
    order: { band: [45, 55], toppings: ['strawberry'], syrup: null, ticketText: 'the usual' },
    lines: { greet: ['hi'], happy: ['ta'], walkout: ['bye'] },
  })),
  toppings: ['strawberry', 'banana', 'blueberry', 'chocolate', 'honey', 'cream', 'nuts', 'sprinkles'].map((id) => ({ id, emoji: '•' })),
  names: ['Sam', 'Alex', 'Jo', 'Kai', 'Ree', 'Max', 'Lou', 'Bex', 'Ola', 'Ade'],
  syrupChoices: [{ target: 50, tolerance: 15 }, { target: 95, tolerance: 20 }],
};

test('rampFor: clamps and never eases across a boundary', () => {
  assert.equal(rampFor(0).slots, rampFor(1).slots);
  assert.equal(rampFor(999).slots, rampFor(20).slots);
  let prev = rampFor(1);
  for (let n = 2; n <= 20; n++) {
    const r = rampFor(n);
    assert.ok(r.bandWidth <= prev.bandWidth, `band width grew at ${n}`);
    assert.ok(r.slots >= prev.slots, `slots dropped at ${n}`);
    assert.ok(r.patience <= prev.patience, `patience grew at ${n}`);
    assert.ok(r.meterRate >= prev.meterRate, `meter slowed at ${n}`);
    prev = r;
  }
});

test('rampFor: second toaster slot appears at customer 10', () => {
  assert.equal(rampFor(9).slots, 1);
  assert.equal(rampFor(10).slots, 2);
});

test('buildShift: always 20 customers, ids 1..20 in order', () => {
  const s = buildShift(FIX, seeded(1));
  assert.equal(s.length, 20);
  s.forEach((c, i) => assert.equal(c.id, i + 1));
});

test('buildShift: slots 1 and 2 are always generic', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = buildShift(FIX, seeded(seed));
    assert.equal(s[0].kind, 'generic');
    assert.equal(s[1].kind, 'generic');
  }
});

test('buildShift: each crew id appears exactly once', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = buildShift(FIX, seeded(seed));
    const crewIds = s.filter((c) => c.kind === 'crew').map((c) => c.who).sort();
    assert.deepEqual(crewIds, ['groves', 'james', 'marco', 'marriott', 'nash', 'pitt']);
  }
});

test('buildShift: no two adjacent customers are both crew', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = buildShift(FIX, seeded(seed));
    for (let i = 1; i < s.length; i++) {
      assert.ok(!(s[i].kind === 'crew' && s[i - 1].kind === 'crew'), `seed ${seed}: adjacent crew at ${i}`);
    }
  }
});

test('buildShift: deterministic for a given rng seed', () => {
  assert.deepEqual(buildShift(FIX, seeded(7)), buildShift(FIX, seeded(7)));
});

test('buildShift: crew keep their signature order; ramp still comes from the slot', () => {
  const s = buildShift(FIX, seeded(3));
  const groves = s.find((c) => c.who === 'groves');
  assert.deepEqual(groves.order.band, [45, 55]);          // from the fixture crew order
  assert.deepEqual(groves.ramp, rampFor(groves.id));      // ramp is the slot's
});

test('buildShift: generic orders only use catalogue toppings, within the ramp count', () => {
  const ids = new Set(FIX.toppings.map((t) => t.id));
  const s = buildShift(FIX, seeded(11));
  for (const c of s.filter((x) => x.kind === 'generic')) {
    const [min, max] = c.ramp.toppingCount;
    assert.ok(c.order.toppings.length >= min && c.order.toppings.length <= max);
    for (const t of c.order.toppings) assert.ok(ids.has(t), `unknown topping ${t}`);
    assert.equal(new Set(c.order.toppings).size, c.order.toppings.length, 'duplicate topping');
    const [lo, hi] = c.order.band;
    assert.ok(lo >= 0 && hi <= 100 && lo < hi);
    assert.equal(hi - lo, c.ramp.bandWidth);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/waffle-wednesday.test.mjs`
Expected: FAIL — cannot find `shift.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `games/waffle-wednesday/shift.js`:

```js
// shift.js — pure. No DOM, no fetch. Takes content + an injectable rng.

export function rampFor(index) {
  const n = Math.max(1, Math.min(20, Math.floor(Number(index) || 1)));
  if (n <= 4)  return { bandWidth: 25, meterRate: 14, toppingCount: [1, 1], syrupChance: 0,    slots: 1, patience: 22 };
  if (n <= 9)  return { bandWidth: 18, meterRate: 18, toppingCount: [1, 2], syrupChance: 0.30, slots: 1, patience: 18 };
  if (n <= 14) return { bandWidth: 14, meterRate: 22, toppingCount: [2, 3], syrupChance: 0.50, slots: 2, patience: 15 };
  return         { bandWidth: 10, meterRate: 27, toppingCount: [3, 4], syrupChance: 0.50, slots: 2, patience: 12 };
}

// Fisher-Yates using rng; returns a new array.
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// k distinct integers from [0, n).
function sampleDistinct(n, k, rng) {
  const pool = Array.from({ length: n }, (_, i) => i);
  return shuffle(pool, rng).slice(0, k);
}

// Choose `k` non-adjacent slots from the 18 positions 3..20.
// Standard bijection: choose k from [0, 18-k+1), sort, then p_i = c_i + i.
function placeCrew(k, rng) {
  const M = 18;
  const chosen = sampleDistinct(M - k + 1, k, rng).sort((a, b) => a - b);
  return chosen.map((c, i) => 3 + c + i); // slot numbers in 3..20, gaps >= 2
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function makeGenericOrder(ramp, toppings, syrupChoices, rng) {
  const width = ramp.bandWidth;
  const half = width / 2;
  // centre kept in [20, 79] so the band never needs clamping
  const centre = 20 + Math.floor(rng() * 60);
  const band = [Math.round(centre - half), Math.round(centre - half) + width];

  const [min, max] = ramp.toppingCount;
  const count = Math.min(min + Math.floor(rng() * (max - min + 1)), toppings.length);
  const chosen = sampleDistinct(toppings.length, count, rng).map((i) => toppings[i].id);

  const syrup = rng() < ramp.syrupChance ? pick(syrupChoices, rng) : null;

  return { band, toppings: chosen, syrup, ticketText: null };
}

export function buildShift(data, rng = Math.random) {
  const { crew, toppings, names, syrupChoices } = data;

  const slots = placeCrew(crew.length, rng);
  const crewShuffled = shuffle(crew, rng);
  const bySlot = new Map(slots.map((slot, i) => [slot, crewShuffled[i]]));

  const customers = [];
  for (let n = 1; n <= 20; n++) {
    const ramp = rampFor(n);
    const member = bySlot.get(n);
    if (member) {
      customers.push({
        id: n,
        kind: 'crew',
        who: member.id,
        name: member.name,
        order: {
          band: member.order.band.slice(),
          toppings: member.order.toppings.slice(),
          syrup: member.order.syrup ? { ...member.order.syrup } : null,
          ticketText: member.order.ticketText ?? null,
        },
        ramp,
        lines: member.lines,
      });
    } else {
      customers.push({
        id: n,
        kind: 'generic',
        who: null,
        name: pick(names, rng),
        order: makeGenericOrder(ramp, toppings, syrupChoices, rng),
        ramp,
      });
    }
  }
  return customers;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/waffle-wednesday.test.mjs`
Expected: PASS (all `scoring` + `shift` tests).

- [ ] **Step 5: Commit**

```bash
git add games/waffle-wednesday/shift.js tests/waffle-wednesday.test.mjs
git commit -m "feat(waffle-wednesday): shift builder and difficulty ramp"
```

---

## Task 3: `crew.json` + `customers.json` + validation test

**Files:**
- Create: `games/waffle-wednesday/crew.json`
- Create: `games/waffle-wednesday/customers.json`
- Modify: `tests/waffle-wednesday.test.mjs`

**Interfaces:**
- Consumes: `rampFor`, `buildShift` from Tasks 1–2 (the test feeds the real files through `buildShift`).
- Produces:
  - `crew.json`: `{ "crew": [ { id, name, vibe, order: { band:[lo,hi], toppings:[id], syrup:{target,tolerance}|null, ticketText }, lines: { greet:[], happy:[], meh:[], angry:[], walkout:[] } } ] }` — exactly the 6 ids.
  - `customers.json`: `{ "toppings": [ { id, emoji, label } ], "names": [string], "lines": { greet:[], happy:[], meh:[], angry:[], walkout:[] }, "donenessVocab": [ { max:number, word:string } ], "syrupChoices": [ { target, tolerance, word } ], "roasts": { chefsKiss:[], solid:[], rough:[], badWednesday:[] } }`.
  - Every topping id referenced by any crew order exists in the `customers.json` catalogue.

- [ ] **Step 1: Write the failing test**

Append to `tests/waffle-wednesday.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readJson = (rel) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

test('customers.json: valid catalogue, names, vocab', () => {
  const c = readJson('../games/waffle-wednesday/customers.json');
  assert.ok(Array.isArray(c.toppings) && c.toppings.length >= 6);
  const ids = new Set();
  for (const t of c.toppings) {
    assert.equal(typeof t.id, 'string');
    assert.ok(t.emoji.length > 0);
    assert.ok(t.label.length > 0);
    assert.ok(!ids.has(t.id), `duplicate topping id ${t.id}`);
    ids.add(t.id);
  }
  assert.ok(c.names.length >= 8);
  for (const k of ['greet', 'happy', 'meh', 'angry', 'walkout']) {
    assert.ok(Array.isArray(c.lines[k]) && c.lines[k].length >= 2, `lines.${k}`);
  }
  assert.ok(c.donenessVocab.at(-1).max >= 100);
  assert.ok(c.syrupChoices.length >= 2);
  for (const r of ['chefsKiss', 'solid', 'rough', 'badWednesday']) {
    assert.ok(Array.isArray(c.roasts[r]) && c.roasts[r].length >= 1, `roasts.${r}`);
  }
});

test('crew.json: the six regulars with well-formed signature orders', () => {
  const { crew } = readJson('../games/waffle-wednesday/crew.json');
  const catalogue = new Set(readJson('../games/waffle-wednesday/customers.json').toppings.map((t) => t.id));
  const ids = crew.map((m) => m.id).sort();
  assert.deepEqual(ids, ['groves', 'james', 'marco', 'marriott', 'nash', 'pitt']);
  for (const m of crew) {
    const [lo, hi] = m.order.band;
    assert.ok(lo >= 0 && hi <= 100 && lo < hi, `${m.id} band`);
    for (const t of m.order.toppings) assert.ok(catalogue.has(t), `${m.id}: unknown topping ${t}`);
    if (m.order.syrup) {
      assert.equal(typeof m.order.syrup.target, 'number');
      assert.equal(typeof m.order.syrup.tolerance, 'number');
    }
    assert.ok(m.order.ticketText.length > 0, `${m.id} ticketText`);
    for (const k of ['greet', 'happy', 'walkout']) {
      assert.ok(Array.isArray(m.lines[k]) && m.lines[k].length >= 1, `${m.id}.lines.${k}`);
    }
  }
});

test('buildShift accepts the real content files', () => {
  const { crew } = readJson('../games/waffle-wednesday/crew.json');
  const cust = readJson('../games/waffle-wednesday/customers.json');
  const data = { crew, toppings: cust.toppings, names: cust.names, syrupChoices: cust.syrupChoices };
  const s = buildShift(data, seeded(42));
  assert.equal(s.length, 20);
  assert.equal(new Set(s.filter((c) => c.kind === 'crew').map((c) => c.who)).size, 6);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/waffle-wednesday.test.mjs`
Expected: FAIL — `ENOENT` on `crew.json` / `customers.json`.

- [ ] **Step 3: Create `customers.json`**

Create `games/waffle-wednesday/customers.json`:

```json
{
  "toppings": [
    { "id": "strawberry", "emoji": "🍓", "label": "strawberries" },
    { "id": "banana", "emoji": "🍌", "label": "banana" },
    { "id": "blueberry", "emoji": "🫐", "label": "blueberries" },
    { "id": "chocolate", "emoji": "🍫", "label": "chocolate chips" },
    { "id": "nuts", "emoji": "🥜", "label": "crushed nuts" },
    { "id": "cream", "emoji": "🍦", "label": "squirty cream" },
    { "id": "honey", "emoji": "🍯", "label": "honey drizzle" },
    { "id": "sprinkles", "emoji": "✨", "label": "sprinkles" },
    { "id": "cherry", "emoji": "🍒", "label": "a cherry on top" },
    { "id": "bacon", "emoji": "🥓", "label": "bacon" }
  ],
  "names": [
    "Sam", "Alex", "Jo", "Priya", "Kai", "Danny", "Ola", "Bex",
    "Tom", "Ruth", "Marcus", "Lena", "Fitz", "Nadia", "Coop", "Wes"
  ],
  "lines": {
    "greet": [
      "Morning. Waffle. Go.",
      "Same as always, cheers.",
      "Surprise me. Actually don't.",
      "I've got four minutes.",
      "Make it a good one."
    ],
    "happy": [
      "Oh that's the stuff.",
      "Perfect, genuinely.",
      "You've done it again.",
      "Worth the wait."
    ],
    "meh": [
      "It'll do.",
      "Bit off but I'm hungry.",
      "Not your best.",
      "Hmm. Fine."
    ],
    "angry": [
      "That's not what I asked for.",
      "Did you even read the ticket?",
      "I'm not paying full price for this.",
      "Waffle crimes."
    ],
    "walkout": [
      "Forget it, I'm going to Greggs.",
      "Life's too short. Bye.",
      "I waited long enough.",
      "Right, that's me done."
    ]
  },
  "donenessVocab": [
    { "max": 18, "word": "raw" },
    { "max": 34, "word": "pale" },
    { "max": 48, "word": "just golden" },
    { "max": 62, "word": "golden" },
    { "max": 76, "word": "well done" },
    { "max": 90, "word": "dark" },
    { "max": 101, "word": "practically charcoal" }
  ],
  "syrupChoices": [
    { "target": 25, "tolerance": 12, "word": "a trickle" },
    { "target": 50, "tolerance": 15, "word": "half a bottle" },
    { "target": 95, "tolerance": 20, "word": "drown it" }
  ],
  "roasts": {
    "chefsKiss": [
      "{who} declares it the best Wednesday on record. Chef's kiss.",
      "{who}: 'I have no notes. Terrifying.'"
    ],
    "solid": [
      "{who} nods slowly. 'Respectable shift. Nobody cried.'",
      "{who}: 'Solid. Not legendary. Solid.'"
    ],
    "rough": [
      "{who} winces. 'We've all had worse Wednesdays. Barely.'",
      "{who}: 'The waffles were fine. The vibes were not.'"
    ],
    "badWednesday": [
      "{who} reads out the names of the fallen: {walkers}. Never forget.",
      "{who}: '{walkers} walked. On a Wednesday. Shameful.'"
    ]
  }
}
```

- [ ] **Step 4: Create `crew.json`**

Create `games/waffle-wednesday/crew.json` (signature orders per the spec; tune later):

```json
{
  "crew": [
    {
      "id": "marriott",
      "name": "Marriott",
      "vibe": "Everyone's punchbag. Lowest-stakes order in the game.",
      "order": {
        "band": [42, 62],
        "toppings": ["banana"],
        "syrup": null,
        "ticketText": "Whatever's easiest. Yes, I'm still paying."
      },
      "lines": {
        "greet": ["Go easy on me.", "The usual disappointment, please."],
        "happy": ["That's... actually fine?", "I'll take the win."],
        "meh": ["Sounds about right for me.", "Par for the course."],
        "angry": ["Even the waffle's against me.", "Of course. Of course it is."],
        "walkout": ["Story of my life.", "I'll just... not eat then."]
      }
    },
    {
      "id": "pitt",
      "name": "Pitt",
      "vibe": "Wants it pale. Fussy about any browning whatsoever.",
      "order": {
        "band": [20, 34],
        "toppings": ["honey"],
        "syrup": null,
        "ticketText": "Pale. I said PALE. Barely toasted."
      },
      "lines": {
        "greet": ["Keep it light. Lighter than that.", "No colour. None."],
        "happy": ["Now THAT is a pale waffle.", "Flawless. Barely cooked."],
        "meh": ["Bit dark round the edges.", "I can see grill marks. Concerning."],
        "angry": ["This is BROWN. I asked for pale.", "Are you trying to upset me?"],
        "walkout": ["I'll toast my own at home. Correctly.", "Unbelievable."]
      }
    },
    {
      "id": "nash",
      "name": "Nash",
      "vibe": "Hyper-precise. Narrowest doneness band in the game. Tuts.",
      "order": {
        "band": [48, 56],
        "toppings": ["blueberry", "honey"],
        "syrup": null,
        "ticketText": "Golden. Actual golden. Two toppings, no more."
      },
      "lines": {
        "greet": ["I've modelled the optimal waffle. Match it.", "Precision, please."],
        "happy": ["Within tolerance. Excellent.", "The data is satisfied."],
        "meh": ["Marginal. I'll allow it.", "Outside one sigma but inside two."],
        "angry": ["That is nowhere near the target.", "*tuts audibly*"],
        "walkout": ["I'm logging this.", "The spreadsheet will remember."]
      }
    },
    {
      "id": "marco",
      "name": "Marco",
      "vibe": "Orders in invented words you decode from context.",
      "order": {
        "band": [40, 60],
        "toppings": ["strawberry", "cream"],
        "syrup": { "target": 50, "tolerance": 15 },
        "ticketText": "Un waffito, not too oscuro, con las fresas y the white fluffy. Medium syrupation."
      },
      "lines": {
        "greet": ["Hazme el desayuno, pero make it pretty.", "You know what I want. Probably."],
        "happy": ["Perfectamente. Chef's beso.", "This is a waffle of the highest calidad."],
        "meh": ["Está... okay-ish. Regular tirando a meh.", "Not your obra maestra."],
        "angry": ["Esto no es lo que dije! I clearly said fresas!", "Disaster. Un desastre total."],
        "walkout": ["Me voy. With great disappointment.", "I take my business elsewhere, amigo."]
      }
    },
    {
      "id": "james",
      "name": "James",
      "vibe": "Kid at heart. Wants absurd amounts of everything.",
      "order": {
        "band": [45, 70],
        "toppings": ["strawberry", "chocolate", "sprinkles", "cream"],
        "syrup": { "target": 95, "tolerance": 20 },
        "ticketText": "Everything. All of it. Then more syrup. Then a cherry I didn't ask about."
      },
      "lines": {
        "greet": ["Load it up. LOAD IT.", "Can you fit more on? Try."],
        "happy": ["YES. This is a birthday every day.", "Absolute unit of a waffle."],
        "meh": ["Could be taller.", "Where's the rest of the sprinkles?"],
        "angry": ["That's a SENSIBLE waffle. I hate it.", "Not nearly enough chocolate."],
        "walkout": ["I'll go somewhere fun.", "Boo. BOO."]
      }
    },
    {
      "id": "groves",
      "name": "Groves",
      "vibe": "Shows up rough. Wants it burnt. Hardest regular.",
      "order": {
        "band": [82, 95],
        "toppings": ["bacon", "chocolate", "banana"],
        "syrup": { "target": 95, "tolerance": 20 },
        "ticketText": "Cremate it. Bacon, chocolate, banana — don't ask. Drown it in syrup."
      },
      "lines": {
        "greet": ["Big night. Make it hurt.", "Burn it. More than that."],
        "happy": ["Now THAT'S a hangover killer.", "You beautiful, reckless cook."],
        "meh": ["Needs to be darker. And greasier.", "I've had worse. Recently."],
        "angry": ["This is barely toasted. I asked for CHARCOAL.", "Where's my bacon??"],
        "walkout": ["I'm going back to bed.", "Nah. I'll suffer at home."]
      }
    }
  ]
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/waffle-wednesday.test.mjs`
Expected: PASS.

Note: `groves.order.band` top is `95` and `isBurnt` triggers at `>= 92` — that is intentional: Groves genuinely wants a waffle that is *almost* burnt, and the 82–95 band with a hard burn line at 92 means the top of his band overlaps the burn zone. During Task 10 verification, confirm a doneness of ~88 for Groves scores as "good" and ~93 flips to "burnt". If playtesting finds this impossible, narrow his band to `[80, 90]` in `crew.json` — no code change.

- [ ] **Step 6: Commit**

```bash
git add games/waffle-wednesday/crew.json games/waffle-wednesday/customers.json tests/waffle-wednesday.test.mjs
git commit -m "feat(waffle-wednesday): crew and customer content files"
```

---

## Task 4: `scripts/pixelate-crew.py` + generated `crew-sprites.js`

**Files:**
- Create: `scripts/pixelate-crew.py`
- Create: `games/waffle-wednesday/crew-sprites.js` (by running the script)
- Modify: `tests/waffle-wednesday.test.mjs`

**Interfaces:**
- Produces: `export const CREW_SPRITES` — an object keyed by the 6 crew ids. Each value is `{ w: 28, h: 28, palette: string[] (<=16 "#rrggbb"), pixels: string (784 hex digits, each indexing palette) }`.

- [ ] **Step 1: Write the failing test**

Append to `tests/waffle-wednesday.test.mjs`:

```js
test('crew-sprites.js: six well-formed 28x28 indexed sprites', async () => {
  const { CREW_SPRITES } = await import('../games/waffle-wednesday/crew-sprites.js');
  const ids = Object.keys(CREW_SPRITES).sort();
  assert.deepEqual(ids, ['groves', 'james', 'marco', 'marriott', 'nash', 'pitt']);
  for (const [id, sp] of Object.entries(CREW_SPRITES)) {
    assert.equal(sp.w, 28, `${id} width`);
    assert.equal(sp.h, 28, `${id} height`);
    assert.ok(sp.palette.length >= 2 && sp.palette.length <= 16, `${id} palette size`);
    assert.ok(sp.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c)), `${id} palette hex`);
    assert.equal(sp.pixels.length, 28 * 28, `${id} pixel count`);
    assert.ok(/^[0-9a-f]+$/i.test(sp.pixels), `${id} pixel chars`);
    for (const ch of sp.pixels) {
      assert.ok(parseInt(ch, 16) < sp.palette.length, `${id} index out of range`);
    }
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/waffle-wednesday.test.mjs`
Expected: FAIL — cannot find `crew-sprites.js`.

- [ ] **Step 3: Write the script**

Create `scripts/pixelate-crew.py`:

```python
#!/usr/bin/env python3
"""One-off: regenerate games/waffle-wednesday/crew-sprites.js from the
world-cup-sweepstake headshots.

Requires Pillow — a DEV-TIME tool only, NOT a project dependency:
    python -m pip install Pillow

Run from the arcade-attic repo root:
    python scripts/pixelate-crew.py

Re-run only when the source photos change.
"""
from pathlib import Path
import json

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT.parent / "world-cup-sweepstake" / "data" / "owners"
OUT = ROOT / "games" / "waffle-wednesday" / "crew-sprites.js"

CREW = ["marriott", "pitt", "nash", "marco", "james", "groves"]
SIZE = 28
COLORS = 16


def make_sprite(path: Path) -> dict:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.resize((SIZE, SIZE), Image.NEAREST)
    img = img.quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT)

    raw = img.getpalette()[: COLORS * 3]
    palette = ["#%02x%02x%02x" % (raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw), 3)]
    # trim palette to the highest index actually used
    idx = list(img.getdata())
    used = max(idx) + 1
    palette = palette[:used]
    pixels = "".join("%x" % v for v in idx)
    return {"w": SIZE, "h": SIZE, "palette": palette, "pixels": pixels}


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit(f"source headshots not found at {SRC}")
    sprites = {name: make_sprite(SRC / f"{name}.jpg") for name in CREW}
    body = ",\n  ".join(f"{k}: {json.dumps(v)}" for k, v in sprites.items())
    OUT.write_text(
        "// GENERATED by scripts/pixelate-crew.py — do not hand-edit.\n"
        "// 28x28 indexed-colour pixel portraits of the Waffle Wednesday crew,\n"
        "// derived from world-cup-sweepstake/data/owners/*.jpg.\n"
        "export const CREW_SPRITES = {\n  " + body + ",\n};\n",
        encoding="utf8",
    )
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the script**

```bash
python -m pip install Pillow
python scripts/pixelate-crew.py
```

Expected: prints `wrote games/waffle-wednesday/crew-sprites.js (...)`. Open the file and confirm it has 6 keys and the header comment.

If `python` is not on PATH, try `py -3` (Windows launcher). If Pillow will not install, the fallback is spec option B (six 48×48 PNGs) — but do not switch without checking back with the repo owner.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/waffle-wednesday.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/pixelate-crew.py games/waffle-wednesday/crew-sprites.js tests/waffle-wednesday.test.mjs
git commit -m "feat(waffle-wednesday): pixel-portrait sprites for the crew"
```

---

## Task 5: `sprites.js` — rasterise pixel data to an `<img>`

**Files:**
- Create: `games/waffle-wednesday/sprites.js`

**Interfaces:**
- Consumes: `CREW_SPRITES` from `crew-sprites.js`.
- Produces:
  - `export function spriteDataUrl(id)` → a `data:image/png` URL string, or `null` if `id` is unknown. Memoised.
  - `export function crewSpriteEl(id, cls = 'ww-sprite')` → an `<img>` element (48×48 CSS px, `image-rendering: pixelated`), `alt` set to the id. Falls back to an empty `<span class="ww-sprite ww-sprite-fallback">` if `id` is unknown.

This module is DOM-only and cannot be unit-tested under `node --test`; it is verified in the browser in Task 6.

- [ ] **Step 1: Write `sprites.js`**

Create `games/waffle-wednesday/sprites.js`:

```js
// sprites.js — turn CREW_SPRITES indexed pixel data into <img> elements.
// DOM-only; verified in the browser, not in node --test.
import { CREW_SPRITES } from './crew-sprites.js';

const urlCache = new Map();

export function spriteDataUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const sp = CREW_SPRITES[id];
  if (!sp) return null;

  const canvas = document.createElement('canvas');
  canvas.width = sp.w;
  canvas.height = sp.h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(sp.w, sp.h);

  const rgb = sp.palette.map((hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);

  for (let i = 0; i < sp.pixels.length; i++) {
    const [r, g, b] = rgb[parseInt(sp.pixels[i], 16)] ?? [0, 0, 0];
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const url = canvas.toDataURL('image/png');
  urlCache.set(id, url);
  return url;
}

export function crewSpriteEl(id, cls = 'ww-sprite') {
  const url = spriteDataUrl(id);
  if (!url) {
    const span = document.createElement('span');
    span.className = `${cls} ww-sprite-fallback`;
    span.textContent = '🧑';
    return span;
  }
  const el = document.createElement('img');
  el.className = cls;
  el.width = 48;
  el.height = 48;
  el.alt = id;
  el.src = url;
  return el;
}
```

- [ ] **Step 2: Commit**

```bash
git add games/waffle-wednesday/sprites.js
git commit -m "feat(waffle-wednesday): sprite rasteriser"
```

---

## Task 6: Page shell + title screen + best-score persistence

**Files:**
- Create: `games/waffle-wednesday/index.html`
- Create: `games/waffle-wednesday/game.css`
- Create: `games/waffle-wednesday/game.js`

**Interfaces:**
- Consumes: `crewSpriteEl` from `sprites.js`.
- Produces (module-internal in `game.js`, no exports — this is the entry point):
  - `loadBest()` → `{ score, rating, perfects, served } | null` / `saveBest(record)` / `resetBest()` — all wrapped in try/catch around `localStorage['waffle-wednesday:best']`.
  - `showTitle()` — renders the title screen into `#game`.
  - `state` object with at least `{ phase }` where `phase ∈ 'title' | 'shift' | 'complete' | 'bad'`.

- [ ] **Step 1: Create the page shell**

Create `games/waffle-wednesday/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Waffle Wednesday · Arcade Attic</title>
  <link rel="icon" href="../../assets/favicon.svg">
  <link rel="stylesheet" href="../../assets/styles.css">
  <link rel="stylesheet" href="game.css">
</head>
<body>
  <main class="aa-game">
    <div class="aa-game-top">
      <a class="aa-back" href="../../">← The Attic</a>
      <h1 class="aa-game-title">Waffle Wednesday</h1>
    </div>
    <div id="game" class="ww"></div>
  </main>
  <script type="module" src="game.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `game.css` (base + title screen)**

Create `games/waffle-wednesday/game.css`:

```css
/* Waffle Wednesday — all game visuals. Shared tokens come from ../../assets/styles.css */

.ww {
  position: relative;
  width: 100%;
  min-height: min(78vh, 620px);
  overflow: hidden;
  border: 2px solid var(--edge);
  border-radius: var(--radius);
  background: linear-gradient(180deg, #2a1c34 0%, #3a2438 55%, #4a2f2a 100%);
  box-shadow: var(--shadow);
  color: var(--ink);
  user-select: none;
  touch-action: manipulation;
  font-family: var(--font-body);
}

.ww button { font-family: inherit; }

/* ---------- Title ---------- */
.ww-title {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px; text-align: center; padding: 24px;
}
.ww-title h2 {
  font-family: var(--font-display);
  font-size: clamp(14px, 4vw, 20px);
  color: var(--neon);
  margin: 0;
}
.ww-title p { margin: 0; color: var(--ink-dim); font-size: 13px; max-width: 30ch; }
.ww-start { font-size: 18px; padding: 14px 22px; }
.ww-best { font-size: 12px; color: var(--ink-dim); letter-spacing: 1px; text-transform: uppercase; }
.ww-reset {
  font-size: 11px; color: var(--ink-dim); background: none;
  border: 1px solid var(--edge); border-radius: var(--radius);
  padding: 4px 8px; cursor: pointer; opacity: 0.6;
}
.ww-reset:hover { opacity: 1; }

/* ---------- Pixel sprite ---------- */
.ww-sprite { image-rendering: pixelated; border-radius: 4px; }
.ww-sprite-fallback { font-size: 40px; line-height: 1; }

/* ---------- Reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .ww * { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 3: Create `game.js` (boot + persistence + title)**

Create `games/waffle-wednesday/game.js`:

```js
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
```

- [ ] **Step 4: Verify in the browser**

Run from the repo root: `python -m http.server 8000`
Open: `http://localhost:8000/games/waffle-wednesday/`

Verify:
- Shared shell renders: `← The Attic` back link + `Waffle Wednesday` title.
- Title card: heading, blurb, `🧇 Start shift` button. No "Best Wednesday" line yet.
- In DevTools console: `localStorage.setItem('waffle-wednesday:best', JSON.stringify({score: 3200, rating: 'Solid', perfects: 4, served: 20}))`, reload → "Best Wednesday: 3,200 · "Solid"" and a `reset best` button appear.
- Click `reset best` → line disappears; `localStorage.getItem('waffle-wednesday:best')` is `null`.
- Click `🧇 Start shift` → placeholder "Shift starting…" text.
- Narrow the window to ~360px — nothing overflows horizontally.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add games/waffle-wednesday/index.html games/waffle-wednesday/game.css games/waffle-wednesday/game.js
git commit -m "feat(waffle-wednesday): page shell, title screen, best-score persistence"
```

---

## Task 7: The doneness meter — toast, climb, eject, carryover

**Files:**
- Modify: `games/waffle-wednesday/game.js` (toaster slot, meter loop, eject + carryover)
- Modify: `games/waffle-wednesday/game.css` (toaster + meter styles)

**Interfaces:**
- Consumes: `isBurnt`, `scoreServe` from `scoring.js`; `rampFor`, `buildShift` from `shift.js`.
- Produces (module-internal):
  - `TOAST = { CARRYOVER: 8, SETTLE_MS: 600 }` constant.
  - `Slot` objects: `{ el, meterEl, markerEl, bandEl, waffleEl, value, cooking, raf, forCustomerId }`.
  - `dropWaffle(slot, order)` — begins cooking (value climbs at `order`-derived rate).
  - `ejectWaffle(slot)` → `Promise<number>` resolving to the **settled** doneness (value + carryover, clamped 0–100) after `SETTLE_MS`.
  - `settle(raw)` helper: `Math.max(0, Math.min(100, raw + TOAST.CARRYOVER))` (pure — could later move to `scoring.js`, keep local for now).

For this task, wire a **single hardcoded customer** (Nash's order) into one slot so the meter can be exercised end to end; `startShift` renders one toaster slot + a SERVE button and `console.log`s the `scoreServe` result. The real customer/queue/toppings arrive in Tasks 8–10.

- [ ] **Step 1: Add the meter to `game.css`**

Append to `games/waffle-wednesday/game.css`:

```css
/* ---------- Station / toaster ---------- */
.ww-station {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 14px clamp(10px, 4vw, 22px) 18px;
  display: flex; flex-direction: column; gap: 12px;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,0.28));
}
.ww-toaster { display: flex; gap: 14px; justify-content: center; }
.ww-slot {
  position: relative;
  width: clamp(84px, 26vw, 120px);
  height: clamp(150px, 40vw, 190px);
  border: 3px solid #0c0a18;
  border-radius: 10px;
  background: #6b6b76;
  box-shadow: inset 0 -12px 0 rgba(0,0,0,0.25), var(--shadow);
  display: flex; align-items: flex-end; justify-content: center;
  cursor: pointer;
}
.ww-slot[data-empty="true"] .ww-meter,
.ww-slot[data-empty="true"] .ww-waffle { display: none; }
.ww-slot-hint {
  position: absolute; top: 8px; left: 0; right: 0; text-align: center;
  font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.7);
}
.ww-waffle {
  width: 62%; aspect-ratio: 1; margin-bottom: 14px;
  border-radius: 8px;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 4px, transparent 4px 10px),
    repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0 4px, transparent 4px 10px),
    var(--waffle-color, #e8c98f);
  transition: background-color 0.1s linear;
}
.ww-meter {
  position: absolute; right: 6px; top: 10px; bottom: 10px; width: 12px;
  border: 2px solid #0c0a18; border-radius: 6px;
  background: linear-gradient(180deg, #3a1c0a 0%, #7a3b12 30%, #c9862f 60%, #e8c98f 100%);
}
.ww-meter-band {
  position: absolute; left: -3px; right: -3px;
  background: rgba(255,255,255,0.28);
  border-top: 2px solid var(--neon); border-bottom: 2px solid var(--neon);
}
.ww-meter-marker {
  position: absolute; left: -6px; right: -6px; height: 3px;
  background: var(--ink); box-shadow: 0 0 6px var(--ink);
}
.ww-slot.is-burnt { animation: ww-shudder 0.3s ease; }
@keyframes ww-shudder { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
```

- [ ] **Step 2: Wire the meter into `game.js`**

In `games/waffle-wednesday/game.js`:

1. Extend the imports:

```js
import { crewSpriteEl } from './sprites.js';
import { isBurnt, scoreServe } from './scoring.js';
import { rampFor, buildShift } from './shift.js';
```

2. Add near the top (after `state`):

```js
const TOAST = { CARRYOVER: 8, SETTLE_MS: 600 };
const clampDoneness = (n) => Math.max(0, Math.min(100, n));
const settle = (raw) => clampDoneness(raw + TOAST.CARRYOVER);

let slots = [];   // Slot[]
```

3. Add the slot builder + meter loop above `main()`:

```js
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
```

4. Replace `onSlotClick` + `startShift` with this task's slice:

```js
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
```

- [ ] **Step 3: Verify in the browser**

`python -m http.server 8000`, open the game, `Start shift`.

Verify:
- One toaster slot with "tap to toast".
- Tap it → a waffle appears, a marker climbs the meter, the waffle darkens from pale to golden to brown, a highlighted band (48–56) is drawn on the meter.
- Tap again quickly (marker around 45–50) → marker glides up a little more (carryover), hint shows "plated". Click SERVE → console logs a `scoreServe` result with a positive-ish `points` and `verdict` `good`/`sloppy`.
- Repeat but let it ride past ~85 before ejecting → marker settles past 92, slot shudders, hint shows "burnt!". SERVE → console logs `verdict: 'burnt'`, `points: -80`.
- The slot resets to "tap to toast" after each SERVE.

- [ ] **Step 4: Commit**

```bash
git add games/waffle-wednesday/game.js games/waffle-wednesday/game.css
git commit -m "feat(waffle-wednesday): doneness meter with carryover and burn detection"
```

---

## Task 8: Customers — counter, order ticket, patience, walkout, queue of 3

**Files:**
- Modify: `games/waffle-wednesday/game.js` (build the shift, render the counter + queue, patience timers, walkout + strike handling)
- Modify: `games/waffle-wednesday/game.css` (counter, ticket, patience bar, queue)

**Interfaces:**
- Consumes: `buildShift`, `rampFor` (Task 2); `crewSpriteEl` (Task 5); `content` (Task 6); slot helpers (Task 7).
- Produces (module-internal):
  - `state` gains `{ shift: Customer[], index: number, strikes: number, score: number, perfects: number, served: number, walkers: string[] }`.
  - `ticketText(order)` → string built from `content.donenessVocab` + topping labels + `content.syrupChoices` words (uses `order.ticketText` verbatim when present, i.e. crew).
  - `renderCounter()` — draws the current customer (sprite or emoji), their ticket, their patience bar; draws up to 3 waiting customers.
  - `startPatience()` / `stopPatience()` — drives the front customer's patience bar; on empty → `walkout()`.
  - `walkout()` — `strikes++`, push name to `walkers`, show the walkout line, then `nextCustomer()` or `endShift('bad')` at 3.
  - `nextCustomer()` — advance `index`; `endShift('complete')` after 20.
  - `endShift(kind)` — stub that `console.log`s for now (Task 12 builds the report card).

- [ ] **Step 1: Add counter + queue CSS**

Append to `games/waffle-wednesday/game.css`:

```css
/* ---------- Counter ---------- */
.ww-counter {
  position: absolute; left: 0; right: 0; top: 0;
  padding: 14px clamp(10px, 4vw, 22px);
  display: flex; gap: 12px; align-items: flex-start;
}
.ww-customer { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 0 0 auto; }
.ww-customer .ww-sprite, .ww-customer .ww-sprite-fallback { width: 64px; height: 64px; }
.ww-customer-name { font-size: 11px; color: var(--ink-dim); }
.ww-ticket {
  flex: 1;
  background: #f7f0dc; color: #2a231a;
  border-radius: 4px; padding: 10px 12px;
  font-size: 13px; line-height: 1.35;
  box-shadow: var(--shadow);
  transform: rotate(-1deg);
}
.ww-ticket h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #7a6a4a; }
.ww-ticket .ww-ticket-flavour { font-style: italic; color: #6a5c40; margin-top: 6px; display: block; }
.ww-patience {
  height: 8px; border-radius: 4px; margin-top: 8px;
  background: rgba(0,0,0,0.25); overflow: hidden;
}
.ww-patience-fill { height: 100%; width: 100%; background: var(--neon-green); transition: width 0.2s linear; }
.ww-patience-fill.is-low { background: var(--neon-pink); }

/* ---------- Queue ---------- */
.ww-queue {
  position: absolute; right: clamp(8px, 3vw, 18px); top: 96px;
  display: flex; flex-direction: column; gap: 6px; align-items: flex-end;
}
.ww-queue-face { font-size: 22px; opacity: 0.55; }
.ww-queue-face .ww-sprite { width: 28px; height: 28px; }

/* ---------- Toast / flash messages ---------- */
.ww-say {
  position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%);
  background: rgba(4,2,14,0.82); color: var(--ink);
  padding: 10px 16px; border-radius: var(--radius); font-size: 14px;
  max-width: 26ch; text-align: center; pointer-events: none;
  animation: ww-say 1.6s ease forwards;
}
@keyframes ww-say { 0% { opacity: 0; transform: translate(-50%, -40%); } 15%,70% { opacity: 1; transform: translate(-50%, -50%); } 100% { opacity: 0; } }
```

- [ ] **Step 2: Build the shift + counter in `game.js`**

In `games/waffle-wednesday/game.js`:

1. Extend `state` where it is declared:

```js
const state = {
  phase: 'title',
  shift: [], index: 0,
  strikes: 0, score: 0, perfects: 0, served: 0,
  walkers: [],
  patienceRaf: 0, patienceStart: 0, patienceMs: 0,
};
```

2. Add ticket + rng helpers above `main()`:

```js
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
```

3. Add the render + flow functions:

```js
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

function walkout() {
  stopPatience();
  const cur = state.shift[state.index];
  state.strikes += 1;
  state.walkers.push(cur.name);
  state.score -= 120;
  say(pickLine(cur, 'walkout'));
  slots.forEach(resetSlot);
  setTimeout(() => {
    if (state.strikes >= 3) endShift('bad');
    else nextCustomer();
  }, 1400);
}

function nextCustomer() {
  state.index += 1;
  if (state.index >= 20) { endShift('complete'); return; }
  slots.forEach(resetSlot);
  syncSlotCount();
  renderCounter();
  startPatience();
}

function syncSlotCount() {
  const want = rampFor(state.shift[state.index].id).slots;
  const toaster = root.querySelector('.ww-toaster');
  while (slots.length < want) { const s = makeSlot(); slots.push(s); toaster.appendChild(s.el); }
}

function endShift(kind) {
  stopPatience();
  state.phase = kind === 'bad' ? 'bad' : 'complete';
  console.log(`endShift(${kind})`, { score: state.score, perfects: state.perfects, served: state.served, walkers: state.walkers });
  // Task 12 renders the report card.
}
```

4. Replace `startShift` with the shift-driven version (keeps the SERVE button from Task 7 but now reads the real customer; scoring wiring is finished in Task 10):

```js
function startShift() {
  state.phase = 'shift';
  Object.assign(state, { index: 0, strikes: 0, score: 0, perfects: 0, served: 0, walkers: [] });
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
  root.appendChild(station);

  renderCounter();
  startPatience();
}

function onServe() {
  // Full scoring lands in Task 10. For now: require a plated waffle, then advance.
  const slot = slots.find((s) => s.forCustomerId === state.shift[state.index].id && s._settled != null)
    ?? slots.find((s) => s._settled != null);
  if (!slot) return;
  stopPatience();
  state.served += 1;
  slot._settled = null;
  resetSlot(slot);
  nextCustomer();
}
```

5. Update `onSlotClick` to use the real current order:

```js
function onSlotClick(slot) {
  const cur = state.shift[state.index];
  if (slot.el.dataset.empty === 'true') {
    dropWaffle(slot, { ...cur.order, meterRate: cur.ramp.meterRate }, cur.id);
  } else if (slot.cooking) {
    ejectWaffle(slot).then(({ settled, burnt }) => { slot._settled = settled; slot._burnt = burnt; });
  }
}
```

- [ ] **Step 3: Verify in the browser**

`python -m http.server 8000`, open the game, `Start shift`.

Verify:
- A customer stands at the counter with a name, a face (pixel sprite for a crew regular, emoji otherwise), and a readable order ticket (e.g. "golden waffle · blueberries, honey drizzle"). Crew tickets also show a flavour quote.
- Up to 3 faces stacked on the right as the queue.
- The green patience bar drains; it turns pink under 25%.
- Toast + eject + SERVE → next customer appears, patience resets, queue shifts.
- Let a patience bar run out → walkout line pops up, and after a beat the next customer appears. Do it 3 times → console logs `endShift(bad)` with the 3 walker names.
- Play all 20 (toast+serve fast) → console logs `endShift(complete)`.
- Around customer 10, a second toaster slot appears.

- [ ] **Step 4: Commit**

```bash
git add games/waffle-wednesday/game.js games/waffle-wednesday/game.css
git commit -m "feat(waffle-wednesday): customers, order tickets, patience and walkouts"
```

---

## Task 9: Toppings shelf (drag) + syrup pour (hold)

**Files:**
- Modify: `games/waffle-wednesday/game.js` (plating area, topping shelf, drag-to-plate, syrup hold-to-pour)
- Modify: `games/waffle-wednesday/game.css` (shelf, topping chips, plate, syrup bottle + gauge)

**Interfaces:**
- Consumes: `content.toppings` (Task 6); the plated slot from Tasks 7–8.
- Produces (module-internal):
  - `plate = { toppings: Set<string>, syrupLevel: number }` — reset per customer.
  - `renderShelf()` — draws one chip per catalogue topping + the syrup bottle.
  - `addTopping(id)` / `removeTopping(id)` — toggle a topping on the plated waffle (drag drop = add; tap a placed topping = remove).
  - `pourStart()` / `pourStop()` — while held, `plate.syrupLevel` rises ~60/sec, capped at 100; releasing stops. Hitting 100 while held = overflow (flag `plate.syrupOverflow = true`, stop the pour, flash the plate).
  - Draggable chips use Pointer Events with `touch-action: none`.

- [ ] **Step 1: Add shelf + plate CSS**

Append to `games/waffle-wednesday/game.css`:

```css
/* ---------- Plating ---------- */
.ww-plate-area { display: flex; align-items: center; gap: 12px; justify-content: center; }
.ww-plate {
  position: relative;
  width: clamp(90px, 26vw, 120px); aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, #fff, #d7d2e4 70%, #b3a9d9);
  box-shadow: var(--shadow);
  display: flex; align-items: center; justify-content: center;
}
.ww-plate[data-empty="true"] { opacity: 0.4; }
.ww-plate-waffle {
  width: 66%; aspect-ratio: 1; border-radius: 8px;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 4px, transparent 4px 10px),
    repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0 4px, transparent 4px 10px),
    var(--plated-color, #e8c98f);
  position: relative;
}
.ww-plate-topping { position: absolute; font-size: 18px; transform: translate(-50%, -50%); cursor: pointer; }
.ww-plate.is-overflow { animation: ww-shudder 0.3s ease; box-shadow: 0 0 0 4px var(--neon-pink); }

.ww-shelf { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ww-chip {
  font-size: 22px; line-height: 1;
  background: var(--panel-bright); border: 2px solid var(--edge); border-radius: var(--radius);
  padding: 6px 8px; cursor: grab; touch-action: none;
}
.ww-chip.dragging { opacity: 0.6; }
.ww-chip.is-on { border-color: var(--neon-green); }

.ww-syrup {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-size: 26px; cursor: pointer; touch-action: none; user-select: none;
}
.ww-syrup-gauge { width: 46px; height: 8px; border-radius: 4px; background: rgba(0,0,0,0.25); overflow: hidden; }
.ww-syrup-gauge-fill { height: 100%; width: 0%; background: #b5651d; }
```

- [ ] **Step 2: Add plating logic to `game.js`**

In `games/waffle-wednesday/game.js`:

1. Add near `state`:

```js
let plate = { toppings: new Set(), syrupLevel: 0, syrupOverflow: false };
let pourRaf = 0;
function resetPlate() {
  plate = { toppings: new Set(), syrupLevel: 0, syrupOverflow: false };
  cancelAnimationFrame(pourRaf);
}
```

2. Add above `main()`:

```js
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
function pourStop() { cancelAnimationFrame(pourRaf); }
```

3. Call `renderStationExtras(station)` inside `startShift` (after appending the toaster, before `renderCounter()`), and `resetPlate()` + `paintPlate()` in `nextCustomer()` and after a successful serve.

```js
// in startShift(), after station.append(toaster, serve):
renderStationExtras(station);

// in nextCustomer(), after slots.forEach(resetSlot):
resetPlate();

// at the end of nextCustomer() (after renderCounter/startPatience) and startShift():
paintPlate();
syncChips();
```

- [ ] **Step 3: Verify in the browser**

`python -m http.server 8000`, open the game, `Start shift`.

Verify:
- Below the toaster: a syrup bottle with a gauge, a round plate (dim until a waffle is plated), and a shelf of topping chips.
- Toast + eject a waffle → plate lights up and shows a waffle in the ejected colour.
- Drag a chip onto the plate → its emoji appears on the waffle, the chip gets a green border. Tap the placed emoji → it is removed, border clears.
- Press and hold the syrup bottle → gauge fills; release → it stops. Hold to full → plate flashes pink and pouring locks (overflow).
- Dragging a chip before a waffle is plated does nothing.
- Touch: same interactions work in device emulation; the page does not scroll during a chip drag or a syrup hold.

- [ ] **Step 4: Commit**

```bash
git add games/waffle-wednesday/game.js games/waffle-wednesday/game.css
git commit -m "feat(waffle-wednesday): topping shelf and syrup pour"
```

---

## Task 10: Serve resolution — real scoring, reactions, tip, score HUD

**Files:**
- Modify: `games/waffle-wednesday/game.js` (`onServe` calls `scoreServe`, applies points + tip, shows the reaction, advances; burnt path; score HUD)
- Modify: `games/waffle-wednesday/game.css` (score HUD, verdict flash colours)

**Interfaces:**
- Consumes: `scoreServe` (Task 1); `plate` (Task 9); `patienceLeft()` (Task 8).
- Produces (module-internal):
  - `renderHud()` / `updateHud()` — a fixed strip showing `Customer 7 / 20`, `Score`, `Strikes ●●○`.
  - `onServe()` (rewritten) — resolves the plated (or burnt) slot for the current customer, calls `scoreServe`, adds `points + tip` to `state.score`, `state.perfects += result.perfect ? 1 : 0`, `state.served += 1`, flashes a verdict colour, says a reaction line, then `nextCustomer()`.
  - A burnt waffle can still be "served" (handed over burnt) → `scoreServe` returns the burnt result; the customer gets an `angry` line.

- [ ] **Step 1: Add HUD + flash CSS**

Append to `games/waffle-wednesday/game.css`:

```css
/* ---------- HUD ---------- */
.ww-hud {
  position: absolute; left: 0; right: 0; top: 0;
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 12px; font-size: 12px;
  background: rgba(4,2,14,0.55); color: var(--ink);
  font-family: var(--font-display);
  z-index: 5;
}
.ww-hud .ww-strikes span { opacity: 0.35; }
.ww-hud .ww-strikes span.is-lit { opacity: 1; color: var(--neon-pink); }
.ww-counter { top: 30px; }          /* clear the HUD */
.ww-queue { top: 122px; }

/* ---------- Verdict flash ---------- */
.ww.flash-perfect { animation: ww-flash 0.5s ease; --flash: var(--neon); }
.ww.flash-good { animation: ww-flash 0.5s ease; --flash: var(--neon-green); }
.ww.flash-sloppy { animation: ww-flash 0.5s ease; --flash: var(--neon-blue); }
.ww.flash-burnt { animation: ww-flash 0.5s ease; --flash: var(--neon-pink); }
@keyframes ww-flash { 0% { box-shadow: inset 0 0 0 0 var(--flash); } 40% { box-shadow: inset 0 0 40px 4px var(--flash); } 100% { box-shadow: inset 0 0 0 0 var(--flash); } }
```

- [ ] **Step 2: Rewrite `onServe` + add the HUD in `game.js`**

```js
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
  const cur = state.shift[state.index];
  const slot = slots.find((s) => s.forCustomerId === cur.id && s._settled != null)
    ?? slots.find((s) => s._settled != null);
  if (!slot) { say('Toast something first.'); return; }

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

  setTimeout(() => nextCustomer(), 900);
}
```

Also call `renderHud()` at the end of `startShift`, and `updateHud()` inside `nextCustomer()` (after `renderCounter()`).

- [ ] **Step 3: Verify in the browser**

`python -m http.server 8000`, open the game, `Start shift`.

Verify:
- A HUD strip on top: `Cust 1/20`, running score, three strike dots.
- Serve a waffle that matches the ticket well (right doneness, right toppings, right syrup) → gold flash, a "happy" line, score jumps by a lot (includes the +150 and a tip).
- Serve a wrong-toppings waffle → blue/green flash, "meh" line, smaller score change.
- Serve a burnt waffle → pink flash, "angry" line, score drops.
- Let one customer walk → a strike dot lights; score drops 120.
- For a Groves customer: eject around 86–90 → scores "good"; ride to 93+ → burnt. (Confirms the spec note about his band.)
- Score persists across the shift; `Cust n/20` counts up.

- [ ] **Step 4: Commit**

```bash
git add games/waffle-wednesday/game.js games/waffle-wednesday/game.css
git commit -m "feat(waffle-wednesday): serve scoring, reactions, tips and HUD"
```

---

## Task 11: Difficulty ramp polish + second-slot handoff

**Files:**
- Modify: `games/waffle-wednesday/game.js` (ensure ramp fields drive the meter and patience everywhere; pre-toast for the queued customer; "slot unlocked" cue)
- Modify: `games/waffle-wednesday/game.css` (new-slot pop-in)

**Interfaces:**
- Consumes: `rampFor` (Task 2); slot helpers (Task 7); `syncSlotCount` (Task 8).
- Produces (module-internal):
  - `dropWaffle` accepts an explicit `customerId` so a slot can be cooking for the **next** customer (`state.index + 1`) while the front customer is still being served.
  - `onSlotClick` on an empty slot when the front customer already has a cooking/plated slot → drops for the **next** customer instead (reads `state.shift[state.index + 1].order`).
  - `syncSlotCount` animates a newly added slot (`.ww-slot-new` class, removed on `animationend`).

- [ ] **Step 1: Add the pop-in CSS**

Append to `games/waffle-wednesday/game.css`:

```css
.ww-slot-new { animation: ww-slot-in 0.4s ease; }
@keyframes ww-slot-in { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
```

- [ ] **Step 2: Teach the slots about the next customer**

In `games/waffle-wednesday/game.js`:

1. `syncSlotCount` — tag the new slot and announce it:

```js
function syncSlotCount() {
  const want = rampFor(state.shift[state.index].id).slots;
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
```

2. `onSlotClick` — empty slot drops for the front customer, or the next one if the front is already handled:

```js
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
```

3. `onServe` slot selection already prefers `s.forCustomerId === cur.id` — after a serve, a slot pre-toasted "for the next customer" becomes the front slot automatically on `nextCustomer()`. In `nextCustomer`, **do not** blanket `slots.forEach(resetSlot)` any more — only reset slots whose `forCustomerId` is now in the past:

```js
function nextCustomer() {
  state.index += 1;
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
```

(Keep the `slots.forEach(resetSlot)` call in `walkout()` — a walkout abandons everything in progress.)

- [ ] **Step 3: Verify in the browser**

`python -m http.server 8000`, `Start shift`, play to customer 10.

Verify:
- At customer 10 a second slot pops in with a "Second toaster…" message.
- With the front customer's waffle already plated, tapping the empty slot starts a waffle labelled "for <next name>".
- Serve the front customer → the next customer steps up and their pre-toasted waffle is still cooking/plated in the slot (not reset).
- A walkout still clears both slots.
- Customers 15–20 feel tighter: narrower band on the meter, faster climb, shorter patience.

- [ ] **Step 4: Commit**

```bash
git add games/waffle-wednesday/game.js games/waffle-wednesday/game.css
git commit -m "feat(waffle-wednesday): second-slot pre-toasting and ramp handoff"
```

---

## Task 12: Shift end — report card, ratings, bad-Wednesday variant, save best

**Files:**
- Modify: `games/waffle-wednesday/game.js` (`endShift` builds the report card; `ratingFor`; save best; play-again)
- Modify: `games/waffle-wednesday/game.css` (report-card layout)

**Interfaces:**
- Consumes: `content.roasts` (Task 6); `saveBest` (Task 6); `state` totals.
- Produces (module-internal):
  - `ratingFor(score)` → `{ key: 'chefsKiss'|'solid'|'rough'|'badWednesday', title: string }`. Thresholds (tunable): `>= 3200` Chef's kiss; `>= 1800` Solid Wednesday; `>= 0` Rough Wednesday; a `'bad'` end always uses `badWednesday`.
  - `endShift(kind)` (rewritten) — compute rating, `saveBest({ score, rating: title, perfects, served })`, render the card with a random roast (`{who}` → a random crew name, `{walkers}` → the walker list), stats, and **NEW SHIFT** / **← The Attic** buttons.

- [ ] **Step 1: Add report-card CSS**

Append to `games/waffle-wednesday/game.css`:

```css
/* ---------- Report card ---------- */
.ww-report {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; text-align: center; padding: 24px;
  background: rgba(4,2,14,0.72);
}
.ww-report h2 { font-family: var(--font-display); color: var(--neon); font-size: clamp(15px, 4.5vw, 22px); margin: 0; }
.ww-report .ww-report-score { font-size: 28px; font-weight: 700; }
.ww-report .ww-report-roast { font-style: italic; color: var(--ink-dim); max-width: 32ch; }
.ww-report .ww-report-stats { display: flex; gap: 18px; font-size: 12px; color: var(--ink-dim); }
.ww-report .ww-report-stats b { display: block; font-size: 18px; color: var(--ink); }
.ww-report-actions { display: flex; gap: 10px; }
.ww-report-actions a { text-decoration: none; }
.ww-report-new { color: var(--attic-deep); }
```

- [ ] **Step 2: Rewrite `endShift` in `game.js`**

```js
function ratingFor(score, kind) {
  if (kind === 'bad') return { key: 'badWednesday', title: 'Bad Wednesday' };
  if (score >= 3200) return { key: 'chefsKiss', title: "Chef's kiss" };
  if (score >= 1800) return { key: 'solid', title: 'Solid Wednesday' };
  return { key: 'rough', title: 'Rough Wednesday' };
}

function fillRoast(tpl) {
  const name = content.crew[Math.floor(Math.random() * content.crew.length)].name;
  return tpl
    .replaceAll('{who}', name)
    .replaceAll('{walkers}', state.walkers.join(', ') || 'nobody');
}

function endShift(kind) {
  stopPatience();
  slots.forEach(resetSlot);
  state.phase = kind === 'bad' ? 'bad' : 'complete';

  const rating = ratingFor(state.score, kind);
  saveBest({ score: state.score, rating: rating.title, perfects: state.perfects, served: state.served });

  const pool = content.roasts[rating.key] ?? content.roasts.rough;
  const roast = fillRoast(pool[Math.floor(Math.random() * pool.length)]);

  root.replaceChildren();
  const card = document.createElement('div');
  card.className = 'ww-report';
  card.innerHTML = `
    <h2>${rating.title}</h2>
    <div class="ww-report-score">${state.score.toLocaleString()}</div>
    <p class="ww-report-roast">${roast}</p>
    <div class="ww-report-stats">
      <div><b>${state.perfects}</b> perfect</div>
      <div><b>${state.served}</b> served</div>
      <div><b>${state.strikes}</b> walked</div>
    </div>`;

  const actions = document.createElement('div');
  actions.className = 'ww-report-actions';
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'aa-btn ww-report-new';
  again.textContent = 'New shift';
  again.addEventListener('click', () => startShift());
  const home = document.createElement('a');
  home.className = 'aa-btn';
  home.href = '../../';
  home.textContent = '← The Attic';
  actions.append(again, home);
  card.appendChild(actions);
  root.appendChild(card);
}
```

- [ ] **Step 3: Verify in the browser**

`python -m http.server 8000`, `Start shift`.

Verify:
- Play all 20 → report card: a rating title, the final score, a roast line naming a crew member, stats (perfect / served / walked), `New shift` + `← The Attic`.
- Deliberately tank it (let 3 walk) → "Bad Wednesday" card, roast names the 3 walkers.
- `New shift` → fresh shift from customer 1, score reset.
- After a good shift, go back to `← The Attic` then re-enter → title screen shows "Best Wednesday: <score>". Beat it → best updates; do worse → best stays.
- `localStorage.getItem('waffle-wednesday:best')` holds the JSON record.

- [ ] **Step 4: Commit**

```bash
git add games/waffle-wednesday/game.js games/waffle-wednesday/game.css
git commit -m "feat(waffle-wednesday): shift report card, ratings and best-score save"
```

---

## Task 13: Decorative polish + reduced-motion pass

**Files:**
- Modify: `games/waffle-wednesday/game.css` (steam, customer bob, confetti on Chef's kiss, gold flash refinements, reduced-motion block)
- Modify: `games/waffle-wednesday/game.js` (emit confetti on a `chefsKiss` result; steam element on a cooking slot)

**Interfaces:**
- Consumes: existing scene; `ratingFor`.
- Produces (module-internal):
  - `confetti()` — ~30 falling pieces for ~1.5s; no-op when `prefers-reduced-motion`.
  - Cooking slots get a `.ww-steam` child while `slot.cooking` is true.

- [ ] **Step 1: Add the CSS**

Append to `games/waffle-wednesday/game.css`:

```css
/* ---------- Steam ---------- */
.ww-steam {
  position: absolute; top: 6px; left: 50%; width: 8px; height: 8px;
  border-radius: 50%; background: rgba(255,255,255,0.5);
  animation: ww-steam 1.4s ease-in-out infinite;
}
@keyframes ww-steam {
  0% { transform: translate(-50%, 0) scale(0.6); opacity: 0; }
  40% { opacity: 0.6; }
  100% { transform: translate(-50%, -26px) scale(1.3); opacity: 0; }
}

/* ---------- Customer bob ---------- */
.ww-customer .ww-sprite, .ww-customer .ww-sprite-fallback { animation: ww-bob 3s ease-in-out infinite; }
@keyframes ww-bob { 50% { transform: translateY(-4px); } }

/* ---------- Confetti ---------- */
.ww-confetti { position: absolute; top: -12px; width: 8px; height: 12px; will-change: transform; }
@keyframes ww-fall { to { transform: translateY(680px) rotate(540deg); opacity: 0.2; } }

/* ---------- Reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .ww-steam, .ww-confetti { display: none; }
  .ww-customer .ww-sprite, .ww-customer .ww-sprite-fallback { animation: none; }
  .ww.flash-perfect, .ww.flash-good, .ww.flash-sloppy, .ww.flash-burnt { animation: none; }
  .ww-slot-new { animation: none; }
  .ww-say { animation: none; opacity: 1; }
  /* meter marker / waffle colour still update — they are the mechanic */
}
```

Note: `.ww-say` with no animation would never disappear. In `say()`, when `matchMedia('(prefers-reduced-motion: reduce)').matches`, set a `setTimeout(() => el.remove(), 1600)` instead of relying on `animationend`.

- [ ] **Step 2: Wire steam + confetti in `game.js`**

```js
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// in dropWaffle(), after slot.el.dataset.empty = 'false':
if (!reduceMotion() && !slot.el.querySelector('.ww-steam')) {
  const steam = document.createElement('div');
  steam.className = 'ww-steam';
  slot.el.appendChild(steam);
}
// in ejectWaffle() and resetSlot(): slot.el.querySelector('.ww-steam')?.remove();

// update say():
function say(text) {
  const el = document.createElement('div');
  el.className = 'ww-say';
  el.textContent = text;
  root.appendChild(el);
  if (reduceMotion()) setTimeout(() => el.remove(), 1600);
  else el.addEventListener('animationend', () => el.remove(), { once: true });
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

// in endShift(), after computing `rating`:
if (rating.key === 'chefsKiss') confetti();
```

- [ ] **Step 3: Verify in the browser**

`python -m http.server 8000`, `Start shift`.

Verify:
- A cooking slot shows a little rising steam puff; it stops on eject.
- The customer sprite bobs gently.
- Finish a shift with a Chef's kiss score → confetti falls over the report card.
- DevTools → Rendering → "Emulate prefers-reduced-motion: reduce": no steam, no bob, no confetti, no flash, but the doneness marker and waffle colour still animate while toasting, and "say" bubbles still appear and disappear.

- [ ] **Step 4: Commit**

```bash
git add games/waffle-wednesday/game.js games/waffle-wednesday/game.css
git commit -m "feat(waffle-wednesday): steam, bob, confetti and reduced-motion pass"
```

---

## Task 14: Repo integration + full manual QA

**Files:**
- Modify: `games.json` (append the entry)

**Interfaces:**
- Consumes: the finished game folder.
- Produces: the game listed on the home page.

- [ ] **Step 1: Add the games.json entry**

In `games.json`, add as the **first** object in the `games` array (newest-first ordering; use today's date):

```json
{
  "slug": "waffle-wednesday",
  "title": "Waffle Wednesday",
  "description": "Toast it right, top it faster. One shift, twenty customers, three walkouts and it's a bad Wednesday.",
  "emoji": "🧇",
  "added": "2026-09-03"
}
```

- [ ] **Step 2: Run the full test suite**

Run: `node --test`
Expected: PASS — every `tests/*.mjs` file, `waffle-wednesday.test.mjs` included, 0 failures.

- [ ] **Step 3: Full manual QA**

`python -m http.server 8000`, open `http://localhost:8000/`.

- **Home page:** the Waffle Wednesday card shows first (🧇, title, description, "Added Sep 2026"); click it → the game loads.
- **Shell:** `← The Attic` returns to the home page; page title is "Waffle Wednesday · Arcade Attic".
- **Title:** blurb + `🧇 Start shift`; best line only after a completed shift.
- **Toasting:** meter climbs; eject shows carryover; band drawn from the ticket; burnt path (ride past 92) → shudder + "burnt!".
- **Toppings:** drag chips on/off; tap-to-remove; syrup hold-to-pour; overflow flashes and locks.
- **Serving:** perfect serve → gold flash + happy line + big score jump incl. tip; wrong → meh/angry; HUD counts `Cust n/20`, score, strike dots.
- **Regulars:** each of the 6 appears once, with their pixel portrait, signature ticket + flavour quote, and their own lines. No two regulars back-to-back. First two customers are always generic.
- **Ramp:** second slot at customer 10 with the announce message; pre-toast for the next customer and confirm it survives `nextCustomer`; 15–20 are visibly tighter.
- **Walkouts:** patience empties → walkout line + strike; 3 strikes → "Bad Wednesday" card naming the 3.
- **End:** all 20 → report card with rating, score, roast, stats; `New shift` restarts; best persists and only improves.
- **Persistence:** reload after a shift → best shown; `reset best` clears it; private-window (no localStorage) → no crash, no best line.
- **Responsive:** 360px wide portrait and a desktop width — no horizontal scroll, counter/station/shelf all reachable.
- **Touch:** on a real tablet or device emulation — toasting taps, chip drags, and syrup holds all work; the page never scrolls mid-interaction.
- **Reduced motion:** decorative motion off, mechanic still animates.
- **Console:** no errors on any screen.

- [ ] **Step 4: Commit**

```bash
git add games.json
git commit -m "feat(waffle-wednesday): list the game on the home page"
```

- [ ] **Step 5: Final verification before calling it done**

Run: `node --test` → all green.
Run: `git status` → clean.
Run: `git log --oneline -15` → the task commits are all present, each with the trailer.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
| --- | --- |
| Core loop / fixed 20-customer shift | 2, 8 |
| Live doneness meter + carryover + burn | 7 |
| Toppings drag-to-match | 9 |
| Syrup hold-to-pour + overflow | 9 |
| Perfect serve = doneness + toppings + syrup; partial credit | 1, 10 |
| Scoring table (all rows) | 1 |
| Difficulty ramp (4 bands) | 2, 11 |
| Second toaster slot unlock | 2 (config), 8 + 11 (behaviour) |
| Shift generation: 20, slots 1–2 generic, crew once each, no adjacency, seeded | 2 |
| 3 visible waiting customers | 8 |
| Crew regulars at random positions | 2 |
| Crew signature orders + lines | 3 |
| Generic customers + content pools | 3, 8 |
| Comedy layer (ticket / greet / reaction / walkout / roast) | 8, 10, 12 |
| Crew pixel art (option A, generated, no binaries) | 4, 5 |
| Visual style / shared tokens / responsive | 6, 8, 9, 10, 12 |
| `prefers-reduced-motion` | 13 (meter exempt — 7) |
| No sound | (nothing to build) |
| Persistence: single key, try/catch, save-if-better | 6, 12 |
| Files & module boundaries | all; `sprites.js` split documented in File Structure |
| Testing: scoring + shift + JSON + sprite shape | 1, 2, 3, 4 |
| Repo integration (`games.json`, no README change) | 14 |
| Out of scope items | not built (correct) |

No gaps.

**Placeholder scan:** every code step has real code; every verify step has concrete expected outcomes. The only intentionally-throwaway artefacts are the hardcoded order in Task 7 (replaced in Task 8) and the `console.log` stubs in Tasks 7–8 (replaced in Tasks 10 and 12) — each is called out where it appears.

**Type consistency:** `scoreServe` input/return shape is identical in Task 1 (definition), Task 10 (call site). `buildShift` data arg (`{ crew, toppings, names, syrupChoices }`) matches between Task 2, Task 3's test, and Task 8's call. `rampFor` return fields (`bandWidth`, `meterRate`, `toppingCount`, `syrupChance`, `slots`, `patience`) are used consistently in Tasks 7, 8, 11. Slot object fields (`value`, `cooking`, `order`, `forCustomerId`, `_settled`, `_burnt`) are introduced in Task 7 and used under the same names in 8–13. `CREW_SPRITES` sprite shape matches between Task 4 (generator), Task 4's test, and Task 5 (`sprites.js`).
