import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINES } from '../src/machines/index.js';
import { createSession, STEPS_PER_BALL } from '../src/session.js';
import { PH } from '../src/physics.js';

const byId = (id) => MACHINES.find((m) => m.id === id);

/** 連續發射 n 顆。power 可以是函式（看機台狀態決定力道）。 */
function play(s, n, power) {
  let timeouts = 0;
  for (let i = 0; i < n; i++) {
    s.fire(typeof power === 'function' ? power(s) : power);
    for (let k = 0; k < STEPS_PER_BALL; k++) for (const e of s.step()) if (e.ball.t > PH.MAX_T - 1) timeouts++;
  }
  return timeouts;
}
const auto = (m) => (s) => (s.logic.wantRight() ? m.rightPower : m.defaultPower);

for (const m of MACHINES) {
  test(`${m.name}：建議力道下鋼珠不會卡住，也不會界外`, () => {
    const s = createSession(m, { seed: 42 });
    const timeouts = play(s, 1500, m.defaultPower);
    assert.equal(timeouts, 0);
    assert.equal(s.stats.fouls, 0);
    assert.equal(s.stats.fired, 1500);
  });

  test(`${m.name}：力道太弱時全部界外，球會退回`, () => {
    const s = createSession(m, { seed: 1 });
    play(s, 50, 0.05);
    assert.equal(s.stats.fouls, 50);
    assert.equal(s.stats.fired, 0);
  });

  test(`${m.name}：綠色區的力道真的會中獎`, () => {
    const s = createSession(m, { seed: 7 });
    play(s, 1500, m.defaultPower);
    assert.ok(s.stats.paid > 0, '1500 顆至少要賠出一些');
    assert.ok(s.stats.ins >= 30, `入賞 ${s.stats.ins} 次太少`);
  });
}

test('鬱金香機：回收率在 90% 到 190% 之間', () => {
  const s = createSession(byId('tulip'), { seed: 3 });
  play(s, 12000, 0.47);
  const rate = s.stats.paid / s.stats.fired;
  assert.ok(rate > 0.9 && rate < 1.9, `回收率 ${rate.toFixed(2)}`);
});

test('鬱金香機：鋼珠進鬱金香會讓花瓣換狀態', () => {
  const s = createSession(byId('tulip'), { seed: 3 });
  const t = s.board.tulips.find((q) => q.id === 'tc');
  const sensor = s.board.sensors.find((q) => q.id === 'tc');
  assert.equal(t.open, false);
  s.logic.onSensor(sensor, {});
  assert.equal(t.open, true);
  s.logic.onSensor(sensor, {});
  assert.equal(t.open, false);
  assert.equal(s.board.tulips.find((q) => q.id === 'tb').open, true, '中央收球後，下鬱金香要開');
});

test('羽根物：回收率在 70% 到 200% 之間', () => {
  const s = createSession(byId('hane'), { seed: 5 });
  play(s, 30000, 0.47);
  const rate = s.stats.paid / s.stats.fired;
  assert.ok(rate > 0.7 && rate < 2.0, `回收率 ${rate.toFixed(2)}`);
  assert.ok((s.stats.byId.V || 0) >= 5, 'V 入賞次數太少');
});

test('羽根物：大當會跑完所有回合再回到普通', () => {
  const m = byId('hane');
  const s = createSession(m, { seed: 9 });
  s.logic.debugWin();
  const st = s.logic.state;
  assert.equal(st.phase, 'jackpot');
  const rounds = st.rounds;
  let guard = 0;
  while (st.phase === 'jackpot' && guard++ < 2000) play(s, 1, 0.47);
  assert.equal(st.phase, 'normal');
  assert.equal(st.last[0].rounds, rounds);
  assert.ok(st.last[0].got >= rounds * 30, `大當只拿到 ${st.last[0].got} 顆`);
});

for (const id of ['ama', 'mid']) {
  test(`${byId(id).name}：ヘソ進球率在 5% 到 12% 之間`, () => {
    const m = byId(id);
    const s = createSession(m, { seed: 11 });
    play(s, 12000, m.defaultPower);
    const r = (s.stats.byId.heso || 0) / s.stats.fired;
    assert.ok(r > 0.05 && r < 0.12, `ヘソ ${(r * 100).toFixed(1)}%`);
  });

  test(`${byId(id).name}：大當 → 右打進アタッカー → 確變 → 回到普通`, () => {
    const m = byId(id);
    const C = m.cfg;
    const s = createSession(m, { seed: 21 });
    const st = s.logic.state;
    s.logic.debugWin();
    play(s, 30, auto(m));
    assert.equal(st.phase, 'jp');
    assert.equal(s.logic.wantRight(), true);
    const rounds = st.jp.rounds;
    let guard = 0;
    while (st.phase === 'jp' && guard++ < 600) play(s, 1, auto(m));
    assert.equal(st.mode, 'st', '大當後要進確變');
    const att = s.stats.byId.att || 0;
    assert.ok(att >= rounds * C.count * 0.8, `${rounds} 回合只進了 ${att} 顆`);
    // 確變中右打：鋼珠要進電チュー，讓數字一直轉
    play(s, 250, auto(m));
    assert.ok((s.stats.byId.denchu || 0) > 30, `電チュー只進 ${s.stats.byId.denchu || 0} 顆`);
    // 最後一定會回到普通（確變回數用完）
    guard = 0;
    while (s.logic.wantRight() && guard++ < 30000) play(s, 1, auto(m));
    assert.equal(st.mode, 'normal');
    assert.notEqual(st.phase, 'jp');
  });
}

test('數位機：普通狀態右打幾乎沒有回報', () => {
  const m = byId('ama');
  const s = createSession(m, { seed: 2 });
  play(s, 1500, m.rightPower);
  assert.ok(s.stats.paid / s.stats.fired < 0.15);
});
