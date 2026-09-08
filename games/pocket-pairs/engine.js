// engine.js — pure pairs/concentration state machine.
// No DOM, no timers, no Date. The UI owns the mismatch delay and calls
// resolve() when it elapses. Shuffle takes an injectable rng for tests.
import { pickMascots } from './mascots.js';

export function createGame({ pairs, players, rng = Math.random, pool }) {
  if (![6, 8, 12].includes(pairs)) throw new Error(`unsupported pairs=${pairs}`);
  if (![1, 2].includes(players)) throw new Error(`unsupported players=${players}`);

  const deck = [];
  for (const mascot of pickMascots(pairs, rng, pool)) deck.push({ mascot }, { mascot });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const cards = deck.map((c, i) => ({ id: i, mascot: c.mascot, faceUp: false, matched: false }));

  let moves = 0;
  let turn = 0;
  const scores = [0, 0];
  let won = false;

  const upCards = () => cards.filter((c) => c.faceUp && !c.matched);
  const isLocked = () => upCards().length === 2;
  const matchedPairs = () => cards.filter((c) => c.matched).length / 2;

  function flip(index) {
    if (won || isLocked()) return;
    const card = cards[index];
    if (!card || card.faceUp || card.matched) return;
    card.faceUp = true;
    if (upCards().length === 2 && players === 1) moves += 1;
  }

  function resolve() {
    const up = upCards();
    if (up.length !== 2) return;
    const [a, b] = up;
    if (a.mascot === b.mascot) {
      a.matched = true;
      b.matched = true;
      if (players === 2) scores[turn] += 1;
      if (matchedPairs() === pairs) won = true;
    } else {
      a.faceUp = false;
      b.faceUp = false;
      if (players === 2) turn ^= 1;
    }
  }

  function state() {
    return {
      players,
      moves,
      turn,
      scores: [...scores],
      won,
      matchedPairs: matchedPairs(),
      totalPairs: pairs,
    };
  }

  return { cards, flip, resolve, isLocked, state };
}

export function winnerOf(scores) {
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}
