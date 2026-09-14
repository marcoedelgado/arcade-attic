// collect.js — pure. Did the head eat a feather, did it clip an obstacle.
//
// The asymmetry here is the entire fairness policy of the game, and it is
// deliberate (spec §4):
//
//   EAT radius     is LARGER than the drawn feather. A 5-year-old who flies at a
//                  feather and feels like they got it, got it. There is no such
//                  thing as a near-miss they would dispute.
//   COLLIDE radius is SMALLER than the drawn obstacle. You have to genuinely fly
//                  into a pyramid to lose feathers, not merely graze its edge.
//
// asteroid-run/fairness.js exists for exactly this reason; this is the same
// principle tuned softer, for a younger player and a game with no death.

// TUNABLE — multipliers on the drawn radius of each thing.
// EAT_FORGIVENESS must stay above 1 and COLLIDE_FORGIVENESS below it; a test
// pins that, because getting these the wrong way round would be invisible in
// code review and obvious to a furious child.
export const EAT_FORGIVENESS = 1.6;
export const COLLIDE_FORGIVENESS = 0.7;

// Both radii scale with the serpent's girth — a fat serpent has a bigger mouth
// AND a bigger body to hit things with. That is fair in both directions.
//
// check() returns what happened this frame: which items were eaten, and whether
// an obstacle was struck. It does not mutate anything — game.js applies the
// consequences to plume.js and field.js.
export function check({ head, items, girth }) {
  throw new Error('not implemented');
}
