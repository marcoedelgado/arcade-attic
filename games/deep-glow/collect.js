// collect.js — pure geometry for pickups and encounters. Imports nothing, touches
// no browser global, never calls Math.random or Math.sqrt. Every test in the
// suite drives it with plain {x, y} objects and unit-free radii.
//
// All three helpers walk their source array BACKWARDS. That is deliberate, not
// cosmetic: takePlankton/bumped return indices, and returning them in DESCENDING
// order lets the caller do `for (const i of hits) arr.splice(i, 1)` without an
// earlier removal shifting a later index out from under it. The
// "indices come back descending so splicing stays safe" test pins exactly this.
//
// Distances are compared squared — `dx*dx + dy*dy <= r*r` — so there is no sqrt
// anywhere on the hot path.

// takePlankton(pos, plankton, radius) -> number[]
// Indices of every plankton entry whose centre is within `radius` of `pos`,
// descending so the caller can splice them in sequence.
export function takePlankton(pos, plankton, radius) {
  const r2 = radius * radius;
  const hits = [];
  for (let i = plankton.length - 1; i >= 0; i--) {
    const dx = plankton[i].x - pos.x;
    const dy = plankton[i].y - pos.y;
    if (dx * dx + dy * dy <= r2) hits.push(i);
  }
  return hits;
}

// bumped(pos, creatures, radius) -> number[]
// Same shape as takePlankton: indices of creatures the diver has collided with,
// descending. Kind/rarity is not consulted here — a bump is a bump.
export function bumped(pos, creatures, radius) {
  const r2 = radius * radius;
  const hits = [];
  for (let i = creatures.length - 1; i >= 0; i--) {
    const dx = creatures[i].x - pos.x;
    const dy = creatures[i].y - pos.y;
    if (dx * dx + dy * dy <= r2) hits.push(i);
  }
  return hits;
}

// sighted(pos, creatures, lampRadius) -> string[]
// The ids of RARE creatures currently lit by the lamp — the sightings the log
// cares about. Non-rare creatures are never reported. Order follows the same
// backward walk (descending source index) for consistency with the others.
export function sighted(pos, creatures, lampRadius) {
  const r2 = lampRadius * lampRadius;
  const seen = [];
  for (let i = creatures.length - 1; i >= 0; i--) {
    const c = creatures[i];
    if (!c.rare) continue;
    const dx = c.x - pos.x;
    const dy = c.y - pos.y;
    if (dx * dx + dy * dy <= r2) seen.push(c.id);
  }
  return seen;
}
