// render.js — draws one frame. Pure drawing: camera, entities, palette, fx state.
// Obstacles are drawn far → near so nearer rocks overlap.
const DEFAULTS = {
  bg0: '#05030f', bg1: '#160f2e', nebula: 'rgba(94,58,140,0.18)',
  star: '#dfe8ff', rock: '#7d7486', rockLit: '#c9bfd6', rockDark: '#3a3444',
  ship: '#eef1ff', shipGlow: '#6fb3ff', streak: 'rgba(160,190,255,0.35)',
  debris: '#b8a9c9',
};

// oklch() as an addColorStop() argument throws on engines that can't parse it
// (unlike fillStyle, which silently ignores an unknown color). Probe once so the
// gradient builders below can fall back instead of killing the frame loop.
const OKLCH_OK = (() => {
  try {
    document.createElement('canvas').getContext('2d')
      .createLinearGradient(0, 0, 1, 1).addColorStop(0, 'oklch(0.5 0.1 250)');
    return true;
  } catch { return false; }
})();

export function readPalette() {
  try {
    const s = getComputedStyle(document.documentElement);
    const g = (k, d) => (s.getPropertyValue(k).trim() || d);
    return {
      bg0: g('--ar-bg0', DEFAULTS.bg0), bg1: g('--ar-bg1', DEFAULTS.bg1),
      nebula: g('--ar-nebula', DEFAULTS.nebula), star: g('--ar-star', DEFAULTS.star),
      rock: g('--ar-rock', DEFAULTS.rock), rockLit: g('--ar-rock-lit', DEFAULTS.rockLit),
      rockDark: g('--ar-rock-dark', DEFAULTS.rockDark), ship: g('--ar-ship', DEFAULTS.ship),
      shipGlow: g('--ar-ship-glow', DEFAULTS.shipGlow), streak: g('--ar-streak', DEFAULTS.streak),
      debris: g('--ar-debris', DEFAULTS.debris),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function rockPath(ctx, sx, sy, radius, seed, spinAngle) {
  const verts = 7 + Math.floor(seed * 3);
  ctx.beginPath();
  for (let i = 0; i < verts; i++) {
    const ang = spinAngle + (i / verts) * Math.PI * 2;
    const wob = 0.72 + 0.28 * ((Math.sin(seed * 100 + i * 7.13) + 1) / 2);
    const r = radius * wob;
    const px = sx + Math.cos(ang) * r;
    const py = sy + Math.sin(ang) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function hashRng(n) {
  const x = Math.sin(n * 999.7) * 43758.5453;
  return x - Math.floor(x);
}

// NOTE: render.js and hud.js use oklch() string literals as canvas fillStyle for
// every hue-tinted accent. fillStyle assignments silently no-op on old engines,
// keeping the previous style. Gradient addColorStop() calls throw on unknown colors,
// so drawPlanet() and drawShipHero() guard their oklch stops with OKLCH_OK and fall
// back to rgba/hex; these paths only run on pre-2023 engines that can't parse oklch().

// soft parallax planet, one per sector index — pure decoration, no gameplay effect
function drawPlanet(ctx, vp, seedIdx, hue) {
  const cx = vp.width * (0.15 + hashRng(seedIdx) * 0.7);
  const cy = vp.height * (0.06 + hashRng(seedIdx + 1) * 0.12);
  const r = Math.min(vp.width, vp.height) * (0.15 + hashRng(seedIdx + 2) * 0.09);
  const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, OKLCH_OK ? `oklch(0.42 0.06 ${hue})` : '#5a5269');
  grad.addColorStop(1, OKLCH_OK ? `oklch(0.13 0.03 ${hue})` : '#1c1824');
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rockPathAngular(ctx, sx, sy, radius, seed, spinAngle) {
  const verts = 5;
  ctx.beginPath();
  for (let i = 0; i < verts; i++) {
    const ang = spinAngle + (i / verts) * Math.PI * 2;
    const wob = 0.62 + 0.38 * ((Math.sin(seed * 140 + i * 11.3) + 1) / 2);
    const r = radius * wob;
    const px = sx + Math.cos(ang) * r;
    const py = sy + Math.sin(ang) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// classic jagged asteroid — rock fill, lit rim, dark outline
export function drawAsteroid(ctx, sx, sy, rad, seed, spin, p) {
  rockPath(ctx, sx, sy, rad, seed, spin);
  ctx.fillStyle = p.rock;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = p.rockLit;
  ctx.beginPath();
  ctx.arc(sx - rad * 0.4, sy - rad * 0.4, rad * 0.9, 0, Math.PI * 2);
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = p.rockDark;
  ctx.lineWidth = 1;
  rockPath(ctx, sx, sy, rad, seed, spin);
  ctx.stroke();
}

// space mine — metallic orb, radiating spikes, pulsing core
export function drawMine(ctx, sx, sy, rad, seed, spin, t) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(spin);
  const body = ctx.createRadialGradient(-rad * 0.3, -rad * 0.3, rad * 0.1, 0, 0, rad * 0.65);
  body.addColorStop(0, '#9aa3b5');
  body.addColorStop(1, '#363b48');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, 0, rad * 0.62, 0, Math.PI * 2); ctx.fill();
  const n = 8;
  ctx.fillStyle = '#565d6e';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x1 = Math.cos(a) * rad * 0.55, y1 = Math.sin(a) * rad * 0.55;
    const x2 = Math.cos(a) * rad, y2 = Math.sin(a) * rad;
    const perp = a + Math.PI / 2;
    const wx = Math.cos(perp) * rad * 0.09, wy = Math.sin(perp) * rad * 0.09;
    ctx.beginPath();
    ctx.moveTo(x1 + wx, y1 + wy); ctx.lineTo(x2, y2); ctx.lineTo(x1 - wx, y1 - wy);
    ctx.closePath(); ctx.fill();
  }
  const pulse = 0.5 + 0.5 * Math.sin(t * 4 + seed * 10);
  ctx.fillStyle = `rgba(255,${Math.floor(80 + pulse * 70)},60,${0.6 + pulse * 0.4})`;
  ctx.beginPath(); ctx.arc(0, 0, rad * 0.17 * (0.8 + pulse * 0.3), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// derelict wreckage plate — angular hull chunk, seam line, blinking hazard light
export function drawWreckage(ctx, sx, sy, rad, seed, spin, t) {
  ctx.save();
  rockPathAngular(ctx, sx, sy, rad, seed, spin);
  ctx.fillStyle = '#4b4652';
  ctx.fill();
  ctx.strokeStyle = '#211f27';
  ctx.lineWidth = Math.max(1, rad * 0.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - rad * 0.5, sy + rad * 0.05);
  ctx.lineTo(sx + rad * 0.45, sy - rad * 0.1);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (Math.sin(t * 3 + seed * 20) > 0.6) {
    ctx.fillStyle = '#ff5d5d';
    ctx.beginPath(); ctx.arc(sx + rad * 0.28, sy - rad * 0.22, Math.max(1, rad * 0.07), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// shared ship silhouette — fuselage, wings, engine nacelles, nav lights, hue-tinted spine
export function drawShipBody(ctx, size, hue, hidden, blinkOn) {
  if (hidden) return;
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#20242f';
    ctx.beginPath();
    ctx.ellipse(side * size * 0.46, size * 0.55, size * 0.16, size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#c7cbd8';
    ctx.beginPath();
    ctx.moveTo(side * size * 0.12, size * 0.05);
    ctx.quadraticCurveTo(side * size * 0.9, size * 0.35, side * size * 1.05, size * 0.85);
    ctx.quadraticCurveTo(side * size * 0.55, size * 0.7, side * size * 0.32, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `oklch(0.75 0.13 ${hue})`;
    ctx.lineWidth = size * 0.05;
    ctx.beginPath();
    ctx.moveTo(side * size * 0.5, size * 0.55);
    ctx.quadraticCurveTo(side * size * 0.75, size * 0.62, side * size * 0.9, size * 0.8);
    ctx.stroke();
  }
  ctx.fillStyle = '#eef1ff';
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.4);
  ctx.quadraticCurveTo(size * 0.34, -size * 0.5, size * 0.24, size * 0.85);
  ctx.quadraticCurveTo(0, size * 1.0, -size * 0.24, size * 0.85);
  ctx.quadraticCurveTo(-size * 0.34, -size * 0.5, 0, -size * 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `oklch(0.75 0.13 ${hue})`;
  ctx.fillRect(-size * 0.03, -size * 0.85, size * 0.06, size * 1.4);
  const cockpit = ctx.createRadialGradient(0, -size * 0.32, 0, 0, -size * 0.22, size * 0.42);
  cockpit.addColorStop(0, '#6fb3ff');
  cockpit.addColorStop(1, 'rgba(20,30,60,0.9)');
  ctx.fillStyle = cockpit;
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.25, size * 0.2, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  if (blinkOn) {
    ctx.fillStyle = '#5dff7a';
    ctx.beginPath(); ctx.arc(-size * 1.0, size * 0.78, size * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5d5d';
    ctx.beginPath(); ctx.arc(size * 1.0, size * 0.78, size * 0.05, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawEngineFlare(ctx, size, shipGlow, flick) {
  for (const side of [-1, 1]) {
    const ex = side * size * 0.46, ey = size * 0.95;
    const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, size * 1.1 * flick);
    glow.addColorStop(0, shipGlow);
    glow.addColorStop(0.55, shipGlow);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(ex, ey, size * 0.32 * flick, size * 0.68 * flick, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// hangar hero — big idle ship model shown on the title screen
export function drawShipHero(ctx, vp, p, t, hue) {
  const cx = vp.width / 2, cy = vp.height * 0.24;
  const size = Math.min(vp.width, vp.height) * 0.11;
  const sway = Math.sin(t * 0.6) * 0.12;
  const bob = Math.sin(t * 1.1) * size * 0.08;

  ctx.save();
  ctx.translate(cx, cy + size * 1.7);
  const pad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.8);
  pad.addColorStop(0, OKLCH_OK ? `oklch(0.6 0.13 ${hue} / 0.35)` : 'rgba(120,110,150,0.35)');
  pad.addColorStop(1, 'transparent');
  ctx.fillStyle = pad;
  ctx.beginPath(); ctx.ellipse(0, 0, size * 1.8, size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.rotate(sway);
  const flick = 0.85 + Math.sin(t * 8) * 0.15;
  drawEngineFlare(ctx, size, p.shipGlow, flick);
  drawShipBody(ctx, size, hue, false, Math.sin(t * 2) > 0);
  ctx.restore();
}

function drawTrail(ctx, trail) {
  for (const t of trail) {
    ctx.globalAlpha = Math.max(0, t.life) * 0.75;
    ctx.fillStyle = t.hot ? '#ffb453' : '#6fb3ff';
    const r = 1.4 + (1 - t.life) * 1.4;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawShip(ctx, camera, ship, p, reducedMotion, t, hue) {
  const pr = camera.project(ship.x, ship.y, 60);
  const size = 17 * pr.scale;
  const bank = (ship.banking || 0) * 0.55;
  const bob = reducedMotion ? 0 : Math.sin(t * 3.4) * size * 0.03;
  const hidden = ship.blink && Math.floor(ship.blink * 12) % 2;
  const flick = reducedMotion ? 1 : 0.85 + Math.sin(t * 26) * 0.15;

  ctx.save();
  ctx.translate(pr.sx, pr.sy + bob);
  ctx.rotate(bank);
  ctx.globalAlpha = hidden ? 0.35 : 1;
  drawEngineFlare(ctx, size, p.shipGlow, flick);
  ctx.globalAlpha = 1;
  drawShipBody(ctx, size, hue, hidden, Math.floor(t * 1.5) % 2 === 0);
  ctx.restore();
}

export function render(ctx, camera, scene, opts) {
  const { vp, palette: p, reducedMotion } = opts;
  const fx = opts.fx || {};
  const { asteroids, stars, debris, trail = [], ship, shake } = scene;
  const hue = fx.hue ?? 250;
  const warpT = fx.warpT ?? 0;
  const sectorIndex = fx.sectorIndex ?? 0;
  const t = performance.now() / 1000;

  ctx.save();
  if (!reducedMotion && shake > 0) {
    ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
  }

  const punch = reducedMotion ? 1 : 1 + warpT * 0.1;
  ctx.translate(vp.width / 2, vp.height / 2);
  ctx.scale(punch, punch);
  ctx.translate(-vp.width / 2, -vp.height / 2);

  // 1. background
  const grad = ctx.createLinearGradient(0, 0, 0, vp.height);
  grad.addColorStop(0, p.bg0);
  grad.addColorStop(1, p.bg1);
  ctx.fillStyle = grad;
  ctx.fillRect(-40, -40, vp.width + 80, vp.height + 80);

  drawPlanet(ctx, vp, sectorIndex, hue);

  ctx.fillStyle = `oklch(0.4 0.09 ${hue} / 0.16)`;
  ctx.beginPath();
  ctx.ellipse(vp.width * 0.7, vp.height * 0.3, vp.width * 0.4, vp.height * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. starfield, streaked during warp
  ctx.fillStyle = p.star;
  for (const s of stars) {
    const pr = camera.project(s.x, s.y, s.z);
    const a = Math.max(0, Math.min(1, 1 - s.z / 900));
    if (!reducedMotion && warpT > 0.02) {
      const dx = pr.sx - vp.width / 2, dy = pr.sy - vp.height / 2;
      const d = Math.hypot(dx, dy) || 1;
      const len = warpT * 60 * a;
      ctx.strokeStyle = p.star;
      ctx.globalAlpha = (0.15 + a * 0.85) * warpT;
      ctx.lineWidth = 1 + a;
      ctx.beginPath();
      ctx.moveTo(pr.sx - (dx / d) * len, pr.sy - (dy / d) * len);
      ctx.lineTo(pr.sx, pr.sy);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.15 + a * 0.85;
    ctx.fillRect(pr.sx, pr.sy, 1 + a, 1 + a);
  }
  ctx.globalAlpha = 1;

  // 3. obstacles, far → near — art varies by sector's hazard kind
  const ordered = [...asteroids].sort((a, b) => b.z - a.z);
  for (const rock of ordered) {
    const pr = camera.project(rock.x, rock.y, rock.z);
    const rad = rock.r * pr.scale;
    if (rad < 0.5) continue;
    const spin = (rock.spin || 0) * (900 - rock.z) * 0.002;

    if (!reducedMotion && rock.z < 500) {
      ctx.strokeStyle = p.streak;
      ctx.lineWidth = rad * 0.6;
      ctx.beginPath();
      const far = camera.project(rock.x, rock.y, rock.z + 120);
      ctx.moveTo(far.sx, far.sy);
      ctx.lineTo(pr.sx, pr.sy);
      ctx.stroke();
    }

    if (rock.kind === 'mines') {
      drawMine(ctx, pr.sx, pr.sy, rad, rock.seed ?? 0.5, spin, t);
      continue;
    }
    if (rock.kind === 'wreckage') {
      drawWreckage(ctx, pr.sx, pr.sy, rad, rock.seed ?? 0.5, spin, t);
      continue;
    }

    drawAsteroid(ctx, pr.sx, pr.sy, rad, rock.seed ?? 0.5, spin, p);
  }

  // 4. debris
  ctx.fillStyle = p.debris;
  for (const d of debris) {
    const pr = camera.project(d.x, d.y, d.z);
    ctx.globalAlpha = Math.max(0, d.life);
    ctx.fillRect(pr.sx, pr.sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // 5. engine trail + ship — ship hidden during 'dying' (it has shattered into
  //    debris); the trail still draws so the exhaust fades out naturally.
  if (!opts.hideShip) {
    drawTrail(ctx, trail);
    if (!ship.destroyed) drawShip(ctx, camera, ship, p, reducedMotion, t, hue);
  }

  ctx.restore();

  // 6. warp flash, drawn after shake/punch is undone so it reads as a clean pulse
  if (!reducedMotion && warpT > 0.01) {
    ctx.save();
    ctx.globalAlpha = warpT * 0.35;
    ctx.fillStyle = `oklch(0.95 0.02 ${hue})`;
    ctx.fillRect(0, 0, vp.width, vp.height);
    ctx.restore();
  }
}
