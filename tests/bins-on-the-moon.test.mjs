import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BINS, BIN_IDS, levelConfig, pickItems } from '../games/bins-on-the-moon/levels.js';

test('BINS has the four bins in fixed order', () => {
  assert.deepEqual(BIN_IDS, ['recycling', 'food', 'general', 'junk']);
  for (const b of BINS) {
    assert.equal(typeof b.color, 'string');
    assert.ok(b.icon.length > 0);
    assert.ok(b.label.length > 0);
  }
});

test('levelConfig: hand-tuned levels 1-5', () => {
  assert.deepEqual(levelConfig(1), { level: 1, bins: ['recycling', 'food'], count: 4, visible: 1 });
  assert.deepEqual(levelConfig(2), { level: 2, bins: ['recycling', 'food', 'general'], count: 6, visible: 3 });
  assert.equal(levelConfig(3).bins.length, 4);
  assert.equal(levelConfig(3).count, 8);
  assert.equal(levelConfig(4).visible, 3);
  assert.deepEqual(levelConfig(5), { level: 5, bins: BIN_IDS, count: 12, visible: 5 });
});

test('levelConfig: endless levels 6+ grow then cap at 20', () => {
  assert.equal(levelConfig(6).count, 14);
  assert.equal(levelConfig(9).count, 20);
  assert.equal(levelConfig(10).count, 20);
  assert.equal(levelConfig(100).count, 20);
  assert.equal(levelConfig(50).visible, 5);
  assert.deepEqual(levelConfig(7).bins, BIN_IDS);
});

test('levelConfig: clamps junk input to level 1', () => {
  assert.equal(levelConfig(0).level, 1);
  assert.equal(levelConfig(-3).level, 1);
  assert.equal(levelConfig(2.9).level, 2);
  assert.equal(levelConfig(undefined).level, 1);
});

test('levelConfig: count is always >= number of bins (so every bin can be covered)', () => {
  for (let n = 1; n <= 40; n++) {
    const c = levelConfig(n);
    assert.ok(c.count >= c.bins.length, `level ${n}: count ${c.count} < bins ${c.bins.length}`);
  }
});

test('levelConfig: returned bins array is a fresh copy (mutation-safe)', () => {
  const a = levelConfig(3);
  a.bins.push('junk');
  assert.equal(levelConfig(3).bins.length, 4);
});

// Small deterministic PRNG for tests (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL = [
  ...Array.from({ length: 6 }, (_, i) => ({ emoji: 'r', name: `r${i}`, bin: 'recycling' })),
  ...Array.from({ length: 6 }, (_, i) => ({ emoji: 'f', name: `f${i}`, bin: 'food' })),
  ...Array.from({ length: 6 }, (_, i) => ({ emoji: 'g', name: `g${i}`, bin: 'general' })),
  ...Array.from({ length: 6 }, (_, i) => ({ emoji: 'j', name: `j${i}`, bin: 'junk' })),
];

test('pickItems: returns exactly count items', () => {
  assert.equal(pickItems(POOL, ['recycling', 'food'], 4, seeded(1)).length, 4);
  assert.equal(pickItems(POOL, ['recycling', 'food', 'general', 'junk'], 12, seeded(1)).length, 12);
});

test('pickItems: only returns items for the active bins', () => {
  const picks = pickItems(POOL, ['recycling', 'food'], 4, seeded(2));
  assert.ok(picks.every((it) => it.bin === 'recycling' || it.bin === 'food'));
});

test('pickItems: every active bin appears at least once', () => {
  const bins = ['recycling', 'food', 'general', 'junk'];
  for (let s = 1; s <= 20; s++) {
    const picks = pickItems(POOL, bins, 8, seeded(s));
    for (const b of bins) {
      assert.ok(picks.some((it) => it.bin === b), `seed ${s}: bin ${b} missing`);
    }
  }
});

test('pickItems: deterministic for a given rng seed', () => {
  const a = pickItems(POOL, ['recycling', 'food', 'general'], 6, seeded(7));
  const b = pickItems(POOL, ['recycling', 'food', 'general'], 6, seeded(7));
  assert.deepEqual(a, b);
});

test('pickItems: throws when the pool has nothing for the bins', () => {
  assert.throws(() => pickItems([{ emoji: 'x', name: 'x', bin: 'nope' }], ['recycling'], 4, seeded(1)));
});
