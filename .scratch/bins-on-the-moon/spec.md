# Bins on the Moon — design spec

Status: needs-triage
Slug: `bins-on-the-moon`
Date: 2026-09-03

## What it is

A sorting game for very young children (target age 3–6). Rubbish drifts in at a
moon base; the player drags each item into the correct bin. No reading required —
everything is communicated visually. Relaxed pace: no timer, no score, no
game-over. The reward is juice (animation, an astronaut mascot reacting) and
progressing through levels.

Idea came from the user's kids. Lives in the `arcade-attic` collection as one
self-contained game under `games/bins-on-the-moon/`.

## Design decisions (settled with the user)

- **Core interaction:** drag & drop, one item onto one bin.
- **Pace:** relaxed levels. Sort the level's batch, see a wordless celebration,
  go to the next level. No timer, no fail state.
- **Progression:** ~5 hand-tuned levels that teach the bins, then endless levels
  with more items. Only the furthest level reached is saved.
- **Wrong drop:** item springs back with a shake; the *correct* bin pulses/glows
  and a dashed arc points to it (no hint text). Kid must place it right to
  proceed. The same visual hint auto-fires after ~5s of no interaction.
- **Bins:** 4 max, identified by colour + emoji icon only, never words.
- **Audience 3–6, fully visual:** emoji-only items, picture-only bins, big drop
  targets, primary device is a tablet held in portrait.
- **Content:** sortable items in `items.json`; bin definitions in code.
- **Scope:** "playful" tier — astronaut mascot, low-gravity motion, sparkle
  feedback — but **no sound**.

## Bins

| id          | bin colour | icon | notes                                  |
| ----------- | ---------- | ---- | -------------------------------------- |
| `recycling` | blue       | ♻️   | paper, card, plastic, cans, glass      |
| `food`      | brown      | 🍎   | food scraps                            |
| `general`   | black      | 🗑️   | general waste / non-recyclable         |
| `junk`      | purple     | 🛸   | "Space Junk" — the moon-only bonus bin |

Bin definitions (id, colour, icon, `aria-label`) are a constant in `levels.js` —
they are structural, not content.

## Items

`items.json`:

```json
{
  "items": [
    { "emoji": "📰", "name": "newspaper",       "bin": "recycling" },
    { "emoji": "📦", "name": "cardboard box",   "bin": "recycling" },
    { "emoji": "🥫", "name": "tin can",         "bin": "recycling" },
    { "emoji": "🍾", "name": "glass bottle",    "bin": "recycling" },
    { "emoji": "🧃", "name": "juice carton",    "bin": "recycling" },
    { "emoji": "🍌", "name": "banana peel",     "bin": "food" },
    { "emoji": "🍎", "name": "apple core",      "bin": "food" },
    { "emoji": "🥚", "name": "eggshell",        "bin": "food" },
    { "emoji": "🍞", "name": "bread crust",     "bin": "food" },
    { "emoji": "🌽", "name": "corn cob",        "bin": "food" },
    { "emoji": "🛍️", "name": "plastic bag",     "bin": "general" },
    { "emoji": "🧸", "name": "broken teddy",    "bin": "general" },
    { "emoji": "🧦", "name": "old sock",        "bin": "general" },
    { "emoji": "🖍️", "name": "broken crayon",   "bin": "general" },
    { "emoji": "🪥", "name": "old toothbrush",  "bin": "general" },
    { "emoji": "🛰️", "name": "old satellite",   "bin": "junk" },
    { "emoji": "🪐", "name": "spare planet",    "bin": "junk" },
    { "emoji": "⭐", "name": "fallen star",     "bin": "junk" },
    { "emoji": "👽", "name": "lost alien",      "bin": "junk" },
    { "emoji": "☄️", "name": "little comet",    "bin": "junk" }
  ]
}
```

- `name` is used only for the drag handle's `aria-label`.
- `bin` is one of `recycling | food | general | junk`.
- The list above is a starting point. Aim for ~8–10 items per bin (~36 total)
  before launch; it can be expanded freely later by editing `items.json`.
- **Curation rule:** if an adult would hesitate about which bin, leave it out.
  This game is for 3-year-olds — every item must be unambiguous.

## Screens & flow

State machine: `title → playing → levelComplete → playing(next) → …`

### Title
Moon scene with a large 🚀 **PLAY** button. On press, resumes at the saved
**resume level** (from `localStorage`, default 1). A small, low-contrast "start
over" control in a corner (for a parent) resets the resume level to 1.

### Playing (one level)
- The level's items are a shuffled **queue**. A **landing pad** area in the
  upper-centre holds the currently-grabbable items — the *working set*:
  - Level 1: **1** item at a time.
  - Levels 2–4: up to **3** visible at once.
  - Levels 5+: up to **5** visible at once.
  - When an item is sorted, the next item in the queue drifts in to refill the
    pad. Items in the pad bob gently (low gravity), with staggered phase so they
    don't move in lockstep. Layout keeps them from overlapping.
- The player drags any pad item to a bin.
  - **Correct:** item shrinks into the bin, the lid flips, a small sparkle burst
    plays, the bin does a squash-stretch wiggle, the astronaut does an arms-up
    cheer, one progress pip lights, the pad refills.
  - **Wrong:** item shakes, springs back to the pad. The correct bin pulses
    (scale + glow ring) 2–3 times and a dashed arc briefly connects the item to
    it. The astronaut does an "oops" shrug. The item stays in play; the kid
    retries.
  - **Released over no bin:** item floats gently back to the pad, no penalty,
    no hint.
- **Idle hint:** after ~5s with no `pointerdown`, the "correct bin pulses + arc"
  animation fires for the oldest pad item.
- **Progress display:** a row of "moon-rock" pips near the top, one per item in
  the level, filling left-to-right as items are sorted. No numerals.
- Level ends when the queue and pad are both empty.

### Level complete
Wordless celebration: the astronaut jumps, confetti falls, the bins do a little
bounce. A large **→ NEXT** button advances. The resume level is saved as
`max(saved, currentLevel + 1)` — the next level becomes the resume point.
Levels past 5 use the same screen; the game never "ends".

## Difficulty

`levels.js` exports `levelConfig(n)` returning `{ bins, count, visible }`:

| Level | `bins`                                | `count`            | `visible` |
| ----- | ------------------------------------- | ------------------ | --------- |
| 1     | `[recycling, food]`                   | 4                  | 1         |
| 2     | `[recycling, food, general]`          | 6                  | 3         |
| 3     | `[recycling, food, general, junk]`    | 8                  | 3         |
| 4     | all four                             | 10                 | 3         |
| 5     | all four                             | 12                 | 5         |
| 6+    | all four                             | `min(20, 12 + 2·(n−5))` | 5    |

"Harder" is only ever *more items* and *more bins*. No timer, no speed-up.

`levels.js` also exports `pickItems(pool, bins, count, rng)`:
- returns `count` items whose `bin` is in `bins`
- no duplicate item objects in one level (sample without replacement; if
  `count` exceeds the filtered pool size, allow repeats but never back-to-back)
- **guarantees ≥1 item for every bin in `bins`** so each level exercises all its
  bins
- `rng` injectable for deterministic tests

## Drag mechanic

- **Pointer Events** (`pointerdown` / `pointermove` / `pointerup` +
  `setPointerCapture`). Not the HTML5 drag-and-drop API — Pointer Events behave
  identically for touch and mouse and avoid drag-ghost quirks.
- On grab: item lifts (scale ~1.15, raised shadow) and follows the pointer via
  `transform: translate(...)`.
- On release: hit-test the pointer position against each bin's bounding rect
  (`getBoundingClientRect`, cached per level / on resize). Nearest bin the point
  is inside wins; otherwise it's a "no bin" release.
- All motion via `transform` / `opacity` only.
- **Keyboard / switch access:** pad items are focusable; ←/→ move a bin
  highlight, Enter drops into the highlighted bin. Marked **nice-to-have — not
  required for v1** but the DOM structure should not preclude it.
- `prefers-reduced-motion`: replace bobbing, springs, confetti and pulses with
  instant state changes plus a static highlight ring for the hint.

## Persistence

Single key, wrapped in `try`/`catch` (private-mode safe):

```
localStorage['bins-on-the-moon:progress'] = <integer resume level, ≥1>
```

Written only on level-complete (`max(saved, currentLevel + 1)`) and on "start
over" (reset to `1`). Read once on load. Nothing else is stored.

## Files

```
games/bins-on-the-moon/
├── index.html     shell: shared .aa-game chrome + <div id="game">
├── game.css       moon scene, bins, pad, item, mascot, animations
├── game.js        orchestrator: state machine, level flow, drag wiring, render
├── levels.js      pure ES module: BINS constant, levelConfig(n), pickItems(...)
└── items.json     item pool
tests/
└── bins-on-the-moon.levels.test.mjs   node --test, no deps
```

- `game.js` owns all DOM. `levels.js` is pure (no `window`/`document`) so it can
  be imported by the test and by the browser unchanged.
- Reuses shared `../../assets/styles.css` — tokens (`--panel`, `--edge`,
  `--neon`, `--shadow`, `--font-display`), the `.aa-game` shell, `.aa-back`,
  `.aa-btn`. Bin colours are new locals in `game.css`.
- All paths relative (site is served from a subpath on `github.io`).

## Repo integration

- Append to `games.json`:
  ```json
  {
    "slug": "bins-on-the-moon",
    "title": "Bins on the Moon",
    "description": "Sort the space rubbish into the right bin — a tidy-up game for little astronauts.",
    "emoji": "🛸",
    "added": "2026-09-03"
  }
  ```
- **New repo convention:** this is the first game with tests. Add a one-line
  "Running tests" note to `README.md` (`node --test tests/*.mjs`) and mention
  `items.json` is safe for non-coders to edit. No test runner or `package.json`
  is added — `node --test` is built in, matching `world-cup-sweepstake`.

## Testing

`tests/bins-on-the-moon.levels.test.mjs`:
- `levelConfig`: level 1 → 2 bins / count 4 / visible 1; level 3 → 4 bins;
  level 5 → visible 5; level 20 → count capped at 20.
- `pickItems`: never returns more than `count`; every bin in `bins` appears at
  least once; only items whose `bin` is active are returned; with a seeded `rng`
  the result is deterministic; no duplicate item object when pool is large
  enough.

Manual QA checklist:
- Drag with touch (tablet, portrait) and with a mouse.
- Wrong drop → shake + spring back + correct-bin pulse + arc.
- Idle 5s → same hint fires.
- Level 1 shows one item; level 2 shows three; pad refills as items are sorted.
- Finish a level → celebration → NEXT → next level loads.
- Reload mid-game → resumes at the saved level; "start over" resets to 1.
- `prefers-reduced-motion` on → no bobbing/confetti, hint still readable.
- Card appears on the home page and links through.

## Out of scope (v1)

- Sound / music.
- Score, stars, timers, combos, any fail state.
- Per-level select screen (only "resume from furthest").
- Trick / ambiguous items and "edge case" teaching.
- Full keyboard/switch play (structure allows it; interaction not built).
