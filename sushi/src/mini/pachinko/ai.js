// 出玉換壽司，和 AI 顧客的小鋼珠結果。純邏輯。
//
// AI 顧客不即時跑物理（太慢）。他們用統計表（data/pachinko-table.js）跑一個簡化的模型：
//   左打的每一顆：力道 = 最佳力道 + 常態分布（手感誤差），從統計表抽它進ヘソ、進一般入賞口，或沒進。
//   進ヘソ：轉一次數字，用機台的機率決定大當。
//   大當：每回合的淨出玉、確變每回的成本，都是統計表工具用物理量出來的平均值。
import { PACHINKO as P } from '../../data/balance.js';
import { SUSHI, SETS } from '../../data/sushi.js';
import { BOARDS } from '../../data/pachinko-boards.js';
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

/** 獎品的價值（¥）。J 是特上拼盤，A 到 D 是 T4 到 T1 一貫。 */
export const PRIZE_VALUE = { J: setValue('set_tokujo'), A: tierValue(4), B: tierValue(3), C: tierValue(2), D: tierValue(1) };
export const PRIZE_KINDS = ['J', 'A', 'B', 'C', 'D'];

/** 換一個獎品要幾顆出玉。 */
export function prizeBalls(k) { return PRIZE_VALUE[k] / P.BALL_YEN; }

/**
 * 出玉換壽司（景品交換）：從最貴的換起。剩下的零頭（端玉）有 T1 一半以上，就算一貫 T1。
 * 回傳 { balls, counts: { J, A, B, C, D }, value }。value 是壽司的參考售價總和。
 */
export function exchange(balls) {
  const counts = { J: 0, A: 0, B: 0, C: 0, D: 0 };
  let yen = Math.max(0, Math.round(balls)) * P.BALL_YEN;
  let value = 0;
  for (const k of PRIZE_KINDS) {
    const v = PRIZE_VALUE[k];
    const n = Math.floor((yen + 1e-6) / v);
    counts[k] += n; yen -= n * v; value += n * v;
  }
  if (yen >= PRIZE_VALUE.D / 2) { counts.D++; value += PRIZE_VALUE.D; }
  return { balls: Math.max(0, Math.round(balls)), counts, value };
}

/** 力道所在的區間編號。 */
export function binOf(power, tb) {
  return Math.max(0, Math.min(tb.left.length - 1, Math.floor((power - tb.bin0) / P.BIN + 1e-9)));
}

const smoothCache = new WeakMap();
/** 把區間做 1-2-3-2-1 的加權平均，壓掉抽樣雜訊（不然最佳力道會挑到運氣好的區間）。 */
function smooth(left) {
  let s = smoothCache.get(left);
  if (s) return s;
  const W = [1, 2, 3, 2, 1];
  s = left.map((_, i) => {
    const out = [0, 0];
    let wsum = 0;
    for (let k = -2; k <= 2; k++) {
      const r = left[i + k];
      if (!r) continue;
      const w = W[k + 2];
      out[0] += r[0] * w; out[1] += r[1] * w; wsum += w;
    }
    return [out[0] / wsum, out[1] / wsum];
  });
  smoothCache.set(left, s);
  return s;
}

/**
 * 取出某台機台、某個釘子設定的統計表（區間已經平滑過）。
 * 回傳 { left: [[ヘソ, 一般入賞口] 的顆數...], n, bin0, best, C, pLow, netRound, stCost, stTail }。
 */
export function tableFor(table, boardId, setting) {
  const t = table.boards[boardId];
  const st = t.settings[setting - 1];
  const C = BOARDS[boardId];
  return { left: smooth(st.left), best: st.best, n: table.n, bin0: table.bin0, C, pLow: C.jackpot[setting - 1], netRound: t.netRound, stCost: t.stCost, stTail: t.stTail || 0 };
}

/** 大當後再中一次的機率：確變 stSpins 回用高機率，確變結束時剩下的電チュー保留用普通機率。 */
export function againChance(tb) {
  const C = tb.C;
  return 1 - Math.pow(1 - C.pHigh, C.stSpins) * Math.pow(1 - tb.pLow, tb.stTail);
}

/** 一次大當（含確變連莊）平均淨賺幾顆。 */
export function jackpotBalls(tb) {
  const C = tb.C;
  const rounds = (big) => big * C.roundsBig + (1 - big) * C.roundsSmall;
  const q = againChance(tb);                            // 再中的機率
  const stUsed = (1 - Math.pow(1 - C.pHigh, C.stSpins)) / C.pHigh; // 確變平均用掉幾回
  const st = -tb.stCost * stUsed;
  const j1 = rounds(C.bigRate1) * tb.netRound + st;
  const j2 = rounds(C.bigRate2) * tb.netRound + st;
  return j1 + (q / (1 - q)) * j2;
}

/** 左打一顆在某個區間的期望出玉。 */
export function binBalls(row, tb, ej = jackpotBalls(tb)) {
  return (row[0] * (tb.C.payHeso + tb.pLow * ej) + row[1] * tb.C.payPocket) / tb.n;
}

/** 從統計表找出最佳力道（期望出玉最高的區間的中心）。 */
export function bestPower(tb) {
  const ej = jackpotBalls(tb);
  let best = 0, bestV = -1;
  tb.left.forEach((row, i) => { const v = binBalls(row, tb, ej); if (v > bestV) { bestV = v; best = i; } });
  return tb.bin0 + (best + 0.5) * P.BIN;
}

/** 左打一顆：回傳 'heso'、'pocket' 或 'out'。 */
function leftBall(tb, sd, rng) {
  const power = tb.best + (sd > 0 ? rngNormal(rng, 0, sd) : 0);
  const row = tb.left[binOf(power, tb)];
  const x = rngFloat(rng) * tb.n;
  if (x < row[0]) return 'heso';
  if (x < row[0] + row[1]) return 'pocket';
  return 'out';
}

/**
 * 模擬 AI 顧客玩一局。
 * 回傳 { balls（出玉）, counts: { J, A, B, C, D }, value, jackpots }。value 是贏得的壽司總參考售價。
 */
export function simulatePlay(tb, sd, rng, balls = P.BALLS) {
  const C = tb.C;
  let lent = balls, won = 0, jackpots = 0;
  // 確變的成本先從出玉扣，不夠再扣借來的
  const spend = (n) => { const a = Math.min(won, n); won -= a; lent -= n - a; };
  const jackpot = (kind) => {
    for (;;) {
      jackpots++;
      const big = rngChance(rng, kind === 2 ? C.bigRate2 : C.bigRate1);
      won += (big ? C.roundsBig : C.roundsSmall) * tb.netRound;
      let again = false;
      for (let k = 0; k < C.stSpins; k++) {
        spend(tb.stCost);
        if (rngChance(rng, C.pHigh)) { again = true; break; }
      }
      // 確變結束時剩下的電チュー保留，用普通機率轉
      if (!again) {
        const tail = Math.floor(tb.stTail) + (rngChance(rng, tb.stTail % 1) ? 1 : 0);
        for (let k = 0; k < tail && !again; k++) again = rngChance(rng, tb.pLow);
      }
      if (!again) return;
      kind = 2;
    }
  };
  while (lent > 0) {
    lent--;
    const r = leftBall(tb, sd, rng);
    if (r === 'pocket') won += C.payPocket;
    else if (r === 'heso') {
      won += C.payHeso;
      if (rngChance(rng, tb.pLow)) jackpot(1);
    }
  }
  return { ...exchange(won), jackpots };
}

/** 回饋率的期望值（不抽樣）：一局的期望出玉 × 一顆的錢 ÷ 入場費。sd 是手感誤差。 */
export function expectedPayout(tb, sd, fee = P.FEE) {
  const ej = jackpotBalls(tb);
  let per = 0;
  if (!(sd > 0)) per = binBalls(tb.left[binOf(tb.best, tb)], tb, ej);
  else {
    const steps = 2000;
    let total = 0;
    for (let i = 0; i < steps; i++) {
      const z = -5 + (10 * (i + 0.5)) / steps;
      const w = Math.exp(-0.5 * z * z);
      total += w;
      per += w * binBalls(tb.left[binOf(tb.best + z * sd, tb)], tb, ej);
    }
    per /= total;
  }
  return (per * P.BALLS * P.BALL_YEN) / fee;
}

/** 用抽樣算回饋率（模擬 plays 局取平均）。 */
export function sampledPayout(tb, sd, rng, plays = 2000, fee = P.FEE) {
  let sum = 0;
  for (let i = 0; i < plays; i++) sum += simulatePlay(tb, sd, rng).value;
  return sum / plays / fee;
}
