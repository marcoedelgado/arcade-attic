// gl.js — the WebGL2 boundary. makeGl(canvas) grabs a webgl2 context and hands
// back the handful of primitives the rest of the game needs: compile+link a
// program, a fullscreen-quad VAO, texture upload, a DPR-capped resize, and a
// fail() that swaps the canvas for the fallback panel. No game logic lives here.
// makeGl returns null when getContext('webgl2') is null — the caller decides
// what to tell the player. Pure GL/DOM wiring, verified by running the game.

// Drop the fallback panel in front of a dead canvas. Module-level so game.js can
// call it before makeGl has even succeeded; makeGl's fail() just delegates here.
export function fail(message) {
  const panel = document.getElementById('dg-fallback');
  const canvas = document.getElementById('stage');
  if (canvas) canvas.hidden = true;
  if (!panel) return;
  panel.textContent = '';
  const p = document.createElement('p');
  p.textContent = message;
  const back = document.createElement('a');
  back.className = 'aa-btn';
  back.href = '../../';
  back.textContent = '← Back to the Attic';
  panel.append(p, back);
  panel.hidden = false;
}

// Prefix every line of GLSL with a 1-based number so a compile error's line
// number actually points at something. A bare info-log is nearly useless.
function numberedSource(src) {
  const lines = src.split('\n');
  const pad = String(lines.length).length;
  return lines
    .map((line, i) => `${String(i + 1).padStart(pad, ' ')} | ${line}`)
    .join('\n');
}

export function makeGl(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  function compileShader(type, src, label) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(
        `Deep Glow: ${label} shader failed to compile\n` +
          `${gl.getShaderInfoLog(shader)}\n` +
          `--- ${label} source ---\n${numberedSource(src)}`,
      );
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  // Compile + link. Returns a usable WebGLProgram or null — never a broken one.
  function program(vertSrc, fragSrc) {
    const vert = compileShader(gl.VERTEX_SHADER, vertSrc, 'vertex');
    const frag = compileShader(gl.FRAGMENT_SHADER, fragSrc, 'fragment');
    if (!vert || !frag) {
      if (vert) gl.deleteShader(vert);
      if (frag) gl.deleteShader(frag);
      return null;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    // Shaders can be flagged for deletion now; the program keeps them alive.
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(
        `Deep Glow: program failed to link\n` +
          `${gl.getProgramInfoLog(prog)}\n` +
          `--- vertex source ---\n${numberedSource(vertSrc)}\n` +
          `--- fragment source ---\n${numberedSource(fragSrc)}`,
      );
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  // Two triangles covering clip space [-1,1]. Attribute location 0, 2 floats/vertex.
  function fullscreenQuad() {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  // Upload a canvas/image. RGBA, LINEAR, CLAMP_TO_EDGE, no premultiply.
  function texture(source) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  // Size the drawing buffer to the CSS box times the DPR, capped at 2 — a 3x
  // phone at full res tanks the framerate for no visible gain.
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    return { width, height, dpr };
  }

  return { gl, program, fullscreenQuad, texture, resize, fail };
}
