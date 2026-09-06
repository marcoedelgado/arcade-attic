// render.js — draws one frame. Pure drawing: takes the camera, the entity arrays
// and a palette; no game state of its own. Far → near so nearer rocks overlap.

const DEFAULTS = {
  bg0: '#05030f', bg1: '#160f2e', nebula: 'rgba(94,58,140,0.18)',
  star: '#dfe8ff', rock: '#7d7486', rockLit: '#c9bfd6', rockDark: '#3a3444',
  ship: '#eef1ff', shipGlow: '#6fb3ff', streak: 'rgba(160,190,255,0.35)',
  debris: '#b8a9c9',
};

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

// deterministic per-rock vertex noise from its seed
function rockPath(ctx, sx, sy, radius, seed, spinAngle) {
  const verts = 7 + Math.floor(seed * 3); // 7..9
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

export function render(ctx, camera, scene, opts) {
  const { vp, palette: p, reducedMotion } = opts;
  const { asteroids, stars, debris, ship, shake } = scene;

  ctx.save();
  if (!reducedMotion && shake > 0) {
    ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
  }

  // 1. background
  const grad = ctx.createLinearGradient(0, 0, 0, vp.height);
  grad.addColorStop(0, p.bg0);
  grad.addColorStop(1, p.bg1);
  ctx.fillStyle = grad;
  ctx.fillRect(-40, -40, vp.width + 80, vp.height + 80);
  ctx.fillStyle = p.nebula;
  ctx.beginPath();
  ctx.ellipse(vp.width * 0.7, vp.height * 0.3, vp.width * 0.4, vp.height * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. starfield
  ctx.fillStyle = p.star;
  for (const s of stars) {
    const pr = camera.project(s.x, s.y, s.z);
    const a = Math.max(0, Math.min(1, 1 - s.z / 900));
    ctx.globalAlpha = 0.15 + a * 0.85;
    ctx.fillRect(pr.sx, pr.sy, 1 + a, 1 + a);
  }
  ctx.globalAlpha = 1;

  // 3. asteroids, far → near
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

    rockPath(ctx, pr.sx, pr.sy, rad, rock.seed ?? 0.5, spin);
    ctx.fillStyle = p.rock;
    ctx.fill();
    // lit rim toward top-left
    ctx.save();
    ctx.clip();
    ctx.fillStyle = p.rockLit;
    ctx.beginPath();
    ctx.arc(pr.sx - rad * 0.4, pr.sy - rad * 0.4, rad * 0.9, 0, Math.PI * 2);
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = p.rockDark;
    ctx.lineWidth = 1;
    rockPath(ctx, pr.sx, pr.sy, rad, rock.seed ?? 0.5, spin);
    ctx.stroke();
  }

  // 4. debris (post-hit particles)
  ctx.fillStyle = p.debris;
  for (const d of debris) {
    const pr = camera.project(d.x, d.y, d.z);
    ctx.globalAlpha = Math.max(0, d.life);
    ctx.fillRect(pr.sx, pr.sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // 5. ship
  drawShip(ctx, camera, ship, p, reducedMotion);

  ctx.restore();
}

function drawShip(ctx, camera, ship, p, reducedMotion) {
  const pr = camera.project(ship.x, ship.y, 60);
  const size = 16 * pr.scale;
  const bank = (ship.banking || 0) * 0.5;
  ctx.save();
  ctx.translate(pr.sx, pr.sy);
  ctx.rotate(bank);
  // engine glow
  const glow = ctx.createRadialGradient(0, size, 0, 0, size, size * 2.2);
  glow.addColorStop(0, p.shipGlow);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(-size * 2, size * 0.2, size * 4, size * 3);
  // hull
  if (!(ship.blink && Math.floor(ship.blink * 12) % 2)) {
    ctx.fillStyle = p.ship;
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.3);
    ctx.lineTo(size, size);
    ctx.lineTo(0, size * 0.5);
    ctx.lineTo(-size, size);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
