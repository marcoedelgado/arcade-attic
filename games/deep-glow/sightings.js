// sightings.js — pure. The log of rare creatures the diver has spotted, across
// runs. An in-memory Set is the SOURCE OF TRUTH; storage is only a best-effort
// mirror of it. That split is deliberate: private-mode Safari (and any other
// storage that throws) must never take sightings away mid-session, it can only
// fail to remember them for next time. Imports nothing, touches no browser
// global directly — `storage` is injected, and game.js defaults it to
// `localStorage`, wrapped, at the call site.

const KEY = 'deep-glow:sightings';

export function makeSightings({ storage }) {
  const seen = new Set(readAll(storage));

  return {
    has(id) {
      return seen.has(id);
    },

    mark(id) {
      if (seen.has(id)) return;   // idempotent: no redundant write
      seen.add(id);
      writeAll(storage, seen);
    },

    all() {
      return [...seen];
    },

    reset() {
      seen.clear();
      writeAll(storage, seen);
    },
  };
}

// readAll — best-effort load from storage. Any throw (missing storage, a
// private-mode SecurityError on GET, malformed JSON) is swallowed and treated
// as "nothing saved yet". A corrupt or tampered value (e.g. `[42, null]`) can
// still pass Array.isArray — every element is filtered down to strings too,
// since the menu badges (the first consumer of all()/has()) index straight
// off these ids.
function readAll(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// writeAll — best-effort save to storage. A throw on SET (quota, private mode)
// is swallowed; the in-memory Set already holds the truth for this session.
function writeAll(storage, seen) {
  try {
    storage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    /* private mode / quota — in-memory Set still holds the truth this session */
  }
}
