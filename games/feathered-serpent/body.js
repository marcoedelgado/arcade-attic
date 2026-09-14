// body.js — pure. The serpent's body: a ring buffer of where the head has been.
//
// The trick that makes this game cheap (spec §3): a segment is not simulated, it
// is simply an OLDER HEAD POSITION. Push the head's world position every frame;
// to draw segment n, read the position n arc-lengths back and hand it to
// camera.project(). No per-segment 3D maths at all.
//
// WHICH WAY THE BODY GOES. The camera sits behind the serpent and the serpent
// climbs away from it, so the HEAD carries the largest z and every older segment
// is NEARER the camera — and therefore LARGER. The body does not taper off to the
// horizon; it sweeps toward the viewer and out of the frame. Composition follows
// from that: the head reads clearly in the middle distance, and a fully-plumed
// serpent's body dominates the edges of the screen. Getting this backwards draws
// a serpent flying at you tail-first.
//
// The consequence worth having: bank hard and the body lags, then whips. Every
// turn produces motion the child caused but never had to think about.
//
// Spacing is by ARC LENGTH, not frame count. If it were by frame count the body
// would concertina whenever the head slowed — bunching up when you ease off and
// stretching when you dive. Arc-length spacing keeps the serpent the same
// creature at every speed.

// TUNABLE — world distance between segments, and the hard cap on segment count.
// The cap is a tuning constant rather than an emergent number so a fully-plumed
// serpent on a phone has a known worst case (spec §9).
export const SEGMENT_SPACING = 14;
export const MAX_SEGMENTS = 64;

// makeBody() returns a live instance. game.js creates one per run and pushes the
// head position into it every frame.
//
//   push(x, y, z)        record where the head is now
//   sample(count)        the newest `count` segment positions, head-first,
//                        spaced SEGMENT_SPACING apart by arc length
//   reset(x, y, z)       collapse the whole body onto one point (run start)
//
// sample() must never read past the history it actually has: early in a run the
// body is genuinely short, and it should return what exists rather than
// extrapolating or repeating the oldest point.
export function makeBody({ spacing = SEGMENT_SPACING, max = MAX_SEGMENTS } = {}) {
  throw new Error('not implemented');
}
