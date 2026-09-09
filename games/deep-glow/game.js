// game.js — the entry point. Wires the canvas to the GL boundary and the medium,
// then draws one frame with hardcoded colours. There is no animation loop yet —
// the frame clock arrives in Task 3 — so we just redraw on resize. If WebGL2 is
// missing, or a shader fails to build, the player gets the fallback panel and
// nothing else happens.

import { makeGl, fail } from './gl.js';
import { makeMedium } from './medium.js';

const canvas = document.getElementById('stage');

const glx = makeGl(canvas);
if (!glx) {
  fail('Deep Glow needs a newer browser — it uses WebGL2 for the water.');
} else {
  const medium = makeMedium(glx);
  if (!medium) {
    glx.fail('Deep Glow could not start its water shader — check the console.');
  } else {
    // hardcoded for Task 1; real zone/lamp state arrives in later tasks
    const frame = {
      zoneA: [0.12, 0.55, 0.62],
      zoneB: [0.05, 0.22, 0.45],
      zoneMix: 0.35,
    };

    function render() {
      glx.resize();
      medium.draw(frame);
    }

    render();
    window.addEventListener('resize', render);
  }
}
