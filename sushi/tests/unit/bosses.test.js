import test from 'node:test';
import assert from 'node:assert/strict';
import { createShopState, applyAction, stepShop } from '../../src/sim/shop.js';
import { scheduleEvents, buchoInShop } from '../../src/sim/bosses.js';
import { findStaff, effSpeed } from '../../src/sim/staff.js';
import { rngCreate } from '../../src/core/rng.js';
import { sampleConfig } from './helpers.js';

function buchoDay(over = {}) {
  const s = createShopState(sampleConfig({ baseArrival: 0, money: 100000, events: [{ kind: 'bucho', at: 11 * 60 + 5 }], ...over }));
  for (const id of Object.keys(s.menu)) applyAction(s, { type: 'buy', item: id, grade: 'premium', qty: 20 });
  applyAction(s, { type: 'open' });
  return s;
}

test('事件時間表：時間有小幅隨機，同種子結果相同', () => {
  const defs = [{ kind: 'bucho', at: 800, jitter: 20 }, { kind: 'bucho', at: 700, jitter: 0 }];
  const a = scheduleEvents(defs, rngCreate(5));
  const b = scheduleEvents(defs, rngCreate(5));
  assert.deepEqual(a, b);
  assert.equal(a[0].at, 700);
  assert.ok(Math.abs(a[1].at - 800) <= 20);
  assert.equal(a[0].fired, false);
});

test('部長：沒變裝 5 遊戲分鐘後被認出來，罰款 ¥10,000，阿兩被拖走 60 分鐘', () => {
  const s = buchoDay();
  const ryo = findStaff(s, 'ryo');
  let enteredAt = -1;
  let caughtAt = -1;
  for (let i = 0; i < 8 * 120 && caughtAt < 0; i++) {
    stepShop(s);
    if (enteredAt < 0 && buchoInShop(s)) enteredAt = s.tick;
    if (s.day.caught) caughtAt = s.tick;
  }
  assert.ok(enteredAt > 0, '部長有進店');
  assert.ok(Math.abs((caughtAt - enteredAt) - 5 * 8) <= 1, `進店後 ${caughtAt - enteredAt} tick 被認出來`);
  assert.equal(s.day.penalties, 10000);
  assert.equal(s.day.revenue <= -10000 + s.day.sales + s.day.tips, true);
  assert.ok(ryo.gone > 0);
  assert.equal(s.banner.kind, 'caught');
  // 被拖走的期間不能捏壽司
  const goneTicks = ryo.gone;
  assert.ok(Math.abs(goneTicks - 60 * 8) <= 1);
  for (let i = 0; i < goneTicks - 1; i++) stepShop(s);
  assert.ok(ryo.gone > 0);
  assert.equal(applyAction(s, { type: 'kufu' }).ok, false);
  stepShop(s);
  stepShop(s);
  assert.equal(ryo.gone, 0);
  assert.ok(ryo.gx > 0, '阿兩回到板前檯');
});

test('部長：變裝就不會被認出來；變裝期間捏製速度 −30%；部長會點餐付錢', () => {
  const s = buchoDay();
  const ryo = findStaff(s, 'ryo');
  assert.equal(effSpeed(s, ryo), 9);
  assert.equal(applyAction(s, { type: 'disguise', on: true }).ok, true);
  assert.ok(Math.abs(effSpeed(s, ryo) - 6.3) < 1e-9);
  let sawBucho = false;
  for (let i = 0; i < 8 * 200; i++) {
    stepShop(s);
    if (buchoInShop(s)) sawBucho = true;
  }
  assert.equal(sawBucho, true);
  assert.equal(s.day.caught, 0);
  assert.equal(s.day.penalties, 0);
  assert.ok(s.day.sales > 0, '部長有消費');
  assert.equal(s.customers.length, 0, '部長吃完離開了');
  applyAction(s, { type: 'disguise', on: false });
  assert.equal(effSpeed(s, ryo), 9);
});

test('部長：中途才變裝，計時會歸零；阿兩不在板前檯也不會被認出來', () => {
  const s = buchoDay();
  let n = 0;
  while (!buchoInShop(s) && n++ < 2000) stepShop(s);
  for (let i = 0; i < 30; i++) stepShop(s); // 被看了快 4 分鐘
  applyAction(s, { type: 'disguise', on: true });
  for (let i = 0; i < 8; i++) stepShop(s);
  applyAction(s, { type: 'disguise', on: false });
  for (let i = 0; i < 30; i++) stepShop(s); // 重新計時，還沒滿 5 分鐘
  assert.equal(s.day.caught, 0);
  // 阿兩休息、本田上板前檯
  const s2 = buchoDay();
  applyAction(s2, { type: 'setRole', staff: 'ryo', role: 'off' });
  applyAction(s2, { type: 'setRole', staff: 'honda', role: 'chef' });
  for (let i = 0; i < 8 * 200; i++) stepShop(s2);
  assert.equal(s2.day.caught, 0);
});
