import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASCOTS, SUBSETS, mascotsFor } from '../games/pocket-pairs/mascots.js';

test('MASCOTS: 12 mascots, each with a string id and name, ids unique', () => {
  assert.equal(MASCOTS.length, 12);
  for (const m of MASCOTS) {
    assert.equal(typeof m.id, 'string');
    assert.ok(m.id.length > 0);
    assert.equal(typeof m.name, 'string');
    assert.ok(m.name.length > 0);
  }
  assert.equal(new Set(MASCOTS.map((m) => m.id)).size, 12);
});

test('SUBSETS: correct sizes and nested (6 ⊂ 8 ⊂ 12)', () => {
  assert.equal(SUBSETS[6].length, 6);
  assert.equal(SUBSETS[8].length, 8);
  assert.equal(SUBSETS[12].length, 12);
  const eight = new Set(SUBSETS[8]);
  for (const id of SUBSETS[6]) assert.ok(eight.has(id), `${id} missing from SUBSETS[8]`);
  const twelve = new Set(SUBSETS[12]);
  for (const id of SUBSETS[8]) assert.ok(twelve.has(id), `${id} missing from SUBSETS[12]`);
  const roster = new Set(MASCOTS.map((m) => m.id));
  for (const id of SUBSETS[12]) assert.ok(roster.has(id), `${id} not in MASCOTS`);
});

test('mascotsFor: returns a copy, throws on unknown size', () => {
  const a = mascotsFor(8);
  assert.equal(a.length, 8);
  a.push('x');
  assert.equal(mascotsFor(8).length, 8, 'must return a fresh copy');
  assert.throws(() => mascotsFor(10), /10/);
  assert.throws(() => mascotsFor(), /pairs/);
});
