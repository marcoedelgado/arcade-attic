import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCamera } from '../games/asteroid-run/camera.js';
import { makeRun, SECTORS } from '../games/asteroid-run/run.js';
import { placeSpawn } from '../games/asteroid-run/fairness.js';
import { makeLoop } from '../games/asteroid-run/loop.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// A stand-in for ship.box() at a 1280×720-ish viewport: half-width 80, y-centre ~40.
const boxStub = { x0: -80, x1: 80, y0: -3, y1: 84 };

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

test('run: every sector carries a numeric reach multiplier (not absolute units)', () => {
  for (const s of SECTORS) {
    assert.equal(typeof s.reach, 'number', `${s.name} reach is not a number`);
    assert.ok(s.reach >= 1 && s.reach <= 2, `${s.name} reach ${s.reach} out of [1, 2]`);
    assert.equal(s.spread, undefined, `${s.name} still has a legacy spread key`);
  }
});

test('run: reach does not escalate with loop', () => {
  const run = makeRun();
  for (let i = 0; i < SECTORS.length * 5; i++) {
    run.advance(SECTORS[run.snapshot().sectorIndex].duration + 0.01);
  }
  const idx = run.snapshot().sectorIndex;
  assert.equal(run.advance(0.016).sector.reach, SECTORS[idx].reach);
});

test('run: every sector carries a valid hazard kind and accent hue', () => {
  const kinds = new Set(['asteroids', 'mines', 'wreckage']);
  for (const s of SECTORS) {
    assert.ok(kinds.has(s.kind), `${s.name} kind ${s.kind} not asteroids/mines/wreckage`);
    assert.equal(typeof s.hue, 'number', `${s.name} hue is not a number`);
    assert.ok(s.hue >= 0 && s.hue < 360, `${s.name} hue ${s.hue} out of [0, 360)`);
  }
});

test('run: kind and hue do not escalate with loop', () => {
  const run = makeRun();
  for (let i = 0; i < SECTORS.length * 5; i++) {
    run.advance(SECTORS[run.snapshot().sectorIndex].duration + 0.01);
  }
  const idx = run.snapshot().sectorIndex;
  const eff = run.advance(0.016).sector;
  assert.equal(eff.kind, SECTORS[idx].kind);
  assert.equal(eff.hue, SECTORS[idx].hue);
});

test('run: snapshot exposes the current sector accent hue', () => {
  const run = makeRun();
  assert.equal(run.snapshot().sectorHue, SECTORS[0].hue);
  run.advance(SECTORS[0].duration + 0.01);
  assert.equal(run.snapshot().sectorHue, SECTORS[1].hue);
});

const sector = { speed: 320, reach: 1.3 };

test('fairness: an already-safe candidate is returned unchanged', () => {
  const candidate = { id: 1, x: 200, y: 0, z: 900, r: 20 };
  const ship = { x: -100, y: 0, loop: 0, box: boxStub };
  assert.equal(placeSpawn(candidate, ship, sector), candidate);
});

// Exercises the reachable-gap branch as a unit contract; the live spawner only
// produces z=900, where that branch is a low-z backstop.
test('fairness: a candidate bearing down on the ship is nudged aside and clamped to the box reach', () => {
  const candidate = { id: 2, x: 0, y: 0, z: 30, r: 90 }; // so close + big that no lateral gap is reachable
  const ship = { x: 0, y: 0, loop: 0, box: boxStub };
  const out = placeSpawn(candidate, ship, sector);
  assert.notEqual(out, candidate);
  assert.ok(Math.abs(out.x) > Math.abs(candidate.x), 'not pushed away from the ship');
  // clamped to boxHalfW * reach = 80 * 1.3 = 104, NOT the old absolute spread
  assert.ok(Math.abs(out.x) <= 80 * 1.3 + 1e-9, `out.x ${out.x} exceeds the box reach clamp`);
});

test('fairness: near-ship suppression clears a box-relative bubble at high loop', () => {
  const candidate = { id: 3, x: 10, y: 10, z: 600, r: 20 };
  const ship = { x: 0, y: 0, loop: 3, box: boxStub };
  const clearR = Math.min(70, (boxStub.x1 - boxStub.x0) / 2 * 0.5); // = 40 here
  const out = placeSpawn(candidate, ship, sector);
  assert.ok(
    out === null || Math.hypot(out.x - ship.x, out.y - ship.y) >= clearR - 1e-9,
    `expected null or a spawn >= ${clearR} from the ship, got ${JSON.stringify(out)}`,
  );
});

test('fairness: near-ship suppression is inactive at loop 0', () => {
  const candidate = { id: 4, x: 10, y: 10, z: 600, r: 20 };
  const ship = { x: 0, y: 0, loop: 0, box: boxStub };
  assert.equal(placeSpawn(candidate, ship, sector), candidate);
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

const flatSector = { speed: 300, spawnRate: 2, sizeRange: [20, 20], reach: 1.4, pattern: 'scatter', kind: 'asteroids' };
const farShip = { x: 0, y: 0, loop: 0, box: boxStub };

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

test('field: every candidate passes through placeSpawn (near-ship bubble is kept clear)', () => {
  const asteroids = [];
  const stars = [];
  const field = makeField({ rng: mulberry32(3), asteroids, stars });
  field.reset();
  const clearR = Math.min(70, (boxStub.x1 - boxStub.x0) / 2 * 0.5);
  // ship at the box CENTRE (not y=0 — the box y-centre is +40.5), high loop ⇒
  // every reach:0.1 candidate lands inside the near-ship bubble and must be
  // nudged out to ~clearR. (At y=0 the candidates sit ~40 from the ship on their
  // own and the assertion would pass without placeSpawn touching them.)
  const shipY = (boxStub.y0 + boxStub.y1) / 2;
  field.step(1.0, { ...flatSector, reach: 0.1 }, { x: 0, y: shipY, loop: 5, box: boxStub });
  for (const a of asteroids) {
    const d = Math.hypot(a.x - 0, a.y - shipY);
    assert.ok(
      d >= clearR - 1e-9,
      `a spawn landed ${d.toFixed(1)} from the ship (< ${clearR})`,
    );
  }
});

test('field: a stream rock drifts laterally back toward the box centre', () => {
  const asteroids = [];
  const stars = [];
  const field = makeField({ rng: mulberry32(11), asteroids, stars });
  field.reset();
  field.step(1.0, { ...flatSector, pattern: 'stream', spawnRate: 1, reach: 1.15 }, { x: 0, y: 0, loop: 0, box: boxStub });
  assert.equal(asteroids.length, 1);
  const a = asteroids[0];
  assert.notEqual(a.vx, 0, 'stream rock has no lateral drift');
  assert.equal(Math.sign(a.vx), -Math.sign(a.x), `vx ${a.vx} should point back toward centre from x ${a.x}`);
});

test('field: a gate spawn emits a straddling pair with a clear central lane', () => {
  const asteroids = [];
  const stars = [];
  const field = makeField({ rng: mulberry32(5), asteroids, stars });
  field.reset();
  field.step(1.0, { ...flatSector, pattern: 'gate', spawnRate: 1, reach: 1.3, sizeRange: [20, 20] }, { x: 0, y: 0, loop: 0, box: boxStub });
  assert.equal(asteroids.length, 2, 'gate should spawn two rocks per tick');
  const [a, b] = [...asteroids].sort((p, q) => p.x - q.x);
  const laneWidth = (b.x - b.r) - (a.x + a.r);
  assert.ok(laneWidth > 0, `no lane between the walls: ${laneWidth.toFixed(1)}`);
  const gapCentre = (a.x + b.x) / 2;
  assert.ok(Math.abs(gapCentre) <= (boxStub.x1 - boxStub.x0) / 2, 'gap centre fell outside the box');
});

test('field: both walls of a gate pair are routed through placeSpawn at high loop', () => {
  // Proves the Array.isArray(...) fan-out in step() actually sends BOTH rocks of
  // a gate pair through fairness — the existing gate test only runs at loop 0,
  // where every fairness branch is inert.
  //
  // Seed locked to 1: with mulberry32(1) the gate() call places its left wall at
  // x≈-40.05, y≈52.26 (right wall x≈76.76). Parking the stub ship at (-30, 40)
  // puts that left wall ~15.9 units away — inside clearR (40) — while leaving the
  // right wall well outside. At loop 5 branch 1 (near-ship suppression) is active,
  // so the left wall must be shoved out to exactly clearR and the right wall left
  // alone. If you change the seed, re-derive the ship position so a wall still
  // lands in the bubble; do NOT relax the assertions.
  const SEED = 1;
  const ship = { x: -30, y: 40, loop: 5, box: boxStub };
  const gate = { ...flatSector, pattern: 'gate', spawnRate: 1, reach: 1.3, sizeRange: [20, 20] };
  const clearR = Math.min(70, (boxStub.x1 - boxStub.x0) / 2 * 0.5);

  // raw walls: same seed, loop 0 + far ship ⇒ candidate() output untouched.
  const rawAst = [];
  {
    const f = makeField({ rng: mulberry32(SEED), asteroids: rawAst, stars: [] });
    f.reset();
    f.step(1.0, gate, farShip);
  }
  const rawX = rawAst.map((a) => a.x).sort((p, q) => p - q);
  assert.ok(
    rawAst.some((a) => Math.hypot(a.x - ship.x, a.y - ship.y) < clearR),
    'seed 1 no longer parks a wall inside the bubble — re-derive the ship position',
  );

  const asteroids = [];
  const field = makeField({ rng: mulberry32(SEED), asteroids, stars: [] });
  field.reset();
  field.step(1.0, gate, ship);

  assert.ok(asteroids.length === 1 || asteroids.length === 2, `gate placed ${asteroids.length} rocks`);
  for (const a of asteroids) {
    assert.ok(
      Math.hypot(a.x - ship.x, a.y - ship.y) >= clearR - 1e-9,
      `a gate wall landed ${Math.hypot(a.x - ship.x, a.y - ship.y).toFixed(1)} from the ship`,
    );
  }
  // routing proof: at least one surviving wall was actually moved off its spawn x.
  assert.ok(
    asteroids.some((a) => !rawX.some((x) => Math.abs(x - a.x) < 1e-9)),
    'no gate wall was nudged — the pair was not routed through placeSpawn',
  );
});

test('field: step integrates a rock\'s vx into its x each frame', () => {
  const asteroids = [];
  const stars = [];
  const field = makeField({ rng: mulberry32(1), asteroids, stars });
  field.reset();
  asteroids.push({ id: 99, x: 100, y: 0, z: 500, r: 10, vx: -40, vy: 0 });
  field.step(0.5, { ...flatSector, spawnRate: 0 }, farShip);
  assert.ok(Math.abs(asteroids[0].x - 80) < 1e-9, `x ${asteroids[0].x} — expected 100 + (-40 * 0.5)`);
  assert.ok(Math.abs(asteroids[0].z - 350) < 1e-9, `z ${asteroids[0].z} — expected 500 - (300 * 0.5)`);
});

test('field: a scatter candidate lands within the box reach in x and y', () => {
  const asteroids = [];
  const stars = [];
  const field = makeField({ rng: mulberry32(8), asteroids, stars });
  field.reset();
  field.step(1.0, { ...flatSector, spawnRate: 1, reach: 1.4 }, { x: 0, y: 0, loop: 0, box: boxStub });
  assert.equal(asteroids.length, 1);
  const a = asteroids[0];
  const bhw = (boxStub.x1 - boxStub.x0) / 2;
  const cy = (boxStub.y0 + boxStub.y1) / 2;
  assert.ok(Math.abs(a.x) <= bhw * 1.4 + 1e-9, `x ${a.x} outside reach`);
  assert.ok(Math.abs(a.y - cy) <= (boxStub.y1 - boxStub.y0) / 2 * 1.4 + 1e-9, `y ${a.y} outside reach`);
});

test('field: a scatter candidate carries the sector hazard kind', () => {
  const asteroids = [];
  const field = makeField({ rng: mulberry32(8), asteroids, stars: [] });
  field.reset();
  field.step(1.0, { ...flatSector, spawnRate: 1, kind: 'mines' }, { x: 0, y: 0, loop: 0, box: boxStub });
  assert.equal(asteroids.length, 1);
  assert.equal(asteroids[0].kind, 'mines');
});

test('field: a stream candidate carries the sector hazard kind', () => {
  const asteroids = [];
  const field = makeField({ rng: mulberry32(11), asteroids, stars: [] });
  field.reset();
  field.step(1.0, { ...flatSector, pattern: 'stream', spawnRate: 1, kind: 'wreckage' }, { x: 0, y: 0, loop: 0, box: boxStub });
  assert.equal(asteroids.length, 1);
  assert.equal(asteroids[0].kind, 'wreckage');
});

test('field: both walls of a gate pair carry the sector hazard kind', () => {
  const asteroids = [];
  const field = makeField({ rng: mulberry32(5), asteroids, stars: [] });
  field.reset();
  field.step(1.0, { ...flatSector, pattern: 'gate', spawnRate: 1, kind: 'wreckage', sizeRange: [20, 20] }, { x: 0, y: 0, loop: 0, box: boxStub });
  assert.equal(asteroids.length, 2);
  assert.ok(asteroids.every((a) => a.kind === 'wreckage'), 'a gate wall is missing its kind');
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
  const b = ship.box();
  assert.ok(Math.abs(s.x - b.x1) < 1, `x ${s.x} not at box edge ${b.x1}`);
});

test('ship: box() reports the same limits movement clamps to', () => {
  const ship = mkShip();
  const b = ship.box(); // before any update() ⇒ camera roll is still 0
  assert.ok(b.x0 < 0 && b.x1 > 0 && b.x0 === -b.x1, 'box x should be symmetric about 0');
  assert.ok(b.y1 > b.y0, 'box y1 (screen-bottom edge) is greater in world y than box y0 (screen-top edge)');
  assert.ok(
    Math.abs(b.x1 - makeCamera(vp).unproject(vp.width - 30, vp.height * 0.40, 60).x) < 1e-9,
    'box x1 should match an independent camera unproject',
  );
  // ease the ship hard into the bottom-right corner; it should settle on the box bounds
  ship.aim(99999, 99999, 'mouse');
  let s;
  for (let i = 0; i < 400; i++) s = ship.update(1 / 60);
  assert.ok(Math.abs(s.x - b.x1) < 1, `x settled at ${s.x}, box x1 ${b.x1}`);
  assert.ok(Math.abs(s.y - b.y1) < 1, `y settled at ${s.y}, box y1 ${b.y1}`);
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

test('ship: update(0) is a side-effect-free snapshot (does not reset camera roll)', () => {
  const camera = makeCamera(vp);
  const ship = makeShip({ camera, viewport: vp });
  ship.aim(1100, 200, 'mouse');
  for (let i = 0; i < 30; i++) ship.update(1 / 60);
  // capture roll via its effect on a projected point
  const movedX = camera.project(100, 0, 100).sx;
  ship.update(0);
  assert.equal(camera.project(100, 0, 100).sx, movedX, 'update(0) changed the camera roll');
});

test('ship: MAX_SPEED matches the fairness reach constant', () => {
  assert.equal(MAX_SPEED, 520);
});

function fakeClock() {
  let t = 0;
  let cb = null;
  let hiddenFlag = false;
  return {
    now: () => t,
    raf: (fn) => { cb = fn; return 1; },
    caf: () => { cb = null; },
    hidden: () => hiddenFlag,
    setHidden(v) { hiddenFlag = v; },
    tick(ms) { t += ms; const fn = cb; cb = null; if (fn) fn(); },
  };
}

test('loop: dt is clamped to 50ms', () => {
  const clk = fakeClock();
  const seen = [];
  const loop = makeLoop(clk);
  loop.start((dt) => seen.push(dt));
  clk.tick(16);   // normal frame
  clk.tick(500);  // huge stall
  assert.ok(Math.abs(seen[0] - 0.016) < 1e-9);
  assert.equal(seen[1], 0.05);
});

test('loop: hidden frames are skipped and reset the baseline', () => {
  const clk = fakeClock();
  const seen = [];
  const loop = makeLoop(clk);
  loop.start((dt) => seen.push(dt));
  clk.tick(16);
  clk.setHidden(true);
  clk.tick(10000); // long time in the background
  clk.setHidden(false);
  clk.tick(16);    // first visible frame back
  assert.equal(seen.length, 2);
  assert.ok(Math.abs(seen[1] - 0.016) < 1e-9, `baseline not reset: got ${seen[1]}`);
});

test('loop: stop() halts the callback', () => {
  const clk = fakeClock();
  let count = 0;
  const loop = makeLoop(clk);
  loop.start(() => { count++; });
  clk.tick(16);
  loop.stop();
  clk.tick(16);
  assert.equal(count, 1);
});
