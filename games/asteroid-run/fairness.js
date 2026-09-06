// fairness.js — pure. Keeps spawns dodgeable. placeSpawn() returns the candidate
// unchanged when the ship can already get clear, a nudged copy when it can't, or
// null to drop the spawn. All world-space; no projection needed.
//
// Geometry is relative to the ship's reachable box (shipState.box, world coords
// at the cockpit plane). A fixed world-unit bubble would be most of the phone
// play area and would make high-loop escalation EASIER, not harder.

// TUNABLE — every number here moves in playtest.
const SHIP_SPEED = 520;      // world u/s the ship can cover — keep in sync with ship.js MAX_SPEED
const CLEAR_RADIUS = 70;     // world-unit CEILING on the spawn-free bubble at high loop
const SUPPRESS_FROM_LOOP = 2;
const GAP_MARGIN = 1.3;      // required lateral gap = GAP_MARGIN × asteroid radius

export function placeSpawn(candidate, shipState, sectorParams) {
  const box = shipState.box;
  const cx = (box.x0 + box.x1) / 2;
  const boxHalfW = (box.x1 - box.x0) / 2;
  const clearR = Math.min(CLEAR_RADIUS, boxHalfW * 0.5);

  const timeToArrive = candidate.z / sectorParams.speed;
  const reach = SHIP_SPEED * timeToArrive; // how far the ship can travel before the rock arrives

  // 1. Near-ship suppression — only once the run has looped a couple of times.
  if (shipState.loop >= SUPPRESS_FROM_LOOP) {
    const dx = candidate.x - shipState.x;
    const dy = candidate.y - shipState.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    if (dist < clearR) {
      if (reach < clearR) return null; // no time to escape — don't spawn it
      const k = clearR / dist;
      return { ...candidate, x: shipState.x + dx * k, y: shipState.y + dy * k };
    }
  }

  // 2. Reachable-gap check — can the ship slip past this rock laterally in time?
  const need = candidate.r * GAP_MARGIN;
  const lateral = Math.abs(candidate.x - shipState.x);
  if (lateral < need && reach < need - lateral) {
    const dir = candidate.x >= shipState.x ? 1 : -1;
    const nudgedX = shipState.x + dir * (need + 1);
    const limit = boxHalfW * sectorParams.reach;
    const clamped = Math.max(cx - limit, Math.min(cx + limit, nudgedX));
    return { ...candidate, x: clamped };
  }

  return candidate;
}
