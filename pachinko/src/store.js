// 存檔（localStorage）。讀寫失敗時遊戲照常進行，只是不會記住。
const KEY = 'pachinko-hall-v1';
export const START_BALLS = 1000;
export const BORROW = 500;

export function loadStore() {
  const base = { balls: START_BALLS, borrowed: 0, muted: false, speed: 1, labels: false, autoRight: true, seen: {}, m: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(base, JSON.parse(raw));
  } catch { /* 沒有存檔可用 */ }
  return base;
}
export function saveStore(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 存不了就算了 */ }
}
export function machineRec(s, id) {
  if (!s.m[id]) s.m[id] = { fired: 0, paid: 0, jackpots: 0, power: null };
  return s.m[id];
}
