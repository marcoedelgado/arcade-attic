// particles.js — pure over an injected rng. Two short-lived particle fields that
// game.js owns and hands in: `debris` (world-space, spawned on impacts and on
// ship death, projected by render.js) and `trail` (screen-space engine exhaust,
// emitted behind the ship each playing frame). This module only spawns, ages and
// culls; the arrays stay the same references render.js reads.

const DEBRIS_DECAY = 1.4; // life lost per second
const TRAIL_DECAY = 2.2;

export function makeParticles({ rng = Math.random, debris, trail }) {
  function spawnDebris(at, n) {
    for (let i = 0; i < n; i++) {
      const ang = rng() * Math.PI * 2;
      const sp = 40 + rng() * 120;
      debris.push({
        x: at.x, y: at.y, z: at.z,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 60 + rng() * 120,
        life: 1,
      });
    }
  }

  function spawnTrail(sx, sy, hot) {
    const ang = Math.PI / 2 + (rng() * 0.6 - 0.3);
    const sp = 30 + rng() * 50;
    trail.push({
      x: sx + (rng() * 10 - 5), y: sy,
      vx: Math.cos(ang) * sp * 0.2, vy: Math.sin(ang) * sp,
      life: 1, hot,
    });
  }

  function step(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.life -= dt * DEBRIS_DECAY;
      if (d.life <= 0) debris.splice(i, 1);
    }
    for (let i = trail.length - 1; i >= 0; i--) {
      const t = trail[i];
      t.x += t.vx * dt; t.y += t.vy * dt;
      t.life -= dt * TRAIL_DECAY;
      if (t.life <= 0) trail.splice(i, 1);
    }
  }

  function clear() {
    debris.length = 0;
    trail.length = 0;
  }

  return { spawnDebris, spawnTrail, step, clear };
}
