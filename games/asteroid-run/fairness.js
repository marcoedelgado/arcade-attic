// fairness.js — pure. Keeps spawns dodgeable. placeSpawn() returns the candidate
// unchanged when the ship can already get clear, a nudged copy when it can't, or
// null to drop the spawn. All world-space; no projection needed.

// TUNABLE — every number here moves in playtest.
const SHIP_SPEED = 520;      // world u/s the ship can cover — keep in sync with ship.js MAX_SPEED
const CLEAR_RADIUS = 70;     // world-unit bubble kept spawn-free around the ship at high loop
const SUPPRESS_FROM_LOOP = 2;
const GAP_MARGIN = 1.3;      // required lateral gap = GAP_MARGIN × asteroid radius

export function placeSpawn(candidate, shipState, sectorParams) {
  const timeToArrive = candidate.z / sectorParams.speed;
  const reach = SHIP_SPEED * timeToArrive; // how far the ship can travel before it arrives

  // 1. Near-ship suppression — only once the run has looped a couple of times.
  if (shipState.loop >= SUPPRESS_FROM_LOOP) {
    const dx = candidate.x - shipState.x;
    const dy = candidate.y - shipState.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    if (dist < CLEAR_RADIUS) {
      if (reach < CLEAR_RADIUS) return null; // no time to escape — don't spawn it
      const k = CLEAR_RADIUS / dist;
      return { ...candidate, x: shipState.x + dx * k, y: shipState.y + dy * k };
    }
  }

  // 2. Reachable-gap check — can the ship slip past this rock laterally in time?
  const need = candidate.r * GAP_MARGIN;
  const lateral = Math.abs(candidate.x - shipState.x);
  if (lateral < need && reach < need - lateral) {
    const dir = candidate.x >= shipState.x ? 1 : -1;
    const nudgedX = shipState.x + dir * (need + 1);
    const clamped = Math.max(-sectorParams.spread, Math.min(sectorParams.spread, nudgedX));
    return { ...candidate, x: clamped };
  }

  return candidate;
}
