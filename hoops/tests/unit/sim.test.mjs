// 模擬層測試：投籃物理、整場比賽的球權轉換與進攻時限重設。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ball } from '../../src/sim/ball.js';
import { COURT, SIM_DT } from '../../src/sim/constants.js';
import { shotTarget, flightTime } from '../../src/sim/shooting.js';
import { RNG } from '../../src/sim/util.js';
import { Game } from '../../src/sim/game.js';
import { TEAMS } from '../../src/data/teams.js';
import * as R from '../../src/sim/rules.js';

function shoot(kind, d, made, rng) {
  const hoop = { x: COURT.hoopX, y: COURT.rimY, z: 0 };
  const ang = rng.range(-1.2, 1.2);
  const from = { x: hoop.x - Math.cos(ang) * d, z: Math.sin(ang) * d };
  const rd = kind === 'layup' ? Math.min(Math.max(0.62, d - 0.35), 2.6) : d - 0.18;
  const rp = { x: hoop.x - Math.cos(ang) * rd, y: kind === 'layup' ? 2.9 : 2.6, z: Math.sin(ang) * rd };
  const t = shotTarget(rng, hoop, from, made, 0.3);
  const b = new Ball();
  b.pos = { ...rp };
  b.vel = Ball.solveVelocity(rp, t, flightTime(kind, Math.hypot(hoop.x - rp.x, rp.z)));
  b.state = 'flight';
  let scored = false;
  for (let i = 0; i < 300 && !scored; i++) b.integrate(SIM_DT, { onScore() { scored = true; } });
  return scored;
}

test('物理：判定命中的投籃真的會進（跳投與上籃）', () => {
  const rng = new RNG(42);
  for (const [kind, ds] of [['jump', [2.5, 4.5, 6, 7, 8]], ['layup', [0.6, 1.2, 2.0]]]) {
    for (const d of ds) {
      let ok = 0;
      for (let i = 0; i < 60; i++) if (shoot(kind, d, true, rng)) ok++;
      assert.ok(ok >= 57, `${kind} ${d}m 命中 ${ok}/60`);
    }
  }
});

test('物理：判定沒進的投籃大多會彈出來', () => {
  const rng = new RNG(7);
  let inCount = 0;
  for (let i = 0; i < 200; i++) if (shoot('jump', 6, false, rng)) inCount++;
  assert.ok(inCount < 20, `沒進的球卻進了 ${inCount}/200`);
});

test('物理：球會停在地上且沒有 NaN', () => {
  const b = new Ball();
  b.pos = { x: 0, y: 3, z: 0 };
  b.vel = { x: 1, y: 2, z: 0.5 };
  b.state = 'loose';
  for (let i = 0; i < 600; i++) b.integrate(SIM_DT, {});
  assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y));
  assert.ok(Math.abs(b.pos.y - 0.12) < 0.01);
});

test('整場電腦對電腦：會得分、會換球權、進攻時限會重設、沒有 NaN', () => {
  const g = new Game({ home: TEAMS[0], away: TEAMS[3], quarterMinutes: 2, seed: 99, autoContinue: true });
  g.start();
  let nan = 0, steps = 0, shotClockMin = 99, resetsSeen = 0, prevShot = 24;
  const possessions = new Set();
  while (g.phase !== 'gameOver' && steps < 60 * 60 * 25) {
    g.step(SIM_DT);
    steps++;
    for (const p of g.everyoneOnCourt()) if (!Number.isFinite(p.pos.x + p.pos.z + p.y)) nan++;
    if (!Number.isFinite(g.ball.pos.x + g.ball.pos.y + g.ball.pos.z)) nan++;
    const sc = g.rules.shotClock;
    shotClockMin = Math.min(shotClockMin, sc);
    if (sc > prevShot + 1) resetsSeen++;
    prevShot = sc;
    possessions.add(g.rules.possession);
    g.events.length = 0;
  }
  assert.equal(g.phase, 'gameOver', '比賽要能打完');
  assert.equal(nan, 0);
  assert.ok(g.rules.score[0] + g.rules.score[1] > 20, `總分 ${g.rules.score}`);
  assert.ok(possessions.has(0) && possessions.has(1));
  assert.ok(resetsSeen > 20, `進攻時限重設 ${resetsSeen} 次`);
  assert.ok(g.rules.period >= 4);
  assert.ok(R.winner(g.rules) >= 0);
  // 數據一致：球員得分總和等於比分
  for (const t of [0, 1]) {
    const pts = g.teams[t].players.reduce((a, p) => a + p.stats.pts, 0);
    assert.equal(pts, g.rules.score[t], `第 ${t} 隊球員得分總和`);
  }
});

test('投進後由對手在底線發球，進攻時限是 24 秒', () => {
  const g = new Game({ home: TEAMS[1], away: TEAMS[2], quarterMinutes: 3, seed: 5, autoContinue: true });
  g.start();
  let checked = 0;
  let lastScoreTeam = -1;
  for (let i = 0; i < 60 * 60 * 6 && checked < 5; i++) {
    g.step(SIM_DT);
    for (const e of g.events) if (e.type === 'score') lastScoreTeam = e.team;
    g.events.length = 0;
    if (g.phase === 'inbound' && g.pd.fromScore && lastScoreTeam >= 0) {
      assert.equal(g.pd.team, 1 - lastScoreTeam);
      assert.equal(g.rules.possession, 1 - lastScoreTeam);
      assert.equal(g.rules.shotClock, 24);
      assert.ok(Math.abs(g.pd.spot.x) > COURT.halfLength, '發球點在底線外');
      lastScoreTeam = -1;
      checked++;
    }
  }
  assert.ok(checked >= 3, `檢查了 ${checked} 次底線發球`);
});
