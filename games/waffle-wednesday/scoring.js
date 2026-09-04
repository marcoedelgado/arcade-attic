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

// Post-serve stamp popup (artboard 04b). Each category gets a medal off a 0..1
// quality value: gold = dead-on, silver = off but acceptable, bronze = scraped
// past, cross = missed outright. TUNABLE, like everything above.
const STAMP = {
  GOLD: 0.8,
  SILVER: 0.45,
  BRONZE: 0.12,
  DONENESS_MISS_SPAN: 15,   // out-of-band doneness quality decays to 0 this far past the edge
  DONENESS_MISS_CAP: 0.4,   // ...and never rises above bronze while out of band
  EXTRA_TOPPING: 0.6,       // quality lost per unwanted topping on an order that wanted none
  SYRUP_TOL_SPAN: 2,        // quality hits 0 at this many tolerances from target
  SYRUP_STRAY_SPAN: 20,     // stray-pour quality decays to 0 this far past "negligible"
  SYRUP_STRAY_CAP: 0.5,
};

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

const tierFor = (q) =>
  q >= STAMP.GOLD ? 'gold'
  : q >= STAMP.SILVER ? 'silver'
  : q > STAMP.BRONZE ? 'bronze'
  : 'cross';

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
    syrupOverflow = false,
    wantedSyrup = null,
    patienceLeft = 0,
  } = input;

  if (isBurnt(doneness, band)) {
    return { points: T.BURN_PENALTY, tip: 0, perfect: false, verdict: 'burnt', stamps: null, bonus: 0 };
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
  points += (syrupOk && !syrupOverflow) ? T.SYRUP_OK : T.SYRUP_BAD;

  // --- Perfect ---
  const perfect = inBand && toppingsOk && syrupOk && !syrupOverflow;
  if (perfect) points += T.PERFECT_BONUS;

  points = Math.round(points);
  const tip = Math.round(clamp01(patienceLeft) * T.TIP_MAX);

  let verdict;
  if (perfect) verdict = 'perfect';
  else if (points >= T.GOOD_THRESHOLD) verdict = 'good';
  else verdict = 'sloppy';

  // --- Serve stamps (artboard 04b) ---
  let donenessQ;
  if (inBand) {
    const centre = (lo + hi) / 2;
    const half = (hi - lo) / 2 || 1;
    donenessQ = 0.5 + 0.5 * (1 - Math.abs(doneness - centre) / half); // in-band worst is silver
  } else {
    const dist = doneness < lo ? lo - doneness : doneness - hi;
    donenessQ = STAMP.DONENESS_MISS_CAP * Math.max(0, 1 - dist / STAMP.DONENESS_MISS_SPAN);
  }

  let toppingsQ;
  if (wantedSet.size === 0) {
    toppingsQ = 1 - gotSet.size * STAMP.EXTRA_TOPPING;
  } else {
    let matched = 0;
    for (const w of wantedSet) if (gotSet.has(w)) matched += 1;
    let extra = 0;
    for (const g of gotSet) if (!wantedSet.has(g)) extra += 1;
    toppingsQ = (matched - extra) / wantedSet.size;
  }

  let syrupStamp;
  if (syrupOverflow) {
    syrupStamp = 'cross';
  } else if (wantedSyrup) {
    const dist = Math.abs(poured - wantedSyrup.target);
    syrupStamp = tierFor(1 - dist / (wantedSyrup.tolerance * STAMP.SYRUP_TOL_SPAN));
  } else if (poured < T.SYRUP_NEGLIGIBLE) {
    syrupStamp = 'gold';
  } else {
    syrupStamp = tierFor(
      STAMP.SYRUP_STRAY_CAP * Math.max(0, 1 - (poured - T.SYRUP_NEGLIGIBLE) / STAMP.SYRUP_STRAY_SPAN),
    );
  }

  // A perfect serve is a clean sweep — the popup shows three golds and the gold
  // border, matching the report-card verdict rather than the raw closeness math.
  const stamps = perfect
    ? { doneness: 'gold', toppings: 'gold', syrup: 'gold' }
    : {
        doneness: tierFor(donenessQ),
        toppings: tierFor(toppingsQ),
        syrup: syrupStamp,
      };

  return { points, tip, perfect, verdict, stamps, bonus: perfect ? T.PERFECT_BONUS : 0 };
}
