// feathers.js — Canvas 2D drawing of the feathers, the obstacles and the ambient
// scenery. Playtested, not unit-tested.
//
// Another art-pass landing site (spec §8). What Claude Design owes this file:
//   - a feather, in the four act tints (green, jade, ember, gold)
//   - the obstacle set: pyramid, ash plume, and their silhouettes at distance
//   - the ambient scenery: treetops, macaw, cloud bank, ember, Venus
//
// Everything here is drawn through camera.project(), so each thing needs to read
// clearly at a wide range of scales — a pyramid is a few pixels when it spawns at
// the horizon and fills a third of the screen as you pass it. Silhouette matters
// far more than detail.
//
// The eaten-feather flourish lives here too: a feather that is collected should
// visibly travel UP the body rather than simply vanishing, so the child sees
// where their growth came from (spec §4).

export function makeFeathers() {
  throw new Error('not implemented — awaiting the Claude Design art pass');
}

// The scatter when you clip an obstacle: a burst of loose plumes torn off and
// left tumbling in the wind behind you (spec §4). This is the game's only
// punishment and it needs to be beautiful, not harsh — closer to a puff of
// dandelion than an explosion.
export function makeScatter() {
  throw new Error('not implemented — awaiting the Claude Design art pass');
}
