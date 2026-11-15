import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rngCreate, rngU32, rngFloat, rngInt, rngNormal, rngPoisson, rngPick, rngWeighted, rngShuffle, rngFork, rngRange,
} from '../../src/core/rng.js';

test('rng：同種子同序列', () => {
  const a = rngCreate(123);
  const b = rngCreate(123);
  for (let i = 0; i < 1000; i++) assert.equal(rngU32(a), rngU32(b));
});

test('rng：不同種子序列不同', () => {
  const a = rngCreate(1);
  const b = rngCreate(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (rngU32(a) === rngU32(b)) same++;
  assert.ok(same < 3);
});

test('rng：狀態是純 JSON，存檔再還原後序列相同', () => {
  const a = rngCreate(42);
  for (let i = 0; i < 57; i++) rngFloat(a);
  const saved = JSON.parse(JSON.stringify(a));
  const seqA = [];
  const seqB = [];
  for (let i = 0; i < 200; i++) seqA.push(rngNormal(a) + rngInt(a, 1, 6) + rngPoisson(a, 2.5));
  for (let i = 0; i < 200; i++) seqB.push(rngNormal(saved) + rngInt(saved, 1, 6) + rngPoisson(saved, 2.5));
  assert.deepEqual(seqA, seqB);
});

test('rng：float 在 [0,1)，int 含兩端，range 在範圍內', () => {
  const r = rngCreate(7);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const f = rngFloat(r);
    assert.ok(f >= 0 && f < 1);
    const n = rngInt(r, 3, 6);
    assert.ok(n >= 3 && n <= 6 && Number.isInteger(n));
    seen.add(n);
    const x = rngRange(r, -2, 5);
    assert.ok(x >= -2 && x < 5);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
});

test('rng：常態分布和卜瓦松分布的平均值正確', () => {
  const r = rngCreate(99);
  let sum = 0;
  let sq = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) { const x = rngNormal(r, 10, 2); sum += x; sq += (x - 10) ** 2; }
  assert.ok(Math.abs(sum / N - 10) < 0.06);
  assert.ok(Math.abs(Math.sqrt(sq / N) - 2) < 0.06);
  for (const lambda of [0.3, 2, 8, 50]) {
    let s = 0;
    for (let i = 0; i < N; i++) s += rngPoisson(r, lambda);
    assert.ok(Math.abs(s / N - lambda) < lambda * 0.05 + 0.02, `lambda=${lambda} mean=${s / N}`);
  }
  assert.equal(rngPoisson(r, 0), 0);
});

test('rng：pick、weighted、shuffle、fork', () => {
  const r = rngCreate(5);
  assert.equal(rngPick(r, []), undefined);
  assert.ok(['a', 'b'].includes(rngPick(r, ['a', 'b'])));
  assert.equal(rngWeighted(r, [0, 0]), -1);
  const counts = [0, 0, 0];
  for (let i = 0; i < 6000; i++) counts[rngWeighted(r, [1, 0, 3])]++;
  assert.equal(counts[1], 0);
  assert.ok(Math.abs(counts[2] / counts[0] - 3) < 0.4);
  const arr = rngShuffle(r, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...arr].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  const f1 = rngFork(rngCreate(11));
  const f2 = rngFork(rngCreate(11));
  assert.equal(rngU32(f1), rngU32(f2));
});
