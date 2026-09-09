// game.js — the entry point. Wires the canvas to the GL boundary, the medium and
// the diver, then drives an animation loop. Depth now comes from the diver's real
// `y` (its descent through the water), and the diver sprite is drawn at the
// diver's real screen position. If WebGL2 is missing, or a shader fails to build,
// the player gets the fallback panel and nothing else happens.

import { makeGl, fail } from './gl.js';
import { makeMedium } from './medium.js';
import { buildAtlas } from './sprites.js';
import { makeBatch } from './batch.js';
import { paletteAt, castAt, escalationAt } from './depth.js';
import { makeLoop } from './loop.js';
import { makeDiver } from './diver.js';
import { makeField } from './field.js';
import { makeLamp } from './lamp.js';
import { takePlankton } from './collect.js';

const DIVER_SCREEN_Y = 0.42;   // the diver sits at this fraction of the canvas; the world scrolls past
const DIVER_SIZE = 64;         // sprite edge in CSS px (scaled by DPR at draw time)
const PX_PER_METRE = 9;        // CSS px of vertical scroll per metre of depth
const PLANKTON_SIZE = 22;      // mote sprite edge in CSS px
const PLANKTON_DRIFT = 6;      // CSS px of lazy horizontal sway, keyed off each mote's phase

const PICKUP_RADIUS_M = 3.4;   // metres — the diver's catch reach for plankton
const REFUEL = 0.14;           // fuel restored per mote collected (mirrors lamp.js)
const GLOW_SCALE = 2.4;        // lamp sprite edge as a multiple of the lamp's pixel radius
const BROWNOUT_SECONDS = 2;    // how long the rescue drift lasts
const BROWNOUT_RISE_M = 50;    // how far the rescue lifts the diver back toward the light
const BEST_KEY = 'deep-glow:best';

// State machine: menu -> diving -> brownout -> diving. Task 13 adds the real
// `menu` state (title, best score, a Dive button) and makes it the start state;
// the loop already branches on `state` so that is an addition, not a rewrite.
const STATE = { MENU: 'menu', DIVING: 'diving', BROWNOUT: 'brownout' };

// localStorage throws on ACCESS (not just writes) in private-mode Safari, so
// every read and every write is wrapped.
function readBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}
function writeBest(metres) {
  try { localStorage.setItem(BEST_KEY, String(Math.floor(metres))); } catch { /* private mode */ }
}

const canvas = document.getElementById('stage');

const glx = makeGl(canvas);
if (!glx) {
  fail('Deep Glow needs a newer browser — it uses WebGL2 for the water.');
} else {
  const medium = makeMedium(glx);
  const atlas = buildAtlas();
  const batch = makeBatch(glx, glx.texture(atlas.canvas), atlas.frames);

  if (!medium || !batch) {
    glx.fail('Deep Glow could not start its water shader — check the console.');
  } else {
    const cssViewport = () => {
      const rect = canvas.getBoundingClientRect();
      return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    };

    const diver = makeDiver({ viewport: cssViewport(), restFraction: DIVER_SCREEN_Y });
    const field = makeField({ rng: Math.random });   // pure; the rng is defaulted here, at the call site
    const lamp = makeLamp();
    const loop = makeLoop();

    let depthM = 0;
    let state = STATE.DIVING;   // Task 13: start at STATE.MENU instead
    let brownoutT = 0;          // seconds elapsed in the current brownout drift
    let best = readBest();

    // One lamp snapshot per frame — fuel, light radius, and the one-frame
    // brownout latch. Seeded so render() has real numbers before the first tick.
    const lampSnap = { fuel: 1, radius: lamp.radius, brownout: false };

    // Reused scratch for the pickup test. field.plankton mixes units (x is
    // centre-relative CSS px, y is depth in metres); collect.js compares a single
    // squared distance, so both axes are projected into METRES here and the
    // radius (PICKUP_RADIUS_M) is in metres too. Index i lines up with
    // field.plankton[i] for the splice.
    const pickScratch = [];
    const diverMetres = { x: 0, y: 0 };

    function collectPickups() {
      const list = field.plankton;
      diverMetres.x = diver.pos().x / PX_PER_METRE;
      diverMetres.y = depthM;
      for (let i = 0; i < list.length; i++) {
        let s = pickScratch[i];
        if (!s) { s = pickScratch[i] = { x: 0, y: 0 }; }
        s.x = list[i].x / PX_PER_METRE;
        s.y = list[i].y;
      }
      pickScratch.length = list.length;
      const hits = takePlankton(diverMetres, pickScratch, PICKUP_RADIUS_M);
      for (const i of hits) {        // descending, so the splice is safe
        list.splice(i, 1);
        lamp.refuel(REFUEL);
      }
    }

    // Hoisted so the per-frame push() allocates nothing. `sprite` is the diver's;
    // `mote` is reused across the WHOLE plankton loop — many pushes per frame, one
    // object. `fieldCtx` is filled once per frame, never per mote.
    const sprite = { id: 'diver', x: 0, y: 0, size: DIVER_SIZE, r: 1, g: 1, b: 1, alpha: 1, rot: 0 };
    const mote = { id: 'plankton-a', x: 0, y: 0, size: PLANKTON_SIZE, r: 1, g: 0.92, b: 0.72, alpha: 0.9, rot: 0 };
    const glow = { id: 'lamp-glow', x: 0, y: 0, size: 0, r: 1, g: 1, b: 1, alpha: 0.55, rot: 0 };
    const fieldCtx = { box: null, viewMetres: 0, cast: null, escalation: 1 };

    // Reused between render() and medium.draw() so no frame allocates.
    const lampUniform = { x: 0, y: 0, radius: 0 };
    const resolution = [1, 1];

    function render() {
      const { width, height, dpr } = glx.resize();
      const pal = paletteAt(depthM);

      // Diver + lamp in device pixels (top-left origin), shared by the medium
      // pass, the actor batch, and the lamp quad.
      const diverX = width / 2 + diver.pos().x * dpr;
      const diverY = height * DIVER_SCREEN_Y;
      const lampRadiusPx = lampSnap.radius * dpr;

      lampUniform.x = diverX;
      lampUniform.y = diverY;
      lampUniform.radius = lampRadiusPx;
      resolution[0] = width;
      resolution[1] = height;

      medium.draw({
        time: performance.now() / 1000,
        depth: depthM,
        zoneA: pal.a,
        zoneB: pal.b,
        zoneMix: pal.mix,
        lamp: lampUniform,       // never undefined — a real object every frame
        resolution,
        calm: 1,
      });

      // World -> screen: x is centre-relative CSS px, so the device-pixel screen x
      // is (canvas centre) + x * dpr. The diver's own y is the camera anchor, so
      // its screen y is the fixed DIVER_SCREEN_Y band.
      batch.begin(width, height);

      // Plankton first (additive, so order is cosmetic): world y is depth in
      // metres; a mote (p.y - depthM) metres below the diver sits that many
      // PX_PER_METRE below the fixed DIVER_SCREEN_Y band. dpr is applied here, at
      // the draw call, exactly as for the diver — the field works in CSS px.
      const now = performance.now();
      for (const p of field.plankton) {
        mote.id = p.kind;
        mote.x = width / 2 + (p.x + Math.sin(now / 1000 + p.phase) * PLANKTON_DRIFT) * dpr;
        mote.y = height * DIVER_SCREEN_Y + (p.y - depthM) * PX_PER_METRE * dpr;
        mote.size = PLANKTON_SIZE * dpr;
        batch.push(mote);
      }

      sprite.x = diverX;
      sprite.y = diverY;
      sprite.size = DIVER_SIZE * dpr;
      batch.push(sprite);
      batch.flush();

      // The lamp pass: one large additive quad centred on the diver, its edge a
      // multiple of the light radius so it pools past the actor glows, tinted by
      // the current zone colour lifted toward a warm lamp-white. Drawn after the
      // actors so it sits over them, in the same additive space.
      glow.x = diverX;
      glow.y = diverY;
      glow.size = lampRadiusPx * GLOW_SCALE;
      glow.r = 0.55 + 0.45 * (pal.a[0] + (pal.b[0] - pal.a[0]) * pal.mix);
      glow.g = 0.52 + 0.45 * (pal.a[1] + (pal.b[1] - pal.a[1]) * pal.mix);
      glow.b = 0.46 + 0.45 * (pal.a[2] + (pal.b[2] - pal.a[2]) * pal.mix);
      batch.begin(width, height);
      batch.push(glow);
      batch.flush();
    }

    loop.start((dt) => {
      if (state === STATE.MENU) { render(); return; }   // Task 13 fills this in

      const prevDepthM = depthM;
      const escalation = escalationAt(depthM);

      if (state === STATE.DIVING) {
        depthM = diver.update(dt, { sinkScale: 1 }).y;

        // Lamp fuel drains with depth; a depleted lamp latches `brownout` for a
        // single frame, which is our one-way ticket into the rescue state.
        const s = lamp.update(dt, { escalation });
        lampSnap.fuel = s.fuel;
        lampSnap.radius = s.radius;
        lampSnap.brownout = s.brownout;

        collectPickups();                       // splices motes, refuels per mote

        if (depthM > best) best = depthM;

        if (s.brownout) {
          state = STATE.BROWNOUT;
          brownoutT = 0;
          writeBest(best);                       // checkpoint the run
        }
      } else if (state === STATE.BROWNOUT) {
        // Input is ignored (inputLocked). The diver drifts up toward the light;
        // the lamp is NOT ticked, so its fuel stays at 0 and lampSnap.radius
        // holds at the floor — the screen stays near-black through the drift.
        brownoutT += dt;
        const rise = BROWNOUT_RISE_M * (dt / BROWNOUT_SECONDS);
        depthM = diver.nudge(-rise).y;
        if (brownoutT >= BROWNOUT_SECONDS) {
          lamp.relight();                        // clears the latch, fuel -> 0.5
          lampSnap.fuel = lamp.fuel;
          lampSnap.radius = lamp.radius;
          lampSnap.brownout = false;
          state = STATE.DIVING;                  // play resumes — no game-over
        }
      }

      // The field is driven by METRES descended this frame, not by dt — that is
      // what makes mote density per-metre and independent of the sink rate.
      // Clamped at 0 so the upward rescue drift neither spawns nor mis-culls.
      const descended = Math.max(0, depthM - prevDepthM);
      fieldCtx.box = diver.box();                                  // only x0/x1 are used
      fieldCtx.viewMetres = cssViewport().height / PX_PER_METRE;   // one screen-height of depth
      fieldCtx.cast = castAt(depthM);
      fieldCtx.escalation = escalation;
      field.step(descended, fieldCtx);
      render();
    });

    /* ---------- input ---------- */
    // The rescue (and, from Task 13, the menu) takes the wheel: steering is only
    // live while diving.
    const inputLocked = () => state !== STATE.DIVING;

    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (inputLocked()) return;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not all engines */ }
      const p = pointerPos(e);
      diver.aim(p.x, p.y);
    });
    canvas.addEventListener('pointermove', (e) => {
      // No pressure/button gate: a touch pointermove only fires while the finger is
      // down, and phones without Force Touch report e.pressure === 0 the whole drag.
      if (inputLocked()) return;
      const p = pointerPos(e);
      diver.aim(p.x, p.y);
    });

    const keys = { ArrowLeft: 0, ArrowRight: 0, ArrowUp: 0, ArrowDown: 0, a: 0, d: 0, w: 0, s: 0 };
    function applyKeys() {
      if (inputLocked()) { diver.setThrust(0, 0); return; }
      const x = (keys.ArrowRight || keys.d) - (keys.ArrowLeft || keys.a);
      const y = (keys.ArrowDown || keys.s) - (keys.ArrowUp || keys.w);
      diver.setThrust(Math.sign(x), Math.sign(y));
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key in keys) { keys[e.key] = 1; applyKeys(); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key in keys) { keys[e.key] = 0; applyKeys(); }
    });
    // Without this the diver drifts forever when the player tabs away mid-press.
    window.addEventListener('blur', () => {
      for (const k in keys) keys[k] = 0;
      applyKeys();
    });

    window.addEventListener('resize', () => {
      diver.setViewport(cssViewport());
      render();
    });

    // Persist the best depth when the page goes away mid-dive — a brownout is the
    // normal checkpoint, but a kid closing the tab shouldn't lose their record.
    window.addEventListener('pagehide', () => writeBest(best));

    try { canvas.focus(); } catch { /* focus can throw in odd embeddings */ }
  }
}
