// 音樂（計劃書 16）：樂譜格式正確、每首 8 到 16 小節、每個場景都對得到歌。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, SCENE_MUSIC } from '../../src/data/music.js';
import { noteToMidi, parseTrack, compileSong } from '../../src/core/music.js';

test('音名轉 MIDI', () => {
  assert.equal(noteToMidi('A4'), 69);
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('F#4'), 66);
  assert.equal(noteToMidi('Bb3'), 58);
  assert.equal(noteToMidi('H4'), null);
});

test('樂譜：延長號接在前一個音後面，休止不出聲', () => {
  const tr = parseTrack('C5 - - . | E5 . G5 -');
  assert.equal(tr.steps, 8);
  assert.deepEqual(tr.notes, [{ step: 0, midi: 72, len: 3 }, { step: 4, midi: 76, len: 1 }, { step: 6, midi: 79, len: 2 }]);
});

test('6 首歌，每首 8 到 16 小節，音名都認得', () => {
  for (const name of ['title', 'shop', 'shopPeak', 'pachinko', 'race', 'results']) assert.ok(SONGS[name], name);
  for (const [name, song] of Object.entries(SONGS)) {
    for (const tok of song.lead.split(/\s+/)) if (tok && !['|', '-', '.'].includes(tok)) assert.notEqual(noteToMidi(tok), null, `${name} ${tok}`);
    for (const c of song.chords) assert.notEqual(noteToMidi(c), null, `${name} ${c}`);
    const c = compileSong(name, song);
    const bars = c.steps / 8;
    assert.ok(bars >= 8 && bars <= 16, `${name} ${bars} 小節`);
    assert.equal(parseTrack(song.lead).steps, song.chords.length * 8, `${name} 旋律和和弦一樣長`);
  }
  for (const [scene, song] of Object.entries(SCENE_MUSIC)) assert.ok(song === '*shop' || SONGS[song], scene);
});
