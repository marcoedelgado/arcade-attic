// director.js — the running shift: whose turn it is, the score, the strikes, and
// the two ways a customer leaves the counter (served or walked out). Pure state:
// no DOM, no timers, no scoring math. Hand serve() a scoreServe() result and it
// moves the shift on; hand walkout() nothing and it takes the strike. shift.js
// builds the customer roster; this runs it.

const WALKOUT_PENALTY = -120;
const MAX_STRIKES = 3;

export function makeDirector(customers) {
  let index = 0;
  let strikes = 0;
  let score = 0;
  let perfects = 0;
  let served = 0;
  const walkers = [];

  const current = () => customers[index] ?? null;
  const upcoming = (n = 3) => customers.slice(index + 1, index + 1 + n);
  const isOver = () => strikes >= MAX_STRIKES || index >= customers.length;

  // What state the shift is in now that a customer has left the counter.
  // 'bad' (struck out) is checked before 'complete' so the last customer
  // walking out on the third strike still reads as a bad Wednesday.
  const step = () => {
    if (strikes >= MAX_STRIKES) return { done: 'bad' };
    if (index >= customers.length) return { done: 'complete' };
    return { advancedTo: current() };
  };
  const advance = () => { index += 1; return step(); };

  return {
    current,
    upcoming,
    isOver,

    // result: a scoreServe() return — { points, tip, perfect, ... }
    serve(result) {
      score += result.points + result.tip;
      if (result.perfect) perfects += 1;
      served += 1;
      return advance();
    },

    // the current customer's patience ran out
    walkout() {
      const who = current();
      strikes += 1;
      score += WALKOUT_PENALTY;
      if (who) walkers.push(who.name);
      return advance();
    },

    // a fresh snapshot for the HUD and the report card — safe to mutate
    stats: () => ({
      index, strikes, score, perfects, served,
      walkers: [...walkers], total: customers.length,
    }),
  };
}
