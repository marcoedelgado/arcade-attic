// field.js — pure over an injected rng. Spawns, ages and culls the asteroid and
// star fields for the current sector. Operates on the arrays game.js owns and
// hands in at construction, so the renderer reads the same references.
//
// All spawn geometry is relative to the ship's reachable box (shipState.box,
// world coords at the cockpit plane). sector.reach is a multiplier of the box
// half-extent, not an absolute distance.

import { placeSpawn } from './fairness.js';

export const SPAWN_Z = 900;
export const CULL_Z = 4;
const STAR_COUNT = 140;
const STAR_SPREAD_X = 600;
const STAR_SPREAD_Y = 400;
const STAR_DRIFT = 0.6; // stars travel this fraction of sector.speed (parallax)

// TUNABLE — pattern geometry, all playtest-owned.
const STREAM_SWEEP = 0.7;   // fraction of the reach half-width a stream rock drifts inward by SLAB_REF_Z
const SLAB_REF_Z = 65;      // ~centre of collision.js's z-slab ([40, 95]) — where the inward drift should have landed
const GATE_WANDER = 0.3;    // gate gap centre wanders within ±(this × box half-width) of the axis
const GATE_GAP_LO = 0.42;   // gate gap half-width, as a fraction of the box half-width
const GATE_GAP_HI = 0.6;

export function makeField({ rng, asteroids, stars }) {
  let spawnAccumulator = 0;
  let nextId = 1;

  const between = (lo, hi) => lo + rng() * (hi - lo);
  const signed = (mag) => (rng() * 2 - 1) * mag;

  function seedStar(s) {
    s.x = signed(STAR_SPREAD_X);
    s.y = signed(STAR_SPREAD_Y);
    s.z = between(20, SPAWN_Z);
  }

  function mkRock(x, y, r, vx) {
    return { id: nextId++, x, y, z: SPAWN_Z, r, spin: signed(1.5), seed: rng(), vx: vx || 0, vy: 0 };
  }

  function candidate(sector, box) {
    const [lo, hi] = sector.sizeRange;
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const bhw = (box.x1 - box.x0) / 2;
    const bhh = (box.y1 - box.y0) / 2;
    const hw = bhw * sector.reach;
    const hh = bhh * sector.reach;

    switch (sector.pattern) {
      case 'stream': {
        // spawn just outside the box on one side, drift inward so the rock is
        // ~STREAM_SWEEP of the way across by the time it reaches the collision slab
        const side = rng() < 0.5 ? -1 : 1;
        const vx = -side * (STREAM_SWEEP * hw) * sector.speed / (SPAWN_Z - SLAB_REF_Z);
        return mkRock(cx + side * hw, cy + signed(hh * 0.7), between(lo, hi), vx);
      }
      case 'gate': {
        // a pair of walls bracketing a gap that wanders within the box
        const gapCentre = cx + signed(bhw * GATE_WANDER);
        const gapHalf = bhw * between(GATE_GAP_LO, GATE_GAP_HI);
        const y = cy + signed(hh * 0.4);
        const rL = between(lo, hi);
        const rR = between(lo, hi);
        return [
          mkRock(gapCentre - gapHalf - rL, y, rL, 0),
          mkRock(gapCentre + gapHalf + rR, y, rR, 0),
        ];
      }
      case 'driftfield':
      case 'scatter':
      default:
        return mkRock(cx + signed(hw), cy + signed(hh * 0.85), between(lo, hi), 0);
    }
  }

  return {
    reset() {
      asteroids.length = 0;
      stars.length = 0;
      for (let i = 0; i < STAR_COUNT; i++) {
        const s = {};
        seedStar(s);
        stars.push(s);
      }
      spawnAccumulator = 0;
    },

    step(dt, sector, shipState) {
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        a.z -= sector.speed * dt;
        if (a.vx) a.x += a.vx * dt;
        if (a.vy) a.y += a.vy * dt;
        if (a.z < CULL_Z) asteroids.splice(i, 1);
      }
      for (const s of stars) {
        s.z -= sector.speed * dt * STAR_DRIFT;
        if (s.z < CULL_Z) seedStar(s), (s.z = SPAWN_Z);
      }
      spawnAccumulator += dt * sector.spawnRate;
      while (spawnAccumulator >= 1) {
        spawnAccumulator -= 1;
        const c = candidate(sector, shipState.box);
        for (const cand of (Array.isArray(c) ? c : [c])) {
          const placed = placeSpawn(cand, shipState, sector);
          if (placed) asteroids.push(placed);
        }
      }
    },
  };
}
