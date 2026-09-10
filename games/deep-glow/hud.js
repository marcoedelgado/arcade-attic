// hud.js — the in-dive readout: depth in metres, a lamp fuel meter, and the
// best-depth line. Plain DOM, not drawn into the WebGL canvas — text stays
// crisp at any DPR and there is no font atlas to build for it. makeHud(host)
// builds the three nodes ONCE and appends them to `host`; the returned
// update() only ever writes textContent and one CSS custom property, so a
// long dive never rebuilds or re-walks the DOM tree it made at boot.

export function makeHud(host) {
  const root = document.createElement('div');
  root.className = 'dg-hud';
  root.hidden = true;

  const depthEl = document.createElement('div');
  depthEl.className = 'dg-hud-depth';

  const meter = document.createElement('div');
  meter.className = 'dg-hud-meter';
  meter.setAttribute('role', 'img');
  meter.setAttribute('aria-label', 'Lamp fuel');
  const meterFill = document.createElement('div');
  meterFill.className = 'dg-hud-meter-fill';
  meter.appendChild(meterFill);

  const bestEl = document.createElement('div');
  bestEl.className = 'dg-hud-best';

  root.append(depthEl, meter, bestEl);
  if (host) host.appendChild(root);

  // Last-written values, so a frame that hasn't actually changed anything
  // (the common case for `best`, and for `depth`/`fuel` once rounded) skips
  // the DOM write entirely instead of touching textContent/style every tick.
  let lastDepthText = '';
  let lastBestText = '';
  let lastPct = -1;

  return {
    // { depthM, fuel (0..1), best } — called from the frame loop every tick
    // while diving; cheap to call even while hidden.
    update({ depthM = 0, fuel = 1, best = 0 } = {}) {
      const depthText = `${Math.floor(depthM)} m`;
      if (depthText !== lastDepthText) {
        depthEl.textContent = depthText;
        lastDepthText = depthText;
      }

      const pct = Math.round(Math.max(0, Math.min(1, fuel)) * 100);
      if (pct !== lastPct) {
        meterFill.style.setProperty('--fuel-pct', `${pct}%`);
        meter.setAttribute('aria-valuenow', String(pct));
        lastPct = pct;
      }

      const bestText = `Best ${Math.floor(best)} m`;
      if (bestText !== lastBestText) {
        bestEl.textContent = bestText;
        lastBestText = bestText;
      }
    },

    show() { root.hidden = false; },
    hide() { root.hidden = true; },
  };
}
