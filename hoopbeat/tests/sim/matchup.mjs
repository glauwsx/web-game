// 不同速度的歌對戰：A 隊用 bpmA、B 隊用 bpmB，主客場互換各跑一半，看勝率與每回合得分。
// 用法：node tests/sim/matchup.mjs [bpmA] [bpmB] [場數]
import { runMatch } from './bpm-experiment.mjs';
import { TEAMS } from '../../src/hoops/data/teams.js';

const a = +(process.argv[2] || 170);
const b = +(process.argv[3] || 120);
const n = +(process.argv[4] || 8);
let winA = 0;
const tot = { A: { pts: 0, fga: 0, fgm: 0, tov: 0, pf: 0, stl: 0 }, B: { pts: 0, fga: 0, fgm: 0, tov: 0, pf: 0, stl: 0 } };
for (let i = 0; i < n; i++) {
  const aHome = i % 2 === 0;
  const r = runMatch({ bpm: aHome ? a : b, bpmAway: aHome ? b : a, seed: 900 + i, home: TEAMS[0], away: TEAMS[1] });
  const A = aHome ? r.home : r.away;
  const B = aHome ? r.away : r.home;
  if (A.pts > B.pts) winA++;
  for (const k of Object.keys(tot.A)) { tot.A[k] += A[k] ?? 0; tot.B[k] += B[k] ?? 0; }
}
const fmt = (t) => `得分 ${(t.pts / n).toFixed(1)}、出手 ${(t.fga / n).toFixed(1)}、命中 ${((100 * t.fgm) / t.fga).toFixed(1)}%、失誤 ${(t.tov / n).toFixed(1)}、犯規 ${(t.pf / n).toFixed(1)}、抄截 ${(t.stl / n).toFixed(1)}`;
console.log(`BPM ${a} 對 BPM ${b}：${n} 場，${a} 贏 ${winA} 場`);
console.log(`  ${a}：${fmt(tot.A)}`);
console.log(`  ${b}：${fmt(tot.B)}`);
