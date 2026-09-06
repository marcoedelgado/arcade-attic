// collision.js — pure. Ship vs asteroid: screen-space circle overlap, gated by a
// depth slab straddling the cockpit plane. game.js calls this and applies the
// hits; field.js and ship.js never see it.

const SLAB_LO = 40;   // TUNABLE — only test asteroids with z in [SLAB_LO, SLAB_HI]
const SLAB_HI = 90;
const SHIP_R = 16;    // TUNABLE — ship collision radius in world units
const HITBOX = 0.6;   // TUNABLE — fraction of each projected radius used for overlap (forgiving)

export function checkHits(shipWorldPos, asteroids, project) {
  const sp = project(shipWorldPos.x, shipWorldPos.y, shipWorldPos.z);
  const shipRs = SHIP_R * sp.scale * HITBOX;
  const hits = [];
  for (const a of asteroids) {
    if (a.z < SLAB_LO || a.z > SLAB_HI) continue;
    const ap = project(a.x, a.y, a.z);
    const astRs = a.r * ap.scale * HITBOX;
    if (Math.hypot(ap.sx - sp.sx, ap.sy - sp.sy) < shipRs + astRs) hits.push(a);
  }
  return hits;
}
