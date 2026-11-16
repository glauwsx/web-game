// 顧客版本的規則（計劃書 13）。純函式，Node.js 可以直接 import（單元測試用）。
import { CUSTOMER as C } from '../data/balance.js';
import { sushiOfTier } from '../data/sushi.js';
import { CUSTOMER_RACE_STATS } from '../data/characters.js';
import { rngInt } from '../core/rng.js';
import { prizeValue } from '../mini/race/ai.js';

/** 角色的賽車倍率（計劃書 13.1）。高 = +5%、低 = −5%。 */
export function raceStats(charId) {
  const s = CUSTOMER_RACE_STATS[charId] || CUSTOMER_RACE_STATS.nakagawa;
  const f = (v) => (v === 'H' ? 1 + C.STAT_STEP : v === 'L' ? 1 - C.STAT_STEP : 1);
  return { accel: f(s.accel), top: f(s.top), handling: f(s.handling) };
}

/** 零用錢挑戰的分數：小鋼珠是獎品價值；賽車是獎品價值 × 完整度 / 100（計劃書 13.3）。 */
export function scoreOf(kind, result) {
  if (kind === 'pachinko') return Math.round(result.value);
  return Math.round((prizeValue(result.prizes) * result.integrity) / 100);
}

/**
 * 一局的獎品換成圖鑑的項目 { id: 幾個 }。
 * 小鋼珠的入賞口只有等級：從那個等級的壽司隨機選一款。大獎是特上拼盤。
 * 套餐（計劃書沒寫怎麼拿到，自己定的）：小鋼珠一局贏到 5 貫以上（不算大獎）是並套餐；賽車一場贏過全部 5 台是上套餐。
 */
export function zukanGains(kind, result, rng) {
  const out = {};
  const add = (id, n = 1) => { out[id] = (out[id] || 0) + n; };
  if (kind === 'pachinko') {
    const c = result.counts;
    const tierOf = { A: 4, B: 3, C: 2, D: 1 };
    let pieces = 0;
    for (const k of ['A', 'B', 'C', 'D']) {
      for (let i = 0; i < c[k]; i++) {
        const list = sushiOfTier(tierOf[k]);
        add(list[rngInt(rng, 0, list.length - 1)]);
        pieces++;
      }
    }
    if (c.J) add('set_tokujo', c.J);
    if (pieces >= C.SET_NAMI_PIECES) add('set_nami');
  } else {
    for (const id of result.prizes) add(id);
    if (result.won && result.won.length >= 5) add('set_jo');
  }
  return out;
}

/** 把一筆成績放進排行榜（前 10 名）。回傳名次（1 起算），沒進榜回傳 0。 */
export function addToBoard(board, entry) {
  board.push(entry);
  board.sort((a, b) => b.score - a.score || a.at - b.at);
  const rank = board.indexOf(entry) + 1;
  board.length = Math.min(board.length, C.BOARD_SIZE);
  return rank <= C.BOARD_SIZE ? rank : 0;
}

