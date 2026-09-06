// hud.js — canvas-drawn HUD and the full-screen overlays. No game state; every
// call takes exactly what it draws.

const FONT = '600 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const BIG = '700 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

function fmt(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1).padStart(4, '0');
  return `${m}:${rem}`;
}

export function drawHud(ctx, vp, hud) {
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(fmt(hud.timeMs), 16, 14);

  // shields, top-right
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = i < hud.shields ? 1 : 0.25;
    ctx.beginPath();
    ctx.arc(vp.width - 20 - i * 22, 22, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#6fb3ff';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // sector banner (fades over bannerMs)
  if (hud.bannerMs > 0) {
    ctx.globalAlpha = Math.min(1, hud.bannerMs / 400);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(hud.sectorName, vp.width / 2, 22);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // sector progress bar, thin, top-centre
  const barW = Math.min(220, vp.width * 0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(vp.width / 2 - barW / 2, 46, barW, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(vp.width / 2 - barW / 2, 46, barW * hud.sectorProgress, 3);
  ctx.restore();
}

export function drawOverlay(ctx, vp, overlay) {
  ctx.save();
  ctx.fillStyle = 'rgba(5,3,15,0.72)';
  ctx.fillRect(0, 0, vp.width, vp.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = BIG;
  if (overlay.kind === 'title') {
    ctx.fillText('Asteroid Run', vp.width / 2, vp.height * 0.36);
    ctx.font = FONT;
    ctx.fillText('tap / press any key to launch', vp.width / 2, vp.height * 0.5);
    if (overlay.bestMs) ctx.fillText(`best  ${fmt(overlay.bestMs)}`, vp.width / 2, vp.height * 0.58);
  } else {
    ctx.fillText(fmt(overlay.runMs), vp.width / 2, vp.height * 0.36);
    ctx.font = FONT;
    ctx.fillText(`best  ${fmt(overlay.bestMs)}`, vp.width / 2, vp.height * 0.48);
    ctx.fillText('tap / press any key to fly again', vp.width / 2, vp.height * 0.56);
  }
  ctx.restore();
}
