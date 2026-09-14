// hud.js — Canvas 2D overlay: the climb indicator and the arrival sequence.
// Playtested, not unit-tested.
//
// There is NO SCORE HERE, and that is the point. The serpent is the score
// (spec §3) — a 5-year-old who cannot read must be able to see their whole
// progress by looking at the creature they are flying. The only HUD element is a
// wordless sense of how far up the sky you have come.
//
// What Claude Design owes this file: the climb indicator, and the arrival —
// the blaze when you reach the morning star at full plume, and the quieter
// version when you do not (spec §2).

export function drawClimb(_ctx, _metres, _vp) {
  throw new Error('not implemented — awaiting the Claude Design art pass');
}

// The arrival. `blazed` is true when plume was at maximum on reaching the summit.
// Both endings are endings — the quiet one must still feel like an arrival, with
// a visible reason to fly again rather than a reprimand.
export function drawArrival(_ctx, _blazed, _vp) {
  throw new Error('not implemented — awaiting the Claude Design art pass');
}
