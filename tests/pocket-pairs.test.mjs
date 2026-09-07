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

import { createGame } from '../games/pocket-pairs/engine.js';

// Deterministic RNG: cycles through a fixed list of fractions in [0,1).
function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('deck: pairs*2 cards, every mascot appears exactly twice', () => {
  for (const pairs of [6, 8, 12]) {
    const g = createGame({ pairs, players: 1, rng: seededRng(pairs) });
    assert.equal(g.cards.length, pairs * 2);
    const counts = {};
    for (const c of g.cards) counts[c.mascot] = (counts[c.mascot] ?? 0) + 1;
    const mascots = Object.keys(counts);
    assert.equal(mascots.length, pairs);
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

test('shuffle: different seeds give different orders, same multiset', () => {
  const a = createGame({ pairs: 12, players: 1, rng: seededRng(1) }).cards.map((c) => c.mascot);
  const b = createGame({ pairs: 12, players: 1, rng: seededRng(999) }).cards.map((c) => c.mascot);
  assert.notDeepEqual(a, b);
  assert.deepEqual([...a].sort(), [...b].sort());
});

test('createGame: rejects bad pairs / players', () => {
  assert.throws(() => createGame({ pairs: 5, players: 1 }), /pairs/);
  assert.throws(() => createGame({ pairs: 8, players: 3 }), /players/);
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
