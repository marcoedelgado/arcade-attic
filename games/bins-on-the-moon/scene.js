import { BINS } from './levels.js';

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

export function buildScene(root, binIds) {
  root.replaceChildren();
  root.classList.add('bm-scene');

  const reduce = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Backdrop
  el('div', 'bm-stars', root);
  el('div', 'bm-earth', root);
  const craters = el('div', 'bm-craters', root);
  el('div', 'bm-crater bm-crater-a', craters);
  el('div', 'bm-crater bm-crater-b', craters);
  el('div', 'bm-ground', root);

  // Progress pips
  const progressEl = el('div', 'bm-progress', root);

  // Item pad
  const padEl = el('div', 'bm-pad', root);

  // Mascot
  const mascotEl = el('div', 'bm-mascot', root);
  mascotEl.textContent = '🧑‍🚀';
  mascotEl.dataset.mood = 'idle';

  // Bins (only the active ones, in BINS order)
  const binRow = el('div', 'bm-bins', root);
  const binEls = new Map();
  for (const def of BINS) {
    if (!binIds.includes(def.id)) continue;
    const bin = el('button', 'bm-bin', binRow);
    bin.type = 'button';
    bin.dataset.bin = def.id;
    bin.style.setProperty('--bin-color', def.color);
    bin.setAttribute('aria-label', def.label);
    el('div', 'bm-bin-lid', bin);
    const face = el('div', 'bm-bin-face', bin);
    face.textContent = def.icon;
    binEls.set(def.id, bin);
  }

  function setProgress(done, total) {
    progressEl.replaceChildren();
    for (let i = 0; i < total; i++) {
      const pip = el('div', 'bm-pip', progressEl);
      if (i < done) pip.classList.add('is-done');
    }
  }

  function binRects() {
    return [...binEls.entries()].map(([id, node]) => ({
      id,
      rect: node.getBoundingClientRect(),
    }));
  }

  // The rectangle (root-local px) that drifting items may roam in: below the
  // top HUD row, above the bins.
  function playBounds() {
    const host = root.getBoundingClientRect();
    let binTop = host.height;
    for (const bin of binEls.values()) {
      binTop = Math.min(binTop, bin.getBoundingClientRect().top - host.top);
    }
    return { left: 8, top: 46, right: host.width - 8, bottom: binTop - 6 };
  }

  function setMascot(mood) {
    mascotEl.dataset.mood = mood;
    mascotEl.textContent = mood === 'cheer' || mood === 'jump' ? '🙌' : mood === 'oops' ? '🤷' : '🧑‍🚀';
  }

  function restart(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    const clear = () => node.classList.remove(cls);
    node.addEventListener('animationend', clear, { once: true });
    setTimeout(clear, 1200);           // fallback: animationend won't fire under `animation: none`
  }

  function pulseBin(id) {
    const bin = binEls.get(id);
    if (bin) restart(bin, 'bm-bin-pulse');
  }

  function wiggleBin(id) {
    const bin = binEls.get(id);
    if (bin) restart(bin, 'bm-bin-wiggle');
  }

  function arcTo(id, fromEl) {
    const bin = binEls.get(id);
    if (!bin) return;
    const host = root.getBoundingClientRect();
    const a = fromEl.getBoundingClientRect();
    const b = bin.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - host.left;
    const y1 = a.top + a.height / 2 - host.top;
    const x2 = b.left + b.width / 2 - host.left;
    const y2 = b.top + b.height / 2 - host.top;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'bm-arc');
    svg.setAttribute('width', String(host.width));
    svg.setAttribute('height', String(host.height));
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const midX = (x1 + x2) / 2;
    const midY = Math.min(y1, y2) - 40;
    path.setAttribute('d', `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`);
    svg.appendChild(path);
    root.appendChild(svg);
    setTimeout(() => svg.remove(), 1600);
  }

  function spawnSparkle(id) {
    if (reduce) return;
    const bin = binEls.get(id);
    if (!bin) return;
    const host = root.getBoundingClientRect();
    const b = bin.getBoundingClientRect();
    const cx = b.left + b.width / 2 - host.left;
    const cy = b.top - host.top;
    for (let i = 0; i < 8; i++) {
      const s = el('div', 'bm-sparkle', root);
      const ang = (Math.PI * 2 * i) / 8;
      s.style.left = `${cx}px`;
      s.style.top = `${cy}px`;
      s.style.setProperty('--dx', `${Math.cos(ang) * 40}px`);
      s.style.setProperty('--dy', `${Math.sin(ang) * 40}px`);
      s.addEventListener('animationend', () => s.remove(), { once: true });
      setTimeout(() => s.remove(), 800);
    }
  }

  function confetti() {
    if (reduce) return;
    for (let i = 0; i < 40; i++) {
      const c = el('div', 'bm-confetti', root);
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = ['#ffd34d', '#ff5d73', '#3ddc97', '#6fb3ff'][i % 4];
      c.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
      c.addEventListener('animationend', () => c.remove(), { once: true });
      setTimeout(() => c.remove(), 2400);
    }
  }

  function celebrate() {
    setMascot('jump');
    confetti();
    for (const bin of binEls.values()) restart(bin, 'bm-bin-bounce');
  }

  return {
    padEl, binEls, mascotEl, progressEl,
    setProgress, binRects, playBounds, setMascot, celebrate,
    pulseBin, wiggleBin, arcTo, spawnSparkle, confetti,
  };
}
