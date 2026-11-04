import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBank } from '../../src/loops/generator.js';
import { autoArrange, makeSection } from '../../src/loops/song.js';
import { Deck } from '../../src/music/deck.js';
import { Conductor } from '../../src/music/conductor.js';

const mk = (id, genre = 'house', seed = 'a', bpm) => {
  const bank = generateBank({ genre, seed });
  return new Deck({ id, bank, song: autoArrange(bank), bpm });
};

test('配樂台：照編排一段一段播', () => {
  const d = mk('home');
  d.playing = true;
  const first = d.advanceBar(0);
  assert.equal(first.sectionType, 'intro');
  for (let i = 1; i < 4; i++) d.advanceBar(i);
  const verse = d.advanceBar(4);
  assert.equal(verse.sectionType, 'verse');
  assert.equal(verse.changed, true);
  // 繞完一整首會從頭開始
  for (let i = 5; i < d.totalBars; i++) d.advanceBar(i);
  assert.equal(d.advanceBar(99).sectionType, 'intro');
});

test('配樂台：現場切換在下一個小節線才生效', () => {
  const d = mk('home');
  d.playing = true;
  d.advanceBar(0);
  const before = d.currentClips().drums;
  d.cycleClip('drums', 1);
  assert.equal(d.currentClips().drums, before, '還沒到小節線');
  assert.notEqual(d.upcomingClips().drums, before);
  d.advanceBar(1);
  assert.equal(d.currentClips().drums, (before + 1) % 8);
  // 關掉、再打開
  d.toggleTrack('drums');
  d.advanceBar(2);
  assert.equal(d.currentClips().drums, null);
  d.toggleTrack('drums');
  d.advanceBar(3);
  assert.equal(d.currentClips().drums, (before + 1) % 8);
});

test('配樂台：沒在播的台，指令立刻生效', () => {
  const d = mk('away');
  d.playing = false;
  d.toggleTrack('lead');
  const after = d.currentClips().lead;
  d.toggleTrack('lead');
  assert.notEqual(after, d.currentClips().lead);
});

test('配樂台：同一組片段播太久會疲乏，換片段恢復新鮮', () => {
  const bank = generateBank({ genre: 'lofi', seed: 'x' });
  const d = new Deck({ id: 'h', bank, song: { sections: [makeSection('verse', 8, { drums: 2, bass: 1, chords: 0, lead: 0 })] } });
  d.playing = true;
  for (let i = 0; i < 40; i++) d.advanceBar(i);
  assert.equal(d.features().freshness, 0);
  d.cycleClip('lead', 1);
  d.advanceBar(40);
  assert.equal(d.features().freshness, 1);
});

test('配樂台：在樂句開頭換片段才有士氣加成', () => {
  const bank = generateBank({ genre: 'lofi', seed: 'x' });
  const song = { sections: [makeSection('verse', 16, { drums: 2, bass: 1, chords: 0, lead: 0 })] };
  const d = new Deck({ id: 'h', bank, song });
  d.playing = true;
  for (let i = 0; i < 6; i++) d.advanceBar(i); // 播到第 6 小節
  d.cycleClip('drums', 1);
  const off = d.advanceBar(6); // 第 6 小節不是樂句開頭
  assert.equal(off.changed, true);
  assert.equal(off.boosted, false);
  for (let i = 7; i < 12; i++) d.advanceBar(i);
  d.cycleClip('drums', 1);
  const on = d.advanceBar(12); // 第 12 小節是樂句開頭，距離上次換已經 6 小節
  assert.equal(on.boosted, true);
  assert.equal(d.morale(12), 1);
  assert.ok(d.morale(16) > 0 && d.morale(16) < 1);
  assert.equal(d.morale(30), 0);
});

test('配樂台：BPM 可以覆寫，特徵跟著變', () => {
  const d = mk('home', 'house', 'a', 170);
  assert.equal(d.features().bpm, 170);
  assert.equal(d.playBank().bpm, 170);
  assert.equal(d.bank.bpm !== 170, true);
});

test('指揮：播進攻方的歌，換邊時在小節線切換速度', () => {
  const home = mk('home', 'house', 'a', 120);
  const away = mk('away', 'trap', 'b', 160);
  const c = new Conductor({ home, away });
  c.start(0, 'home');
  c.tick(0, 0.1);
  assert.equal(c.timeline.length, 1);
  assert.equal(home.playing, true);
  assert.equal(away.playing, false);
  c.tick(3.9, 0.15); // 120 BPM 一小節 2 秒：排到第 2 小節（4 秒）
  assert.equal(c.nextBar, 3);
  c.setAudible('away');
  c.tick(5.9, 0.15);
  const last = c.timeline[c.timeline.length - 1];
  assert.equal(last.deck, 'away');
  assert.equal(last.time, 6);
  assert.equal(c.grid.bpmAt(6.1), 160);
  assert.equal(c.grid.bpmAt(5.9), 120);
  // 第 12 拍在 6 秒，第 13 拍在 6.375 秒
  assert.equal(c.grid.beatTime(12), 6);
  assert.ok(Math.abs(c.grid.beatTime(13) - 6.375) < 1e-9);
  assert.equal(away.playing, true);
  assert.equal(home.barsPlayed, 3);
  assert.equal(away.barsPlayed, 1);
});

test('配樂台：歌曲自己換段不算士氣，只有手動切換才算', () => {
  const d = mk('home');
  d.playing = true;
  let auto = 0;
  for (let i = 0; i < d.totalBars * 2; i++) if (d.advanceBar(i).boosted) auto++;
  assert.equal(auto, 0);
  while (d.barsPlayed % 4 !== 0) d.advanceBar(0);
  for (let i = 0; i < 4; i++) d.advanceBar(0);
  d.cycleClip('lead', 1);
  assert.equal(d.advanceBar(100).boosted, true);
});
