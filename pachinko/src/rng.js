// 可重現的亂數（mulberry32）。
export function rngCreate(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rr = (rng, a, b) => a + (b - a) * rng();
export const chance = (rng, p) => rng() < p;
export function normal(rng, sd) {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()) * sd;
}
export function pick(rng, weights) {
  let sum = 0;
  for (const w of weights) sum += w;
  let x = rng() * sum;
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
  return weights.length - 1;
}
