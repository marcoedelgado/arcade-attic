// loop.js — the frame clock. start(step) / stop(). Hides the rAF lifecycle, the
// 50ms delta clamp and the tab-visibility pause behind one interface. The time
// source is injectable so the clamp and the pause are testable headless.

const MAX_DT_MS = 50;

export function makeLoop({
  now = () => performance.now(),
  raf = requestAnimationFrame,
  caf = cancelAnimationFrame,
  hidden = () => (typeof document !== 'undefined' && document.hidden),
} = {}) {
  let handle = 0;
  let last = 0;
  let running = false;
  let step = () => {};

  function frame() {
    const t = now();
    if (hidden()) {
      last = t; // keep the baseline current so the return frame is a small dt
    } else {
      const dt = Math.min(MAX_DT_MS, t - last) / 1000;
      last = t;
      step(dt);
    }
    if (running) handle = raf(frame);
  }

  return {
    start(fn) {
      step = fn;
      running = true;
      last = now();
      handle = raf(frame);
    },
    stop() {
      running = false;
      caf(handle);
    },
  };
}
