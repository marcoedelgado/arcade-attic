// toaster.js — one waffle toasting in a slot. Pure: no DOM, no requestAnimation-
// Frame, no clock. A slot is created when a waffle drops and discarded on reset,
// so an "empty slot" is just the absence of one of these. The adapter owns the
// rAF loop and calls tick(dtMs) each frame; the settle animation is the adapter's
// business too — the settled value is known the instant you eject.

import { isBurnt } from './scoring.js';

// Residual heat: doneness keeps climbing this much after the waffle leaves the
// slot. The "every shipped order is servable" test imports this rather than
// keeping its own copy in sync.
export const CARRYOVER = 8;

const clamp = (n) => Math.max(0, Math.min(100, n));

// order: { band: [lo, hi], meterRate }
export function makeSlot(order) {
  const rate = order.meterRate ?? 14;
  let value = 0;
  let phase = 'toasting';   // 'toasting' | 'plated' | 'burnt'
  let settled = null;

  return {
    // advance the toast by dtMs of cooking; inert once ejected. A waffle left in
    // long enough burns in the slot on its own — no eject needed.
    tick(dtMs) {
      if (phase !== 'toasting') return;
      value = clamp(value + rate * (dtMs / 1000));
      if (isBurnt(value, order.band)) {
        settled = value;   // frozen where it crossed — the eject carryover never applies
        phase = 'burnt';
      }
    },

    // pull the waffle: fixes the settled doneness (raw + carryover) and moves to
    // plated or burnt. Idempotent — a second call just returns the same result.
    eject() {
      if (phase === 'toasting') {
        settled = clamp(value + CARRYOVER);
        phase = isBurnt(settled, order.band) ? 'burnt' : 'plated';
      }
      return { settled, burnt: phase === 'burnt' };
    },

    // snapshot for the meter, the plate and the adapter's "is this slot busy" checks
    status() {
      return { phase, value: settled ?? value, settled, band: order.band };
    },
  };
}
