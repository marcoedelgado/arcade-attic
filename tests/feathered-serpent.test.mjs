// Feathered Serpent — pure-module tests (spec §7).
//
// These are written against the interfaces BEFORE the implementations exist, so
// they all fail right now. That is the point: the skeleton commits to the shape
// of each module, and the art pass happens against a fixed set of promises.
//
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACTS, ACT_METRES, SUMMIT, actAt, paletteAt, floorAt, arrived }
  from '../games/feathered-serpent/journey.js';
import { STAGES, FEATHER_GAIN, COLLIDE_COST, AT_BARE, AT_BLAZING, makePlume, geometryAt, stageAt }
  from '../games/feathered-serpent/plume.js';
import { makeBody, SEGMENT_SPACING, MAX_SEGMENTS }
  from '../games/feathered-serpent/body.js';
import { makeField, FEATHERS_PER_METRE }
  from '../games/feathered-serpent/field.js';
import { check, EAT_FORGIVENESS, COLLIDE_FORGIVENESS }
  from '../games/feathered-serpent/collect.js';

/* ---------------- journey ---------------- */

test('journey: act boundaries are exact', () => {
  assert.equal(actAt(0).index, 0);
  assert.equal(actAt(ACT_METRES - 0.001).index, 0);
  assert.equal(actAt(ACT_METRES).index, 1);
  assert.equal(actAt(ACT_METRES * 3).index, 3);
});

test('journey: progress runs 0 to 1 within an act', () => {
  assert.equal(actAt(ACT_METRES * 2).progress, 0);
  assert.ok(Math.abs(actAt(ACT_METRES * 2.5).progress - 0.5) < 1e-9);
});

test('journey: past the summit it clamps to the last act, it does not wrap', () => {
  assert.equal(actAt(SUMMIT).index, ACTS.length - 1);
  assert.equal(actAt(SUMMIT * 2).index, ACTS.length - 1);
});

test('journey: palette is continuous across an act boundary', () => {
  const before = paletteAt(ACT_METRES - 0.001);
  const at = paletteAt(ACT_METRES);
  before.forEach((n, i) => assert.ok(Math.abs(n - at[i]) < 0.01,
    `channel ${i} jumped: ${n} -> ${at[i]}`));
});

test('journey: the last act holds its colour rather than blending into nothing', () => {
  const last = ACTS[ACTS.length - 1].colour;
  paletteAt(SUMMIT).forEach((n, i) => assert.ok(Math.abs(n - last[i]) < 1e-9));
});

test('journey: the plume floor rises through the journey and never falls', () => {
  const floors = ACTS.map((_, i) => floorAt(i * ACT_METRES));
  for (let i = 1; i < floors.length; i++) {
    assert.ok(floors[i] >= floors[i - 1], `floor fell at act ${i}`);
  }
  assert.equal(floorAt(0), 0);
});

test('journey: the run terminates', () => {
  assert.equal(arrived(SUMMIT - 1), false);
  assert.equal(arrived(SUMMIT), true);
});

test('journey: act 1 has nothing that can cost you feathers', () => {
  assert.ok(!ACTS[0].cast.some((c) => c.kind === 'obstacle'),
    'act 1 must teach steering in total safety');
});

test('journey: every act has something to eat', () => {
  ACTS.forEach((act) => {
    assert.ok(act.cast.some((c) => c.kind === 'feather'), `${act.id} has no feathers`);
  });
});

test('journey: cast ids are unique across the whole game (they are sprite keys)', () => {
  const ids = ACTS.flatMap((a) => a.cast.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length);
});

/* ---------------- plume ---------------- */

test('plume: stays inside [0, 1] however hard it is pushed', () => {
  const p = makePlume(0.5);
  for (let i = 0; i < 500; i++) p.eat();
  assert.equal(p.value(), 1);
  for (let i = 0; i < 500; i++) p.collide(0);
  assert.equal(p.value(), 0);
});

test('plume: a collision costs more than one feather but less than four', () => {
  assert.ok(COLLIDE_COST > FEATHER_GAIN, 'a setback must sting');
  assert.ok(COLLIDE_COST < FEATHER_GAIN * 4, 'a setback must never feel ruinous');
});

test('plume: a collision never takes you below the act floor', () => {
  const p = makePlume(0.4);
  for (let i = 0; i < 50; i++) p.collide(0.3);
  assert.equal(p.value(), 0.3);
});

test('plume: the floor never RAISES plume — it only stops a fall', () => {
  const p = makePlume(0.1);
  p.collide(0.3);
  assert.equal(p.value(), 0.1, 'arriving under the floor must not be a free gift');
});

test('plume: every derived value is monotonic in plume', () => {
  const keys = Object.keys(AT_BARE);
  let prev = geometryAt(0);
  for (let v = 0.05; v <= 1.0001; v += 0.05) {
    const now = geometryAt(v);
    keys.forEach((k) => assert.ok(now[k] >= prev[k], `${k} fell at plume ${v.toFixed(2)}`));
    prev = now;
  }
});

test('plume: the endpoints are exactly the declared geometry', () => {
  assert.deepEqual(geometryAt(0), AT_BARE);
  assert.deepEqual(geometryAt(1), AT_BLAZING);
});

test('plume: stage boundaries are exact', () => {
  assert.equal(stageAt(0).id, 'bare');
  assert.equal(stageAt(0.4999).id, 'downy');
  assert.equal(stageAt(0.5).id, 'plumed');
  assert.equal(stageAt(1).id, 'blazing');
});

test('plume: every stage has art to draw and a place on the scale', () => {
  STAGES.forEach((s, i) => {
    assert.ok(s.id && s.name, `stage ${i} is unnamed`);
    if (i > 0) assert.ok(s.at > STAGES[i - 1].at, `stage ${s.id} is out of order`);
  });
  assert.equal(STAGES[0].at, 0);
  assert.equal(STAGES[STAGES.length - 1].at, 1);
});

/* ---------------- body ---------------- */

test('body: segments are spaced by arc length, not by frame count', () => {
  // Same path, walked at two very different speeds. The body must look the same.
  const slow = makeBody();
  const fast = makeBody();
  slow.reset(0, 0, 0);
  fast.reset(0, 0, 0);
  for (let i = 1; i <= 400; i++) slow.push(i * 1, 0, 0);
  for (let i = 1; i <= 40; i++) fast.push(i * 10, 0, 0);

  const a = slow.sample(8);
  const b = fast.sample(8);
  assert.equal(a.length, b.length);
  a.forEach((seg, i) => assert.ok(Math.abs(seg.x - b[i].x) < SEGMENT_SPACING,
    `segment ${i} concertina'd: ${seg.x} vs ${b[i].x}`));
});

test('body: spacing between consecutive segments is SEGMENT_SPACING', () => {
  const body = makeBody();
  body.reset(0, 0, 0);
  for (let i = 1; i <= 500; i++) body.push(i, 0, 0);
  const segs = body.sample(6);
  for (let i = 1; i < segs.length; i++) {
    const d = Math.abs(segs[i].x - segs[i - 1].x);
    assert.ok(Math.abs(d - SEGMENT_SPACING) < 0.5, `gap ${i} was ${d}`);
  }
});

test('body: never reads past the history it actually has', () => {
  const body = makeBody();
  body.reset(0, 0, 0);
  body.push(1, 0, 0);
  const segs = body.sample(40);
  assert.ok(segs.length < 40, 'a brand new serpent is genuinely short');
  segs.forEach((s) => assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)));
});

test('body: honours the segment cap whatever is asked of it', () => {
  const body = makeBody();
  body.reset(0, 0, 0);
  for (let i = 1; i <= 5000; i++) body.push(i, 0, 0);
  assert.ok(body.sample(9999).length <= MAX_SEGMENTS);
});

test('body: reset collapses the whole serpent onto one point', () => {
  const body = makeBody();
  for (let i = 1; i <= 300; i++) body.push(i, 0, 0);
  body.reset(7, 8, 9);
  const segs = body.sample(10);
  segs.forEach((s) => {
    assert.equal(s.x, 7);
    assert.equal(s.y, 8);
    assert.equal(s.z, 9);
  });
});

/* ---------------- field ---------------- */

const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const box = { left: -100, right: 100, top: -60, bottom: 60 };

test('field: deterministic under an injected rng', () => {
  const run = () => {
    const f = makeField({ rng: seeded(42) });
    for (let i = 0; i < 60; i++) f.step(1 / 60, i * 5, ACTS[0], box);
    return f.items();
  };
  assert.deepEqual(run(), run());
});

test('field: density is per metre, not per frame', () => {
  // Climb the same 200 m in 10 steps and in 200. Same sky either way.
  const coarse = makeField({ rng: seeded(7) });
  const fine = makeField({ rng: seeded(7) });
  for (let i = 1; i <= 10; i++) coarse.step(0.1, i * 20, ACTS[0], box);
  for (let i = 1; i <= 200; i++) fine.step(0.005, i * 1, ACTS[0], box);

  const count = (f) => f.items().filter((it) => it.kind === 'feather').length;
  assert.ok(Math.abs(count(coarse) - count(fine)) <= 1,
    `per-frame spawning detected: ${count(coarse)} vs ${count(fine)}`);
});

test('field: spawn positions are box-relative, so a phone and a desktop match', () => {
  const small = makeField({ rng: seeded(3) });
  const large = makeField({ rng: seeded(3) });
  const big = { left: -400, right: 400, top: -240, bottom: 240 };
  for (let i = 1; i <= 50; i++) {
    small.step(1 / 60, i * 5, ACTS[1], box);
    large.step(1 / 60, i * 5, ACTS[1], big);
  }
  const rel = (it, b) => (it.x - b.left) / (b.right - b.left);
  const a = small.items().map((it) => rel(it, box));
  const c = large.items().map((it) => rel(it, big));
  assert.equal(a.length, c.length);
  a.forEach((n, i) => assert.ok(Math.abs(n - c[i]) < 1e-9));
});

test('field: a richer act really does spawn more feathers', () => {
  const count = (act) => {
    const f = makeField({ rng: seeded(11) });
    for (let i = 1; i <= 200; i++) f.step(1 / 60, i * 5, act, box);
    return f.items().filter((it) => it.kind === 'feather').length;
  };
  const ash = ACTS.find((a) => a.id === 'ash');
  const dawn = ACTS.find((a) => a.id === 'dawn');
  assert.ok(count(ash) > count(dawn), 'ash is the richest act, dawn the sparsest');
});

test('field: FEATHERS_PER_METRE is a sane density', () => {
  assert.ok(FEATHERS_PER_METRE > 0 && FEATHERS_PER_METRE < 1);
});

/* ---------------- collect ---------------- */

test('collect: eating is generous and colliding is forgiving', () => {
  assert.ok(EAT_FORGIVENESS > 1, 'a feather a child flew at must count');
  assert.ok(COLLIDE_FORGIVENESS < 1, 'grazing a pyramid must not count');
});

test('collect: a feather just outside its drawn radius is still eaten', () => {
  const head = { x: 0, y: 0, z: 0 };
  const feather = { kind: 'feather', x: 0, y: 12, z: 0, radius: 10 };
  const out = check({ head, items: [feather], girth: 1 });
  assert.equal(out.eaten.length, 1);
});

test('collect: grazing the edge of an obstacle does not cost you', () => {
  const head = { x: 0, y: 0, z: 0 };
  const pyramid = { kind: 'obstacle', x: 0, y: 9, z: 0, radius: 10 };
  const out = check({ head, items: [pyramid], girth: 1 });
  assert.equal(out.struck, null);
});

test('collect: flying squarely into an obstacle does cost you', () => {
  const head = { x: 0, y: 0, z: 0 };
  const pyramid = { kind: 'obstacle', x: 0, y: 2, z: 0, radius: 10 };
  const out = check({ head, items: [pyramid], girth: 1 });
  assert.ok(out.struck);
});

test('collect: both radii scale with girth — a fat serpent has a bigger mouth and a bigger body', () => {
  const head = { x: 0, y: 0, z: 0 };
  const far = { kind: 'feather', x: 0, y: 20, z: 0, radius: 10 };
  assert.equal(check({ head, items: [far], girth: 0.55 }).eaten.length, 0);
  assert.equal(check({ head, items: [far], girth: 1.0 }).eaten.length, 1);
});

test('collect: ambient scenery can never be eaten or hit', () => {
  const head = { x: 0, y: 0, z: 0 };
  const macaw = { kind: 'ambient', x: 0, y: 0, z: 0, radius: 10 };
  const out = check({ head, items: [macaw], girth: 1 });
  assert.equal(out.eaten.length, 0);
  assert.equal(out.struck, null);
});
