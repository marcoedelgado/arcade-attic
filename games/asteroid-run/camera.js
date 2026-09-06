// camera.js — pure. No DOM, no canvas, no clock. makeCamera() returns an
// instance; game.js creates one and passes it to field / ship / collision /
// render, and calls resize() on it. Same shape as waffle-wednesday's makeSlot.

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
