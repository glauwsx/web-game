import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, BOARD_ORDER } from '../../src/data/pachinko-boards.js';
import { PACHINKO as P } from '../../src/data/balance.js';
import { PACHINKO_TABLE } from '../../src/data/pachinko-table.js';
import { simulateBall, traceBall, compileBoard, OUTCOMES } from '../../src/mini/pachinko/physics.js';
import { tableFor, expectedPayout, sampledPayout, simulatePlay, bestPower, POCKET_KINDS, PRIZE_VALUE, tierValue } from '../../src/mini/pachinko/ai.js';
import { rngCreate, rngFloat } from '../../src/core/rng.js';
import { RANGES } from '../../tools/gen-pachinko-table.mjs';

test('小鋼珠物理：5,000 顆彈珠全部在時限內結束，沒有穿牆、沒有穿過釘子', () => {
  for (const id of BOARD_ORDER) {
    const board = BOARDS[id];
    const rng = rngCreate(2024);
    const seen = {};
    for (let i = 0; i < 5000; i++) {
      const setting = 1 + (i % 5);
      const power = rngFloat(rng);
      const r = traceBall(board, setting, power, rng);
      assert.ok(OUTCOMES.includes(r.result), `結果代號 ${r.result}`);
      assert.ok(r.t < P.MAX_T, `第 ${i} 顆花了 ${r.t} 秒`);
      seen[r.result] = (seen[r.result] || 0) + 1;
      if (r.foul) continue;
      // 沒有穿過釘子：彈珠中心離任何釘子的距離不會小於兩個半徑相加（容許一點點誤差）
      assert.ok(r.minNail >= P.BALL_R + P.NAIL_R - 0.6, `第 ${i} 顆離釘子最近 ${r.minNail}`);
      // 沒有穿牆：一直在外框裡面
      assert.ok(r.minX >= 8 + P.BALL_R - 0.6 && r.maxX <= 182 - P.BALL_R + 0.6 && r.minY >= 8 + P.BALL_R - 0.6, `第 ${i} 顆跑出外框`);
    }
    assert.ok(seen.out > 0 && seen.S > 0, '有彈珠沒進，也有彈珠進啟動口');
  }
});

test('小鋼珠物理：同種子同結果；力道太弱射不上去', () => {
  const board = BOARDS.itamae;
  const run = () => { const rng = rngCreate(5); const out = []; for (let i = 0; i < 200; i++) out.push(simulateBall(board, 3, 0.4 + rngFloat(rng) * 0.2, rng)); return out.join(','); };
  assert.equal(run(), run());
  const r = traceBall(board, 3, 0.1, rngCreate(1));
  assert.equal(r.result, 'out');
  assert.equal(r.foul, true);
});

test('小鋼珠檯面：有 5 種入賞口，釘子設定會移動可調整的釘子', () => {
  for (const id of BOARD_ORDER) {
    const kinds = new Set(BOARDS[id].pockets.map((p) => p.kind));
    assert.deepEqual([...kinds].sort(), ['A', 'B', 'C', 'D', 'S']);
    const g1 = compileBoard(BOARDS[id], 1);
    const g5 = compileBoard(BOARDS[id], 5);
    assert.notDeepEqual(g1.nails.concat(g1.walls), g5.nails.concat(g5.walls));
  }
});

test('小鋼珠統計表：格式正確，每個區間 400 顆以上', () => {
  for (const id of BOARD_ORDER) {
    const tb = PACHINKO_TABLE[id];
    assert.ok(tb.n >= 400);
    assert.equal(tb.settings.length, 5);
    tb.settings.forEach((st, i) => {
      assert.equal(st.counts.length, Math.round(1 / P.BIN));
      for (const row of st.counts) assert.ok(row.length === 5 && row.reduce((a, b) => a + b, 0) <= tb.n);
      assert.ok(Math.abs(st.best - bestPower(st.counts, tb.n, i + 1)) < 1e-9);
    });
  }
});

test('小鋼珠統計表跟物理抽樣一致', () => {
  for (const id of BOARD_ORDER) {
    const board = BOARDS[id];
    const rng = rngCreate(31337);
    for (const setting of [1, 3, 5]) {
      const tb = tableFor(PACHINKO_TABLE, id, setting);
      const bestBin = Math.floor(tb.best / P.BIN);
      // 抽幾個區間重跑：最佳區間、它的兩邊、兩側釘林
      for (const bin of [bestBin, bestBin - 1, bestBin + 1, bestBin - 6, bestBin + 6]) {
        const n = 1200;
        const got = [0, 0, 0, 0, 0];
        for (let i = 0; i < n; i++) {
          const k = POCKET_KINDS.indexOf(simulateBall(board, setting, (bin + rngFloat(rng)) * P.BIN, rng));
          if (k >= 0) got[k]++;
        }
        for (let k = 0; k < 5; k++) {
          const pTable = tb.counts[bin][k] / tb.n;
          const pNow = got[k] / n;
          // 容許 4 個標準差的抽樣誤差
          const sd = Math.sqrt(Math.max(pTable, 0.002) * (1 - pTable) * (1 / tb.n + 1 / n));
          assert.ok(Math.abs(pTable - pNow) <= 4 * sd + 0.004, `${id} 設定 ${setting} 區間 ${bin} ${POCKET_KINDS[k]}：表 ${pTable.toFixed(3)} 重跑 ${pNow.toFixed(3)}`);
        }
      }
    }
  }
});

test('小鋼珠回饋率落在計劃書 8.7 的範圍（每種顧客模擬 2,000 次遊玩取平均）', () => {
  for (const id of BOARD_ORDER) {
    for (let setting = 1; setting <= 5; setting++) {
      const tb = tableFor(PACHINKO_TABLE, id, setting);
      for (const type of ['normal', 'pachinkoFan', 'pro']) {
        const [lo, hi] = RANGES[type][setting - 1];
        // 期望值（直接用統計表算）要在範圍內
        const ev = expectedPayout(tb, setting, P.HAND_SD[type]);
        assert.ok(ev >= lo && ev <= hi, `${id} 設定 ${setting} ${type} 期望值 ${(ev * 100).toFixed(0)}%`);
        // 抽樣 2,000 次遊玩的平均也要在範圍內
        const got = sampledPayout(tb, setting, P.HAND_SD[type], rngCreate(8700 + setting), 2000);
        assert.ok(got >= lo && got <= hi, `${id} 設定 ${setting} ${type} 抽樣 ${(got * 100).toFixed(0)}%（範圍 ${lo * 100}–${hi * 100}）`);
      }
    }
  }
});

test('小鋼珠 AI：一次遊玩 30 顆，結果和價值一致', () => {
  const tb = tableFor(PACHINKO_TABLE, 'itamae', 3);
  const r = simulatePlay(tb, 3, 0, rngCreate(4));
  const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
  assert.ok(total <= 30);
  let v = 0;
  for (const [k, n] of Object.entries(r.counts)) v += PRIZE_VALUE[k] * n;
  assert.ok(Math.abs(v - r.value) < 1e-9);
  assert.equal(tierValue(4), 750);
  assert.ok(Math.abs(PRIZE_VALUE.J - (2 * 750 + 3 * 450 + 3 * 242.5)) < 1e-9);
});
