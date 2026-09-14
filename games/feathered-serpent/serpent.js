// serpent.js — Canvas 2D drawing of the serpent. Playtested, not unit-tested
// (repo convention: pure logic is tested, drawing is looked at).
//
// THIS FILE IS THE ART PASS'S LANDING SITE. It is deliberately empty of opinion
// right now, because deciding the serpent's look in code and then art-directing
// backwards would waste the most expensive work in the project (spec §8).
//
// What the Claude Design pass owes this file: the serpent drawn at the five
// plume.js STAGES — bare, downy, plumed, brilliant, blazing — as shapes
// expressible with Path2D and canvas gradients. Anything needing CSS filters or
// a blend stack has to be caught during the design pass, not after (spec §9).
//
// How it will work once the art exists:
//   - body.sample(n) gives segment positions, head-first
//   - camera.project() turns each into {sx, sy, scale}
//   - draw back-to-front so the head lands on top
//   - plume.geometryAt() supplies girth, feather length and iridescence, which
//     interpolate continuously between the five drawn stages

export function makeSerpent() {
  throw new Error('not implemented — awaiting the Claude Design art pass');
}

// Draw the serpent at rest, at a given plume, for the menu's "your best" panel.
// Separate from the in-flight draw because the menu has no camera and no body
// history — just a static S-curve at a fixed size.
export function drawBestSerpent(_ctx, _plume, _size) {
  throw new Error('not implemented — awaiting the Claude Design art pass');
}
