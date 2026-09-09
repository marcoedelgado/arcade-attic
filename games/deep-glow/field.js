// field.js — pure over an injected rng. Spawns and culls the plankton field: the
// drifting glow-motes that rise past the diver as they descend and (from Task 9
// onward) refuel the lamp. Same shape as games/asteroid-run/field.js — an
// injected rng, a fractional spawn accumulator carried across calls, and a
// cull-during-iteration backward splice — but driven by METRES descended, not
// seconds, so density is per-metre and independent of how fast the diver sinks.
//
// PURE: imports nothing, touches no browser global, never calls Math.random. The
// field is never told the diver's depth — it accumulates dtMetres into its own
// `depthM` and spawns and culls relative to that, which is what lets the tests
// drive it with nothing but a box. game.js feeds it the diver's real descent and
// defaults the rng to Math.random at the call site.

// TUNABLE — playtest-owned.
const PLANKTON_EVERY_METRES = 14; // at escalation 1, one mote per 14 m of descent.
                                  // The per-metre spawn rate is divided by
                                  // `escalation`, i.e. the gap is multiplied by it,
                                  // so the deep laps (escalation → 2.5) drift far
                                  // fewer motes past you than the first lap does.
const KINDS = ['plankton-a', 'plankton-b', 'plankton-c']; // sprite frame ids — batch.push({ id: kind })

export function makeField({ rng }) {
  const plankton = [];
  const creatures = []; // Task 9 fills this; stays empty for now.

  let depthM = 0;
  // Fractional metres of descent still owed before the next mote, carried ACROSS
  // step() calls. What advances is the running total of metres descended, not a
  // per-step dice roll — so one step(20) and twenty step(1) calls spawn the same
  // total. A naive `if (rng() < density * dtMetres)` loses the remainder at every
  // coarse step; this does not.
  let metresUntilNextPlankton = PLANKTON_EVERY_METRES;

  function spawnOne(box, viewMetres) {
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

  return {
    plankton,
    creatures,

    // dtMetres — metres descended this frame. `cast` is accepted for Task 9 and
    // ignored here.
    step(dtMetres, { box, viewMetres, escalation }) {
      depthM += dtMetres;

      // Cull anything now more than viewMetres ABOVE the field's depth — it has
      // drifted off the top of the screen and is never coming back. Walk backward
      // so a splice never skips the next entry.
      const cullAbove = depthM - viewMetres;
      for (let i = plankton.length - 1; i >= 0; i--) {
        if (plankton[i].y < cullAbove) plankton.splice(i, 1);
      }

      // Pay down the metre debt and emit a mote each time it crosses zero,
      // refilling by the escalation-stretched gap. A while-loop, not an if, so a
      // coarse step that owes several motes spawns them all.
      metresUntilNextPlankton -= dtMetres;
      while (metresUntilNextPlankton <= 0) {
        spawnOne(box, viewMetres);
        metresUntilNextPlankton += PLANKTON_EVERY_METRES * escalation;
      }
    },

    reset() {
      plankton.length = 0;
      creatures.length = 0;
      depthM = 0;
      metresUntilNextPlankton = PLANKTON_EVERY_METRES;
    },
  };
}
