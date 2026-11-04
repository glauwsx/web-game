// 編曲、錄音轉段落、存檔、WAV 編碼。
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBank, barDuration } from '../../src/generator.js';
import { TRACK_IDS } from '../../src/genres.js';
import { LiveState } from '../../src/transport.js';
import {
  makeSection, songTotalBars, sectionStartBar, locateBar, planSongBar, recordingToSections, autoArrange, songHasTypes,
} from '../../src/song.js';
import { serializeProject, parseProject } from '../../src/project.js';
import { encodeWav, decodeWav, analyzeChannels } from '../../src/wav.js';
import { expectedFrames } from '../../src/render.js';
import { Rng } from '../../src/rng.js';
import { mod } from '../../src/theory.js';

const bank = generateBank({ genre: 'lofi', seed: 'song' });

test('段落長度加總、起點、定位', () => {
  const song = { sections: [makeSection('intro', 4), makeSection('verse', 8), makeSection('chorus', 6)] };
  assert.equal(songTotalBars(song), 18);
  assert.equal(sectionStartBar(song, 2), 12);
  assert.deepEqual(
    [0, 3, 4, 11, 12, 17].map((b) => locateBar(song, b).index),
    [0, 0, 1, 1, 2, 2],
  );
  assert.equal(locateBar(song, 18), null);
});

test('段落裡的片段從段落開頭循環', () => {
  const idx = bank.tracks.chords.findIndex((c) => c.bars === 4);
  const song = { sections: [makeSection('intro', 2, { drums: 0 }), makeSection('verse', 6, { chords: idx })] };
  const seq = [2, 3, 4, 5, 6, 7].map((b) => planSongBar(song, b, bank).tracks.chords.clipBar);
  assert.deepEqual(seq, [0, 1, 2, 3, 0, 1]);
  assert.equal(planSongBar(song, 2, bank).tracks.drums, null);
});

test('錄下的演奏轉成段落後，每個小節都跟現場一模一樣', () => {
  const rng = new Rng('record');
  for (let trial = 0; trial < 20; trial++) {
    const live = new LiveState(TRACK_IDS);
    const entries = [];
    for (let bar = 0; bar < 40; bar++) {
      if (rng.chance(0.3)) live.queue(rng.pick(TRACK_IDS), rng.int(0, 7));
      if (rng.chance(0.08)) live.queueStop(rng.pick(TRACK_IDS));
      live.advance(bar);
      entries.push({ bar, plan: live.plan(bar, bank) });
    }
    const sections = recordingToSections(entries, bank);
    const song = { sections };
    // 前後沒聲音的小節會被修掉
    const firstNonEmpty = entries.findIndex((e) => TRACK_IDS.some((t) => e.plan.tracks[t]));
    let lastNonEmpty = entries.length - 1;
    while (lastNonEmpty >= 0 && TRACK_IDS.every((t) => !entries[lastNonEmpty].plan.tracks[t])) lastNonEmpty--;
    assert.equal(songTotalBars(song), lastNonEmpty - firstNonEmpty + 1);
    for (let b = 0; b < songTotalBars(song); b++) {
      const recorded = entries[firstNonEmpty + b].plan;
      const replay = planSongBar(song, b, bank);
      for (const t of TRACK_IDS) assert.deepEqual(replay.tracks[t], recorded.tracks[t], `第 ${b} 小節 ${t} 不一樣`);
      if (!recorded.tracks.chords) {
        assert.equal(mod(replay.harmonyBar - recorded.harmonyBar, bank.defaultProg.length), 0, '沒有和弦片段時，預設和弦進行也要對上');
      }
    }
  }
});

test('一鍵排歌包含五種段落、超過 32 小節', () => {
  const song = autoArrange(bank);
  assert.ok(songHasTypes(song, ['intro', 'verse', 'chorus', 'bridge', 'outro']));
  assert.ok(songTotalBars(song) >= 32);
});

test('專案存檔可以完整讀回來', () => {
  const song = autoArrange(bank);
  const mixer = Object.fromEntries(TRACK_IDS.map((t) => [t, { vol: 0.5, mute: t === 'fx', solo: false }]));
  const json = JSON.stringify(serializeProject({ name: '測試歌', bank, song, mixer }));
  const back = parseProject(json);
  assert.equal(back.name, '測試歌');
  assert.deepEqual(back.bank, bank);
  assert.deepEqual(back.mixer, mixer);
  assert.equal(back.song.sections.length, song.sections.length);
  back.song.sections.forEach((s, i) => {
    assert.equal(s.type, song.sections[i].type);
    assert.equal(s.bars, song.sections[i].bars);
    assert.deepEqual(s.clips, song.sections[i].clips);
  });
});

test('壞掉的專案檔會被拒絕，並給中文錯誤訊息', () => {
  assert.throws(() => parseProject('{not json'), /專案檔格式不對/);
  assert.throws(() => parseProject({ format: 'other' }), /不是 Loop 工坊/);
  const bad = serializeProject({ name: 'x', bank: { ...bank, genre: 'polka' }, song: { sections: [] }, mixer: {} });
  assert.throws(() => parseProject(bad), /曲風/);
});

test('WAV 編碼後解碼回來，長度與數值一致', () => {
  const sr = 44100;
  const n = 1000;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = Math.sin(i / 10) * 0.5; r[i] = -l[i]; }
  const wav = decodeWav(encodeWav([l, r], sr));
  assert.equal(wav.sampleRate, sr);
  assert.equal(wav.channels.length, 2);
  assert.equal(wav.frames, n);
  for (let i = 0; i < n; i += 97) assert.ok(Math.abs(wav.channels[0][i] - l[i]) < 1e-4);
  const st = analyzeChannels(wav.channels);
  assert.ok(Math.abs(st.peak - 0.5) < 0.01);
});

test('匯出長度 = 小節數 × 每小節秒數 + 餘韻', () => {
  const song = { sections: [makeSection('intro', 4), makeSection('chorus', 8)] };
  const frames = expectedFrames(bank, song, 2, 44100);
  assert.equal(frames, Math.ceil((12 * barDuration(bank.bpm) + 2) * 44100));
});
