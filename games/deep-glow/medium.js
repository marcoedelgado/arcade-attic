// medium.js — the water itself, drawn as one fullscreen shader pass. makeMedium
// takes the object from makeGl and returns draw(opts).
//
// The layer RECIPE is not decided here. depth.js owns a per-zone table of layer
// strengths (ZONES[].water) and blends it with the same hold-then-handover as
// the palette (waterAt); draw() uploads the blended values as uWater[] and the
// shader just multiplies. That split is deliberate: the Claude Design export
// this was built from computed zone weights in GLSL, duplicating depth.js's
// zone/loop logic where no test can reach it. The uniform ORDER is depth.js's
// WATER_KEYS, and the W_* #defines below are generated from it.
//
// Clock: t = uTime, full stop. game.js accumulates uTime at a varying RATE
// (reduced motion x the zone's calm x the brownout). Multiplying uTime by a
// changing factor here instead rewrites every phase on screen at once — a
// whole-screen jump. uHush is separate and ONLY closes the vignette.
//
// Everything that is not per-zone sits in the TUNING block: shader work cannot
// be unit-tested, so every number likely to need a playtest nudge lives there.

import { WATER_KEYS } from './depth.js';

const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  // origin at the top-left, matching lamp coordinates in later tasks
  vUv = vec2(aPos.x * 0.5 + 0.5, aPos.y * -0.5 + 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const WATER_DEFINES = WATER_KEYS
  .map((k, i) => `#define W_${k.toUpperCase()} uWater[${i}]`)
  .join('\n');

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
uniform float uTime;       // seconds of game.js's rate-scaled clock
uniform float uHush;       // 0..1, brownout only — closes the vignette
uniform float uWater[${WATER_KEYS.length}];
out vec4 outColor;

${WATER_DEFINES}

// ---- TUNING ----
const float SHAFT_STRENGTH   = 0.26;
const float CAUSTIC_SCALE    = 5.0;
const float CAUSTIC_STRENGTH = 0.60;
const float CURTAIN_STRENGTH = 0.26;
const float SNOW_DENSITY     = 26.0;   // marine-snow grid (the mid layer is x1.3 of this)
const float SNOW_STRENGTH    = 0.40;
const float GLIMMER_STRENGTH = 0.55;
const float EMBER_STRENGTH   = 1.45;
const float SHIMMER_AMOUNT   = 0.012;
const float LAMP_SOFTNESS    = 0.72;
const float LAMP_LIFT        = 0.55;
const float LAMP_ON_SNOW     = 2.2;
const vec3  SUN   = vec3(1.00, 0.97, 0.84);
const vec3  SILT  = vec3(0.55, 0.62, 0.72);
const vec3  EMBER = vec3(1.00, 0.33, 0.09);
const vec3  GLIM  = vec3(0.45, 0.85, 0.95);
const vec3  FLAKE = vec3(0.82, 0.90, 1.00);
const float SKIP  = 0.001;   // a layer weighted below this is not computed at all
// ---- END TUNING ----

// A well-conditioned integer-ish hash: two big odd uint multiplies and an XOR,
// no sin()-based huge-multiplier hashing (that loses precision on mobile
// GPUs). Every call site below builds p from uv (0..1) plus a non-negative
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

// God-rays: three angled sin bands, soft-clipped, weaker toward the floor.
// A cheap fake, not a volumetric march.
float shafts(vec2 uv, float t) {
  float a = sin((uv.x *  3.1 + uv.y * 1.6) * 6.2831853 + t * 0.55);
  float b = sin((uv.x * -2.3 + uv.y * 1.1) * 6.2831853 + t * 0.35 + 1.9);
  float c = sin((uv.x *  4.4 + uv.y * 1.9) * 6.2831853 + t * 0.22 + 3.4);
  return smoothstep(0.25, 0.95, (a + b + c) / 3.0) * (1.0 - uv.y * 0.55);
}

// Caustics: two octaves of value noise, offset in both space and
// (non-negative) time so they don't visibly lock together.
float caustics(vec2 uv, float t) {
  vec2 p = uv * CAUSTIC_SCALE;
  return valueNoise(p + vec2(t * 0.6, t * 0.4)) * 0.65
       + valueNoise(p * 2.07 + vec2(t * 0.35, t * 0.9) + 17.0) * 0.35;
}

// Silt curtains: wide, low-frequency sheets drifting sideways as well as up,
// so the deep has structure CROSSING the frame instead of only falling
// through it. This is what makes The Twilight dusty.
float curtains(vec2 uv, float aspect, float t) {
  vec2 p = vec2(uv.x * aspect * 1.15 + t * 0.035, uv.y * 0.55 + t * 0.02);
  float n = valueNoise(p * 2.0) * 0.6 + valueNoise(p * 5.3 + 31.0) * 0.4;
  return smoothstep(0.44, 0.92, n) * (0.35 + 0.65 * smoothstep(0.0, 0.6, uv.y));
}

// Far glimmers: sparse, breathing, NOT twinkling — distant living things, dim
// enough that the lamp outshines them until the brownout takes it away.
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

// Marine snow. Scrolling uv.y by +t reads as flakes drifting UP the screen:
// the diver sinks faster than the field does, so relative to the diver
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
  float t = uTime;
  float aspect = uResolution.x / max(uResolution.y, 1.0);

  // Heat shimmer bends the SAMPLING uv, so ember light, snow and curtains all
  // wobble together above the vents. Clamped straight back into [0,1]: every
  // hash above casts to uvec2, and uvec2() of a negative float is undefined.
  // The export this came from let the left edge go slightly negative.
  vec2 uv = vUv;
  if (W_SHIMMER > SKIP) {
    uv.x = clamp(uv.x + sin(uv.y * 34.0 - t * 1.6) * SHIMMER_AMOUNT * W_SHIMMER * vUv.y * vUv.y, 0.0, 1.0);
  }

  // ---- layer 1: murk gradient. W_FLOOR > 1 inverts it: the Trench is lit from below. ----
  vec3 top = mix(uZoneA, uZoneB, uZoneMix);
  vec3 col = mix(top, top * W_FLOOR, uv.y);

  // ---- layer 2: ceiling — the last of the daylight, up there ----
  col += mix(top, SUN, 0.35) * pow(1.0 - uv.y, 3.0) * 0.32 * W_CEILING;

  // ---- layer 3: god-rays ----
  if (W_SHAFTS > SKIP) col += SUN * shafts(uv, t) * SHAFT_STRENGTH * W_SHAFTS;

  // ---- layer 4: caustics, as a multiply so it modulates what is already there ----
  col *= clamp(1.0 + (caustics(uv, t) - 0.5) * CAUSTIC_STRENGTH * W_CAUSTICS, 0.0, 2.0);

  // ---- layer 5: silt curtains ----
  if (W_CURTAINS > SKIP) col += mix(top, SILT, 0.25) * curtains(uv, aspect, t) * CURTAIN_STRENGTH * W_CURTAINS;

  // ---- layer 6: far glimmers ----
  if (W_GLIMMERS > SKIP) col += GLIM * glimmers(uv, aspect, t) * GLIMMER_STRENGTH * W_GLIMMERS;

  // ---- layer 7: ember floor and slow updraft vents ----
  if (W_EMBER > SKIP) {
    float band = pow(uv.y, 3.2) * (0.62 + 0.38 * sin(t * 0.6 + uv.x * 5.0));
    float vents = smoothstep(0.55, 1.0, valueNoise(vec2(uv.x * 3.0, t * 0.08)));
    col += EMBER * (band + vents * pow(uv.y, 5.0) * 0.9) * EMBER_STRENGTH * W_EMBER;
  }

  // ---- layer 8: the lamp's falloff, computed BEFORE the snow so that flakes
  // inside the beam can catch the light. ----
  float glow = 0.0;
  if (uLamp.z > 0.0) {
    vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    float d = distance(frag, uLamp.xy);
    // innerFrac is INVERTED from LAMP_SOFTNESS: a bigger LAMP_SOFTNESS means a
    // SMALLER saturated core and a wider falloff band out to uLamp.z.
    float innerFrac = clamp(1.0 - LAMP_SOFTNESS, 0.0, 0.95);
    glow = 1.0 - smoothstep(uLamp.z * innerFrac, uLamp.z, d);
    glow = glow * glow;   // squared: tighter core, much longer soft tail
  }
  // Reveal the water that is already there rather than painting white over it.
  col *= 1.0 + glow * LAMP_LIFT;

  // ---- layer 9: marine snow, three parallax layers, brighter in the beam ----
  float snow =
      snowLayer(uv, aspect, t, SNOW_DENSITY * 2.1, 0.016, 0.09, vec2(0.0, 0.0))   * W_SNOWFAR
    + snowLayer(uv, aspect, t, SNOW_DENSITY * 1.3, 0.032, 0.13, vec2(37.0, 91.0)) * W_SNOWMID
    + snowLayer(uv, aspect, t, SNOW_DENSITY * 0.7, 0.061, 0.20, vec2(83.0, 11.0)) * W_SNOWNEAR;
  col += FLAKE * snow * SNOW_STRENGTH * (1.0 + glow * LAMP_ON_SNOW);

  // A modest cool add so the beam still exists in near-black water, where there
  // is nothing for the multiply above to reveal.
  col += (top * 0.35 + vec3(0.04, 0.09, 0.11)) * glow;

  // ---- brownout vignette: the dark closing in ----
  col *= 1.0 - 0.80 * uHush * smoothstep(0.12, 0.85, length((vUv - 0.5) * vec2(aspect, 1.0)));

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function makeMedium(glx) {
  const { gl, program, fullscreenQuad } = glx;

  const prog = program(VERT_SRC, FRAG_SRC);
  if (!prog) return null;

  const quad = fullscreenQuad();

  // Cache every uniform location once.
  const u = {
    time: gl.getUniformLocation(prog, 'uTime'),
    zoneA: gl.getUniformLocation(prog, 'uZoneA'),
    zoneB: gl.getUniformLocation(prog, 'uZoneB'),
    zoneMix: gl.getUniformLocation(prog, 'uZoneMix'),
    lamp: gl.getUniformLocation(prog, 'uLamp'),
    resolution: gl.getUniformLocation(prog, 'uResolution'),
    hush: gl.getUniformLocation(prog, 'uHush'),
    water: gl.getUniformLocation(prog, 'uWater'),
  };

  // Reused every frame — the water object is flattened into this in WATER_KEYS order.
  const waterBuf = new Float32Array(WATER_KEYS.length);

  function draw({
    time = 0,
    zoneA,
    zoneB,
    zoneMix = 0,
    lamp = null,
    resolution = null,
    water = null,
    hush = 0,
  } = {}) {
    gl.useProgram(prog);
    gl.bindVertexArray(quad);

    gl.uniform1f(u.time, time);
    if (zoneA) gl.uniform3fv(u.zoneA, zoneA);
    if (zoneB) gl.uniform3fv(u.zoneB, zoneB);
    gl.uniform1f(u.zoneMix, zoneMix);
    if (lamp) gl.uniform3f(u.lamp, lamp.x, lamp.y, lamp.radius);
    if (resolution) gl.uniform2f(u.resolution, resolution[0], resolution[1]);
    gl.uniform1f(u.hush, hush);
    if (water) {
      for (let i = 0; i < WATER_KEYS.length; i++) waterBuf[i] = water[WATER_KEYS[i]];
      gl.uniform1fv(u.water, waterBuf);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  return { draw };
}
