// creatures.js — the art for every creature and the diver, as DATA. PURE:
// imports nothing, touches no browser global. sprites.js interprets it into
// the atlas; the tests check it from Node.
//
// From the Claude Design art direction (§05): every creature is an ordered
// list of two primitives drawn additively, plus optional per-op animation
// across F frames built once at load.
//   e = soft ellipse { k:'e', x, y, rx, ry, c, a }
//   b = soft blob    { k:'b', x, y, r,      c, a }
// Coordinates are offsets from the centre of a CELL-px atlas cell. An op's
// `an: { p, amp, ph }` animates property p as base + amp·sin(2π(f/F + ph)).
// The table below was transcribed from the export by script, not by hand;
// each creature's comment is the designer's own one-line read of it.
//
// The additive rules this art obeys (the export's §00): there are no dark
// shapes, only dim ones; mass reads as a dim body plus brighter rim beads;
// brightness, not hue, carries the role at on-screen size (shy ~0.3, ambient
// 0.5–0.9, bumper 0.3 body / 0.45 beads, rare = one saturated accent found
// nowhere else in its zone). The diver's body is bumper-grade on purpose:
// THE FISH DOES NOT GLOW, ONLY THE BULB DOES — a self-lit fish inside its own
// light clips to white and dissolves. Its dorsal rim (0.55) and eye (0.95)
// are the floor that keeps it visible even at the bottom of a brownout.

export const CELL = 128;       // atlas cell edge, px
export const MASK_SOLID = 40;  // sprites.js's clip disc: opaque to here…
export const MASK_ZERO = 56;   // …and fully transparent from here (8px clear margin)
export const F = 3;            // animation frames per creature, cycled at 4fps

export function frameId(id, f) {
  return `${id}/${f}`;
}

// The ops for one frame, animation applied and alpha clamped. Returns new
// objects; the table is never mutated.
export function opsAt(ops, frame) {
  return ops.map((o) => {
    const out = { ...o };
    delete out.an;
    if (o.an) out[o.an.p] = o[o.an.p] + o.an.amp * Math.sin(2 * Math.PI * (frame / F + (o.an.ph || 0)));
    out.a = Math.max(0, Math.min(1, out.a ?? 1));
    return out;
  });
}

// How far from the cell centre an op can paint (conservative for ellipses).
export function extent(o) {
  return Math.hypot(o.x, o.y) + (o.k === 'b' ? o.r : Math.max(o.rx, o.ry));
}

export const CREATURES = [
  // ---- Zone 0 · Sunlit Shallows ----
  // Spindle with two bubbles rising off its back.
  { id: 'bubblefish', zone: 0, kind: 'drifter', rare: false, ops: [
    { k: 'e', x: -19, y: 0, rx: 9, ry: 11, c: '#2f9fa8', a: 0.55 },
    { k: 'e', x: 0, y: 0, rx: 21, ry: 12, c: '#8df0e6', a: 1 },
    { k: 'e', x: -3, y: -5, rx: 11, ry: 4, c: '#d9fff8', a: 0.7 },
    { k: 'b', x: 11, y: -2, r: 2.6, c: '#ffffff', a: 1 },
    { k: 'b', x: 8, y: -20, r: 4, c: '#c9fff5', a: 0.5, an: { p: 'y', amp: -5 } },
    { k: 'b', x: 15, y: -28, r: 3, c: '#c9fff5', a: 0.35, an: { p: 'y', amp: -5, ph: 0.33 } },
  ] },
  // A sliver. Nose-bright, body barely there — gone before you focus.
  { id: 'glint', zone: 0, kind: 'shy', rare: false, ops: [
    { k: 'e', x: 0, y: 0, rx: 25, ry: 6, c: '#dff3ff', a: 0.5 },
    { k: 'b', x: 19, y: 0, r: 3.5, c: '#ffffff', a: 0.9, an: { p: 'a', amp: 0.25 } },
    { k: 'b', x: -20, y: 0, r: 3, c: '#bfe4ff', a: 0.3 },
  ] },
  // Dim dome, five rim beads. Big and slow — you bump it, it does not care.
  { id: 'old-turtle', zone: 0, kind: 'bumper', rare: false, ops: [
    { k: 'e', x: 0, y: 0, rx: 29, ry: 19, c: '#2c8f86', a: 0.32 },
    { k: 'b', x: -24, y: -4, r: 5, c: '#7fd8cc', a: 0.45 },
    { k: 'b', x: -9, y: -15, r: 5, c: '#7fd8cc', a: 0.45 },
    { k: 'b', x: 9, y: -15, r: 5, c: '#7fd8cc', a: 0.45 },
    { k: 'b', x: 24, y: -3, r: 5, c: '#7fd8cc', a: 0.45 },
    { k: 'b', x: 0, y: 16, r: 5, c: '#7fd8cc', a: 0.4 },
    { k: 'b', x: 28, y: 7, r: 5, c: '#8fe6d8', a: 0.5, an: { p: 'x', amp: 2 } },
  ] },
  // A gold disc with six blunt rays. Only warm thing in a cool zone.
  { id: 'sunwheel', zone: 0, kind: 'drifter', rare: true, ops: [
    { k: 'b', x: 0, y: 0, r: 30, c: '#ffd47a', a: 0.85, an: { p: 'r', amp: 2 } },
    { k: 'b', x: 0, y: 0, r: 13, c: '#fff4d6', a: 1 },
    { k: 'b', x: 0, y: -31, r: 5.5, c: '#ffc24d', a: 0.8, an: { p: 'a', amp: 0.2 } },
    { k: 'b', x: 27, y: -16, r: 5.5, c: '#ffc24d', a: 0.8, an: { p: 'a', amp: 0.2, ph: 0.17 } },
    { k: 'b', x: 27, y: 16, r: 5.5, c: '#ffc24d', a: 0.8, an: { p: 'a', amp: 0.2, ph: 0.33 } },
    { k: 'b', x: 0, y: 31, r: 5.5, c: '#ffc24d', a: 0.8, an: { p: 'a', amp: 0.2, ph: 0.5 } },
    { k: 'b', x: -27, y: 16, r: 5.5, c: '#ffc24d', a: 0.8, an: { p: 'a', amp: 0.2, ph: 0.67 } },
    { k: 'b', x: -27, y: -16, r: 5.5, c: '#ffc24d', a: 0.8, an: { p: 'a', amp: 0.2, ph: 0.83 } },
  ] },
  // ---- Zone 1 · The Blue ----
  // Small delta with a forked tail. Reads as "a fish" at any size.
  { id: 'kitefish', zone: 1, kind: 'drifter', rare: false, ops: [
    { k: 'e', x: 2, y: 0, rx: 19, ry: 8, c: '#5aa7f2', a: 0.85 },
    { k: 'e', x: -16, y: -6, rx: 8, ry: 5, c: '#2f6fd0', a: 0.5, an: { p: 'y', amp: -2 } },
    { k: 'e', x: -16, y: 6, rx: 8, ry: 5, c: '#2f6fd0', a: 0.5, an: { p: 'y', amp: 2 } },
    { k: 'b', x: 11, y: -2, r: 2.4, c: '#eaf4ff', a: 1 },
  ] },
  // Pale bell, three trailing beads. Alpha 0.35 — half water already.
  { id: 'ghost-squid', zone: 1, kind: 'shy', rare: false, ops: [
    { k: 'e', x: 0, y: -6, rx: 16, ry: 15, c: '#9fc4ff', a: 0.33 },
    { k: 'e', x: 0, y: -13, rx: 10, ry: 6, c: '#cfe2ff', a: 0.3, an: { p: 'ry', amp: 2 } },
    { k: 'b', x: -9, y: 14, r: 4, c: '#b8d4ff', a: 0.3, an: { p: 'y', amp: 3 } },
    { k: 'b', x: 0, y: 18, r: 4, c: '#b8d4ff', a: 0.3, an: { p: 'y', amp: 3, ph: 0.33 } },
    { k: 'b', x: 9, y: 14, r: 4, c: '#b8d4ff', a: 0.3, an: { p: 'y', amp: 3, ph: 0.67 } },
  ] },
  // Very wide, very dim, bright wingtips. Fills a third of the screen.
  { id: 'big-manta', zone: 1, kind: 'bumper', rare: false, ops: [
    { k: 'e', x: 0, y: 0, rx: 32, ry: 11, c: '#2a63b8', a: 0.3 },
    { k: 'b', x: -30, y: -2, r: 6, c: '#7fb2ff', a: 0.45, an: { p: 'y', amp: -4 } },
    { k: 'b', x: 30, y: -2, r: 6, c: '#7fb2ff', a: 0.45, an: { p: 'y', amp: -4 } },
    { k: 'b', x: 0, y: -9, r: 6, c: '#6aa4f5', a: 0.35 },
    { k: 'e', x: -28, y: 6, rx: 11, ry: 3, c: '#2a63b8', a: 0.28 },
  ] },
  // Ribbon with three beads travelling head to tail. Motion is the tell.
  { id: 'sparkeel', zone: 1, kind: 'drifter', rare: true, ops: [
    { k: 'e', x: 0, y: 0, rx: 30, ry: 5, c: '#3f86e0', a: 0.65 },
    { k: 'b', x: -14, y: 0, r: 4.5, c: '#fff6a8', a: 0.95, an: { p: 'x', amp: 9 } },
    { k: 'b', x: 0, y: 0, r: 4.5, c: '#fff6a8', a: 0.95, an: { p: 'x', amp: 9, ph: 0.33 } },
    { k: 'b', x: 14, y: 0, r: 4.5, c: '#fff6a8', a: 0.95, an: { p: 'x', amp: 9, ph: 0.67 } },
  ] },
  // ---- Zone 2 · The Twilight ----
  // Violet bell with a warm bead inside it. The zone in one sprite.
  { id: 'lantern-jelly', zone: 2, kind: 'drifter', rare: false, ops: [
    { k: 'e', x: 0, y: 2, rx: 18, ry: 14, c: '#6f63d8', a: 0.45, an: { p: 'ry', amp: 2 } },
    { k: 'e', x: 0, y: -6, rx: 12, ry: 7, c: '#a99cff', a: 0.4 },
    { k: 'b', x: 0, y: -2, r: 8, c: '#ffdca1', a: 0.9, an: { p: 'r', amp: 1.5 } },
    { k: 'b', x: -7, y: 17, r: 3.5, c: '#8f84f0', a: 0.32, an: { p: 'y', amp: 3 } },
    { k: 'b', x: 0, y: 21, r: 3.5, c: '#8f84f0', a: 0.32, an: { p: 'y', amp: 3, ph: 0.33 } },
    { k: 'b', x: 7, y: 17, r: 3.5, c: '#8f84f0', a: 0.32, an: { p: 'y', amp: 3, ph: 0.67 } },
  ] },
  // Almost nothing plus one blinking eye-glint. Flees the beam.
  { id: 'shy-shadow', zone: 2, kind: 'shy', rare: false, ops: [
    { k: 'e', x: 0, y: 0, rx: 21, ry: 9, c: '#4a41a0', a: 0.28 },
    { k: 'e', x: -18, y: 0, rx: 8, ry: 7, c: '#4a41a0', a: 0.2 },
    { k: 'b', x: 12, y: -2, r: 2.8, c: '#cfd6ff', a: 0.75, an: { p: 'a', amp: 0.45 } },
  ] },
  // Round dim mass ringed with eight spike beads. Unmissable, unhurried.
  { id: 'puffball', zone: 2, kind: 'bumper', rare: false, ops: [
    { k: 'e', x: 0, y: 0, rx: 25, ry: 23, c: '#5a4bb5', a: 0.3, an: { p: 'rx', amp: 1.5 } },
    { k: 'b', x: 0, y: -28, r: 4.5, c: '#8f7fe8', a: 0.45 },
    { k: 'b', x: 20, y: -20, r: 4.5, c: '#8f7fe8', a: 0.45 },
    { k: 'b', x: 28, y: 0, r: 4.5, c: '#8f7fe8', a: 0.45 },
    { k: 'b', x: 20, y: 20, r: 4.5, c: '#8f7fe8', a: 0.45 },
    { k: 'b', x: 0, y: 28, r: 4.5, c: '#8f7fe8', a: 0.45 },
    { k: 'b', x: -20, y: 20, r: 4.5, c: '#8f7fe8', a: 0.45 },
    { k: 'b', x: -28, y: 0, r: 4.5, c: '#8f7fe8', a: 0.45 },
    { k: 'b', x: -20, y: -20, r: 4.5, c: '#8f7fe8', a: 0.45 },
  ] },
  // Bell wearing a five-bead crown that pulses. White is unique here.
  { id: 'star-jelly', zone: 2, kind: 'drifter', rare: true, ops: [
    { k: 'e', x: 0, y: 3, rx: 17, ry: 13, c: '#8f7bff', a: 0.5 },
    { k: 'b', x: 0, y: 0, r: 7, c: '#e6ddff', a: 0.8 },
    { k: 'b', x: 0, y: -21, r: 4.5, c: '#ffffff', a: 0.9, an: { p: 'a', amp: 0.25 } },
    { k: 'b', x: 17, y: -13, r: 4.5, c: '#ffffff', a: 0.9, an: { p: 'a', amp: 0.25, ph: 0.2 } },
    { k: 'b', x: 21, y: 4, r: 4.5, c: '#ffffff', a: 0.9, an: { p: 'a', amp: 0.25, ph: 0.4 } },
    { k: 'b', x: -17, y: -13, r: 4.5, c: '#ffffff', a: 0.9, an: { p: 'a', amp: 0.25, ph: 0.6 } },
    { k: 'b', x: -21, y: 4, r: 4.5, c: '#ffffff', a: 0.9, an: { p: 'a', amp: 0.25, ph: 0.8 } },
  ] },
  // ---- Zone 3 · The Midnight ----
  // Dark bell, two ice-blue tip beads. You see the beads first, always.
  { id: 'bead-squid', zone: 3, kind: 'drifter', rare: false, ops: [
    { k: 'e', x: 0, y: -6, rx: 15, ry: 14, c: '#3b2f7a', a: 0.42 },
    { k: 'b', x: -8, y: 15, r: 4.5, c: '#7fe6ff', a: 0.95, an: { p: 'y', amp: 3 } },
    { k: 'b', x: 8, y: 15, r: 4.5, c: '#7fe6ff', a: 0.95, an: { p: 'y', amp: 3, ph: 0.5 } },
  ] },
  // One eye-glint and a suggestion. Backs out of the beam edge.
  { id: 'lurker', zone: 3, kind: 'shy', rare: false, ops: [
    { k: 'e', x: 0, y: 0, rx: 24, ry: 9, c: '#241d4a', a: 0.26 },
    { k: 'b', x: 14, y: -1, r: 3, c: '#9fd0ff', a: 0.6, an: { p: 'a', amp: 0.3 } },
  ] },
  // Droopy sagging mass with a heavy nose. Comically slow.
  { id: 'sleeper', zone: 3, kind: 'bumper', rare: false, ops: [
    { k: 'e', x: -2, y: 2, rx: 27, ry: 17, c: '#332a58', a: 0.3 },
    { k: 'e', x: 14, y: 10, rx: 11, ry: 6, c: '#3d3266', a: 0.3, an: { p: 'y', amp: 1.5 } },
    { k: 'b', x: -22, y: -2, r: 5, c: '#6b5fa8', a: 0.35 },
    { k: 'b', x: 0, y: -13, r: 5, c: '#6b5fa8', a: 0.35 },
    { k: 'b', x: 21, y: -3, r: 5, c: '#6b5fa8', a: 0.35 },
    { k: 'b', x: 20, y: 7, r: 2.6, c: '#cfd6ff', a: 0.5 },
  ] },
  // The friendly angler. Dark body, one huge warm lure — a second lamp.
  { id: 'big-lantern', zone: 3, kind: 'drifter', rare: true, ops: [
    { k: 'e', x: -4, y: 3, rx: 22, ry: 15, c: '#2e1f4e', a: 0.45 },
    { k: 'e', x: 12, y: -13, rx: 10, ry: 2.5, c: '#6a5aa8', a: 0.4 },
    { k: 'b', x: 23, y: -19, r: 9, c: '#fff0c4', a: 0.95, an: { p: 'r', amp: 1.6 } },
    { k: 'b', x: 23, y: -19, r: 4, c: '#ffffff', a: 1 },
    { k: 'b', x: 4, y: -1, r: 3, c: '#cfe6ff', a: 0.7 },
  ] },
  // ---- Zone 4 · The Trench ----
  // The only vertical creature in the game. Stalk with a swaying plume.
  { id: 'vent-worm', zone: 4, kind: 'drifter', rare: false, ops: [
    { k: 'e', x: 0, y: 6, rx: 7, ry: 24, c: '#c2521f', a: 0.5 },
    { k: 'b', x: 0, y: -19, r: 8, c: '#ff9b45', a: 0.85, an: { p: 'x', amp: 3 } },
    { k: 'b', x: 0, y: -19, r: 4, c: '#ffe0b0', a: 0.9, an: { p: 'x', amp: 3 } },
  ] },
  // Two soft overlapping clouds and one fading ember. Drifts away from light.
  { id: 'ashcloud', zone: 4, kind: 'shy', rare: false, ops: [
    { k: 'e', x: 3, y: 2, rx: 22, ry: 15, c: '#5c2a18', a: 0.26 },
    { k: 'e', x: -11, y: -8, rx: 13, ry: 10, c: '#6b3520', a: 0.22, an: { p: 'x', amp: -2 } },
    { k: 'b', x: 2, y: 4, r: 6, c: '#ff7a33', a: 0.6, an: { p: 'a', amp: 0.3 } },
  ] },
  // Low wide dome, two claw beads sticking out sideways. Solid.
  { id: 'boulder-crab', zone: 4, kind: 'bumper', rare: false, ops: [
    { k: 'e', x: 0, y: 3, rx: 28, ry: 15, c: '#8a3a19', a: 0.32 },
    { k: 'b', x: -23, y: 0, r: 5.5, c: '#d2703a', a: 0.45 },
    { k: 'b', x: 0, y: -11, r: 5.5, c: '#d2703a', a: 0.45 },
    { k: 'b', x: 23, y: 0, r: 5.5, c: '#d2703a', a: 0.45 },
    { k: 'b', x: -29, y: 9, r: 6, c: '#e0824a', a: 0.5, an: { p: 'y', amp: -2 } },
    { k: 'b', x: 29, y: 9, r: 6, c: '#e0824a', a: 0.5, an: { p: 'y', amp: -2, ph: 0.5 } },
  ] },
  // Big warm mantle, four arm beads walking. The brightest thing down here.
  { id: 'ember-octopus', zone: 4, kind: 'drifter', rare: true, ops: [
    { k: 'e', x: 0, y: -4, rx: 24, ry: 20, c: '#ff7a3c', a: 0.55, an: { p: 'ry', amp: 1.5 } },
    { k: 'b', x: 0, y: -7, r: 11, c: '#ffd9a8', a: 0.9 },
    { k: 'b', x: -17, y: 15, r: 6, c: '#ff8f4f', a: 0.7, an: { p: 'y', amp: 3 } },
    { k: 'b', x: -6, y: 21, r: 5, c: '#ff8f4f', a: 0.7, an: { p: 'y', amp: 3, ph: 0.25 } },
    { k: 'b', x: 6, y: 21, r: 5, c: '#ff8f4f', a: 0.7, an: { p: 'y', amp: 3, ph: 0.5 } },
    { k: 'b', x: 17, y: 15, r: 6, c: '#ff8f4f', a: 0.7, an: { p: 'y', amp: 3, ph: 0.75 } },
  ] },
];

export const DIVER_OPS = [
  { k: 'e', x: -30, y: 0, rx: 14, ry: 18, c: '#3f6f8f', a: 0.3, an: { p: 'ry', amp: 4 } },
  { k: 'e', x: -6, y: 0, rx: 30, ry: 18, c: '#4a7fa0', a: 0.26 },
  { k: 'e', x: -6, y: 0, rx: 23, ry: 12, c: '#7fb0cc', a: 0.42 },
  { k: 'e', x: -9, y: -8, rx: 16, ry: 3.5, c: '#cfe9f7', a: 0.55 },
  { k: 'e', x: 2, y: 7, rx: 14, ry: 3, c: '#ffcf96', a: 0.32 },
  { k: 'b', x: 8, y: -3, r: 2.6, c: '#ffffff', a: 0.95 },
  { k: 'e', x: 20, y: -8, rx: 12, ry: 2.2, c: '#9fc3d6', a: 0.35 },
  { k: 'b', x: 31, y: -12, r: 13, c: '#ffd89a', a: 0.9 },
  { k: 'b', x: 31, y: -12, r: 6, c: '#fff6e2', a: 1 },
];
