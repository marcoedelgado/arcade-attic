// mascots.js — the Pocket Pairs mascot roster and per-difficulty subsets.
// Pure data + one lookup helper. No DOM. All designs are original.

export const MASCOTS = [
  { id: 'spark',   name: 'Sparkrat' },     // spark rodent
  { id: 'ember',   name: 'Emberling' },    // flame lizard
  { id: 'sprout',  name: 'Sproutseed' },   // leaf-seed critter
  { id: 'puddle',  name: 'Puddleshell' },  // blue turtle
  { id: 'sheriff', name: 'Sheriff Sam' },  // cowboy pull-string toy
  { id: 'ranger',  name: 'Star Ranger' },  // space-ranger action figure
  { id: 'piggy',   name: 'Coin Piggy' },   // piggy bank
  { id: 'blinky',  name: 'Blinky' },       // one-eyed green fuzzball
  { id: 'bigfoot', name: 'Big Blue' },     // large blue furry monster
  { id: 'lurk',    name: 'Lurkle' },       // purple closet lurker
  { id: 'blaze',   name: 'Blaze Rod' },    // flame-decal hot rod
  { id: 'stomper', name: 'Stomper' },      // monster truck
];

const ALL = MASCOTS.map((m) => m.id);

export const SUBSETS = {
  6:  ['spark', 'ember', 'sprout', 'sheriff', 'blinky', 'blaze'],
  8:  ['spark', 'ember', 'sprout', 'sheriff', 'blinky', 'blaze', 'puddle', 'bigfoot'],
  12: ALL,
};

export function mascotsFor(pairs) {
  const set = SUBSETS[pairs];
  if (!set) throw new Error(`no mascot subset for pairs=${pairs}`);
  return [...set];
}
