// field.js — pure. What is in the sky ahead: feathers to eat, obstacles to miss,
// ambient scenery to fly past. Deterministic under an injected rng so the tests
// can pin exact spawn positions.
//
// Density is PER METRE OF ALTITUDE, never per frame (spec §4). This is the rule
// deep-glow/field.js established and it matters: per-frame spawning means a
// 120 Hz phone gets twice the feathers of a 60 Hz one, and a stuttering frame
// silently thins the sky. Climbing 200 m must produce the same number of feathers
// whether it took 10 frames or 200.
//
// Spawn positions are BOX-RELATIVE — expressed against the steering box, not in
// absolute pixels — so the same seed produces the same relative spread on a phone
// and a desktop.

// TUNABLE — base spawn rates, scaled by the current act's `feathers` multiplier
// (see journey.js ACTS).
export const FEATHERS_PER_METRE = 0.035;
export const OBSTACLES_PER_METRE = 0.006;

// makeField() returns a live instance holding everything currently in the air.
//
//   step(dt, metres, act, box)   advance drift, retire things behind the camera,
//                                spawn new ones for the altitude just climbed
//   items()                      everything currently alive, for collect + render
//   reset()                      empty the sky (run start)
export function makeField({ rng = Math.random } = {}) {
  throw new Error('not implemented');
}
