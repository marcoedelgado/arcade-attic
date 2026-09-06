// fx.js — pure. Sector-to-sector accent-hue blending for the warp-jump
// transition. game.js drives it: reset() at run start, trigger() on justCleared,
// step(dt) every frame, then reads hue / warpT / target for render + hud.

// Shortest-path hue interpolation. Handles the 360-degree wrap: 350 -> 10 goes
// 20 degrees forward through 0, not 340 backward. Result is NOT wrapped to
// [0, 360) — callers hand it to oklch(), which wraps.
export function lerpHue(a, b, u) {
  const d = (((b - a) % 360 + 540) % 360) - 180;
  return a + d * u;
}

export function makeWarp({ warpMs = 1100 } = {}) {
  let hueFrom = 0;
  let hueTo = 0;
  let warpT = 0; // 1 at trigger, decays to 0 over warpMs

  return {
    trigger(from, to) { hueFrom = from; hueTo = to; warpT = 1; },
    reset(hue) { hueFrom = hue; hueTo = hue; warpT = 0; },
    step(dt) { if (warpT > 0) warpT = Math.max(0, warpT - (dt * 1000) / warpMs); },
    get hue() { return lerpHue(hueFrom, hueTo, 1 - warpT); },
    get warpT() { return warpT; },
    get target() { return hueTo; },
  };
}
