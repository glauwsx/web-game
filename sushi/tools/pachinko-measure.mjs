// 用物理量右打的兩個平均值（統計表工具 gen-pachinko-table.mjs 也用這裡的函式）：
//   netRound：大當一回合淨賺幾顆（アタッカー賠的 − 這段時間打出去的）
//   stCost：確變中數字每轉一回，淨花掉幾顆（打出去的 − 電チュー賠的）
//   stTail：確變結束時還剩幾個電チュー的保留（之後用普通的機率轉）
// 用法：node tools/pachinko-measure.mjs [機台 id] [次數]
import { createSession } from '../src/mini/pachinko/machine.js';
import { PACHINKO as P } from '../src/data/balance.js';

const STEPS = Math.round(P.FIRE_INTERVAL / P.PH.DT);

/** 跑 trials 次大當，回傳 { netRound, stCost }。 */
export function measureRight(boardId, trials = 60, seed = 1) {
  let jpNet = 0, jpRounds = 0, stNet = 0, stSpins = 0, tail = 0;
  for (let i = 0; i < trials; i++) {
    // 一半 10 回合、一半少的回合；確變不會再中，才量得到整段確變
    const s = createSession(boardId, 3, { seed: seed + i * 7919, balls: 0, spec: { bigRate1: i % 2, pHigh: 0 } });
    s.won = 1e6;
    const st = s.logic.state;
    s.logic.debugWin();
    const phaseOf = () => (st.phase === 'jp' ? 'jp' : st.mode === 'st' ? 'st' : 'none');
    let seenJp = false, rounds = 0, spins0 = 0, wasSt = false;
    for (let k = 0; k < 400000; k++) {
      const ph = phaseOf();
      if (ph === 'jp') { seenJp = true; rounds = st.jp.rounds; }
      if (ph === 'st' && !wasSt) { wasSt = true; spins0 = st.spins; }
      if (seenJp && ph === 'none') { tail += st.hold2; break; }
      if (k % STEPS === 0 && s.wantRight()) {
        const b = s.fire(P.RIGHT_POWER);
        if (b) b.phase = ph;
        if (ph === 'jp') jpNet--; else if (ph === 'st') stNet--;
      }
      const paid0 = s.stats.paid;
      const ev = s.step();
      // 出玉算給「發射那時候」的階段（鋼珠要飛一陣子才進洞）
      const got = s.stats.paid - paid0;
      if (got) {
        const by = ev.find((e) => e.type === 'in');
        const ph2 = by && by.ball.phase ? by.ball.phase : phaseOf();
        if (ph2 === 'jp') jpNet += got; else if (ph2 === 'st') stNet += got;
      }
    }
    jpRounds += rounds;
    stSpins += st.spins - spins0;
  }
  return { netRound: jpNet / jpRounds, stCost: -stNet / stSpins, stTail: tail / trials };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2] || 'ryujin';
  const t0 = Date.now();
  console.log(id, measureRight(id, Number(process.argv[3] || 40)), `${Date.now() - t0} ms`);
}
