// 玩家操控測試：用模擬輸入驅動比賽，檢查投籃時機、切入上籃、方向傳球、抄截、換人。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/sim/game.js';
import { TEAMS } from '../../src/data/teams.js';
import { SIM_DT, COURT } from '../../src/sim/constants.js';
import { emptyInput } from '../../src/sim/control.js';

function liveGame(seed = 1) {
  const g = new Game({ home: TEAMS[0], away: TEAMS[1], quarterMinutes: 3, seed, humans: [{ id: 'p1', team: 0, label: '1P' }] });
  g.start();
  for (let i = 0; i < 600 && g.phase !== 'live'; i++) { g.step(SIM_DT); g.events.length = 0; }
  for (let i = 0; i < 90; i++) { g.step(SIM_DT); g.events.length = 0; }
  return g;
}

function giveBall(g, p, x, z) {
  g.setPhase('live');
  g.ball.shot = null; g.ball.pass = null;
  p.pos.x = x; p.pos.z = z; p.vel.x = 0; p.vel.z = 0; p.y = 0; p.vy = 0; p.action = null;
  g.ball.release('loose');
  g.ball.pos = { x, y: 1, z };
  g.gainBall(p, 'debug');
}

function run(g, frames, inputFn) {
  const ev = [];
  for (let i = 0; i < frames; i++) {
    g.setHumanInput('p1', Object.assign(emptyInput(), inputFn ? inputFn(i, g) : {}));
    g.step(SIM_DT);
    ev.push(...g.events);
    g.events.length = 0;
  }
  return ev;
}

function clearDefenders(g, team, z = -6.5) {
  g.onCourt(1 - team).forEach((d, i) => { d.pos.x = -g.attackSide(team) * (2 + i); d.pos.z = z; });
}

test('跳投：在最高點放開會得到「完美出手」，太早放開是「太早」', () => {
  const g = liveGame(3);
  const h = g.humans[0];
  const p = h.player;
  const side = g.attackSide(0);
  giveBall(g, p, side * (COURT.hoopX - 7.3), 0.5);
  clearDefenders(g, 0);
  let ideal = null;
  const ev = run(g, 60, (i, gg) => {
    const a = p.action;
    if (a && a.type === 'shot' && ideal == null) ideal = a.ideal;
    const holding = i === 0 || (a && a.type === 'shot' && !a.released && a.t + SIM_DT < a.ideal);
    return { shoot: !!holding, shootDown: i === 0 };
  });
  const shot = ev.find((e) => e.type === 'shot');
  assert.ok(shot, '有出手');
  assert.equal(shot.points, 3);
  assert.equal(shot.timing, 'perfect');

  const g2 = liveGame(4);
  const p2 = g2.humans[0].player;
  giveBall(g2, p2, g2.attackSide(0) * (COURT.hoopX - 5), 1);
  clearDefenders(g2, 0);
  const ev2 = run(g2, 60, (i) => ({ shoot: i < 3, shootDown: i === 0 }));
  const s2 = ev2.find((e) => e.type === 'shot');
  assert.ok(s2);
  assert.equal(s2.timing, 'early');
});

test('切入：往籃框衝刺時按投籃會上籃或灌籃', () => {
  const g = liveGame(5);
  const p = g.humans[0].player;
  const side = g.attackSide(0);
  const hx = side * COURT.hoopX;
  giveBall(g, p, hx - side * 7, 0.3);
  clearDefenders(g, 0);
  let pressed = false;
  const ev = run(g, 150, (i) => {
    const d = Math.hypot(hx - p.pos.x, p.pos.z);
    const dx = (hx - p.pos.x) / d, dz = -p.pos.z / d;
    const press = !pressed && d < 2.6;
    if (press) pressed = true;
    return { mx: dx, my: dz, sprint: true, shoot: press, shootDown: press };
  });
  const start = ev.find((e) => e.type === 'shotStart');
  assert.ok(start, '有起步');
  assert.ok(['layup', 'dunk'].includes(start.kind), `出手類型 ${start.kind}`);
});

test('傳球：往搖桿方向傳給那個方向的隊友', () => {
  const g = liveGame(6);
  const p = g.humans[0].player;
  giveBall(g, p, 0, 0);
  const mates = g.onCourt(0).filter((m) => m !== p);
  const spots = [[5, 0], [-5, 0], [0, -5], [0, 5]];
  mates.forEach((m, i) => { m.pos.x = spots[i][0]; m.pos.z = spots[i][1]; m.vel.x = m.vel.z = 0; });
  clearDefenders(g, 0, 7.2);
  for (const [dir, idx] of [[[1, 0], 0], [[0, -1], 2]]) {
    giveBall(g, p, 0, 0);
    mates.forEach((m, i) => { m.pos.x = spots[i][0]; m.pos.z = spots[i][1]; });
    const ev = run(g, 4, (i) => ({ mx: dir[0], my: dir[1], pass: i === 0, passDown: i === 0 }));
    const pe = ev.find((e) => e.type === 'pass');
    assert.ok(pe, '有傳球');
    assert.equal(pe.receiver, mates[idx], `搖桿 ${dir} 應傳給 ${mates[idx].name}，實際 ${pe.receiver.name}`);
  }
});

test('防守：□/X 抄截會出手，✕/A 換到離球最近的人', () => {
  const g = liveGame(7);
  const h = g.humans[0];
  const me = h.player;
  const opp = g.onCourt(1)[0];
  giveBall(g, opp, 2, 0);
  // 球權換了之後，玩家自動切到離球最近的防守者
  const near = h.player;
  near.pos.x = 1.2; near.pos.z = 0; near.facing = 0;
  const ev = run(g, 30, (i) => ({ shoot: i === 0, shootDown: i === 0 }));
  assert.ok(ev.some((e) => e.type === 'stealTry' && e.player === near), '抄截出手');
  // 換人
  giveBall(g, opp, 2, 0);
  const cur = h.player;
  cur.pos.x = -10; cur.pos.z = 0;
  run(g, 2, (i) => ({ pass: i === 0, passDown: i === 0 }));
  assert.notEqual(h.player, cur, '換到別人');
  const d = (p) => Math.hypot(p.pos.x - g.ball.pos.x, p.pos.z - g.ball.pos.z);
  const best = g.onCourt(0).filter((p) => p !== cur).reduce((a, b) => (d(b) < d(a) ? b : a));
  assert.equal(h.player, best);
  void me;
});

test('無球時按 ✕/A 要球，電腦持球者會傳過來', () => {
  const g = liveGame(8);
  const h = g.humans[0];
  const mates = g.onCourt(0);
  const ai = mates.find((m) => m !== h.player);
  giveBall(g, ai, 0, 0);
  // 拿到球後控制會跳到持球者；把控制換回無球的人
  const me = mates.find((m) => m !== ai && m !== h.player) || mates.find((m) => m !== ai);
  if (h.player !== me) { h.player.human = null; h.player = me; me.human = h.label; }
  me.pos.x = g.attackSide(0) * 4; me.pos.z = 3;
  clearDefenders(g, 0, -7);
  const ev = run(g, 90, (i) => ({ pass: i === 5, passDown: i === 5 }));
  const pe = ev.find((e) => e.type === 'pass' && e.receiver === me);
  assert.ok(pe, '電腦有回應要球');
});
