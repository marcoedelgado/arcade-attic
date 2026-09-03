// sprites.js — turn CREW_SPRITES indexed pixel data into <img> elements.
// DOM-only; verified in the browser, not in node --test.
import { CREW_SPRITES } from './crew-sprites.js';

const urlCache = new Map();

export function spriteDataUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const sp = CREW_SPRITES[id];
  if (!sp) return null;

  const canvas = document.createElement('canvas');
  canvas.width = sp.w;
  canvas.height = sp.h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(sp.w, sp.h);

  const rgb = sp.palette.map((hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);

  for (let i = 0; i < sp.pixels.length; i++) {
    const [r, g, b] = rgb[parseInt(sp.pixels[i], 16)] ?? [0, 0, 0];
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const url = canvas.toDataURL('image/png');
  urlCache.set(id, url);
  return url;
}

export function crewSpriteEl(id, cls = 'ww-sprite') {
  const url = spriteDataUrl(id);
  if (!url) {
    const span = document.createElement('span');
    span.className = `${cls} ww-sprite-fallback`;
    span.textContent = '🧑';
    return span;
  }
  const el = document.createElement('img');
  el.className = cls;
  el.width = 48;
  el.height = 48;
  el.alt = id;
  el.src = url;
  return el;
}
