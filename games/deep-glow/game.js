// game.js — the entry point. Wires the canvas to the GL boundary and the medium,
// then drives an animation loop to render depth-driven colour shifts. If WebGL2
// is missing, or a shader fails to build, the player gets the fallback panel and
// nothing else happens.

import { makeGl, fail } from './gl.js';
import { makeMedium } from './medium.js';
import { buildAtlas } from './sprites.js';
import { makeBatch } from './batch.js';
import { paletteAt } from './depth.js';
import { makeLoop } from './loop.js';

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
    let depthM = 0;
    const loop = makeLoop();

    function render() {
      const { width, height } = glx.resize();
      const pal = paletteAt(depthM);
      medium.draw({
        time: performance.now() / 1000,
        depth: depthM,
        zoneA: pal.a,
        zoneB: pal.b,
        zoneMix: pal.mix,
        calm: 1,
      });

      // Task 4 smoke test: one glowing diver at the centre of the water.
      batch.begin(width, height);
      batch.push({ id: 'diver', x: width / 2, y: height / 2, size: 64 });
      batch.flush();
    }

    loop.start((dt) => {
      depthM += 34 * dt;
      render();
    });

    window.addEventListener('resize', render);
  }
}
