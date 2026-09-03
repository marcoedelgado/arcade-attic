// binAtPoint is pure (used by game.js at drop time and by the test suite).
// makeDraggable is DOM-only and is added in Task 7.

export function binAtPoint(point, targets) {
  for (const t of targets) {
    const r = t.rect;
    if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) {
      return t.id;
    }
  }
  return null;
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function makeDraggable(el, { onGrab, onDrop, onReturn } = {}) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  function move(e) {
    if (!dragging) return;
    moved = true;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.15)`;
  }

  function up(e) {
    if (!dragging) return;
    dragging = false;
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.classList.remove('dragging');

    const consumed = onDrop?.({ x: e.clientX, y: e.clientY }) === true;
    if (consumed) return;

    // Plain tap (no move) or reduced motion: reset instantly, no transitionend dependency.
    if (!moved || el.style.transform === '' || prefersReducedMotion()) {
      el.style.transition = '';
      el.style.transform = '';
      onReturn?.();
      return;
    }
    el.style.transition = 'transform 0.3s ease';
    el.style.transform = '';
    let finished = false;
    let fallback = null;
    const done = () => {
      if (finished) return;
      finished = true;
      if (fallback) clearTimeout(fallback);
      el.style.transition = '';
      el.removeEventListener('transitionend', done);
      onReturn?.();
    };
    el.addEventListener('transitionend', done);
    fallback = setTimeout(done, 400);   // fallback: transitionend can be suppressed (e.g. by a prior transform animation)
  }

  function down(e) {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    try { el.setPointerCapture(e.pointerId); } catch {}
    el.classList.add('dragging');
    onGrab?.();
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  el.addEventListener('pointerdown', down);
  return { destroy() { el.removeEventListener('pointerdown', down); } };
}
