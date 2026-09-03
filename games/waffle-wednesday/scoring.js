// scoring.js — pure. No DOM, no fetch. Imported by game.js and the test suite.
// Every constant here is TUNABLE — playtesting will move these numbers.

const T = {
  BURN_THRESHOLD: 92,
  BURN_OVER: 15,
  IN_BAND_BASE: 60,
  IN_BAND_SPAN: 40,
  OUT_OF_BAND: 20,
  BURN_PENALTY: -80,
  TOPPING_OK: 30,
  TOPPING_BAD: -25,   // applied per missing AND per unwanted topping
  SYRUP_OK: 40,
  SYRUP_BAD: -40,
  SYRUP_NEGLIGIBLE: 5,
  PERFECT_BONUS: 150,
  TIP_MAX: 100,
  GOOD_THRESHOLD: 120,
};

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

export function isBurnt(doneness, band) {
  return doneness >= T.BURN_THRESHOLD || doneness > band[1] + T.BURN_OVER;
}

export function scoreServe(input) {
  const {
    doneness,
    band,
    toppings = [],
    wanted = [],
    syrupLevel = null,
    wantedSyrup = null,
    patienceLeft = 0,
  } = input;

  if (isBurnt(doneness, band)) {
    return { points: T.BURN_PENALTY, tip: 0, perfect: false, verdict: 'burnt' };
  }

  let points = 0;
  const [lo, hi] = band;

  // --- Doneness ---
  const inBand = doneness >= lo && doneness <= hi;
  if (inBand) {
    const centre = (lo + hi) / 2;
    const half = (hi - lo) / 2 || 1;
    const closeness = 1 - Math.abs(doneness - centre) / half; // 0..1
    points += T.IN_BAND_BASE + T.IN_BAND_SPAN * closeness;
  } else {
    points += T.OUT_OF_BAND;
  }

  // --- Toppings (set comparison, order/dupes ignored) ---
  const wantedSet = new Set(wanted);
  const gotSet = new Set(toppings);
  let toppingsOk = true;
  for (const w of wantedSet) {
    if (gotSet.has(w)) points += T.TOPPING_OK;
    else { points += T.TOPPING_BAD; toppingsOk = false; }
  }
  for (const g of gotSet) {
    if (!wantedSet.has(g)) { points += T.TOPPING_BAD; toppingsOk = false; }
  }

  // --- Syrup ---
  const poured = syrupLevel ?? 0;
  let syrupOk;
  if (wantedSyrup) {
    syrupOk = Math.abs(poured - wantedSyrup.target) <= wantedSyrup.tolerance;
  } else {
    syrupOk = poured < T.SYRUP_NEGLIGIBLE;
  }
  points += syrupOk ? T.SYRUP_OK : T.SYRUP_BAD;

  // --- Perfect ---
  const perfect = inBand && toppingsOk && syrupOk && wantedSyrup !== null && wantedSet.size > 0;
  if (perfect) points += T.PERFECT_BONUS;

  points = Math.round(points);
  const tip = Math.round(clamp01(patienceLeft) * T.TIP_MAX);

  let verdict;
  if (perfect) verdict = 'perfect';
  else if (points >= T.GOOD_THRESHOLD) verdict = 'good';
  else verdict = 'sloppy';

  return { points, tip, perfect, verdict };
}
