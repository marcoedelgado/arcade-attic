// medium.js — the water itself, drawn as one fullscreen shader pass. makeMedium
// takes the object from makeGl and returns draw(opts). The fragment shader is
// built in five layers, cheapest first: the murk gradient (the floor — if
// everything else were switched off the game must still read as deep water),
// god-rays, caustics, motes, then the lamp interaction on top. draw()'s
// signature — { time, depth, zoneA, zoneB, zoneMix, lamp, calm } — has been the
// full set since Task 1, so this task only changes the GLSL string and adds no
// new uniforms: uTime, uDepth and uCalm were already being set unconditionally
// by draw() below, just previously undeclared (and therefore silently
// no-op'd) in the shader. All seven tuning constants that shape the mood live
// in one block at the top of the fragment source.

const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  // origin at the top-left, matching lamp coordinates in later tasks
  vUv = vec2(aPos.x * 0.5 + 0.5, aPos.y * -0.5 + 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;
// hash21 below builds a uvec2 from 32-bit constants — the fragment stage
// defaults to mediump int/uint (mediump uint is only guaranteed 16 bits),
// which would silently truncate that hash to near-zero on real phone GPUs
// (Mali etc.) even though it looks perfect on desktop/ANGLE, where mediump
// is 32-bit anyway. highp int is mandatory in ES 3.00, so this is free.
precision highp int;
in vec2 vUv;
uniform vec3 uZoneA;
uniform vec3 uZoneB;
uniform float uZoneMix;
uniform vec3 uLamp;        // x, y (device px, top-left origin), radius (device px)
uniform vec2 uResolution;  // drawing-buffer size in device px
uniform float uTime;       // seconds
uniform float uDepth;      // metres
uniform float uCalm;       // 0..1; every motion term below is scaled by this
out vec4 outColor;

// ---- TUNING ----
const float RAY_STRENGTH    = 0.30;   // sunlight shafts — surface only, there is no sun in the deep
const float RAY_FADE_DEPTH  = 400.0;
const float CAUSTIC_SCALE   = 5.0;
const float CAUSTIC_FADE    = 260.0;  // caustics weaken past here but never vanish
const float CAUSTIC_FLOOR   = 0.30;   // how much shimmer survives in the deep
const float DEEP_FADE_START = 150.0;  // the deep-water layers fade IN across this
const float DEEP_FADE_END   = 900.0;  //   range, as the sunlit ones fade OUT
const float HAZE_STRENGTH   = 0.16;   // slow drifting murk bands, deep only
const float GLIMMER_STRENGTH = 0.55;  // distant bioluminescence, deep only
const float SNOW_DENSITY    = 26.0;   // marine-snow grid (the near layer's scale)
const float SNOW_DRIFT      = 0.045;
const float LAMP_SOFTNESS   = 0.72;
const float LAMP_LIFT       = 0.55;   // how much the lamp REVEALS what's already there
const float LAMP_ON_SNOW    = 2.2;    // how much brighter flakes are inside the beam
// ---- END TUNING ----

// A well-conditioned integer-ish hash: two big odd uint multiplies and an XOR,
// no sin()-based huge-multiplier hashing (that loses precision on mobile
// GPUs). Every call site below builds p from vUv (0..1) plus a non-negative
// time term, so p is always >= 0 and the float->uint cast is always
// well-defined (never converting a negative float to unsigned).
float hash21(vec2 p) {
  uvec2 q = uvec2(p) * uvec2(1597334677u, 3812015801u);
  uint n = (q.x ^ q.y) * 2654435769u;
  return float(n) * (1.0 / 4294967296.0);
}

// Bilinear value noise on the integer lattice, built from hash21.
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Layer 2 — god-rays: three angled sin bands summed and soft-clipped into
// shafts. A cheap fake, not a volumetric march.
float rayShafts(vec2 uv, float t) {
  float a = sin((uv.x * 3.1 + uv.y * 1.6) * 6.2831853 + t * 0.55);
  float b = sin((uv.x * -2.3 + uv.y * 1.1) * 6.2831853 + t * 0.35 + 1.9);
  float c = sin((uv.x * 4.4 + uv.y * 1.9) * 6.2831853 + t * 0.22 + 3.4);
  float bands = (a + b + c) / 3.0;       // in [-1, 1]
  return smoothstep(0.25, 0.95, bands);  // soft shafts, always in [0, 1]
}

// Layer 3 — caustics: two octaves of the value noise above, offset in both
// space and (non-negative) time so they don't visibly lock together.
float caustics(vec2 uv, float t) {
  vec2 p = uv * CAUSTIC_SCALE;
  float n1 = valueNoise(p + vec2(t * 0.6, t * 0.4));
  float n2 = valueNoise(p * 2.07 + vec2(t * 0.35, t * 0.9) + 17.0);
  return n1 * 0.65 + n2 * 0.35;  // in [0, 1]
}

// Layer 3b — deep haze: very low-frequency noise bands drifting slowly upward.
// This is what REPLACES the god-rays once there is no sun left to cast them,
// so the deep still has structure moving through it instead of flat murk.
float deepHaze(vec2 uv, float aspect, float t) {
  vec2 p = vec2(uv.x * aspect * 0.9, uv.y * 1.7 + t * 0.02);
  float n = valueNoise(p + vec2(t * 0.05, 0.0)) * 0.65
          + valueNoise(p * 2.3 + vec2(31.0, t * 0.08)) * 0.35;
  return smoothstep(0.45, 0.95, n);
}

// Layer 3c — glimmers: sparse bioluminescent points far off in the murk.
// Bigger, dimmer and slower than marine snow, and they breathe rather than
// twinkle, so they read as distant living things rather than dust.
float glimmers(vec2 uv, float aspect, float t) {
  vec2 p = vec2(uv.x * aspect, uv.y + t * 0.012) * 7.0;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h = hash21(cell + vec2(71.0, 13.0));
  vec2 jitter = 0.25 + 0.5 * vec2(hash21(cell + vec2(5.0, 41.0)), hash21(cell + vec2(23.0, 2.0)));
  float spot = 1.0 - smoothstep(0.0, 0.34, length(f - jitter));
  float breathe = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * 0.7 + h * 6.2831853));
  return spot * step(0.90, h) * breathe;
}

// Layer 4 — marine snow. Scrolling vUv.y by +t reads as flakes drifting UP the
// screen: the diver sinks faster than the field does, so relative to the diver
// everything streams past upward.
//
// Three of these are summed at different scales and speeds. That parallax is
// most of what separates "underwater" from "starfield" — a single uniform layer
// of hard white points reads as stars no matter what colour the water is. Near
// flakes are large, bright and fast; far ones small, dim and slow.
float snowLayer(vec2 uv, float aspect, float t, float density, float drift, float radius, vec2 seed) {
  vec2 p = vec2(uv.x * aspect, uv.y + t * drift) * density;
  vec2 cell = floor(p) + seed;   // seed keeps the three layers decorrelated
  vec2 f = fract(p);
  float h = hash21(cell);
  // Keep the flake's centre away from the cell border (0.2..0.8 instead of
  // 0..1) — otherwise more than half get sliced by the edge of their own cell,
  // since the radius only ever samples the home cell.
  vec2 jitter = 0.2 + 0.6 * vec2(hash21(cell + vec2(11.0, 7.0)), hash21(cell + vec2(3.0, 29.0)));
  float r = radius * (0.55 + 0.45 * hash21(cell + vec2(17.0, 53.0)));  // per-flake size
  // named spot, not dot, so it doesn't shadow the builtin dot()
  float spot = 1.0 - smoothstep(0.0, r, length(f - jitter));
  float bright = 0.45 + 0.55 * hash21(cell + vec2(61.0, 19.0));        // per-flake brightness
  float breathe = 0.7 + 0.3 * sin(t * 1.1 + h * 6.2831853);            // stays positive
  return spot * step(0.80, h) * bright * breathe;
}

void main() {
  float t = uTime * uCalm;  // one shared clock — every motion term reads this

  // ---- layer 1: murk gradient ----
  vec3 top = mix(uZoneA, uZoneB, uZoneMix);
  vec3 col = mix(top, top * 0.25, vUv.y);

  // ---- layer 2: god-rays, gone by RAY_FADE_DEPTH ----
  float rayFade = 1.0 - smoothstep(0.0, RAY_FADE_DEPTH, uDepth);
  col += vec3(1.0, 0.97, 0.85) * rayShafts(vUv, t) * RAY_STRENGTH * rayFade;

  // ---- layer 3: caustics. Strong at the surface, but floored at
  // CAUSTIC_FLOOR rather than fading to nothing — the old version reached zero
  // at 260m (7.6 seconds in) and never came back, which is a large part of why
  // the deep looked so empty. ----
  float causticFade = mix(CAUSTIC_FLOOR, 1.0, 1.0 - smoothstep(0.0, CAUSTIC_FADE, uDepth));
  float causticMod = clamp(1.0 + (caustics(vUv, t) - 0.5) * 0.7 * causticFade, 0.0, 2.0);
  col *= causticMod;

  float aspect = uResolution.x / max(uResolution.y, 1.0);

  // ---- layers 3b/3c: the deep-water pair, fading IN as the sunlit ones fade
  // OUT. Every original layer faded out with depth, so past ~400m the water
  // held only a gradient, dots and the lamp — three ingredients, forever. These
  // two keep roughly three layers alive at EVERY depth instead. ----
  float deep = smoothstep(DEEP_FADE_START, DEEP_FADE_END, uDepth);
  col += top * deepHaze(vUv, aspect, t) * HAZE_STRENGTH * deep;
  col += vec3(0.45, 0.85, 0.95) * glimmers(vUv, aspect, t) * GLIMMER_STRENGTH * deep;

  // ---- layer 5a: the lamp's falloff, computed BEFORE the snow so that flakes
  // inside the beam can catch the light. A lamp underwater is legible mostly
  // because of what drifts through it, not because of the glow itself. ----
  float glow = 0.0;
  if (uLamp.z > 0.0) {
    vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    float d = distance(frag, uLamp.xy);
    // innerFrac is INVERTED from LAMP_SOFTNESS: a bigger LAMP_SOFTNESS means a
    // SMALLER saturated core and a wider falloff band out to uLamp.z, because
    // it is the band's inner edge, not its size.
    float innerFrac = clamp(1.0 - LAMP_SOFTNESS, 0.0, 0.95);
    glow = 1.0 - smoothstep(uLamp.z * innerFrac, uLamp.z, d);
    glow = glow * glow;   // squared: tighter core, much longer soft tail
  }
  // Reveal the water that is already there rather than painting white over it.
  col *= 1.0 + glow * LAMP_LIFT;

  // ---- layer 4: marine snow, three parallax layers, at every depth. Brighter
  // inside the beam — this is the cue that actually reads as "a lamp in water". ----
  float snow =
      snowLayer(vUv, aspect, t, SNOW_DENSITY * 2.1, SNOW_DRIFT * 0.35, 0.09, vec2(0.0, 0.0))   * 0.35
    + snowLayer(vUv, aspect, t, SNOW_DENSITY * 1.3, SNOW_DRIFT * 0.70, 0.13, vec2(37.0, 91.0)) * 0.60
    + snowLayer(vUv, aspect, t, SNOW_DENSITY * 0.7, SNOW_DRIFT * 1.35, 0.20, vec2(83.0, 11.0)) * 1.00;
  col += vec3(0.82, 0.90, 1.0) * snow * 0.42 * (1.0 + glow * LAMP_ON_SNOW);

  // A modest cool add so the beam still exists in near-black water, where there
  // is nothing for the multiply above to reveal.
  col += (top * 0.35 + vec3(0.04, 0.09, 0.11)) * glow;

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function makeMedium(glx) {
  const { gl, program, fullscreenQuad } = glx;

  const prog = program(VERT_SRC, FRAG_SRC);
  if (!prog) return null;

  const quad = fullscreenQuad();

  // Cache every uniform location once. Every uniform draw() sets is now
  // actually declared in the shader above; the null-is-a-no-op pattern stays
  // in place for whichever future task adds an optional one.
  const u = {
    time: gl.getUniformLocation(prog, 'uTime'),
    depth: gl.getUniformLocation(prog, 'uDepth'),
    zoneA: gl.getUniformLocation(prog, 'uZoneA'),
    zoneB: gl.getUniformLocation(prog, 'uZoneB'),
    zoneMix: gl.getUniformLocation(prog, 'uZoneMix'),
    lamp: gl.getUniformLocation(prog, 'uLamp'),
    resolution: gl.getUniformLocation(prog, 'uResolution'),
    calm: gl.getUniformLocation(prog, 'uCalm'),
  };

  function draw({
    time = 0,
    depth = 0,
    zoneA,
    zoneB,
    zoneMix = 0,
    lamp = null,
    resolution = null,
    calm = 0,
  } = {}) {
    gl.useProgram(prog);
    gl.bindVertexArray(quad);

    gl.uniform1f(u.time, time);
    gl.uniform1f(u.depth, depth);
    if (zoneA) gl.uniform3fv(u.zoneA, zoneA);
    if (zoneB) gl.uniform3fv(u.zoneB, zoneB);
    gl.uniform1f(u.zoneMix, zoneMix);
    if (lamp) gl.uniform3f(u.lamp, lamp.x, lamp.y, lamp.radius);
    if (resolution) gl.uniform2f(u.resolution, resolution[0], resolution[1]);
    gl.uniform1f(u.calm, calm);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  return { draw };
}
