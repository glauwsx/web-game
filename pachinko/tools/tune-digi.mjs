// 調整用：改數位機的盤面參數，看左打時各入口的進球率（不右打）。
// 用法：node tools/tune-digi.mjs life=7.4 ledge=10 [n=4000]
import { makeDigi, amadigi } from '../src/machines/digi.js';
import { runSim } from './sim.mjs';
const over = {}; let n = 4000;
for (const a of process.argv.slice(2)) { const [k, v] = a.split('='); if (k === 'n') n = Number(v); else over[k] = Number(v); }
const m = makeDigi({ ...amadigi.cfg, ...over });
let line = '';
for (const p of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55]) {
  const r = runSim(m, p, n, 5);
  const st = r.s.stats; const f = (id) => ((st.byId[id] || 0) / st.fired * 100).toFixed(1);
  line += `${p}: ヘソ${f('heso')} W${f('warp')} C${f('stageC')} P${(Number(f('p0')) + Number(f('p1')) + Number(f('p2'))).toFixed(1)} | `;
}
console.log(JSON.stringify(over), '\n', line);
