// 量化排程：片段一定從小節線開始。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler, LiveState, nextLaunchBar } from '../../src/transport.js';
import { generateBank, barDuration } from '../../src/generator.js';
import { TRACK_IDS } from '../../src/genres.js';
import { Rng } from '../../src/rng.js';

function simulate({ bpm, startTime, requests, until, lookahead = 0.15, tickEvery = 0.025 }) {
  const bank = generateBank({ genre: 'house', seed: 'q' });
  const barDur = barDuration(bpm);
  const live = new LiveState(TRACK_IDS);
  const launches = [];
  const barStarts = [];
  const pendingReq = {};
  const sched = new Scheduler({
    lookahead,
    getBarDur: () => barDur,
    onBar: (bar, time) => {
      barStarts.push({ bar, time });
      for (const l of live.advance(bar)) {
        launches.push({ ...l, time, req: pendingReq[l.track] });
        delete pendingReq[l.track];
      }
      live.plan(bar, bank);
    },
  });
  sched.start(startTime, 0);
  const pending = requests.slice().sort((a, b) => a.time - b.time);
  const made = [];
  for (let now = 0; now <= until; now += tickEvery) {
    while (pending.length && pending[0].time <= now) {
      const r = pending.shift();
      live.queue(r.track, r.clip);
      const m = { ...r, madeAt: now };
      made.push(m);
      if (live.pending[r.track]) pendingReq[r.track] = m;
      else delete pendingReq[r.track];
    }
    sched.tick(now);
  }
  return { launches, barStarts, made, barDur };
}

test('每個片段都從小節線開始播（隨機點擊 300 次）', () => {
  const rng = new Rng('quantize');
  for (const bpm of [72, 100, 124, 150]) {
    const startTime = 0.06;
    const requests = [];
    for (let i = 0; i < 300; i++) {
      requests.push({ time: rng.range(0, 60), track: rng.pick(TRACK_IDS), clip: rng.int(0, 7) });
    }
    const { launches, barDur, made } = simulate({ bpm, startTime, requests, until: 64 });
    assert.ok(launches.length > 20, '應該有很多次切換');
    for (const l of launches) {
      const barsFromStart = (l.time - startTime) / barDur;
      assert.ok(Math.abs(barsFromStart - Math.round(barsFromStart)) < 1e-9, `開始時間 ${l.time} 不在小節線上`);
      assert.equal(Math.round(barsFromStart), l.bar);
    }
    // 每次點擊之後，最多等一個小節（加上提前排程的時間）就會開始，而且不會比點擊更早
    for (const l of launches) {
      if (!l.req) continue;
      assert.ok(l.time >= l.req.madeAt, '不能比點擊更早開始');
      assert.ok(l.time - l.req.madeAt <= barDur + 0.15 + 0.025 + 1e-6, `等待 ${l.time - l.req.madeAt} 秒，超過一個小節`);
    }
  }
});

test('小節中間點擊：這個小節不變，下一個小節才換', () => {
  const bpm = 120;
  const barDur = barDuration(bpm);
  const { launches } = simulate({
    bpm,
    startTime: 0,
    requests: [
      { time: 0, track: 'drums', clip: 0 },
      { time: barDur * 2.5, track: 'drums', clip: 3 },
    ],
    until: barDur * 5,
  });
  assert.equal(launches[0].bar, 0);
  assert.equal(launches[1].bar, 3);
  assert.equal(launches[1].clip, 3);
  assert.ok(Math.abs(launches[1].time - 3 * barDur) < 1e-9);
});

test('每軌同時只播一段：後來的點擊取代等待中的點擊', () => {
  const live = new LiveState(TRACK_IDS);
  live.queue('bass', 1);
  live.queue('bass', 4);
  const launched = live.advance(0);
  assert.equal(launched.length, 1);
  assert.equal(live.active.bass.clip, 4);
  live.queue('bass', 2);
  live.advance(1);
  assert.equal(live.active.bass.clip, 2);
  assert.equal(Object.values(live.active).filter(Boolean).length, 1);
});

test('停止指令也是在小節線生效', () => {
  const bank = generateBank({ genre: 'lofi', seed: 's' });
  const live = new LiveState(TRACK_IDS);
  live.queue('drums', 2);
  live.advance(0);
  live.queueStop('drums');
  assert.ok(live.plan(0, bank).tracks.drums, '停止前這個小節還在播');
  live.advance(1);
  assert.equal(live.plan(1, bank).tracks.drums, null);
});

test('片段在自己的長度裡循環', () => {
  const bank = generateBank({ genre: 'synthwave', seed: 'loop' });
  const live = new LiveState(TRACK_IDS);
  const idx = bank.tracks.chords.findIndex((c) => c.bars === 4);
  live.queue('chords', idx);
  live.advance(5);
  const seq = [5, 6, 7, 8, 9, 10].map((b) => live.plan(b, bank).tracks.chords.clipBar);
  assert.deepEqual(seq, [0, 1, 2, 3, 0, 1]);
});

test('nextLaunchBar 算出下一個來得及的小節', () => {
  assert.equal(nextLaunchBar(0, 0, 2, 0.15), 1);
  assert.equal(nextLaunchBar(1.9, 0, 2, 0.15), 2);
  assert.equal(nextLaunchBar(1.0, 0, 2, 0.15), 1);
});
