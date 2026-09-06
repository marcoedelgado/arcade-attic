// hud.js — canvas-drawn HUD and full-screen overlays. No game state; every
// call takes exactly what it draws.

// oklch() literals as canvas fillStyle — see the browser-floor note in render.js.

const FONT = '600 15px ui-monospace, "SF Mono", "JetBrains Mono", monospace';
const LABEL = '600 10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const TITLE = '700 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const SUB = '500 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const NAME_FONT = '700 21px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

// rounded to tenths first so the displayed seconds never disagree with the
// displayed minutes on the 59.95-60.0 boundary
function fmt(ms) {
  const tenths = Math.round(ms / 100);
  const m = Math.floor(tenths / 600);
  const s = (tenths % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function hexPip(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawHud(ctx, vp, hud) {
  const hue = hud.hue ?? 250;
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  ctx.font = LABEL;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('TIME', 16, 12);
  ctx.font = FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(fmt(hud.timeMs), 16, 25);

  for (let i = 0; i < 3; i++) {
    const cx = vp.width - 20 - i * 24, cy = 22;
    ctx.globalAlpha = i < hud.shields ? 1 : 0.2;
    hexPip(ctx, cx, cy, 8);
    ctx.fillStyle = i < hud.shields ? `oklch(0.75 0.13 ${hue})` : 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const barW = Math.min(240, vp.width * 0.42);
  const bx = vp.width / 2 - barW / 2, by = 18;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(bx, by, barW, 3);
  ctx.fillStyle = `oklch(0.75 0.13 ${hue})`;
  ctx.fillRect(bx, by, barW * hud.sectorProgress, 3);

  if (hud.bannerMs > 0) {
    const enter = Math.min(1, (1 - hud.bannerMs / 1500) * 6);
    const fade = Math.min(1, hud.bannerMs / 400);
    const alpha = Math.min(enter, fade);
    const yOff = (1 - enter) * -14;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = LABEL;
    ctx.fillStyle = `oklch(0.75 0.13 ${hue})`;
    ctx.fillText(`SECTOR ${String((hud.sectorIndex ?? 0) + 1).padStart(2, '0')}`, vp.width / 2, 46 + yOff);
    ctx.font = NAME_FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fillText(hud.sectorName, vp.width / 2, 60 + yOff);
    const tw = Math.min(ctx.measureText(hud.sectorName).width, 160);
    ctx.fillStyle = `oklch(0.75 0.13 ${hue})`;
    ctx.fillRect(vp.width / 2 - tw / 2, 90 + yOff, tw, 2);
    ctx.restore();
  }
  ctx.restore();
}

export function drawOverlay(ctx, vp, overlay) {
  const hue = overlay.hue ?? 250;
  ctx.save();
  ctx.fillStyle = 'rgba(5,3,15,0.78)';
  ctx.fillRect(0, 0, vp.width, vp.height);
  ctx.textAlign = 'center';

  if (overlay.kind === 'title') {
    ctx.font = TITLE;
    ctx.fillStyle = '#fff';
    ctx.fillText('ASTEROID RUN', vp.width / 2, vp.height * 0.34);
    ctx.fillStyle = `oklch(0.75 0.13 ${hue})`;
    ctx.fillRect(vp.width / 2 - 40, vp.height * 0.34 + 52, 80, 3);
    ctx.font = SUB;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('tap, click or press any key to launch', vp.width / 2, vp.height * 0.34 + 80);
    if (overlay.bestMs) {
      ctx.font = LABEL;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`BEST RUN  ${fmt(overlay.bestMs)}`, vp.width / 2, vp.height * 0.34 + 112);
    }
  } else {
    ctx.font = LABEL;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('RUN ENDED', vp.width / 2, vp.height * 0.3);
    ctx.font = TITLE;
    ctx.fillStyle = '#fff';
    ctx.fillText(fmt(overlay.runMs), vp.width / 2, vp.height * 0.3 + 26);
    ctx.fillStyle = `oklch(0.75 0.13 ${hue})`;
    ctx.fillRect(vp.width / 2 - 40, vp.height * 0.3 + 80, 80, 3);
    ctx.font = SUB;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const isBest = overlay.runMs >= overlay.bestMs;
    ctx.fillText(isBest ? 'new best!' : `best  ${fmt(overlay.bestMs)}`, vp.width / 2, vp.height * 0.3 + 96);
    ctx.font = LABEL;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('tap, click or press any key to fly again', vp.width / 2, vp.height * 0.3 + 130);
  }
  ctx.restore();
}
