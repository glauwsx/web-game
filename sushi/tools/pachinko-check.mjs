// 驗證：用完整物理跑很多局（含大當、確變、自動右打），比對 AI 模型算的期望出玉。
// 用法：node tools/pachinko-check.mjs [機台 id] [釘子設定] [局數] [力道]
import { createSession } from '../src/mini/pachinko/machine.js';
import { PACHINKO as P } from '../src/data/balance.js';
import { PACHINKO_TABLE } from '../src/data/pachinko-table.js';
import { tableFor, expectedPayout, exchange } from '../src/mini/pachinko/ai.js';

const STEPS = Math.round(P.FIRE_INTERVAL / P.PH.DT);

/** 用物理玩一局，固定力道，大當和確變時自動右打。回傳 { balls, value, jackpots, fired }。 */
export function physicsPlay(boardId, setting, power, seed) {
  const s = createSession(boardId, setting, { seed });
  let k = 0;
  while (!s.isOver() && k < 120 * 60 * 30) {
    if (k % STEPS === 0) s.fire(s.wantRight() ? P.RIGHT_POWER : power);
    s.step();
    k++;
  }
  const r = s.result();
  return { balls: r.balls, value: r.value, jackpots: s.logic.state.jackpots, fired: s.stats.fired, t: k / 120 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2] || 'ryujin', setting = Number(process.argv[3] || 3), n = Number(process.argv[4] || 300);
  const tb = tableFor(PACHINKO_TABLE, id, setting);
  const power = Number(process.argv[5] || tb.best);
  let sum = 0, val = 0, hit = 0, t = 0, maxT = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const r = physicsPlay(id, setting, power, 1000 + i);
    sum += r.balls; val += r.value; t += r.t; maxT = Math.max(maxT, r.t);
    if (r.jackpots) hit++;
  }
  const model = expectedPayout(tb, 0) * P.FEE / P.BALL_YEN;
  console.log(`${id} 設定 ${setting} 力道 ${power}：物理 ${n} 局，平均出玉 ${(sum / n).toFixed(1)}（模型 ${model.toFixed(1)}），回饋率 ${(val / n / P.FEE * 100).toFixed(0)}%，有大當的局 ${(hit / n * 100).toFixed(0)}%，一局平均 ${(t / n).toFixed(0)} 秒、最長 ${maxT.toFixed(0)} 秒（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
  void exchange;
}
