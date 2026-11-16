// 長時間模擬：會自動右打。看數位機的實際回收率。node tools/long.mjs <id> <力道> <顆數> [seed]
import { MACHINES } from '../src/machines/index.js';
import { runSim } from './sim.mjs';
const m = MACHINES.find((q) => q.id === process.argv[2]);
const p = Number(process.argv[3]), n = Number(process.argv[4]);
const policy = (s, power) => (s.logic.wantRight() ? m.rightPower ?? power : power);
const r = runSim(m, p, n, Number(process.argv[5] || 1), policy);
const st = r.s.stats, ls = r.s.logic.state;
console.log(m.name, `力道 ${p} 顆數 ${st.fired} 回收 ${(r.rate * 100).toFixed(1)}%`, JSON.stringify(st.byId), `回轉 ${ls.spins ?? '-'} 大當 ${ls.jackpots}`);
