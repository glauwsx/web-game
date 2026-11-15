import test from 'node:test';
import assert from 'node:assert/strict';
import { RACE as R } from '../../src/data/balance.js';
import { TRACKS, TRACK_ORDER, buildSegments } from '../../src/data/tracks.js';
import { createRace, stepRace, playerCar, placeOf, trackLength, standings } from '../../src/mini/race/physics.js';
import { runAutopilot, aiPlace, aiSkill, prizeForPlace } from '../../src/mini/race/ai.js';
import { rngCreate } from '../../src/core/rng.js';

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

test('驗收 9.8-1：自動駕駛比壽司車快 0.03 以上必贏，慢 0.03 以上必輸（3 條賽道、5 個等級）', () => {
  for (const track of TRACK_ORDER) {
    for (let level = 1; level <= 5; level++) {
      const r = R.SHOP_RATIO[level - 1];
      const fast = runAutopilot({ track, level, f: r + 0.03 });
      assert.equal(fast.place, 1, `${track} 等級 ${level}：f = ${(r + 0.03).toFixed(2)} 應該第 1 名，結果第 ${fast.place} 名`);
      const slow = runAutopilot({ track, level, f: r - 0.03 });
      assert.equal(slow.place, R.CARS, `${track} 等級 ${level}：f = ${(r - 0.03).toFixed(2)} 應該最後一名，結果第 ${slow.place} 名`);
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

test('AI 顧客的名次公式（計劃書 9.6）', () => {
  const rng = rngCreate(9);
  const dist = (type, level) => {
    const c = [0, 0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) c[aiPlace(aiSkill(type, rng), level, rng)]++;
    return c.map((x) => x / 4000);
  };
  // 修馬哈幾乎每場第 1 名
  assert.ok(dist('shumaha', 3)[1] > 0.99);
  assert.ok(dist('shumaha', 5)[1] > 0.8);
  // 等級越高，顧客越難贏
  const n1 = dist('normal', 1);
  const n5 = dist('normal', 5);
  assert.ok(n1[1] > 0.3 && n5[1] < 0.01, `一般客等級 1 第 1 名 ${n1[1]}、等級 5 ${n5[1]}`);
  assert.ok(dist('raceFan', 3)[1] > dist('normal', 3)[1]);
  assert.equal(prizeForPlace(1), 'set_tokujo');
  assert.equal(prizeForPlace(2), 'set_jo');
  assert.equal(prizeForPlace(3), 'set_nami');
  assert.equal(prizeForPlace(4), 'tier1');
  // 名次和排名函式
  const race = createRace({ track: 'itamae', level: 2 });
  assert.equal(race.cars.length, 6);
  assert.equal(placeOf(race, playerCar(race)), 6);
  assert.equal(standings(race)[0].id, 5);
  assert.ok(trackLength(TRACKS.itamae) > 0);
});
