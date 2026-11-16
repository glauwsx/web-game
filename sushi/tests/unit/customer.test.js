// 顧客版本的規則（計劃書 13）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { raceStats, scoreOf, zukanGains, addToBoard } from '../../src/modes/customer-rules.js';
import { CUSTOMER_CAST, CUSTOMER_RACE_STATS } from '../../src/data/characters.js';
import { CUSTOMER as C } from '../../src/data/balance.js';
import { SUSHI } from '../../src/data/sushi.js';
import { rngCreate } from '../../src/core/rng.js';
import { hasString } from '../../src/data/strings.js';

test('角色的賽車數值：6 位角色，差異在 ±5% 以內，中川全部普通', () => {
  assert.deepEqual(CUSTOMER_CAST, ['nakagawa', 'reiko', 'honda', 'terai', 'bucho', 'matoi']);
  for (const id of CUSTOMER_CAST) {
    assert.ok(CUSTOMER_RACE_STATS[id], id);
    assert.ok(hasString(`char.${id}`), id);
    for (const v of Object.values(raceStats(id))) assert.ok(v >= 0.95 - 1e-9 && v <= 1.05 + 1e-9, `${id} ${v}`);
  }
  assert.deepEqual(raceStats('nakagawa'), { accel: 1, top: 1, handling: 1 });
  assert.deepEqual(raceStats('reiko'), { accel: 1 + C.STAT_STEP, top: 1 - C.STAT_STEP, handling: 1 });
  assert.deepEqual(raceStats('terai'), { accel: 1 - C.STAT_STEP, top: 1 - C.STAT_STEP, handling: 1 + C.STAT_STEP });
});

test('零用錢挑戰的分數：小鋼珠是獎品價值，賽車再乘上完整度', () => {
  assert.equal(scoreOf('pachinko', { value: 3578 }), 3578);
  const prizes = ['tamago', 'sake'];
  const v = SUSHI.tamago.ref + SUSHI.sake.ref;
  assert.equal(scoreOf('race', { prizes, integrity: 100 }), v);
  assert.equal(scoreOf('race', { prizes, integrity: 50 }), Math.round(v / 2));
});

test('圖鑑：小鋼珠的入賞口換成那個等級的壽司，大獎是特上拼盤，套餐的條件', () => {
  const rng = rngCreate(3);
  const g = zukanGains('pachinko', { counts: { A: 1, B: 0, C: 2, D: 0, S: 5, J: 1 } }, rng);
  const pieces = Object.entries(g).filter(([id]) => !id.startsWith('set_'));
  assert.equal(pieces.reduce((a, [, n]) => a + n, 0), 3);
  for (const [id] of pieces) assert.ok([4, 2].includes(SUSHI[id].tier), id);
  assert.equal(g.set_tokujo, 1);
  assert.equal(g.set_nami, undefined, '3 貫不夠並套餐');
  const g2 = zukanGains('pachinko', { counts: { A: 0, B: 0, C: 0, D: C.SET_NAMI_PIECES, S: 0, J: 0 } }, rng);
  assert.equal(g2.set_nami, 1);
  const r = zukanGains('race', { prizes: ['tamago', 'sake', 'maguro', 'ikura', 'otoro'], won: ['tamago', 'sake', 'maguro', 'ikura', 'otoro'] }, rng);
  assert.equal(r.set_jo, 1, '贏過全部 5 台是上套餐');
  assert.deepEqual(zukanGains('race', { prizes: ['kappa'], won: [] }, rng), { kappa: 1 }, '安慰獎小黃瓜捲也算');
});

test('排行榜只留前 10 名，分數一樣時先拿到的排前面', () => {
  const board = [];
  for (let i = 0; i < 12; i++) addToBoard(board, { score: i * 100, at: i });
  assert.equal(board.length, 10);
  assert.equal(board[0].score, 1100);
  assert.equal(addToBoard(board, { score: 50, at: 99 }), 0, '分數太低沒進榜');
  assert.equal(addToBoard(board, { score: 1100, at: 100 }), 2, '同分排在舊的後面');
  assert.equal(addToBoard(board, { score: 5000, at: 101 }), 1);
});
