// sprites.js — turn PAIR_SPRITES indexed pixel data into <img> elements.
// DOM-only; verified in the browser, not in node --test.
import { PAIR_SPRITES } from './sprites-data.js';

const cache = new Map();

export function spriteDataUrl(id) {
  if (cache.has(id)) return cache.get(id);
  const sp = PAIR_SPRITES[id];
  if (!sp) return null;

  const canvas = document.createElement('canvas');
  canvas.width = sp.w;
  canvas.height = sp.h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(sp.w, sp.h);

  const rgb = sp.palette.map((hex) => hex && [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);

  for (let i = 0; i < sp.pixels.length; i++) {
    const c = rgb[parseInt(sp.pixels[i], 16)];
    img.data[i * 4] = c ? c[0] : 0;
    img.data[i * 4 + 1] = c ? c[1] : 0;
    img.data[i * 4 + 2] = c ? c[2] : 0;
    img.data[i * 4 + 3] = c ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);

  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  return url;
}

export function mascotImg(id, cls = 'pp-face') {
  const url = spriteDataUrl(id);
  const el = document.createElement('img');
  el.className = cls;
  el.width = 96;
  el.height = 96;
  el.alt = id;
  if (url) el.src = url;
  return el;
}
