// journey.js — pure. Altitude-to-act mapping: which act am I in, how far through
// it, what colours surround me, and is the run over. No RNG, no side effects, no
// browser globals. field.js and game.js consume these values to drive the
// renderer and spawn things.
//
// Altitude is the clock (spec §2). It rises at a fixed rate regardless of play,
// so a run cannot stall and cannot be failed. Flying well does not get you there
// faster — it decides how magnificent you are when you arrive.

export const ACT_METRES = 1000;     // TUNABLE — one act, roughly a minute of flight
export const SUMMIT = ACT_METRES * 4;

// TUNABLE — the four acts, surface to morning star. Colours are [r, g, b] in 0–1
// (shader uniforms; the 2D fallback converts). `colour` is the act's
// representative hue; paletteAt() blends between acts as progress runs 0→1.
//
// `floor` is the plume floor for this act (spec §3): a collision here can never
// take plume below it. Rises through the journey so a setback in Act 4 stings
// without erasing the whole run.
//
// `cast` lists what is in the sky. `kind` is the spawn type: 'feather' is the
// food, 'obstacle' costs plume on contact, 'ambient' is scenery you fly past and
// can never touch. Act 1 deliberately has NO obstacle — it teaches steering in
// total safety before anything can cost you.
//
// Ids here are placeholders until the Claude Design art pass names them. They
// double as sprite keys, so renaming later is a real change, not cosmetic —
// deep-glow learned this the hard way when a rename reset every badge.
export const ACTS = [
  {
    id: 'canopy',
    name: 'Canopy',
    colour: [0.15, 0.42, 0.22],     // jungle green
    floor: 0.0,
    feathers: 0.9,                  // TUNABLE — relative feather density
    cast: [
      { id: 'treetop', kind: 'ambient' },
      { id: 'macaw', kind: 'ambient' },
      { id: 'feather-green', kind: 'feather' },
    ],
  },
  {
    id: 'mist-and-stone',
    name: 'Mist and Stone',
    colour: [0.62, 0.66, 0.58],     // pale grey-green, limestone
    floor: 0.1,
    feathers: 1.0,
    cast: [
      { id: 'pyramid', kind: 'obstacle' },
      { id: 'cloud-bank', kind: 'ambient' },
      { id: 'feather-jade', kind: 'feather' },
    ],
  },
  {
    id: 'ash',
    name: 'Ash',
    colour: [0.72, 0.38, 0.16],     // ochre and ember
    floor: 0.2,
    feathers: 1.3,                  // richest — the reward for the hardest flying
    cast: [
      { id: 'ash-plume', kind: 'obstacle' },
      { id: 'ember', kind: 'ambient' },
      { id: 'feather-ember', kind: 'feather' },
    ],
  },
  {
    id: 'dawn',
    name: 'Dawn',
    colour: [0.86, 0.55, 0.62],     // rose over deep blue
    floor: 0.3,
    feathers: 0.6,                  // sparse — a calm run-in to the ending
    cast: [
      { id: 'venus', kind: 'ambient' },
      { id: 'feather-gold', kind: 'feather' },
    ],
  },
];

// Which act does this altitude fall in, and how far through it are we?
// Altitudes at or past SUMMIT clamp to the end of the last act — the arrival
// is game.js's business, not ours.
export function actAt(metres) {
  throw new Error('not implemented');
}

// Blend from the current act's colour toward the next as progress runs 0→1.
// Must be continuous across an act boundary: paletteAt(x) as x approaches a
// boundary from below equals paletteAt(boundary). The last act holds its own
// colour rather than blending into nothing.
export function paletteAt(metres) {
  throw new Error('not implemented');
}

// The plume floor in force at this altitude (spec §3).
export function floorAt(metres) {
  throw new Error('not implemented');
}

// Has the serpent reached the morning star?
export function arrived(metres) {
  throw new Error('not implemented');
}
