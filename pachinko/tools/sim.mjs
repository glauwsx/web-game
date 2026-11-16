// 模擬工具：固定力道連續發射，回報各力道的回收率。
// 用法：node tools/sim.mjs <機台 id> [每個力道幾顆] [力道起點] [終點] [間隔]
import { MACHINES } from '../src/machines/index.js';
import { createSession, STEPS_PER_BALL } from '../src/session.js';

export function runSim(machine, power, balls, seed = 1, policy = null) {
  const s = createSession(machine, { seed });
  let nudges = 0, maxT = 0, timeouts = 0;
  for (let i = 0; i < balls; i++) {
    const p = policy ? policy(s, power) : power;
    if (p !== null) s.fire(p);
    for (let k = 0; k < STEPS_PER_BALL; k++) {
      for (const e of s.step()) { nudges += e.ball.nudged || 0; maxT = Math.max(maxT, e.ball.t); if (e.ball.t > 29) timeouts++; }
    }
  }
  for (let k = 0; k < 120 * 40; k++) s.step();
  return { s, rate: s.stats.paid / Math.max(1, s.stats.fired), nudges, maxT, timeouts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = MACHINES.find((q) => q.id === process.argv[2]) || MACHINES[0];
  const n = Number(process.argv[3] || 3000);
  const p0 = Number(process.argv[4] || 0.2), p1 = Number(process.argv[5] || 1), dp = Number(process.argv[6] || 0.05);
  // 會自動右打的打法：機台要求右打時用 rightPower
  const policy = (s, power) => (s.logic.wantRight() ? m.rightPower ?? power : power);
  console.log(`${m.name}：每個力道 ${n} 顆`);
  for (let p = p0; p <= p1 + 1e-9; p += dp) {
    const r = runSim(m, p, n, 7, policy);
    const st = r.s.stats;
    const ids = Object.entries(st.byId).map(([k, v]) => `${k}:${(v / st.fired * 100).toFixed(1)}`).join(' ');
    console.log(`力道 ${p.toFixed(2)} 回收 ${(r.rate * 100).toFixed(0).padStart(4)}%  界外 ${String(st.fouls).padStart(4)} 輕推 ${r.nudges} 逾時 ${r.timeouts}  | ${ids}`);
  }
}
