# Bins on the Moon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a drag-and-drop rubbish-sorting game for ages 3–6 as a self-contained game in the `arcade-attic` collection.

**Architecture:** Four ES modules with a clean pure/impure split. `levels.js` (pure: bin definitions, level configuration, item selection) and the `binAtPoint` helper in `drag.js` are unit-tested with `node --test`. `scene.js` owns all moon-scene DOM and its animations; `drag.js` provides reusable Pointer-Events dragging; `game.js` is the state machine that wires them together. Content lives in `items.json`. No build step, no dependencies, no framework — consistent with the rest of the repo.

**Tech Stack:** Vanilla ES modules, Pointer Events, CSS animations, `localStorage`, `node --test` (built in, no runner/deps).

**Spec:** `.scratch/bins-on-the-moon/spec.md`

## Global Constraints

- **No build step, no frameworks, no runtime dependencies.** Plain `.html` / `.css` / `.js` served as-is.
- **All paths relative** — never leading-slash. Game pages reference shared assets as `../../assets/...`.
- **Reuse the shared shell:** `../../assets/styles.css` provides design tokens (`--panel`, `--edge`, `--neon`, `--shadow`, `--font-display`, `--radius`), the `.aa-game` wrapper, `.aa-game-top`, `.aa-back`, `.aa-game-title`, `.aa-btn`.
- **Audience 3–6, fully visual.** No instructional text in gameplay. Items are emoji only. Bins are colour + emoji only. `name` fields exist solely for `aria-label`.
- **No sound, no score, no timer, no fail state.** Only persisted value: `localStorage['bins-on-the-moon:progress']` = integer resume level ≥ 1.
- **Four bins, fixed ids and order:** `recycling` (blue ♻️), `food` (brown 🍎), `general` (black 🗑️), `junk` (purple 🛸).
- **Respect `prefers-reduced-motion: reduce`** — replace motion with instant state changes; hint still legible.
- **Draggable elements must set `touch-action: none`** to stop the browser treating the drag as a scroll.
- **Node ≥ 20** for `node --test <dir>` (dev machine has v24).
- **Commit messages** end with the two trailer lines used elsewhere in this repo:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XnwRhZpy6m897iEddWy884
  ```

---

## File Structure

| File | Responsibility |
| --- | --- |
| `games/bins-on-the-moon/index.html` | Page shell: shared `.aa-game` chrome + `<div id="game" class="bm">` |
| `games/bins-on-the-moon/levels.js` | **Pure.** `BINS`, `BIN_IDS`, `levelConfig(n)`, `pickItems(pool, binIds, count, rng)` |
| `games/bins-on-the-moon/drag.js` | `binAtPoint(point, targets)` (**pure**) + `makeDraggable(el, handlers)` (DOM) |
| `games/bins-on-the-moon/scene.js` | Builds & mutates all moon-scene DOM; exposes `buildScene(root, binIds)` → scene controller |
| `games/bins-on-the-moon/game.js` | State machine: title → playing → levelComplete; queue/pad; persistence; wiring |
| `games/bins-on-the-moon/game.css` | Everything visual for this game + `prefers-reduced-motion` block |
| `games/bins-on-the-moon/items.json` | Item pool: `{ items: [{ emoji, name, bin }] }` |
| `tests/bins-on-the-moon.test.mjs` | `node --test` suite for `levels.js`, `binAtPoint`, and `items.json` validity |
| `games.json` | **Modify** — append the game's metadata entry |
| `README.md` | **Modify** — add a "Running tests" line and an "editing items" note |

---

## Task 1: `levels.js` — bin definitions and `levelConfig`

**Files:**
- Create: `games/bins-on-the-moon/levels.js`
- Create: `tests/bins-on-the-moon.test.mjs`

**Interfaces:**
- Produces:
  - `export const BINS` — array, in fixed order, of `{ id: string, color: string, icon: string, label: string }`. `id` ∈ `'recycling' | 'food' | 'general' | 'junk'`.
  - `export const BIN_IDS` — `['recycling','food','general','junk']` (i.e. `BINS.map(b => b.id)`).
  - `export function levelConfig(n)` → `{ level: number, bins: string[], count: number, visible: number }`. `n` is clamped to an integer ≥ 1. `bins` is a subset of `BIN_IDS` in `BIN_IDS` order.

- [ ] **Step 1: Write the failing test**

Create `tests/bins-on-the-moon.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BINS, BIN_IDS, levelConfig } from '../games/bins-on-the-moon/levels.js';

test('BINS has the four bins in fixed order', () => {
  assert.deepEqual(BIN_IDS, ['recycling', 'food', 'general', 'junk']);
  for (const b of BINS) {
    assert.equal(typeof b.color, 'string');
    assert.ok(b.icon.length > 0);
    assert.ok(b.label.length > 0);
  }
});

test('levelConfig: hand-tuned levels 1-5', () => {
  assert.deepEqual(levelConfig(1), { level: 1, bins: ['recycling', 'food'], count: 4, visible: 1 });
  assert.deepEqual(levelConfig(2), { level: 2, bins: ['recycling', 'food', 'general'], count: 6, visible: 3 });
  assert.equal(levelConfig(3).bins.length, 4);
  assert.equal(levelConfig(3).count, 8);
  assert.equal(levelConfig(4).visible, 3);
  assert.deepEqual(levelConfig(5), { level: 5, bins: BIN_IDS, count: 12, visible: 5 });
});

test('levelConfig: endless levels 6+ grow then cap at 20', () => {
  assert.equal(levelConfig(6).count, 14);
  assert.equal(levelConfig(9).count, 20);
  assert.equal(levelConfig(10).count, 20);
  assert.equal(levelConfig(100).count, 20);
  assert.equal(levelConfig(50).visible, 5);
  assert.deepEqual(levelConfig(7).bins, BIN_IDS);
});

test('levelConfig: clamps junk input to level 1', () => {
  assert.equal(levelConfig(0).level, 1);
  assert.equal(levelConfig(-3).level, 1);
  assert.equal(levelConfig(2.9).level, 2);
  assert.equal(levelConfig(undefined).level, 1);
});

test('levelConfig: count is always >= number of bins (so every bin can be covered)', () => {
  for (let n = 1; n <= 40; n++) {
    const c = levelConfig(n);
    assert.ok(c.count >= c.bins.length, `level ${n}: count ${c.count} < bins ${c.bins.length}`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bins-on-the-moon.test.mjs`
Expected: FAIL — `Cannot find module '.../levels.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `games/bins-on-the-moon/levels.js`:

```js
// Pure module — no DOM. Imported by game.js and by the test suite unchanged.

export const BINS = [
  { id: 'recycling', color: '#2f6fd0', icon: '♻️', label: 'recycling bin' },
  { id: 'food',      color: '#7a4a22', icon: '🍎', label: 'food waste bin' },
  { id: 'general',   color: '#2b2b31', icon: '🗑️', label: 'general waste bin' },
  { id: 'junk',      color: '#6a3bb0', icon: '🛸', label: 'space junk bin' },
];

export const BIN_IDS = BINS.map((b) => b.id);

const HAND_TUNED = {
  1: { bins: ['recycling', 'food'],                        count: 4,  visible: 1 },
  2: { bins: ['recycling', 'food', 'general'],             count: 6,  visible: 3 },
  3: { bins: ['recycling', 'food', 'general', 'junk'],     count: 8,  visible: 3 },
  4: { bins: ['recycling', 'food', 'general', 'junk'],     count: 10, visible: 3 },
  5: { bins: ['recycling', 'food', 'general', 'junk'],     count: 12, visible: 5 },
};

export function levelConfig(n) {
  const level = Math.max(1, Math.floor(Number(n) || 1));
  if (HAND_TUNED[level]) return { level, ...HAND_TUNED[level] };
  return {
    level,
    bins: [...BIN_IDS],
    count: Math.min(20, 12 + 2 * (level - 5)),
    visible: 5,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/bins-on-the-moon.test.mjs`
Expected: PASS (4–5 tests, 0 failures).

- [ ] **Step 5: Commit**

```bash
git add games/bins-on-the-moon/levels.js tests/bins-on-the-moon.test.mjs
git commit -m "feat(bins-on-the-moon): bin definitions and level configuration"
```

---

## Task 2: `levels.js` — `pickItems`

**Files:**
- Modify: `games/bins-on-the-moon/levels.js`
- Modify: `tests/bins-on-the-moon.test.mjs`

**Interfaces:**
- Consumes: `BIN_IDS` from Task 1.
- Produces:
  - `export function pickItems(pool, binIds, count, rng = Math.random)` → `Item[]` of length `count`, where `Item = { emoji: string, name: string, bin: string }`.
  - Guarantees: every id in `binIds` appears at least once; every returned item's `bin` is in `binIds`; deterministic for a given `rng`. Throws if no pool item matches `binIds`.

- [ ] **Step 1: Write the failing test**

Append to `tests/bins-on-the-moon.test.mjs`:

```js
import { pickItems } from '../games/bins-on-the-moon/levels.js';

// Small deterministic PRNG for tests (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL = [
  ...Array.from({ length: 6 }, (_, i) => ({ emoji: 'r', name: `r${i}`, bin: 'recycling' })),
  ...Array.from({ length: 6 }, (_, i) => ({ emoji: 'f', name: `f${i}`, bin: 'food' })),
  ...Array.from({ length: 6 }, (_, i) => ({ emoji: 'g', name: `g${i}`, bin: 'general' })),
  ...Array.from({ length: 6 }, (_, i) => ({ emoji: 'j', name: `j${i}`, bin: 'junk' })),
];

test('pickItems: returns exactly count items', () => {
  assert.equal(pickItems(POOL, ['recycling', 'food'], 4, seeded(1)).length, 4);
  assert.equal(pickItems(POOL, ['recycling', 'food', 'general', 'junk'], 12, seeded(1)).length, 12);
});

test('pickItems: only returns items for the active bins', () => {
  const picks = pickItems(POOL, ['recycling', 'food'], 4, seeded(2));
  assert.ok(picks.every((it) => it.bin === 'recycling' || it.bin === 'food'));
});

test('pickItems: every active bin appears at least once', () => {
  const bins = ['recycling', 'food', 'general', 'junk'];
  for (let s = 1; s <= 20; s++) {
    const picks = pickItems(POOL, bins, 8, seeded(s));
    for (const b of bins) {
      assert.ok(picks.some((it) => it.bin === b), `seed ${s}: bin ${b} missing`);
    }
  }
});

test('pickItems: deterministic for a given rng seed', () => {
  const a = pickItems(POOL, ['recycling', 'food', 'general'], 6, seeded(7));
  const b = pickItems(POOL, ['recycling', 'food', 'general'], 6, seeded(7));
  assert.deepEqual(a, b);
});

test('pickItems: throws when the pool has nothing for the bins', () => {
  assert.throws(() => pickItems([{ emoji: 'x', name: 'x', bin: 'nope' }], ['recycling'], 4, seeded(1)));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bins-on-the-moon.test.mjs`
Expected: FAIL — `pickItems is not a function` / import error.

- [ ] **Step 3: Write the minimal implementation**

Append to `games/bins-on-the-moon/levels.js`:

```js
export function pickItems(pool, binIds, count, rng = Math.random) {
  const active = new Set(binIds);
  const available = pool.filter((it) => active.has(it.bin));
  if (available.length === 0) {
    throw new Error(`pickItems: no pool items for bins [${binIds.join(', ')}]`);
  }
  const pickFrom = (arr) => arr[Math.floor(rng() * arr.length)];

  const result = [];
  // 1. Guarantee one item per active bin (space permitting).
  for (const id of binIds) {
    if (result.length >= count) break;
    result.push(pickFrom(available.filter((it) => it.bin === id)));
  }
  // 2. Fill the rest — prefer items not yet used, never repeat back-to-back.
  while (result.length < count) {
    const unused = available.filter((it) => !result.includes(it));
    const pool2 = (unused.length ? unused : available).filter((it) => it !== result[result.length - 1]);
    result.push(pickFrom(pool2.length ? pool2 : available));
  }
  // 3. Fisher-Yates shuffle so the guaranteed picks aren't front-loaded.
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/bins-on-the-moon.test.mjs`
Expected: PASS (all tests, 0 failures).

- [ ] **Step 5: Commit**

```bash
git add games/bins-on-the-moon/levels.js tests/bins-on-the-moon.test.mjs
git commit -m "feat(bins-on-the-moon): item selection with per-bin coverage guarantee"
```

---

## Task 3: `items.json` — the item pool + validation test

**Files:**
- Create: `games/bins-on-the-moon/items.json`
- Modify: `tests/bins-on-the-moon.test.mjs`

**Interfaces:**
- Consumes: `BIN_IDS` from Task 1.
- Produces: `items.json` with shape `{ "items": [{ "emoji": string, "name": string, "bin": string }, ...] }`, ≥ 6 items per bin, every `bin` ∈ `BIN_IDS`. Loaded at runtime by `game.js` via `fetch('items.json')`.

- [ ] **Step 1: Write the failing test**

Append to `tests/bins-on-the-moon.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const itemsPath = fileURLToPath(new URL('../games/bins-on-the-moon/items.json', import.meta.url));

test('items.json: valid shape and every bin well covered', () => {
  const data = JSON.parse(readFileSync(itemsPath, 'utf8'));
  assert.ok(Array.isArray(data.items) && data.items.length >= 24);

  const perBin = Object.fromEntries(BIN_IDS.map((id) => [id, 0]));
  for (const it of data.items) {
    assert.equal(typeof it.emoji, 'string');
    assert.ok(it.emoji.length > 0);
    assert.equal(typeof it.name, 'string');
    assert.ok(it.name.trim().length > 0);
    assert.ok(BIN_IDS.includes(it.bin), `bad bin: ${it.bin}`);
    perBin[it.bin]++;
  }
  for (const id of BIN_IDS) {
    assert.ok(perBin[id] >= 6, `bin ${id} has only ${perBin[id]} items (need >= 6)`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bins-on-the-moon.test.mjs`
Expected: FAIL — `ENOENT` reading `items.json`.

- [ ] **Step 3: Create the file**

Create `games/bins-on-the-moon/items.json`:

```json
{
  "items": [
    { "emoji": "📰", "name": "newspaper", "bin": "recycling" },
    { "emoji": "📦", "name": "cardboard box", "bin": "recycling" },
    { "emoji": "🥫", "name": "tin can", "bin": "recycling" },
    { "emoji": "🍾", "name": "glass bottle", "bin": "recycling" },
    { "emoji": "🧃", "name": "juice carton", "bin": "recycling" },
    { "emoji": "📄", "name": "sheet of paper", "bin": "recycling" },
    { "emoji": "🗞️", "name": "rolled-up newspaper", "bin": "recycling" },
    { "emoji": "🧴", "name": "plastic bottle", "bin": "recycling" },
    { "emoji": "🍌", "name": "banana peel", "bin": "food" },
    { "emoji": "🍎", "name": "apple core", "bin": "food" },
    { "emoji": "🥚", "name": "eggshell", "bin": "food" },
    { "emoji": "🍞", "name": "bread crust", "bin": "food" },
    { "emoji": "🌽", "name": "corn cob", "bin": "food" },
    { "emoji": "🍗", "name": "chicken bone", "bin": "food" },
    { "emoji": "🥕", "name": "carrot top", "bin": "food" },
    { "emoji": "🍊", "name": "orange peel", "bin": "food" },
    { "emoji": "🛍️", "name": "plastic bag", "bin": "general" },
    { "emoji": "🧸", "name": "broken teddy", "bin": "general" },
    { "emoji": "🧦", "name": "odd sock", "bin": "general" },
    { "emoji": "🖍️", "name": "broken crayon", "bin": "general" },
    { "emoji": "🪥", "name": "old toothbrush", "bin": "general" },
    { "emoji": "🎈", "name": "popped balloon", "bin": "general" },
    { "emoji": "🩹", "name": "used plaster", "bin": "general" },
    { "emoji": "🧽", "name": "worn-out sponge", "bin": "general" },
    { "emoji": "🛰️", "name": "old satellite", "bin": "junk" },
    { "emoji": "🪐", "name": "spare planet", "bin": "junk" },
    { "emoji": "⭐", "name": "fallen star", "bin": "junk" },
    { "emoji": "👽", "name": "lost alien", "bin": "junk" },
    { "emoji": "☄️", "name": "little comet", "bin": "junk" },
    { "emoji": "🚀", "name": "broken rocket", "bin": "junk" },
    { "emoji": "🌗", "name": "moon rock", "bin": "junk" },
    { "emoji": "🔭", "name": "old telescope", "bin": "junk" }
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/bins-on-the-moon.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add games/bins-on-the-moon/items.json tests/bins-on-the-moon.test.mjs
git commit -m "feat(bins-on-the-moon): item pool (8 per bin)"
```

---

## Task 4: `drag.js` — `binAtPoint`

**Files:**
- Create: `games/bins-on-the-moon/drag.js`
- Modify: `tests/bins-on-the-moon.test.mjs`

**Interfaces:**
- Produces:
  - `export function binAtPoint(point, targets)` → `string | null`. `point` is `{ x: number, y: number }`; `targets` is `[{ id: string, rect: { left, top, right, bottom } }]`. Returns the `id` of the first target whose rect contains the point (inclusive), else `null`.

- [ ] **Step 1: Write the failing test**

Append to `tests/bins-on-the-moon.test.mjs`:

```js
import { binAtPoint } from '../games/bins-on-the-moon/drag.js';

const TARGETS = [
  { id: 'recycling', rect: { left: 0,   top: 0, right: 100, bottom: 100 } },
  { id: 'food',      rect: { left: 120, top: 0, right: 220, bottom: 100 } },
];

test('binAtPoint: point inside a target returns its id', () => {
  assert.equal(binAtPoint({ x: 50, y: 50 }, TARGETS), 'recycling');
  assert.equal(binAtPoint({ x: 150, y: 10 }, TARGETS), 'food');
});

test('binAtPoint: edges are inclusive', () => {
  assert.equal(binAtPoint({ x: 100, y: 100 }, TARGETS), 'recycling');
});

test('binAtPoint: point outside every target returns null', () => {
  assert.equal(binAtPoint({ x: 110, y: 50 }, TARGETS), null);
  assert.equal(binAtPoint({ x: 500, y: 500 }, TARGETS), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bins-on-the-moon.test.mjs`
Expected: FAIL — cannot find `drag.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `games/bins-on-the-moon/drag.js`:

```js
// binAtPoint is pure (used by game.js at drop time and by the test suite).
// makeDraggable is DOM-only and is added in Task 7.

export function binAtPoint(point, targets) {
  for (const t of targets) {
    const r = t.rect;
    if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) {
      return t.id;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/bins-on-the-moon.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add games/bins-on-the-moon/drag.js tests/bins-on-the-moon.test.mjs
git commit -m "feat(bins-on-the-moon): binAtPoint drop hit-testing"
```

---

## Task 5: Page shell + static moon scene (`index.html`, `game.css`, `scene.js`)

**Files:**
- Create: `games/bins-on-the-moon/index.html`
- Create: `games/bins-on-the-moon/game.css`
- Create: `games/bins-on-the-moon/scene.js`

**Interfaces:**
- Consumes: `BINS` from `levels.js`.
- Produces:
  - `export function buildScene(root, binIds)` → scene controller object:
    - `padEl: HTMLElement` — container the draggable items live in
    - `binEls: Map<string, HTMLElement>` — one entry per id in `binIds`, in `BINS` order
    - `mascotEl: HTMLElement`
    - `progressEl: HTMLElement`
    - `setProgress(done: number, total: number): void` — renders `total` pips, `done` of them filled
    - `binRects(): [{ id, rect }]` — live `getBoundingClientRect()` of each bin, shaped for `binAtPoint`
    - `setMascot(mood): void` — mood ∈ `'idle' | 'cheer' | 'oops' | 'jump'` (Task 5 may stub non-idle as no-ops; Task 9 fills them in)
  - `buildScene` empties `root` before building.

- [ ] **Step 1: Create the page shell**

Create `games/bins-on-the-moon/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bins on the Moon · Arcade Attic</title>
  <link rel="icon" href="../../assets/favicon.svg">
  <link rel="stylesheet" href="../../assets/styles.css">
  <link rel="stylesheet" href="game.css">
</head>
<body>
  <main class="aa-game">
    <div class="aa-game-top">
      <a class="aa-back" href="../../">← The Attic</a>
      <h1 class="aa-game-title">Bins on the Moon</h1>
    </div>
    <div id="game" class="bm"></div>
  </main>
  <script type="module" src="scene-preview.js"></script>
</body>
</html>
```

Note: the final `<script>` will become `game.js` in Task 6. For this task it points at a throwaway `scene-preview.js` so the scene can be eyeballed; **delete `scene-preview.js` at the end of this task** and change the script tag to `game.js` in Task 6.

- [ ] **Step 2: Write `scene.js`**

Create `games/bins-on-the-moon/scene.js`:

```js
import { BINS } from './levels.js';

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

export function buildScene(root, binIds) {
  root.replaceChildren();
  root.classList.add('bm-scene');

  // Backdrop
  el('div', 'bm-stars', root);
  el('div', 'bm-earth', root);
  const craters = el('div', 'bm-craters', root);
  el('div', 'bm-crater bm-crater-a', craters);
  el('div', 'bm-crater bm-crater-b', craters);
  el('div', 'bm-ground', root);

  // Progress pips
  const progressEl = el('div', 'bm-progress', root);

  // Item pad
  const padEl = el('div', 'bm-pad', root);

  // Mascot
  const mascotEl = el('div', 'bm-mascot', root);
  mascotEl.textContent = '🧑‍🚀';
  mascotEl.dataset.mood = 'idle';

  // Bins (only the active ones, in BINS order)
  const binRow = el('div', 'bm-bins', root);
  const binEls = new Map();
  for (const def of BINS) {
    if (!binIds.includes(def.id)) continue;
    const bin = el('button', 'bm-bin', binRow);
    bin.type = 'button';
    bin.dataset.bin = def.id;
    bin.style.setProperty('--bin-color', def.color);
    bin.setAttribute('aria-label', def.label);
    el('div', 'bm-bin-lid', bin);
    const face = el('div', 'bm-bin-face', bin);
    face.textContent = def.icon;
    binEls.set(def.id, bin);
  }

  function setProgress(done, total) {
    progressEl.replaceChildren();
    for (let i = 0; i < total; i++) {
      const pip = el('div', 'bm-pip', progressEl);
      if (i < done) pip.classList.add('is-done');
    }
  }

  function binRects() {
    return [...binEls.entries()].map(([id, node]) => ({
      id,
      rect: node.getBoundingClientRect(),
    }));
  }

  function setMascot(mood) {
    mascotEl.dataset.mood = mood;
    mascotEl.textContent = mood === 'cheer' || mood === 'jump' ? '🙌' : mood === 'oops' ? '🤷' : '🧑‍🚀';
  }

  return { padEl, binEls, mascotEl, progressEl, setProgress, binRects, setMascot };
}
```

- [ ] **Step 3: Write `game.css`**

Create `games/bins-on-the-moon/game.css`. This is the full stylesheet for the game; later tasks append animation rules to it.

```css
/* Bins on the Moon — all game visuals. Shared tokens come from ../../assets/styles.css */

.bm {
  position: relative;
  width: 100%;
  min-height: min(72vh, 560px);
  overflow: hidden;
  border: 2px solid var(--edge);
  border-radius: var(--radius);
  background: linear-gradient(180deg, #05030f 0%, #140f2e 60%, #241a44 100%);
  box-shadow: var(--shadow);
  user-select: none;
  touch-action: manipulation;
}

/* ---------- Backdrop ---------- */
.bm-stars {
  position: absolute; inset: 0;
  background-image:
    radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 70% 15%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 40% 60%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 85% 45%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 55% 25%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 12% 75%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 92% 80%, #fff, transparent);
  opacity: 0.8;
}
.bm-earth {
  position: absolute; top: 18px; right: 20px;
  width: 54px; height: 54px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #6fb3ff, #2f6fd0 60%, #123a7a);
  box-shadow: 0 0 18px rgba(111, 179, 255, 0.5);
}
.bm-ground {
  position: absolute; left: -10%; right: -10%; bottom: -40px;
  height: 160px; border-radius: 50% 50% 0 0;
  background: radial-gradient(circle at 50% 0, #d7d2e4, #9d97b4 70%, #6d6784);
}
.bm-craters { position: absolute; inset: 0; }
.bm-crater {
  position: absolute; border-radius: 50%;
  background: rgba(0, 0, 0, 0.18);
}
.bm-crater-a { width: 46px; height: 16px; left: 16%; bottom: 44px; }
.bm-crater-b { width: 30px; height: 12px; right: 24%; bottom: 70px; }

/* ---------- Progress pips ---------- */
.bm-progress {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;
  max-width: 80%;
}
.bm-pip {
  width: 12px; height: 12px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.bm-pip.is-done { background: var(--neon); border-color: var(--neon); box-shadow: 0 0 8px var(--neon); }

/* ---------- Item pad ---------- */
.bm-pad {
  position: absolute; left: 50%; top: 34%; transform: translate(-50%, -50%);
  display: flex; gap: clamp(10px, 4vw, 26px); flex-wrap: wrap;
  justify-content: center; align-items: center;
  width: min(88%, 460px);
}
.bm-item {
  font-size: clamp(40px, 12vw, 68px);
  line-height: 1;
  background: none; border: 0; padding: 4px; margin: 0;
  cursor: grab;
  touch-action: none;              /* REQUIRED — stops the drag scrolling the page */
  will-change: transform;
  transition: transform 0.12s ease;
}
.bm-item.dragging { cursor: grabbing; z-index: 20; }

/* ---------- Mascot ---------- */
.bm-mascot {
  position: absolute; left: 10px; bottom: 74px;
  font-size: clamp(38px, 10vw, 60px);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}

/* ---------- Bins ---------- */
.bm-bins {
  position: absolute; left: 0; right: 0; bottom: 14px;
  display: flex; justify-content: center; gap: clamp(8px, 3vw, 22px);
  padding: 0 10px;
}
.bm-bin {
  --bin-color: #444;
  position: relative;
  width: clamp(64px, 20vw, 104px);
  height: clamp(78px, 24vw, 120px);
  border: 3px solid #0c0a18;
  border-radius: 8px 8px 10px 10px;
  background: color-mix(in srgb, var(--bin-color) 82%, black);
  box-shadow: inset 0 -10px 0 rgba(0, 0, 0, 0.25), var(--shadow);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.bm-bin-lid {
  position: absolute; top: -9px; left: -3px; right: -3px; height: 12px;
  background: var(--bin-color);
  border: 3px solid #0c0a18; border-radius: 6px;
  transform-origin: left center;
}
.bm-bin-face { font-size: clamp(26px, 8vw, 44px); line-height: 1; }

/* ---------- Reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .bm-item { transition: none; }
}
```

- [ ] **Step 4: Preview the scene**

Create a throwaway `games/bins-on-the-moon/scene-preview.js`:

```js
import { buildScene } from './scene.js';
import { levelConfig } from './levels.js';

const scene = buildScene(document.getElementById('game'), levelConfig(3).bins);
scene.setProgress(3, 8);
```

Run from the repo root: `python -m http.server 8000`
Open: `http://localhost:8000/games/bins-on-the-moon/`

Verify:
- The `← The Attic` back link and `Bins on the Moon` title render via the shared shell.
- Dark scene with stars, a blue Earth top-right, a light "ground" curve at the bottom.
- Four bins in a row on the ground — blue, brown, black, purple, each with its emoji.
- 8 progress pips near the top, 3 filled (glowing).
- An astronaut emoji near the bottom-left.
- Resize the window narrow (~360px): bins shrink and stay on one row, nothing overflows the container horizontally.

- [ ] **Step 5: Remove the preview and commit**

```bash
rm games/bins-on-the-moon/scene-preview.js
git add games/bins-on-the-moon/index.html games/bins-on-the-moon/game.css games/bins-on-the-moon/scene.js
git commit -m "feat(bins-on-the-moon): page shell and static moon scene"
```

(`index.html` still references `scene-preview.js`; Task 6 switches it to `game.js`. That's fine — the page is not linked from anywhere yet.)

---

## Task 6: `game.js` — title screen, persistence, level start

**Files:**
- Create: `games/bins-on-the-moon/game.js`
- Modify: `games/bins-on-the-moon/index.html:19` (script `src`)
- Modify: `games/bins-on-the-moon/game.css` (append title-screen rules)

**Interfaces:**
- Consumes: `levelConfig`, `pickItems`, `BIN_IDS` from `levels.js`; `buildScene` from `scene.js`.
- Produces (module-internal, no exports — this is the entry point):
  - `loadProgress(): number` / `saveProgress(n): void` / `resetProgress(): void` wrapping `localStorage['bins-on-the-moon:progress']` in try/catch.
  - `showTitle()` renders the title screen into `#game`.
  - `startLevel(n)` builds the scene for `levelConfig(n).bins` and an empty pad (item flow added in Task 7).

- [ ] **Step 1: Point the page at `game.js`**

In `games/bins-on-the-moon/index.html`, change:

```html
  <script type="module" src="scene-preview.js"></script>
```

to:

```html
  <script type="module" src="game.js"></script>
```

- [ ] **Step 2: Write `game.js`**

Create `games/bins-on-the-moon/game.js`:

```js
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
```

- [ ] **Step 3: Append title-screen CSS**

Append to `games/bins-on-the-moon/game.css`:

```css
/* ---------- Title screen ---------- */
.bm-title {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px;
}
.bm-play {
  font-size: clamp(48px, 16vw, 92px);
  line-height: 1;
  padding: 18px 28px;
  border-radius: 20px;
}
.bm-startover {
  font-size: 20px;
  width: 40px; height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: var(--ink);
  border: 1px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  opacity: 0.5;
}
.bm-startover:hover { opacity: 1; }
```

- [ ] **Step 4: Verify in the browser**

Run from repo root: `python -m http.server 8000`
Open: `http://localhost:8000/games/bins-on-the-moon/`

Verify:
- Title screen: big 🚀 button centred, small ↺ below it.
- Click 🚀 → scene for **level 1** appears with **2 bins** (blue recycling, brown food), 4 empty progress pips.
- In DevTools console: `localStorage.setItem('bins-on-the-moon:progress', '3')`, reload, click 🚀 → scene shows **4 bins**, 8 pips. (Resume works.)
- Click ↺ instead → scene shows level 1 (2 bins); `localStorage.getItem('bins-on-the-moon:progress')` is `null`.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add games/bins-on-the-moon/game.js games/bins-on-the-moon/index.html games/bins-on-the-moon/game.css
git commit -m "feat(bins-on-the-moon): title screen, resume-level persistence, level start"
```

---

## Task 7: `makeDraggable` + the core sort loop

**Files:**
- Modify: `games/bins-on-the-moon/drag.js` (add `makeDraggable`)
- Modify: `games/bins-on-the-moon/game.js` (spawn items, wire drag, handle correct/wrong, refill, detect level end)
- Modify: `games/bins-on-the-moon/game.css` (pad-item bob)

**Interfaces:**
- Consumes: `binAtPoint` (Task 4), `buildScene` controller (Task 5), `state` (Task 6).
- Produces:
  - `export function makeDraggable(el, { onGrab, onDrop, onReturn })` → `{ destroy() }`.
    - `onDrop({ x, y })` **must return `true`** if the drop was consumed (caller removes `el`); any other return value triggers an animated snap-back to the element's original transform, then `onReturn?.()`.
  - `game.js`: `spawnNext()`, `handleDrop(entry, point) → boolean`, `onCorrect(entry)`, `onWrong(entry, correctBinId)`, `checkLevelDone()`.

- [ ] **Step 1: Add `makeDraggable` to `drag.js`**

Append to `games/bins-on-the-moon/drag.js`:

```js
const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function makeDraggable(el, { onGrab, onDrop, onReturn } = {}) {
  let dragging = false;
  let startX = 0;
  let startY = 0;

  function move(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.15)`;
  }

  function up(e) {
    if (!dragging) return;
    dragging = false;
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.classList.remove('dragging');

    const consumed = onDrop?.({ x: e.clientX, y: e.clientY }) === true;
    if (consumed) return;

    if (prefersReducedMotion()) {
      el.style.transform = '';
      onReturn?.();
      return;
    }
    el.style.transition = 'transform 0.3s ease';
    el.style.transform = '';
    const done = () => {
      el.style.transition = '';
      el.removeEventListener('transitionend', done);
      onReturn?.();
    };
    el.addEventListener('transitionend', done);
  }

  function down(e) {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    try { el.setPointerCapture(e.pointerId); } catch {}
    el.classList.add('dragging');
    onGrab?.();
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  el.addEventListener('pointerdown', down);
  return { destroy() { el.removeEventListener('pointerdown', down); } };
}
```

- [ ] **Step 2: Wire the sort loop into `game.js`**

In `games/bins-on-the-moon/game.js`:

1. Update the import from `./drag.js`:

```js
import { binAtPoint, makeDraggable } from './drag.js';
```

2. Add `VISIBLE` bookkeeping — replace the body of `startLevel` after `scene = buildScene(...)` with:

```js
  scene = buildScene(root, cfg.bins);
  scene.setProgress(0, state.total);
  state.visible = cfg.visible;
  for (let i = 0; i < state.visible; i++) spawnNext();
```

3. Add these functions above `main()`:

```js
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
```

- [ ] **Step 3: Add the pad-item bob animation to `game.css`**

Append to `games/bins-on-the-moon/game.css`:

```css
@keyframes bm-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}
.bm-item { animation: bm-bob 2.4s ease-in-out infinite; }
.bm-item.dragging { animation: none; }

@media (prefers-reduced-motion: reduce) {
  .bm-item { animation: none; }
}
```

- [ ] **Step 4: Verify in the browser**

`python -m http.server 8000`, open `http://localhost:8000/games/bins-on-the-moon/`.

Verify **level 1** (start over first with ↺):
- Exactly **one** item floats in the pad, bobbing.
- Drag it onto the **correct** bin → it disappears, one pip fills, the next item appears.
- Drag an item onto the **wrong** bin → it springs back to the pad, astronaut briefly shows 🤷, pip count unchanged.
- Drop an item in empty space → it floats back, no penalty.
- Sort all 4 → console logs `level 1 complete`.
- Touch: in DevTools device emulation (or a real tablet), the same drags work and the page does **not** scroll while dragging.

Verify **level 2** (`localStorage.setItem('bins-on-the-moon:progress','2')`, reload, 🚀):
- **Three** items in the pad at once; sorting one brings in a fourth; etc.

- [ ] **Step 5: Commit**

```bash
git add games/bins-on-the-moon/drag.js games/bins-on-the-moon/game.js games/bins-on-the-moon/game.css
git commit -m "feat(bins-on-the-moon): pointer dragging and the core sort loop"
```

---

## Task 8: Level-complete screen + advance + save

**Files:**
- Modify: `games/bins-on-the-moon/scene.js` (add `celebrate()`)
- Modify: `games/bins-on-the-moon/game.js` (`showLevelComplete()`, save on advance)
- Modify: `games/bins-on-the-moon/game.css` (complete-overlay rules)

**Interfaces:**
- Consumes: scene controller, `state`, `saveProgress` (Task 6).
- Produces:
  - `scene.celebrate()` — plays a wordless win flourish (mascot → 'jump', bins bounce). Confetti particles are added in Task 9; a stub that just calls `setMascot('jump')` is acceptable here.
  - `game.js` `showLevelComplete()` — overlay with a single large `→` button; on click: `saveProgress(state.level + 1)` then `startLevel(state.level + 1)`.

- [ ] **Step 1: Add `celebrate()` to `scene.js`**

In `games/bins-on-the-moon/scene.js`, before `return { ... }`, add:

```js
  function celebrate() {
    setMascot('jump');
    for (const bin of binEls.values()) {
      bin.classList.remove('bm-bin-bounce');
      void bin.offsetWidth;              // restart the animation
      bin.classList.add('bm-bin-bounce');
    }
  }
```

and add `celebrate` to the returned object:

```js
  return { padEl, binEls, mascotEl, progressEl, setProgress, binRects, setMascot, celebrate };
```

- [ ] **Step 2: Replace the stub in `checkLevelDone`**

In `games/bins-on-the-moon/game.js`, replace `checkLevelDone` with:

```js
function checkLevelDone() {
  if (state.queue.length === 0 && state.pad.length === 0) {
    showLevelComplete();
  }
}

function showLevelComplete() {
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
```

- [ ] **Step 3: Add complete-overlay + bin-bounce CSS**

Append to `games/bins-on-the-moon/game.css`:

```css
/* ---------- Level complete ---------- */
.bm-complete {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(4, 2, 14, 0.55);
  backdrop-filter: blur(1px);
}
.bm-next {
  font-size: clamp(44px, 14vw, 80px);
  line-height: 1;
  padding: 12px 30px;
  border-radius: 18px;
}
@keyframes bm-bin-bounce {
  0%, 100% { transform: translateY(0); }
  30%      { transform: translateY(-14px); }
  60%      { transform: translateY(0); }
}
.bm-bin-bounce { animation: bm-bin-bounce 0.6s ease; }

@media (prefers-reduced-motion: reduce) {
  .bm-bin-bounce { animation: none; }
}
```

- [ ] **Step 4: Verify in the browser**

`python -m http.server 8000`, open the game, ↺ to level 1.

Verify:
- Sort all items in level 1 → dark overlay with a big `→` button; bins do a quick bounce; astronaut changes.
- Click `→` → level 2 loads (3 bins, 6 pips, 3 items in the pad).
- `localStorage.getItem('bins-on-the-moon:progress')` is now `'2'`.
- Reload → 🚀 resumes at level 2.
- Play through level 5 → level 6 loads with more items (14) and still 4 bins. (Endless works.)

- [ ] **Step 5: Commit**

```bash
git add games/bins-on-the-moon/scene.js games/bins-on-the-moon/game.js games/bins-on-the-moon/game.css
git commit -m "feat(bins-on-the-moon): level-complete screen, advance and save"
```

---

## Task 9: Feedback polish — correct/wrong/idle cues, reduced motion

**Files:**
- Modify: `games/bins-on-the-moon/scene.js` (`pulseBin`, `wiggleBin`, `arcTo`, `spawnSparkle`, `confetti`; flesh out `setMascot`)
- Modify: `games/bins-on-the-moon/game.js` (call the cues; add the idle-hint timer; fly-to-bin on correct)
- Modify: `games/bins-on-the-moon/game.css` (all the animation rules + reduced-motion fallbacks)

**Interfaces:**
- Consumes: scene controller, `state`.
- Produces (added to the scene controller):
  - `pulseBin(id)` — pulse + glow the named bin 2–3×.
  - `wiggleBin(id)` — squash-stretch the named bin once.
  - `arcTo(id, fromEl)` — briefly draw a dashed arc from `fromEl`'s centre to the bin; auto-removes after ~1.6s.
  - `spawnSparkle(id)` — short particle burst at the bin.
  - `confetti()` — falling confetti across the scene for ~1.5s.
  - `game.js`: `startIdleTimer()` / `clearIdleTimer()` — fire the hint after 5000 ms of no `pointerdown`.

- [ ] **Step 1: Add the cue methods to `scene.js`**

In `games/bins-on-the-moon/scene.js`:

1. Track a reduced-motion flag near the top of `buildScene`:

```js
  const reduce = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
```

2. Before `return { ... }`, add:

```js
  function restart(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    node.addEventListener('animationend', () => node.classList.remove(cls), { once: true });
  }

  function pulseBin(id) {
    const bin = binEls.get(id);
    if (bin) restart(bin, 'bm-bin-pulse');
  }

  function wiggleBin(id) {
    const bin = binEls.get(id);
    if (bin) restart(bin, 'bm-bin-wiggle');
  }

  function arcTo(id, fromEl) {
    const bin = binEls.get(id);
    if (!bin) return;
    const host = root.getBoundingClientRect();
    const a = fromEl.getBoundingClientRect();
    const b = bin.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - host.left;
    const y1 = a.top + a.height / 2 - host.top;
    const x2 = b.left + b.width / 2 - host.left;
    const y2 = b.top + b.height / 2 - host.top;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'bm-arc');
    svg.setAttribute('width', String(host.width));
    svg.setAttribute('height', String(host.height));
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const midX = (x1 + x2) / 2;
    const midY = Math.min(y1, y2) - 40;
    path.setAttribute('d', `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`);
    svg.appendChild(path);
    root.appendChild(svg);
    setTimeout(() => svg.remove(), 1600);
  }

  function spawnSparkle(id) {
    if (reduce) return;
    const bin = binEls.get(id);
    if (!bin) return;
    const host = root.getBoundingClientRect();
    const b = bin.getBoundingClientRect();
    const cx = b.left + b.width / 2 - host.left;
    const cy = b.top - host.top;
    for (let i = 0; i < 8; i++) {
      const s = el('div', 'bm-sparkle', root);
      const ang = (Math.PI * 2 * i) / 8;
      s.style.left = `${cx}px`;
      s.style.top = `${cy}px`;
      s.style.setProperty('--dx', `${Math.cos(ang) * 40}px`);
      s.style.setProperty('--dy', `${Math.sin(ang) * 40}px`);
      s.addEventListener('animationend', () => s.remove(), { once: true });
    }
  }

  function confetti() {
    if (reduce) return;
    for (let i = 0; i < 40; i++) {
      const c = el('div', 'bm-confetti', root);
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = ['#ffd34d', '#ff5d73', '#3ddc97', '#6fb3ff'][i % 4];
      c.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
      c.addEventListener('animationend', () => c.remove(), { once: true });
    }
  }
```

3. Update `celebrate` to also fire confetti:

```js
  function celebrate() {
    setMascot('jump');
    confetti();
    for (const bin of binEls.values()) restart(bin, 'bm-bin-bounce');
  }
```

4. Extend the returned object:

```js
  return {
    padEl, binEls, mascotEl, progressEl,
    setProgress, binRects, setMascot, celebrate,
    pulseBin, wiggleBin, arcTo, spawnSparkle, confetti,
  };
```

- [ ] **Step 2: Call the cues from `game.js`**

In `games/bins-on-the-moon/game.js`:

1. Add idle-timer state and helpers (above `spawnNext`):

```js
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
    }
    startIdleTimer();
  }, 5000);
}
```

2. In `spawnNext`, reset the idle timer on grab and after spawning. Change the `makeDraggable` call's `onGrab` and add a line at the end of the function:

```js
  entry.drag = makeDraggable(el, {
    onGrab: () => { el.style.animationPlayState = 'paused'; clearIdleTimer(); },
    onDrop: (point) => handleDrop(entry, point),
    onReturn: () => { el.style.animationPlayState = ''; startIdleTimer(); },
  });

  state.pad.push(entry);
  scene.padEl.appendChild(el);
  startIdleTimer();
```

3. Replace `onCorrect` with a version that flies the item into the bin then clears it:

```js
function onCorrect(entry) {
  entry.drag.destroy();
  clearIdleTimer();
  state.pad = state.pad.filter((e) => e !== entry);
  state.sorted += 1;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bin = scene.binEls.get(entry.item.bin);
  const finish = () => {
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

  const host = root.getBoundingClientRect();
  const a = entry.el.getBoundingClientRect();
  const b = bin.getBoundingClientRect();
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  entry.el.style.transition = 'transform 0.28s ease-in, opacity 0.28s ease-in';
  entry.el.style.transform = `translate(${dx}px, ${dy}px) scale(0.2)`;
  entry.el.style.opacity = '0';
  entry.el.addEventListener('transitionend', finish, { once: true });
}
```

4. Replace `onWrong` with:

```js
function onWrong(entry, correctBinId) {
  scene.setMascot('oops');
  setTimeout(() => scene.setMascot('idle'), 900);
  scene.pulseBin(correctBinId);
  scene.arcTo(correctBinId, entry.el);
  entry.el.classList.remove('bm-shake');
  void entry.el.offsetWidth;
  entry.el.classList.add('bm-shake');
  startIdleTimer();
}
```

5. In `showTitle` and `showLevelComplete`, call `clearIdleTimer()` first so timers don't leak across phases.

- [ ] **Step 3: Add all the animation CSS**

Append to `games/bins-on-the-moon/game.css`:

```css
/* ---------- Feedback cues ---------- */
@keyframes bm-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
.bm-item.bm-shake { animation: bm-shake 0.4s ease; }

@keyframes bm-bin-pulse {
  0%, 100% { transform: scale(1); box-shadow: inset 0 -10px 0 rgba(0,0,0,0.25), var(--shadow); }
  50% { transform: scale(1.08); box-shadow: 0 0 0 6px color-mix(in srgb, var(--neon) 60%, transparent), var(--shadow); }
}
.bm-bin-pulse { animation: bm-bin-pulse 0.5s ease 2; }

@keyframes bm-bin-wiggle {
  0%, 100% { transform: scale(1, 1); }
  30% { transform: scale(1.12, 0.9); }
  60% { transform: scale(0.94, 1.08); }
}
.bm-bin-wiggle { animation: bm-bin-wiggle 0.4s ease; }

.bm-arc { position: absolute; inset: 0; pointer-events: none; z-index: 15; }
.bm-arc path {
  fill: none;
  stroke: var(--neon);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 6 8;
  animation: bm-arc-dash 1s linear infinite;
}
@keyframes bm-arc-dash { to { stroke-dashoffset: -28; } }

.bm-sparkle {
  position: absolute; width: 8px; height: 8px; border-radius: 50%;
  background: var(--neon); pointer-events: none; z-index: 16;
  animation: bm-sparkle 0.5s ease-out forwards;
}
@keyframes bm-sparkle {
  to { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
}

.bm-confetti {
  position: absolute; top: -12px; width: 8px; height: 12px; border-radius: 2px;
  pointer-events: none; z-index: 30;
  animation: bm-confetti-fall 1.6s ease-in forwards;
}
@keyframes bm-confetti-fall {
  to { transform: translateY(120%) rotate(540deg); opacity: 0.2; }
}

/* Mascot moods */
.bm-mascot[data-mood="cheer"], .bm-mascot[data-mood="jump"] { animation: bm-hop 0.5s ease; }
@keyframes bm-hop { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }

@media (prefers-reduced-motion: reduce) {
  .bm-item.bm-shake,
  .bm-bin-pulse,
  .bm-bin-wiggle,
  .bm-mascot { animation: none; }
  .bm-arc path { animation: none; }
  .bm-bin-pulse { box-shadow: 0 0 0 6px color-mix(in srgb, var(--neon) 60%, transparent), var(--shadow); }
}
```

- [ ] **Step 4: Verify in the browser**

`python -m http.server 8000`, open the game.

Verify (normal motion):
- Correct drop → item shrinks/flies into the bin, sparkle burst, bin does a squash wiggle, a pip fills, astronaut hops.
- Wrong drop → item shakes and springs back, the **correct** bin pulses with a glow, a dashed arc curves from the item to that bin and fades after ~1.5s, astronaut shrugs.
- Do nothing for 5 seconds → the correct bin for the oldest item pulses + arc appears; repeats every 5s until you act.
- Finish a level → confetti falls across the scene.

Verify (reduced motion — emulate "prefers-reduced-motion: reduce" in DevTools rendering tab):
- Correct drop → item just disappears, pip fills, no sparkle/confetti.
- Wrong drop → item returns instantly, correct bin shows a static glow ring (no pulsing), arc appears but doesn't animate its dashes.
- No confetti on level complete.

- [ ] **Step 5: Commit**

```bash
git add games/bins-on-the-moon/scene.js games/bins-on-the-moon/game.js games/bins-on-the-moon/game.css
git commit -m "feat(bins-on-the-moon): correct/wrong/idle feedback cues and reduced-motion handling"
```

---

## Task 10: Repo integration — home-page card, README, full test run

**Files:**
- Modify: `games.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the finished game at `games/bins-on-the-moon/`.
- Produces: the game appears on the home page and is documented.

- [ ] **Step 1: Add the games.json entry**

In `games.json`, add this object as the **first** element of the `games` array (newest first — the home page sorts by `added` but keeping the file ordered helps humans):

```json
{
  "slug": "bins-on-the-moon",
  "title": "Bins on the Moon",
  "description": "Sort the space rubbish into the right bin — a tidy-up game for little astronauts.",
  "emoji": "🛸",
  "added": "2026-09-03"
}
```

- [ ] **Step 2: Verify the card on the home page**

`python -m http.server 8000`, open `http://localhost:8000/`.

Verify:
- Two cards now: "Bins on the Moon" (🛸) and "Tic-Tac-Toe".
- "Bins on the Moon" is first (newer `added` date).
- Clicking it navigates to `games/bins-on-the-moon/` and the title screen loads.
- The count reads "2 games".

- [ ] **Step 3: Update the README**

In `README.md`, under the `## Running it locally` section (after the server instructions), add a new section:

```markdown
## Running tests

Some games have a small pure-logic test file under `tests/`. Run them all with
Node's built-in test runner (Node 20+, no install needed):

```
node --test tests/
```
```

And in the `## How to add a new game` numbered list, after step 3 (the `games.json` step), add a sub-note:

```markdown
   > If your game has sortable/config data (like `bins-on-the-moon/items.json`),
   > keep it in a JSON file in the game folder — it's safe for non-coders (or the
   > kids) to edit without touching the game code.
```

- [ ] **Step 4: Run the full test suite**

Run: `node --test tests/`
Expected: PASS — all `bins-on-the-moon` tests (levels, pickItems, items.json, binAtPoint), 0 failures.

- [ ] **Step 5: Final manual smoke test**

`python -m http.server 8000`:
- Home page → "Bins on the Moon" card → title → 🚀.
- Play level 1 (1 item) → level 2 (3 items) → complete → level 3 introduces the purple space-junk bin.
- Reload mid-way → resumes at the saved level.
- ↺ on the title → back to level 1, progress cleared.
- Narrow the viewport to ~360px — bins, pad and items all fit, no horizontal scroll on the page body.

- [ ] **Step 6: Commit**

```bash
git add games.json README.md
git commit -m "feat(bins-on-the-moon): list on the home page and document tests"
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| Drag & drop, one item → one bin | 4, 7 |
| Relaxed levels, no timer/score/fail | 6, 7, 8 |
| ~5 hand-tuned levels + endless formula | 1 |
| Resume-level persistence + "start over" | 6 |
| Wrong drop → spring back + correct-bin pulse + arc, no text | 7, 9 |
| Idle 5s → same visual hint | 9 |
| 4 bins, colour + icon only, fixed order | 1, 5 |
| Emoji-only items, `name` for aria-label | 3, 7 |
| `items.json` content model | 3 |
| Level 1 one-at-a-time; working set 3 then 5 | 1, 7 |
| Per-bin coverage guarantee in item selection | 2 |
| Pointer Events (not HTML5 DnD), `touch-action: none` | 5, 7 |
| Astronaut mascot reactions | 5, 9 |
| Low-gravity bob / float-back | 7 |
| Sparkle + bin wiggle + confetti | 9 |
| `prefers-reduced-motion` | 7, 9 |
| Wordless level-complete + NEXT | 8 |
| Shared shell + tokens, relative paths | 5 |
| `games.json` entry | 10 |
| First game with tests; README note; no deps | 1, 10 |
| Pure `levels.js` importable by browser + test unchanged | 1, 2 |
| Keyboard play — out of scope for v1 | (none — intentionally deferred) |
| Sound — out of scope | (none — intentionally excluded) |

No gaps.

**2. Placeholder scan**

Every code step has full content. Tasks 5, 7, 8 contain forward-references ("added in Task N") but only for *behaviour layered on later* — each task still produces a working, testable deliverable (scene renders / sort loop works / advance works) before the polish lands. `scene-preview.js` is explicitly created and deleted within Task 5.

**3. Type consistency**

- `levelConfig(n)` → `{ level, bins, count, visible }` — same shape used in Tasks 1, 6, 7.
- `pickItems(pool, binIds, count, rng)` — signature identical in Tasks 2 and 6.
- `binAtPoint(point, targets)` where `targets = [{ id, rect }]` — matches `scene.binRects()`'s return shape (Task 5) exactly, consumed in Task 7.
- `makeDraggable(el, { onGrab, onDrop, onReturn })` → `{ destroy() }`; `onDrop` returns `true` to consume — consistent between Tasks 7 and its callers.
- Scene controller keys (`padEl`, `binEls`, `binRects`, `setProgress`, `setMascot`, `celebrate`, `pulseBin`, `wiggleBin`, `arcTo`, `spawnSparkle`, `confetti`) — defined in Task 5, extended (never renamed) in Tasks 8 and 9.
- `state` object keys (`phase`, `level`, `queue`, `pad`, `total`, `sorted`, `visible`) — `visible` introduced in Task 7 alongside its first use; all others in Task 6.
- `entry = { item, el, drag }` — same shape in `spawnNext`, `handleDrop`, `onCorrect`, `onWrong`.
- `localStorage` key string `'bins-on-the-moon:progress'` — one definition (`PROGRESS_KEY`), matches the spec.

Consistent.
