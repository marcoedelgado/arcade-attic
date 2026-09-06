// field.js — pure over an injected rng. Spawns, ages and culls the asteroid and
// star fields for the current sector. Operates on the arrays game.js owns and
// hands in at construction, so the renderer reads the same references.

import { placeSpawn } from './fairness.js';

export const SPAWN_Z = 900;
export const CULL_Z = 4;
const STAR_COUNT = 140;
const STAR_SPREAD_X = 600;
const STAR_SPREAD_Y = 400;
const STAR_DRIFT = 0.6; // stars travel this fraction of sector.speed (parallax)

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

  function candidate(sector) {
    const [lo, hi] = sector.sizeRange;
    let x;
    let y = signed(sector.spread * 0.7);
    switch (sector.pattern) {
      case 'stream': {
        const side = rng() < 0.5 ? -1 : 1;
        x = side * sector.spread * between(0.6, 1.0);
        y = signed(sector.spread * 0.5);
        break;
      }
      case 'gate': {
        const gap = between(90, 130);
        const side = rng() < 0.5 ? -1 : 1;
        x = side * (gap + rng() * 40);
        y = signed(sector.spread * 0.4);
        break;
      }
      case 'driftfield':
      case 'scatter':
      default:
        x = signed(sector.spread);
    }
    return { id: nextId++, x, y, z: SPAWN_Z, r: between(lo, hi), spin: signed(1.5), seed: rng() };
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
        asteroids[i].z -= sector.speed * dt;
        if (asteroids[i].z < CULL_Z) asteroids.splice(i, 1);
      }
      for (const s of stars) {
        s.z -= sector.speed * dt * STAR_DRIFT;
        if (s.z < CULL_Z) seedStar(s), (s.z = SPAWN_Z);
      }
      spawnAccumulator += dt * sector.spawnRate;
      while (spawnAccumulator >= 1) {
        spawnAccumulator -= 1;
        const placed = placeSpawn(candidate(sector), shipState, sector);
        if (placed) asteroids.push(placed);
      }
    },
  };
}
