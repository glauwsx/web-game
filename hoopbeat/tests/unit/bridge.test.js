import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/hoops/sim/game.js';
import { TEAMS } from '../../src/hoops/data/teams.js';
import { SIM_DT } from '../../src/hoops/sim/constants.js';
import { Deck } from '../../src/music/deck.js';
import { Conductor } from '../../src/music/conductor.js';
import { BeatBridge } from '../../src/game/beatbridge.js';
import { songAtBpm } from '../../src/music/demos.js';
import { applyTactic, previewTactic, TACTICS } from '../../src/music/tactics.js';

function setup({ humans = [], bpm = 120, latencyMs = 0 } = {}) {
  const decks = { home: new Deck({ id: 'home', ...songAtBpm('house', 't', bpm) }), away: new Deck({ id: 'away', ...songAtBpm('house', 't', bpm) }) };
  const conductor = new Conductor(decks);
  const g = new Game({ home: TEAMS[0], away: TEAMS[1], quarterMinutes: 2, seed: 7, humans, autoContinue: true });
  const clock = { t: 0 };
  const bridge = new BeatBridge({ conductor, latencyMs, headless: false, clock: () => clock.t }).install(g);
  conductor.start(0, 'home');
  g.start();
  const run = (sec) => {
    for (let i = 0; i < sec / SIM_DT; i++) {
      clock.t += SIM_DT;
      conductor.tick(clock.t, 0.15);
      g.step(SIM_DT);
      g.events.length = 0;
    }
  };
  return { g, bridge, conductor, decks, clock, run };
}

test('橋接：真人在拍點上按抄截 → Perfect；早 100 毫秒 → Good 或更差', () => {
  const { g, bridge, clock, run } = setup({ humans: [{ id: 'kb', team: 0 }] });
  run(8);
  const p = g.humans[0].player;
  assert.ok(p, '有控制的球員');
  // 把時鐘放到下一拍上
  const nb = bridge.grid.nextBeat(clock.t + 0.1);
  clock.t = nb.time;
  g.phase = 'live';
  p.action = null; p.stealCooldown = 0; p.y = 0; p.vy = 0;
  g.attemptSteal(p);
  const j1 = bridge.judgments[bridge.judgments.length - 1];
  assert.equal(j1.human, true);
  assert.equal(j1.kind, 'steal');
  assert.equal(j1.grade, 'perfect');
  clock.t = bridge.grid.nextBeat(clock.t + 0.1).time - 0.1;
  p.action = null; p.stealCooldown = 0;
  g.attemptSteal(p);
  const j2 = bridge.judgments[bridge.judgments.length - 1];
  assert.ok(['good', 'miss'].includes(j2.grade), j2.grade);
  assert.ok(j2.offsetMs < 0);
});

test('橋接：延遲校正在比賽判定裡生效', () => {
  const { g, bridge, clock, run } = setup({ humans: [{ id: 'kb', team: 0 }], latencyMs: 70 });
  run(8);
  const p = g.humans[0].player;
  clock.t = bridge.grid.nextBeat(clock.t + 0.1).time + 0.07; // 晚 70 毫秒才被記錄
  g.phase = 'live';
  p.action = null; p.stealCooldown = 0; p.y = 0; p.vy = 0;
  g.attemptSteal(p);
  assert.equal(bridge.judgments[bridge.judgments.length - 1].grade, 'perfect');
});

test('橋接：電腦球員把動作排到拍點上', () => {
  const { g, bridge, run } = setup();
  run(30);
  const ai = bridge.judgments.filter((j) => !j.human && !j.rush && j.kind !== 'block');
  assert.ok(ai.length >= 5, `判定次數 ${ai.length}`);
  const good = ai.filter((j) => j.grade === 'perfect' || j.grade === 'great').length;
  assert.ok(good / ai.length > 0.7, `踩中率 ${good}/${ai.length}`);
});

test('橋接：播進攻方的歌', () => {
  const { g, bridge, run } = setup();
  let switched = 0;
  let last = bridge.conductor.audible;
  for (let i = 0; i < 40; i++) {
    run(1);
    const off = g.offenseTeam();
    if (bridge.conductor.audible !== last) { switched++; last = bridge.conductor.audible; }
    if (off === 0 || off === 1) assert.ok(['home', 'away'].includes(bridge.conductor.audible));
  }
  assert.ok(switched >= 1, '換邊時有切換配樂');
});

test('橋接：音樂修正值套到球員身上', () => {
  const { g, bridge, decks, run } = setup({ bpm: 120 });
  decks.home.bpm = 170;
  run(1);
  const home = g.teams[0].lineup[0];
  const away = g.teams[1].lineup[0];
  assert.ok(home.mods.speed > away.mods.speed);
  assert.ok(home.mods.foul > away.mods.foul);
  assert.ok(bridge.interceptMul(0, 1) > bridge.interceptMul(1, 0) * 0.9);
});

test('戰術配樂：全速衝刺加速、穩住節奏減速，預告方向正確', () => {
  const { decks } = setup();
  const d = decks.home;
  d.playing = true;
  d.advanceBar(0);
  const rush = previewTactic(d, 'rush');
  const find = (pv, label) => pv.deltas.find((x) => x.label === label)?.v ?? 0;
  assert.ok(find(rush, '跑速') > 0);
  assert.ok(find(rush, '判定窗口') < 0);
  assert.ok(find(rush, '命中率') < 0);
  const steady = previewTactic(d, 'steady');
  assert.ok(find(steady, '跑速') < 0);
  assert.ok(find(steady, '傳球') > 0);
  assert.ok(find(steady, '判定窗口') > 0);
  applyTactic(d, 'rush');
  d.advanceBar(1);
  assert.equal(d.bpm, d.baseBpm + 15);
  assert.equal(d.tactic, 'rush');
  assert.ok(['peak', 'busy'].includes(d.bank.tracks.drums[d.currentClips().drums].style));
  // 換段落不會取消戰術
  d.jumpSection(1);
  d.advanceBar(2);
  assert.equal(d.tactic, 'rush');
  d.resetLive();
  d.advanceBar(3);
  assert.equal(d.bpm, d.baseBpm);
  assert.equal(d.tactic, null);
  assert.equal(TACTICS.length, 4);
});
