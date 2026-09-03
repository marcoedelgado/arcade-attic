import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBurnt, scoreServe } from '../games/waffle-wednesday/scoring.js';

const base = {
  doneness: 50,
  band: [40, 60],
  toppings: [],
  wanted: [],
  syrupLevel: null,
  wantedSyrup: null,
  patienceLeft: 0,
};

test('isBurnt: past the hard threshold', () => {
  assert.equal(isBurnt(92, [40, 60]), true);
  assert.equal(isBurnt(95, [80, 90]), true);
});

test('isBurnt: too far past the top of the band', () => {
  assert.equal(isBurnt(80, [40, 60]), true);   // 80 > 60 + 15
  assert.equal(isBurnt(74, [40, 60]), false);  // 74 <= 60 + 15
});

test('scoreServe: burnt short-circuits everything', () => {
  const r = scoreServe({ ...base, doneness: 95, toppings: ['x'], wanted: ['x'] });
  assert.equal(r.verdict, 'burnt');
  assert.equal(r.points, -80);
  assert.equal(r.tip, 0);
  assert.equal(r.perfect, false);
});

test('scoreServe: doneness at band centre beats doneness at band edge', () => {
  const centre = scoreServe({ ...base, doneness: 50 }).points;
  const edge = scoreServe({ ...base, doneness: 60 }).points;
  assert.ok(centre > edge, `centre ${centre} should beat edge ${edge}`);
});

test('scoreServe: doneness outside the band gives only the flat partial', () => {
  const r = scoreServe({ ...base, doneness: 20 });
  // 20 (out of band) + 40 (syrup correctly none) = 60
  assert.equal(r.points, 60);
  assert.equal(r.perfect, false);
});

test('scoreServe: each correct topping adds, each wrong/missing subtracts', () => {
  const good = scoreServe({ ...base, doneness: 20, toppings: ['a', 'b'], wanted: ['a', 'b'] });
  const missing = scoreServe({ ...base, doneness: 20, toppings: ['a'], wanted: ['a', 'b'] });
  const extra = scoreServe({ ...base, doneness: 20, toppings: ['a', 'b', 'c'], wanted: ['a', 'b'] });
  assert.equal(good.points - missing.points, 55);   // b correct (+30) vs b missing (-25)
  assert.equal(good.points - extra.points, 25);     // c absent (0) vs c unwanted (-25)
});

test('scoreServe: syrup within tolerance credits, outside penalises', () => {
  const ok = scoreServe({ ...base, doneness: 20, syrupLevel: 52, wantedSyrup: { target: 50, tolerance: 15 } });
  const off = scoreServe({ ...base, doneness: 20, syrupLevel: 90, wantedSyrup: { target: 50, tolerance: 15 } });
  assert.equal(ok.points - off.points, 80);          // +40 vs -40
});

test('scoreServe: pouring syrup on an order that did not want it penalises', () => {
  const clean = scoreServe({ ...base, doneness: 20 });
  const messy = scoreServe({ ...base, doneness: 20, syrupLevel: 40 });
  assert.equal(clean.points - messy.points, 80);
});

test('scoreServe: perfect serve adds the +150 bonus and verdict "perfect"', () => {
  const r = scoreServe({
    ...base,
    doneness: 50,
    toppings: ['a', 'b'],
    wanted: ['a', 'b'],
    syrupLevel: 50,
    wantedSyrup: { target: 50, tolerance: 15 },
    patienceLeft: 1,
  });
  assert.equal(r.perfect, true);
  assert.equal(r.verdict, 'perfect');
  // 100 (centre) + 60 (2 toppings) + 40 (syrup) + 150 (bonus) = 350
  assert.equal(r.points, 350);
  assert.equal(r.tip, 100);
});

test('scoreServe: tip scales with patienceLeft and is 0 when burnt', () => {
  assert.equal(scoreServe({ ...base, patienceLeft: 0.5 }).tip, 50);
  assert.equal(scoreServe({ ...base, patienceLeft: 0.2 }).tip, 20);
  assert.equal(scoreServe({ ...base, doneness: 99, patienceLeft: 1 }).tip, 0);
});

test('scoreServe: verdict is "good" above the threshold, else "sloppy"', () => {
  const good = scoreServe({ ...base, doneness: 50, toppings: ['a', 'b'], wanted: ['a'] });
  assert.equal(good.verdict, 'good');   // 100 + (a +30, b unwanted -25) + 40 = 145; not perfect (toppings off)
  const sloppy = scoreServe({ ...base, doneness: 15, toppings: [], wanted: ['a'] });
  assert.equal(sloppy.verdict, 'sloppy'); // 20 - 25 + 40 = 35
});
