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
const float RAY_STRENGTH   = 0.16;
const float RAY_FADE_DEPTH = 400.0;  // god-rays gone by here
const float CAUSTIC_SCALE  = 5.0;
const float CAUSTIC_FADE   = 260.0;
const float MOTE_DENSITY   = 34.0;
const float MOTE_DRIFT     = 0.045;
const float LAMP_SOFTNESS  = 0.85;
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

// Layer 4 — motes: hashed points on a grid scrolled through vUv.y by +t, which
// reads as points drifting UP the screen over time (displayed(v, t) =
// pattern(v + t) brings content from further down the pattern into a higher
// screen position as t grows). That is deliberate: while the mote field itself
// sinks slowly, the diver sinks faster, so relative to the diver the motes
// stream past upward — this is what sells the descent.
float motes(vec2 uv, float aspect, float t) {
  vec2 p = vec2(uv.x * aspect, uv.y + t * MOTE_DRIFT) * MOTE_DENSITY;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h = hash21(cell);
  // Keep the mote's centre away from the cell border (0.2..0.8 instead of
  // 0..1) — otherwise more than half of all motes get sliced by the edge of
  // their own cell, since the 0.16 dot radius only ever samples the home cell.
  vec2 jitter = 0.2 + 0.6 * vec2(hash21(cell + vec2(11.0, 7.0)), hash21(cell + vec2(3.0, 29.0)));
  float d = length(f - jitter);
  // named spot, not dot, so it doesn't shadow the builtin dot()
  float spot = (1.0 - smoothstep(0.0, 0.16, d)) * step(0.82, h);  // ~18% of cells host a mote
  float twinkle = 0.6 + 0.4 * sin(t * 2.0 + h * 6.2831853);       // stays positive
  return spot * twinkle;
}

void main() {
  float t = uTime * uCalm;  // one shared clock — every motion term reads this

  // ---- layer 1: murk gradient ----
  vec3 top = mix(uZoneA, uZoneB, uZoneMix);
  vec3 col = mix(top, top * 0.25, vUv.y);

  // ---- layer 2: god-rays, gone by RAY_FADE_DEPTH ----
  float rayFade = 1.0 - smoothstep(0.0, RAY_FADE_DEPTH, uDepth);
  col += vec3(1.0, 0.97, 0.85) * rayShafts(vUv, t) * RAY_STRENGTH * rayFade;

  // ---- layer 3: caustics, a brightness modulation fading by CAUSTIC_FADE ----
  float causticFade = 1.0 - smoothstep(0.0, CAUSTIC_FADE, uDepth);
  float causticMod = clamp(1.0 + (caustics(vUv, t) - 0.5) * 0.7 * causticFade, 0.0, 2.0);
  col *= causticMod;

  // ---- layer 4: motes, present at every depth (no fade — this is the descent cue) ----
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  col += vec3(0.85, 0.92, 1.0) * motes(vUv, aspect, t) * 0.55;

  // ---- layer 5: lamp interaction, drawn last so it lifts everything beneath it ----
  if (uLamp.z > 0.0) {
    vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    float d = distance(frag, uLamp.xy);
    // innerFrac is INVERTED from LAMP_SOFTNESS: a bigger LAMP_SOFTNESS means a
    // SMALLER saturated core (innerFrac closer to 0) and a wider falloff band
    // out to uLamp.z, because it is the falloff band's inner edge, not its
    // size. At the shipped 0.85 that is a 0.15R core / 0.85R band, matching
    // the pre-tuning-block lamp.
    float innerFrac = clamp(1.0 - LAMP_SOFTNESS, 0.0, 0.95);
    float glow = 1.0 - smoothstep(uLamp.z * innerFrac, uLamp.z, d);
    // 0.5, not 0.9 — 0.9 clamped green/blue to 1.0 across the whole core in
    // brighter zones (e.g. Sunlit Shallows' top ~= (0.15, 0.75, 0.85)), which
    // washed out the rays/caustics/motes already baked into col instead of
    // lifting them.
    col += top * glow * 0.5 + vec3(0.03, 0.035, 0.045) * glow;
  }

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
