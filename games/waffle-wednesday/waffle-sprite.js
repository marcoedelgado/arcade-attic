// waffle-sprite.js — the doneness frames as 12x12 indexed pixel art.
// One pixel map, four palettes: recolour only, never redraw the shape, or the
// waffle appears to wobble as it toasts. DOM-only (canvas -> data URL), like
// sprites.js — not exercised by node --test beyond the data-shape check.

// index 0 transparent · 1 base · 2 pocket shade · 3 edge
const ROWS = [
  '333333333333', '311111111113', '312212212213', '312212212213',
  '311111111113', '312212212213', '312212212213', '311111111113',
  '312212212213', '312212212213', '311111111113', '333333333333',
];
const W = 12;
const H = 12;

export const WAFFLE_FRAMES = [
  { id: 'pale',     palette: [null, '#f0dfbe', '#dcc79c', '#c9b389'] },
  { id: 'just',     palette: [null, '#e9cb95', '#d0ad72', '#b08f56'] },
  { id: 'golden',   palette: [null, '#d9a55c', '#bd8640', '#96632a'] },
  { id: 'charcoal', palette: [null, '#4a3226', '#2b1c14', '#16100c'] },
];

const cache = new Map();

function render(palette) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);

  const rgb = palette.map((hex) => hex && [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);

  const flat = ROWS.join('');
  for (let i = 0; i < flat.length; i++) {
    const c = rgb[parseInt(flat[i], 16)];
    img.data[i * 4] = c ? c[0] : 0;
    img.data[i * 4 + 1] = c ? c[1] : 0;
    img.data[i * 4 + 2] = c ? c[2] : 0;
    img.data[i * 4 + 3] = c ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export function waffleFrameUrl(id) {
  if (cache.has(id)) return cache.get(id);
  const frame = WAFFLE_FRAMES.find((f) => f.id === id) ?? WAFFLE_FRAMES[0];
  const url = render(frame.palette);
  cache.set(id, url);
  return url;
}

// Map a 0–100 doneness value to a frame id. Boundaries roughly track the
// doneness vocab in customers.json (pale / just golden / golden / charred).
export function waffleFrameFor(value) {
  if (value < 34) return 'pale';
  if (value < 48) return 'just';
  if (value < 85) return 'golden';
  return 'charcoal';
}
