import test from 'node:test';
import assert from 'node:assert/strict';
import { RACE as R } from '../../src/data/balance.js';
import { TRACKS, TRACK_ORDER, buildSegments } from '../../src/data/tracks.js';
import { createRace, stepRace, playerCar, placeOf, trackLength, standings, rivalRatio, wonSushi } from '../../src/mini/race/physics.js';
import { runAutopilot, aiWon, aiSkill, prizesFor, prizeValue } from '../../src/mini/race/ai.js';
import { rngCreate } from '../../src/core/rng.js';
import { SUSHI } from '../../src/data/sushi.js';

test('賽道：至少 3 條，頭尾高度相接，資料完整', () => {
  assert.ok(TRACK_ORDER.length >= 3);
  for (const id of TRACK_ORDER) {
    const tr = TRACKS[id];
    assert.ok(tr.n > 800, `${id} 有 ${tr.n} 段`);
    assert.ok(Math.abs(tr.segs[tr.n - 1].y) < 1e-6, '最後一段的高度回到 0');
    for (const s of tr.segs) assert.ok(Number.isFinite(s.curve) && Number.isFinite(s.y));
    assert.ok(tr.items.some((i) => i.kind === 'puddle') && tr.items.some((i) => i.kind === 'pad'));
  }
  assert.ok(TRACKS.wasabi.segs.some((s) => Math.abs(s.y) > 1000), '山葵山道有坡');
  assert.equal(buildSegments([[2, 4, 2, 1, 0]]).length, 8);
});

test('賽車物理：照計劃書的數值加速、減速、出界', () => {
  const race = createRace({ track: 'itamae', level: 1, rivals: 0 });
  const p = playerCar(race);
  for (let i = 0; i < 60; i++) stepRace(race, { accel: true });
  assert.ok(Math.abs(p.speed - R.MAX_SPEED / 5) < 1, '加速度 = 最高速度 / 5');
  for (let i = 0; i < 60 * 6; i++) { p.x = 0.6; stepRace(race, { accel: true }); }
  assert.ok(Math.abs(p.speed - R.MAX_SPEED) < 1, '不超過最高速度');
  const v = p.speed;
  for (let i = 0; i < 30; i++) { p.x = 0.6; stepRace(race, {}); }
  assert.ok(Math.abs(p.speed - (v + R.DECEL * 0.5)) < 2, '自然減速');
  // 出界：速度上限是最高速度的 1/4，完整度每秒 −5
  p.x = 1.1; p.speed = R.MAX_SPEED;
  for (let i = 0; i < 240; i++) { p.x = 1.1; stepRace(race, { accel: true }); }
  assert.ok(Math.abs(p.speed - R.OFFROAD_LIMIT) < 1);
  assert.ok(Math.abs(p.integrity - 80) < 0.5);
  // 煞車
  p.x = 0;
  const v2 = p.speed;
  stepRace(race, { brake: true });
  assert.ok(Math.abs(p.speed - (v2 + R.BRAKE * R.DT)) < 1);
});

test('賽車物理：山葵噴射每場 3 次，2 秒內最高速度 ×1.25', () => {
  const race = createRace({ track: 'itamae', level: 1, rivals: 0 });
  const p = playerCar(race);
  // 車子固定在 x = 0.6（避開加速板和水灘），只看速度
  const go = (n, input) => { for (let i = 0; i < n; i++) { p.x = 0.6; stepRace(race, input); } };
  go(60 * 6, { accel: true });
  go(1, { accel: true, boost: true });
  assert.equal(p.boosts, 2);
  let top = 0;
  for (let i = 0; i < 115; i++) { go(1, { accel: true }); top = Math.max(top, p.speed); }
  assert.ok(Math.abs(top - R.MAX_SPEED * 1.25) < 1);
  go(60 * 3, { accel: true, boost: false });
  assert.ok(Math.abs(p.speed - R.MAX_SPEED) < 1, '噴射結束後回到最高速度');
  for (let k = 0; k < 5; k++) { go(1, { accel: true, boost: true }); go(150, { accel: true }); }
  assert.equal(p.boosts, 0);
});

test('賽車物理：撞到前車，速度降到前車的 0.8 倍，完整度 −10', () => {
  const race = createRace({ track: 'itamae', level: 1, rivals: 1 });
  const p = playerCar(race);
  const o = race.cars[0];
  o.x = 0; o.lane = 0; o.z = 5000; o.speed = 6000;
  p.x = 0; p.z = 5000 - R.CAR_LEN - 50; p.speed = 11000;
  let hit = false;
  for (let i = 0; i < 30 && !hit; i++) { stepRace(race, { accel: true }); if (p.integrity < 100) hit = true; }
  assert.equal(hit, true);
  assert.equal(p.integrity, 90);
  assert.ok(p.speed <= o.speed * 0.8 + 50);
});

test('賽車物理：決定性', () => {
  const a = runAutopilot({ track: 'shoyu', level: 3, f: 0.93 });
  const b = runAutopilot({ track: 'shoyu', level: 3, f: 0.93 });
  assert.equal(JSON.stringify(a.race), JSON.stringify(b.race));
});

test('驗收 9.8-1：自動駕駛比某台壽司車快 0.03 以上必贏過它，慢 0.03 以上必輸給它（3 條賽道、5 個難度）', () => {
  const N = R.LINEUP.length;
  for (const track of TRACK_ORDER) {
    for (let level = 1; level <= 5; level++) {
      // f 取在每台壽司車上方 0.03，再加一個比最慢那台還慢 0.03 的
      const fs = [rivalRatio(level, 0) - 0.03];
      // 玩家的最高速度比例是 1.0。超過 1.0 的 f 不測
      for (let i = 0; i < N; i++) if (rivalRatio(level, i) + 0.03 <= 1 + 1e-9) fs.push(rivalRatio(level, i) + 0.03);
      for (const f of fs) {
        const r = runAutopilot({ track, level, f });
        for (let i = 0; i < N; i++) {
          const ratio = rivalRatio(level, i);
          const got = r.won.includes(R.LINEUP[i]);
          const tag = `${track} 難度 ${level}，f = ${f.toFixed(2)}，${R.LINEUP[i]}（${ratio.toFixed(2)}）`;
          if (f >= ratio + 0.03 - 1e-9) assert.equal(got, true, `${tag} 應該贏過`);
          if (f <= ratio - 0.03 + 1e-9) assert.equal(got, false, `${tag} 應該輸`);
        }
        assert.equal(r.place, N + 1 - r.won.length);
      }
    }
  }
});

test('驗收 9.8-2：自動駕駛 f = 0.9 跑 3 圈的時間在 55 到 90 秒之間', () => {
  for (const track of TRACK_ORDER) {
    const r = runAutopilot({ track, level: 1, f: 0.9, rivals: 0 });
    assert.ok(r.time >= 55 && r.time <= 90, `${track}：${r.time.toFixed(1)} 秒`);
    assert.ok(r.integrity > 80, `${track}：自動駕駛沒有一直出界（完整度 ${r.integrity.toFixed(0)}）`);
  }
});

test('修馬哈：最高速度比例 1.0，會用噴射，固定速度 0.98 的自動駕駛贏不了他', () => {
  for (const track of TRACK_ORDER) {
    const r = runAutopilot({ track, level: 3, shumaha: true, f: 0.98 });
    const sh = r.race.cars.find((c) => c.kind === 'shumaha');
    assert.equal(sh.place, 1, `${track}：修馬哈第 ${sh.place} 名`);
    assert.equal(sh.boosts, 0);
    assert.equal(r.place, 2);
  }
});

test('對手陣容：越貴的壽司越快，玩家是小黃瓜捲，起跑排最後', () => {
  const race = createRace({ track: 'itamae', level: 2 });
  assert.equal(race.cars.length, R.LINEUP.length + 1);
  const p = playerCar(race);
  assert.equal(p.sushi, 'kappa');
  assert.equal(placeOf(race, p), race.cars.length);
  assert.equal(standings(race)[0].sushi, 'otoro');
  assert.deepEqual(wonSushi(race), []);
  const rivals = race.cars.filter((c) => c.kind === 'shop');
  assert.deepEqual(rivals.map((c) => c.sushi), R.LINEUP);
  for (let i = 1; i < rivals.length; i++) {
    assert.ok(rivals[i].ratio > rivals[i - 1].ratio);
    assert.ok(SUSHI[rivals[i].sushi].ref > SUSHI[rivals[i - 1].sushi].ref, '越快的越貴');
  }
  assert.ok(Math.abs(rivals.at(-1).ratio - R.TOP_RATIO[1]) < 1e-9);
  assert.ok(trackLength(TRACKS.itamae) > 0);
  // 比賽中：超過哪一台就暫時贏到哪一款，被追回去就消失
  p.z = rivals[1].z + 10;
  assert.deepEqual(wonSushi(race), ['tamago', 'sake']);
  p.z = rivals[0].z - 10;
  assert.deepEqual(wonSushi(race), []);
  // 獎品：贏過的每款一貫；都沒贏過就是自己的小黃瓜捲
  assert.deepEqual(prizesFor([]), ['kappa']);
  assert.deepEqual(prizesFor(['tamago', 'sake']), ['tamago', 'sake']);
  assert.equal(prizeValue(['tamago', 'sake']), 320);
  // 對戰修馬哈：最快那台換成他，他的車不算獎品
  const duel = createRace({ track: 'itamae', level: 3, shumaha: true });
  assert.equal(duel.cars.filter((c) => c.kind === 'shop').length, R.LINEUP.length - 1);
  playerCar(duel).z = 99999;
  assert.equal(wonSushi(duel).length, R.LINEUP.length - 1);
});

/** 抽樣算 AI 顧客的回饋率（獎品價值 ÷ 入場費）。 */
function payoutRate(type, level, n = 6000) {
  const rng = rngCreate(9);
  let sum = 0;
  let all = 0;
  for (let i = 0; i < n; i++) {
    const won = aiWon(aiSkill(type, rng), level, rng);
    sum += prizeValue(prizesFor(won));
    if (won.length === R.LINEUP.length) all++;
  }
  return { rate: sum / n / R.FEE, all: all / n };
}

test('AI 顧客的公式和回饋率表（計劃書 9.6）', () => {
  // 入場費 ¥800 時的回饋率範圍。[下限, 上限]
  const TABLE = {
    normal:  [[1.10, 1.35], [0.82, 1.02], [0.57, 0.73], [0.40, 0.52], [0.27, 0.37]],
    raceFan: [[1.55, 1.90], [1.27, 1.55], [0.95, 1.17], [0.66, 0.82], [0.45, 0.57]],
  };
  for (const type of Object.keys(TABLE)) {
    let prev = Infinity;
    TABLE[type].forEach(([lo, hi], i) => {
      const { rate } = payoutRate(type, i + 1);
      assert.ok(rate >= lo && rate <= hi, `${type} 難度 ${i + 1} 回饋率 ${rate.toFixed(3)}，範圍 ${lo}–${hi}`);
      assert.ok(rate < prev, '難度越高，回饋率越低');
      prev = rate;
    });
  }
  // 修馬哈：幾乎每場全拿
  assert.ok(payoutRate('shumaha', 3).all > 0.99);
  assert.ok(payoutRate('shumaha', 5).all > 0.9);
  // 贏到的一定是從最慢的開始連續的幾款
  const rng = rngCreate(3);
  for (let i = 0; i < 200; i++) {
    const won = aiWon(aiSkill('normal', rng), 3, rng);
    assert.deepEqual(won, R.LINEUP.slice(0, won.length));
  }
});
