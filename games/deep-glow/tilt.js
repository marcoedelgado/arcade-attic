// tilt.js — optional tilt-to-steer. A thin ADAPTER over DeviceOrientationEvent,
// not a pure module like diver.js: it touches window/localStorage directly and
// is never unit-tested (a browser-API adapter, per the plan). It exists purely
// to turn gamma/beta angles into the same CSS-pixel screen-space aim target a
// pointer drag already produces, via the onAim(sx, sy) callback — diver.aim()
// never knows which input drove it.
//
// Precedence (spec §5): tilt drives the aim target CONTINUOUSLY; a drag
// overrides it entirely while the finger is down and for DRAG_OVERRIDE_MS after
// release, then tilt resumes from wherever the diver was left. The two inputs
// are never added or blended — summing them would fight over the same target
// and jitter. game.js calls noteDrag() from its own pointerdown/pointermove
// handlers (the ones that already call diver.aim() directly); the
// deviceorientation handler here just checks how long ago that was.
//
// Calibration: the very first real reading after enable() becomes the neutral
// pose, so however the kid is already holding the phone reads as "aim
// straight ahead" — without this, any natural non-flat hold would fight the
// drag from the first frame. A small deadzone around that neutral pose absorbs
// hand tremor so it never steers on its own.

const STORAGE_KEY = 'deep-glow:tilt';
const PERMISSION_TIMEOUT_MS = 1500;  // plenty of devices have no sensor and never fire at all
const DRAG_OVERRIDE_MS = 600;        // how long a drag keeps priority after release
const DEADZONE_DEG = 2.5;            // hand tremor under this reads as dead centre
const GAMMA_RANGE_DEG = 22;          // left/right tilt, degrees from calibrated centre, mapped to full width
const BETA_RANGE_DEG = 16;           // fore/aft tilt, degrees from calibrated centre, mapped to full height

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// localStorage throws on ACCESS (not just writes) in private-mode Safari, so
// every read and every write is wrapped — same pattern as audio.js/game.js.
function readPref() {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}
function writePref(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false'); } catch { /* private mode */ }
}

function hasOrientationSupport() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

// iOS 13+ Safari gates deviceorientation behind an explicit permission prompt;
// every other engine (desktop, Android Chrome/Firefox) has no such method and
// fires events freely. Returns a Promise<'granted' | 'denied'> either way, so
// callers don't need to branch on which platform they're on.
function requestPermission() {
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    return DOE.requestPermission();
  }
  return Promise.resolve('granted');
}

// getViewport — a () => { width, height } in CSS px, matching game.js's
// cssViewport()/the diver's own viewport. Needed to convert gamma/beta into the
// same canvas-relative CSS-pixel coordinates diver.aim(sx, sy) expects from a
// drag; tilt.js has no DOM access to the canvas itself, so the caller supplies it.
export function makeTilt({ onAim, getViewport }) {
  const supported = hasOrientationSupport();
  let enabled = false;
  let handler = null;      // the live deviceorientation listener, or null when disabled
  let calib = null;        // { gamma, beta } captured from the first reading after enable()
  let lastDragMs = -Infinity;

  function apply(e) {
    if (!calib) return;                 // defensive — enable() always seeds this before wiring `handler`
    if (e.gamma == null || e.beta == null) return;

    // A recent or ongoing drag wins outright. No blending: adding the two
    // targets together is exactly what makes the diver jitter between them.
    if (performance.now() - lastDragMs < DRAG_OVERRIDE_MS) return;

    let dg = e.gamma - calib.gamma;
    let db = e.beta - calib.beta;
    dg = Math.abs(dg) < DEADZONE_DEG ? 0 : dg - Math.sign(dg) * DEADZONE_DEG;
    db = Math.abs(db) < DEADZONE_DEG ? 0 : db - Math.sign(db) * DEADZONE_DEG;

    const fx = clamp(dg / GAMMA_RANGE_DEG, -1, 1);
    const fy = clamp(db / BETA_RANGE_DEG, -1, 1);

    const vp = getViewport();
    const sx = clamp(vp.width / 2 + fx * (vp.width / 2), 0, vp.width);
    const sy = clamp(vp.height / 2 + fy * (vp.height / 2), 0, vp.height);
    onAim(sx, sy);
  }

  return {
    // Resolves true once tilt is live and steering, false on ANY failure —
    // unsupported platform, denied permission, or a permission grant that
    // never actually produces a reading (no sensor). A caller must treat
    // false as "leave the toggle off"; this function never leaves a listener
    // attached when it resolves false.
    enable() {
      if (enabled) return Promise.resolve(true);
      if (!supported) return Promise.resolve(false);

      let permPromise;
      try {
        // Called SYNCHRONOUSLY here, as part of this very invocation of
        // enable() — not after an await. game.js's click handler calls
        // enable() directly from the tap, so this call is still inside that
        // gesture's call stack, which is what iOS requires to honour the
        // permission prompt at all.
        permPromise = requestPermission();
      } catch {
        return Promise.resolve(false);
      }

      return permPromise
        .then((result) => {
          if (result !== 'granted') return false;

          // Wait for one real reading (both gamma and beta present) before
          // declaring success — plenty of devices grant the permission (or
          // have no gate at all) but have no sensor and simply never fire.
          // That first real reading doubles as calibration: it becomes the
          // neutral pose, so it must not be discarded once we've waited for it.
          return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
              if (settled) return;
              settled = true;
              window.removeEventListener('deviceorientation', onFirst);
              resolve(false);
            }, PERMISSION_TIMEOUT_MS);

            function onFirst(e) {
              if (settled) return;
              if (e.gamma == null && e.beta == null) return;   // keep waiting for a real one
              settled = true;
              clearTimeout(timer);
              window.removeEventListener('deviceorientation', onFirst);
              calib = { gamma: e.gamma ?? 0, beta: e.beta ?? 0 };
              lastDragMs = -Infinity;
              handler = apply;
              window.addEventListener('deviceorientation', handler);
              enabled = true;
              writePref(true);
              resolve(true);
            }
            window.addEventListener('deviceorientation', onFirst);
          });
        })
        .catch(() => false);
    },

    // Removes the listener outright — never leaves it running and ignored.
    disable() {
      if (handler) {
        window.removeEventListener('deviceorientation', handler);
        handler = null;
      }
      enabled = false;
      calib = null;
      writePref(false);
    },

    // Called from game.js's own pointerdown/pointermove handlers, the moment a
    // drag actually moves the aim target — this is the one timestamp the
    // precedence rule needs.
    noteDrag() {
      lastDragMs = performance.now();
    },

    get enabled() { return enabled; },

    // Not part of the task's nominal interface, but game.js needs a way to
    // disable the toggle button instead of letting a click do nothing when
    // DeviceOrientationEvent doesn't exist at all — same shape as audio.js's
    // `supported`.
    supported,
  };
}

// Exposed so game.js can decide whether to even attempt a silent re-enable on
// load without duplicating the storage key/format here.
export function tiltPreferred() {
  return readPref();
}
