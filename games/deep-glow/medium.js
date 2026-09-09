// medium.js — the water itself, drawn as one fullscreen shader pass. makeMedium
// takes the object from makeGl and returns draw(opts). For this task the shader
// is just a flat vertical gradient between two "zone" colours; god-rays,
// caustics and motes arrive in Task 7. The draw() signature is already the full
// set — { time, depth, zoneA, zoneB, zoneMix, lamp, calm } — so later tasks grow
// the shader without touching a single call site. Uniform locations the current
// shader does not declare come back null, and gl.uniform*(null, …) is a silent
// no-op, which is exactly what we want.

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
in vec2 vUv;
uniform vec3 uZoneA;
uniform vec3 uZoneB;
uniform float uZoneMix;
out vec4 outColor;
void main() {
  vec3 top = mix(uZoneA, uZoneB, uZoneMix);
  vec3 col = mix(top, top * 0.25, vUv.y);
  outColor = vec4(col, 1.0);
}
`;

export function makeMedium(glx) {
  const { gl, program, fullscreenQuad } = glx;

  const prog = program(VERT_SRC, FRAG_SRC);
  if (!prog) return null;

  const quad = fullscreenQuad();

  // Cache every uniform location once. The ones this task's shader does not
  // declare resolve to null — kept anyway, set anyway, no-op anyway.
  const u = {
    time: gl.getUniformLocation(prog, 'uTime'),
    depth: gl.getUniformLocation(prog, 'uDepth'),
    zoneA: gl.getUniformLocation(prog, 'uZoneA'),
    zoneB: gl.getUniformLocation(prog, 'uZoneB'),
    zoneMix: gl.getUniformLocation(prog, 'uZoneMix'),
    lamp: gl.getUniformLocation(prog, 'uLamp'),
    calm: gl.getUniformLocation(prog, 'uCalm'),
  };

  function draw({
    time = 0,
    depth = 0,
    zoneA,
    zoneB,
    zoneMix = 0,
    lamp = null,
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
    gl.uniform1f(u.calm, calm);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  return { draw };
}
