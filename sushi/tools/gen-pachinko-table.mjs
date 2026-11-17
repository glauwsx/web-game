// 產生小鋼珠統計表 src/data/pachinko-table.js（計劃書 8.6）。
// 左打：每台機台、每個釘子設定、每個力道區間，用物理各跑 TABLE_BALLS 顆，記錄進ヘソ和一般入賞口的顆數。
// 右打：用物理量大當一回合的淨出玉和確變每回的成本（tools/pachinko-measure.mjs）。
// 最後印出每種顧客的回饋率，對照計劃書 8.7 的表。
// 用法：node tools/gen-pachinko-table.mjs            產生並寫檔
//       node tools/gen-pachinko-table.mjs --report   只用現有的表印回饋率
//       node tools/gen-pachinko-table.mjs --right    左打沿用現有的表，只重量右打（改了大當規格時用）
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACHINKO as P } from '../src/data/balance.js';
import { BOARDS, BOARD_ORDER } from '../src/data/pachinko-boards.js';
import { createSession } from '../src/mini/pachinko/machine.js';
import { bestPower, expectedPayout, sampledPayout, tableFor, jackpotBalls } from '../src/mini/pachinko/ai.js';
import { rngCreate } from '../src/core/rng.js';
import { measureRight } from './pachinko-measure.mjs';

export const SEED = 20261117;
export const BIN0 = 0.1;          // 表從這個力道開始
export const BINS = 60;           // 到 0.70。AI 的力道超出範圍就用最邊邊的區間

// 計劃書 8.7：每種顧客、每個釘子設定的回饋率範圍
export const RANGES = {
  normal: [[0.25, 0.45], [0.4, 0.6], [0.55, 0.8], [0.75, 1.05], [0.95, 1.35]],
  pachinkoFan: [[0.3, 0.55], [0.5, 0.75], [0.7, 1.0], [0.95, 1.3], [1.2, 1.7]],
  pro: [[0.4, 0.7], [0.6, 0.95], [0.9, 1.3], [1.2, 1.7], [1.55, 2.3]],
};

const STEPS = Math.round(P.FIRE_INTERVAL / P.PH.DT);

/** 左打：某個力道區間跑 n 顆，回傳 [ヘソ, 一般入賞口]。數字不轉，機台一直是普通狀態。 */
export function leftRow(boardId, setting, power0, n, seed) {
  const s = createSession(boardId, setting, { seed, balls: n });
  s.logic.update = () => {};
  const row = [0, 0];
  let fired = 0;
  const count = (ev) => {
    for (const e of ev) {
      if (e.type === 'foul') continue;
      if (e.ball.by === 'heso') row[0]++;
      else if (e.ball.by && e.ball.by[0] === 'p') row[1]++;
    }
  };
  for (let i = 0; i < n; i++) {
    s.fire(power0 + ((i + 0.5) / n) * P.BIN);
    fired++;
    for (let k = 0; k < STEPS; k++) count(s.step());
  }
  for (let k = 0; k < 120 * 20 && s.world.balls.length; k++) count(s.step());
  // 力道太弱的界外球不算（會退回重打）。一半以上界外的區間資料太少，當成都沒進
  const valid = fired - s.stats.fouls;
  return valid >= n / 2 ? row.map((v) => Math.round((v * n) / valid)) : [0, 0];
}

function report(table) {
  const types = ['normal', 'pachinkoFan', 'pro'];
  for (const id of BOARD_ORDER) {
    const t0 = tableFor(table, id, 3);
    console.log(`\n${id}：大當一次平均淨賺 ${jackpotBalls(t0).toFixed(0)} 顆（一回合 ${t0.netRound.toFixed(1)}，確變每回 −${t0.stCost.toFixed(2)}）`);
    for (let setting = 1; setting <= 5; setting++) {
      const tb = tableFor(table, id, setting);
      const row = tb.left[Math.floor((tb.best - tb.bin0) / P.BIN)];
      const parts = types.map((type) => {
        const ev = expectedPayout(tb, P.HAND_SD[type]);
        const sm = sampledPayout(tb, P.HAND_SD[type], rngCreate(8800 + setting), 2000);
        const [lo, hi] = RANGES[type][setting - 1];
        const ok = ev >= lo && ev <= hi && sm >= lo && sm <= hi ? '  ' : '✗ ';
        return `${ok}${type} ${(ev * 100).toFixed(0)}%/${(sm * 100).toFixed(0)}% [${lo * 100}–${hi * 100}]`;
      });
      const spins = (row[0] / tb.n) * P.BALLS;
      const hit = 1 - Math.pow(1 - tb.pLow, spins);
      console.log(`  設定 ${setting} 最佳力道 ${tb.best.toFixed(3)} ヘソ ${(row[0] / tb.n * 100).toFixed(1)}%（一局約 ${spins.toFixed(1)} 回，大當機率 ${(hit * 100).toFixed(0)}%） | ${parts.join(' | ')}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/pachinko-table.js');
  if (process.argv.includes('--report')) {
    const { PACHINKO_TABLE } = await import(`${out}?t=${Date.now()}`);
    report(PACHINKO_TABLE);
  } else {
    const n = P.TABLE_BALLS;
    const boards = {};
    const t0 = Date.now();
    const old = process.argv.includes('--right') ? (await import(`${out}?t=${Date.now()}`)).PACHINKO_TABLE : null;
    for (const id of BOARD_ORDER) {
      const right = measureRight(id, 120, SEED);
      const settings = [];
      if (old) { boards[id] = { netRound: Math.round(right.netRound * 100) / 100, stCost: Math.round(right.stCost * 1000) / 1000, stTail: Math.round(right.stTail * 100) / 100, settings: old.boards[id].settings }; continue; }
      for (let setting = 1; setting <= 5; setting++) {
        const left = [];
        for (let b = 0; b < BINS; b++) left.push(leftRow(id, setting, BIN0 + b * P.BIN, n, SEED + setting * 1000 + b));
        settings.push({ left, best: 0 });
        process.stdout.write(`${id} 設定 ${setting} 完成（${((Date.now() - t0) / 1000).toFixed(0)} 秒）\n`);
      }
      boards[id] = { netRound: Math.round(right.netRound * 100) / 100, stCost: Math.round(right.stCost * 1000) / 1000, stTail: Math.round(right.stTail * 100) / 100, settings };
    }
    const table = { n: old ? old.n : n, bin0: BIN0, boards };
    for (const id of BOARD_ORDER) table.boards[id].settings.forEach((st, i) => { st.best = Math.round(bestPower(tableFor(table, id, i + 1)) * 1000) / 1000; });
    const lines = [
      '// 小鋼珠統計表。由 tools/gen-pachinko-table.mjs 產生，不要手動修改。',
      '// boards[機台].settings[釘子設定 − 1].left[區間] = [進ヘソ, 進一般入賞口] 的顆數（每個區間共 n 顆）。',
      '// 區間 i 是力道 bin0 + i × 0.01 到 bin0 + (i + 1) × 0.01。best 是最佳力道。',
      '// netRound：大當一回合淨賺幾顆。stCost：確變中數字每轉一回淨花掉幾顆。stTail：確變結束時平均剩幾個電チュー保留。',
      `// 種子 ${SEED}。`,
      '',
      `export const PACHINKO_TABLE = ${JSON.stringify(table)};`,
      '',
    ];
    writeFileSync(out, lines.join('\n'));
    console.log(`寫入 ${out}（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
    report(table);
  }
}
