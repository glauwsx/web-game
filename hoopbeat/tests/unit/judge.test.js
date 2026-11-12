import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BeatGrid } from '../../src/rhythm/beatgrid.js';
import { judge, windowsFor, estimateLatency, Combo, tempoWindowScale } from '../../src/rhythm/judge.js';

const grid120 = () => {
  const g = new BeatGrid();
  g.reset(10, 120); // 第 0 拍在 10 秒，每拍 0.5 秒
  return g;
};

test('拍點格線：拍點時間、強拍、相位', () => {
  const g = grid120();
  assert.equal(g.beatTime(0), 10);
  assert.equal(g.beatTime(4), 12);
  assert.equal(g.describe(4).downbeat, true);
  assert.equal(g.describe(6).strong, true);
  assert.equal(g.describe(5).strong, false);
  assert.ok(Math.abs(g.phase(10.25) - 0.5) < 1e-9);
  assert.equal(g.nearest(11.2).beat, 2);
  assert.equal(g.nearest(11.3).beat, 3);
});

test('拍點格線：在小節線上換速度', () => {
  const g = grid120();
  g.setTempoAtBeat(8, 60); // 第 8 拍（14 秒）起每拍 1 秒
  assert.equal(g.beatTime(8), 14);
  assert.equal(g.beatTime(10), 16);
  assert.equal(g.bpmAt(13.9), 120);
  assert.equal(g.bpmAt(14.5), 60);
  assert.equal(g.nearest(15.4).beat, 9);
  assert.equal(g.nearest(13.8).beat, 8);
});

test('判定：在 120 BPM、普通難度下，不同毫秒數的結果', () => {
  const g = grid120();
  const w = windowsFor('normal', 120);
  assert.deepEqual(
    [w.perfect, w.great, w.good].map(Math.round),
    [42, 78, 125],
  );
  const at = (ms) => judge(12 + ms / 1000, g, { difficulty: 'normal' }).grade;
  assert.equal(at(0), 'perfect');
  assert.equal(at(30), 'perfect');
  assert.equal(at(-41), 'perfect');
  assert.equal(at(50), 'great');
  assert.equal(at(-70), 'great');
  assert.equal(at(100), 'good');
  assert.equal(at(-120), 'good');
  assert.equal(at(140), 'miss');
  assert.equal(at(-200), 'miss');
  // 剛好在兩拍中間：一定是 Miss
  assert.equal(at(250), 'miss');
});

test('判定：早按、晚按的符號正確', () => {
  const g = grid120();
  const early = judge(11.98, g);
  const late = judge(12.03, g);
  assert.equal(early.early, true);
  assert.ok(Math.abs(early.offsetMs + 20) < 1e-6);
  assert.equal(late.early, false);
  assert.ok(Math.abs(late.offsetMs - 30) < 1e-6);
});

test('判定：延遲校正生效', () => {
  const g = grid120();
  // 玩家的按鍵固定晚 70 毫秒才被記錄到
  const press = 12.07;
  assert.equal(judge(press, g, { latencyMs: 0 }).grade, 'great');
  assert.equal(judge(press, g, { latencyMs: 70 }).grade, 'perfect');
  assert.ok(Math.abs(judge(press, g, { latencyMs: 70 }).offsetMs) < 1e-6);
  // 校正方向錯了會更糟
  assert.equal(judge(press, g, { latencyMs: -70 }).grade, 'miss');
});

test('判定：難度越高窗口越窄', () => {
  const g = grid120();
  const press = 12.05;
  assert.equal(judge(press, g, { difficulty: 'easy' }).grade, 'perfect');
  assert.equal(judge(press, g, { difficulty: 'normal' }).grade, 'great');
  assert.equal(judge(press, g, { difficulty: 'hard' }).grade, 'great');
  assert.equal(judge(12.07, g, { difficulty: 'hard' }).grade, 'good');
  const e = windowsFor('easy', 120);
  const h = windowsFor('hard', 120);
  assert.ok(e.perfect > h.perfect && e.great > h.great && e.good > h.good);
});

test('判定：速度越快，窗口（毫秒）越窄', () => {
  const slow = windowsFor('normal', 80);
  const mid = windowsFor('normal', 120);
  const fast = windowsFor('normal', 170);
  assert.ok(slow.perfect > mid.perfect && mid.perfect > fast.perfect);
  assert.ok(slow.good > mid.good && mid.good > fast.good);
  assert.ok(tempoWindowScale(170) < 1 && tempoWindowScale(80) > 1);
  // 同樣晚 40 毫秒：80 BPM 是 Perfect，170 BPM 不是
  const g80 = new BeatGrid();
  g80.reset(0, 80);
  const g170 = new BeatGrid();
  g170.reset(0, 170);
  assert.equal(judge(g80.beatTime(4) + 0.04, g80).grade, 'perfect');
  assert.notEqual(judge(g170.beatTime(4) + 0.04, g170).grade, 'perfect');
  // 窗口不會超過半拍，不會重疊
  for (const bpm of [60, 90, 120, 150, 200, 240]) {
    const w = windowsFor('easy', bpm);
    assert.ok(w.good < 60000 / bpm / 2, `bpm ${bpm}`);
    assert.ok(w.perfect < w.great && w.great < w.good);
  }
});

test('判定：投籃踩在弱拍上最多 Great，強拍才有 Perfect', () => {
  const g = grid120();
  const onWeak = judge(g.beatTime(5), g, { strongOnly: true });
  const onStrong = judge(g.beatTime(6), g, { strongOnly: true });
  assert.equal(onWeak.grade, 'great');
  assert.equal(onWeak.weakBeat, true);
  assert.equal(onStrong.grade, 'perfect');
  assert.equal(onStrong.strong, true);
  // 弱拍上的 Miss 還是 Miss
  assert.equal(judge(g.beatTime(5) + 0.2, g, { strongOnly: true }).grade, 'miss');
});

test('延遲校正：從跟拍的按鍵算出中位數', () => {
  const g = grid120();
  const taps = [4, 5, 6, 7, 8, 9, 10, 11].map((b, i) => g.beatTime(b) + 0.06 + (i % 2 ? 0.01 : -0.01));
  taps.push(g.beatTime(12) + 0.2); // 一下手滑
  const lat = estimateLatency(taps, g);
  assert.ok(lat >= 50 && lat <= 70, `lat=${lat}`);
  // 校正後，同樣的按法都是 Perfect
  for (const t of taps.slice(0, 8)) assert.equal(judge(t, g, { latencyMs: lat }).grade, 'perfect');
});

test('節奏連擊：踩中累積，Miss 歸零', () => {
  const c = new Combo();
  ['perfect', 'great', 'good', 'perfect'].forEach((gr) => c.register(gr));
  assert.equal(c.count, 4);
  c.register('miss');
  assert.equal(c.count, 0);
  assert.equal(c.max, 4);
  for (let i = 0; i < 20; i++) c.register('perfect');
  assert.equal(c.feel(), 1);
  assert.equal(c.hits.miss, 1);
});
