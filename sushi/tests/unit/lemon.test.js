// 單元測試 9（檸檬部分）、三種結局、good 自動玩家、平衡條件（計劃書 11.5 的縮小版）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../../src/data/balance.js';
import { createShopState, applyAction, stepShop } from '../../src/sim/shop.js';
import { lemonExpected, scheduleEvents } from '../../src/sim/bosses.js';
import { runDay } from '../../src/sim/bots.js';
import { getLevel, levelConfig } from '../../src/data/levels.js';
import { rngCreate } from '../../src/core/rng.js';
import { sampleConfig } from './helpers.js';

const MENU = ['tamago', 'kappa', 'ika', 'sake', 'maguro', 'chutoro', 'uni', 'otoro'];

function lemonDay(disguise, over = {}) {
  const s = createShopState(sampleConfig({
    baseArrival: 0, money: 300000, menu: MENU, reputation: 50,
    features: { cheap: true, disguise: true }, events: [{ kind: 'lemon', at: 12 * 60 }], ...over,
  }));
  for (const id of MENU) {
    applyAction(s, { type: 'buy', item: id, grade: 'premium', qty: 10 });
    applyAction(s, { type: 'buy', item: id, grade: 'cheap', qty: 10 });
    if (disguise) assert.equal(applyAction(s, { type: 'setMenu', item: id, mode: 'cheapDisguised' }).ok, true);
  }
  applyAction(s, { type: 'open' });
  return s;
}
const run = (s, until, max = 8 * 600) => { for (let i = 0; i < max && !until(s); i++) stepShop(s); return until(s); };

test('檸檬：來店前 30 分鐘有預告', () => {
  const ev = scheduleEvents([{ kind: 'lemon', at: 900, jitter: 30 }], rngCreate(3));
  assert.equal(ev.length, 2);
  assert.equal(ev[0].kind, 'lemonNotice');
  assert.equal(ev[1].at - ev[0].at, B.LEMON.NOTICE_MIN);
  const s = lemonDay(false);
  assert.equal(lemonExpected(s), false);
  run(s, (x) => x.feed.some((e) => e.key === 'feed.lemonNotice'));
  assert.equal(s.openMin + Math.floor(s.tick / 8), 12 * 60 - B.LEMON.NOTICE_MIN);
  assert.equal(lemonExpected(s), true);
  assert.equal(s.customers.some((c) => c.boss === 'lemon'), false, '預告時她還沒到');
});

test('檸檬：全部通過，評價 +5，真工夫量表加滿', () => {
  const s = lemonDay(false);
  assert.ok(run(s, (x) => x.flags.lemonResult));
  assert.equal(s.flags.lemonResult, 'pass');
  assert.equal(s.kufu, B.KUFU_MAX);
  assert.equal(s.exposedCount, 0);
  assert.ok(s.reputation >= 50 + B.LEMON.PASS_REP - 0.01);
  assert.equal(lemonExpected(s), false);
  const lemon = s.customers.find((c) => c.boss === 'lemon');
  assert.equal(new Set(lemon.tasted).size, B.LEMON.TASTES, '試吃 3 個不同的品項');
  run(s, (x) => x.phase === 'closed', 8 * 700);
  assert.equal(s.day.penalties, 0);
});

test('檸檬：魚目混珠一定被吃出來，店內顧客滿意度 −20、評價下降，第 9 關營業額 −30%', () => {
  const s = lemonDay(true, { lemonPenalty: 0.3 });
  // 放一位正在吃的客人，看他的滿意度
  run(s, (x) => x.customers.some((c) => c.boss === 'lemon' && c.st === 'wait'));
  const lemon = s.customers.find((c) => c.boss === 'lemon');
  const other = { ...lemon, id: 9999, boss: null, type: 'normal', st: 'eat', sat: 70, timer: 9999, furn: 0, tasted: undefined, order: 0 };
  s.customers.push(other);
  const rep = s.reputation;
  assert.ok(run(s, (x) => x.flags.lemonResult));
  assert.equal(s.flags.lemonResult, 'fail');
  assert.equal(s.exposedCount, 1);
  assert.equal(lemon.eaten, 1, '第一貫就吃出來');
  assert.equal(other.sat, 70 + B.LEMON.FAIL_SAT);
  assert.ok(Math.abs(s.reputation - (rep + B.REP_EXPOSED + B.LEMON.FAIL_REP)) < 0.5);
  assert.equal(lemon.st, 'leave');
  s.customers = s.customers.filter((c) => c.id !== 9999);
  run(s, (x) => x.phase === 'closed', 8 * 700);
  const gross = s.day.sales + s.day.tips;
  assert.equal(s.day.penalties, Math.round(gross * 0.3));
  assert.equal(s.result.exposedCount, 1);
  assert.ok(s.result.stars < 3);
});

test('檸檬：收到預告後改回誠實賣法就沒事', () => {
  const s = lemonDay(true);
  run(s, (x) => lemonExpected(x));
  for (const id of MENU) applyAction(s, { type: 'setMenu', item: id, mode: 'premium' });
  assert.ok(run(s, (x) => x.flags.lemonResult));
  assert.equal(s.flags.lemonResult, 'pass');
});

test('第 10 關的三種結局', () => {
  const lv = getLevel(10);
  assert.equal(lv.endings({}, { passed: false, exposedCount: 2, stars: 0 }), lv.fail);
  assert.equal(lv.endings({}, { passed: true, exposedCount: 1, stars: 2 }), lv.tie);
  assert.equal(lv.endings({}, { passed: true, exposedCount: 0, stars: 3 }), lv.perfect);
  assert.equal(lv.endings({}, { passed: true, exposedCount: 0, stars: 1 }), lv.pass);
});

test('good 自動玩家：排班、補貨、應付強敵和部長；跑同一個種子結果相同', () => {
  const a = runDay(levelConfig(7, 5), 'good');
  const b = runDay(levelConfig(7, 5), 'good');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.staff.find((s) => s.id === 'terai').role, 'chef');
  assert.equal(a.day.caught, 0, '部長來的時候有變裝');
  assert.equal(a.staff.find((s) => s.id === 'ryo').disguised, false, '部長走了有解除');
  assert.ok(a.day.purchases > 30000, '營業中有補貨');
  assert.ok(a.result.passed);
  const n = runDay(levelConfig(7, 5), 'naive');
  assert.equal(n.result.passed, false);
  // 第 9 關：good 不作弊，檸檬通過
  const g9 = runDay(levelConfig(9, 2), 'good');
  assert.equal(g9.flags.lemonResult, 'pass');
  assert.equal(g9.exposedCount, 0);
});

test('平衡（縮小版，完整版是 tools/sim-levels.mjs）：每關 6 個種子，good 都過關，naive 第 3 關起都不過', () => {
  for (let id = 1; id <= 10; id++) {
    let good = 0;
    let naive = 0;
    for (let seed = 1; seed <= 6; seed++) {
      if (runDay(levelConfig(id, seed), 'good').result.passed) good++;
      if (id >= 3 && runDay(levelConfig(id, seed), 'naive').result.passed) naive++;
    }
    assert.ok(good >= 5, `第 ${id} 關 good 過關 ${good}/6`);
    assert.ok(naive <= 1, `第 ${id} 關 naive 過關 ${naive}/6`);
  }
});
