// ship.js — pure over an injected camera + viewport. Owns the ship's world
// position, the frame-rate-independent eased follow toward a target, the shield
// count and the invulnerability window. game.js forwards DOM events as the
// semantic aim() / setThrust() calls below.

export const MAX_SPEED = 520;       // world u/s — MUST equal fairness.js SHIP_SPEED
const COCKPIT_Z = 60;               // the ship's fixed depth (the collision plane)
const FOLLOW = 12;                  // eased-follow rate; higher = snappier, no overshoot
const REST_FRACTION = 0.78;         // resting screen height (fraction of canvas)
const BOX_TOP = 0.30;               // movement box, fractions of canvas height
const BOX_BOTTOM = 0.92;
const BOX_X_MARGIN = 30;            // px kept clear at the screen edges
const TOUCH_OFFSET = 90;            // px the ship rides above a finger
const MOUSE_OFFSET = 30;
const ROLL_FACTOR = 0.22;           // camera roll per unit of lateral velocity
const START_SHIELDS = 3;
const INVULN_MS = 900;

export function makeShip({ camera, viewport }) {
  let vp = viewport;
  let pos = restPos();
  let prevX = pos.x;
  let target = { ...pos };
  let thrust = { x: 0, y: 0 };
  let shields = START_SHIELDS;
  let invulnMs = 0;
  let banking = 0;

  function worldAt(screenX, screenY) {
    return camera.unproject(screenX, screenY, COCKPIT_Z);
  }
  function restPos() {
    return worldAt(vp.width / 2, vp.height * REST_FRACTION);
  }
  function boxAt() {
    const left = worldAt(BOX_X_MARGIN, vp.height * BOX_TOP);
    const right = worldAt(vp.width - BOX_X_MARGIN, vp.height * BOX_TOP);
    const top = worldAt(vp.width / 2, vp.height * BOX_TOP);
    const bottom = worldAt(vp.width / 2, vp.height * BOX_BOTTOM);
    return { x0: left.x, x1: right.x, y0: top.y, y1: bottom.y };
  }
  function clampBox(p) {
    const b = boxAt();
    p.x = Math.max(b.x0, Math.min(b.x1, p.x));
    p.y = Math.max(b.y0, Math.min(b.y1, p.y));
  }

  return {
    aim(screenX, screenY, kind) {
      const off = kind === 'touch' ? TOUCH_OFFSET : MOUSE_OFFSET;
      target = worldAt(screenX, screenY - off);
      clampBox(target);
    },
    setThrust(x, y) { thrust = { x, y }; },

    update(dt) {
      if (thrust.x || thrust.y) {
        target.x += thrust.x * MAX_SPEED * dt;
        target.y += thrust.y * MAX_SPEED * dt;
        clampBox(target);
      }
      const a = 1 - Math.exp(-FOLLOW * dt);
      pos.x += (target.x - pos.x) * a;
      pos.y += (target.y - pos.y) * a;
      clampBox(pos);

      let vx = 0;
      if (dt > 0) {
        vx = (pos.x - prevX) / dt;
        prevX = pos.x;
        banking += ((Math.max(-1, Math.min(1, vx / MAX_SPEED))) - banking) * a;
        camera.setRoll(-vx * ROLL_FACTOR / MAX_SPEED * 40);
      }

      if (invulnMs > 0) invulnMs = Math.max(0, invulnMs - dt * 1000);

      return { x: pos.x, y: pos.y, vx, banking };
    },

    worldPos() { return { x: pos.x, y: pos.y, z: COCKPIT_Z }; },
    box() { return boxAt(); },

    hit() {
      if (invulnMs > 0) return false;
      shields -= 1;
      invulnMs = INVULN_MS;
      return true;
    },
    refillShields() { shields = START_SHIELDS; },
    setViewport(next) { vp = next; },
    reset() {
      vp = viewport;
      pos = restPos();
      prevX = pos.x;
      target = { ...pos };
      thrust = { x: 0, y: 0 };
      shields = START_SHIELDS;
      invulnMs = 0;
      banking = 0;
    },
    get shields() { return shields; },
    get invulnerable() { return invulnMs > 0; },
  };
}
