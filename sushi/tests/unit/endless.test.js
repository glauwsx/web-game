// 單元測試 15：無限模式。擺放規則、擴建、租金、破產流程、任務完成判定，還有 60 天自動玩家測試。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../../src/data/balance.js';
import { QUESTS, RESEARCH, RANDOM_EVENTS } from '../../src/data/events.js';
import { FURNITURE } from '../../src/data/furniture.js';
import {
  createEndless, applyEndless, endDay, calendar, rentOf, activeQuests, questValue, buildable, researchStatus,
  hireStatus, validEndless, tracksUnlocked, boardsUnlocked,
} from '../../src/sim/endless.js';
import { runEndlessDay, botStep } from '../../src/sim/bots.js';
import { stepShop } from '../../src/sim/shop.js';
import { hasString } from '../../src/data/strings.js';

const N = B.ENDLESS;
const act = (E, a) => applyEndless(E, a);
/** 不營業，直接打烊（測結算用）。 */
function skipDay(E, patch = {}) {
  assert.equal(act(E, { type: 'open' }).ok, true);
  E.s.tick = (E.s.closeMin - E.s.openMin) * B.TICKS_PER_MIN - 1;
  E.s.baseArrival = 0;
  Object.assign(E.s.day, patch);
  stepShop(E.s);
  assert.equal(E.s.phase, 'closed');
  return endDay(E);
}

test('無限模式：起始條件和日曆', () => {
  const E = createEndless(1);
  assert.equal(E.s.money, 300000);
  assert.equal(E.s.reputation, 30);
  assert.equal(`${E.s.shop.w}x${E.s.shop.h}`, '8x8');
  assert.equal(E.s.shop.furniture.filter((f) => f.type === 'counterSeat').length, 4);
  assert.deepEqual(E.s.staff.map((x) => x.id), ['ryo']);
  assert.deepEqual(Object.keys(E.s.menu), N.START_MENU);
  assert.deepEqual(calendar(0), { year: 1, month: 1, week: 1, weekday: 1, weekend: false, monthEnd: false, weekEnd: false });
  assert.equal(calendar(5).weekend, true);
  assert.equal(calendar(6).weekEnd, true);
  assert.equal(calendar(27).monthEnd, true);
  assert.equal(calendar(28).month, 2);
  assert.equal(calendar(336).year, 2);
  // 今天的魚價看得到，浮動在 ±20% 以內
  for (const v of Object.values(E.today.prices)) assert.ok(v >= 0.8 && v <= 1.2);
  assert.ok(validEndless(JSON.parse(JSON.stringify(E))));
  assert.equal(validEndless({ version: 1 }), false);
});

test('擺設：要研發才能買、要有錢、不可以重疊、位置都要走得到、營業中不可以擺', () => {
  const E = createEndless(1);
  assert.equal(act(E, { type: 'place', furniture: 'pachinko', x: 6, y: 0 }).reason, 'locked');
  assert.equal(act(E, { type: 'place', furniture: 'counterSeat', x: 2, y: 2 }).reason, 'overlap');
  assert.equal(act(E, { type: 'place', furniture: 'counterSeat', x: 9, y: 2 }).reason, 'outside');
  const r = act(E, { type: 'place', furniture: 'counterSeat', x: 5, y: 2 });
  assert.equal(r.ok, true);
  assert.equal(E.s.money, 300000 - FURNITURE.counterSeat.price);
  // 把入口堵死：拒絕
  assert.equal(act(E, { type: 'place', furniture: 'plant', x: 3, y: 7 }).reason, 'door');
  // 移動免費；賣掉退一半
  assert.equal(act(E, { type: 'move', id: r.id, x: 6, y: 5 }).ok, true);
  assert.equal(E.s.money, 300000 - 8000);
  assert.equal(act(E, { type: 'move', id: r.id, x: 2, y: 2 }).reason, 'overlap');
  assert.equal(act(E, { type: 'sell', id: r.id }).gain, 4000);
  assert.equal(E.s.money, 300000 - 4000);
  // 最後一座板前檯不能賣
  const station = E.s.shop.furniture.find((f) => f.type === 'chefStation');
  assert.equal(act(E, { type: 'sell', id: station.id }).reason, 'lastStation');
  // 錢不夠
  E.s.money = 1000;
  assert.equal(act(E, { type: 'place', furniture: 'counterSeat', x: 5, y: 2 }).reason, 'money');
  E.s.money = 300000;
  // 移動板前檯，師傅跟著走
  assert.equal(act(E, { type: 'move', id: station.id, x: 4, y: 5 }).ok, true);
  const ryo = E.s.staff[0];
  assert.equal(ryo.role, 'chef');
  assert.ok(Math.abs(ryo.gx - 5) < 0.01 && ryo.gy < 5 && ryo.gy > 4);
  assert.equal(act(E, { type: 'open' }).ok, true);
  assert.equal(act(E, { type: 'place', furniture: 'plant', x: 0, y: 0 }).reason, 'prepOnly');
  assert.equal(act(E, { type: 'expand' }).reason, 'prepOnly');
});

test('擴建：要評價和錢，原有家具位置不變，租金變貴', () => {
  const E = createEndless(1);
  assert.equal(rentOf(E.s.shop), 5000 + 64 * 50);
  const before = JSON.stringify(E.s.shop.furniture);
  E.s.reputation = 20;
  assert.equal(act(E, { type: 'expand' }).reason, 'rep');
  E.s.reputation = 30;
  E.s.money = 50000;
  assert.equal(act(E, { type: 'expand' }).reason, 'money');
  E.s.money = 300000;
  assert.equal(act(E, { type: 'expand' }).ok, true);
  assert.equal(E.s.money, 200000);
  assert.equal(`${E.s.shop.w}x${E.s.shop.h}`, '10x10');
  assert.equal(JSON.stringify(E.s.shop.furniture), before);
  assert.equal(rentOf(E.s.shop), 5000 + 100 * 50);
  assert.equal(E.s.baseArrival, N.SIZES[1].arrival);
  assert.equal(act(E, { type: 'place', furniture: 'plant', x: 9, y: 9 }).ok, true);
  E.s.money = 99999999; E.s.reputation = 100;
  for (let i = 0; i < 3; i++) assert.equal(act(E, { type: 'expand' }).ok, true);
  assert.equal(`${E.s.shop.w}x${E.s.shop.h}`, '20x16');
  assert.equal(act(E, { type: 'expand' }).reason, 'maxSize');
});

test('打烊結算：租金、薪水、食材損耗一半、靈感點、隔天回到準備階段', () => {
  const E = createEndless(1);
  act(E, { type: 'hire', staff: 'honda' });
  act(E, { type: 'setRole', staff: 'honda', role: 'floor' });
  act(E, { type: 'buy', item: 'ika', grade: 'premium', qty: 21 });
  const money = E.s.money;
  const r = skipDay(E, { happy: 65 });
  assert.equal(r.rent, 8200);
  assert.equal(r.day.wages, 5000);
  assert.equal(E.s.money, money - 8200 - 5000);
  assert.equal(E.s.stock.ika.premium, 11, '21 單位損失 10（無條件捨去）');
  assert.equal(r.spoiled, 10);
  assert.equal(r.insp, Math.floor(65 / N.INSP_PER));
  assert.equal(E.happyAcc, 65 % N.INSP_PER);
  assert.equal(E.day, 1);
  assert.equal(E.s.phase, 'prep');
  assert.equal(E.s.day.revenue, 0);
  assert.equal(E.s.staff.find((x) => x.id === 'honda').role, 'floor', '排班留到隔天');
  assert.equal(E.stats.days, 1);
});

test('雇用和解雇：纏要評價 50、麗子 60、中川 80', () => {
  const E = createEndless(1);
  assert.equal(hireStatus(E, 'honda'), 'ok');
  assert.equal(act(E, { type: 'hire', staff: 'matoi' }).reason, 'rep');
  E.s.reputation = 50;
  assert.equal(act(E, { type: 'hire', staff: 'matoi' }).ok, true);
  assert.equal(act(E, { type: 'hire', staff: 'matoi' }).reason, 'hired');
  assert.equal(act(E, { type: 'hire', staff: 'reiko' }).reason, 'rep');
  assert.equal(act(E, { type: 'hire', staff: 'ryo' }).reason, 'bad');
  assert.equal(act(E, { type: 'fire', staff: 'matoi' }).ok, true);
  assert.equal(act(E, { type: 'fire', staff: 'ryo' }).reason, 'bad');
  assert.deepEqual(E.s.staff.map((x) => x.id), ['ryo']);
});

test('研發：用靈感點解鎖壽司、機台、賽道、賣法', () => {
  const E = createEndless(1);
  assert.equal(act(E, { type: 'research', id: 'otoro' }).reason, 'insp');
  E.insp = 100;
  assert.equal(act(E, { type: 'research', id: 'otoro' }).ok, true);
  assert.equal(E.insp, 90);
  assert.ok(E.s.menu.otoro && E.s.stock.otoro);
  assert.equal(act(E, { type: 'research', id: 'otoro' }).reason, 'done');
  assert.equal(act(E, { type: 'research', id: 'track2' }).reason, 'needs');
  assert.equal(buildable(E).includes('pachinko'), false);
  act(E, { type: 'research', id: 'pachinko' });
  act(E, { type: 'research', id: 'raceCab' });
  assert.ok(buildable(E).includes('pachinko') && buildable(E).includes('raceCab'));
  const p = act(E, { type: 'place', furniture: 'pachinko', x: 6, y: 0 });
  assert.equal(p.ok, true);
  assert.equal(E.firstOwned.pachinko, 0);
  assert.equal(act(E, { type: 'setBoard', id: p.id, board: 1 }).reason, 'locked');
  act(E, { type: 'research', id: 'board2' });
  assert.equal(boardsUnlocked(E), 2);
  assert.equal(act(E, { type: 'setBoard', id: p.id, board: 1 }).ok, true);
  assert.equal(tracksUnlocked(E), 1);
  act(E, { type: 'research', id: 'track2' });
  assert.equal(tracksUnlocked(E), 2);
  assert.equal(E.s.features.disguise, false);
  act(E, { type: 'research', id: 'disguise' });
  assert.equal(E.s.features.disguise, true);
  act(E, { type: 'research', id: 'uniformSign' });
  assert.equal(E.s.features.uniform, true);
  assert.equal(researchStatus(E, RESEARCH.find((r) => r.id === 'uni')), 'ok');
  let total = 0;
  for (const r of RESEARCH) total += r.cost;
  assert.ok(total >= 90);
});

test('任務：一次顯示 3 個，完成一個補一個，獎勵是現金或靈感點', () => {
  assert.ok(QUESTS.length >= 20);
  for (const q of QUESTS) { assert.ok(hasString(`quest.${q.id}`), q.id); assert.ok(q.reward.money || q.reward.insp); }
  for (const e of RANDOM_EVENTS) assert.ok(hasString(`event.${e.id}`) && hasString(`event.${e.id}.desc`), e.id);
  assert.ok(RANDOM_EVENTS.length >= 8);
  const E = createEndless(1);
  assert.deepEqual(activeQuests(E).map((q) => q.id), ['rev1', 'served1', 'seats']);
  const money = E.s.money;
  const r = skipDay(E, { revenue: 60000, served: 10 });
  assert.deepEqual(r.quests, ['rev1']);
  assert.equal(E.s.money, money - 8200 + 20000);
  assert.deepEqual(activeQuests(E).map((q) => q.id), ['served1', 'seats', 'staff1']);
  assert.equal(questValue(E, QUESTS.find((q) => q.id === 'seats')), 4);
  act(E, { type: 'hire', staff: 'honda' });
  const insp = E.insp;
  const r2 = skipDay(E, { served: 55 });
  assert.deepEqual(r2.quests.sort(), ['served1', 'staff1']);
  assert.equal(E.insp, insp + 6);
  // 累計型：親自打敗職業玩家
  E.s.flags.beatPro = 1;
  skipDay(E);
  assert.equal(E.counters.beatPro, 1);
  // 連續幾天評價不下降
  assert.ok(E.repStreak >= 3);
  E.s.reputation -= 5;
  skipDay(E);
  assert.equal(E.repStreak, 0);
});

test('借款：上限 ¥500,000，每週利息 5%', () => {
  const E = createEndless(1);
  assert.equal(act(E, { type: 'borrow', amount: 600000 }).reason, 'loanMax');
  assert.equal(act(E, { type: 'borrow', amount: 200000 }).ok, true);
  assert.equal(E.s.money, 500000);
  assert.equal(E.loan, 200000);
  let interest = 0;
  for (let d = 0; d < 7; d++) interest += skipDay(E).interest;
  assert.equal(interest, 10000, '第 7 天付一次利息');
  assert.equal(act(E, { type: 'repay', amount: 200000 }).ok, true);
  assert.equal(E.loan, 0);
  assert.equal(act(E, { type: 'repay', amount: 1 }).reason, 'qty');
});

test('破產：資金低於 −¥100,000 連續 3 天。第一次中川紓困，第二次遊戲結束', () => {
  const E = createEndless(1);
  E.s.money = -150000;
  assert.equal(skipDay(E).bankrupt, null);
  assert.equal(skipDay(E).bankrupt, null);
  const rep = E.s.reputation;
  const r = skipDay(E);
  assert.equal(r.bankrupt, 'bailout');
  assert.equal(E.s.money, N.BAILOUT_MONEY);
  assert.ok(Math.abs(E.s.reputation - Math.max(0, rep + N.BAILOUT_REP)) < 1e-9);
  assert.equal(E.gameOver, false);
  // 中間回到正常，天數重算
  E.s.money = -150000;
  skipDay(E);
  E.s.money = 50000;
  skipDay(E);
  assert.equal(E.debtDays, 0);
  E.s.money = -900000;
  skipDay(E); skipDay(E);
  const r2 = skipDay(E);
  assert.equal(r2.bankrupt, 'over');
  assert.equal(E.gameOver, true);
  assert.equal(act(E, { type: 'open' }).reason, 'gameOver');
});

test('月排名：月底比營業額。贏了有獎金和評價，憂鬱每月成長 8%', () => {
  const E = createEndless(1);
  E.day = 27;
  E.month.revenue = N.RIVAL_MONTH + 1;
  const money = E.s.money;
  const rep = E.s.reputation;
  const r = skipDay(E);
  assert.equal(r.month.win, true);
  assert.equal(r.month.bonus, Math.round(N.RIVAL_MONTH * N.RIVAL_BONUS));
  assert.equal(E.s.money, money - 8200 + r.month.bonus);
  assert.ok(E.s.reputation >= rep + N.RIVAL_REP - 0.01);
  assert.equal(E.month.rival, Math.round(N.RIVAL_MONTH * N.RIVAL_GROWTH));
  assert.equal(E.month.revenue, 0);
  assert.equal(E.counters.monthWins, 1);
  E.day = 55;
  assert.equal(skipDay(E).month.win, false);
});

test('存檔：準備階段存成 JSON 再讀回來，跑一天的結果相同', () => {
  const a = createEndless(7);
  for (let i = 0; i < 2; i++) runEndlessDay(a);
  const b = JSON.parse(JSON.stringify(a));
  runEndlessDay(a);
  runEndlessDay(b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('事件客人：白鳥麗次沒吃滿 20 貫，評價 −5；特殊刑事在場時來客變少', () => {
  const E = createEndless(1);
  E.s.events = [{ kind: 'group', type: 'shiratori', count: 1, at: 11 * 60 + 2, fired: false }];
  E.s.baseArrival = 0;
  for (const id of Object.keys(E.s.menu)) act(E, { type: 'buy', item: id, grade: 'premium', qty: 2 });
  act(E, { type: 'open' });
  for (let i = 0; i < 8 * 200 && !E.s.feed.some((e) => e.key === 'feed.shiratoriFail'); i++) stepShop(E.s);
  assert.ok(E.s.feed.some((e) => e.key === 'feed.shiratoriFail'));
  assert.ok(E.s.reputation < 30 + B.SHIRATORI_FAIL_REP + 1.5);
});

test('60 天自動玩家：不破產，資金成長，店有變大', () => {
  const E = createEndless(3);
  const start = E.s.money;
  let mid = 0;
  for (let d = 0; d < 60; d++) {
    runEndlessDay(E);
    if (d === 29) mid = E.s.money + (E.spentBuild || 0);
    assert.equal(E.gameOver, false, `第 ${d + 1} 天破產`);
  }
  assert.equal(E.bankruptcies, 0);
  assert.equal(E.day, 60);
  assert.ok(E.s.money > start, `資金 ${start} → ${E.s.money}`);
  assert.ok(E.s.money + (E.spentBuild || 0) > mid, '後 30 天也有賺');
  assert.ok(E.size >= 1 && E.s.staff.length >= 3 && E.research.length >= 6);
  assert.ok(E.questsDone.length >= 8, `完成 ${E.questsDone.length} 個任務`);
  assert.ok(botStep);
});
