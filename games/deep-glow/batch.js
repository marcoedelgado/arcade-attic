// batch.js — the additive quad batcher. makeBatch(glx, texture, frames) returns
// { begin, push, flush }. Every actor in a frame is one instance of a unit quad;
// flush() draws the whole lot in a single gl.drawArraysInstanced call with
// additive blending, so the sprites brighten the water they sit in rather than
// occluding it. Draw order is array (push) order; depth testing stays off.
//
// The per-instance data lives in ONE Float32Array that is reused every frame and
// only ever grows (geometrically). Nothing is allocated per frame — this runs at
// 60fps on a phone.

const FLOATS_PER_INSTANCE = 12;
// layout: offset.xy(0,1) size(2) colour.rgb(3,4,5) alpha(6) rot(7) uvRect(8,9,10,11)

const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 aCorner;   // unit quad, 0..1
layout(location = 1) in vec2 aOffset;   // centre in pixels, top-left origin
layout(location = 2) in float aSize;    // quad edge length in pixels
layout(location = 3) in vec3 aColor;    // multiplies the sprite
layout(location = 4) in float aAlpha;
layout(location = 5) in float aRot;     // radians
layout(location = 6) in vec4 aUvRect;   // u0, v0, u1, v1 in atlas space

uniform vec2 uResolution;

out vec2 vUv;
out vec3 vColor;
out float vAlpha;

void main() {
  vec2 local = (aCorner - 0.5) * aSize;
  float c = cos(aRot);
  float s = sin(aRot);
  vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 px = aOffset + rotated;

  vec2 clip = vec2(
    px.x / uResolution.x * 2.0 - 1.0,
    1.0 - px.y / uResolution.y * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);

  // aCorner.y == 0 is the sprite's top edge -> frame v0. gl.js uploads the atlas
  // canvas with UNPACK_FLIP_Y false, so canvas row 0 lands at texture v0: the
  // sprite's on-screen top samples the cell's canvas top with no flip.
  vUv = mix(aUvRect.xy, aUvRect.zw, aCorner);
  vColor = aColor;
  vAlpha = aAlpha;
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vColor;
in float vAlpha;
uniform sampler2D uAtlas;
out vec4 outColor;
void main() {
  vec4 tex = texture(uAtlas, vUv);
  // Straight (non-premultiplied) colour; blendFunc(SRC_ALPHA, ONE) applies the
  // alpha. The sprite's own radial falloff to zero alpha is what shapes the glow.
  outColor = vec4(tex.rgb * vColor, tex.a * vAlpha);
}
`;

export function makeBatch(glx, texture, frames) {
  const { gl, program } = glx;

  const prog = program(VERT_SRC, FRAG_SRC);
  if (!prog) return null;

  const uResolution = gl.getUniformLocation(prog, 'uResolution');
  const uAtlas = gl.getUniformLocation(prog, 'uAtlas');

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Static unit quad (two triangles), attribute 0.
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Per-instance interleaved buffer. Sized in flush(); grows, never shrinks.
  const instanceBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
  const stride = FLOATS_PER_INSTANCE * 4;
  const f = 4;
  //                 loc, size, offset(bytes)
  attrib(1, 2, 0 * f); // aOffset
  attrib(2, 1, 2 * f); // aSize
  attrib(3, 3, 3 * f); // aColor
  attrib(4, 1, 6 * f); // aAlpha
  attrib(5, 1, 7 * f); // aRot
  attrib(6, 4, 8 * f); // aUvRect

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  function attrib(loc, size, offsetBytes) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offsetBytes);
    gl.vertexAttribDivisor(loc, 1);
  }

  let capacity = 256; // instances
  let cpu = new Float32Array(capacity * FLOATS_PER_INSTANCE);
  let gpuCapacity = 0; // instances the GL buffer is currently sized for
  let count = 0;
  let width = 1;
  let height = 1;

  const unknownIds = new Set();

  function begin(w, h) {
    width = w;
    height = h;
    count = 0;
  }

  function push({ id, x, y, size, r = 1, g = 1, b = 1, alpha = 1, rot = 0 }) {
    const frame = frames[id];
    if (!frame) {
      // An unknown id would otherwise draw nothing, silently. Say so — once.
      if (!unknownIds.has(id)) {
        unknownIds.add(id);
        console.error(`Deep Glow: batch.push() got unknown frame id ${JSON.stringify(id)}`);
      }
      return;
    }

    if (count === capacity) {
      capacity *= 2;
      const bigger = new Float32Array(capacity * FLOATS_PER_INSTANCE);
      bigger.set(cpu);
      cpu = bigger;
    }

    const o = count * FLOATS_PER_INSTANCE;
    cpu[o] = x;
    cpu[o + 1] = y;
    cpu[o + 2] = size;
    cpu[o + 3] = r;
    cpu[o + 4] = g;
    cpu[o + 5] = b;
    cpu[o + 6] = alpha;
    cpu[o + 7] = rot;
    cpu[o + 8] = frame.u0;
    cpu[o + 9] = frame.v0;
    cpu[o + 10] = frame.u1;
    cpu[o + 11] = frame.v1;
    count++;
  }

  function flush() {
    if (count === 0) return;

    gl.useProgram(prog);
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    if (capacity > gpuCapacity) {
      // Reallocate the GL store to match the (grown) CPU array, then keep it.
      gl.bufferData(gl.ARRAY_BUFFER, cpu.byteLength, gl.DYNAMIC_DRAW);
      gpuCapacity = capacity;
    }
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      cpu,
      0,
      count * FLOATS_PER_INSTANCE,
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uAtlas, 0);
    gl.uniform2f(uResolution, width, height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
    gl.disable(gl.DEPTH_TEST);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);

    // Leave blend off so the next frame's opaque medium pass overwrites cleanly.
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  return { begin, push, flush };
}
