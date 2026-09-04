// shift.js — pure. No DOM, no fetch. Takes content + an injectable rng.

// Deterministic PRNG (mulberry32). Seed it for a repeatable shift; the game
// seeds with the clock, the tests with fixed integers.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rampFor(index) {
  const n = Math.max(1, Math.min(20, Math.floor(Number(index) || 1)));
  if (n <= 4)  return { bandWidth: 25, meterRate: 14, toppingCount: [1, 1], syrupChance: 0,    slots: 1, patience: 22 };
  if (n <= 9)  return { bandWidth: 18, meterRate: 18, toppingCount: [1, 2], syrupChance: 0.30, slots: 1, patience: 18 };
  if (n <= 14) return { bandWidth: 14, meterRate: 22, toppingCount: [2, 3], syrupChance: 0.50, slots: 2, patience: 15 };
  return         { bandWidth: 10, meterRate: 27, toppingCount: [3, 4], syrupChance: 0.50, slots: 2, patience: 12 };
}

// Fisher-Yates using rng; returns a new array.
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// k distinct integers from [0, n).
function sampleDistinct(n, k, rng) {
  const pool = Array.from({ length: n }, (_, i) => i);
  return shuffle(pool, rng).slice(0, k);
}

// Choose `k` non-adjacent slots from the 18 positions 3..20.
// Standard bijection: choose k from [0, 18-k+1), sort, then p_i = c_i + i.
function placeCrew(k, rng) {
  const M = 18;
  const chosen = sampleDistinct(M - k + 1, k, rng).sort((a, b) => a - b);
  return chosen.map((c, i) => 3 + c + i); // slot numbers in 3..20, gaps >= 2
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function makeGenericOrder(ramp, toppings, syrupChoices, rng) {
  const width = ramp.bandWidth;
  const half = width / 2;
  // centre kept in [20, 79] so the band never needs clamping
  const centre = 20 + Math.floor(rng() * 60);
  const band = [Math.round(centre - half), Math.round(centre - half) + width];

  const [min, max] = ramp.toppingCount;
  const count = Math.min(min + Math.floor(rng() * (max - min + 1)), toppings.length);
  const chosen = sampleDistinct(toppings.length, count, rng).map((i) => toppings[i].id);

  const syrup = rng() < ramp.syrupChance ? pick(syrupChoices, rng) : null;

  return { band, toppings: chosen, syrup, ticketText: null };
}

export function buildShift(data, rng = Math.random) {
  const { crew, toppings, names, syrupChoices } = data;

  const slots = placeCrew(crew.length, rng);
  const crewShuffled = shuffle(crew, rng);
  const bySlot = new Map(slots.map((slot, i) => [slot, crewShuffled[i]]));

  const customers = [];
  for (let n = 1; n <= 20; n++) {
    const ramp = rampFor(n);
    const member = bySlot.get(n);
    if (member) {
      customers.push({
        id: n,
        kind: 'crew',
        who: member.id,
        name: member.name,
        order: {
          band: member.order.band.slice(),
          toppings: member.order.toppings.slice(),
          syrup: member.order.syrup ? { ...member.order.syrup } : null,
          ticketText: member.order.ticketText ?? null,
        },
        ramp,
        lines: member.lines,
      });
    } else {
      customers.push({
        id: n,
        kind: 'generic',
        who: null,
        name: pick(names, rng),
        order: makeGenericOrder(ramp, toppings, syrupChoices, rng),
        ramp,
      });
    }
  }
  return customers;
}
