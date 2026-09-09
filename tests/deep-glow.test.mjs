import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZONES, ZONE_METRES, zoneAt, paletteAt, escalationAt, castAt } from '../games/deep-glow/depth.js';

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
