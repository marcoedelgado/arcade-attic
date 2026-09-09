// depth.js — pure. Depth-to-zone mapping: which zone am I in, how far through it,
// what colours surround me, and what creatures might I encounter. No RNG, no side
// effects, no browser globals — field.js and game.js consume these values to drive
// the renderer and spawn encounters.

export const ZONE_METRES = 200;
const LOOP_START_ZONE = 2;

// TUNABLE — zone progression from surface to trench, with creature rosters per zone.
// Colours are [r, g, b] in 0–1 (shader uniforms). Each zone blends from `top` to
// `bottom`, and `bottom` aligns with the next zone's `top` for visual continuity.
// `cast` lists creature encounters (id: frame id & sightings key, kind: spawn type,
// rare: singleton per zone). In the loop (zones 2–4), zone 4's bottom connects
// back to zone 2's top.
export const ZONES = [
  {
    id: 'sunlit-shallows',
    name: 'Sunlit Shallows',
    top: [0.20, 0.80, 0.90],
    bottom: [0.05, 0.50, 0.80],
    cast: [
      { id: 'bubble-fish', kind: 'drifter', rare: false },
      { id: 'silver-dart', kind: 'shy', rare: false },
      { id: 'sunfish', kind: 'bumper', rare: true },
    ],
  },
  {
    id: 'the-blue',
    name: 'The Blue',
    top: [0.05, 0.50, 0.80],
    bottom: [0.02, 0.20, 0.60],
    cast: [
      { id: 'blue-dancer', kind: 'drifter', rare: false },
      { id: 'phantom-squid', kind: 'shy', rare: false },
      { id: 'electric-eel', kind: 'bumper', rare: true },
    ],
  },
  {
    id: 'the-twilight',
    name: 'The Twilight',
    top: [0.02, 0.20, 0.60],
    bottom: [0.08, 0.05, 0.40],
    cast: [
      { id: 'lantern-jelly', kind: 'drifter', rare: false },
      { id: 'shadow-fish', kind: 'shy', rare: false },
      { id: 'anglerfish', kind: 'bumper', rare: true },
    ],
  },
  {
    id: 'the-midnight',
    name: 'The Midnight',
    top: [0.08, 0.05, 0.40],
    bottom: [0.05, 0.02, 0.15],
    cast: [
      { id: 'glowing-squid', kind: 'drifter', rare: false },
      { id: 'depth-lurker', kind: 'shy', rare: false },
      { id: 'fangtooth', kind: 'bumper', rare: true },
    ],
  },
  {
    id: 'the-trench',
    name: 'The Trench',
    top: [0.05, 0.02, 0.15],
    bottom: [0.40, 0.05, 0.02],
    cast: [
      { id: 'vent-worm', kind: 'drifter', rare: false },
      { id: 'black-smoker', kind: 'shy', rare: false },
      { id: 'giant-octopus', kind: 'bumper', rare: true },
    ],
  },
];

// zoneAt — given a depth in metres, return which zone, progress within it, and name.
// Zones 0–4 run 0–1000m. Past that, zones 2–4 loop (600m per lap).
export function zoneAt(metres) {
  const loopThreshold = ZONES.length * ZONE_METRES;
  let index, progress, name;

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

// paletteAt — given a depth, return the colour blend for that point. Blends from
// the current zone's top to its bottom as progress goes 0→1. Next-zone alignment
// ensures smooth transitions at boundaries.
export function paletteAt(metres) {
  const { index, progress } = zoneAt(metres);
  const current = ZONES[index];

  return {
    a: current.top,
    b: current.bottom,
    mix: progress,
  };
}

// escalationAt — difficulty ramp. Starts at 1.0, increases by 0.15 per 1000m,
// capped at 2.5. Monotonic and smooth for difficulty progression.
export function escalationAt(metres) {
  return Math.min(2.5, 1 + Math.floor(metres / 1000) * 0.15);
}

// castAt — given a depth, return the creature roster (cast) for that zone.
export function castAt(metres) {
  const { index } = zoneAt(metres);
  return ZONES[index].cast;
}
