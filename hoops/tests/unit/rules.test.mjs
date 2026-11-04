// 規則邏輯單元測試：計分、進攻時限、球權轉換、比賽時鐘、犯規。
// 執行：node --test hoops/tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../src/sim/rules.js';
import { COURT } from '../../src/sim/constants.js';

const HX = COURT.hoopX;

test('計分：籃下與中距離是兩分', () => {
  assert.equal(R.pointsForShot(HX - 1, 0, 1), 2);
  assert.equal(R.pointsForShot(HX - 5, 1, 1), 2);
  assert.equal(R.pointsForShot(-HX + 3, -2, -1), 2);
});

test('計分：弧頂超過 6.75 公尺是三分', () => {
  assert.equal(R.pointsForShot(HX - 7.0, 0, 1), 3);
  assert.equal(R.pointsForShot(HX - 6.6, 0, 1), 2);
  assert.equal(R.pointsForShot(-HX + 7.2, 1.0, -1), 3);
});

test('計分：底角 6.6 公尺外是三分，籃框後方線內是兩分', () => {
  assert.equal(R.pointsForShot(HX - 0.5, 6.8, 1), 3);
  assert.equal(R.pointsForShot(HX - 0.5, -6.8, 1), 3);
  assert.equal(R.pointsForShot(HX - 0.5, 6.4, 1), 2);
  assert.equal(R.pointsForShot(HX + 1.0, 3, 1), 2); // 籃框後方
});

test('計分：只看進攻方向的籃框', () => {
  // 在右半場中線附近，朝左邊籃框進攻是超遠三分
  assert.equal(R.pointsForShot(8, 0, -1), 3);
  assert.equal(R.pointsForShot(8, 0, 1), 2);
});

test('scoreBasket 累加總分與單節得分', () => {
  const r = R.createRules({ quarterMinutes: 3 });
  R.scoreBasket(r, 0, 2);
  R.scoreBasket(r, 0, 3);
  R.scoreBasket(r, 1, 1);
  assert.deepEqual(r.score, [5, 1]);
  assert.equal(r.periodScores[0][0], 5);
  r.period = 2;
  R.scoreBasket(r, 1, 2);
  assert.equal(r.periodScores[1][1], 2);
  assert.equal(r.score[1], 3);
});

test('進攻時限：時鐘走時遞減，歸零時發出違例', () => {
  const r = R.createRules({ quarterMinutes: 3 });
  r.clockRunning = true;
  r.possession = 0;
  let ev = R.tickClocks(r, 10);
  assert.equal(ev.length, 0);
  assert.equal(r.shotClock, 14);
  assert.equal(r.gameClock, 170);
  ev = R.tickClocks(r, 14.5);
  assert.ok(ev.includes('shotClockViolation'));
  assert.equal(r.shotClock, 0);
});

test('進攻時限：投籃在空中時暫停', () => {
  const r = R.createRules({ quarterMinutes: 3 });
  r.clockRunning = true;
  R.tickClocks(r, 5, { shotInFlight: true });
  assert.equal(r.shotClock, 24);
  assert.equal(r.gameClock, 175);
});

test('球權轉換：換隊時重設 24 秒', () => {
  const r = R.createRules();
  r.possession = 0;
  r.shotClock = 3;
  const res = R.gainPossession(r, 1);
  assert.equal(res.changed, true);
  assert.equal(r.possession, 1);
  assert.equal(r.shotClock, 24);
});

test('球權轉換：碰框後的進攻籃板補到 14 秒', () => {
  const r = R.createRules();
  r.possession = 0;
  r.shotClock = 4;
  const res = R.gainPossession(r, 0, { rimTouched: true });
  assert.equal(res.changed, false);
  assert.equal(r.shotClock, 14);
  r.shotClock = 18;
  R.gainPossession(r, 0, { rimTouched: true });
  assert.equal(r.shotClock, 18, '剩餘時間比 14 秒多時不重設');
});

test('球權轉換：沒碰框且時限用完再拿回球是違例', () => {
  const r = R.createRules();
  r.possession = 0;
  r.shotClock = 0;
  const res = R.gainPossession(r, 0, { rimTouched: false });
  assert.equal(res.violation, true);
});

test('比賽時間少於 24 秒時關閉進攻計時器', () => {
  const r = R.createRules();
  r.gameClock = 15;
  R.resetShotClock(r, 24);
  assert.equal(r.shotClockOff, true);
  r.clockRunning = true;
  const ev = R.tickClocks(r, 15.5);
  assert.ok(ev.includes('periodEnd'));
  assert.ok(!ev.includes('shotClockViolation'));
});

test('一節結束：時鐘歸零發出 periodEnd 並停止', () => {
  const r = R.createRules({ quarterMinutes: 2 });
  r.clockRunning = true;
  const ev = R.tickClocks(r, 121);
  assert.ok(ev.includes('periodEnd'));
  assert.equal(r.gameClock, 0);
  assert.equal(r.clockRunning, false);
});

test('換節：中場交換進攻方向、重設團隊犯規、交替球權', () => {
  const r = R.createRules({ quarterMinutes: 3 });
  r.tipWinner = 1;
  r.teamFouls = [3, 4];
  let res = R.endPeriod(r);
  assert.equal(r.period, 2);
  assert.equal(res.possessionTeam, 0, '第二節給跳球輸的一方');
  assert.deepEqual(r.teamFouls, [0, 0]);
  assert.deepEqual(r.attackSide, [1, -1]);
  res = R.endPeriod(r);
  assert.equal(res.halftime, true);
  assert.deepEqual(r.attackSide, [-1, 1], '下半場交換場地');
  assert.equal(res.possessionTeam, 0);
  res = R.endPeriod(r);
  assert.equal(r.period, 4);
  assert.equal(res.possessionTeam, 1, '第四節給跳球贏的一方');
  assert.equal(r.gameClock, 180);
});

test('比賽結束：第四節後分數不同就結束，平手進延長', () => {
  const r = R.createRules({ quarterMinutes: 3 });
  r.period = 4;
  r.score = [50, 50];
  let res = R.endPeriod(r);
  assert.equal(res.gameOver, false);
  assert.equal(res.overtime, true);
  assert.equal(r.period, 5);
  assert.equal(r.gameClock, r.otLength);
  assert.equal(R.periodLabel(r), '延長賽');
  r.score = [55, 52];
  res = R.endPeriod(r);
  assert.equal(res.gameOver, true);
  assert.equal(R.winner(r), 0);
});

test('犯規：投籃犯規罰球數＝那球的分數，進球加罰一次', () => {
  const r = R.createRules();
  assert.equal(R.registerFoul(r, 1, { shooting: true, shotPoints: 2, made: false }).freeThrows, 2);
  assert.equal(R.registerFoul(r, 1, { shooting: true, shotPoints: 3, made: false }).freeThrows, 3);
  assert.equal(R.registerFoul(r, 1, { shooting: true, shotPoints: 2, made: true }).freeThrows, 1);
  assert.equal(r.teamFouls[1], 3);
});

test('犯規：一般犯規未達加罰是發邊線球，第 5 次起罰兩球', () => {
  const r = R.createRules();
  r.shotClock = 9;
  for (let i = 0; i < 4; i++) {
    const res = R.registerFoul(r, 0, { shooting: false });
    assert.equal(res.freeThrows, 0);
    assert.equal(res.inbound, true);
  }
  assert.equal(r.shotClock, 14, '防守犯規後進攻時限補到 14 秒');
  const res = R.registerFoul(r, 0, { shooting: false });
  assert.equal(res.freeThrows, 2);
});

test('界內判定', () => {
  assert.equal(R.isInBounds(0, 0), true);
  assert.equal(R.isInBounds(13.9, 7.4), true);
  assert.equal(R.isInBounds(14.1, 0), false);
  assert.equal(R.isInBounds(0, -7.6), false);
});

test('時鐘格式', () => {
  assert.equal(R.formatClock(180), '3:00');
  assert.equal(R.formatClock(61.2), '1:02');
  assert.equal(R.formatClock(12.34), '12.3');
});
