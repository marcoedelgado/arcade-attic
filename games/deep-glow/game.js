// game.js — the entry point. Wires the canvas to the GL boundary, the medium and
// the diver, then drives an animation loop. Depth now comes from the diver's real
// `y` (its descent through the water), and the diver sprite is drawn at the
// diver's real screen position. If WebGL2 is missing, or a shader fails to build,
// the player gets the fallback panel and nothing else happens.

import { makeGl, fail } from './gl.js';
import { makeMedium } from './medium.js';
import { buildAtlas } from './sprites.js';
import { makeBatch } from './batch.js';
import { paletteAt } from './depth.js';
import { makeLoop } from './loop.js';
import { makeDiver } from './diver.js';

const DIVER_SCREEN_Y = 0.42;   // the diver sits at this fraction of the canvas; the world scrolls past
const DIVER_SIZE = 64;         // sprite edge in CSS px (scaled by DPR at draw time)

const canvas = document.getElementById('stage');

const glx = makeGl(canvas);
if (!glx) {
  fail('Deep Glow needs a newer browser — it uses WebGL2 for the water.');
} else {
  const medium = makeMedium(glx);
  const atlas = buildAtlas();
  const batch = makeBatch(glx, glx.texture(atlas.canvas), atlas.frames);

  if (!medium || !batch) {
    glx.fail('Deep Glow could not start its water shader — check the console.');
  } else {
    const cssViewport = () => {
      const rect = canvas.getBoundingClientRect();
      return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    };

    const diver = makeDiver({ viewport: cssViewport() });
    const loop = makeLoop();

    let depthM = 0;

    // Hoisted so the per-frame push() allocates nothing — a later task pushes many
    // sprites per frame and reuses this same object.
    const sprite = { id: 'diver', x: 0, y: 0, size: DIVER_SIZE, r: 1, g: 1, b: 1, alpha: 1, rot: 0 };

    function render() {
      const { width, height, dpr } = glx.resize();
      const pal = paletteAt(depthM);
      medium.draw({
        time: performance.now() / 1000,
        depth: depthM,
        zoneA: pal.a,
        zoneB: pal.b,
        zoneMix: pal.mix,
        calm: 1,
      });

      // World -> screen: x is centre-relative CSS px, so the device-pixel screen x
      // is (canvas centre) + x * dpr. The diver's own y is the camera anchor, so
      // its screen y is the fixed DIVER_SCREEN_Y band.
      batch.begin(width, height);
      sprite.x = width / 2 + diver.pos().x * dpr;
      sprite.y = height * DIVER_SCREEN_Y;
      sprite.size = DIVER_SIZE * dpr;
      batch.push(sprite);
      batch.flush();
    }

    loop.start((dt) => {
      depthM = diver.update(dt, { sinkScale: 1 }).y;
      render();
    });

    /* ---------- input ---------- */
    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not all engines */ }
      const p = pointerPos(e);
      diver.aim(p.x, p.y);
    });
    canvas.addEventListener('pointermove', (e) => {
      // No pressure/button gate: a touch pointermove only fires while the finger is
      // down, and phones without Force Touch report e.pressure === 0 the whole drag.
      const p = pointerPos(e);
      diver.aim(p.x, p.y);
    });

    const keys = { ArrowLeft: 0, ArrowRight: 0, ArrowUp: 0, ArrowDown: 0, a: 0, d: 0, w: 0, s: 0 };
    function applyKeys() {
      const x = (keys.ArrowRight || keys.d) - (keys.ArrowLeft || keys.a);
      const y = (keys.ArrowDown || keys.s) - (keys.ArrowUp || keys.w);
      diver.setThrust(Math.sign(x), Math.sign(y));
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key in keys) { keys[e.key] = 1; applyKeys(); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key in keys) { keys[e.key] = 0; applyKeys(); }
    });
    // Without this the diver drifts forever when the player tabs away mid-press.
    window.addEventListener('blur', () => {
      for (const k in keys) keys[k] = 0;
      applyKeys();
    });

    window.addEventListener('resize', () => {
      diver.setViewport(cssViewport());
      render();
    });
    try { canvas.focus(); } catch { /* focus can throw in odd embeddings */ }
  }
}
