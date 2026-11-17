import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, BOARD_ORDER } from '../../src/data/pachinko-boards.js';
import { PACHINKO as P } from '../../src/data/balance.js';
import { PACHINKO_TABLE } from '../../src/data/pachinko-table.js';
import { createSession } from '../../src/mini/pachinko/machine.js';
import { buildBoard } from '../../src/mini/pachinko/board.js';
import { tableFor, expectedPayout, sampledPayout, simulatePlay, bestPower, exchange, PRIZE_VALUE, tierValue } from '../../src/mini/pachinko/ai.js';
import { rngCreate, rngFloat } from '../../src/core/rng.js';
import { RANGES, leftRow } from '../../tools/gen-pachinko-table.mjs';
import { physicsPlay } from '../../tools/pachinko-check.mjs';

const PH = P.PH;
const STEPS = Math.round(P.FIRE_INTERVAL / PH.DT);

test('小鋼珠物理：鋼珠都在時限內結束，不會穿過釘子，不會跑出外軌', () => {
  for (const id of BOARD_ORDER) {
    const rng = rngCreate(2026);
    const s = createSession(id, 3, { seed: 7, balls: 1e6 });
    s.logic.update = () => {};
    const b = s.board;
    let minNail = Infinity, maxRho = 0, maxT = 0, done = 0;
    for (let i = 0; i < 400; i++) {
      s.fire(0.16 + rngFloat(rng) * 0.84);
      for (let k = 0; k < STEPS; k++) {
        for (const e of s.step()) { done++; maxT = Math.max(maxT, e.ball.t); }
        for (const ball of s.world.balls) {
          if (ball.mode !== 0 || !ball.free) continue;
          maxRho = Math.max(maxRho, Math.hypot(ball.x - b.cx, ball.y - b.cy));
          for (const n of b.nails) minNail = Math.min(minNail, Math.hypot(ball.x - n.x, ball.y - n.y));
        }
      }
    }
    for (let k = 0; k < 120 * 40 && s.world.balls.length; k++) for (const e of s.step()) { done++; maxT = Math.max(maxT, e.ball.t); }
    assert.equal(s.world.balls.length, 0, `${id}：還有鋼珠沒結束`);
    assert.equal(done, 400);
    assert.ok(maxT < PH.MAX_T, `${id}：最久的鋼珠花了 ${maxT.toFixed(1)} 秒`);
    assert.ok(minNail >= PH.BALL_R + PH.NAIL_R - 0.6, `${id}：離釘子最近 ${minNail.toFixed(2)}`);
    assert.ok(maxRho <= b.R - PH.BALL_R + 0.6, `${id}：跑出外軌 ${maxRho.toFixed(2)}`);
  }
});

test('小鋼珠物理：同種子同結果；力道太弱射不上去，鋼珠退回', () => {
  const run = () => physicsPlay('ryujin', 3, 0.4, 99);
  assert.deepEqual(run(), run());
  const s = createSession('ryujin', 3, { seed: 1 });
  for (let i = 0; i < 10; i++) { s.fire(0.05); for (let k = 0; k < STEPS; k++) s.step(); }
  assert.equal(s.stats.fouls, 10);
  assert.equal(s.lent, P.BALLS, '界外球退回借球');
});

test('小鋼珠盤面：釘子設定只改命釘的間距，越鬆越寬', () => {
  for (const id of BOARD_ORDER) {
    const gap = (setting) => {
      const life = buildBoard(BOARDS[id], setting).nails.filter((n) => n.tag === 'life' && n.y === 288);
      return Math.abs(life[1].x - life[0].x);
    };
    for (let s = 1; s < 5; s++) assert.ok(gap(s + 1) > gap(s), `${id} 設定 ${s} → ${s + 1}`);
    const a = buildBoard(BOARDS[id], 1), b = buildBoard(BOARDS[id], 5);
    assert.equal(a.nails.length, b.nails.length);
    // 一般客也看得懂：盤面上有ヘソ、ワープ、電チュー、アタッカー
    const kinds = new Set(a.sensors.map((x) => x.kind));
    for (const k of ['heso', 'warp', 'gate', 'denchu', 'attacker', 'pocket']) assert.ok(kinds.has(k), `${id} 有 ${k}`);
  }
});

test('出玉換壽司：從貴的換起，零頭有 T1 一半以上算一貫', () => {
  const j = PRIZE_VALUE.J / P.BALL_YEN;
  assert.equal(tierValue(4), 750);
  assert.ok(Math.abs(PRIZE_VALUE.J - (2 * 750 + 3 * 450 + 3 * 242.5)) < 1e-9);
  assert.deepEqual(exchange(0).counts, { J: 0, A: 0, B: 0, C: 0, D: 0 });
  assert.deepEqual(exchange(Math.ceil(j)).counts, { J: 1, A: 0, B: 0, C: 0, D: 0 });
  const r = exchange(1000);
  let v = 0;
  for (const [k, n] of Object.entries(r.counts)) v += PRIZE_VALUE[k] * n;
  assert.ok(Math.abs(v - r.value) < 1e-9);
  assert.ok(Math.abs(r.value - 1000 * P.BALL_YEN) <= PRIZE_VALUE.D / 2 + 1e-9, '換到的價值和出玉差不到半貫 T1');
  assert.equal(exchange(14).counts.D, 1, '14 顆（¥56）超過 T1 的一半');
  assert.equal(exchange(13).counts.D, 0);
});

test('小鋼珠統計表：格式正確，最佳力道在左打區', () => {
  assert.ok(PACHINKO_TABLE.n >= 1000);
  for (const id of BOARD_ORDER) {
    const t = PACHINKO_TABLE.boards[id];
    assert.ok(t.netRound > 30 && t.stCost > 0 && t.stTail >= 0);
    assert.equal(t.settings.length, 5);
    t.settings.forEach((st, i) => {
      for (const row of st.left) assert.ok(row.length === 2 && row[0] + row[1] <= PACHINKO_TABLE.n);
      const tb = tableFor(PACHINKO_TABLE, id, i + 1);
      assert.ok(Math.abs(st.best - bestPower(tb)) < 0.0006);
      assert.ok(st.best >= P.ZONES.left[0] && st.best <= P.ZONES.left[1], `${id} 設定 ${i + 1} 最佳力道 ${st.best}`);
    });
  }
});

test('小鋼珠統計表跟物理一致（抽幾個區間重跑）', () => {
  const t = PACHINKO_TABLE;
  for (const id of BOARD_ORDER) {
    for (const setting of [1, 5]) {
      const st = t.boards[id].settings[setting - 1];
      const best = Math.floor((st.best - t.bin0) / P.BIN);
      for (const bin of [best, best - 8]) {
        const n = 1200;
        const got = leftRow(id, setting, t.bin0 + bin * P.BIN, n, 4242 + bin);
        for (let k = 0; k < 2; k++) {
          const a = st.left[bin][k] / t.n, b = got[k] / n;
          const sd = Math.sqrt(Math.max(a, 0.005) * (1 / t.n + 1 / n));
          assert.ok(Math.abs(a - b) <= 4 * sd + 0.004, `${id} 設定 ${setting} 區間 ${bin} ${k ? '一般入賞口' : 'ヘソ'}：表 ${a.toFixed(3)} 重跑 ${b.toFixed(3)}`);
        }
      }
    }
  }
});

test('小鋼珠回饋率落在計劃書 8.7 的範圍（期望值，和每種顧客 2,000 局的平均）', () => {
  for (const id of BOARD_ORDER) {
    for (let setting = 1; setting <= 5; setting++) {
      const tb = tableFor(PACHINKO_TABLE, id, setting);
      for (const type of ['normal', 'pachinkoFan', 'pro']) {
        const [lo, hi] = RANGES[type][setting - 1];
        const ev = expectedPayout(tb, P.HAND_SD[type]);
        assert.ok(ev >= lo && ev <= hi, `${id} 設定 ${setting} ${type} 期望值 ${(ev * 100).toFixed(0)}%`);
        // 大當的價值很高，2,000 局的平均還是有幾個百分點的抽樣誤差。固定種子，結果是決定性的
        const got = sampledPayout(tb, P.HAND_SD[type], rngCreate(8800 + setting), 2000);
        assert.ok(got >= lo && got <= hi, `${id} 設定 ${setting} ${type} 抽樣 ${(got * 100).toFixed(0)}%（範圍 ${lo * 100}–${hi * 100}）`);
      }
    }
  }
});

test('小鋼珠 AI 模型和完整物理一致（含大當和確變，各 600 局）', () => {
  for (const id of BOARD_ORDER) {
    const tb = tableFor(PACHINKO_TABLE, id, 3);
    let sum = 0, hit = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const r = physicsPlay(id, 3, tb.best, 31000 + i);
      sum += r.balls;
      if (r.jackpots) hit++;
    }
    const model = (expectedPayout(tb, 0) * P.FEE) / P.BALL_YEN;
    const got = sum / n;
    assert.ok(Math.abs(got - model) / model < 0.2, `${id}：物理平均出玉 ${got.toFixed(0)}，模型 ${model.toFixed(0)}`);
    // 親手玩、力道對的話，設定 3 至少四局有一局大當
    assert.ok(hit / n >= 0.2, `${id}：有大當的局只有 ${(hit / n * 100).toFixed(0)}%`);
  }
});

test('小鋼珠 AI：一局的結果和價值一致', () => {
  const tb = tableFor(PACHINKO_TABLE, 'ryujin', 3);
  const rng = rngCreate(4);
  for (let i = 0; i < 300; i++) {
    const r = simulatePlay(tb, P.HAND_SD.normal, rng);
    const ex = exchange(r.balls);
    assert.deepEqual(r.counts, ex.counts);
    assert.equal(r.value, ex.value);
    assert.ok(r.balls >= 0);
  }
});

test('數位機一局：大當 → 右打進アタッカー → 確變 → 回到普通 → 借球打完就結束', () => {
  for (const id of BOARD_ORDER) {
    const s = createSession(id, 3, { seed: 21 });
    const st = s.logic.state;
    s.logic.debugWin();
    let k = 0, sawJp = false, sawSt = false;
    while (!s.isOver() && k < 120 * 600) {
      if (k % STEPS === 0) s.fire(s.wantRight() ? P.RIGHT_POWER : 0.4);
      s.step();
      if (st.phase === 'jp') sawJp = true;
      if (st.mode === 'st') sawSt = true;
      k++;
    }
    assert.ok(s.isOver(), `${id}：一局沒有結束`);
    assert.ok(sawJp && sawSt, `${id}：有大當也有確變`);
    assert.ok((s.stats.byId.att || 0) >= s.C.count * s.C.roundsSmall, `${id}：アタッカー只進 ${s.stats.byId.att || 0} 顆`);
    assert.equal(s.lent, 0);
    assert.equal(st.mode, 'normal');
    const r = s.result();
    assert.ok(r.balls > 100, `${id}：大當之後出玉 ${r.balls}`);
    assert.equal(s.fire(0.4), null, '結束後不能再發射');
  }
});

test('數位機：普通狀態右打幾乎沒有回報', () => {
  const s = createSession('ryujin', 3, { seed: 2 });
  while (s.lent > 0) { s.fire(P.RIGHT_POWER); for (let k = 0; k < STEPS; k++) s.step(); }
  assert.ok(s.stats.paid / s.stats.fired < 0.15, `右打回收 ${(s.stats.paid / s.stats.fired * 100).toFixed(0)}%`);
});
