// 無限模式的樓層：加蓋、樓梯、包廂樓層、送餐軌道、打工仔、訓練。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../../src/data/balance.js';
import { FURNITURE } from '../../src/data/furniture.js';
import { STAFF, BAITO_COUNT } from '../../src/data/characters.js';
import {
  createEndless, applyEndless, endDay, rentOf, floorOffer, boothSpots, arrivalOf, floorKind,
} from '../../src/sim/endless.js';
import { getLayout, pathBetween, floorCount, floorOfX, FLOOR_STRIDE, advance, insideShop } from '../../src/sim/pathfind.js';
import { stepShop } from '../../src/sim/shop.js';
import { effSpeed, effSkill, walkSpeed } from '../../src/sim/staff.js';
import { runEndlessDay } from '../../src/sim/bots.js';

const S = FLOOR_STRIDE;
const act = (E, a) => applyEndless(E, a);
function rich(seed = 1) {
  const E = createEndless(seed);
  E.s.money = 5000000000;
  E.s.reputation = 95;
  return E;
}
const count = (E, type, k) => E.s.shop.furniture.filter((f) => f.type === type && (k === undefined || floorOfX(f.x) === k)).length;
/** 每個使用位置都走得到。 */
function allReachable(E) {
  const layout = getLayout(E.s.shop);
  for (const f of E.s.shop.furniture) FURNITURE[f.type].slots.forEach((_, i) => assert.ok(layout.access[`${f.id}:${i}`], `${f.type}@${f.x},${f.y}#${i} 走不到`));
}

test('加蓋：要評價和錢，越高越貴，樓層沒有上限', () => {
  const E = createEndless(1);
  assert.equal(floorCount(E.s.shop), 1);
  assert.deepEqual(floorOffer(E), { floor: 2, price: B.FLOORS.PRICE, rep: 50 });
  assert.equal(floorOffer(E, 'vip').price, B.FLOORS.PRICE * B.FLOORS.VIP_MULT);
  assert.equal(act(E, { type: 'addFloor' }).reason, 'rep');
  E.s.reputation = 60;
  assert.equal(act(E, { type: 'addFloor' }).reason, 'money');
  E.s.money = B.FLOORS.PRICE + 600000;
  const rent = rentOf(E.s.shop);
  const arr = arrivalOf(E);
  assert.equal(act(E, { type: 'addFloor' }).ok, true);
  assert.equal(E.s.money, 600000);
  assert.equal(floorCount(E.s.shop), 2);
  assert.equal(count(E, 'stairs'), 2, '每層樓各一座樓梯');
  assert.equal(rentOf(E.s.shop), rent + 64 * 50, '租金照總面積算');
  assert.ok(Math.abs(arrivalOf(E) - arr * (1 + B.FLOORS.ARRIVAL_BONUS)) < 1e-9, '每多一層來客變多');
  assert.equal(E.s.baseArrival, arrivalOf(E));
  assert.equal(floorOffer(E).price, Math.round(B.FLOORS.PRICE * B.FLOORS.PRICE_GROWTH / 10000) * 10000);
  assert.equal(floorOffer(E).rep, 55);
  const R = rich();
  let last = 0;
  for (let i = 0; i < 9; i++) {
    const o = floorOffer(R);
    assert.ok(o.price > last);
    last = o.price;
    assert.equal(act(R, { type: 'addFloor', kind: i % 2 ? 'vip' : 'normal' }).ok, true);
  }
  assert.equal(floorCount(R.s.shop), 10);
  assert.equal(floorOffer(R).rep, B.FLOORS.REP_MAX);
  allReachable(R);
  assert.ok(runEndlessDay(R), '10 層樓的店可以跑完一天');
});

test('樓梯：左前角要留空；路徑會經過樓梯；角色走到樓梯直接換到另一層', () => {
  const E = rich();
  const blocker = act(E, { type: 'place', furniture: 'plant', x: 0, y: 7 });
  assert.equal(blocker.ok, true);
  assert.equal(act(E, { type: 'addFloor' }).reason, 'stairBlocked');
  act(E, { type: 'sell', id: blocker.id });
  assert.equal(act(E, { type: 'addFloor' }).ok, true);
  // 樓梯不能賣、不能移動，上面也不能擺東西
  const st = E.s.shop.furniture.find((f) => f.type === 'stairs');
  assert.equal(act(E, { type: 'sell', id: st.id }).reason, 'fixed');
  assert.equal(act(E, { type: 'move', id: st.id, x: 5, y: 5 }).reason, 'fixed');
  assert.equal(act(E, { type: 'place', furniture: 'plant', x: 1, y: 7 }).reason, 'overlap');
  // 兩層樓中間的空格不是店面
  assert.equal(insideShop(E.s.shop, 10, 3), false);
  assert.equal(insideShop(E.s.shop, S + 7, 3), true);
  assert.equal(act(E, { type: 'place', furniture: 'plant', x: 10, y: 3 }).reason, 'outside');
  // 二樓擺座位：從入口走得到
  const seat = act(E, { type: 'place', furniture: 'counterSeat', x: S + 4, y: 3 });
  assert.equal(seat.ok, true);
  const layout = getLayout(E.s.shop);
  const access = layout.access[`${seat.id}:0`];
  assert.ok(access && floorOfX(access[0]) === 1);
  const path = pathBetween(layout, layout.door, access);
  assert.ok(path.some(([x]) => x < S) && path.some(([x]) => x >= S));
  const jump = path.findIndex(([x], i) => i > 0 && Math.abs(x - path[i - 1][0]) > 2);
  assert.deepEqual(path[jump - 1], [0.5, 7.5], '從一樓的樓梯上去');
  assert.deepEqual(path[jump], [S + 1.5, 7.5], '到二樓的樓梯口');
  const a = { gx: 0.5, gy: 7.5, path: [[S + 1.5, 7.5], [S + 1.5, 6.5]], fx: 0, fy: 0 };
  advance(a, 0.15);
  assert.equal(Math.floor(a.gx), S + 1, '一步就換到二樓，不會在中間滑過去');
  assert.ok(a.gy < 7.5);
});

test('送餐軌道：座位在別層樓時，做好的壽司過 2 分鐘直接送到', () => {
  const E = rich();
  act(E, { type: 'addFloor' });
  // 一樓的座位全部賣掉，改擺在二樓
  for (const f of E.s.shop.furniture.filter((x) => x.type === 'counterSeat')) act(E, { type: 'sell', id: f.id });
  for (let i = 0; i < 6; i++) assert.equal(act(E, { type: 'place', furniture: 'counterSeat', x: S + 2 + i, y: 3 }).ok, true);
  act(E, { type: 'buySuggested' });
  act(E, { type: 'open' });
  let lifted = 0;
  let upstairs = 0;
  for (let i = 0; i < 8 * 240; i++) {
    stepShop(E.s);
    for (const o of E.s.orders) if (o.st === 'lift' && !o.seen) { o.seen = true; lifted++; assert.ok(Math.abs(o.liftAt - E.s.tick - B.LIFT_MIN * 8) <= 1); }
    upstairs = Math.max(upstairs, E.s.customers.filter((c) => c.st === 'eat' && c.gx > S).length);
  }
  assert.ok(lifted > 10, `走送餐軌道的訂單 ${lifted} 張`);
  assert.ok(upstairs > 0, '有客人在二樓吃');
  assert.ok(E.s.day.pieces >= lifted - 6);
  assert.ok(E.s.day.sales > 0);
  assert.equal(E.s.staff[0].gx < S, true, '師傅沒有離開一樓');
});

test('包廂樓層：整層排滿包廂、擺設固定、包廂客付包廂價', () => {
  const E = rich();
  assert.equal(act(E, { type: 'addFloor', kind: 'vip' }).ok, true);
  assert.equal(floorKind(E.s.shop, 1), 'vip');
  const spots = boothSpots(E.s.shop);
  assert.equal(spots.length, 4, '8×8 的樓層有 4 間包廂');
  assert.equal(count(E, 'booth', 1), 4);
  allReachable(E);
  assert.equal(act(E, { type: 'place', furniture: 'plant', x: S, y: 0 }).reason, 'vipFloor');
  const booth = E.s.shop.furniture.find((f) => f.type === 'booth');
  assert.equal(act(E, { type: 'sell', id: booth.id }).reason, 'fixed');
  // 只讓包廂客來
  act(E, { type: 'buySuggested' });
  for (const id of Object.keys(E.s.menu)) act(E, { type: 'buy', item: id, grade: 'premium', qty: 20 });
  E.s.mix = { vip: 1 };
  E.s.events = [];
  act(E, { type: 'open' });
  let seated = 0;
  let price = 0;
  for (let i = 0; i < 8 * 300; i++) {
    stepShop(E.s);
    for (const c of E.s.customers) {
      if (c.type !== 'vip') continue;
      if (c.furn) { seated++; assert.equal(E.s.shop.furniture.find((f) => f.id === c.furn).type, 'booth'); }
    }
    for (const o of E.s.orders) if (o.price) { price = o.price; assert.equal(o.price, Math.round(E.s.menu[o.item].price * B.VIP.PRICE_MULT / 10) * 10); }
  }
  assert.ok(seated > 0 && price > 0);
  assert.ok(E.s.day.sales > 5000, `包廂的營業額 ${E.s.day.sales}`);
  assert.ok(!E.s.customers.some((c) => c.thought && c.thought.key === 'pricey'), '包廂客不嫌包廂價貴');
  // 一樓沒有包廂客坐
  assert.equal(E.s.shop.furniture.filter((f) => f.type === 'counterSeat').every((f) => !f.occ[0]), true);
});

test('擴建：每層樓一起變大，樓梯跟著前緣走，包廂重新排滿', () => {
  const E = rich();
  act(E, { type: 'addFloor', kind: 'vip' });
  act(E, { type: 'addFloor' });
  const seat = act(E, { type: 'place', furniture: 'counterSeat', x: 2 * S + 5, y: 5 });
  assert.equal(act(E, { type: 'expand' }).ok, true);
  assert.equal(E.s.shop.h, 10);
  for (const f of E.s.shop.furniture.filter((x) => x.type === 'stairs')) assert.equal(f.y, 9);
  assert.equal(count(E, 'stairs'), 3);
  assert.equal(count(E, 'booth', 1), boothSpots(E.s.shop).length);
  assert.ok(count(E, 'booth', 1) > 4);
  const moved = E.s.shop.furniture.find((f) => f.id === seat.id);
  assert.ok(moved.x === 2 * S + 5 && moved.y === 5, '自己擺的家具位置不變');
  allReachable(E);
});

test('打工仔和訓練：可以雇很多位，花靈感點升級', () => {
  assert.equal(BAITO_COUNT, 12);
  const E = createEndless(1);
  for (let i = 1; i <= 12; i++) assert.equal(act(E, { type: 'hire', staff: `baito${i}` }).ok, true);
  assert.equal(E.s.staff.length, 13);
  const st = E.s.staff.find((x) => x.id === 'baito1');
  assert.equal(effSpeed(E.s, st), 5);
  assert.equal(act(E, { type: 'train', staff: 'baito1' }).reason, 'insp');
  E.insp = 100;
  const walk = walkSpeed(st);
  for (let lv = 1; lv <= 5; lv++) assert.equal(act(E, { type: 'train', staff: 'baito1' }).lv, lv);
  assert.equal(E.insp, 100 - 3 - 5 - 8 - 12 - 16);
  assert.equal(act(E, { type: 'train', staff: 'baito1' }).reason, 'maxLevel');
  assert.equal(effSpeed(E.s, st), 10);
  assert.equal(effSkill(E.s, st), 7);
  assert.ok(Math.abs(walkSpeed(st) - walk * 1.5) < 1e-9);
  assert.equal(STAFF.baito3.wage, 8000);
  // 阿兩也可以練
  assert.equal(act(E, { type: 'train', staff: 'ryo' }).ok, true);
});

test('樓層存檔：存成 JSON 再讀回來，跑一天結果相同；舊存檔（沒有樓層資料）照常能玩', () => {
  const a = rich(5);
  act(a, { type: 'addFloor', kind: 'vip' });
  act(a, { type: 'addFloor' });
  act(a, { type: 'hire', staff: 'baito1' });
  const b = JSON.parse(JSON.stringify(a));
  runEndlessDay(a);
  runEndlessDay(b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const old = createEndless(2);
  delete old.s.shop.floors;
  assert.equal(floorCount(old.s.shop), 1);
  runEndlessDay(old);
  old.s.money = 9000000; old.s.reputation = 90;
  assert.equal(act(old, { type: 'addFloor' }).ok, true);
  assert.equal(floorCount(old.s.shop), 2);
  assert.ok(endDay);
});
