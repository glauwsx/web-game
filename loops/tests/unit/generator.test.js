// 生成器：音符都在調內、同一個種子結果一樣、片段長度正確。
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBank, regenerateTrack, CLIPS_PER_TRACK, defaultTrackSeed } from '../../src/generator.js';
import { GENRE_IDS, TRACK_IDS } from '../../src/genres.js';
import { barEvents } from '../../src/player.js';
import { scalePitchClasses, mod } from '../../src/theory.js';

const SEEDS = ['1', '42', '12345', '20261105', 'hello', '99999'];

function allPlans(bank) {
  // 每一軌每一段、每一個小節，配上每一種和弦片段（包含「沒有和弦片段」）
  const plans = [];
  const chordOptions = [null, ...bank.tracks.chords.map((c, i) => i)];
  for (const t of TRACK_IDS) {
    if (t === 'chords') continue;
    bank.tracks[t].forEach((clip, ci) => {
      for (let cb = 0; cb < clip.bars; cb++) {
        for (const ch of chordOptions) {
          const chClip = ch === null ? null : bank.tracks.chords[ch];
          const chBars = chClip ? chClip.bars : 1;
          for (let hb = 0; hb < Math.max(chBars, bank.defaultProg.length); hb++) {
            const tracks = Object.fromEntries(TRACK_IDS.map((x) => [x, null]));
            tracks[t] = { clip: ci, clipBar: cb };
            if (chClip) tracks.chords = { clip: ch, clipBar: hb % chBars };
            plans.push({ tracks, harmonyBar: hb });
          }
        }
      }
    });
  }
  bank.tracks.chords.forEach((clip, ci) => {
    for (let cb = 0; cb < clip.bars; cb++) {
      const tracks = Object.fromEntries(TRACK_IDS.map((x) => [x, null]));
      tracks.chords = { clip: ci, clipBar: cb };
      plans.push({ tracks, harmonyBar: 0 });
    }
  });
  return plans;
}

test('所有曲風、所有種子：生成的音都在調內（任何片段組合）', () => {
  let checked = 0;
  for (const genre of GENRE_IDS) {
    for (const seed of SEEDS) {
      const bank = generateBank({ genre, seed });
      const pcs = new Set(scalePitchClasses(bank.key));
      for (const plan of allPlans(bank)) {
        for (const ev of barEvents(bank, plan)) {
          for (const m of [ev.midi, ev.from]) {
            if (m === undefined) continue;
            checked++;
            assert.ok(pcs.has(mod(m, 12)), `${genre}/${seed} ${ev.track} 的音 ${m} 不在 ${JSON.stringify(bank.key)} 裡`);
            assert.ok(m >= 20 && m <= 110, `${ev.track} 的音 ${m} 超出合理音域`);
          }
        }
      }
    }
  }
  assert.ok(checked > 50000, `檢查的音太少：${checked}`);
});

test('同一個種子生成一樣的結果', () => {
  for (const genre of GENRE_IDS) {
    for (const seed of SEEDS) {
      const a = generateBank({ genre, seed });
      const b = generateBank({ genre, seed });
      assert.deepEqual(a, b);
      assert.equal(JSON.stringify(a), JSON.stringify(b));
    }
  }
});

test('不同的種子生成不同的結果', () => {
  for (const genre of GENRE_IDS) {
    const a = JSON.stringify(generateBank({ genre, seed: '111' }).tracks);
    const b = JSON.stringify(generateBank({ genre, seed: '222' }).tracks);
    assert.notEqual(a, b);
  }
});

test('單軌重新生成：只改那一軌，而且種子相同結果相同', () => {
  const bank = generateBank({ genre: 'trap', seed: '777' });
  const r1 = regenerateTrack(bank, 'bass', 31337);
  const r2 = regenerateTrack(bank, 'bass', 31337);
  assert.deepEqual(r1, r2);
  assert.notDeepEqual(r1.tracks.bass, bank.tracks.bass);
  for (const t of TRACK_IDS) if (t !== 'bass') assert.deepEqual(r1.tracks[t], bank.tracks[t]);
  assert.equal(r1.trackSeeds.bass, 31337);
  // 用存下來的種子組合可以重建一樣的片段庫
  const rebuilt = generateBank({ genre: 'trap', seed: '777', trackSeeds: r1.trackSeeds });
  assert.deepEqual(rebuilt, r1);
});

test('同一批片段：同一個速度、同一個調', () => {
  for (const genre of GENRE_IDS) {
    const bank = generateBank({ genre, seed: 'tempo' });
    assert.ok(Number.isInteger(bank.bpm));
    for (const t of TRACK_IDS) {
      for (const c of bank.tracks[t]) {
        assert.equal(c.bpm, undefined, '片段不能有自己的速度');
        assert.equal(c.key, undefined, '片段不能有自己的調');
      }
    }
  }
});

test('每軌 6–8 段、每段 1／2／4 小節、音符都在片段範圍內', () => {
  for (const genre of GENRE_IDS) {
    for (const seed of SEEDS) {
      const bank = generateBank({ genre, seed });
      for (const t of TRACK_IDS) {
        const clips = bank.tracks[t];
        assert.ok(clips.length >= 6 && clips.length <= 8);
        assert.equal(clips.length, CLIPS_PER_TRACK);
        for (const c of clips) {
          assert.ok([1, 2, 4].includes(c.bars), `${t} 片段長度 ${c.bars}`);
          const list = t === 'chords' ? c.hits : c.notes;
          assert.ok(list.length > 0, `${genre}/${seed} ${t} ${c.name} 是空的`);
          for (const n of list) {
            assert.ok(n.s >= 0 && n.s < c.bars * 16, `${t} 音符位置 ${n.s} 超出片段`);
            assert.ok(n.v > 0 && n.v <= 1);
          }
        }
      }
    }
  }
});

test('曲風決定速度範圍與搖擺感', () => {
  for (const seed of SEEDS) {
    const lofi = generateBank({ genre: 'lofi', seed });
    assert.ok(lofi.bpm >= 72 && lofi.bpm <= 88);
    assert.ok(lofi.swing > 0.55, 'Lo-fi 要有搖擺感');
    const house = generateBank({ genre: 'house', seed });
    assert.ok(house.bpm >= 120 && house.bpm <= 126);
    const trap = generateBank({ genre: 'trap', seed });
    assert.ok(trap.bpm >= 132);
  }
});

test('預設的單軌種子由總種子決定', () => {
  const bank = generateBank({ genre: 'chip', seed: '5' });
  for (const t of TRACK_IDS) assert.equal(bank.trackSeeds[t], defaultTrackSeed('chip', '5', t));
});
