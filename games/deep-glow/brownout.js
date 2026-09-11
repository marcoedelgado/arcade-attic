// brownout.js — the brownout as a pure timeline. PURE: imports nothing,
// touches no browser global. game.js calls brownoutAt(elapsed) every frame of
// the BROWNOUT state and applies the result; audio.js times its sweep off BEATS.
//
// The Claude Design art direction's four beats (§04). Nothing flashes, nothing
// is red, nothing is loud: the lamp gutters, the world goes quiet and slow, and
// in the dark the far glimmers were there all along. Then it comes back warm.
// The reward for the dark is seeing what you couldn't with the light on.
//
//   gutter  0.00–0.55  two stutter dips; the water starts to slow
//   hush    0.55–1.60  the lamp shrinks to a coal; the water nearly stops
//   lift    1.60–3.10  you drift up (rise 0 -> 1 of the rescue); nothing asked
//   relight 3.10–4.20  a slow warm bloom with a small overshoot, then settle
//
// The last frame MUST equal what lamp.relight() produces (radius 180 at fuel
// 0.5) — a test pins it — so the handover back to the real lamp is invisible.

export const BROWNOUT_SECONDS = 4.2;
export const BEATS = { gutterEnd: 0.55, hushEnd: 1.6, liftEnd: 3.1 };

const GUTTER_R = 66;    // CSS px — where the gutter lands
const COAL_R = 26;      // the coal: below lamp.js's own 60px floor, on purpose
const RELIT_R = 180;    // lamp.js radius at fuel 0.5
const OVERSHOOT = 22;   // px of bloom on top of the relight's ease-out
const R_MIN = 60;       // lamp.js RADIUS_MIN
const R_SPAN = 240;     // lamp.js RADIUS_MAX - RADIUS_MIN

const lerp = (a, b, k) => a + (b - a) * k;

// t: seconds since the lamp went out. startRadius: the lamp's radius (CSS px)
// at that moment. Returns { radius (CSS px), fuel 0–1, calm 0–1, rise 0–1 };
// past BROWNOUT_SECONDS it holds the final values.
export function brownoutAt(t, startRadius) {
  const { gutterEnd, hushEnd, liftEnd } = BEATS;
  let radius, calm, rise;

  if (t < gutterEnd) {
    const k = Math.max(0, t) / gutterEnd;
    const stutter = 1 - 0.35 * Math.max(0, Math.sin(k * Math.PI * 4));   // two dips
    radius = lerp(startRadius, GUTTER_R, k * k) * stutter;
    calm = lerp(1, 0.85, k);
    rise = 0;
  } else if (t < hushEnd) {
    const k = (t - gutterEnd) / (hushEnd - gutterEnd);
    radius = lerp(GUTTER_R, COAL_R, k);
    calm = lerp(0.85, 0.12, 1 - (1 - k) * (1 - k));   // ease-out
    rise = 0;
  } else if (t < liftEnd) {
    const k = (t - hushEnd) / (liftEnd - hushEnd);
    radius = COAL_R;
    calm = lerp(0.12, 0.35, k);
    rise = k * k * (3 - 2 * k);
  } else {
    const k = Math.min(1, (t - liftEnd) / (BROWNOUT_SECONDS - liftEnd));
    const e = 1 - (1 - k) ** 3;                         // ease-out cubic
    radius = k >= 1
      ? RELIT_R
      : lerp(COAL_R, RELIT_R, e) + OVERSHOOT * Math.sin(Math.PI * Math.min(1, k / 0.85));
    calm = lerp(0.35, 1, e);
    rise = 1;
  }

  const fuel = Math.max(0, Math.min(1, (radius - R_MIN) / R_SPAN));
  return { radius, fuel, calm, rise };
}
