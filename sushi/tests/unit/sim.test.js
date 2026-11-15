import test from 'node:test';
import assert from 'node:assert/strict';
import { createShopState, applyAction, stepShop, dayTicks, evaluateDay } from '../../src/sim/shop.js';
import { runDay, botStep } from '../../src/sim/bots.js';
import { createRival, rivalRevenueAt } from '../../src/sim/rival.js';
import { rngCreate } from '../../src/core/rng.js';
import { sampleConfig } from './helpers.js';

test('sim：不開瀏覽器跑完一個營業日', () => {
  const s = runDay(sampleConfig({ seed: 3 }));
  assert.equal(s.phase, 'closed');
  assert.equal(s.tick, 4800); // 11:00 到 21:00 = 600 分鐘 × 8 tick
  assert.ok(s.day.revenue > 10000, `營業額 ${s.day.revenue}`);
  assert.ok(s.day.groups > 30);
  assert.ok(s.day.pieces > 50);
  assert.ok(s.result && typeof s.result.passed === 'boolean');
  // 營業額 = 各項收入 − 罰款
  assert.equal(s.day.revenue, s.day.sales + s.day.fees + s.day.tips + s.day.bonus - s.day.penalties);
  // 庫存不會變成負數
  for (const st of Object.values(s.stock)) assert.ok(st.premium >= 0 && st.cheap >= 0);
});

test('sim 決定性：同種子同操作跑一整天兩次，最終狀態的 JSON 完全相同', () => {
  const a = JSON.stringify(runDay(sampleConfig({ seed: 42 })));
  const b = JSON.stringify(runDay(sampleConfig({ seed: 42 })));
  assert.equal(a, b);
  const c = JSON.stringify(runDay(sampleConfig({ seed: 43 })));
  assert.notEqual(a, c);
});

test('sim 決定性：營業中的操作也一樣', () => {
  const run = () => {
    const s = createShopState(sampleConfig({ seed: 7 }));
    applyAction(s, { type: 'buySuggested' });
    applyAction(s, { type: 'setMenu', item: 'maguro', price: 330 });
    applyAction(s, { type: 'open' });
    for (let i = 0; i < dayTicks(s); i++) {
      if (i === 1000) applyAction(s, { type: 'setRole', staff: 'honda', role: 'off' });
      if (i === 2000) applyAction(s, { type: 'buy', item: 'sake', grade: 'premium', qty: 20 });
      if (i === 2500) applyAction(s, { type: 'setRole', staff: 'honda', role: 'floor' });
      stepShop(s);
    }
    return JSON.stringify(s);
  };
  assert.equal(run(), run());
});

test('sim 存檔：跑到一半存檔再讀檔，繼續跑的結果跟沒中斷的相同', () => {
  const full = runDay(sampleConfig({ seed: 11 }));
  let s = createShopState(sampleConfig({ seed: 11 }));
  for (let i = 0; i < 100000 && s.phase !== 'closed'; i++) {
    botStep(s, 'naive');
    // 在幾個不同的時間點存檔再讀檔
    if (s.tick === 500 || s.tick === 1777 || s.tick === 3333) s = JSON.parse(JSON.stringify(s));
  }
  assert.equal(JSON.stringify(s), JSON.stringify(full));
});

test('sim：狀態是純 JSON（沒有函式、Map、Set、undefined）', () => {
  const s = createShopState(sampleConfig({ seed: 5 }));
  applyAction(s, { type: 'buySuggested' });
  applyAction(s, { type: 'open' });
  for (let i = 0; i < 1500; i++) stepShop(s);
  const walk = (v, path) => {
    if (v === null) return;
    const tp = typeof v;
    assert.ok(tp !== 'function' && tp !== 'undefined' && tp !== 'symbol', `${path} 是 ${tp}`);
    if (tp === 'number') assert.ok(Number.isFinite(v), `${path} 不是有限數字`);
    if (tp !== 'object') return;
    assert.ok(Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype, `${path} 不是普通物件`);
    for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(s, 'state');
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('sim：操作的檢查', () => {
  const s = createShopState(sampleConfig());
  assert.equal(applyAction(s, { type: 'nope' }).reason, 'unknown');
  assert.equal(applyAction(s, null).reason, 'bad');
  assert.equal(applyAction(s, { type: 'kufu' }).reason, 'phase');
  assert.equal(applyAction(s, { type: 'setMenu', item: 'otoro', on: true }).reason, 'locked');
  assert.equal(applyAction(s, { type: 'setMenu', item: 'ika', mode: 'cheapHonest' }).reason, 'locked');
  assert.equal(applyAction(s, { type: 'setMenu', item: 'ika', price: 10 }).reason, 'price');
  assert.equal(applyAction(s, { type: 'setMenu', item: 'ika', price: 233 }).ok, true);
  assert.equal(s.menu.ika.price, 230); // 售價以 ¥10 為單位
  assert.equal(applyAction(s, { type: 'setUniform', on: true }).reason, 'locked');
  assert.equal(applyAction(s, { type: 'setRole', staff: 'honda', role: 'chef' }).reason, 'noStation');
  assert.equal(applyAction(s, { type: 'setRole', staff: 'ryo', role: 'off' }).ok, true);
  assert.equal(applyAction(s, { type: 'open' }).reason, 'noChef');
  assert.equal(applyAction(s, { type: 'setRole', staff: 'honda', role: 'chef' }).ok, true);
  assert.equal(applyAction(s, { type: 'open' }).ok, true);
  assert.equal(applyAction(s, { type: 'open' }).reason, 'phase');
  assert.equal(applyAction(s, { type: 'kufu' }).reason, 'notFull');
});

test('真工夫：量表滿了才能發動，持續 30 遊戲分鐘，阿兩變快', async () => {
  const { makeTicks, effSkill, findStaff } = await import('../../src/sim/staff.js');
  const s = createShopState(sampleConfig());
  applyAction(s, { type: 'open' });
  const ryo = findStaff(s, 'ryo');
  const normal = makeTicks(s, ryo, 'maguro');
  assert.ok(Math.abs(normal - 1.2 * 10 / 14 * 8) < 1e-9); // 製作時間 × 10 / (5 + 捏製速度)
  s.kufu = 100;
  assert.equal(applyAction(s, { type: 'kufu' }).ok, true);
  assert.equal(s.kufu, 0);
  assert.ok(Math.abs(makeTicks(s, ryo, 'maguro') - 1.2 * 10 / 23 * 8) < 1e-9);
  assert.equal(effSkill(s, ryo), 10);
  for (let i = 0; i < 30 * 8; i++) stepShop(s);
  assert.equal(makeTicks(s, ryo, 'maguro'), normal);
  assert.equal(effSkill(s, ryo), 8);
});

test('rival：憂鬱的營業額曲線', () => {
  const r = createRival(100000, rngCreate(3), 660, 1260);
  assert.equal(rivalRevenueAt(r, 660), 0);
  assert.equal(rivalRevenueAt(r, 1260), 100000); // 打烊時剛好到達目標
  let prev = 0;
  for (let m = 660; m <= 1260; m += 30) {
    const v = rivalRevenueAt(r, m);
    assert.ok(v >= prev - 100000 * 0.031, '不會大幅倒退');
    prev = v;
  }
  // 擾動不超過 ±3%
  const flat = createRival(100000, rngCreate(3), 660, 1260);
  flat.noise = flat.noise.map(() => 0);
  for (let m = 660; m <= 1260; m += 17) {
    const base = rivalRevenueAt(flat, m);
    assert.ok(Math.abs(rivalRevenueAt(r, m) - base) <= base * 0.03 + 1);
  }
  // 同種子同曲線
  assert.deepEqual(createRival(100000, rngCreate(3), 660, 1260), r);
});

test('評星：★ 過關、★★ 超過 15%、★★★ 再加上評價沒掉而且沒被拆穿', () => {
  const s = createShopState(sampleConfig({ goal: { kind: 'fixed', target: 10000 } }));
  s.day.revenue = 9999;
  assert.equal(evaluateDay(s).stars, 0);
  s.day.revenue = 10000;
  assert.equal(evaluateDay(s).stars, 1);
  s.day.revenue = 11500;
  assert.equal(evaluateDay(s).stars, 3);
  s.exposedCount = 1;
  assert.equal(evaluateDay(s).stars, 2);
  s.exposedCount = 0;
  s.reputation = s.repStart - 0.1;
  assert.equal(evaluateDay(s).stars, 2);
});
