import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCamera } from '../games/asteroid-run/camera.js';
import { makeRun, SECTORS } from '../games/asteroid-run/run.js';
import { placeSpawn } from '../games/asteroid-run/fairness.js';

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

const sector = { speed: 320, spread: 260 };

test('fairness: an already-safe candidate is returned unchanged', () => {
  const candidate = { id: 1, x: 200, y: 0, z: 900, r: 20 };
  const ship = { x: -100, y: 0, loop: 0 };
  assert.equal(placeSpawn(candidate, ship, sector), candidate);
});

test('fairness: a candidate bearing straight down on the ship is nudged aside', () => {
  const candidate = { id: 2, x: 0, y: 0, z: 30, r: 40 }; // so close there's no time to reach clear
  const ship = { x: 0, y: 0, loop: 0 };
  const out = placeSpawn(candidate, ship, sector);
  assert.notEqual(out, candidate);
  assert.ok(Math.abs(out.x) > Math.abs(candidate.x), 'not pushed away from the ship');
});

test('fairness: near-ship suppression clears space at high loop', () => {
  const candidate = { id: 3, x: 10, y: 10, z: 600, r: 20 };
  const ship = { x: 0, y: 0, loop: 3 };
  const out = placeSpawn(candidate, ship, sector);
  if (out !== null) {
    assert.ok(Math.hypot(out.x - ship.x, out.y - ship.y) >= 69, 'still too close to the ship');
  }
});

test('fairness: near-ship suppression is inactive at loop 0', () => {
  const candidate = { id: 4, x: 10, y: 10, z: 600, r: 20 };
  const ship = { x: 0, y: 0, loop: 0 };
  const out = placeSpawn(candidate, ship, sector);
  assert.equal(out, candidate);
});

import { checkHits } from '../games/asteroid-run/collision.js';

// simple stub: world x/y map straight to screen, scale fixed at 1
const flatProject = (x, y) => ({ sx: x, sy: y, scale: 1 });
const shipAt = { x: 0, y: 0, z: 60 };

test('collision: an asteroid outside the z-slab never hits', () => {
  const rocks = [{ id: 1, x: 0, y: 0, z: 120, r: 100 }]; // right on top, but too far in z
  assert.deepEqual(checkHits(shipAt, rocks, flatProject), []);
});

test('collision: an overlapping asteroid inside the slab hits', () => {
  const rocks = [{ id: 2, x: 5, y: 0, z: 60, r: 40 }];
  const hits = checkHits(shipAt, rocks, flatProject);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 2);
});

test('collision: a grazing miss does not register', () => {
  // ship radius ~ SHIP_R*0.6, asteroid 0.6*r; centres far enough apart to clear both
  const rocks = [{ id: 3, x: 500, y: 0, z: 60, r: 20 }];
  assert.deepEqual(checkHits(shipAt, rocks, flatProject), []);
});

test('collision: the overlap threshold is pinned at the combined hitbox edge', () => {
  // flatProject → shipRs = 16*0.6 = 9.6, astRs = 20*0.6 = 12, sum = 21.6
  const justOutside = checkHits(shipAt, [{ id: 7, x: 22, y: 0, z: 60, r: 20 }], flatProject);
  assert.deepEqual(justOutside, [], 'a rock 22 units away (sum is 21.6) must not hit');
  const justInside = checkHits(shipAt, [{ id: 8, x: 21, y: 0, z: 60, r: 20 }], flatProject);
  assert.deepEqual(justInside.map((a) => a.id), [8], 'a rock 21 units away must hit');
});

test('collision: multiple simultaneous hits are all returned', () => {
  const rocks = [
    { id: 4, x: 0, y: 0, z: 55, r: 30 },
    { id: 5, x: 3, y: 3, z: 70, r: 30 },
    { id: 6, x: 999, y: 0, z: 60, r: 10 },
  ];
  const ids = checkHits(shipAt, rocks, flatProject).map((a) => a.id).sort();
  assert.deepEqual(ids, [4, 5]);
});

import { makeField } from '../games/asteroid-run/field.js';
import { mulberry32 } from '../games/waffle-wednesday/shift.js';

const flatSector = { speed: 300, spawnRate: 2, sizeRange: [20, 20], spread: 260, pattern: 'scatter' };
const farShip = { x: 0, y: 0, loop: 0 };

test('field: reset fills the star array and clears asteroids', () => {
  const asteroids = [{ id: 9, x: 0, y: 0, z: 5, r: 1 }];
  const stars = [];
  makeField({ rng: mulberry32(1), asteroids, stars }).reset();
  assert.equal(asteroids.length, 0);
  assert.ok(stars.length > 50);
  for (const s of stars) assert.ok(s.z > 0 && s.z <= 900);
});

test('field: spawn rate governs how many asteroids appear', () => {
  const asteroids = [];
  const stars = [];
  const field = makeField({ rng: mulberry32(42), asteroids, stars });
  field.reset();
  field.step(1.0, flatSector, farShip); // rate 2 × 1s ⇒ 2 spawns
  assert.equal(asteroids.length, 2);
});

test('field: asteroids age toward the camera at sector.speed and cull past CULL_Z', () => {
  const asteroids = [];
  const stars = [];
  const field = makeField({ rng: mulberry32(7), asteroids, stars });
  field.reset();
  field.step(1.0, flatSector, farShip);
  const z0 = asteroids[0].z;
  field.step(0.5, { ...flatSector, spawnRate: 0 }, farShip);
  assert.ok(Math.abs(asteroids[0].z - (z0 - 150)) < 1e-6);
  // push everything past the camera
  field.step(10, { ...flatSector, spawnRate: 0 }, farShip);
  assert.equal(asteroids.length, 0);
});

test('field: every candidate passes through placeSpawn (unavoidable ones get nudged)', () => {
  const asteroids = [];
  const stars = [];
  // ship dead centre, high loop ⇒ near-ship suppression will move/skip anything close
  const field = makeField({ rng: mulberry32(3), asteroids, stars });
  field.reset();
  field.step(1.0, { ...flatSector, spread: 5 }, { x: 0, y: 0, loop: 5 });
  for (const a of asteroids) {
    assert.ok(Math.hypot(a.x, a.y) >= 60, 'a spawn landed inside the ship bubble');
  }
});

test('field: it mutates the exact arrays it was given', () => {
  const asteroids = [];
  const stars = [];
  const field = makeField({ rng: mulberry32(1), asteroids, stars });
  field.reset();
  field.step(1.0, flatSector, farShip);
  assert.ok(asteroids.length > 0); // same reference the test holds
});

import { makeShip, MAX_SPEED } from '../games/asteroid-run/ship.js';

const vp = { width: 1280, height: 720 };
const mkShip = () => makeShip({ camera: makeCamera(vp), viewport: vp });

test('ship: eased follow converges on the aim target', () => {
  const ship = mkShip();
  ship.aim(1000, 200, 'mouse');
  let s;
  for (let i = 0; i < 400; i++) s = ship.update(1 / 60);
  const aimed = makeCamera(vp).unproject(1000, 200 - 30, 60);
  assert.ok(Math.abs(s.x - aimed.x) < 2, `x settled at ${s.x}, wanted ~${aimed.x}`);
});

test('ship: movement stays inside the box', () => {
  const ship = mkShip();
  ship.aim(99999, 99999, 'touch'); // way off-screen
  let s;
  for (let i = 0; i < 400; i++) s = ship.update(1 / 60);
  const half = vp.width / 2;
  assert.ok(s.x <= half && s.x >= -half - 1, `x ${s.x} outside width`);
});

test('ship: touch aim sits above the finger', () => {
  const ship = mkShip();
  ship.aim(640, 500, 'touch');
  const settleTouch = (() => { let s; for (let i = 0; i < 400; i++) s = ship.update(1 / 60); return s; })();
  const ship2 = mkShip();
  ship2.aim(640, 500, 'mouse');
  const settleMouse = (() => { let s; for (let i = 0; i < 400; i++) s = ship2.update(1 / 60); return s; })();
  assert.ok(settleTouch.y < settleMouse.y, 'touch target should be higher up (smaller world y) than mouse');
});

test('ship: keyboard thrust moves the target', () => {
  const ship = mkShip();
  const x0 = ship.update(0).x;
  ship.setThrust(1, 0);
  let s;
  for (let i = 0; i < 120; i++) s = ship.update(1 / 60);
  assert.ok(s.x > x0 + 50, 'thrust did not move the ship right');
});

test('ship: a hit costs one shield, then invulnerability blocks the next', () => {
  const ship = mkShip();
  assert.equal(ship.shields, 3);
  assert.equal(ship.hit(), true);
  assert.equal(ship.shields, 2);
  assert.equal(ship.invulnerable, true);
  assert.equal(ship.hit(), false); // ignored while invulnerable
  assert.equal(ship.shields, 2);
});

test('ship: invulnerability clears after its window', () => {
  const ship = mkShip();
  ship.hit();
  for (let i = 0; i < 120; i++) ship.update(1 / 60); // 2s > 900ms
  assert.equal(ship.invulnerable, false);
});

test('ship: refillShields restores to 3', () => {
  const ship = mkShip();
  ship.hit();
  for (let i = 0; i < 120; i++) ship.update(1 / 60);
  ship.hit();
  ship.refillShields();
  assert.equal(ship.shields, 3);
});

test('ship: MAX_SPEED matches the fairness reach constant', () => {
  assert.equal(MAX_SPEED, 520);
});
