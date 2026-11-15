import test from 'node:test';
import assert from 'node:assert/strict';
import { createShopState, applyAction, stepShop } from '../../src/sim/shop.js';
import {
  buy, stockCap, totalStock, unitCost, suggestPurchases, settleCustomer, repFactor, arrivalLambda, sellPrice, customerRef, attraction,
} from '../../src/sim/economy.js';
import { createCustomer, chooseOrder } from '../../src/sim/customers.js';
import { createOrder, servePiece, decideDelivery, cancelOrdersOf, findOrder } from '../../src/sim/orders.js';
import { findStaff, stepStaff } from '../../src/sim/staff.js';
import { sampleConfig } from './helpers.js';
import * as B from '../../src/data/balance.js';

/** 讓一位顧客直接坐到指定家具的位置上。 */
function seat(state, c, furnIndex, slot = 0) {
  const f = state.shop.furniture[furnIndex];
  f.occ[slot] = c.id;
  c.furn = f.id;
  c.slot = slot;
  c.st = 'wait';
  state.customers.push(c);
  return c;
}

test('economy：進貨扣錢、加庫存、受資金和庫存上限限制', () => {
  const s = createShopState(sampleConfig({ money: 10000 }));
  assert.equal(stockCap(s), 200);
  const r = buy(s, 'maguro', 'premium', 20);
  assert.deepEqual(r, { ok: true, cost: 2200, qty: 20 });
  assert.equal(s.money, 7800);
  assert.equal(s.stock.maguro.premium, 20);
  assert.equal(s.day.purchases, 2200);
  assert.equal(buy(s, 'maguro', 'premium', 100).reason, 'money');
  assert.equal(buy(s, 'kappa', 'premium', 181).reason, 'full');
  assert.equal(buy(s, 'otoro', 'premium', 1).reason, 'locked');
  assert.equal(buy(s, 'kappa', 'cheap', 1).reason, 'locked'); // 便宜食材要關卡開放才能買
  assert.equal(buy(s, 'kappa', 'premium', 0).reason, 'qty');
  // 冰箱增加庫存上限
  const s2 = createShopState(sampleConfig({ shop: { w: 8, h: 8, door: { gx: 3 }, furniture: [{ type: 'chefStation', x: 2, y: 1 }, { type: 'fridge', x: 0, y: 0 }] } }));
  assert.equal(stockCap(s2), 350);
});

test('economy：營業中是緊急補貨，價格加 50%，20 遊戲分鐘後到貨', () => {
  const s = createShopState(sampleConfig({ money: 100000, baseArrival: 0 }));
  applyAction(s, { type: 'open' });
  const r = buy(s, 'sake', 'premium', 10);
  assert.equal(r.cost, 1200); // 80 × 10 × 1.5
  assert.equal(s.stock.sake.premium, 0);
  assert.equal(totalStock(s), 10); // 在路上的也佔庫存空間
  for (let i = 0; i < 20 * 8; i++) stepShop(s);
  assert.equal(s.stock.sake.premium, 0);
  stepShop(s);
  assert.equal(s.stock.sake.premium, 10);
});

test('economy：建議進貨量不超過資金和庫存上限', () => {
  const s = createShopState(sampleConfig({ money: 3000 }));
  const list = suggestPurchases(s);
  assert.ok(list.length > 0);
  const cost = list.reduce((a, e) => a + e.qty * unitCost(s, e.item, e.grade), 0);
  const qty = list.reduce((a, e) => a + e.qty, 0);
  assert.ok(cost <= 3000);
  assert.ok(qty <= 200);
  const r = applyAction(s, { type: 'buySuggested' });
  assert.equal(r.ok, true);
  assert.ok(s.money >= 0);
});

test('economy：來客公式', () => {
  assert.equal(repFactor(0), 0.4);
  assert.ok(Math.abs(repFactor(30) - 0.9) < 1e-9);
  assert.equal(repFactor(100), 2.0);
  const s = createShopState(sampleConfig({ baseArrival: 0.2, reputation: 36 }));
  // λ = baseArrival × hourCurve × repFactor × (1 + 吸引力)
  assert.ok(Math.abs(arrivalLambda(s, 12) - 0.2 * 1.4 * 1.0 * 1) < 1e-9);
  assert.equal(arrivalLambda(s, 22), 0);
  const s2 = createShopState(sampleConfig({ shop: { w: 8, h: 8, door: { gx: 3 }, furniture: [{ type: 'chefStation', x: 2, y: 1 }, { type: 'lantern', x: 0, y: 0 }, { type: 'fishTank', x: 5, y: 0 }] }, staff: [{ id: 'ryo', role: 'chef' }, { id: 'reiko', role: 'floor' }] }));
  assert.ok(Math.abs(attraction(s2) - 0.30) < 1e-9); // 燈籠 0.05 + 魚缸 0.10 + 看板娘 0.15
});

test('economy：結帳、小費、評價、真工夫量表', () => {
  const s = createShopState(sampleConfig({ reputation: 50 }));
  const c = createCustomer(s, 'normal');
  c.bill = 2000; c.eaten = 5; c.sat = 90;
  settleCustomer(s, c, false);
  assert.equal(s.day.sales, 2000);
  assert.equal(s.day.tips, 100); // 滿意度 ≥ 85：小費 5%
  assert.equal(s.day.revenue, 2100);
  assert.equal(s.money, 50000 + 2100);
  assert.ok(Math.abs(s.reputation - (50 + (90 - 60) / 200)) < 1e-9);
  assert.equal(s.kufu, 5);
  assert.equal(s.day.served, 1);
  // 不會重複結帳
  settleCustomer(s, c, false);
  assert.equal(s.day.revenue, 2100);
  // 不滿意：評價下降，沒有小費
  const c2 = createCustomer(s, 'normal');
  c2.bill = 1000; c2.eaten = 3; c2.sat = 20;
  const rep = s.reputation;
  settleCustomer(s, c2, false);
  assert.equal(s.day.tips, 100);
  assert.ok(Math.abs(s.reputation - (rep - 0.2)) < 1e-9);
  // 生氣離開：付已經吃的，評價固定下降
  const c3 = createCustomer(s, 'normal');
  c3.bill = 300; c3.eaten = 1; c3.furn = s.shop.furniture[1].id;
  const rep3 = s.reputation;
  settleCustomer(s, c3, true);
  assert.equal(s.day.sales, 3300);
  assert.ok(Math.abs(s.reputation - (rep3 + B.REP_ANGRY_LEAVE)) < 1e-9);
  assert.equal(s.day.angry, 1);
  // 排隊排到生氣離開：評價下降比較少
  const c4 = createCustomer(s, 'normal');
  const rep4 = s.reputation;
  settleCustomer(s, c4, true);
  assert.ok(Math.abs(s.reputation - (rep4 - 0.2)) < 1e-9);
});

test('economy：點餐扣庫存，取消時退回', () => {
  const s = createShopState(sampleConfig());
  buy(s, 'ika', 'premium', 5);
  const c = seat(s, createCustomer(s, 'normal'), 1);
  const o = createOrder(s, c, 'ika', { price: 200 });
  assert.equal(s.stock.ika.premium, 4);
  cancelOrdersOf(s, c.id);
  assert.equal(s.stock.ika.premium, 5);
  assert.equal(findOrder(s, o.id), null);
});

test('economy：顧客點餐看效用；太貴就不點；沒庫存會不高興', () => {
  const s = createShopState(sampleConfig());
  for (const id of Object.keys(s.menu)) buy(s, id, 'premium', 5);
  const c = createCustomer(s, 'normal');
  c.budget = 5000;
  const pick = chooseOrder(s, c);
  assert.ok(pick && s.menu[pick.item]);
  // 全部漲到參考售價的 3 倍：不點
  for (const id of Object.keys(s.menu)) applyAction(s, { type: 'setMenu', item: id, price: s.menu[id].price * 3 });
  assert.equal(chooseOrder(s, c), null);
  // 預算不夠
  for (const id of Object.keys(s.menu)) applyAction(s, { type: 'setMenu', item: id, price: customerRef(id, 'premium') });
  c.budget = 50;
  assert.equal(chooseOrder(s, c), null);
  // 最想吃的沒庫存：滿意度 −5
  c.budget = 5000;
  for (const id of Object.keys(s.menu)) s.stock[id].premium = 0;
  s.stock.tamago.premium = 3;
  c.prefs.tamago = 0.7; c.prefs.maguro = 5;
  const sat = c.sat;
  const p2 = chooseOrder(s, c);
  assert.equal(c.sat, sat - 5);
  assert.ok(p2 === null || p2.item === 'tamago');
});

test('orders：送餐三條規則', () => {
  // 板前檯在 (2,1)。吧台座 (2,2) 距離 1。桌位在 (5,4) 距離 5。
  const mk = (staff) => {
    const s = createShopState(sampleConfig({ staff, baseArrival: 0 }));
    for (const id of Object.keys(s.menu)) buy(s, id, 'premium', 5);
    applyAction(s, { type: 'open' });
    return s;
  };
  // 規則 1：距離 ≤ 2 直接遞，不花時間
  let s = mk([{ id: 'ryo', role: 'chef' }, { id: 'honda', role: 'floor' }]);
  let ryo = findStaff(s, 'ryo');
  let near = seat(s, createCustomer(s, 'normal'), 1);
  let o = createOrder(s, near, 'ika', { price: 200 });
  assert.equal(decideDelivery(s, o, ryo).how, 'hand');
  let n = 0;
  while (near.st === 'wait' && n++ < 100) stepStaff(s);
  assert.equal(near.st, 'eat');
  assert.ok(n <= Math.ceil(1.2 * 10 / 14 * 8) + 1, `做好立刻拿到（${n} tick）`);
  assert.equal(ryo.path.length, 0);
  // 規則 2：距離 > 2，由外場員工送
  let far = seat(s, createCustomer(s, 'normal'), 5, 0);
  o = createOrder(s, far, 'ika', { price: 200 });
  const d = decideDelivery(s, o, ryo);
  assert.equal(d.how, 'floor');
  assert.equal(d.staff.id, 'honda');
  n = 0;
  let ryoMoved = false;
  while (far.st === 'wait' && n++ < 400) { stepStaff(s); if (ryo.path.length) ryoMoved = true; }
  assert.equal(far.st, 'eat');
  assert.equal(ryoMoved, false, '師傅沒有離開板前檯');
  assert.ok(n > 15, '外場員工走過去要花時間');
  // 規則 3：沒有外場員工，師傅自己送，離開期間不能捏壽司
  s = mk([{ id: 'ryo', role: 'chef' }]);
  ryo = findStaff(s, 'ryo');
  far = seat(s, createCustomer(s, 'normal'), 5, 0);
  near = seat(s, createCustomer(s, 'normal'), 1);
  o = createOrder(s, far, 'ika', { price: 200 });
  const o2 = createOrder(s, near, 'ika', { price: 200 });
  assert.equal(decideDelivery(s, o, ryo).how, 'chef');
  n = 0;
  let nearServedWhileAway = false;
  let wasAway = false;
  while ((far.st === 'wait' || near.st === 'wait' || ryo.path.length) && n++ < 1000) {
    stepStaff(s);
    if (ryo.path.length) {
      wasAway = true;
      if (findOrder(s, o2.id) && findOrder(s, o2.id).st === 'making') nearServedWhileAway = true;
    }
  }
  assert.equal(wasAway, true);
  assert.equal(nearServedWhileAway, false, '師傅不在的時候沒有在捏');
  assert.equal(far.st, 'eat');
  assert.equal(near.st, 'eat');
  assert.ok(Math.abs(ryo.gx - 3.0) < 1e-9 && Math.abs(ryo.gy - 0.58) < 1e-9, '師傅回到板前檯');
  // 外場員工忙不過來（待送超過上限）：師傅自己送
  s = mk([{ id: 'ryo', role: 'chef' }, { id: 'honda', role: 'floor' }]);
  ryo = findStaff(s, 'ryo');
  far = seat(s, createCustomer(s, 'normal'), 5, 0);
  for (let i = 0; i < B.FLOOR_BACKLOG; i++) { const x = createOrder(s, far, 'ika', { price: 200 }); x.st = 'ready'; x.orphan = true; }
  o = createOrder(s, far, 'ika', { price: 200 });
  assert.equal(decideDelivery(s, o, ryo).how, 'chef');
});

test('orders：滿意度計算', () => {
  const s = createShopState(sampleConfig());
  for (const id of Object.keys(s.menu)) buy(s, id, 'premium', 5);
  const ryo = findStaff(s, 'ryo');
  const honda = findStaff(s, 'honda');
  // 品質 3：+2；師傅技術 8：+0.9；售價等於參考售價：不加不減
  const c = seat(s, createCustomer(s, 'normal'), 1);
  let o = createOrder(s, c, 'ika', { price: 200 });
  o.skill = 8;
  servePiece(s, c, o, ryo);
  assert.ok(Math.abs(c.sat - (70 + 2 + 0.9)) < 1e-9);
  assert.equal(c.bill, 200);
  assert.equal(c.st, 'eat');
  // 售價高 20%：−4
  let before = c.sat;
  o = createOrder(s, c, 'ika', { price: 240 });
  o.skill = 5;
  servePiece(s, c, o, ryo);
  assert.ok(Math.abs(c.sat - (before + 2 - 4)) < 1e-9);
  // 售價低 30%：+3，累計上限 +10
  before = c.sat;
  for (let i = 0; i < 5; i++) { o = createOrder(s, c, 'tamago', { price: 70 }); o.skill = 5; servePiece(s, c, o, ryo); }
  assert.ok(Math.abs(c.sat - (before + 2 * 5 + 10)) < 1e-9);
  // 技術低於 4：很醜，−2
  const c2 = seat(s, createCustomer(s, 'normal'), 2);
  o = createOrder(s, c2, 'sake', { price: 220 });
  o.skill = 2;
  servePiece(s, c2, o, honda);
  assert.ok(Math.abs(c2.sat - (70 + 2 - 2)) < 1e-9);
  assert.equal(c2.thought.key, 'ugly');
  // 觀光客由不會外語的員工服務：大約 30% 送錯
  let wrong = 0;
  for (let i = 0; i < 400; i++) {
    const t = seat(s, createCustomer(s, 'tourist'), 3);
    s.stock.ebi.premium = 5;
    o = createOrder(s, t, 'ebi', { price: 250 });
    servePiece(s, t, o, honda);
    if (t.sat < 70) wrong++;
    s.customers.pop();
  }
  assert.ok(wrong > 400 * 0.22 && wrong < 400 * 0.38, `送錯 ${wrong}/400`);
  assert.equal(sellPrice(s, 'ika'), 200);
});

test('魚目混珠：偵測機率和後果', () => {
  const cfg = sampleConfig({ features: { cheap: true, disguise: true }, reputation: 50 });
  const s = createShopState(cfg);
  assert.equal(applyAction(s, { type: 'setMenu', item: 'maguro', mode: 'cheapDisguised' }).ok, true);
  const ryo = findStaff(s, 'ryo');
  const trial = (type, n, look) => {
    let hit = 0;
    for (let i = 0; i < n; i++) {
      s.stock.maguro.cheap = 5;
      const c = seat(s, createCustomer(s, type, look ? { look } : {}), 1);
      const o = createOrder(s, c, 'maguro', { price: 300 });
      o.skill = 5;
      const exposed = s.exposedCount;
      const rep = s.reputation;
      servePiece(s, c, o, ryo);
      if (s.exposedCount > exposed) {
        hit++;
        // 後果：滿意度 −40、評價 −3、exposedCount +1
        assert.ok(Math.abs(c.sat - (70 + 0 - 40)) < 1e-9);
        assert.ok(s.reputation <= rep - 3 + 1e-9 || s.reputation === 0);
        assert.ok(['swordfish', 'fake'].includes(c.thought.key));
      } else {
        assert.ok(Math.abs(c.sat - 70) < 1e-9); // 便宜食材品質 1：不加分
      }
      assert.equal(c.bill, 300); // 照高級的價錢收
      s.customers.pop();
      s.reputation = 50;
    }
    return hit / n;
  };
  const normal = trial('normal', 3000);
  assert.ok(normal > 0.01 && normal < 0.035, `一般客 ${normal}`);
  const gourmet = trial('gourmet', 1500);
  assert.ok(gourmet > 0.35 && gourmet < 0.45, `美食家 ${gourmet}`);
  assert.equal(trial('lemon', 50, 'lemon'), 1);
  const bucho = trial('bucho', 2000, 'bucho');
  assert.ok(bucho > 0.07 && bucho < 0.13, `部長 ${bucho}`);
  // 誠實標示的便宜食材不會被「吃出來」
  applyAction(s, { type: 'setMenu', item: 'maguro', mode: 'cheapHonest' });
  const before = s.exposedCount;
  for (let i = 0; i < 300; i++) {
    s.stock.maguro.cheap = 5;
    const c = seat(s, createCustomer(s, 'gourmet'), 1);
    servePiece(s, c, createOrder(s, c, 'maguro', { price: 180 }), ryo);
    s.customers.pop();
  }
  assert.equal(s.exposedCount, before);
  assert.equal(customerRef('maguro', 'cheapHonest'), 180); // 參考售價 × 0.6
});
