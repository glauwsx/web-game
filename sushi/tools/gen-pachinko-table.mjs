// 產生小鋼珠統計表：用 simulateBall 跑蒙地卡羅模擬。
// 對每個檯面、每個釘子設定（5 種）、每個力道區間（寬度 0.01），各跑 TABLE_BALLS 顆彈珠。
// 輸出 src/data/pachinko-table.js。
// 用法：node tools/gen-pachinko-table.mjs            正式產生並寫檔
//       node tools/gen-pachinko-table.mjs --dry 150  只印報告，不寫檔（每區間 150 顆，調檯面時用）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARDS, BOARD_ORDER } from '../src/data/pachinko-boards.js';
import { PACHINKO as P } from '../src/data/balance.js';
import { simulateBall } from '../src/mini/pachinko/physics.js';
import { bestPower, expectedPayout, binValue, POCKET_KINDS } from '../src/mini/pachinko/ai.js';
import { rngCreate, rngFloat } from '../src/core/rng.js';

const dry = process.argv.includes('--dry');
const N = dry ? Number(process.argv[process.argv.indexOf('--dry') + 1] || 150) : P.TABLE_BALLS;
const BINS = Math.round(1 / P.BIN);
export const TABLE_SEED = 20260316;

/** 產生一個檯面一個設定的統計表。每個區間的力道在區間內均勻分布。 */
export function buildSetting(board, setting, n, seed = TABLE_SEED) {
  const counts = [];
  for (let bin = 0; bin < BINS; bin++) {
    const rng = rngCreate(seed + setting * 1000 + bin);
    const row = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const power = (bin + rngFloat(rng)) * P.BIN;
      const r = simulateBall(board, setting, power, rng);
      const k = POCKET_KINDS.indexOf(r);
      if (k >= 0) row[k]++;
    }
    counts.push(row);
  }
  return { counts, best: bestPower(counts, n, setting) };
}

// 計劃書 8.7 的回饋率範圍
export const RANGES = {
  normal: [[0.20, 0.35], [0.35, 0.50], [0.50, 0.70], [0.70, 0.90], [0.90, 1.15]],
  pachinkoFan: [[0.30, 0.50], [0.50, 0.70], [0.70, 0.95], [0.95, 1.25], [1.25, 1.60]],
  pro: [[0.90, 1.30], [1.70, 2.30], [3.00, 4.00], [4.20, 5.60], [6.00, 99]],
};

function report(boardId, settings, n) {
  let ok = true;
  console.log(`\n檯面 ${boardId}（每區間 ${n} 顆）`);
  settings.forEach((st, i) => {
    const setting = i + 1;
    const tb = { counts: st.counts, best: st.best, n };
    const parts = [];
    for (const type of ['normal', 'pachinkoFan', 'pro']) {
      const v = expectedPayout(tb, setting, P.HAND_SD[type]);
      const [lo, hi] = RANGES[type][i];
      const good = v >= lo && v <= hi;
      if (!good) ok = false;
      parts.push(`${type} ${(v * 100).toFixed(0)}%${good ? '' : `✗(${lo * 100}–${hi * 100})`}`);
    }
    const bi = Math.floor(st.best / P.BIN);
    const around = [];
    for (let k = bi - 4; k <= bi + 4; k++) around.push(k >= 0 && k < BINS ? binValue(st.counts[k], n, setting).toFixed(0) : '-');
    const row = st.counts[bi];
    // 兩側釘林的平均價值：離最佳力道 5 到 15 個區間的地方
    let fieldV = 0;
    let fieldN = 0;
    const fieldC = [0, 0, 0, 0, 0];
    for (let k = bi - 15; k <= bi + 15; k++) {
      if (Math.abs(k - bi) < 5 || k < 0 || k >= BINS) continue;
      fieldV += binValue(st.counts[k], n, setting); fieldN++;
      st.counts[k].forEach((c, j) => { fieldC[j] += c; });
    }
    console.log(`  設定 ${setting}：最佳力道 ${st.best.toFixed(3)}　${parts.join('　')}`);
    console.log(`           兩側每顆價值 ${(fieldV / fieldN).toFixed(1)}（每千顆 A${(fieldC[0] * 1000 / n / fieldN).toFixed(1)} B${(fieldC[1] * 1000 / n / fieldN).toFixed(1)} C${(fieldC[2] * 1000 / n / fieldN).toFixed(1)} D${(fieldC[3] * 1000 / n / fieldN).toFixed(1)} S${(fieldC[4] * 1000 / n / fieldN).toFixed(1)}）`);
    console.log(`           最佳區間每 ${n} 顆 A${row[0]} B${row[1]} C${row[2]} D${row[3]} S${row[4]}　附近每顆價值 [${around.join(' ')}]`);
  });
  return ok;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const t0 = Date.now();
  const out = {};
  let allOk = true;
  for (const id of BOARD_ORDER) {
    const settings = [];
    for (let s = 1; s <= 5; s++) settings.push(buildSetting(BOARDS[id], s, N));
    if (!report(id, settings, N)) allOk = false;
    out[id] = { n: N, settings };
  }
  console.log(`\n花了 ${((Date.now() - t0) / 1000).toFixed(1)} 秒。${allOk ? '回饋率全部在範圍內。' : '有回饋率超出範圍。'}`);
  if (!dry) {
    const lines = ['// 小鋼珠結果統計表。由 tools/gen-pachinko-table.mjs 產生，不要手動修改。',
      '// counts[區間] = [A, B, C, D, 啟動口] 的顆數（每個區間共 n 顆）。best 是最佳力道。',
      `// 種子 ${TABLE_SEED}。`, '', 'export const PACHINKO_TABLE = {'];
    for (const id of BOARD_ORDER) {
      lines.push(`  ${id}: {`, `    n: ${out[id].n},`, '    settings: [');
      for (const st of out[id].settings) {
        lines.push(`      { best: ${st.best.toFixed(3)}, counts: [`);
        for (let i = 0; i < st.counts.length; i += 10) lines.push(`        ${st.counts.slice(i, i + 10).map((r) => `[${r.join(',')}]`).join(',')},`);
        lines.push('      ] },');
      }
      lines.push('    ],', '  },');
    }
    lines.push('};', '');
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'pachinko-table.js');
    fs.writeFileSync(file, lines.join('\n'));
    console.log(`已寫入 ${path.relative(process.cwd(), file)}`);
  }
  if (!allOk && !dry) process.exit(1);
}
