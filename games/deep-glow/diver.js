// diver.js — the little glowing fish the player steers, and nothing else. PURE:
// imports nothing, touches no browser global, no RNG. game.js forwards DOM events
// as the semantic aim() / setThrust() calls below and reads back one snapshot per
// frame. Verified headless by tests/deep-glow.test.mjs.
//
// World model (spec §2.2): `x` is a horizontal offset in pixels, 0 at the screen
// centre, positive to the right. `y` is DEPTH in metres, increasing DOWNWARD —
// and the diver's `y` IS the score. The diver always sinks: steering "up" only
// throttles the descent toward SINK_UP_MIN of the base rate, it never reverses it.
//
// The camera is a plain vertical follow — game.js keeps the diver at a fixed
// screen fraction and scrolls the world past — so vertical steering does not move
// the diver on screen, it modulates the sink rate. Horizontal steering is a
// frame-rate-independent eased follow toward the aim target, clamped to a
// movement box: the same shape as games/asteroid-run/ship.js.

const SINK_RATE = 34;        // m/s — base descent at neutral vertical steering
const FOLLOW = 10;           // eased-follow rate; applied as 1 - exp(-FOLLOW * dt)
const TOUCH_OFFSET = 90;     // px the aim point rides below the finger, so a thumb never covers the diver
const BOX_TOP = 0.20;        // movement / steering band, as fractions of viewport height
const BOX_BOTTOM = 0.80;
const BOX_X_MARGIN = 28;     // px kept clear at the left and right edges
const KEY_PAN = 320;         // px/s the keyboard thrust nudges the aim target (no test pins this rate)
const SINK_UP_MIN = 0.15;    // fully "up": descent throttled to this fraction of SINK_RATE — never 0
const SINK_DOWN_MAX = 1.7;   // fully "down": descent boosted to this multiple of SINK_RATE

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// restFraction — the screen fraction the diver actually renders at (game.js's
// DIVER_SCREEN_Y). It is the NEUTRAL vertical-aim point: a finger sitting where
// it naturally rests, holding the fish steady, must read as "sink normally", not
// "steer up". Defaulted here so diver.js stays pure — game.js passes its own
// constant in, it is never imported.
export function makeDiver({ viewport, restFraction = 0.42 }) {
  let vp = viewport;

  // Horizontal: screen-centre-relative pixels. steerX is what pos()/render read;
  // targetX is where aim()/thrust want it, always kept pre-clamped to the box.
  let steerX = 0;
  let targetX = 0;
  let prevX = 0;
  let lastVx = 0;

  // Vertical: absolute screen pixels from the top. Mid-band is neutral (sink ×1).
  let steerY = midBand();
  let targetY = midBand();

  let y = 0;                     // depth, metres — the score
  let thrust = { x: 0, y: 0 };

  // Neutral vertical line: where the diver renders, not the geometric middle of
  // the steering box. Used both to seed steerY/targetY and as the zero point of
  // the sink-rate band below.
  function midBand() { return vp.height * restFraction; }

  function box() {
    const half = vp.width / 2;
    return {
      x0: -(half - BOX_X_MARGIN),
      x1: half - BOX_X_MARGIN,
      y0: vp.height * BOX_TOP,
      y1: vp.height * BOX_BOTTOM,
    };
  }

  function clampTargets() {
    const b = box();
    targetX = clamp(targetX, b.x0, b.x1);
    targetY = clamp(targetY, b.y0, b.y1);
  }

  return {
    // Screen coords, origin top-left. The aim point is lifted TOUCH_OFFSET px so a
    // finger never sits on the diver. A drag that runs off the canvas edge still
    // calls this with out-of-range values — the box clamp keeps the diver in view
    // and steering continues, it does not freeze.
    aim(sx, sy) {
      targetX = sx - vp.width / 2;
      targetY = sy - TOUCH_OFFSET;
      clampTargets();
    },

    // Keyboard / gamepad: a unit thrust vector, integrated into the aim target in
    // update(). y < 0 is "up" (slows the sink), matching a smaller screen y.
    setThrust(x, y) { thrust = { x, y }; },

    // dt in seconds, pre-clamped by loop.js. update(0) MUST be a pure snapshot:
    // every piece of state (steerX, steerY, prevX, lastVx, y) only ever changes
    // inside `if (dt > 0)`. asteroid-run shipped a bug here — update(0) quietly
    // zeroed the camera roll (fix a5beb72) — so the whole body is gated, not just
    // the eased-follow term that happens to be a no-op at dt === 0.
    update(dt, { sinkScale = 1 } = {}) {
      if (dt > 0) {
        if (thrust.x || thrust.y) {
          targetX += thrust.x * KEY_PAN * dt;
          targetY += thrust.y * KEY_PAN * dt;
          clampTargets();
        }

        const a = 1 - Math.exp(-FOLLOW * dt);
        const b = box();
        const nextX = clamp(steerX + (targetX - steerX) * a, b.x0, b.x1);
        steerY += (targetY - steerY) * a;

        lastVx = (nextX - prevX) / dt;
        prevX = nextX;
        steerX = nextX;

        // Vertical steer -> descent multiplier. band is -1 at the top of the
        // box, 0 at the diver's REST LINE (midBand, == render position), +1 at
        // the bottom. The zero point is the rest line, not the geometric middle
        // of the box, so "hold still" means "sink normally". The two sides are
        // scaled independently so both extremes still reach exactly ±1 even
        // though the rest line sits above centre. The sink is only throttled or
        // boosted, never reversed: the multiplier stays strictly positive.
        const mid = midBand();
        const span = steerY < mid ? (mid - b.y0) : (b.y1 - mid);
        const band = clamp(span > 0 ? (steerY - mid) / span : 0, -1, 1);
        const mult = 1 + band * (band < 0 ? (1 - SINK_UP_MIN) : (SINK_DOWN_MAX - 1));
        y += SINK_RATE * sinkScale * mult * dt;
      }
      return { x: steerX, y, vx: lastVx };
    },

    box,
    pos() { return { x: steerX, y }; },

    // Move the diver's depth directly, outside the normal sink integration, and
    // return the new snapshot. game.js uses this for the brownout rescue: a
    // negative dm drifts the diver back up toward the surface while input is
    // ignored. Depth is the score, so it is floored at 0 — the rescue can lift
    // you toward the light but never above it.
    nudge(dm) {
      y = Math.max(0, y + dm);
      return { x: steerX, y, vx: lastVx };
    },

    setViewport(next) {
      vp = next;
      const b = box();
      steerX = clamp(steerX, b.x0, b.x1);
      steerY = clamp(steerY, b.y0, b.y1);
      prevX = steerX;
      clampTargets();
    },

    reset() {
      vp = viewport;
      steerX = 0;
      targetX = 0;
      prevX = 0;
      lastVx = 0;
      steerY = midBand();
      targetY = midBand();
      y = 0;
      thrust = { x: 0, y: 0 };
    },
  };
}
