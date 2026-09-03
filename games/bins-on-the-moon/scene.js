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

  function setMascot(mood) {
    mascotEl.dataset.mood = mood;
    mascotEl.textContent = mood === 'cheer' || mood === 'jump' ? '🙌' : mood === 'oops' ? '🤷' : '🧑‍🚀';
  }

  return { padEl, binEls, mascotEl, progressEl, setProgress, binRects, setMascot };
}
