// BPM 實驗：同樣的兩隊、同一首歌，只改速度（80／120／170），電腦對電腦加速跑。
// 用法：node tests/sim/bpm-experiment.mjs [每種速度幾場] [每節分鐘]
import { Game } from '../../src/hoops/sim/game.js';
import { TEAMS } from '../../src/hoops/data/teams.js';
import { SIM_DT } from '../../src/hoops/sim/constants.js';
import { Deck } from '../../src/music/deck.js';
import { Conductor } from '../../src/music/conductor.js';
import { BeatBridge } from '../../src/game/beatbridge.js';
import { songAtBpm } from '../../src/music/demos.js';

export function runMatch({ bpm, bpmAway = bpm, seed = 1, home = TEAMS[0], away = TEAMS[1], quarterMinutes = 3, genre = 'house', songSeed = 'exp', difficulty = 'normal' }) {
  const sh = songAtBpm(genre, songSeed, bpm);
  const sa = songAtBpm(genre, songSeed, bpmAway);
  const decks = { home: new Deck({ id: 'home', ...sh }), away: new Deck({ id: 'away', ...sa }) };
  const conductor = new Conductor(decks);
  const g = new Game({ home, away, quarterMinutes, seed, autoContinue: true, difficulty });
  const bridge = new BeatBridge({ conductor, headless: true, difficulty }).install(g);
  conductor.start(0, 'home');
  g.start();
  let t = 0;
  while (g.phase !== 'gameOver' && t < 6000) {
    g.step(SIM_DT);
    t += SIM_DT;
    g.events.length = 0;
  }
  const line = (ti) => {
    const ps = g.teams[ti].players;
    const s = (k) => ps.reduce((a, p) => a + p.stats[k], 0);
    return { pts: s("pts"), fgm: s("fgm"), fga: s("fga"), tpa: s("tpa"), tov: s("tov"), pf: s("pf"), stl: s("stl"), ast: s("ast"), fta: s("fta") };
  };
  return { g, bridge, home: line(0), away: line(1), possessions: g.stats.possessions, simSeconds: t, judge: bridge.stats };
}

function summarize(rows) {
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const n = rows.length;
  return {
    games: n / 2,
    pts: +(sum('pts') / n).toFixed(1),
    fga: +(sum('fga') / n).toFixed(1),
    fgPct: +((100 * sum('fgm')) / sum('fga')).toFixed(1),
    tov: +(sum('tov') / n).toFixed(1),
    pf: +(sum('pf') / n).toFixed(1),
    stl: +(sum('stl') / n).toFixed(1),
    ast: +(sum('ast') / n).toFixed(1),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = +(process.argv[2] || 4);
  const q = +(process.argv[3] || 3);
  const out = {};
  for (const bpm of [80, 120, 170]) {
    const rows = [];
    const grades = { perfect: 0, great: 0, good: 0, miss: 0, rush: 0, judged: 0 };
    const t0 = Date.now();
    for (let i = 0; i < games; i++) {
      const r = runMatch({ bpm, seed: 500 + i, quarterMinutes: q });
      rows.push(r.home, r.away);
      for (const s of r.judge) for (const k of Object.keys(grades)) grades[k] += s[k];
    }
    const sm = summarize(rows);
    sm.perfectPct = +((100 * grades.perfect) / grades.judged).toFixed(1);
    sm.missPct = +((100 * grades.miss) / grades.judged).toFixed(1);
    sm.rushPct = +((100 * grades.rush) / grades.judged).toFixed(1);
    out[bpm] = sm;
    console.log(`BPM ${bpm}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`, JSON.stringify(sm));
  }
  console.log(JSON.stringify(out));
}
