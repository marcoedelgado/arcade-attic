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
//
// `water` is the zone's layer recipe for medium.js, straight from the Claude
// Design art direction (§02): each key is a 0–1 strength (floor can exceed 1 —
// the Trench's light comes from below). waterAt() blends it between zones with
// the same hold-then-handover as the palette. `calm` is the zone's motion speed
// — game.js feeds it into the RATE of the shader clock, never the shader.
// `ambient` is how visible a creature is outside the lamp (light.js) —
// sunlight in the shallows, nothing at Midnight, ember-glow in the Trench.
// Ours, not the export's flat 0.20; playtest-owned.
export const ZONES = [
  {
    id: 'sunlit-shallows',
    name: 'Sunlit Shallows',
    // #17C4B4: greener, so "sunny" is not just "blue".
    colour: [0.09, 0.77, 0.70],
    water: { floor: 0.22, ceiling: 0.90, shafts: 1.00, caustics: 1.00, curtains: 0.10,
      snowFar: 0.40, snowMid: 0.55, snowNear: 0.45, glimmers: 0.00, ember: 0.00, shimmer: 0.00,
      lift: 0.25, emit: 0.30, calm: 1.00, ambient: 1.00 },
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
    // #0A57C2: cleaner, one clear hue step down.
    colour: [0.04, 0.34, 0.76],
    water: { floor: 0.20, ceiling: 0.55, shafts: 0.32, caustics: 0.45, curtains: 0.30,
      snowFar: 0.55, snowMid: 0.70, snowNear: 0.60, glimmers: 0.18, ember: 0.00, shimmer: 0.00,
      lift: 0.45, emit: 0.50, calm: 0.70, ambient: 0.60 },
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
    // #2A1F7A: violet, NOT navy (navy is what made every zone look alike).
    colour: [0.16, 0.12, 0.48],
    water: { floor: 0.26, ceiling: 0.22, shafts: 0.08, caustics: 0.18, curtains: 1.00,
      snowFar: 0.75, snowMid: 0.95, snowNear: 0.80, glimmers: 0.55, ember: 0.00, shimmer: 0.00,
      lift: 0.75, emit: 0.80, calm: 0.55, ambient: 0.35 },
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
    // #0A0716: violet-black, the hue keeps going down.
    colour: [0.04, 0.03, 0.09],
    water: { floor: 0.45, ceiling: 0.04, shafts: 0.00, caustics: 0.06, curtains: 0.70,
      snowFar: 0.70, snowMid: 0.95, snowNear: 0.90, glimmers: 1.00, ember: 0.12, shimmer: 0.08,
      lift: 1.00, emit: 1.00, calm: 0.40, ambient: 0.20 },
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
    // #0D0303: the base is nearly black ON PURPOSE. The red comes from
    // medium.js's ember floor; a mid-value red base floods the frame and
    // leaves the vents nothing to glow against.
    colour: [0.05, 0.012, 0.010],
    water: { floor: 1.35, ceiling: 0.00, shafts: 0.00, caustics: 0.12, curtains: 0.55,
      snowFar: 0.60, snowMid: 0.80, snowNear: 0.85, glimmers: 0.40, ember: 1.00, shimmer: 0.55,
      lift: 0.85, emit: 0.90, calm: 0.85, ambient: 0.30 },
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

// Hold this zone's OWN look for the first HOLD of its length, then blend
// across the remainder. Blending linearly over the whole zone (which is what
// this used to do) meant you were almost always in transition and never
// actually *in* a place: at 5178m — 89% through The Trench — the volcanic red
// #590a03 had already blended 89% of the way to the next zone's blue, so the
// screen read #151366 navy. Every zone looked like the same colour because
// every zone spent nearly all its time showing the next one's.
//
// Continuity across boundaries is unaffected, which is what keeps the
// loop-seam test green: at progress 1 this resolves to exactly the next
// zone's values, and the following zone starts at progress 0 showing them.
const HOLD = 0.7;

// The two zones around this depth and how far the handover between them has
// got. Shared by paletteAt and waterAt so colour and water always hand over
// together. Loop-aware: zones 0–1 proceed forward, zones 2–4 cycle back to 2.
function blendAt(metres) {
  const { index, progress } = zoneAt(metres);
  const nextIndex = index < 2 ? index + 1 : 2 + ((index - 2 + 1) % 3);
  const t = progress <= HOLD ? 0 : (progress - HOLD) / (1 - HOLD);
  return {
    current: ZONES[index],
    next: ZONES[nextIndex],
    mix: t * t * (3 - 2 * t),   // smoothstep, so the handover has no corner
  };
}

// paletteAt — given a depth, return the colour blend for that point.
export function paletteAt(metres) {
  const { current, next, mix } = blendAt(metres);
  return { a: current.colour, b: next.colour, mix };
}

// The uniform order medium.js uploads the water recipe in. medium.js generates
// its GLSL #defines from this array, so the two cannot drift apart. `calm` and
// `ambient` are deliberately absent: they are consumed in JS, not the shader.
export const WATER_KEYS = ['floor', 'ceiling', 'shafts', 'caustics', 'curtains', 'snowFar',
  'snowMid', 'snowNear', 'glimmers', 'ember', 'shimmer', 'lift', 'emit'];

// waterAt — the blended water recipe at a depth. Fills `out` (reuse one object
// per frame; game.js does) and returns it.
export function waterAt(metres, out = {}) {
  const { current, next, mix } = blendAt(metres);
  for (const k in current.water) out[k] = current.water[k] + (next.water[k] - current.water[k]) * mix;
  return out;
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
