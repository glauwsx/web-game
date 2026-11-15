// 憂鬱的店：營業額是一條預先定義的曲線，不做模擬。純邏輯。
import * as B from '../data/balance.js';
import { rngRange } from '../core/rng.js';

/**
 * 建立憂鬱的營業額曲線。
 * 每個整點有一個擾動值（±3% 以內），開店和打烊時是 0，所以打烊時剛好到達目標。
 */
export function createRival(target, rng, openMin, closeMin) {
  const hours = Math.max(1, Math.round((closeMin - openMin) / 60));
  const noise = [0];
  for (let i = 1; i < hours; i++) noise.push(rngRange(rng, -B.RIVAL_NOISE, B.RIVAL_NOISE));
  noise.push(0);
  return { target, noise, openMin, closeMin };
}

/** 從開店到第 minute 分鐘（一天裡的分鐘）為止，hourCurve 的累積量。 */
function cumCurve(openMin, minute) {
  let sum = 0;
  for (let m = openMin; m < minute;) {
    const hr = Math.floor(m / 60);
    const end = Math.min(minute, (hr + 1) * 60);
    sum += (B.HOUR_CURVE[hr] || 0) * (end - m);
    m = end;
  }
  return sum;
}

/** 憂鬱在當日第 minute 分鐘（可以有小數）的累計營業額。 */
export function rivalRevenueAt(rival, minute) {
  const m = Math.max(rival.openMin, Math.min(rival.closeMin, minute));
  const total = cumCurve(rival.openMin, rival.closeMin) || 1;
  const frac = cumCurve(rival.openMin, m) / total;
  const pos = (m - rival.openMin) / 60;
  const i = Math.min(rival.noise.length - 2, Math.floor(pos));
  const t = pos - i;
  const n = rival.noise[i] * (1 - t) + rival.noise[i + 1] * t;
  return Math.round(rival.target * frac * (1 + n));
}

/** 目前這個 tick 憂鬱的累計營業額。 */
export function rivalRevenue(state) {
  if (!state.rival) return 0;
  return rivalRevenueAt(state.rival, state.openMin + state.tick / B.TICKS_PER_MIN);
}
