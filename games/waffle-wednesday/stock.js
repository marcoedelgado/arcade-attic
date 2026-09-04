// stock.js — the batter/stock economy for the waffle pile. Pure: no DOM.
// Deliberately forgiving — a full pile of 8, one back every few seconds, so
// running dry is rare and self-heals rather than ending a shift.

export const STOCK_MAX = 8;
export const STOCK_REGEN_MS = 4000;

export function makeStock() {
  return { count: STOCK_MAX, sinceRegen: 0 };
}

// Advance regeneration by dtMs. Mutates and returns the stock.
export function regen(stock, dtMs) {
  if (stock.count >= STOCK_MAX) {
    stock.sinceRegen = 0;
    return stock;
  }
  stock.sinceRegen += dtMs;
  while (stock.sinceRegen >= STOCK_REGEN_MS && stock.count < STOCK_MAX) {
    stock.sinceRegen -= STOCK_REGEN_MS;
    stock.count += 1;
  }
  if (stock.count >= STOCK_MAX) stock.sinceRegen = 0;
  return stock;
}

export function canSpawn(stock) {
  return stock.count > 0;
}

// Consume one from the pile. Returns true if a waffle was taken.
export function take(stock) {
  if (stock.count <= 0) return false;
  stock.count -= 1;
  return true;
}
