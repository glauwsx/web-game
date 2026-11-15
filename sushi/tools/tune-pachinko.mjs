// 調小鋼珠檯面用：給一組檯面參數，印出各設定的回饋率、峰值和兩側的進洞率。
// 用法：node tools/tune-pachinko.mjs '<參數 JSON>' [每區間顆數] ['<大獎機率分母 JSON>']
// 例如：node tools/tune-pachinko.mjs '{"sGuard":[8,8.25,8.5,8.75,9]}' 300 '[145,82,49,36,26]'
// 只跑力道 0.28 到 0.74 的區間，所以很快。確定參數後再跑 gen-pachinko-table.mjs 產生正式的表。
import { buildItamae } from '../src/data/pachinko-boards.js';
import { PACHINKO as P } from '../src/data/balance.js';
import { simulateBall } from '../src/mini/pachinko/physics.js';
import { bestPower, expectedPayout, binValue, POCKET_KINDS } from '../src/mini/pachinko/ai.js';
import { rngCreate, rngFloat } from '../src/core/rng.js';
const RANGES = { normal: [[20, 35], [35, 50], [50, 70], [70, 90], [90, 115]], pachinkoFan: [[30, 50], [50, 70], [70, 95], [95, 125], [125, 160]], pro: [[90, 130], [170, 230], [300, 400], [420, 560], [600, 9999]] };
let uid = 0;
export function evalParams(o, n = 200, settings = [1, 2, 3, 4, 5], lo = 28, hi = 74) {
  const board = buildItamae(o); board.id = `tune${uid++}`;
  const res = [];
  for (const setting of settings) {
    const counts = [];
    for (let bin = 0; bin < 100; bin++) {
      const row = [0, 0, 0, 0, 0];
      if (bin >= lo && bin <= hi) {
        const rng = rngCreate(777 + setting * 1000 + bin);
        for (let i = 0; i < n; i++) { const k = POCKET_KINDS.indexOf(simulateBall(board, setting, (bin + rngFloat(rng)) * P.BIN, rng)); if (k >= 0) row[k]++; }
      }
      counts.push(row);
    }
    const best = bestPower(counts, n, setting);
    const tb = { counts, best, n };
    const bi = Math.floor(best / P.BIN);
    const pay = {}; let ok = true;
    for (const type of ['normal', 'pachinkoFan', 'pro']) { pay[type] = expectedPayout(tb, setting, P.HAND_SD[type]) * 100; const [a, b] = RANGES[type][setting - 1]; if (pay[type] < a || pay[type] > b) ok = false; }
    const peak = [0, 0, 0, 0, 0]; const field = [0, 0, 0, 0, 0]; let fn = 0;
    for (let k = bi - 1; k <= bi + 1; k++) counts[k].forEach((c, j) => { peak[j] += c / 3; });
    for (let k = lo; k <= hi; k++) { if (Math.abs(k - bi) < 5) continue; fn++; counts[k].forEach((c, j) => { field[j] += c; }); }
    const f = (arr, d) => arr.map((c, j) => `${'ABCDS'[j]}${(c * 1000 / n / d).toFixed(0)}`).join(' ');
    const around = []; for (let k = bi - 4; k <= bi + 4; k++) around.push(binValue(counts[k], n, setting).toFixed(0));
    let fv = 0; for (let k = lo; k <= hi; k++) if (Math.abs(k - bi) >= 5) fv += binValue(counts[k], n, setting);
    res.push({ setting, ok, pay, best });
    console.log(`設定 ${setting} ${ok ? '✓' : '✗'} 一般 ${pay.normal.toFixed(0)} 迷 ${pay.pachinkoFan.toFixed(0)} 職業 ${pay.pro.toFixed(0)}　目標 ${RANGES.normal[setting - 1]}｜${RANGES.pachinkoFan[setting - 1]}｜${RANGES.pro[setting - 1][0]}+　最佳 ${best.toFixed(3)}　峰 ‰ ${f(peak, 1)}　兩側 ‰ ${f(field, fn)}（¥${(fv / fn).toFixed(1)}）　附近 [${around.join(' ')}]`);
  }
  return res;
}
if (process.argv[4]) JSON.parse(process.argv[4]).forEach((d, i) => { P.JACKPOT[i] = 1 / d; });
if (process.argv[1].endsWith('tune-pachinko.mjs')) evalParams(JSON.parse(process.argv[2] || '{}'), Number(process.argv[3] || 200));
