// plume.js — pure. The growth model, and the whole reward system of the game.
//
// One scalar in [0, 1]. Feathers raise it, collisions lower it, and every visual
// property of the serpent derives from it: how long it is, how thick, how shaggy
// its feathers, how iridescent. That is why there is no score display anywhere in
// this game — the serpent IS the score, and a 5-year-old reads it without a
// single digit or word (spec §3).
//
// STAGES are anchors for the art pass, not steps: interpolation between them is
// continuous. The Claude Design pass draws the serpent at exactly these five
// points, and serpent.js interpolates the geometry between them.

export const STAGES = [
  { id: 'bare',     at: 0.00, name: 'Bare' },
  { id: 'downy',    at: 0.25, name: 'Downy' },
  { id: 'plumed',   at: 0.50, name: 'Plumed' },
  { id: 'brilliant',at: 0.75, name: 'Brilliant' },
  { id: 'blazing',  at: 1.00, name: 'Blazing' },
];

// TUNABLE — how much one feather is worth, and what a collision costs. The ratio
// matters more than the absolute values: a collision should cost noticeably more
// than one feather (so it stings) but less than four (so it never feels ruinous).
export const FEATHER_GAIN = 0.02;
export const COLLIDE_COST = 0.06;

// TUNABLE — the derived geometry at plume 0 and plume 1. Every value between is
// interpolated. serpent.js reads these; nothing else should.
export const AT_BARE    = { length: 8,  girth: 0.55, feather: 0.05, iridescence: 0.15 };
export const AT_BLAZING = { length: 46, girth: 1.00, feather: 1.00, iridescence: 1.00 };

// makePlume() returns a live instance holding the current value. game.js creates
// one per run. The floor comes from journey.floorAt() and is passed in at the
// moment of collision, not held here — plume.js does not know about altitude.
export function makePlume(initial = 0) {
  throw new Error('not implemented');
}

// Derive the serpent's geometry from a plume value. Pure, no instance needed —
// the menu uses this to draw your best serpent without starting a run.
// Every returned value must be monotonic in `plume`.
export function geometryAt(plume) {
  throw new Error('not implemented');
}

// Which stage is this plume value at or past? Used by the art/menu, not by
// rendering — rendering interpolates continuously.
export function stageAt(plume) {
  throw new Error('not implemented');
}
