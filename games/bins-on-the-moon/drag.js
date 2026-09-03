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
  let startX = 0;
  let startY = 0;

  function move(e) {
    if (!dragging) return;
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

    if (prefersReducedMotion()) {
      el.style.transform = '';
      onReturn?.();
      return;
    }
    el.style.transition = 'transform 0.3s ease';
    el.style.transform = '';
    const done = () => {
      el.style.transition = '';
      el.removeEventListener('transitionend', done);
      onReturn?.();
    };
    el.addEventListener('transitionend', done);
  }

  function down(e) {
    dragging = true;
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
