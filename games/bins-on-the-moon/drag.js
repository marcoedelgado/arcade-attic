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
