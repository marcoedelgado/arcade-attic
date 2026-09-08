import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASCOTS, FAMILIES, pickMascots } from '../games/pocket-pairs/mascots.js';

// Deterministic RNG: cycles through a fixed list of fractions in [0,1).
function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('MASCOTS: 16 mascots, each with a string id, name and family, ids unique', () => {
  assert.equal(MASCOTS.length, 16);
  for (const m of MASCOTS) {
    assert.equal(typeof m.id, 'string');
    assert.ok(m.id.length > 0);
    assert.equal(typeof m.name, 'string');
    assert.ok(m.name.length > 0);
    assert.equal(typeof m.family, 'string');
    assert.ok(m.family.length > 0);
  }
  assert.equal(new Set(MASCOTS.map((m) => m.id)).size, 16);
});

test('MASCOTS: four families of four', () => {
  const byFamily = {};
  for (const m of MASCOTS) byFamily[m.family] = (byFamily[m.family] ?? 0) + 1;
  assert.equal(Object.keys(byFamily).length, 4);
  for (const [fam, n] of Object.entries(byFamily)) assert.equal(n, 4, `${fam} has ${n}`);
});

test('pickMascots: count distinct ids, all in the roster', () => {
  const roster = new Set(MASCOTS.map((m) => m.id));
  for (const count of [6, 8, 12, 16]) {
    const picked = pickMascots(count, seededRng(count));
    assert.equal(picked.length, count);
    assert.equal(new Set(picked).size, count, 'all distinct');
    for (const id of picked) assert.ok(roster.has(id), `${id} not in roster`);
  }
});

test('pickMascots: deterministic per seed, varies across seeds', () => {
  assert.deepEqual(pickMascots(8, seededRng(1)), pickMascots(8, seededRng(1)));
  assert.notDeepEqual(pickMascots(8, seededRng(1)), pickMascots(8, seededRng(2)));
});

test('pickMascots: rejects out-of-range count', () => {
  assert.throws(() => pickMascots(0), /count/);
  assert.throws(() => pickMascots(17), /count/);
  assert.throws(() => pickMascots(6.5), /count/);
});

test('FAMILIES: the four family names, covering all 16 mascots', () => {
  assert.equal(FAMILIES.length, 4);
  assert.deepEqual(new Set(FAMILIES), new Set(MASCOTS.map((m) => m.family)));
  const counts = {};
  for (const m of MASCOTS) counts[m.family] = (counts[m.family] ?? 0) + 1;
  for (const fam of FAMILIES) assert.equal(counts[fam], 4, `${fam} has ${counts[fam]}`);
});

test('pickMascots: restricted pool — picks only from the pool, guards its size', () => {
  const pool = MASCOTS.filter((m) => m.family === FAMILIES[0] || m.family === FAMILIES[1]).map((m) => m.id);
  assert.equal(pool.length, 8);
  const picked = pickMascots(8, seededRng(1), pool);
  assert.deepEqual([...picked].sort(), [...pool].sort(), 'all 8 of an 8-pool');
  const six = pickMascots(6, seededRng(2), pool);
  assert.equal(six.length, 6);
  for (const id of six) assert.ok(pool.includes(id));
  assert.throws(() => pickMascots(12, seededRng(3), pool), /count/, 'pool too small for 12');
});

import { createGame } from '../games/pocket-pairs/engine.js';

test('deck: pairs*2 cards, every mascot appears exactly twice', () => {
  for (const pairs of [6, 8, 12]) {
    const g = createGame({ pairs, players: 1, rng: seededRng(pairs) });
    assert.equal(g.cards.length, pairs * 2);
    const counts = {};
    for (const c of g.cards) counts[c.mascot] = (counts[c.mascot] ?? 0) + 1;
    const mascots = Object.keys(counts);
    assert.equal(mascots.length, pairs);
    const roster = new Set(MASCOTS.map((m) => m.id));
    for (const m of mascots) assert.ok(roster.has(m), `${m} not in roster`);
    for (const m of mascots) assert.equal(counts[m], 2, `${m} not a pair`);
  }
});

test('deck: cards carry id = array index, start face-down and unmatched', () => {
  const g = createGame({ pairs: 6, players: 1, rng: seededRng(3) });
  g.cards.forEach((c, i) => {
    assert.equal(c.id, i);
    assert.equal(c.faceUp, false);
    assert.equal(c.matched, false);
  });
});

test('deck: different seeds give different boards, each a valid pair set', () => {
  const boardOf = (seed) => createGame({ pairs: 12, players: 1, rng: seededRng(seed) }).cards.map((c) => c.mascot);
  const a = boardOf(1);
  const b = boardOf(777);
  assert.notDeepEqual(a, b, 'different seed → different board');
  for (const board of [a, b]) {
    const counts = {};
    for (const m of board) counts[m] = (counts[m] ?? 0) + 1;
    assert.equal(Object.keys(counts).length, 12, '12 distinct mascots');
    for (const m of Object.keys(counts)) assert.equal(counts[m], 2);
  }
});

test('createGame: rejects bad pairs / players', () => {
  assert.throws(() => createGame({ pairs: 5, players: 1 }), /pairs/);
  assert.throws(() => createGame({ pairs: 8, players: 3 }), /players/);
  assert.throws(() => createGame({ pairs: 20, players: 1 }), /pairs/);
});

test('createGame: restricted pool — board mascots all come from the pool', () => {
  const pool = MASCOTS.filter((m) => m.family === FAMILIES[2] || m.family === FAMILIES[3]).map((m) => m.id);
  const g = createGame({ pairs: 8, players: 1, rng: seededRng(9), pool });
  const onBoard = new Set(g.cards.map((c) => c.mascot));
  assert.equal(onBoard.size, 8);
  for (const id of onBoard) assert.ok(pool.includes(id), `${id} not in the restricted pool`);
  assert.throws(() => createGame({ pairs: 12, players: 1, pool }), /count/, 'pool of 8 cannot fill 12 pairs');
});

test('flip: reveals a card; second distinct flip locks the board', () => {
  const g = createGame({ pairs: 6, players: 1, rng: seededRng(7) });
  g.flip(0);
  assert.equal(g.cards[0].faceUp, true);
  assert.equal(g.isLocked(), false);
  g.flip(1);
  assert.equal(g.cards[1].faceUp, true);
  assert.equal(g.isLocked(), true);
});

test('flip: no-ops for same card, matched card, third flip, bad index', () => {
  const g = createGame({ pairs: 6, players: 1, rng: seededRng(7) });
  g.flip(0);
  g.flip(0); // same card again
  assert.equal(g.cards.filter((c) => c.faceUp).length, 1);
  g.flip(1); // locked now
  g.flip(2); // third flip ignored
  assert.equal(g.cards[2].faceUp, false);
  g.flip(-1); // bad index ignored
  g.flip(999);
  assert.equal(g.cards.filter((c) => c.faceUp).length, 2);
});

test('flip: solo move counter ticks on the second card, not the first', () => {
  const g = createGame({ pairs: 6, players: 1, rng: seededRng(7) });
  assert.equal(g.state().moves, 0);
  g.flip(0);
  assert.equal(g.state().moves, 0);
  g.flip(1);
  assert.equal(g.state().moves, 1);
});

import { winnerOf } from '../games/pocket-pairs/engine.js';

// Reveal the two cards of the first still-unmatched mascot on the board.
function flipMatchingPair(g) {
  const mascot = g.cards.find((c) => !c.matched).mascot;
  const [a, b] = g.cards.filter((c) => c.mascot === mascot);
  g.flip(a.id);
  g.flip(b.id);
}

// Reveal two cards of different mascots.
function flipMismatch(g) {
  const first = g.cards.find((c) => !c.matched && !c.faceUp);
  const other = g.cards.find((c) => !c.matched && !c.faceUp && c.mascot !== first.mascot);
  g.flip(first.id);
  g.flip(other.id);
}

test('resolve: match latches both cards face-up and matched', () => {
  const g = createGame({ pairs: 6, players: 1, rng: seededRng(2) });
  flipMatchingPair(g);
  g.resolve();
  const up = g.cards.filter((c) => c.matched);
  assert.equal(up.length, 2);
  assert.ok(up.every((c) => c.faceUp));
  assert.equal(g.isLocked(), false);
});

test('resolve: mismatch flips both back down', () => {
  const g = createGame({ pairs: 6, players: 1, rng: seededRng(2) });
  flipMismatch(g);
  assert.equal(g.isLocked(), true);
  g.resolve();
  assert.equal(g.cards.filter((c) => c.faceUp).length, 0);
  assert.equal(g.isLocked(), false);
});

test('resolve: no-op when not exactly two cards are up', () => {
  const g = createGame({ pairs: 6, players: 1, rng: seededRng(2) });
  g.resolve(); // nothing up
  g.flip(0);
  g.resolve(); // one up
  assert.equal(g.cards[0].faceUp, true);
});

test('2-player: match scores the active player and keeps their turn', () => {
  const g = createGame({ pairs: 6, players: 2, rng: seededRng(4) });
  assert.equal(g.state().turn, 0);
  flipMatchingPair(g);
  g.resolve();
  assert.deepEqual(g.state().scores, [1, 0]);
  assert.equal(g.state().turn, 0);
  assert.equal(g.state().moves, 0, '2-player mode does not count moves');
});

test('2-player: mismatch passes the turn, no score', () => {
  const g = createGame({ pairs: 6, players: 2, rng: seededRng(4) });
  flipMismatch(g);
  g.resolve();
  assert.deepEqual(g.state().scores, [0, 0]);
  assert.equal(g.state().turn, 1);
  flipMismatch(g);
  g.resolve();
  assert.equal(g.state().turn, 0);
});

test('win: only true once every pair is matched; flips then no-op', () => {
  const g = createGame({ pairs: 6, players: 1, rng: seededRng(5) });
  for (let i = 0; i < 5; i++) {
    flipMatchingPair(g);
    g.resolve();
    assert.equal(g.state().won, false);
  }
  flipMatchingPair(g);
  g.resolve();
  assert.equal(g.state().won, true);
  assert.equal(g.state().matchedPairs, 6);
  g.flip(0); // ignored after win
  assert.equal(g.cards.filter((c) => c.faceUp && !c.matched).length, 0);
});

test('winnerOf: higher score wins, tie is null', () => {
  assert.equal(winnerOf([7, 5]), 0);
  assert.equal(winnerOf([3, 9]), 1);
  assert.equal(winnerOf([6, 6]), null);
});

import { PAIR_SPRITES } from '../games/pocket-pairs/sprites-data.js';

test('PAIR_SPRITES: >=16 sprites, each 32x32 with in-range palette indices', () => {
  const ids = Object.keys(PAIR_SPRITES);
  assert.ok(ids.length >= 16, `only ${ids.length} sprites`);
  for (const id of ids) {
    const s = PAIR_SPRITES[id];
    assert.equal(s.w, 32);
    assert.equal(s.h, 32);
    assert.equal(s.pixels.length, 1024, `${id}: ${s.pixels.length} pixels`);
    assert.equal(s.palette[0], null, `${id}: palette[0] must be transparent`);
    for (const ch of s.pixels) {
      const v = parseInt(ch, 16);
      assert.ok(Number.isInteger(v) && v >= 0 && v < s.palette.length, `${id}: bad index ${ch}`);
    }
  }
});

test('PAIR_SPRITES: one sprite per mascot in the roster', () => {
  for (const m of MASCOTS) {
    assert.ok(PAIR_SPRITES[m.id], `no sprite for ${m.id}`);
  }
  for (const id of Object.keys(PAIR_SPRITES)) {
    assert.ok(MASCOTS.some((m) => m.id === id), `orphan sprite: ${id}`);
  }
});
