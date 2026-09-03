# Waffle Wednesday — design spec

Status: needs-triage
Slug: `waffle-wednesday`
Date: 2026-09-03

## What it is

A single-shift arcade game for the "Waffle Wednesday" friend group. Twenty
customers come to your waffle counter over one Wednesday. Each wants a waffle at
a specific **doneness** with a specific set of **toppings** (and sometimes
syrup). You toast, top, and serve — scored on accuracy and speed.

Six of the twenty customers are the Waffle Wednesday crew as recurring regulars,
each with a fixed signature order and their own dialogue, drawn from their
`world-cup-sweepstake` bios. **Three walkouts ends the shift early as "a bad
Wednesday"**; otherwise you play all twenty and a crew member reads your report
card.

Audience is adults — the tone is comedy / mild roast, a different register from
`bins-on-the-moon`, but the same technical shape: one self-contained folder
under `games/`, shared design tokens, pure-logic modules covered by `node
--test`.

## Design decisions (settled with the user)

- **Core loop:** a fixed shift of 20 customers (option 1 of the loop options —
  "Waffle Wednesday shift with the crew as regulars"). No endless mode.
- **Toasting:** a live doneness meter — waffle goes in, a doneness value climbs,
  you tap to eject, land it in the order's target band. Carryover heat after
  eject.
- **Toppings:** drag-to-match from a shelf, **plus** a hold-to-pour syrup
  sub-mechanic (option 2 of the topping options).
- **Perfect serve** needs doneness *and* toppings *and* syrup all correct;
  partial credit for getting some right.
- **Fail state:** 3 walkouts → "a bad Wednesday", shift ends early with a
  harsher roast (option 2 of the walkout options).
- **Waiting queue:** up to **3** visible waiting customers behind the one at the
  counter.
- **Regulars:** the 6 crew appear **once each at random (seeded) positions**,
  never two adjacent, and never in the first 2 slots (those are always generic
  ease-in customers).
- **Second toaster slot** unlocks partway through the shift and stays — it is
  the main source of late-shift pressure.
- **Crew art:** baked pixel-sprite data generated once from the
  `world-cup-sweepstake` headshots (option A — no binary assets committed).
- **Comedy layer (v1):** text only — ticket flavour, greeting, serve reaction,
  walkout huff, end-of-shift roast. No cutaway gags.
- **No sound** in v1 (matches `bins-on-the-moon`).

## Screens & flow

State machine: `title → shift → shiftComplete` — or `title → shift →
badWednesday` if 3 customers walk out.

### Title
Counter scene with a large 🧇 **START SHIFT** button. Shows the local best:
`Best Wednesday: 4,200 · "Chef's kiss"`. A small, low-contrast "reset best"
control in a corner.

### Shift (the game)
Layout, single column, top to bottom:

- **Counter scene** — the customer at the counter (pixel sprite for a regular,
  emoji avatar for a generic), their **order ticket**, and a **patience bar**
  that drains while they are at the counter. Behind them, up to **3** waiting
  customers shown smaller, each with their own (already visible) ticket. A
  waiting customer's patience does **not** drain until they reach the counter —
  you can read their order early and pre-toast for them once the second slot is
  open.
- **Station** —
  - **Toaster:** 1 slot at first, 2 after the unlock. Each slot shows a waffle
    and, once a waffle is dropped, its climbing **doneness meter** with a
    coloured gradient (pale → golden → toasty → dark → burnt) and a marker for
    the current value. The order's target band is drawn on the same scale.
  - **Plating area:** where an ejected (non-burnt) waffle sits while you top it.
  - **Topping shelf:** draggable topping items (catalogue in `customers.json`).
  - **Syrup bottle:** hold to pour; a pour gauge fills; release to stop.
  - **SERVE** button.

### Shift complete
A random crew member reads the report card: total score → a **title**
(`"Chef's kiss"` … `"Back to Wetherspoons"`), plus stats — perfect serves, tips
earned, walkouts. Saves the best if beaten. Buttons: **NEW SHIFT**, **← The
Attic**.

### Bad Wednesday
Same report-card screen, but the roast is harsher and it names the (up to 3)
customers who walked.

## The toasting mechanic

Doneness is a 0–100 scale. `0` = raw, `~50` = golden, `~80` = dark, `≥92` =
burnt.

- Tap an empty toaster slot to **drop a waffle in** (you choose which slot; from
  the unlock on, either slot). The doneness value starts climbing at
  `meterRate` units/second.
- The order ticket carries a **target band** `[lo, hi]` on the same scale.
- Tap the slot again to **eject**. **Carryover:** after eject the value keeps
  rising by `CARRYOVER` (~8) points over ~0.6s before settling. The settled
  value is what scores. You learn to pull early.
- **Burnt** = settled value `≥ BURN_THRESHOLD` (92) **or** `> hi + BURN_OVER`
  (15). A burnt waffle is binned immediately: no topping phase, `verdict:
  'burnt'`, chunky penalty, customer scowls (not an automatic walkout unless the
  patience bar was already empty).
- `meterRate` increases and the band narrows as the shift ramps (see
  Difficulty).

## Toppings & syrup

An ejected non-burnt waffle moves to the plating area.

- **Toppings** — drag each shelf item onto the waffle. The served set is compared
  to the ticket's wanted set (order and placement do not matter):
  - each **wanted** topping present → credit
  - each **missing** wanted topping → penalty
  - each **unwanted** topping added → penalty
  - Topping count per order: 1 early → up to 4 late (see Difficulty). Regulars
    override this with their signature order.
- **Syrup** — only some orders want it. Hold the bottle to pour; a `syrupLevel`
  gauge fills 0–100; release to stop. The ticket names a target
  (`{ target, tolerance }`, e.g. "half" → `{ target: 50, tolerance: 15 }`,
  "drown it" → `{ target: 95, tolerance: 20 }`).
  - within tolerance → credit
  - outside tolerance → penalty
  - `syrupLevel` reaching 100 while still pouring → **overflow**: penalty + a
    "mess wipe" animation, and the pour stops.
  - Order does not want syrup but you poured any meaningful amount → penalty.
- Hit **SERVE**. The waffle slides to the customer, they react, the score
  tallies, remaining patience converts to a **tip**, and the next customer steps
  up.

## Scoring

`scoring.js` exports a pure `scoreServe(input) → result`.

```
input = {
  doneness,       // settled 0-100 value at eject (carryover already applied)
  band,           // [lo, hi]
  toppings,       // string[]  what the player put on
  wanted,         // string[]  what the ticket asked for
  syrupLevel,     // 0-100, or null if the player never poured
  wantedSyrup,    // { target, tolerance } or null
  patienceLeft,   // 0..1 fraction of the counter patience bar remaining
}

result = { points, tip, perfect, verdict }
// verdict: 'perfect' | 'good' | 'sloppy' | 'burnt'
```

| Component | Points |
| --------- | ------ |
| `burnt` (doneness ≥ 92 or > hi + 15) | `-80`, and toppings/syrup are ignored (`verdict: 'burnt'`) |
| doneness inside band | `60 + 40 · (1 − dist_from_centre / half_band)` → 60–100 |
| doneness outside band (not burnt) | `+20` flat |
| each correct topping | `+30` |
| each missing or unwanted topping | `-25` |
| syrup within tolerance (or correctly none) | `+40` |
| syrup outside tolerance / unwanted / overflow | `-40` |
| **perfect serve** (in band **and** exact topping set **and** syrup ok) | `+150` bonus |
| tip (non-burnt, non-walkout serves) | `round(patienceLeft · 100 · TIP_MULT)`, added to score |
| walkout (patience hits 0 before SERVE) | `-120`, `walkout++` — handled by `game.js`, not `scoreServe` |

`verdict` mapping: `perfect` if the perfect bonus applies; `burnt` if burnt;
`good` if `points ≥ GOOD_THRESHOLD`; else `sloppy`. `game.js` uses `verdict` to
pick the customer's reaction line.

All numeric constants (`CARRYOVER`, `BURN_THRESHOLD`, `BURN_OVER`, `TIP_MULT`,
`GOOD_THRESHOLD`, per-band `meterRate`) live in one `const` block at the top of
the module they belong to and are considered **tunable** — playtesting will
move them.

## Difficulty ramp

`shift.js` exports `RAMP`, a table keyed by customer index (1-based):

| Customers | band width | topping count | syrup chance | toaster slots | counter patience |
| --------- | ---------- | ------------- | ------------ | ------------- | ---------------- |
| 1–4       | ~25        | 1             | 0            | 1             | generous         |
| 5–9       | ~18        | 1–2           | ~0.3         | 1             | shorter          |
| 10–14     | ~14        | 2–3           | ~0.5         | **2**         | shorter          |
| 15–20     | ~10        | 3–4           | ~0.5         | 2             | tight            |

- "Harder" is only ever: narrower band, faster `meterRate`, more toppings, less
  patience, and the one-time second-slot unlock. No other twists, no timer
  beyond the patience bars.
- **Regulars keep their signature order** (doneness band, topping set, syrup)
  regardless of slot — but the **ramp still sets their patience and
  `meterRate`**, so Groves at slot 7 is more forgiving than Groves at slot 18.

## Shift generation

`shift.js` exports `buildShift(rng) → Customer[20]` (pure; `rng` injectable).

`Customer = { id, kind: 'crew' | 'generic', who, order, ramp }` where
`order = { band, toppings: string[], syrup: {target,tolerance} | null,
ticketText }` and `ramp` is the row for that slot.

Rules:
- Exactly 20 customers.
- Slots 1–2 are always `generic`.
- Each of the 6 crew appears **exactly once**, placed by `rng` among slots
  3–20, with **no two crew adjacent**.
- Generic orders are generated from the ramp row: `band` = random centre ±
  half-width; `toppings` = `rng`-sampled from the catalogue to the ramp's count;
  `syrup` present with the ramp's probability.
- Crew orders come from `crew.json` verbatim.
- Deterministic for a given `rng` seed.

## The crew (regulars)

`crew.json` — hand-editable, same spirit as `bins-on-the-moon/items.json`:

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
        "ticketText": "Whatever's easiest. And yes I'm paying."
      },
      "lines": {
        "greet": ["Go easy on me.", "The usual disappointment, please."],
        "happy": ["That's... actually fine?", "I'll take the win."],
        "walkout": ["Even the waffle gave up on me.", "Story of my life."]
      }
    }
  ]
}
```

Signature orders (starting point — tune in playtest):

| id | name | band | toppings | syrup | character |
| -- | ---- | ---- | -------- | ----- | --------- |
| `marriott` | Marriott | 42–62 | 1 (banana) | none | easiest order; self-deprecating lines |
| `pitt` | Pitt | 20–34 | none | none | "I said *pale*" — fussy about any browning |
| `nash` | Nash | 48–56 | exactly 2 (blueberry, honey) | none | narrowest band in the game; tuts at anything off |
| `marco` | Marco | 40–60 | 2 (strawberry, cream) | half | orders in invented words you decode from context |
| `james` | James | 45–70 | 4 (max) | drown it | "kid at heart" — absurd excess |
| `groves` | Groves | 82–95 | 3 chaotic | drown it | shows up rough; hardest regular; wants it burnt |

Generic customers: `customers.json` holds a `names` pool, `greet` / `happy` /
`meh` / `angry` / `walkout` line pools, the `toppings` catalogue, and the
doneness-vocab map used to render `ticketText` ("golden", "just past golden",
"pale", "well done"…).

## Comedy layer (v1 scope)

Text only:
- **Ticket flavour** — one line under the mechanical requirements.
- **Greeting** — shown when a customer reaches the counter.
- **Serve reaction** — `happy` / `meh` / `angry` line chosen by `verdict`.
- **Walkout huff** — when a patience bar empties.
- **End-of-shift roast** — delivered by a random crew member, keyed to the score
  bracket; the bad-Wednesday variant names who walked.

Out of scope for v1: cutaway gags, animated bits, any South Park–style
interstitials. Noted as a possible v2 ("add bits of the comedy-vehicle option
later").

## Crew pixel art

The six `world-cup-sweepstake` headshots are 600×600 JPEGs at
`world-cup-sweepstake/data/owners/{groves,james,marco,marriott,nash,pitt}.jpg`.

- **One-off tool:** `scripts/pixelate-crew.py` — reads
  `../world-cup-sweepstake/data/owners/*.jpg`, centre-crops square, resizes to
  **28×28** nearest-neighbour, quantizes to a **≤16-colour** palette, and writes
  `games/waffle-wednesday/crew-sprites.js`. Needs `pip install Pillow`; it is a
  **dev-time tool, not a committed dependency**. A header comment in the file
  says so.
- **Output format:**
  ```js
  export const CREW_SPRITES = {
    groves: { w: 28, h: 28, palette: ["#0a0a0a", "#e8c9a0", ...], pixels: "0f0f12..." },
    // pixels: w*h hex digits, each indexing palette
  };
  ```
  ~800 chars per sprite, ~1 KB — six of them add ~6 KB of *derived data*, no
  binaries.
- **Render:** `game.js` paints each sprite once to a 28×28 offscreen `<canvas>`,
  then displays it scaled up with `image-rendering: pixelated` (or draws scaled
  rects). Regulars use their sprite at the counter and in the report card.
- **Generic customers:** emoji avatar (`🧑 👩 🧔 👴 👱 🧑‍🦰 …` + optional hat),
  `rng`-picked. No procedural pixel faces in v1.

## Persistence

Single key, wrapped in `try`/`catch` (private-mode safe):

```
localStorage['waffle-wednesday:best'] = JSON.stringify({ score, rating, perfects, served })
```

Written on shift end only if `score` beats the stored value. Read once on load.
"Reset best" clears it. Nothing else is stored.

## Files

```
games/waffle-wednesday/
├── index.html       shared .aa-game shell + <div id="game">
├── game.css         counter, toaster, meter, shelf, syrup, customers, animations
├── game.js          orchestrator: state machine, all DOM, input wiring, render loop
├── shift.js         PURE: RAMP table, buildShift(rng) → Customer[20]
├── scoring.js       PURE: scoreServe(input) → { points, tip, perfect, verdict }
├── crew-sprites.js  GENERATED by scripts/pixelate-crew.py — pixel data, do not hand-edit
├── crew.json        6 regulars: id, name, vibe, order, lines
└── customers.json   generic names, line pools, topping catalogue, doneness vocab
scripts/
└── pixelate-crew.py one-off; needs Pillow; regenerates crew-sprites.js
tests/
└── waffle-wednesday.test.mjs   node --test, no deps
```

- `game.js` owns all DOM. `shift.js` and `scoring.js` are pure (no
  `window`/`document`), imported unchanged by both the browser and the test —
  the same split as `bins-on-the-moon/levels.js`.
- Reuses shared `../../assets/styles.css`: tokens (`--panel`, `--edge`,
  `--neon`, `--neon-pink`, `--neon-green`, `--shadow`, `--font-display`), the
  `.aa-game` shell, `.aa-back`, `.aa-btn`. New locals in `game.css`: the doneness
  gradient, toaster/counter colours, syrup gauge.
- All paths relative (`../../assets/...`) — the site is served from a subpath on
  `marcoedelgado.github.io`.

## Repo integration

- Append to `games.json`:
  ```json
  {
    "slug": "waffle-wednesday",
    "title": "Waffle Wednesday",
    "description": "Toast it right, top it faster. One shift, twenty customers, three strikes and it's a bad Wednesday.",
    "emoji": "🧇",
    "added": "2026-09-03"
  }
  ```
- No `README.md` change required — the "how to add a game" walkthrough and the
  "JSON files are safe for non-coders to edit" note already cover `crew.json` /
  `customers.json`. `scripts/pixelate-crew.py` carries its own usage comment.
- Second game with tests; `node --test` already documented.

## Testing

`tests/waffle-wednesday.test.mjs` (pure modules only):

**`scoring.js` — `scoreServe`:**
- perfect serve: in-band doneness + exact topping set + syrup in tolerance →
  `perfect: true`, `verdict: 'perfect'`, includes the `+150`.
- doneness-only: in band but a topping missing → not perfect, partial points,
  `verdict` `good` or `sloppy`.
- toppings-only: exact toppings but doneness out of band → not perfect, `+20`
  doneness component only.
- burnt: doneness 95 → `verdict: 'burnt'`, `points` negative, topping/syrup
  inputs ignored.
- unwanted topping penalised; missing topping penalised (same magnitude).
- syrup overflow / out of tolerance / unwanted → `-40`; correct "none" → `+40`.
- tip scales with `patienceLeft` and is 0 on a walkout/burnt.
- closeness: doneness at band centre scores higher than doneness at band edge.

**`shift.js` — `buildShift`:**
- always returns 20 customers.
- each of the 6 crew ids appears exactly once.
- slots 1–2 are always `kind: 'generic'`.
- no two adjacent customers are both `kind: 'crew'`.
- difficulty never eases across a ramp boundary: band width only shrinks or
  holds, `slots` only grows or holds, patience only shrinks or holds.
- generic orders only reference toppings in the catalogue; every `band` is a
  valid `[lo, hi]` with `lo < hi` inside `0..100`.
- seeded `rng` → identical shift on repeat.

**Manual QA checklist:**
- Drag toppings with touch (phone, portrait) and with a mouse.
- Toast: eject inside the band → "good"; ride it to 95 → burnt path (no topping
  phase, penalty, scowl).
- Carryover: ejecting exactly at `hi` still lands burnt/over sometimes — pull
  early.
- Syrup: hold to pour, release in tolerance → credit; hold to 100 → overflow +
  wipe.
- Second slot appears at customer 10 and both meters run independently; hand a
  pre-toasted waffle to the customer behind.
- Let a patience bar empty → walkout line, walkout counter; third walkout →
  Bad Wednesday screen naming the three.
- Finish all 20 → report card, rating matches score bracket, best saved.
- Reload → best persists; "reset best" clears it.
- `prefers-reduced-motion` on → meters still animate; steam/bounce/confetti/gold
  flash are static.
- Home-page card appears and links through.

## Out of scope (v1)

- Sound / music.
- Endless mode; any difficulty past the four ramp bands; a timer beyond patience.
- Cutaway gags / comedy interstitials.
- Leaderboards or sharing scores between friends (no backend).
- Procedural pixel faces for generic customers (emoji only).
- Choosing / customising your own regular.
- More than 2 toaster slots.
- Keyboard / switch play (DOM structure should not preclude it, but the
  interaction is not built).
