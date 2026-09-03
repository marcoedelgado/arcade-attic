import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBurnt, scoreServe } from '../games/waffle-wednesday/scoring.js';
import { rampFor, buildShift } from '../games/waffle-wednesday/shift.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readJson = (rel) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

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

// mulberry32 — deterministic PRNG for tests
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIX = {
  crew: ['marriott', 'pitt', 'nash', 'marco', 'james', 'groves'].map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    vibe: 'test',
    order: { band: [45, 55], toppings: ['strawberry'], syrup: null, ticketText: 'the usual' },
    lines: { greet: ['hi'], happy: ['ta'], walkout: ['bye'] },
  })),
  toppings: ['strawberry', 'banana', 'blueberry', 'chocolate', 'honey', 'cream', 'nuts', 'sprinkles'].map((id) => ({ id, emoji: '•' })),
  names: ['Sam', 'Alex', 'Jo', 'Kai', 'Ree', 'Max', 'Lou', 'Bex', 'Ola', 'Ade'],
  syrupChoices: [{ target: 50, tolerance: 15 }, { target: 95, tolerance: 20 }],
};

test('rampFor: clamps and never eases across a boundary', () => {
  assert.equal(rampFor(0).slots, rampFor(1).slots);
  assert.equal(rampFor(999).slots, rampFor(20).slots);
  let prev = rampFor(1);
  for (let n = 2; n <= 20; n++) {
    const r = rampFor(n);
    assert.ok(r.bandWidth <= prev.bandWidth, `band width grew at ${n}`);
    assert.ok(r.slots >= prev.slots, `slots dropped at ${n}`);
    assert.ok(r.patience <= prev.patience, `patience grew at ${n}`);
    assert.ok(r.meterRate >= prev.meterRate, `meter slowed at ${n}`);
    prev = r;
  }
});

test('rampFor: second toaster slot appears at customer 10', () => {
  assert.equal(rampFor(9).slots, 1);
  assert.equal(rampFor(10).slots, 2);
});

test('buildShift: always 20 customers, ids 1..20 in order', () => {
  const s = buildShift(FIX, seeded(1));
  assert.equal(s.length, 20);
  s.forEach((c, i) => assert.equal(c.id, i + 1));
});

test('buildShift: slots 1 and 2 are always generic', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = buildShift(FIX, seeded(seed));
    assert.equal(s[0].kind, 'generic');
    assert.equal(s[1].kind, 'generic');
  }
});

test('buildShift: each crew id appears exactly once', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = buildShift(FIX, seeded(seed));
    const crewIds = s.filter((c) => c.kind === 'crew').map((c) => c.who).sort();
    assert.deepEqual(crewIds, ['groves', 'james', 'marco', 'marriott', 'nash', 'pitt']);
  }
});

test('buildShift: no two adjacent customers are both crew', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = buildShift(FIX, seeded(seed));
    for (let i = 1; i < s.length; i++) {
      assert.ok(!(s[i].kind === 'crew' && s[i - 1].kind === 'crew'), `seed ${seed}: adjacent crew at ${i}`);
    }
  }
});

test('buildShift: deterministic for a given rng seed', () => {
  assert.deepEqual(buildShift(FIX, seeded(7)), buildShift(FIX, seeded(7)));
});

test('buildShift: crew keep their signature order; ramp still comes from the slot', () => {
  const s = buildShift(FIX, seeded(3));
  const groves = s.find((c) => c.who === 'groves');
  assert.deepEqual(groves.order.band, [45, 55]);          // from the fixture crew order
  assert.deepEqual(groves.ramp, rampFor(groves.id));      // ramp is the slot's
});

test('buildShift: generic orders only use catalogue toppings, within the ramp count', () => {
  const ids = new Set(FIX.toppings.map((t) => t.id));
  const s = buildShift(FIX, seeded(11));
  for (const c of s.filter((x) => x.kind === 'generic')) {
    const [min, max] = c.ramp.toppingCount;
    assert.ok(c.order.toppings.length >= min && c.order.toppings.length <= max);
    for (const t of c.order.toppings) assert.ok(ids.has(t), `unknown topping ${t}`);
    assert.equal(new Set(c.order.toppings).size, c.order.toppings.length, 'duplicate topping');
    const [lo, hi] = c.order.band;
    assert.ok(lo >= 0 && hi <= 100 && lo < hi);
    assert.equal(hi - lo, c.ramp.bandWidth);
  }
});

test('customers.json: valid catalogue, names, vocab', () => {
  const c = readJson('../games/waffle-wednesday/customers.json');
  assert.ok(Array.isArray(c.toppings) && c.toppings.length >= 6);
  const ids = new Set();
  for (const t of c.toppings) {
    assert.equal(typeof t.id, 'string');
    assert.ok(t.emoji.length > 0);
    assert.ok(t.label.length > 0);
    assert.ok(!ids.has(t.id), `duplicate topping id ${t.id}`);
    ids.add(t.id);
  }
  assert.ok(c.names.length >= 8);
  for (const k of ['greet', 'happy', 'meh', 'angry', 'walkout']) {
    assert.ok(Array.isArray(c.lines[k]) && c.lines[k].length >= 2, `lines.${k}`);
  }
  assert.ok(c.donenessVocab.at(-1).max >= 100);
  assert.ok(c.syrupChoices.length >= 2);
  for (const r of ['chefsKiss', 'solid', 'rough', 'badWednesday']) {
    assert.ok(Array.isArray(c.roasts[r]) && c.roasts[r].length >= 1, `roasts.${r}`);
  }
});

test('crew.json: the six regulars with well-formed signature orders', () => {
  const { crew } = readJson('../games/waffle-wednesday/crew.json');
  const catalogue = new Set(readJson('../games/waffle-wednesday/customers.json').toppings.map((t) => t.id));
  const ids = crew.map((m) => m.id).sort();
  assert.deepEqual(ids, ['groves', 'james', 'marco', 'marriott', 'nash', 'pitt']);
  for (const m of crew) {
    const [lo, hi] = m.order.band;
    assert.ok(lo >= 0 && hi <= 100 && lo < hi, `${m.id} band`);
    for (const t of m.order.toppings) assert.ok(catalogue.has(t), `${m.id}: unknown topping ${t}`);
    if (m.order.syrup) {
      assert.equal(typeof m.order.syrup.target, 'number');
      assert.equal(typeof m.order.syrup.tolerance, 'number');
    }
    assert.ok(m.order.ticketText.length > 0, `${m.id} ticketText`);
    for (const k of ['greet', 'happy', 'walkout']) {
      assert.ok(Array.isArray(m.lines[k]) && m.lines[k].length >= 1, `${m.id}.lines.${k}`);
    }
  }
});

test('buildShift accepts the real content files', () => {
  const { crew } = readJson('../games/waffle-wednesday/crew.json');
  const cust = readJson('../games/waffle-wednesday/customers.json');
  const data = { crew, toppings: cust.toppings, names: cust.names, syrupChoices: cust.syrupChoices };
  const s = buildShift(data, seeded(42));
  assert.equal(s.length, 20);
  assert.equal(new Set(s.filter((c) => c.kind === 'crew').map((c) => c.who)).size, 6);
});
