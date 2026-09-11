import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZONES, ZONE_METRES, zoneAt, paletteAt, escalationAt, castAt, WATER_KEYS, waterAt } from '../games/deep-glow/depth.js';
import { makeDiver } from '../games/deep-glow/diver.js';
import { makeField } from '../games/deep-glow/field.js';
import { makeLamp } from '../games/deep-glow/lamp.js';
import { takePlankton, bumped, sighted } from '../games/deep-glow/collect.js';
import { makeSightings } from '../games/deep-glow/sightings.js';
import { litAt, ambientFor, LAMP_ON_SPRITE, LAMP_REACH, BUMPER_FLOOR } from '../games/deep-glow/light.js';
import { CREATURES, DIVER_OPS, F, MASK_ZERO, opsAt, extent, frameId } from '../games/deep-glow/creatures.js';
import { brownoutAt, BROWNOUT_SECONDS, BEATS } from '../games/deep-glow/brownout.js';

test('depth: zone boundaries are exact', () => {
  assert.equal(zoneAt(0).index, 0);
  assert.equal(zoneAt(ZONE_METRES - 0.001).index, 0);
  assert.equal(zoneAt(ZONE_METRES).index, 1);
  assert.equal(zoneAt(ZONE_METRES * 4).index, 4);
});

test('depth: progress runs 0 to 1 within a zone', () => {
  assert.equal(zoneAt(ZONE_METRES * 2).progress, 0);
  assert.ok(Math.abs(zoneAt(ZONE_METRES * 2.5).progress - 0.5) < 1e-9);
});

test('depth: past the last zone it loops back to zone 2, never to 0 or 1', () => {
  const last = ZONES.length * ZONE_METRES;           // 1000
  assert.equal(zoneAt(last).index, 2);
  assert.equal(zoneAt(last + ZONE_METRES).index, 3);
  assert.equal(zoneAt(last + ZONE_METRES * 2).index, 4);
  assert.equal(zoneAt(last + ZONE_METRES * 3).index, 2);   // lap
  for (let m = last; m < last + 5000; m += 37) {
    assert.ok(zoneAt(m).index >= 2, `zone ${zoneAt(m).index} at ${m}m dropped below the loop floor`);
  }
});

test('depth: palette is continuous across a zone boundary', () => {
  const before = paletteAt(ZONE_METRES - 0.01);
  const after = paletteAt(ZONE_METRES + 0.01);
  const mixed = (p) => p.a.map((c, i) => c + (p.b[i] - c) * p.mix);
  const x = mixed(before), y = mixed(after);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(x[i] - y[i]) < 0.02, `channel ${i} jumped ${x[i]} -> ${y[i]} at the boundary`);
  }
});

test('depth: escalation is monotonic, starts at 1, and is capped', () => {
  assert.equal(escalationAt(0), 1);
  let prev = 0;
  for (let m = 0; m < 40000; m += 250) {
    const e = escalationAt(m);
    assert.ok(e >= prev, `escalation fell at ${m}m`);
    assert.ok(e <= 2.5, `escalation ${e} exceeded the cap at ${m}m`);
    prev = e;
  }
});

test('depth: palette is continuous at all boundaries including loop seams', () => {
  const boundaries = [200, 400, 600, 800, 1000, 1200, 1600, 2200];
  const mixed = (p) => p.a.map((c, i) => c + (p.b[i] - c) * p.mix);

  for (const B of boundaries) {
    const before = paletteAt(B - 0.01);
    const after = paletteAt(B + 0.01);
    const x = mixed(before);
    const y = mixed(after);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(x[i] - y[i]) < 0.02,
        `at ${B}m channel ${i} jumped ${x[i].toFixed(4)} -> ${y[i].toFixed(4)}`);
    }
  }
});

test('depth: cast invariants — unique ids, one rare per zone, valid kinds', () => {
  const allIds = new Set();
  const rarePerZone = new Map();

  for (let z = 0; z < ZONES.length; z++) {
    const zone = ZONES[z];
    let rareCount = 0;

    for (const creature of zone.cast) {
      // Unique ids across all zones
      assert.ok(!allIds.has(creature.id), `duplicate creature id: ${creature.id}`);
      allIds.add(creature.id);

      // Valid kind
      assert.ok(['drifter', 'shy', 'bumper'].includes(creature.kind),
        `invalid kind "${creature.kind}" in ${zone.name}`);

      // Track rare count
      if (creature.rare) {
        rareCount++;
      }
    }

    // Exactly one rare per zone
    assert.equal(rareCount, 1,
      `zone ${z} (${zone.name}) has ${rareCount} rare creatures, expected 1`);

    // Rare creatures must be drifters (reward, not penalty)
    const rare = zone.cast.find(c => c.rare);
    assert.equal(rare.kind, 'drifter',
      `rare creature "${rare.id}" in ${zone.name} is "${rare.kind}", expected "drifter"`);
  }
});

test('depth: castAt returns the roster for the zone', () => {
  for (let m = 0; m < 3000; m += 100) {
    const { index } = zoneAt(m);
    const cast = castAt(m);
    assert.deepEqual(cast, ZONES[index].cast,
      `castAt(${m}m) does not match zoneAt(${m}m).index`);
  }
});

const SHADER_KEYS = ['floor', 'ceiling', 'shafts', 'caustics', 'curtains', 'snowFar', 'snowMid',
  'snowNear', 'glimmers', 'ember', 'shimmer', 'lift', 'emit'];
const VISIBLE_LAYERS = ['ceiling', 'shafts', 'caustics', 'curtains', 'snowFar', 'snowMid',
  'snowNear', 'glimmers', 'ember', 'shimmer'];

test('depth: WATER_KEYS is the 13 shader layers, and every zone defines them plus calm', () => {
  assert.deepEqual(WATER_KEYS, SHADER_KEYS);
  for (const z of ZONES) {
    for (const k of [...WATER_KEYS, 'calm']) {
      assert.equal(typeof z.water[k], 'number', `${z.name} is missing water.${k}`);
    }
  }
});

test('depth: waterAt holds each zone\'s own recipe before the handover starts', () => {
  for (let i = 0; i < ZONES.length; i++) {
    const w = waterAt(i * ZONE_METRES + ZONE_METRES * 0.35);
    for (const k of Object.keys(ZONES[i].water)) {
      assert.ok(Math.abs(w[k] - ZONES[i].water[k]) < 1e-9, `${ZONES[i].name} ${k}: ${w[k]}`);
    }
  }
});

test('depth: waterAt is continuous at every boundary including the loop seams', () => {
  for (const B of [200, 400, 600, 800, 1000, 1200, 1400, 1600, 2200]) {
    const a = waterAt(B - 0.01), b = waterAt(B + 0.01);
    for (const k of Object.keys(a)) {
      assert.ok(Math.abs(a[k] - b[k]) < 0.02, `at ${B}m ${k} jumped ${a[k]} -> ${b[k]}`);
    }
  }
});

test('depth: at least four visible water layers are alive at every depth', () => {
  // The art direction's core rule. The old shader let every layer decay toward
  // zero, so the deep converged on gradient + dots + blob.
  for (let m = 0; m <= 3000; m += 5) {
    const w = waterAt(m);
    const alive = VISIBLE_LAYERS.filter((k) => w[k] >= 0.1);
    assert.ok(alive.length >= 4, `only ${alive.length} layers alive at ${m}m: ${alive}`);
  }
});

test('depth: waterAt fills a caller-supplied object instead of allocating', () => {
  const out = {};
  assert.equal(waterAt(500, out), out);
});

const vp = { width: 480, height: 800 };

test('diver: eased follow converges on the aim target', () => {
  const d = makeDiver({ viewport: vp });
  d.aim(360, 400);
  for (let i = 0; i < 200; i++) d.update(1 / 60, { sinkScale: 0 });
  const b = d.box();
  assert.ok(d.pos().x > 0, 'aiming right of centre should move the diver right');
  assert.ok(d.pos().x <= b.x1 + 1e-6, 'settled outside the box');
});

test('diver: the box clamps in all four directions', () => {
  const d = makeDiver({ viewport: vp });
  for (const [sx, sy] of [[-99999, -99999], [99999, 99999]]) {
    d.aim(sx, sy);
    for (let i = 0; i < 200; i++) d.update(1 / 60, { sinkScale: 0 });
    const b = d.box(), p = d.pos();
    assert.ok(p.x >= b.x0 - 1e-6 && p.x <= b.x1 + 1e-6, `x ${p.x} escaped [${b.x0}, ${b.x1}]`);
  }
});

test('diver: sinks regardless of steering, and steering up never reverses it', () => {
  const d = makeDiver({ viewport: vp });
  d.aim(240, 0);                       // hard up
  let prev = d.pos().y;
  for (let i = 0; i < 300; i++) {
    d.update(1 / 60, { sinkScale: 1 });
    const y = d.pos().y;
    assert.ok(y >= prev - 1e-9, `depth went backwards: ${prev} -> ${y}`);
    prev = y;
  }
  assert.ok(prev > 0, 'diver never actually descended');
});

test('diver: update(0) is a side-effect-free snapshot', () => {
  const d = makeDiver({ viewport: vp });
  d.aim(300, 300);
  d.update(1 / 60, { sinkScale: 1 });
  const before = d.pos();
  d.update(0, { sinkScale: 1 });
  assert.deepEqual(d.pos(), before);
});

function seeded(seed) {                       // deterministic LCG for tests
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const ctx = (box) => ({ box, viewMetres: 60, cast: [], escalation: 1 });
const BOX = { x0: -200, x1: 200 };

test('field: deterministic under an injected rng', () => {
  const a = makeField({ rng: seeded(7) }), b = makeField({ rng: seeded(7) });
  for (let i = 0; i < 100; i++) { a.step(2, ctx(BOX)); b.step(2, ctx(BOX)); }
  assert.deepEqual(a.plankton, b.plankton);
});

test('field: density is per-metre, not per-step', () => {
  const coarse = makeField({ rng: seeded(3) });
  const fine = makeField({ rng: seeded(3) });
  for (let i = 0; i < 10; i++) coarse.step(20, ctx(BOX));    // 200 m in 10 steps
  for (let i = 0; i < 200; i++) fine.step(1, ctx(BOX));      // 200 m in 200 steps
  const ratio = fine.plankton.length / Math.max(1, coarse.plankton.length);
  assert.ok(ratio > 0.75 && ratio < 1.33,
    `same 200 m gave ${coarse.plankton.length} vs ${fine.plankton.length}`);
});

test('field: spawns are box-relative, so a narrow phone is not a harder game', () => {
  const wide = makeField({ rng: seeded(11) });
  const narrow = makeField({ rng: seeded(11) });
  const NARROW = { x0: -100, x1: 100 };
  for (let i = 0; i < 60; i++) { wide.step(3, ctx(BOX)); narrow.step(3, ctx(NARROW)); }
  assert.equal(wide.plankton.length, narrow.plankton.length,
    'the same descent must offer the same number of pickups at any width');
  for (let i = 0; i < narrow.plankton.length; i++) {
    const fw = (wide.plankton[i].x - BOX.x0) / (BOX.x1 - BOX.x0);
    const fn = (narrow.plankton[i].x - NARROW.x0) / (NARROW.x1 - NARROW.x0);
    assert.ok(Math.abs(fw - fn) < 1e-9, `relative spawn position differed at index ${i}`);
  }
});

test('field: culls what has gone past, so the arrays stay bounded', () => {
  const f = makeField({ rng: seeded(5) });
  for (let i = 0; i < 2000; i++) f.step(3, ctx(BOX));
  assert.ok(f.plankton.length < 200, `leaked ${f.plankton.length} plankton`);
});

test('field: reset empties everything', () => {
  const f = makeField({ rng: seeded(9) });
  for (let i = 0; i < 50; i++) f.step(3, ctx(BOX));
  f.reset();
  assert.equal(f.plankton.length, 0);
  assert.equal(f.creatures.length, 0);
});

test('field: resync repoints future spawns to the resynced depth, not the pre-resync one', () => {
  // Pins the brownout-desync bug: game.js clamps `descended` to 0 while the
  // diver's real depth RISES during a brownout, so field.step() alone never
  // learns the diver moved. Without an explicit resync(), the field's own
  // depthM stays stranded at its pre-brownout value forever, and every
  // subsequent spawn is placed that far too deep.
  const f = makeField({ rng: seeded(13) });
  f.step(300, ctx(BOX));   // descend 300 m — the field's own depthM tracks this
  f.resync(20);            // simulate the brownout rescue: diver's real depth is now only 20 m
  f.step(50, ctx(BOX));    // enough metres (spawn gap is 14 m) to guarantee a fresh spawn
  const spawned = f.plankton[f.plankton.length - 1];
  const expectedY = 20 + 50 + 60;   // resynced depth + this step's descent + viewMetres (ctx's 60)
  assert.equal(spawned.y, expectedY,
    `spawned at y=${spawned.y}, expected ${expectedY} — resync() did not repoint the field's depth`);
});

test('lamp: drains monotonically without pickups', () => {
  const l = makeLamp();
  let prev = Infinity;
  for (let i = 0; i < 100; i++) {
    const s = l.update(0.1, { escalation: 1 });
    assert.ok(s.fuel <= prev + 1e-9, 'fuel went up without a pickup');
    prev = s.fuel;
  }
});

test('lamp: refuel caps at full', () => {
  const l = makeLamp();
  for (let i = 0; i < 50; i++) l.refuel(0.5);
  assert.ok(l.fuel <= 1 + 1e-9, `fuel overflowed to ${l.fuel}`);
});

test('lamp: a bump cannot take fuel below zero', () => {
  const l = makeLamp();
  for (let i = 0; i < 20; i++) l.bump();
  assert.ok(l.fuel >= 0, `fuel went negative: ${l.fuel}`);
});

test('lamp: brownout fires exactly once, and relight restores half', () => {
  const l = makeLamp();
  let fired = 0;
  for (let i = 0; i < 600; i++) if (l.update(0.1, { escalation: 1 }).brownout) fired++;
  assert.equal(fired, 1, `brownout fired ${fired} times`);
  l.relight();
  assert.ok(Math.abs(l.fuel - 0.5) < 1e-9, `relit at ${l.fuel}, wanted 0.5`);
});

test('lamp: radius never drops below the floor while lit', () => {
  const l = makeLamp();
  for (let i = 0; i < 200; i++) {
    const s = l.update(0.05, { escalation: 1 });
    if (s.fuel > 0) assert.ok(s.radius >= 60, `radius ${s.radius} fell below the floor`);
  }
});

test('lamp: escalation drains faster', () => {
  const slow = makeLamp(), fast = makeLamp();
  for (let i = 0; i < 20; i++) { slow.update(0.1, { escalation: 1 }); fast.update(0.1, { escalation: 2 }); }
  assert.ok(fast.fuel < slow.fuel, 'escalation did not increase the drain');
});

test('lamp: fuel exhausted by bumps still browns out', () => {
  const l = makeLamp();
  for (let i = 0; i < 5; i++) l.bump();
  assert.equal(l.fuel, 0, 'bumps did not exhaust fuel to zero');
  const s = l.update(0.01, { escalation: 1 });
  assert.equal(s.brownout, true, 'brownout did not fire on update after fuel was zeroed by bumps');
  l.relight();
  assert.ok(Math.abs(l.fuel - 0.5) < 1e-9, `relit at ${l.fuel}, wanted 0.5`);
});

test('collect: takes only plankton inside the radius', () => {
  const p = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 3, y: 4 }];
  const hit = takePlankton({ x: 0, y: 0 }, p, 10);
  assert.deepEqual([...hit].sort((a, b) => a - b), [0, 2]);
});

test('collect: indices come back descending so splicing stays safe', () => {
  const p = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
  const hit = takePlankton({ x: 0, y: 0 }, p, 50);
  assert.deepEqual(hit, [2, 1, 0]);
  for (const i of hit) p.splice(i, 1);       // must not throw or skip
  assert.equal(p.length, 0);
});

test('collect: a rare creature counts as seen only within lamp radius', () => {
  const creatures = [{ id: 'lantern-jelly', rare: true, x: 0, y: 90 }];
  assert.deepEqual(sighted({ x: 0, y: 0 }, creatures, 50), []);
  assert.deepEqual(sighted({ x: 0, y: 0 }, creatures, 120), ['lantern-jelly']);
});

test('collect: non-rare creatures are never reported as sightings', () => {
  const creatures = [{ id: 'drifter', rare: false, x: 0, y: 0 }];
  assert.deepEqual(sighted({ x: 0, y: 0 }, creatures, 500), []);
});

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const throwingStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
};

test('sightings: round-trips through storage', () => {
  const s = fakeStorage();
  const a = makeSightings({ storage: s });
  a.mark('lantern-jelly');
  assert.ok(makeSightings({ storage: s }).has('lantern-jelly'), 'did not persist');
});

test('sightings: marking twice is idempotent', () => {
  const a = makeSightings({ storage: fakeStorage() });
  a.mark('x'); a.mark('x');
  assert.equal(a.all().length, 1);
});

test('sightings: a throwing storage never crashes the game', () => {
  assert.doesNotThrow(() => {
    const a = makeSightings({ storage: throwingStorage });
    a.mark('anything');
    assert.equal(a.has('anything'), true, 'should still work in memory for this session');
  });
});

const LAMP = { x: 100, y: 100, radius: 200 };

test('light: at the lamp a sprite gets ambient plus the full lamp, scaled by emit', () => {
  assert.ok(Math.abs(litAt(100, 100, LAMP, 0.2, 1) - (0.2 + LAMP_ON_SPRITE)) < 1e-9);
  assert.ok(Math.abs(litAt(100, 100, LAMP, 0.2, 0.3) - (0.2 + LAMP_ON_SPRITE * 0.3)) < 1e-9);
});

test('light: beyond the lamp\'s reach a sprite gets exactly the ambient', () => {
  assert.equal(litAt(100 + 200 * LAMP_REACH + 1, 100, LAMP, 0.35, 1), 0.35);
  assert.equal(litAt(100, -2000, LAMP, 0.2, 1), 0.2);
});

test('light: the beam is stronger below the fish than above it', () => {
  const below = litAt(100, 180, LAMP, 0.2, 1);
  const above = litAt(100, 20, LAMP, 0.2, 1);
  assert.ok(below > above, `below ${below} should beat above ${above} — you always sink`);
});

test('light: brightness never rises with distance along a ray', () => {
  let prev = Infinity;
  for (let d = 0; d <= 300; d += 5) {
    const v = litAt(100 + d, 100, LAMP, 0.2, 1);
    assert.ok(v <= prev + 1e-12, `rose at ${d}px`);
    prev = v;
  }
});

test('light: a zero-radius lamp lights nothing and never produces NaN', () => {
  assert.equal(litAt(100, 100, { x: 100, y: 100, radius: 0 }, 0.2, 1), 0.2);
});

test('light: bumpers never drop below the floor, and the floor never dims a bright zone', () => {
  assert.equal(ambientFor('bumper', 0.2), BUMPER_FLOOR);
  assert.equal(ambientFor('bumper', 1.0), 1.0);
  assert.equal(ambientFor('shy', 0.2), 0.2);
  assert.equal(ambientFor('drifter', 0.6), 0.6);
});

test('depth: every zone has an ambient light level in (0, 1]', () => {
  for (const z of ZONES) {
    assert.ok(z.water.ambient > 0 && z.water.ambient <= 1, `${z.name} ambient ${z.water.ambient}`);
  }
});

test('creatures: twenty, unique ids, four per zone with one of each role', () => {
  assert.equal(CREATURES.length, 20);
  assert.equal(new Set(CREATURES.map((c) => c.id)).size, 20);
  for (let z = 0; z < 5; z++) {
    const cast = CREATURES.filter((c) => c.zone === z);
    assert.equal(cast.length, 4, `zone ${z}`);
    assert.deepEqual(cast.map((c) => (c.rare ? 'rare' : c.kind)).sort(), ['bumper', 'drifter', 'rare', 'shy']);
  }
});

test('creatures: every shape in every frame stays inside the clear disc', () => {
  // The additive rule: a sprite whose light reaches its cell border draws a
  // bright square on screen. sprites.js masks to MASK_ZERO regardless — this
  // makes sure no art is silently CUT OFF by that mask.
  for (const { id, ops } of [...CREATURES, { id: 'diver', ops: DIVER_OPS }]) {
    for (let f = 0; f < F; f++) {
      for (const o of opsAt(ops, f)) {
        assert.ok(extent(o) < MASK_ZERO, `${id} frame ${f}: ${JSON.stringify(o)} reaches ${extent(o)}`);
        assert.ok(o.a >= 0 && o.a <= 1, `${id} frame ${f}: alpha ${o.a}`);
        for (const r of o.k === 'b' ? [o.r] : [o.rx, o.ry]) assert.ok(r > 0, `${id} frame ${f}: radius ${r}`);
      }
    }
  }
});

test('creatures: opsAt animates base + amp·sin(2π(f/F + ph)) and never mutates its input', () => {
  const ops = [{ k: 'b', x: 0, y: 10, r: 4, c: '#ffffff', a: 1, an: { p: 'y', amp: 3, ph: 0.25 } }];
  for (let f = 0; f < F; f++) {
    const want = 10 + 3 * Math.sin(2 * Math.PI * (f / F + 0.25));
    assert.ok(Math.abs(opsAt(ops, f)[0].y - want) < 1e-9, `frame ${f}`);
    assert.equal(opsAt(ops, f)[0].an, undefined);
  }
  assert.equal(ops[0].y, 10);
  assert.ok(ops[0].an, 'input op lost its animation');
});

test('creatures: animated alpha is clamped to [0, 1]', () => {
  const ops = [{ k: 'b', x: 0, y: 0, r: 4, c: '#ffffff', a: 0.9, an: { p: 'a', amp: 0.5 } }];
  const alphas = [0, 1, 2].map((f) => opsAt(ops, f)[0].a);
  assert.ok(alphas.every((a) => a >= 0 && a <= 1), String(alphas));
  assert.ok(alphas.includes(1), 'the overshoot should clamp to exactly 1');
});

test('creatures: frame ids are "<id>/<frame>"', () => {
  assert.equal(frameId('sunwheel', 2), 'sunwheel/2');
});

test('creatures: depth.js casts match the creature table exactly', () => {
  for (let z = 0; z < ZONES.length; z++) {
    const want = CREATURES.filter((c) => c.zone === z).map(({ id, kind, rare }) => ({ id, kind, rare }));
    assert.deepEqual(ZONES[z].cast, want, `zone ${z} (${ZONES[z].name})`);
  }
});

test('brownout: starts where the lamp left off, calm and unrisen', () => {
  const s = brownoutAt(0, 60);
  assert.equal(s.radius, 60);
  assert.equal(s.calm, 1);
  assert.equal(s.rise, 0);
});

test('brownout: continuous across every beat boundary', () => {
  for (const B of [BEATS.gutterEnd, BEATS.hushEnd, BEATS.liftEnd]) {
    const a = brownoutAt(B - 1e-7, 60), b = brownoutAt(B + 1e-7, 60);
    for (const k of ['radius', 'fuel', 'calm', 'rise']) {
      assert.ok(Math.abs(a[k] - b[k]) < 1e-3, `${k} jumped at ${B}s: ${a[k]} -> ${b[k]}`);
    }
  }
});

test('brownout: the rise only goes up, from 0 to 1', () => {
  let prev = 0;
  for (let t = 0; t <= BROWNOUT_SECONDS; t += 0.01) {
    const { rise } = brownoutAt(t, 60);
    assert.ok(rise >= prev - 1e-12 && rise <= 1, `rise ${rise} at ${t}s`);
    prev = rise;
  }
  assert.equal(brownoutAt(BROWNOUT_SECONDS, 60).rise, 1);
});

test('brownout: it goes dark and quiet in the middle — a coal, not a lamp', () => {
  const mid = brownoutAt((BEATS.hushEnd + BEATS.liftEnd) / 2, 60);
  assert.ok(mid.radius < 60, `radius ${mid.radius} should be below the lamp's own floor`);
  assert.equal(mid.fuel, 0);
  assert.ok(brownoutAt(BEATS.hushEnd, 60).calm <= 0.15, 'the hush should nearly stop the water');
});

test('brownout: the relight overshoots before settling', () => {
  let peak = 0;
  for (let t = BEATS.liftEnd; t <= BROWNOUT_SECONDS; t += 0.005) peak = Math.max(peak, brownoutAt(t, 60).radius);
  assert.ok(peak > brownoutAt(BROWNOUT_SECONDS, 60).radius + 2, `peak ${peak} never overshot`);
});

test('brownout: ends exactly where lamp.relight() puts the lamp', () => {
  // Pins the coupling to lamp.js: the timeline's last frame must hand over to
  // the real lamp with no visible jump in radius or fuel.
  const l = makeLamp();
  l.relight();
  const end = brownoutAt(BROWNOUT_SECONDS, 60);
  assert.ok(Math.abs(end.radius - l.radius) < 1e-6, `timeline ends at ${end.radius}, lamp relights at ${l.radius}`);
  assert.ok(Math.abs(end.fuel - l.fuel) < 1e-6);
  assert.equal(end.calm, 1);
  assert.deepEqual(brownoutAt(BROWNOUT_SECONDS + 5, 60), end);
});
