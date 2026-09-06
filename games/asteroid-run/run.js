// run.js — pure. The run's progression: which sector, how far through it, and
// the endless escalation after the named set. No spawning, no geometry, no RNG —
// field.js does that. Same shape as waffle-wednesday's makeDirector.

// TUNABLE — the named set. Every number here moves in playtest.
// `reach` is a multiplier of the ship's reachable-box half-extent (NOT world
// units): field.js sizes every spawn relative to the box game.js passes in.
export const SECTORS = [
  { name: 'Asteroid Belt', duration: 35, speed: 320, spawnRate: 1.4, sizeRange: [18, 44], reach: 1.4,  pattern: 'scatter',    kind: 'asteroids', hue: 255 },
  { name: 'Debris Field',  duration: 35, speed: 340, spawnRate: 1.7, sizeRange: [14, 36], reach: 1.15, pattern: 'stream',     kind: 'wreckage',  hue: 210 },
  { name: 'Ring Shadow',   duration: 40, speed: 300, spawnRate: 1.2, sizeRange: [22, 52], reach: 1.3,  pattern: 'gate',       kind: 'asteroids', hue: 300 },
  { name: 'The Shoal',     duration: 40, speed: 260, spawnRate: 2.2, sizeRange: [10, 26], reach: 1.4,  pattern: 'driftfield', kind: 'mines',     hue: 165 },
  { name: 'Rubble Run',    duration: 45, speed: 380, spawnRate: 2.0, sizeRange: [12, 34], reach: 1.15, pattern: 'stream',     kind: 'wreckage',  hue: 35  },
  { name: 'Ice Fall',      duration: 45, speed: 400, spawnRate: 1.8, sizeRange: [16, 40], reach: 1.4,  pattern: 'scatter',    kind: 'asteroids', hue: 195 },
  { name: 'Deep Dark',     duration: 50, speed: 420, spawnRate: 1.6, sizeRange: [20, 48], reach: 1.3,  pattern: 'gate',       kind: 'mines',     hue: 275 },
];

// TUNABLE
const PER_LOOP = 1.12;        // speed & spawnRate multiplier per completed loop
const SPEED_CAP = 2.4;        // × the sector's base speed
const SPAWN_RATE_CAP = 3.5;   // absolute asteroids/sec
const REDUCED_MOTION_FACTOR = 0.6;

export function makeRun({ reducedMotion = false } = {}) {
  let idx = 0;
  let loop = 0;
  let elapsed = 0;
  const rm = reducedMotion ? REDUCED_MOTION_FACTOR : 1;

  function effective() {
    const base = SECTORS[idx];
    const mult = Math.min(SPEED_CAP, PER_LOOP ** loop);
    return {
      ...base,
      speed: base.speed * mult * rm,
      spawnRate: Math.min(SPAWN_RATE_CAP, base.spawnRate * mult) * rm,
      // `reach`, `kind` and `hue` ride through unchanged from ...base. `reach` is
      // relative to a fixed box (widening it per loop just re-pushes spawns out);
      // `kind` and `hue` are cosmetic — escalating them is meaningless.
    };
  }

  return {
    advance(dt) {
      elapsed += dt;
      let justCleared = false;
      const dur = SECTORS[idx].duration;
      if (elapsed >= dur) {
        elapsed -= dur;
        justCleared = true;
        idx += 1;
        if (idx >= SECTORS.length) { idx = 1; loop += 1; }
      }
      return {
        sector: effective(),
        sectorProgress: Math.min(1, elapsed / SECTORS[idx].duration),
        justCleared,
        loop,
      };
    },
    reset() { idx = 0; loop = 0; elapsed = 0; },
    snapshot() { return { sectorName: SECTORS[idx].name, sectorIndex: idx, loop, sectorHue: SECTORS[idx].hue }; },
  };
}
