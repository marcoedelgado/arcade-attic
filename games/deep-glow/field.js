// field.js — pure over an injected rng. Spawns and culls the plankton field (the
// drifting glow-motes that rise past the diver as they descend and refuel the
// lamp) AND, from Task 9, the creature field (the roster `castAt(depth)` hands
// in). Same shape as games/asteroid-run/field.js — an injected rng, a fractional
// spawn accumulator carried across calls, and a cull-during-iteration backward
// splice — but driven by METRES descended, not seconds, so density is per-metre
// and independent of how fast the diver sinks.
//
// PURE: imports nothing, touches no browser global, never calls Math.random. The
// field is never told the diver's depth — it accumulates dtMetres into its own
// `depthM` and spawns and culls relative to that, which is what lets the tests
// drive it with nothing but a box. game.js feeds it the diver's real descent and
// defaults the rng to Math.random at the call site.
//
// Creature entries are `{ id, kind, rare, x, y, phase }` — id doubles as the
// sprite frame id and the sightings key; kind drives behaviour in game.js
// (drifter/shy/bumper); rare creatures spawn at most once per zone per run (see
// `spawnedRareIds` below). x/y/phase mean exactly what they mean for plankton:
// x is box-relative CSS px, y is depth in metres, phase is a per-actor drift
// offset consumed at render time.

// TUNABLE — playtest-owned.
const PLANKTON_EVERY_METRES = 14; // at escalation 1, one mote per 14 m of descent.
                                  // The per-metre spawn rate is divided by
                                  // `escalation`, i.e. the gap is multiplied by it,
                                  // so the deep laps (escalation → 2.5) drift far
                                  // fewer motes past you than the first lap does.
const CREATURE_EVERY_METRES = 70; // creatures are the reward, not the wallpaper —
                                  // far sparser than plankton. Same escalation
                                  // stretch as plankton.
const KINDS = ['plankton-a', 'plankton-b', 'plankton-c']; // sprite frame ids — batch.push({ id: kind })

// Guards against a pathological step hanging the tab. `EPS` floors the spawn
// gap so a caller ever passing `escalation <= 0` cannot zero it out and spin
// forever; `MAX_SPAWNS_PER_STEP` caps how many entries one step() call can ever
// emit, so a huge one-off dtMetres cannot either. Neither is reachable today
// (escalationAt clamps >= 1, loop.js clamps dt to 50ms) but a browser hang is
// worth two lines of defence.
const EPS = 1e-6;
const MAX_SPAWNS_PER_STEP = 500;

export function makeField({ rng }) {
  const plankton = [];
  const creatures = [];

  let depthM = 0;
  // Fractional metres of descent still owed before the next mote/creature,
  // carried ACROSS step() calls. What advances is the running total of metres
  // descended, not a per-step dice roll — so one step(20) and twenty step(1)
  // calls spawn the same total. A naive `if (rng() < density * dtMetres)` loses
  // the remainder at every coarse step; this does not.
  let metresUntilNextPlankton = PLANKTON_EVERY_METRES;
  let metresUntilNextCreature = CREATURE_EVERY_METRES;

  // Per-run memory of which zones' rare creature has already spawned, keyed by
  // the rare creature's id (globally unique across zones, so this doubles as
  // "which zone"). Cleared only in reset() — a later lap through a looping zone
  // must NOT respawn a rare already seen this run.
  const spawnedRareIds = new Set();

  function spawnOnePlankton(box, viewMetres) {
    // The rng is consumed in a FIXED order — x, then kind, then phase — and the
    // same number of times regardless of the box width, so a narrow phone and a
    // wide laptop draw the identical sequence and differ only in the pixel span
    // the same fraction is mapped onto.
    const x = box.x0 + rng() * (box.x1 - box.x0); // BOX-RELATIVE, never an absolute pixel range
    const kind = KINDS[Math.floor(rng() * KINDS.length)];
    const phase = rng() * Math.PI * 2;            // per-mote drift offset, 0–2π
    // Spawn below the visible range so the mote rises toward the diver as depthM grows.
    plankton.push({ x, y: depthM + viewMetres, kind, phase });
  }

  function spawnOneCreature(box, viewMetres, cast) {
    if (!cast || cast.length === 0) return; // e.g. the plain [] the test suite drives this with

    // A rare entry already spawned this run drops out of the pool; the two
    // non-rare entries are always eligible, so the pool is never empty.
    const pool = cast.filter((c) => !c.rare || !spawnedRareIds.has(c.id));
    if (pool.length === 0) return;

    const entry = pool[Math.floor(rng() * pool.length)];
    const x = box.x0 + rng() * (box.x1 - box.x0);
    const phase = rng() * Math.PI * 2;
    creatures.push({ id: entry.id, kind: entry.kind, rare: entry.rare, x, y: depthM + viewMetres, phase });
    if (entry.rare) spawnedRareIds.add(entry.id);
  }

  return {
    plankton,
    creatures,

    // dtMetres — metres descended this frame.
    step(dtMetres, { box, viewMetres, cast, escalation }) {
      depthM += dtMetres;

      // Cull anything now more than viewMetres ABOVE the field's depth — it has
      // drifted off the top of the screen and is never coming back. Walk backward
      // so a splice never skips the next entry.
      const cullAbove = depthM - viewMetres;
      for (let i = plankton.length - 1; i >= 0; i--) {
        if (plankton[i].y < cullAbove) plankton.splice(i, 1);
      }
      for (let i = creatures.length - 1; i >= 0; i--) {
        if (creatures[i].y < cullAbove) creatures.splice(i, 1);
      }

      // Pay down the metre debt and emit an actor each time it crosses zero,
      // refilling by the escalation-stretched gap. A while-loop, not an if, so a
      // coarse step that owes several actors spawns them all — capped so a
      // pathological step (or an escalation <= 0 gap) can never spin forever.
      metresUntilNextPlankton -= dtMetres;
      for (let n = 0; metresUntilNextPlankton <= 0 && n < MAX_SPAWNS_PER_STEP; n++) {
        spawnOnePlankton(box, viewMetres);
        metresUntilNextPlankton += Math.max(EPS, PLANKTON_EVERY_METRES * escalation);
      }

      metresUntilNextCreature -= dtMetres;
      for (let n = 0; metresUntilNextCreature <= 0 && n < MAX_SPAWNS_PER_STEP; n++) {
        spawnOneCreature(box, viewMetres, cast);
        metresUntilNextCreature += Math.max(EPS, CREATURE_EVERY_METRES * escalation);
      }
    },

    reset() {
      plankton.length = 0;
      creatures.length = 0;
      depthM = 0;
      metresUntilNextPlankton = PLANKTON_EVERY_METRES;
      metresUntilNextCreature = CREATURE_EVERY_METRES;
      spawnedRareIds.clear();
    },

    // Force-set the field's internal depth tracker, bypassing step()'s
    // dtMetres-only accumulation. Why this exists: the field never sees the
    // diver's absolute depth, only the (clamped-at-zero) metres descended
    // each frame — so it has no way to notice when the diver's REAL depth
    // moves by something other than that clamped delta, which is exactly
    // what a brownout's rescue-rise does. Without a resync, the field
    // silently drifts ahead of the diver by the full rise on every brownout,
    // permanently and cumulatively. The spawn/cull debt counters
    // (metresUntilNext*) are deliberately left untouched — only WHERE new
    // actors appear should jump, not the rate they arrive at.
    resync(metres) {
      depthM = metres;
    },
  };
}
