// lamp.js — the diver's lamp: fuel that drains as you descend, the light radius
// it produces, and the "brownout" latch when the fuel runs dry. PURE: imports
// nothing, touches no browser global, no RNG. game.js reads one snapshot per frame
// and calls refuel(), bump(), or relight() on events. Verified headless by
// tests/deep-glow.test.mjs.

const DRAIN_PER_SEC = 0.055;     // fuel/s, scaled by escalation
const REFUEL = 0.14;              // fuel gained per pickup
const BUMP_COST = 0.22;           // fuel lost per creature bump
const RADIUS_MIN = 60;            // pixels: minimum light radius (never fully dark)
const RADIUS_MAX = 300;           // pixels: maximum light radius at full fuel

export function makeLamp() {
  let fuel = 1;                    // 0–1, starts full
  let hasBrownedOut = false;       // latch: tracks if we've already fired brownout

  return {
    update(dt, { escalation = 1 } = {}) {
      if (dt > 0) {
        fuel -= DRAIN_PER_SEC * escalation * dt;
        if (fuel < 0) fuel = 0;
      }

      // Brownout latch: fire when fuel is depleted, regardless of what caused it
      // (drain or bump). State-based check ensures next update() picks up fuel
      // zeroed by bump() without requiring a transition.
      let brownout = false;
      if (fuel <= 0 && !hasBrownedOut) {
        brownout = true;
        hasBrownedOut = true;
      }

      // Radius is a linear map of fuel to pixels, floored at RADIUS_MIN
      const radius = Math.max(RADIUS_MIN, RADIUS_MIN + (RADIUS_MAX - RADIUS_MIN) * fuel);

      return {
        fuel,
        radius,
        brownout,
      };
    },

    refuel(n) {
      fuel += n;
      if (fuel > 1) fuel = 1;
    },

    bump() {
      fuel -= BUMP_COST;
      if (fuel < 0) fuel = 0;
    },

    relight() {
      fuel = 0.5;
      hasBrownedOut = false;
    },

    reset() {
      fuel = 1;
      hasBrownedOut = false;
    },

    get fuel() { return fuel; },
    get radius() {
      return Math.max(RADIUS_MIN, RADIUS_MIN + (RADIUS_MAX - RADIUS_MIN) * fuel);
    },
  };
}
