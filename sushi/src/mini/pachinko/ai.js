// 用統計表算出 AI 顧客的小鋼珠結果。純邏輯。
// AI 顧客不即時跑物理：力道 = 該設定下的最佳力道 + 常態分布（手感誤差），
// 再用這個力道所在的區間，從統計表抽出每顆彈珠的結果。
import { PACHINKO as P } from '../../data/balance.js';
import { SUSHI, SETS } from '../../data/sushi.js';
import { rngNormal, rngFloat, rngChance } from '../../core/rng.js';

/** 某個等級壽司的平均參考售價。 */
export function tierValue(tier) {
  const list = Object.values(SUSHI).filter((s) => s.tier === tier);
  return list.reduce((a, s) => a + s.ref, 0) / list.length;
}

/** 套餐的價值（各等級平均參考售價 × 貫數）。 */
export function setValue(setId) {
  let v = 0;
  for (const [tier, n] of Object.entries(SETS[setId].tiers)) v += tierValue(Number(tier)) * n;
  return v;
}

// 入賞口對應的獎品等級
export const POCKET_TIER = { A: 4, B: 3, C: 2, D: 1 };
export const POCKET_KINDS = ['A', 'B', 'C', 'D', 'S'];

/** 一顆彈珠各種結果的價值。J 是大獎（特上拼盤）。 */
export const PRIZE_VALUE = {
  A: tierValue(4), B: tierValue(3), C: tierValue(2), D: tierValue(1), J: setValue('set_tokujo'), S: 0, out: 0,
};

/** 力道所在的區間編號。 */
export function binOf(power, bins) {
  return Math.max(0, Math.min(bins - 1, Math.floor(power / P.BIN + 1e-9)));
}

/** 統計表某個區間每顆彈珠的期望價值（¥）。row = [A, B, C, D, S] 的顆數，n 是總顆數。 */
export function binValue(row, n, setting) {
  const jp = P.JACKPOT[setting - 1];
  return (row[0] * PRIZE_VALUE.A + row[1] * PRIZE_VALUE.B + row[2] * PRIZE_VALUE.C + row[3] * PRIZE_VALUE.D + row[4] * jp * PRIZE_VALUE.J) / n;
}

/** 從統計表找出最佳力道（期望價值最高的區間的中心）。 */
export function bestPower(counts, n, setting) {
  let best = 0;
  let bestV = -1;
  for (let i = 0; i < counts.length; i++) {
    const v = binValue(counts[i], n, setting);
    if (v > bestV) { bestV = v; best = i; }
  }
  return (best + 0.5) * P.BIN;
}

/** 取出某個檯面、某個釘子設定的統計表。 */
export function tableFor(table, boardId, setting) {
  const t = table[boardId];
  return { counts: t.settings[setting - 1].counts, best: t.settings[setting - 1].best, n: t.n };
}

/** 抽一顆彈珠的結果。回傳 'A'、'B'、'C'、'D'、'S'（轉滾輪沒中）、'J'（大獎）、'out'。 */
export function sampleBall(tb, setting, sd, rng) {
  const power = tb.best + (sd > 0 ? rngNormal(rng, 0, sd) : 0);
  const row = tb.counts[binOf(power, tb.counts.length)];
  let x = rngFloat(rng) * tb.n;
  for (let k = 0; k < 5; k++) {
    x -= row[k];
    if (x < 0) {
      if (k === 4) return rngChance(rng, P.JACKPOT[setting - 1]) ? 'J' : 'S';
      return POCKET_KINDS[k];
    }
  }
  return 'out';
}

/**
 * 模擬 AI 顧客玩一次（30 顆）。
 * 回傳 { counts: { A, B, C, D, S, J }, value }。value 是贏得的壽司總參考售價。
 */
export function simulatePlay(tb, setting, sd, rng, balls = P.BALLS) {
  const counts = { A: 0, B: 0, C: 0, D: 0, S: 0, J: 0 };
  let value = 0;
  for (let i = 0; i < balls; i++) {
    const r = sampleBall(tb, setting, sd, rng);
    if (r === 'out') continue;
    counts[r]++;
    value += PRIZE_VALUE[r];
  }
  return { counts, value };
}

/** 回饋率的期望值（不抽樣，直接用統計表算）。sd 是手感誤差。 */
export function expectedPayout(tb, setting, sd, fee = P.FEE) {
  const bins = tb.counts.length;
  let ev = 0;
  if (!(sd > 0)) {
    ev = binValue(tb.counts[binOf(tb.best, bins)], tb.n, setting);
  } else {
    // 把常態分布切成很細的小段，累加每一段落在哪個區間
    const steps = 2000;
    let total = 0;
    for (let i = 0; i < steps; i++) {
      const z = -5 + (10 * (i + 0.5)) / steps;
      const w = Math.exp(-0.5 * z * z);
      total += w;
      ev += w * binValue(tb.counts[binOf(tb.best + z * sd, bins)], tb.n, setting);
    }
    ev /= total;
  }
  return (ev * P.BALLS) / fee;
}

/** 用抽樣算回饋率（模擬 plays 次遊玩取平均）。 */
export function sampledPayout(tb, setting, sd, rng, plays = 2000, fee = P.FEE) {
  let sum = 0;
  for (let i = 0; i < plays; i++) sum += simulatePlay(tb, setting, sd, rng).value;
  return sum / plays / fee;
}
