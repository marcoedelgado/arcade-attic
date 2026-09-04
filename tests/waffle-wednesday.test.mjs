import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBurnt, scoreServe } from '../games/waffle-wednesday/scoring.js';
import { rampFor, buildShift, mulberry32 as seeded } from '../games/waffle-wednesday/shift.js';
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

test('scoreServe: syrup overflow is a penalty and breaks perfect', () => {
  const r = scoreServe({
    ...base,
    doneness: 50,
    toppings: ['a'], wanted: ['a'],
    syrupLevel: 100, syrupOverflow: true,
    wantedSyrup: { target: 95, tolerance: 20 },
  });
  assert.equal(r.perfect, false);
  // in-band 100 + topping 30 + syrup overflow -40 = 90
  assert.equal(r.points, 90);
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

test('scoreServe: no serve stamps on a burnt serve', () => {
  const r = scoreServe({ ...base, doneness: 95, toppings: ['x'], wanted: ['x'] });
  assert.equal(r.stamps, null);
});

test('scoreServe: a perfect serve stamps gold across the board', () => {
  const r = scoreServe({
    ...base, doneness: 50,
    toppings: ['a', 'b'], wanted: ['a', 'b'],
    syrupLevel: 50, wantedSyrup: { target: 50, tolerance: 15 },
  });
  assert.deepEqual(r.stamps, { doneness: 'gold', toppings: 'gold', syrup: 'gold' });
  assert.equal(r.bonus, 150);
});

test('scoreServe: a perfect serve at the band edge still stamps three golds', () => {
  const r = scoreServe({
    ...base, doneness: 60, // edge of [40, 60] — still in band, still perfect
    toppings: ['a'], wanted: ['a'],
    syrupLevel: 65, wantedSyrup: { target: 50, tolerance: 15 }, // edge of tolerance
  });
  assert.equal(r.perfect, true);
  assert.deepEqual(r.stamps, { doneness: 'gold', toppings: 'gold', syrup: 'gold' });
});

test('scoreServe: bonus is 0 on anything short of perfect', () => {
  assert.equal(scoreServe({ ...base, doneness: 20 }).bonus, 0);
  assert.equal(scoreServe({ ...base, doneness: 95 }).bonus, 0);
});

test('scoreServe: doneness stamp tiers by distance from the band centre', () => {
  // a missing topping keeps the serve off "perfect" so the doneness stamp is judged on its own
  const at = (d) => scoreServe({ ...base, doneness: d, wanted: ['x'] }).stamps.doneness;
  assert.equal(at(50), 'gold');    // dead centre of [40, 60]
  assert.equal(at(60), 'silver');  // on the band edge
  assert.equal(at(64), 'bronze');  // just past the edge
  assert.equal(at(20), 'cross');   // nowhere near
});

test('scoreServe: toppings stamp tiers by how much of the wanted set matched', () => {
  // doneness out of band keeps the serve off "perfect"
  const t = (toppings, wanted) =>
    scoreServe({ ...base, doneness: 20, toppings, wanted }).stamps.toppings;
  assert.equal(t(['a', 'b'], ['a', 'b']), 'gold');
  assert.equal(t(['a'], ['a', 'b']), 'silver');
  assert.equal(t([], ['a', 'b', 'c']), 'cross');
});

test('scoreServe: syrup stamp tiers by distance from tolerance; overflow is always a cross', () => {
  const s = (extra) => scoreServe({ ...base, doneness: 50, wanted: ['x'], ...extra }).stamps.syrup;
  assert.equal(s({ syrupLevel: 50, wantedSyrup: { target: 50, tolerance: 15 } }), 'gold');
  assert.equal(s({ syrupLevel: 65, wantedSyrup: { target: 50, tolerance: 15 } }), 'silver');
  assert.equal(
    s({ syrupLevel: 100, syrupOverflow: true, wantedSyrup: { target: 95, tolerance: 20 } }),
    'cross',
  );
});

test('scoreServe: leaving syrup off an order that did not want it is a gold stamp', () => {
  assert.equal(scoreServe({ ...base, doneness: 50 }).stamps.syrup, 'gold');
});

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
  assert.deepEqual(rampFor(0), rampFor(1));
  assert.deepEqual(rampFor(999), rampFor(20));
  let prev = rampFor(1);
  for (let n = 2; n <= 20; n++) {
    const r = rampFor(n);
    assert.ok(r.bandWidth <= prev.bandWidth, `band width grew at ${n}`);
    assert.ok(r.patience <= prev.patience, `patience grew at ${n}`);
    assert.ok(r.meterRate >= prev.meterRate, `meter slowed at ${n}`);
    prev = r;
  }
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

test('every shipped order is physically servable', () => {
  const { crew } = readJson('../games/waffle-wednesday/crew.json');
  const cust = readJson('../games/waffle-wednesday/customers.json');
  const shift = buildShift(
    { crew, toppings: cust.toppings, names: cust.names, syrupChoices: cust.syrupChoices },
    seeded(99),
  );
  const CARRYOVER = 8; // must match game.js TOAST.CARRYOVER
  for (const c of shift) {
    const [lo, hi] = c.order.band;
    let servable = 0;
    for (let d = Math.max(lo, CARRYOVER); d <= hi; d++) {
      if (!isBurnt(d, c.order.band)) servable++;
    }
    assert.ok(servable >= 3, `${c.name} (slot ${c.id}) band ${lo}-${hi}: only ${servable} servable values`);
    if (c.order.syrup) {
      const { target, tolerance } = c.order.syrup;
      assert.ok(target - tolerance <= 100 && target + tolerance >= 0, `${c.name}: unreachable syrup target`);
    }
    assert.ok(c.order.toppings.length <= cust.toppings.length, `${c.name}: more toppings than the catalogue has`);
  }
});

test('crew-sprites.js: six well-formed 28x28 indexed sprites', async () => {
  const { CREW_SPRITES } = await import('../games/waffle-wednesday/crew-sprites.js');
  const ids = Object.keys(CREW_SPRITES).sort();
  assert.deepEqual(ids, ['groves', 'james', 'marco', 'marriott', 'nash', 'pitt']);
  for (const [id, sp] of Object.entries(CREW_SPRITES)) {
    assert.equal(sp.w, 28, `${id} width`);
    assert.equal(sp.h, 28, `${id} height`);
    assert.ok(sp.palette.length >= 2 && sp.palette.length <= 16, `${id} palette size`);
    assert.ok(sp.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c)), `${id} palette hex`);
    assert.equal(sp.pixels.length, 28 * 28, `${id} pixel count`);
    assert.ok(/^[0-9a-f]+$/i.test(sp.pixels), `${id} pixel chars`);
    for (const ch of sp.pixels) {
      assert.ok(parseInt(ch, 16) < sp.palette.length, `${id} index out of range`);
    }
  }
});

test('waffle-sprite.js: four doneness frames, one 12x12 map, well-formed palettes', async () => {
  const { WAFFLE_FRAMES } = await import('../games/waffle-wednesday/waffle-sprite.js');
  assert.deepEqual(WAFFLE_FRAMES.map((f) => f.id), ['pale', 'just', 'golden', 'charcoal']);
  for (const f of WAFFLE_FRAMES) {
    assert.equal(f.palette.length, 4, `${f.id} palette length`);
    assert.equal(f.palette[0], null, `${f.id} index 0 is transparent`);
    for (const hex of f.palette.slice(1)) {
      assert.ok(/^#[0-9a-f]{6}$/i.test(hex), `${f.id} palette hex ${hex}`);
    }
  }
});

test('waffleFrameFor: buckets doneness into the four frames in order', async () => {
  const { waffleFrameFor } = await import('../games/waffle-wednesday/waffle-sprite.js');
  const boundaries = [
    [0, 'pale'], [33, 'pale'], [34, 'just'], [47, 'just'],
    [48, 'golden'], [84, 'golden'], [85, 'charcoal'], [100, 'charcoal'],
  ];
  for (const [v, id] of boundaries) assert.equal(waffleFrameFor(v), id, `v${v}`);
});

test('stock: starts full, take decrements, refuses at zero', async () => {
  const { makeStock, canSpawn, take, STOCK_MAX } = await import('../games/waffle-wednesday/stock.js');
  const s = makeStock();
  assert.equal(s.count, STOCK_MAX);
  assert.equal(canSpawn(s), true);
  for (let i = 0; i < STOCK_MAX; i++) assert.equal(take(s), true);
  assert.equal(s.count, 0);
  assert.equal(canSpawn(s), false);
  assert.equal(take(s), false);
  assert.equal(s.count, 0);
});

test('stock: regen adds one per interval, up to the cap, inert when full', async () => {
  const { makeStock, regen, take, STOCK_MAX, STOCK_REGEN_MS } = await import('../games/waffle-wednesday/stock.js');
  const s = makeStock();
  take(s); take(s);                     // count 6
  regen(s, STOCK_REGEN_MS - 1);
  assert.equal(s.count, 6);
  regen(s, 1);
  assert.equal(s.count, 7);
  regen(s, STOCK_REGEN_MS * 9);         // would overshoot; caps
  assert.equal(s.count, STOCK_MAX);
  assert.equal(s.sinceRegen, 0);        // timer reset at the cap
});
