// game.js — the entry point. Wires the canvas to the GL boundary and the medium,
// then drives an animation loop to render depth-driven colour shifts. If WebGL2
// is missing, or a shader fails to build, the player gets the fallback panel and
// nothing else happens.

import { makeGl, fail } from './gl.js';
import { makeMedium } from './medium.js';
import { paletteAt } from './depth.js';
import { makeLoop } from './loop.js';

const canvas = document.getElementById('stage');

const glx = makeGl(canvas);
if (!glx) {
  fail('Deep Glow needs a newer browser — it uses WebGL2 for the water.');
} else {
  const medium = makeMedium(glx);
  if (!medium) {
    glx.fail('Deep Glow could not start its water shader — check the console.');
  } else {
    let depthM = 0;
    const loop = makeLoop();

    function render() {
      glx.resize();
      const pal = paletteAt(depthM);
      medium.draw({
        time: performance.now() / 1000,
        depth: depthM,
        zoneA: pal.a,
        zoneB: pal.b,
        zoneMix: pal.mix,
        calm: 1,
      });
    }

    loop.start((dt) => {
      depthM += 34 * dt;
      render();
    });

    window.addEventListener('resize', render);
  }
}
