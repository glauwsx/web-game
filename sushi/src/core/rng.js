// 有種子的亂數產生器。
// 狀態是純 JSON：{ s: 32 位元無號整數 }。狀態放在遊戲狀態裡，存檔時一起存。
// 演算法是 mulberry32。所有函式都直接修改傳入的狀態物件。

const U32 = 4294967296;

/** 建立亂數狀態。seed 可以是任何數字。 */
export function rngCreate(seed) {
  let s = (Number(seed) || 0) >>> 0;
  // 先攪拌一次，讓相鄰的種子差異變大。
  s = Math.imul(s ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  s = (s ^ (s >>> 13)) >>> 0;
  return { s };
}

/** 回傳 32 位元無號整數。 */
export function rngU32(r) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** 回傳 [0, 1) 的小數。 */
export function rngFloat(r) {
  return rngU32(r) / U32;
}

/** 回傳 [a, b) 的小數。 */
export function rngRange(r, a, b) {
  return a + (b - a) * rngFloat(r);
}

/** 回傳 a 到 b 的整數（含兩端）。 */
export function rngInt(r, a, b) {
  return a + Math.floor(rngFloat(r) * (b - a + 1));
}

/** 以機率 p 回傳 true。 */
export function rngChance(r, p) {
  return rngFloat(r) < p;
}

/** 常態分布（Box-Muller）。每次用掉兩個亂數，不留快取，狀態保持單純。 */
export function rngNormal(r, mean = 0, sd = 1) {
  const u = 1 - rngFloat(r); // (0, 1]
  const v = rngFloat(r);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 卜瓦松分布（Knuth 演算法）。lambda 很大時改用常態近似。 */
export function rngPoisson(r, lambda) {
  if (!(lambda > 0)) return 0;
  if (lambda > 30) return Math.max(0, Math.round(rngNormal(r, lambda, Math.sqrt(lambda))));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rngFloat(r);
  } while (p > limit);
  return k - 1;
}

/** 從陣列隨機選一個。空陣列回傳 undefined。 */
export function rngPick(r, arr) {
  if (!arr.length) return undefined;
  return arr[Math.floor(rngFloat(r) * arr.length)];
}

/** 依權重選一個索引。weights 是數字陣列。全部為 0 時回傳 -1。 */
export function rngWeighted(r, weights) {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return -1;
  let x = rngFloat(r) * total;
  for (let i = 0; i < weights.length; i++) {
    x -= Math.max(0, weights[i]);
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** 就地洗牌（Fisher-Yates）。 */
export function rngShuffle(r, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rngFloat(r) * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** 從目前的狀態分出一個獨立的新亂數狀態（給子系統用）。 */
export function rngFork(r) {
  return rngCreate(rngU32(r) ^ 0xa5a5a5a5);
}
