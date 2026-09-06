import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCamera } from '../games/asteroid-run/camera.js';
import { makeRun, SECTORS } from '../games/asteroid-run/run.js';

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

test('run: a sector clears exactly at its duration', () => {
  const run = makeRun();
  const d = SECTORS[0].duration;
  let r = run.advance(d - 0.1);
  assert.equal(r.justCleared, false);
  assert.equal(run.snapshot().sectorIndex, 0);
  r = run.advance(0.2); // crosses d
  assert.equal(r.justCleared, true);
  assert.equal(run.snapshot().sectorIndex, 1);
});

test('run: justCleared is true for one frame only', () => {
  const run = makeRun();
  run.advance(SECTORS[0].duration + 0.01);
  const next = run.advance(0.016);
  assert.equal(next.justCleared, false);
});

test('run: wraps to sector index 1 and bumps loop after the last named sector', () => {
  const run = makeRun();
  for (let i = 0; i < SECTORS.length; i++) {
    run.advance(SECTORS[run.snapshot().sectorIndex].duration + 0.01);
  }
  assert.equal(run.snapshot().sectorIndex, 1);
  assert.equal(run.snapshot().loop, 1);
});

test('run: escalation multiplies speed but respects the cap', () => {
  const run = makeRun();
  for (let i = 0; i < SECTORS.length * 15; i++) {
    run.advance(SECTORS[run.snapshot().sectorIndex].duration + 0.01);
  }
  const r = run.advance(0.016);
  const base = SECTORS[run.snapshot().sectorIndex].speed;
  assert.ok(r.sector.speed <= base * 2.4 + 1e-6, `speed ${r.sector.speed} over cap (base ${base})`);
  assert.ok(r.sector.speed > base, 'speed did not escalate at all');
});

test('run: reducedMotion scales the effective sector down', () => {
  const plain = makeRun().advance(0.016).sector;
  const reduced = makeRun({ reducedMotion: true }).advance(0.016).sector;
  assert.ok(reduced.speed < plain.speed * 0.7);
  assert.ok(reduced.spawnRate < plain.spawnRate * 0.7);
});
