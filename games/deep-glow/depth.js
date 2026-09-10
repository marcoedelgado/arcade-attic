// depth.js — pure. Depth-to-zone mapping: which zone am I in, how far through it,
// what colours surround me, and what creatures might I encounter. No RNG, no side
// effects, no browser globals — field.js and game.js consume these values to drive
// the renderer and spawn encounters.

export const ZONE_METRES = 200;
const LOOP_START_ZONE = 2;

// TUNABLE — zone progression from surface to trench, with creature rosters per zone.
// Colours are [r, g, b] in 0–1 (shader uniforms). `colour` is the zone's representative
// hue; `paletteAt` blends between zones (current.colour → next.colour as progress runs
// 0→1), where "next" respects the loop: zones 0–1 proceed normally, but zone 4 connects
// back to zone 2.
// `cast` lists creature encounters (id: frame id & sightings key, kind: spawn type,
// rare: singleton per zone, always drifter to avoid punishing the reward). Each
// zone carries four entries: one ambient drifter, one shy (flees the lamp), one
// non-rare bumper (the zone's obstacle — costs lamp fuel on contact), and one
// rare drifter (the costless reward). All 20 ids are unique across zones.
export const ZONES = [
  {
    id: 'sunlit-shallows',
    name: 'Sunlit Shallows',
    colour: [0.15, 0.75, 0.85],
    cast: [
      { id: 'bubble-fish', kind: 'drifter', rare: false },
      { id: 'silver-dart', kind: 'shy', rare: false },
      { id: 'lazy-turtle', kind: 'bumper', rare: false },
      { id: 'sunfish', kind: 'drifter', rare: true },
    ],
  },
  {
    id: 'the-blue',
    name: 'The Blue',
    colour: [0.02, 0.35, 0.70],
    cast: [
      { id: 'blue-dancer', kind: 'drifter', rare: false },
      { id: 'phantom-squid', kind: 'shy', rare: false },
      { id: 'slow-manta', kind: 'bumper', rare: false },
      { id: 'electric-eel', kind: 'drifter', rare: true },
    ],
  },
  {
    id: 'the-twilight',
    name: 'The Twilight',
    colour: [0.05, 0.08, 0.45],
    cast: [
      { id: 'lantern-jelly', kind: 'drifter', rare: false },
      { id: 'shadow-fish', kind: 'shy', rare: false },
      { id: 'round-puffer', kind: 'bumper', rare: false },
      { id: 'anglerfish', kind: 'drifter', rare: true },
    ],
  },
  {
    id: 'the-midnight',
    name: 'The Midnight',
    colour: [0.06, 0.02, 0.12],
    cast: [
      { id: 'glowing-squid', kind: 'drifter', rare: false },
      { id: 'depth-lurker', kind: 'shy', rare: false },
      { id: 'blob-fish', kind: 'bumper', rare: false },
      { id: 'fangtooth', kind: 'drifter', rare: true },
    ],
  },
  {
    id: 'the-trench',
    name: 'The Trench',
    colour: [0.35, 0.04, 0.01],
    cast: [
      { id: 'vent-worm', kind: 'drifter', rare: false },
      { id: 'black-smoker', kind: 'shy', rare: false },
      { id: 'boulder-crab', kind: 'bumper', rare: false },
      { id: 'giant-octopus', kind: 'drifter', rare: true },
    ],
  },
];

// zoneAt — given a depth in metres, return which zone, progress within it, and name.
// Zones 0–4 run 0–1000m. Past that, zones 2–4 loop (600m per lap).
// Clamps negative and non-finite metres to 0 to avoid crashes.
export function zoneAt(metres) {
  metres = Math.max(0, metres);
  if (!Number.isFinite(metres)) metres = 0;

  const loopThreshold = ZONES.length * ZONE_METRES;
  let index, progress;

  if (metres < loopThreshold) {
    // Direct zone: 0–1000m.
    index = Math.floor(metres / ZONE_METRES);
    progress = (metres % ZONE_METRES) / ZONE_METRES;
  } else {
    // Looping zones 2–4 (600m lap).
    const loopSize = (ZONES.length - LOOP_START_ZONE) * ZONE_METRES;
    const loopMetres = metres - loopThreshold;
    const positionInLoop = loopMetres % loopSize;
    index = LOOP_START_ZONE + Math.floor(positionInLoop / ZONE_METRES);
    progress = (positionInLoop % ZONE_METRES) / ZONE_METRES;
  }

  return {
    index,
    name: ZONES[index].name,
    progress,
  };
}

// paletteAt — given a depth, return the colour blend for that point. Blends the
// current zone's colour toward the next zone's colour as progress goes 0→1,
// respecting the loop (zone 4's next is zone 2).
export function paletteAt(metres) {
  const { index, progress } = zoneAt(metres);
  const current = ZONES[index];

  // Loop-aware next: zones 0–1 proceed forward, zones 2–4 cycle back to 2.
  let nextIndex;
  if (index < 2) {
    nextIndex = index + 1;
  } else {
    nextIndex = 2 + ((index - 2 + 1) % 3);
  }

  const next = ZONES[nextIndex];

  // Hold this zone's OWN colour for the first HOLD of its length, then blend
  // across the remainder. Blending linearly over the whole zone (which is what
  // this used to do) meant you were almost always in transition and never
  // actually *in* a place: at 5178m — 89% through The Trench — the volcanic red
  // #590a03 had already blended 89% of the way to the next zone's blue, so the
  // screen read #151366 navy. Every zone looked like the same colour because
  // every zone spent nearly all its time showing the next one's.
  //
  // Continuity across boundaries is unaffected, which is what keeps the
  // loop-seam test green: at progress 1 this resolves to exactly next.colour,
  // and the following zone starts at progress 0 showing that same colour.
  const HOLD = 0.7;
  const t = progress <= HOLD ? 0 : (progress - HOLD) / (1 - HOLD);
  const mix = t * t * (3 - 2 * t);   // smoothstep, so the handover has no corner

  return {
    a: current.colour,
    b: next.colour,
    mix,
  };
}

// escalationAt — difficulty ramp. Starts at 1.0, increases by 0.15 per 1000m,
// capped at 2.5. Monotonic and smooth for difficulty progression.
// Clamps negative and non-finite metres to 0.
export function escalationAt(metres) {
  metres = Math.max(0, metres);
  if (!Number.isFinite(metres)) metres = 0;

  return Math.min(2.5, 1 + Math.floor(metres / 1000) * 0.15);
}

// castAt — given a depth, return the creature roster (cast) for that zone.
export function castAt(metres) {
  const { index } = zoneAt(metres);
  return ZONES[index].cast;
}
