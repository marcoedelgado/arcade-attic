// game.js — the entry point. Wires the canvas to the GL boundary, the medium and
// the diver, then drives an animation loop. Depth now comes from the diver's real
// `y` (its descent through the water), and the diver sprite is drawn at the
// diver's real screen position. If WebGL2 is missing, or a shader fails to build,
// the player gets the fallback panel and nothing else happens.

import { makeGl, fail } from './gl.js';
import { makeMedium } from './medium.js';
import { buildAtlas } from './sprites.js';
import { makeBatch } from './batch.js';
import { paletteAt, castAt, escalationAt, waterAt, ZONES } from './depth.js';
import { makeLoop } from './loop.js';
import { makeDiver } from './diver.js';
import { makeField } from './field.js';
import { makeLamp, REFUEL } from './lamp.js';
import { takePlankton, bumped, sighted } from './collect.js';
import { makeSightings } from './sightings.js';
import { makeAudio } from './audio.js';
import { makeTilt, tiltPreferred } from './tilt.js';
import { makeHud } from './hud.js';
import { litAt, ambientFor } from './light.js';
import { CREATURES, F, frameId } from './creatures.js';
import { brownoutAt, BROWNOUT_SECONDS } from './brownout.js';

const DIVER_SCREEN_Y = 0.42;   // the diver sits at this fraction of the canvas; the world scrolls past
const DIVER_SIZE = 84;         // sprite edge in CSS px (scaled by DPR at draw time).
                               // 84, not 64: at 64 the fish was a smudge lost
                               // inside its own lamp glow.
const DIVER_TINT = 1.35;       // flat colour multiplier: the diver sits at the lamp origin, so
                               // litAt() would double-count and clip it (art direction §03)
const FRAME_MS = 250;          // 4fps across creatures.js's F animation frames
const PX_PER_METRE = 9;        // CSS px of vertical scroll per metre of depth
const PLANKTON_SIZE = 22;      // mote sprite edge in CSS px
const PLANKTON_DRIFT = 6;      // CSS px of lazy horizontal sway, keyed off each mote's phase

const PICKUP_RADIUS_M = 3.4;   // metres — the diver's catch reach for plankton
                                // catch difficulty is viewport-width dependent: this radius is
                                // fixed in metres, but diver.box() (and so the diver's steerable
                                // span) scales with screen width, so a narrow phone plays
                                // measurably easier than a wide desktop window (~18% vs ~8% of
                                // motes fall within reach by chance). Intentional — the phone is
                                // the target device and should be the forgiving one — but a trap
                                // for whoever retunes either number later without the other.
const BROWNOUT_RISE_M = 50;    // how far the rescue lifts the diver back toward the light
const BEST_KEY = 'deep-glow:best';
const TILT_MSG_SECONDS = 3;    // how long the "tilt isn't available" toast stays up

// Creatures (Task 9). Sizes/speeds are playtest-owned tunables, not pinned by
// any test — the suite only requires the id/kind/rare/x/y/phase shape.
const CREATURE_SIZE = 60;          // base sprite edge in CSS px — rare gets a bit bigger below.
                                   // 60, not 44: the art direction judged legibility with
                                   // the 128px cell drawn at 60px — draw it smaller and
                                   // the kids see less than the sheet did.
const CREATURE_RARE_BONUS = 11;    // px added to a rare creature's on-screen size (8 x 60/44)
const CREATURE_BUMPER_BONUS = 14;  // px added to a bumper's on-screen size — large at a glance
const BUMP_RADIUS_M = 4.2;         // metres — a bumper is large, so its contact reach is generous
const BUMP_COOLDOWN_SECONDS = 0.5; // after a bump, no further bump is scored for this long — a
                                    // lingering overlap costs fuel once, not every frame
const WOBBLE_SECONDS = 0.28;       // how long the screen shake from a bump lasts
const WOBBLE_PX = 5;               // CSS px of screen-shake amplitude at the start of a wobble
const SHY_FLEE_PX_PER_S = 150;     // how fast a shy creature darts once the lamp reaches it
const CAPTION_SECONDS = 2.5;       // how long a sighting caption stays on screen
// Every animated frame id ("<id>/<f>"), built once — the render loop must
// not build strings.
const FRAME_IDS = {};
for (const { id } of [{ id: 'diver' }, ...CREATURES]) {
  FRAME_IDS[id] = Array.from({ length: F }, (_, f) => frameId(id, f));
}

// Per-kind cosmetic motion at render time: a side-to-side sway, an up-and-down
// bob a quarter-cycle behind it (so each creature traces a lazy loop), and a
// tilt that follows the bob (nose dips on the way down). Purely visual — it
// never touches c.x / c.y, which is what bump/sighted compare — so the offsets
// stay small: much past ~15px a child would see an Old Turtle touch the fish
// without a bump. The tilt moves nothing, so it is the cheap way to add life.
// period is in seconds for one full loop. (The old sway was sin(ms / period)
// with no 2π, so its "2.6s" loop actually took ~16s — nearly still.)
const CREATURE_MOTION = {
  drifter: { swayPx: 12, bobPx: 5, period: 3.4, tilt: 0.14 },
  shy: { swayPx: 5, bobPx: 3, period: 1.2, tilt: 0.22 },     // quick and nervous
  bumper: { swayPx: 6, bobPx: 4, period: 5.0, tilt: 0.07 },  // slow and heavy
  rare: { swayPx: 10, bobPx: 9, period: 4.0, tilt: 0.10 },   // an unhurried loop
};

// State machine: menu -> diving -> brownout -> diving. Task 13 adds the real
// `menu` state (title, best score, a Dive button) and makes it the start state;
// the loop already branches on `state` so that is an addition, not a rewrite.
const STATE = { MENU: 'menu', DIVING: 'diving', BROWNOUT: 'brownout' };

// prefers-reduced-motion: read once at boot (same convention as asteroid-run) —
// this is a system preference, not something that flips mid-session. CALM
// scales the medium's own clock (see calmClock below) and damps the bump
// wobble; nothing about calm ever touches gameplay, so the game stays fully
// playable either way.
const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const CALM = reducedMotion ? 0.25 : 1.0;

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
    // Viewport dims (fix: layout thrash). ONE getBoundingClientRect() read here
    // seeds everything; from here on out it's only re-read on the 'resize'
    // event, on 'scroll' (position can change without a size change), and on a
    // DPR change (watchDpr(), wired below) — never every frame, and never per
    // pointer event. cssVp is CSS px (diver/field/tilt all want this); viewport
    // is device px + dpr (what render() feeds the GL viewport/uniforms);
    // canvasRect is the raw rect, cached for pointerPos.
    let canvasRect = canvas.getBoundingClientRect();
    let cssVp = { width: Math.max(1, canvasRect.width), height: Math.max(1, canvasRect.height) };
    let viewport = glx.resize(canvasRect);   // sizes the canvas + gl.viewport once, from the rect above

    const diver = makeDiver({ viewport: cssVp, restFraction: DIVER_SCREEN_Y });
    const field = makeField({ rng: Math.random });   // pure; the rng is defaulted here, at the call site
    const lamp = makeLamp();
    const loop = makeLoop();
    // sightings.js wraps every storage access itself; localStorage is just the
    // real-world default handed in at this call site, same pattern as readBest/writeBest.
    const sightings = makeSightings({ storage: localStorage });
    const captionEl = document.getElementById('dg-caption');
    const audio = makeAudio();
    const muteBtn = document.getElementById('dg-mute');
    const hud = makeHud(document.querySelector('.dg-stage-wrap'));

    function syncMuteBtn() {
      if (!muteBtn) return;
      if (!audio.supported) {
        muteBtn.disabled = true;
        muteBtn.textContent = '🔇';
        muteBtn.setAttribute('aria-pressed', 'true');
        muteBtn.setAttribute('aria-label', 'Sound unavailable in this browser');
        return;
      }
      muteBtn.setAttribute('aria-pressed', String(audio.muted));
      muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
      muteBtn.textContent = audio.muted ? '🔇' : '🔊';
    }
    syncMuteBtn();
    if (muteBtn && audio.supported) {
      muteBtn.addEventListener('click', () => {
        audio.unlock();          // the tap itself is the user gesture that may build the context
        audio.setMuted(!audio.muted);
        syncMuteBtn();
      });
    }

    let depthM = 0;
    let state = STATE.MENU;
    let brownoutT = 0;          // seconds elapsed in the current brownout drift
    let brownoutFromM = 0;      // depth the rescue started at — the rise is measured from here
    let brownoutFromR = 0;      // lamp radius (CSS px) at the moment it went out
    let brownoutCalm = 1;       // brownout.js calm: slows the water's clock AND closes the vignette
    let best = readBest();

    // creature id -> a human caption/label ("ember-octopus" -> "Ember Octopus").
    // Every id sighted() ever returns, and every id in RARE_IDS below, is a rare
    // id from depth.js's ZONES — already lowercase-hyphenated words, so no
    // lookup table is needed. Used by both the caption (during a dive) and the
    // menu badges (before one).
    function creatureName(id) {
      return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }

    /* ---------- menu (Task 13): the real starting state ---------- */
    const menuEl = document.getElementById('dg-menu');
    const menuBestEl = document.getElementById('dg-menu-best');
    const badgesEl = document.getElementById('dg-badges');
    const startBtn = document.getElementById('dg-start');

    if (menuBestEl) {
      if (best > 0) {
        menuBestEl.textContent = `Best dive: ${Math.floor(best)} m`;
        menuBestEl.hidden = false;
      } else {
        menuBestEl.hidden = true;
      }
    }

    // Creature pictures for the menu and the sighting caption are copied
    // straight out of the sprite atlas, so a child sees exactly the creature
    // they meet in the water — no second copy of the art, no image files.
    // PIC_CROP trims the atlas cell's empty margin (every rare and bumper
    // paints within ~41px of centre; creatures.js's extent test bounds it)
    // so the creature fills its badge.
    const PIC_CROP = 88;
    const dprPic = Math.min(2, window.devicePixelRatio || 1);
    function makePic(cssPx, className) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = Math.round(cssPx * dprPic);
      cv.className = className;
      cv.setAttribute('aria-hidden', 'true');   // the name is the accessible label
      return cv;
    }
    function paintPic(cv, id, f) {
      const fr = atlas.frames[FRAME_IDS[id][f]];
      const inset = (fr.w - PIC_CROP) / 2;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(
        atlas.canvas,
        fr.u0 * atlas.canvas.width + inset, fr.v0 * atlas.canvas.height + inset, PIC_CROP, PIC_CROP,
        0, 0, cv.width, cv.height,
      );
    }

    // The menu's field guide. Row 1: one badge per zone's rare creature
    // (depth.js: exactly one per zone, in zone order) — a flat grey "who's
    // that?" silhouette of its real shape until sightings has marked it, then
    // lit, named and gently animated. Row 2: each zone's bumper, always shown
    // in colour under "Watch out!", so a five-year-old learns what costs lamp
    // fuel before they dive. Built once: sightings only grows during a dive and
    // there is no path back to the menu, so there is nothing to re-sync.
    const RARE_IDS = ZONES.map((z) => z.cast.find((c) => c.rare).id);
    const BUMPER_IDS = ZONES.map((z) => z.cast.find((c) => c.kind === 'bumper').id);
    const menuPics = [];   // [canvas, id] for the lit badges, animated while the menu is up

    if (badgesEl) {
      for (const id of RARE_IDS) {
        const seen = sightings.has(id);
        const name = creatureName(id);
        const b = document.createElement('div');
        b.className = seen ? 'dg-badge lit' : 'dg-badge';
        b.setAttribute('role', 'listitem');
        const label = seen ? name : 'Not yet spotted';
        b.title = label;
        b.setAttribute('aria-label', label);
        const disc = document.createElement('span');
        disc.className = 'dg-badge-disc';
        const pic = makePic(52, 'dg-pic');
        paintPic(pic, id, 0);
        disc.appendChild(pic);
        const tag = document.createElement('span');
        tag.className = 'dg-badge-name';
        tag.setAttribute('aria-hidden', 'true');
        tag.textContent = seen ? name : '?';
        b.append(disc, tag);
        badgesEl.appendChild(b);
        if (seen) menuPics.push([pic, id]);
      }
    }

    const bumpersEl = document.getElementById('dg-bumpers');
    if (bumpersEl) {
      for (const id of BUMPER_IDS) {
        const b = document.createElement('div');
        b.className = 'dg-bumper';
        b.setAttribute('role', 'listitem');
        const name = creatureName(id);
        b.title = name;
        b.setAttribute('aria-label', name);
        const pic = makePic(42, 'dg-pic');
        paintPic(pic, id, 0);
        b.appendChild(pic);
        bumpersEl.appendChild(b);
        menuPics.push([pic, id]);
      }
    }

    // Lit badges and bumpers breathe through their three frames, same 4fps as
    // in the water. Stopped for good when the dive begins (the menu never
    // comes back), and never started under reduced motion.
    let menuTick = 0;
    const menuAnim = !reducedMotion && menuPics.length > 0
      ? setInterval(() => {
        menuTick = (menuTick + 1) % F;
        for (const [pic, id] of menuPics) paintPic(pic, id, menuTick);
      }, FRAME_MS)
      : null;

    // Menu -> diving is deferred by one requestAnimationFrame, same fix as
    // pocket-pairs commit 5cb0131: a big synchronous DOM change (hiding the
    // menu, showing the HUD) inside the tap's own handler is intermittently
    // read by iOS as a swipe-back gesture and bounces the page home.
    function beginDive() {
      if (state !== STATE.MENU) return;
      audio.unlock();   // the tap itself is the user gesture that may build the context
      requestAnimationFrame(() => {
        if (menuAnim) clearInterval(menuAnim);
        if (menuEl) menuEl.hidden = true;
        hud.show();
        audio.resetMelody();   // each dive opens the pentatonic scale from its root note
        state = STATE.DIVING;
      });
    }
    if (startBtn) startBtn.addEventListener('click', beginDive);

    // Bump wobble and sighting caption both run on a simple decaying timer,
    // ticked once per frame regardless of state so they always finish fading.
    let wobbleT = 0;            // seconds remaining in the current screen shake
    let bumpCooldownT = 0;      // seconds remaining before another bump can score
    let captionT = 0;           // seconds remaining the current caption is shown
    let captionId = null;       // creature id the caption is currently naming

    // The medium's own shared clock (medium.js: `t = uTime`). Fed by
    // dt * CALM every frame regardless of state, rather than a raw wall clock
    // multiplied by calm at draw time — the latter is what makes a changed
    // calm mid-run rewrite every phase in the shader at once (a whole-screen
    // jump); accumulating instead means calm only ever changes the clock's
    // RATE, never its value, so there is nothing to pop. Always fed a
    // non-negative term (CALM is 0.25 or 1.0) — the shader casts a value
    // derived from this to uvec2, and uvec2() of a negative is UB.
    //
    // Its RATE is CALM x water.calm x brownoutCalm: each zone moves at its own
    // speed (the Midnight is the stillest water in the game, the Trench
    // churns), and the brownout's hush slows everything almost to a stop.
    // Because only the rate changes, none of it ever pops the water.
    let calmClock = 0;

    // The blended water recipe for the current depth, refreshed once per frame
    // at the top of the loop and reused (waterAt fills it in place).
    const water = waterAt(0, {});

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
        audio.ping();               // steps the pentatonic scale — a run of pickups is a melody
      }
    }

    // Reused scratch for bumper contacts — same metres-projection as pickScratch,
    // truncated/rebuilt each call so nothing is allocated once warm. Only
    // 'bumper'-kind creatures are ever copied in: collect.js's bumped() does not
    // consult kind ("a bump is a bump"), so the caller decides who can bump —
    // that's here, not in collect.js.
    const bumperScratch = [];

    // The sighting caption: the creature's picture plus "You found <name>!",
    // popping in so the reward lands the moment it happens (its badge only
    // lights on the next visit to the menu). Children built once; only the
    // picture and text change per sighting.
    const captionPic = makePic(30, 'dg-caption-pic');
    const captionText = document.createElement('span');
    captionText.className = 'dg-caption-text';
    if (captionEl) captionEl.append(captionPic, captionText);
    const CAPTION_POP = [
      { transform: 'translateX(-50%) scale(0.6)', opacity: 0 },
      { transform: 'translateX(-50%) scale(1.08)', opacity: 1, offset: 0.65 },
      { transform: 'translateX(-50%) scale(1)', opacity: 1 },
    ];

    function showCaption(id) {
      captionId = id;
      captionT = CAPTION_SECONDS;
      if (captionEl) {
        paintPic(captionPic, id, 0);
        captionText.textContent = `You found ${creatureName(id)}!`;
        captionEl.hidden = false;
        // Web Animations, not a CSS class toggle: restarting a CSS animation
        // needs a forced reflow. Skipped under reduced motion — it just appears.
        if (!reducedMotion && typeof captionEl.animate === 'function') {
          captionEl.animate(CAPTION_POP, { duration: 380, easing: 'ease-out' });
        }
      }
    }

    // Bump/sighting interactions for this frame's creatures. Must run AFTER
    // collectPickups(), which is what sets diverMetres for this tick.
    function updateCreatureInteractions(dt) {
      const list = field.creatures;
      const lampRadiusM = lampSnap.radius / PX_PER_METRE;

      // Sightings: sighted() already filters to rare creatures, so every id
      // that comes back is one the log and the caption care about. Marking is
      // idempotent, so calling it every frame the lamp still reaches the
      // creature is free; the caption re-fires only on a new id or after the
      // previous one has finished showing.
      for (const id of sighted(diverMetres, list, lampRadiusM)) {
        sightings.mark(id);
        if (captionT <= 0 || captionId !== id) showCaption(id);
      }

      // Bumper contact: costs lamp fuel and shakes the screen, but never ends
      // the run. A short cooldown after a hit stops a lingering overlap from
      // draining fuel again on every single frame it persists.
      if (bumpCooldownT <= 0) {
        let n = 0;
        for (const c of list) {
          if (c.kind !== 'bumper') continue;
          let s = bumperScratch[n];
          if (!s) s = bumperScratch[n] = { x: 0, y: 0 };
          s.x = c.x / PX_PER_METRE;
          s.y = c.y;
          n++;
        }
        bumperScratch.length = n;
        if (bumped(diverMetres, bumperScratch, BUMP_RADIUS_M).length > 0) {
          lamp.bump();
          audio.thud();
          wobbleT = WOBBLE_SECONDS;
          bumpCooldownT = BUMP_COOLDOWN_SECONDS;
        }
      }

      // Shy creatures dart away once the lamp actually reaches them. This
      // mutates the real x field.js gave the creature (not a render-time
      // offset), so a fleeing creature also moves the point bump/sighted
      // compare against next frame — it is genuinely escaping, not just
      // appearing to.
      for (const c of list) {
        if (c.kind !== 'shy') continue;
        const dx = (c.x - diver.pos().x) / PX_PER_METRE;
        const dy = c.y - depthM;
        if (dx * dx + dy * dy > lampRadiusM * lampRadiusM) continue;
        const dir = dx !== 0 ? Math.sign(dx) : (c.phase > Math.PI ? 1 : -1);
        c.x += dir * SHY_FLEE_PX_PER_S * dt;
      }
    }

    // Hoisted so the per-frame push() allocates nothing. `sprite` is the diver's;
    // `mote` is reused across the WHOLE plankton loop, `critter` across the whole
    // creature loop — many pushes per frame, one object each. `fieldCtx` is
    // filled once per frame, never per mote/creature.
    const sprite = { id: FRAME_IDS.diver[0], x: 0, y: 0, size: DIVER_SIZE, r: DIVER_TINT, g: DIVER_TINT, b: DIVER_TINT, alpha: 1, rot: 0 };
    const mote = { id: 'plankton-a', x: 0, y: 0, size: PLANKTON_SIZE, r: 1, g: 0.92, b: 0.72, alpha: 0.9, rot: 0 };
    const critter = { id: FRAME_IDS[CREATURES[0].id][0], x: 0, y: 0, size: CREATURE_SIZE, r: 1, g: 1, b: 1, alpha: 0.95, rot: 0 };
    const fieldCtx = { box: null, viewMetres: 0, cast: null, escalation: 1 };

    // Reused between render() and medium.draw() so no frame allocates.
    const lampUniform = { x: 0, y: 0, radius: 0 };
    const resolution = [1, 1];

    function render() {
      // Cached, not re-measured: viewport is only ever refreshed by the
      // resize/scroll/DPR-change handlers below, never here — this used to be
      // a forced layout (glx.resize() -> getBoundingClientRect()) on every
      // single frame.
      const { width, height, dpr } = viewport;
      const pal = paletteAt(depthM);

      // A bumper contact shakes the whole scene for WOBBLE_SECONDS, decaying
      // linearly to nothing. centreX replaces width/2 everywhere below (diver,
      // plankton, creatures, the lamp) so every actor shakes together, not just
      // the diver sprite. Amplitude is damped by CALM under reduced motion —
      // still readable as "something happened", just gentler.
      const shakeK = wobbleT > 0 ? wobbleT / WOBBLE_SECONDS : 0;
      const shakePx = shakeK > 0 ? Math.sin(performance.now() / 35) * WOBBLE_PX * shakeK * CALM : 0;
      const centreX = width / 2 + shakePx * dpr;

      // Diver + lamp in device pixels (top-left origin), shared by the medium
      // pass, the actor batch, and the lamp quad.
      const diverX = centreX + diver.pos().x * dpr;
      const diverY = height * DIVER_SCREEN_Y;
      const lampRadiusPx = lampSnap.radius * dpr;

      lampUniform.x = diverX;
      lampUniform.y = diverY;
      lampUniform.radius = lampRadiusPx;
      resolution[0] = width;
      resolution[1] = height;

      medium.draw({
        time: calmClock,          // rate-scaled already (see calmClock's decl) — never pops
        zoneA: pal.a,
        zoneB: pal.b,
        zoneMix: pal.mix,
        lamp: lampUniform,       // never undefined — a real object every frame
        resolution,
        water,
        hush: 1 - brownoutCalm,  // the vignette closes as the brownout hushes the water
        fuel: lampSnap.fuel,     // its own uniform: the shader can't derive it from a device-px radius
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
      const tick = Math.floor(now / FRAME_MS);   // which animation frame, shared by every actor
      for (const p of field.plankton) {
        mote.id = p.kind;
        mote.x = centreX + (p.x + Math.sin(now / 1000 + p.phase) * PLANKTON_DRIFT) * dpr;
        mote.y = height * DIVER_SCREEN_Y + (p.y - depthM) * PX_PER_METRE * dpr;
        mote.size = PLANKTON_SIZE * dpr;
        batch.push(mote);
      }

      // Creatures: same world->screen projection as plankton, plus per-kind
      // cosmetic motion (CREATURE_MOTION). It never touches c.x / c.y — a
      // fleeing 'shy' creature's real x already moved in
      // updateCreatureInteractions(); this is purely the on-screen wobble
      // layered on top, same as plankton's drift. CALM slows it under reduced
      // motion, exactly as it slows the water.
      const swimT = (now / 1000) * CALM;
      for (const c of field.creatures) {
        // Offset by the creature's own phase so a screenful doesn't flap in lockstep.
        critter.id = FRAME_IDS[c.id][(tick + Math.floor(c.phase * 10)) % F];
        const m = c.rare ? CREATURE_MOTION.rare : (CREATURE_MOTION[c.kind] || CREATURE_MOTION.drifter);
        const ph = swimT * (Math.PI * 2 / m.period) + c.phase;
        critter.x = centreX + (c.x + Math.sin(ph) * m.swayPx) * dpr;
        critter.y = height * DIVER_SCREEN_Y + ((c.y - depthM) * PX_PER_METRE + Math.cos(ph) * m.bobPx) * dpr;
        critter.rot = -Math.sin(ph) * m.tilt;   // follows the bob's direction: nose down on the way down
        critter.size = (CREATURE_SIZE
          + (c.rare ? CREATURE_RARE_BONUS : 0)
          + (c.kind === 'bumper' ? CREATURE_BUMPER_BONUS : 0)) * dpr;
        // Lit by the lamp (light.js): faint out in the dark, blazing in the
        // beam. lampUniform is already device px, the same space as critter.x/y.
        const lit = litAt(critter.x, critter.y, lampUniform, ambientFor(c.kind, water.ambient), water.emit);
        critter.r = lit;
        critter.g = lit;
        critter.b = lit;
        batch.push(critter);
      }

      sprite.id = FRAME_IDS.diver[tick % F];
      sprite.x = diverX;
      sprite.y = diverY;
      sprite.size = DIVER_SIZE * dpr;
      batch.push(sprite);
      batch.flush();
      // No lamp sprite pass any more: the lamp is drawn by the water shader
      // (medium.js), which lights the water and snow, while litAt() above
      // lights the creatures. The old glow quad painted over the actors.

      // Cheap even while hidden (menu state): hud.update() only writes when a
      // rounded value actually changed.
      hud.update({ depthM, fuel: lampSnap.fuel, best });
    }

    loop.start((dt) => {
      // Decay the bump wobble, its cooldown, and the sighting caption every
      // frame regardless of state, so a bump right before a brownout still
      // finishes fading instead of freezing mid-shake.
      if (wobbleT > 0) wobbleT = Math.max(0, wobbleT - dt);
      if (bumpCooldownT > 0) bumpCooldownT = Math.max(0, bumpCooldownT - dt);
      if (captionT > 0) {
        captionT = Math.max(0, captionT - dt);
        if (captionT === 0) {
          captionId = null;
          if (captionEl) captionEl.hidden = true;
        }
      }

      // The medium keeps drifting behind the menu too — ticked unconditionally,
      // same as the timers above. CALM is never negative, so neither is this.
      waterAt(depthM, water);
      calmClock += dt * CALM * water.calm * brownoutCalm;

      if (state === STATE.MENU) { render(); return; }

      const prevDepthM = depthM;
      const escalation = escalationAt(depthM);

      if (state === STATE.DIVING) {
        depthM = diver.update(dt, { sinkScale: 1 }).y;
        audio.setDepth(depthM);   // drone's cutoff falls, gain rises, as depth increases

        // Lamp fuel drains with depth; a depleted lamp latches `brownout` for a
        // single frame, which is our one-way ticket into the rescue state.
        const s = lamp.update(dt, { escalation });
        lampSnap.fuel = s.fuel;
        lampSnap.radius = s.radius;
        lampSnap.brownout = s.brownout;

        collectPickups();                       // splices motes, refuels per mote, sets diverMetres
        updateCreatureInteractions(dt);         // bumper fuel cost + wobble, rare sightings + caption

        if (depthM > best) best = depthM;

        if (s.brownout) {
          state = STATE.BROWNOUT;
          brownoutT = 0;
          brownoutFromM = depthM;
          brownoutFromR = lampSnap.radius;
          audio.brownout();                      // dip-and-recover, timed to brownout.js's beats
          writeBest(best);                       // checkpoint the run
        }
      } else if (state === STATE.BROWNOUT) {
        // Input is ignored (inputLocked). The lamp itself is NOT ticked — its
        // fuel stays at 0 — but what the player SEES is brownout.js's
        // timeline: the gutter, the hush down to a coal, the lift, the warm
        // relight. Depth is set from the timeline's rise rather than
        // integrated, so the 50 m is exact however the frames fall.
        brownoutT += dt;
        const b = brownoutAt(brownoutT, brownoutFromR);
        depthM = diver.nudge(brownoutFromM - BROWNOUT_RISE_M * b.rise - depthM).y;
        lampSnap.radius = b.radius;
        lampSnap.fuel = b.fuel;
        brownoutCalm = b.calm;
        if (brownoutT >= BROWNOUT_SECONDS) {
          brownoutCalm = 1;
          lamp.relight();                        // clears the latch, fuel -> 0.5
          lampSnap.fuel = lamp.fuel;
          lampSnap.radius = lamp.radius;
          lampSnap.brownout = false;
          state = STATE.DIVING;                  // play resumes — no game-over
          // The field's own depthM only ever moves by the clamped-at-zero
          // `descended` below, so the diver's real rise during the drift
          // (BROWNOUT_RISE_M) left it stranded that far ahead. Resync it to
          // the diver's real depth here, once, or every plankton/creature
          // spawns permanently too deep from this point on — see field.js's
          // resync() for the full story.
          field.resync(depthM);
          applyKeys();                           // a key still physically held
                                                 // must take effect now, not on
                                                 // the next press
        }
      }

      // The field is driven by METRES descended this frame, not by dt — that is
      // what makes mote density per-metre and independent of the sink rate.
      // Clamped at 0 so the upward rescue drift neither spawns nor mis-culls.
      const descended = Math.max(0, depthM - prevDepthM);
      fieldCtx.box = diver.box();                                  // only x0/x1 are used
      fieldCtx.viewMetres = cssVp.height / PX_PER_METRE;           // one screen-height of depth
      fieldCtx.cast = castAt(depthM);
      fieldCtx.escalation = escalation;
      field.step(descended, fieldCtx);
      render();
    });

    /* ---------- input ---------- */
    // The rescue (and, from Task 13, the menu) takes the wheel: steering is only
    // live while diving.
    const inputLocked = () => state !== STATE.DIVING;

    // Tilt (Task 12): off by default, drag is always the primary control. The
    // two inputs are never blended — precedence lives inside tilt.js itself
    // (a drag overrides tilt entirely for DRAG_OVERRIDE_MS after release), so
    // wiring here just forwards the same aim() a drag would call, gated by
    // the same inputLocked() a drag is gated by.
    const tilt = makeTilt({
      onAim: (sx, sy) => {
        if (inputLocked()) return;
        diver.aim(sx, sy);
      },
      getViewport: () => cssVp,   // cached object, no layout read — deviceorientation can fire fast
    });
    const tiltBtn = document.getElementById('dg-tilt');
    const tiltMsgEl = document.getElementById('dg-tilt-msg');
    let tiltMsgTimer = null;

    function showTiltMsg(text) {
      if (!tiltMsgEl) return;
      clearTimeout(tiltMsgTimer);
      tiltMsgEl.textContent = text;
      tiltMsgEl.hidden = false;
      tiltMsgTimer = setTimeout(() => { tiltMsgEl.hidden = true; }, TILT_MSG_SECONDS * 1000);
    }

    function syncTiltBtn() {
      if (!tiltBtn) return;
      if (!tilt.supported) {
        tiltBtn.disabled = true;
        tiltBtn.textContent = '📴';
        tiltBtn.setAttribute('aria-pressed', 'false');
        tiltBtn.setAttribute('aria-label', 'Tilt steering unavailable in this browser');
        return;
      }
      tiltBtn.setAttribute('aria-pressed', String(tilt.enabled));
      tiltBtn.setAttribute('aria-label', tilt.enabled ? 'Turn off tilt steering' : 'Turn on tilt steering');
      tiltBtn.textContent = tilt.enabled ? '📲' : '📴';
    }
    syncTiltBtn();

    if (tiltBtn && tilt.supported) {
      tiltBtn.addEventListener('click', () => {
        if (tilt.enabled) {
          tilt.disable();
          syncTiltBtn();
          return;
        }
        // enable() is called directly from this click, synchronously — not
        // after any other await — because iOS only honours the permission
        // prompt when the request happens inside the gesture's own call stack.
        tilt.enable().then((ok) => {
          syncTiltBtn();
          if (!ok) showTiltMsg("Tilt isn't available on this device.");
        });
      });

      // A stored preference from an earlier visit gets one silent best-effort
      // attempt, never a fresh prompt: this call runs outside any user gesture,
      // so on iOS it simply fails quietly (enable() resolves false) and the
      // toggle stays off until the player taps it themselves. On platforms with
      // no permission gate (desktop, most Android) this is what actually
      // restores tilt across reloads. No toast here — this isn't a tap.
      if (tiltPreferred()) tilt.enable().then(syncTiltBtn);
    }

    function pointerPos(e) {
      // Cached rect — was a getBoundingClientRect() on every single
      // pointermove, forcing layout on every move event of every drag.
      return { x: e.clientX - canvasRect.left, y: e.clientY - canvasRect.top };
    }
    canvas.addEventListener('pointerdown', (e) => {
      audio.unlock();   // any gesture may need to pull a Safari-suspended context back to 'running'
      if (inputLocked()) return;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not all engines */ }
      const p = pointerPos(e);
      diver.aim(p.x, p.y);
      tilt.noteDrag();   // this drag now outranks tilt for DRAG_OVERRIDE_MS after release
    });
    canvas.addEventListener('pointermove', (e) => {
      // No pressure/button gate: a touch pointermove only fires while the finger is
      // down, and phones without Force Touch report e.pressure === 0 the whole drag.
      if (inputLocked()) return;
      const p = pointerPos(e);
      diver.aim(p.x, p.y);
      tilt.noteDrag();
    });

    const keys = { ArrowLeft: 0, ArrowRight: 0, ArrowUp: 0, ArrowDown: 0, a: 0, d: 0, w: 0, s: 0 };
    function applyKeys() {
      if (inputLocked()) { diver.setThrust(0, 0); return; }
      const x = (keys.ArrowRight || keys.d) - (keys.ArrowLeft || keys.a);
      const y = (keys.ArrowDown || keys.s) - (keys.ArrowUp || keys.w);
      diver.setThrust(Math.sign(x), Math.sign(y));
    }
    window.addEventListener('keydown', (e) => {
      audio.unlock();   // any gesture may need to pull a Safari-suspended context back to 'running'
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

    // Re-measure on 'resize' only (asteroid-run's own convention) — one
    // getBoundingClientRect() feeds cssVp, viewport (via glx.resize) and
    // canvasRect all at once. No render() call here: the loop above renders
    // every frame regardless of state, so the very next rAF (≤ ~16ms away)
    // already picks up the new dims — calling render() here too was a
    // redundant second draw on every resize.
    function measure() {
      canvasRect = canvas.getBoundingClientRect();
      cssVp = { width: Math.max(1, canvasRect.width), height: Math.max(1, canvasRect.height) };
      viewport = glx.resize(canvasRect);
      diver.setViewport(cssVp);
    }
    window.addEventListener('resize', measure);

    // A resize handler alone misses two cases: the canvas's on-screen
    // POSITION (not size) changing under scroll — which is all pointerPos's
    // cached canvasRect actually needs — and the device pixel ratio changing
    // without any 'resize' firing at all (dragging the window to a monitor
    // with a different DPR). 'scroll' covers the first cheaply; the
    // self-reattaching matchMedia listener below covers the second.
    window.addEventListener('scroll', () => {
      canvasRect = canvas.getBoundingClientRect();
    }, { passive: true });

    if (typeof matchMedia === 'function') {
      let dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      const onDprChange = () => {
        measure();
        dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        dprQuery.addEventListener('change', onDprChange, { once: true });
      };
      dprQuery.addEventListener('change', onDprChange, { once: true });
    }

    // A THIRD case a resize/scroll/DPR listener alone misses: the webfont
    // (assets/styles.css: Press Start 2P, `display=swap`) swapping in after
    // first paint. `.aa-game-top` sits in normal flow directly above
    // `.dg-stage-wrap`, so the metrics change reflows the canvas down — and
    // no 'resize' or 'scroll' event fires for a font swap. Left unhandled,
    // canvasRect goes stale for exactly the window (~1-2s after first paint)
    // a player is most likely to tap Start, so every drag/aim computes
    // against the pre-swap canvas position: steering reads as subtly,
    // silently wrong until something else happens to trigger a re-measure.
    // Guarded because document.fonts is missing on some engines — on those,
    // the resize/scroll/DPR triggers above still cover the normal cases.
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measure).catch(() => { /* measure() is unlikely to throw; keep the console clean either way */ });
      }
    } catch { /* no Font Loading API — the resize/scroll refreshes still cover us */ }

    // Persist the best depth when the page goes away mid-dive — a brownout is the
    // normal checkpoint, but a kid closing the tab shouldn't lose their record.
    window.addEventListener('pagehide', () => writeBest(best));

    try { canvas.focus(); } catch { /* focus can throw in odd embeddings */ }
  }
}
