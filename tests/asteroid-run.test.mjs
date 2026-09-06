import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCamera } from '../games/asteroid-run/camera.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('camera: project → unproject round-trips at the same z', () => {
  const cam = makeCamera({ width: 1280, height: 720 });
  for (const [x, y, z] of [[0, 0, 60], [120, -40, 300], [-260, 200, 900]]) {
    const p = cam.project(x, y, z);
    const back = cam.unproject(p.sx, p.sy, z);
    assert.ok(near(back.x, x, 1e-4), `x ${back.x} != ${x}`);
    assert.ok(near(back.y, y, 1e-4), `y ${back.y} != ${y}`);
  }
});

test('camera: scale is strictly decreasing in z', () => {
  const cam = makeCamera({ width: 1280, height: 720 });
  let prev = Infinity;
  for (let z = 20; z <= 900; z += 20) {
    const { scale } = cam.project(0, 0, z);
    assert.ok(scale < prev, `scale at z=${z} not < previous`);
    prev = scale;
  }
});

test('camera: setRoll shifts sx only, not sy', () => {
  const cam = makeCamera({ width: 1280, height: 720 });
  const a = cam.project(50, 50, 200);
  cam.setRoll(30);
  const b = cam.project(50, 50, 200);
  assert.equal(b.sx - a.sx, 30);
  assert.equal(b.sy, a.sy);
});

test('camera: resize recomputes centre and horizon', () => {
  const cam = makeCamera({ width: 1280, height: 720 });
  const before = cam.project(0, 0, 100);
  cam.resize({ width: 800, height: 1200 });
  const after = cam.project(0, 0, 100);
  assert.notEqual(before.sx, after.sx); // centreX changed (1280/2 → 800/2)
  assert.notEqual(before.sy, after.sy); // horizonY changed
});

test('camera: two instances are independent', () => {
  const a = makeCamera({ width: 1280, height: 720 });
  const b = makeCamera({ width: 1280, height: 720 });
  a.setRoll(100);
  assert.equal(b.project(0, 0, 100).sx, 640);
});
