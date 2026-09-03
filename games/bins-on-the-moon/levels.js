// Pure module — no DOM. Imported by game.js and by the test suite unchanged.

export const BINS = [
  { id: 'recycling', color: '#2f6fd0', icon: '♻️', label: 'recycling bin' },
  { id: 'food',      color: '#7a4a22', icon: '🍎', label: 'food waste bin' },
  { id: 'general',   color: '#2b2b31', icon: '🗑️', label: 'general waste bin' },
  { id: 'junk',      color: '#6a3bb0', icon: '🛸', label: 'space junk bin' },
];

export const BIN_IDS = BINS.map((b) => b.id);

const HAND_TUNED = {
  1: { bins: ['recycling', 'food'],                        count: 4,  visible: 1 },
  2: { bins: ['recycling', 'food', 'general'],             count: 6,  visible: 3 },
  3: { bins: ['recycling', 'food', 'general', 'junk'],     count: 8,  visible: 3 },
  4: { bins: ['recycling', 'food', 'general', 'junk'],     count: 10, visible: 3 },
  5: { bins: ['recycling', 'food', 'general', 'junk'],     count: 12, visible: 5 },
};

export function levelConfig(n) {
  const level = Math.max(1, Math.floor(Number(n) || 1));
  if (HAND_TUNED[level]) return { level, ...HAND_TUNED[level], bins: [...HAND_TUNED[level].bins] };
  return {
    level,
    bins: [...BIN_IDS],
    count: Math.min(20, 12 + 2 * (level - 5)),
    visible: 5,
  };
}

export function pickItems(pool, binIds, count, rng = Math.random) {
  const active = new Set(binIds);
  const available = pool.filter((it) => active.has(it.bin));
  if (available.length === 0) {
    throw new Error(`pickItems: no pool items for bins [${binIds.join(', ')}]`);
  }
  const pickFrom = (arr) => arr[Math.floor(rng() * arr.length)];

  // Check that every requested bin has at least one available item.
  for (const id of binIds) {
    if (!available.some((it) => it.bin === id)) {
      throw new Error(`pickItems: bin "${id}" has no pool items`);
    }
  }

  const result = [];
  // 1. Guarantee one item per active bin (space permitting).
  for (const id of binIds) {
    if (result.length >= count) break;
    result.push(pickFrom(available.filter((it) => it.bin === id)));
  }
  // 2. Fill the rest — prefer items not yet used.
  while (result.length < count) {
    const unused = available.filter((it) => !result.includes(it));
    const pool2 = unused.length ? unused : available;
    result.push(pickFrom(pool2));
  }
  // 3. Fisher-Yates shuffle so the guaranteed picks aren't front-loaded.
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
