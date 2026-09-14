// sky.js — the backdrop canvas. WebGL2 when it compiles, Canvas 2D when it does
// not. Nothing in this file knows the serpent exists (spec §5, §9) — the two
// canvases never talk.
//
// The fallback is not a nicety, it is the mitigation. Deep Glow shipped its
// shader unverified because browser validation is out of budget on this repo, and
// paid for it with a tuning pass. Here, a shader that fails to compile costs us
// the haze and the sun shafts and nothing else: the game still runs, still paints
// a sky that blends by altitude, still plays. The GL path is an enhancement on
// top of a 2D floor that always works.
//
// STATUS: the 2D fallback below is real and complete. The GL path is a stub and
// currently always declines, so the skeleton paints through the fallback. That is
// deliberate — it means the safety net is the first thing built and the first
// thing seen, rather than an untested branch nobody exercises.

// TUNABLE — the vertical gradient. The act colour lands at the horizon; the sky
// above it lifts toward light and the ground below sinks toward dark.
const LIFT = 0.45;      // how far the top of the sky brightens from the act colour
const SINK = 0.35;      // how far the bottom darkens

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const css = ([r, g, b]) =>
  `rgb(${Math.round(clamp01(r) * 255)}, ${Math.round(clamp01(g) * 255)}, ${Math.round(clamp01(b) * 255)})`;

const lift = (c, amount) => c.map((n) => n + (1 - n) * amount);
const sink = (c, amount) => c.map((n) => n * (1 - amount));

export function makeSky(canvas) {
  const gl = tryGl(canvas);
  const ctx = gl ? null : canvas.getContext('2d');

  return {
    mode: gl ? 'webgl2' : '2d',

    resize(width, height, dpr) {
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    // colour is the blended act palette from journey.paletteAt(); altitude and
    // time drive the haze and drift once the GL path is real.
    paint(colour, { width, height }) {
      if (gl) return gl.paint(colour, { width, height });

      const g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, css(lift(colour, LIFT)));
      g.addColorStop(0.55, css(colour));
      g.addColorStop(1, css(sink(colour, SINK)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    },
  };
}

// Returns a GL painter, or null to fall back.
//
// Always returns null for now. When the GL path lands it will `makeGl(canvas)`
// from ./gl.js, compile the sky shader, and return null on ANY failure — a
// missing WebGL2 context, a compile error, a link error. Every one of those
// paths must reach the 2D fallback rather than throwing, which is the whole
// point of the file.
function tryGl(_canvas) {
  return null;
}
