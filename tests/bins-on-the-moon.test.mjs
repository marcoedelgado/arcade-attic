import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BINS, BIN_IDS, levelConfig } from '../games/bins-on-the-moon/levels.js';

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
