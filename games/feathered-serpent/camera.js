// camera.js — pure. No DOM, no canvas, no clock. The chase camera: project a
// world point (x, y, z) to the screen, where larger z is further away.
//
// Copied verbatim from games/asteroid-run/camera.js apart from this comment and
// the tuning constants below. This is the SECOND consumer of that seam, and the
// duplication is deliberate — see spec §3 and §10. We are not extracting a shared
// assets/ module yet, because this game also copies loop.js from deep-glow, and
// the right shared surface is not obvious until both call sites work.
//
// body.js leans on this hard: each serpent segment is just an older head position
// pushed through project(), so segments further back get a larger z and shrink
// toward the horizon for free.

const FOCAL = 260;              // TUNABLE — focal length at the reference height
const REFERENCE_HEIGHT = 720;   // world constants are tuned against this height
const HORIZON_FRACTION = 0.42;  // horizonY as a fraction of canvas height (above centre)

export function makeCamera({ width, height }) {
  let w = width;
  let h = height;
  let centerX = w / 2;
  let horizonY = h * HORIZON_FRACTION;
  let unitScale = h / REFERENCE_HEIGHT;
  let rollOffset = 0;

  const scaleAt = (z) => (FOCAL * unitScale) / z;

  return {
    project(x, y, z) {
      const scale = scaleAt(z);
      return {
        sx: centerX + x * scale + rollOffset,
        sy: horizonY + y * scale,
        scale,
      };
    },
    unproject(sx, sy, z) {
      const scale = scaleAt(z);
      return {
        x: (sx - centerX - rollOffset) / scale,
        y: (sy - horizonY) / scale,
      };
    },
    setRoll(amount) {
      rollOffset = amount;
    },
    resize(next) {
      w = next.width;
      h = next.height;
      centerX = w / 2;
      horizonY = h * HORIZON_FRACTION;
      unitScale = h / REFERENCE_HEIGHT;
    },
  };
}
