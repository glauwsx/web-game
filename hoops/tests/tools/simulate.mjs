// 在 Node 裡跑無畫面的電腦對電腦比賽，用來測試與平衡數值。
// 用法：node hoops/tests/tools/simulate.mjs [場數] [每節分鐘]
import { Game } from '../../src/sim/game.js';
import { TEAMS } from '../../src/data/teams.js';
import { SIM_DT } from '../../src/sim/constants.js';

export function runGame({ home = TEAMS[0], away = TEAMS[1], quarterMinutes = 3, seed = 1, difficulty = 'normal', maxSimSeconds = 4000, monitor = null } = {}) {
  const g = new Game({ home, away, quarterMinutes, seed, difficulty, autoContinue: true });
  g.start();
  let t = 0;
  const info = { stuckMax: 0, nanCount: 0, shotClockResets: 0, phases: {}, maxUntouched: 0 };
  let lastHolderChange = 0;
  let lastScore = 0;
  while (g.phase !== 'gameOver' && t < maxSimSeconds) {
    g.step(SIM_DT);
    t += SIM_DT;
    info.phases[g.phase] = (info.phases[g.phase] || 0) + SIM_DT;
    if (g.ball.state !== 'held' && g.phase === 'live') info.maxUntouched = Math.max(info.maxUntouched, g.ball.untouchedTime);
    for (const p of g.everyoneOnCourt()) {
      if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.z) || !Number.isFinite(p.y)) info.nanCount++;
    }
    if (!Number.isFinite(g.ball.pos.x) || !Number.isFinite(g.ball.pos.y)) info.nanCount++;
    if (monitor) monitor(g, t);
    g.events.length = 0;
  }
  info.simSeconds = t;
  info.shotClockResets = g.stats.shotClockResets;
  info.possessions = g.stats.possessions;
  return { g, info };
}

function teamLine(g, ti) {
  const ps = g.teams[ti].players;
  const s = (k) => ps.reduce((a, p) => a + p.stats[k], 0);
  return { pts: s('pts'), fgm: s('fgm'), fga: s('fga'), tpm: s('tpm'), tpa: s('tpa'), ftm: s('ftm'), fta: s('fta'), reb: s('reb'), oreb: s('oreb'), ast: s('ast'), stl: s('stl'), blk: s('blk'), tov: s('tov'), pf: s('pf') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = +(process.argv[2] || 3);
  const q = +(process.argv[3] || 3);
  const agg = [];
  for (let i = 0; i < n; i++) {
    const home = TEAMS[i % TEAMS.length], away = TEAMS[(i + 1 + Math.floor(i / TEAMS.length)) % TEAMS.length];
    const t0 = Date.now();
    const { g, info } = runGame({ home, away, quarterMinutes: q, seed: 1000 + i });
    const a = teamLine(g, 0), b = teamLine(g, 1);
    agg.push(a, b);
    console.log(`#${i + 1} ${home.abbr} ${g.rules.score[0]} - ${g.rules.score[1]} ${away.abbr}  periods=${g.rules.period} sim=${info.simSeconds.toFixed(0)}s wall=${Date.now() - t0}ms poss=${info.possessions} resets=${info.shotClockResets} nan=${info.nanCount} maxLoose=${info.maxUntouched.toFixed(1)}s phase=${g.phase}`);
    console.log('   H', JSON.stringify(a));
    console.log('   A', JSON.stringify(b));
    console.log('   phases', Object.fromEntries(Object.entries(info.phases).map(([k, v]) => [k, +v.toFixed(0)])));
  }
  const sum = (k) => agg.reduce((x, y) => x + y[k], 0);
  console.log(`AVG pts ${(sum('pts') / agg.length).toFixed(1)} FG% ${(100 * sum('fgm') / sum('fga')).toFixed(1)} 3P% ${(100 * sum('tpm') / Math.max(1, sum('tpa'))).toFixed(1)} 3PA/FGA ${(100 * sum('tpa') / sum('fga')).toFixed(0)}% FT ${sum('ftm')}/${sum('fta')} TOV ${(sum('tov') / agg.length).toFixed(1)} STL ${(sum('stl') / agg.length).toFixed(1)} BLK ${(sum('blk') / agg.length).toFixed(1)} AST ${(sum('ast') / agg.length).toFixed(1)} OREB ${(sum('oreb') / agg.length).toFixed(1)} REB ${(sum('reb') / agg.length).toFixed(1)} PF ${(sum('pf') / agg.length).toFixed(1)}`);
}
