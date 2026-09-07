// mascots.js — the Pocket Pairs mascot roster (16, four families of four) and
// the random per-game selection helper. Pure data + one function. No DOM.

export const MASCOTS = [
  { id: 'spark',     name: 'Sparkrat',     family: 'Elemental Pals' },
  { id: 'ember',     name: 'Emberling',    family: 'Elemental Pals' },
  { id: 'sprout',    name: 'Sproutseed',   family: 'Elemental Pals' },
  { id: 'puddle',    name: 'Puddleshell',  family: 'Elemental Pals' },
  { id: 'sheriff',   name: 'Sheriff Sam',  family: 'Toy-Line Heroes' },
  { id: 'ranger',    name: 'Star Ranger',  family: 'Toy-Line Heroes' },
  { id: 'piggy',     name: 'Coin Piggy',   family: 'Toy-Line Heroes' },
  { id: 'springpup', name: 'Spring Pup',   family: 'Toy-Line Heroes' },
  { id: 'blinky',    name: 'Blinky',       family: 'Tiny Helpers' },
  { id: 'bigfoot',   name: 'Big Blue',     family: 'Tiny Helpers' },
  { id: 'lurk',      name: 'Lurkle',       family: 'Tiny Helpers' },
  { id: 'tinker',    name: 'Tinker',       family: 'Tiny Helpers' },
  { id: 'blaze',     name: 'Blaze Rod',    family: 'Turbo Wheels' },
  { id: 'stomper',   name: 'Stomper',      family: 'Turbo Wheels' },
  { id: 'buggy',     name: 'Dune Skimmer', family: 'Turbo Wheels' },
  { id: 'rocket',    name: 'Rocket Rig',   family: 'Turbo Wheels' },
];

// Pick `count` distinct mascot ids at random from the full roster.
// Fisher–Yates on a copy, then the first `count`. `rng` is injectable for tests.
export function pickMascots(count, rng = Math.random) {
  const ids = MASCOTS.map((m) => m.id);
  if (!Number.isInteger(count)) {
    throw new Error(`pickMascots: count must be an integer, got ${count}`);
  }
  if (count < 1 || count > ids.length) {
    throw new Error(`pickMascots: count ${count} out of range 1..${ids.length}`);
  }
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}
