// light.js — how brightly the lamp lights a sprite. PURE: imports nothing,
// touches no browser global. game.js calls litAt() once per creature per frame
// and hands the result to batch.push as the sprite's colour multiplier.
//
// The curve is the Claude Design art direction's (§03), chosen to agree with
// the water shader so lit sprites and lit water read as the same light: a
// squared-ish falloff out to 1.35x the lamp radius, biased downward because
// you always sink. The AMBIENT floor is the point — a floor of 1 could only
// ever brighten, so the lamp would do nothing. Below 1, a creature arrives
// out of the dark, blazes as it crosses the beam, and fades as it leaves.
//
// Two departures from the export, both ours: ambient is PER ZONE (sunlight
// lights things in the shallows; the export's flat 0.20 hid them), and
// bumpers never drop below BUMPER_FLOOR — the dark may hide the reward, but
// never the thing that costs you fuel.

export const LAMP_ON_SPRITE = 1.8;  // how much the lamp adds at its core, before emit
export const LAMP_REACH = 1.35;     // the falloff reaches this multiple of the lamp radius
export const BUMPER_FLOOR = 0.5;    // minimum ambient for a bumper, in any zone

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// sx, sy and lamp are in the same pixel space (game.js uses device px).
// `emit` is waterAt().emit — it keeps the lamp a toy against the sun at 50m,
// exactly as the shader does. The result is deliberately unclamped: additive
// blending clips it, and the headroom above 1 is what makes the core hot.
export function litAt(sx, sy, lamp, ambient, emit) {
  if (!(lamp.radius > 0)) return ambient;
  const dx = sx - lamp.x;
  const dy = sy - lamp.y;
  const d = Math.hypot(dx, dy);
  const f = Math.pow(Math.max(0, 1 - d / (lamp.radius * LAMP_REACH)), 2.2);
  const dir = d > 0 ? 0.62 + 0.38 * smoothstep(-0.35, 0.85, dy / d) : 1;
  return ambient + LAMP_ON_SPRITE * f * dir * emit;
}

export function ambientFor(kind, zoneAmbient) {
  return kind === 'bumper' ? Math.max(BUMPER_FLOOR, zoneAmbient) : zoneAmbient;
}
