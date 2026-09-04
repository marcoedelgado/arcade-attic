// scatter.js — pure. Turns a list of toppings into placed pieces on the waffle
// face. Deterministic: the same toppings always produce the same layout, so a
// piece holds still across the many re-paints a syrup pour triggers. No DOM —
// game.js maps the returned pieces to spans.

// How each topping scatters: how many pieces, and how big — so a handful of
// strawberries reads differently from two rashers of bacon.
const SPREAD = {
  strawberry: { count: 3, size: 15 },
  banana:     { count: 3, size: 15 },
  chocolate:  { count: 3, size: 14 },
  nuts:       { count: 4, size: 12 },
  cream:      { count: 1, size: 24 },
  sprinkles:  { count: 6, size: 10 },
  cherry:     { count: 1, size: 18 },
  bacon:      { count: 2, size: 21 },
};
const DEFAULT_SPREAD = { count: 3, size: 15 };

// Deterministic 0..1 from a string.
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

// Place piece `i` of `total` across the whole waffle face. A phyllotaxis spiral
// (golden angle + sqrt radius) spreads points evenly over a disc no matter the
// count; a per-key jitter keeps it organic.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
function pieceStyle(key, i, total, size) {
  const ang = i * GOLDEN_ANGLE + (hash01(`${key}a`) - 0.5) * 1.1;
  const rad = total <= 1
    ? hash01(`${key}r`) * 9
    : Math.sqrt((i + 0.5) / total) * 38 + (hash01(`${key}r`) - 0.5) * 7;
  const rot = (hash01(`${key}t`) - 0.5) * 46;
  return {
    left: `${(50 + Math.cos(ang) * rad).toFixed(1)}%`,
    top: `${(50 + Math.sin(ang) * rad).toFixed(1)}%`,
    transform: `translate(-50%, -50%) rotate(${rot.toFixed(1)}deg)`,
    fontSize: `${size}px`,
  };
}

// toppings: [{ id, emoji }]  ->  [{ id, emoji, left, top, transform, fontSize }]
export function scatter(toppings) {
  const pieces = [];
  for (const { id, emoji } of toppings) {
    const spread = SPREAD[id] ?? DEFAULT_SPREAD;
    for (let p = 0; p < spread.count; p++) {
      pieces.push({ id, emoji, size: spread.size, key: `${id}:${p}` });
    }
  }
  // Interleave so one topping doesn't fall in a single arc of the spiral. The
  // sort key is derived from the piece, not its input position, so the layout is
  // independent of the order toppings were added.
  pieces.sort((a, b) => hash01(a.key) - hash01(b.key));
  return pieces.map((pc, i) => {
    const { id, emoji } = pc;
    return { id, emoji, ...pieceStyle(pc.key, i, pieces.length, pc.size) };
  });
}
