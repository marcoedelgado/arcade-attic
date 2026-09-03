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
  if (HAND_TUNED[level]) return { level, ...HAND_TUNED[level] };
  return {
    level,
    bins: [...BIN_IDS],
    count: Math.min(20, 12 + 2 * (level - 5)),
    visible: 5,
  };
}
