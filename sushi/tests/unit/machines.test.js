// 機台和經營模擬的整合：小鋼珠台、壽司賽道、職業玩家、修馬哈（單元測試 9 的機台強敵部分）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShopState, applyAction, stepShop } from '../../src/sim/shop.js';
import {
  wordOfMouth, playChance, awardPieces, racePlaces, prizeTiers, pachinkoTiers, bossesNeedingChoice,
} from '../../src/sim/machines.js';
import { cancelOrdersOf } from '../../src/sim/orders.js';
import { runDay } from '../../src/sim/bots.js';
import { levelConfig } from '../../src/data/levels.js';
import * as B from '../../src/data/balance.js';
import { sampleConfig } from './helpers.js';

const MENU = ['tamago', 'kappa', 'ika', 'sake', 'ebi', 'maguro', 'anago', 'ikura', 'uni'];

/** 一間有 2 台小鋼珠和 1 條賽道的店。 */
function machineConfig(over = {}) {
  return sampleConfig({
    shop: {
      w: 12, h: 9, floor: 'wood', door: { gx: 3 },
      furniture: [
        { type: 'chefStation', x: 2, y: 1 },
        { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 },
        { type: 'pachinko', x: 6, y: 0 },
        { type: 'pachinko', x: 7, y: 0 },
        { type: 'raceTrack', x: 7, y: 4 },
      ],
    },
    menu: MENU,
    money: 200000,
    mix: { normal: 3, pachinkoFan: 3, raceFan: 3 },
    ...over,
  });
}

function openDay(over = {}) {
  const s = createShopState(machineConfig(over));
  for (const id of Object.keys(s.menu)) applyAction(s, { type: 'buy', item: id, grade: 'premium', qty: 30 });
  applyAction(s, { type: 'open' });
  return s;
}

function runUntil(s, cond, max = 8 * 600) {
  for (let i = 0; i < max && s.phase === 'open'; i++) {
    stepShop(s);
    if (cond(s)) return true;
  }
  return false;
}

const machines = (s, type) => s.shop.furniture.filter((f) => f.type === type);

test('機台：愛好者會來玩，入場費算進營業額，獎品排進師傅的佇列', () => {
  const s = openDay();
  let sawPrize = false;
  let sawPlay = false;
  for (let i = 0; i < 8 * 300 && s.phase === 'open'; i++) {
    stepShop(s);
    if (s.orders.some((o) => o.prize)) sawPrize = true;
    if (s.customers.some((c) => c.st === 'play')) sawPlay = true;
  }
  while (s.phase === 'open') stepShop(s);
  const pk = machines(s, 'pachinko');
  const tr = machines(s, 'raceTrack')[0];
  assert.ok(sawPlay, '有顧客在玩機台');
  assert.ok(sawPrize, '有獎品訂單');
  assert.ok(pk.some((f) => f.income > 0), '小鋼珠有收入');
  assert.ok(tr.income > 0 && tr.races > 0, `賽道有比賽（${tr.races} 場）`);
  const income = pk.reduce((a, f) => a + f.income, 0) + tr.income;
  assert.equal(s.day.fees, income, '入場費全部算進營業額');
  assert.ok(s.day.prizePieces > 0, '有送出獎品壽司');
  assert.ok(s.day.prizeCost > 0, '獎品的食材成本有記錄');
  // 獎品不算菜單的「今日賣出」
  const sold = Object.values(s.day.sold).reduce((a, b) => a + b, 0);
  assert.equal(sold + s.day.prizePieces, s.day.pieces);
});

test('機台：同種子跑兩次結果相同，中途存檔再讀也相同', () => {
  const a = runDay(levelConfig(4, 11), 'naive');
  const b = runDay(levelConfig(4, 11), 'naive');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = createShopState(levelConfig(4, 11));
  applyAction(c, { type: 'buySuggested' });
  applyAction(c, { type: 'open' });
  for (let i = 0; i < 8 * 250; i++) stepShop(c);
  const d = JSON.parse(JSON.stringify(c));
  while (c.phase === 'open') stepShop(c);
  while (d.phase === 'open') stepShop(d);
  assert.equal(JSON.stringify(c), JSON.stringify(d));
});

test('口碑與玩的機率（計劃書 8.5）', () => {
  const s = createShopState(machineConfig());
  const f = machines(s, 'pachinko')[0];
  assert.equal(wordOfMouth(f), 0.6);
  // 入場費 ¥500：clamp(1.2 − 0.5) × (0.5 + 0.6) = 0.77
  assert.ok(Math.abs(playChance(f) - 0.77) < 1e-9);
  f.wom = new Array(20).fill(2);
  assert.equal(wordOfMouth(f), 1.2, '口碑上限 1.2');
  f.fee = 1000;
  f.wom = [0];
  assert.ok(Math.abs(playChance(f) - 0.2 * 0.5) < 1e-9);
  // 賽道的除數是 2000
  const tr = machines(s, 'raceTrack')[0];
  assert.ok(Math.abs(playChance(tr) - (1.2 - 800 / 2000) * 1.1) < 1e-9);
});

test('操作：釘子、入場費、壽司車等級有範圍', () => {
  const s = createShopState(machineConfig());
  const f = machines(s, 'pachinko')[0];
  const tr = machines(s, 'raceTrack')[0];
  assert.equal(applyAction(s, { type: 'setNail', id: f.id, nail: 5 }).ok, true);
  assert.equal(f.nail, 5);
  assert.equal(applyAction(s, { type: 'setNail', id: f.id, nail: 6 }).ok, false);
  assert.equal(applyAction(s, { type: 'setNail', id: tr.id, nail: 2 }).ok, false);
  assert.equal(applyAction(s, { type: 'setFee', id: f.id, fee: 300 }).ok, true);
  assert.equal(applyAction(s, { type: 'setFee', id: f.id, fee: 200 }).ok, false);
  assert.equal(applyAction(s, { type: 'setFee', id: f.id, fee: 1100 }).ok, false);
  assert.equal(applyAction(s, { type: 'setFee', id: tr.id, fee: 1500 }).ok, true);
  assert.equal(applyAction(s, { type: 'setFee', id: tr.id, fee: 400 }).ok, false);
  assert.equal(applyAction(s, { type: 'setCarLevel', id: tr.id, level: 5 }).ok, true);
  assert.equal(tr.level, 5);
  assert.equal(applyAction(s, { type: 'setCarLevel', id: tr.id, level: 0 }).ok, false);
});

test('獎品：沒貨就降一級，全部沒貨發一張招待券，評價下降', () => {
  const s = createShopState(machineConfig());
  s.stock.uni.premium = 0;
  s.stock.anago.premium = 0;
  s.stock.ikura.premium = 0;
  s.stock.maguro.premium = 3;
  const c = { id: 999, prizePending: 0 };
  assert.equal(awardPieces(s, c, null, [4, 3]), 0);
  assert.deepEqual(s.orders.map((o) => o.item), ['maguro', 'maguro'], 'T4、T3 沒貨，降到 T2');
  assert.equal(s.stock.maguro.premium, 1);
  for (const id of Object.keys(s.stock)) s.stock[id].premium = 0;
  const rep = s.reputation;
  assert.equal(awardPieces(s, c, null, [4, 4, 1]), 3);
  assert.equal(s.day.coupons, 1);
  assert.equal(s.reputation, rep + B.REP_COUPON);
  // 獎品打包帶走：取消時食材不退回
  cancelOrdersOf(s, 999);
  assert.equal(s.stock.maguro.premium, 0);
});

test('獎品換算：套餐、小鋼珠結果', () => {
  assert.deepEqual(prizeTiers('set_tokujo'), [4, 4, 3, 3, 3, 2, 2, 2]);
  assert.deepEqual(prizeTiers('tier1'), [1]);
  assert.deepEqual(pachinkoTiers({ A: 1, B: 0, C: 2, D: 1, S: 3, J: 0 }), [4, 2, 2, 1]);
  assert.equal(pachinkoTiers({ A: 0, B: 0, C: 0, D: 0, S: 0, J: 1 }, 2).length, 16);
});

test('賽車名次：第 1 到 3 名不重複，修馬哈幾乎都是第 1 名', () => {
  const s = createShopState(machineConfig());
  const f = machines(s, 'raceTrack')[0];
  let shumahaWins = 0;
  for (let i = 0; i < 200; i++) {
    const es = [{ id: 1, skill: 0.99 }, { id: 2, skill: 0.8 }, { id: 3, skill: 0.75 }, { id: 4, skill: 0.3 }];
    const p = racePlaces(s, f, es);
    const top = Object.values(p).filter((x) => x <= 3);
    assert.equal(new Set(top).size, top.length, '前三名不重複');
    if (p[1] === 1) shumahaWins++;
  }
  assert.ok(shumahaWins > 150, `修馬哈拿第 1 名 ${shumahaWins} / 200 次`);
});

/** 跑到強敵坐上機台，回傳那位強敵。 */
function bossDay(kind, over = {}) {
  const s = openDay({ baseArrival: 0, events: [{ kind, at: 11 * 60 + 5 }], ...over });
  assert.ok(runUntil(s, (x) => bossesNeedingChoice(x).length > 0), `${kind} 有坐上機台`);
  const c = bossesNeedingChoice(s)[0];
  assert.equal(c.boss, kind);
  assert.ok(s.feed.some((e) => e.key === (kind === 'pro' ? 'feed.proComing' : 'feed.shumahaComing')));
  return { s, c, f: s.shop.furniture.find((x) => x.id === c.furn) };
}

test('職業玩家：放任時連續玩 12 次，挑最鬆的台', () => {
  const pk = (s) => machines(s, 'pachinko');
  const { s, c, f } = bossDay('pro', { stock: undefined });
  pk(s)[0].nail = 2;
  assert.ok(f.nail >= pk(s)[0].nail);
  assert.equal(applyAction(s, { type: 'bossChoice', id: c.id, choice: 'allow' }).ok, true);
  assert.equal(applyAction(s, { type: 'bossChoice', id: c.id, choice: 'counter' }).ok, false, '對策只能選一次');
  runUntil(s, () => c.st !== 'play');
  assert.equal(c.played, B.PRO.PLAYS);
  assert.equal(f.income, B.PRO.PLAYS * f.fee);
});

test('職業玩家：調緊釘子，那一台變成設定 1，再玩 2 次就走，口碑下降', () => {
  const { s, c, f } = bossDay('pro');
  const before = wordOfMouth(f);
  assert.equal(applyAction(s, { type: 'bossChoice', id: c.id, choice: 'counter' }).ok, true);
  assert.equal(f.nail, 1);
  assert.ok(wordOfMouth(f) < before);
  runUntil(s, () => c.st !== 'play');
  assert.equal(c.played, B.PRO.TIGHTEN_PLAYS);
});

test('職業玩家：親自應戰贏了，付 ¥5,000 離開，評價 +2', () => {
  const { s, c } = bossDay('pro');
  const r = applyAction(s, { type: 'bossChallenge', id: c.id });
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'pachinko');
  assert.ok(r.target >= 0 && r.nail >= 1);
  const rep = s.reputation;
  const rev = s.day.revenue;
  assert.equal(applyAction(s, { type: 'bossChallengeResult', id: c.id, win: true }).ok, true);
  // 營業額多了 ¥5,000，加上他離開時結帳的入場費
  assert.equal(s.day.revenue - rev, B.PRO.WIN_PAY + c.fees);
  assert.equal(s.day.bonus, B.PRO.WIN_PAY);
  assert.ok(Math.abs(s.reputation - (rep + B.PRO.WIN_REP)) < 1e-9);
  assert.equal(c.st, 'leave');
  assert.equal(applyAction(s, { type: 'bossChallengeResult', id: c.id, win: true }).ok, false, '結果只能回報一次');
});

test('職業玩家：親自應戰輸了，拿走雙倍獎品', () => {
  const { s, c } = bossDay('pro');
  applyAction(s, { type: 'bossChallenge', id: c.id });
  c.challenge.counts = { A: 1, B: 1, C: 0, D: 0, S: 2, J: 0 };
  assert.equal(applyAction(s, { type: 'bossChallengeResult', id: c.id, win: false }).ok, true);
  assert.equal(c.prizePending, 4, '雙倍：A、B 各兩貫');
  assert.equal(c.st, 'prize');
});

test('修馬哈：連續跑 8 場，幾乎都拿第 1 名', () => {
  const { s, c, f } = bossDay('shumaha');
  applyAction(s, { type: 'bossChoice', id: c.id, choice: 'allow' });
  const firsts = [];
  runUntil(s, () => {
    if (c.lastPlace && firsts.length < c.played) firsts.push(c.lastPlace);
    return c.st !== 'play';
  });
  assert.equal(c.played, B.SHUMAHA.RACES);
  assert.ok(firsts.filter((p) => p === 1).length >= 6, `名次 ${firsts.join(',')}`);
  assert.ok(f.payout > 0);
});

test('修馬哈：調高壽司車等級，賽道變成等級 5，再跑 2 場就走', () => {
  const { s, c, f } = bossDay('shumaha');
  applyAction(s, { type: 'bossChoice', id: c.id, choice: 'counter' });
  assert.equal(f.level, 5);
  runUntil(s, () => c.st !== 'play');
  assert.equal(c.played, B.SHUMAHA.RAISE_RACES);
});

test('修馬哈：親自應戰，贏了付 ¥10,000、評價 +3；輸了拿走兩份特上拼盤', () => {
  const a = bossDay('shumaha');
  const r = applyAction(a.s, { type: 'bossChallenge', id: a.c.id });
  assert.equal(r.kind, 'race');
  assert.ok(r.track && r.level >= 1);
  const rep = a.s.reputation;
  applyAction(a.s, { type: 'bossChallengeResult', id: a.c.id, win: true });
  assert.equal(a.s.day.bonus, B.SHUMAHA.WIN_PAY);
  assert.ok(Math.abs(a.s.reputation - (rep + B.SHUMAHA.WIN_REP)) < 1e-9);
  assert.equal(a.c.st, 'leave');
  // 他不在了，賽道下一場不會有他
  runUntil(a.s, () => !a.s.shop.furniture.find((x) => x.id === a.f.id).race);
  const b = bossDay('shumaha');
  applyAction(b.s, { type: 'bossChallenge', id: b.c.id });
  applyAction(b.s, { type: 'bossChallengeResult', id: b.c.id, win: false });
  assert.equal(b.c.prizePending, 16, '兩份特上拼盤 = 16 貫');
  assert.equal(b.c.st, 'prize');
});
