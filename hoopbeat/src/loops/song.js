// 歌曲編排：段落時間軸。每個段落有類型、長度（小節），以及每軌用哪個片段。

import { TRACK_IDS } from './genres.js';
import { mod } from './theory.js';

export const SECTION_TYPES = {
  intro: { name: '前奏', color: '#5fb4ff' },
  verse: { name: '主歌', color: '#3dd6c5' },
  chorus: { name: '副歌', color: '#ff7a6b' },
  bridge: { name: '橋段', color: '#a78bfa' },
  outro: { name: '結尾', color: '#ffb547' },
};

export const SECTION_TYPE_IDS = Object.keys(SECTION_TYPES);
export const MAX_SECTION_BARS = 128;

let idCounter = 0;
export function newSectionId() {
  idCounter += 1;
  return `s${Date.now().toString(36)}${idCounter}`;
}

export function makeSection(type = 'verse', bars = 8, clips = {}) {
  const c = {};
  for (const t of TRACK_IDS) c[t] = clips[t] ?? null;
  return { id: newSectionId(), type, bars, clips: c };
}

export function songTotalBars(song) {
  return (song?.sections || []).reduce((sum, s) => sum + s.bars, 0);
}

export function sectionStartBar(song, index) {
  let bar = 0;
  for (let i = 0; i < index && i < song.sections.length; i++) bar += song.sections[i].bars;
  return bar;
}

export function locateBar(song, bar) {
  let start = 0;
  for (let i = 0; i < song.sections.length; i++) {
    const s = song.sections[i];
    if (bar < start + s.bars) return { index: i, section: s, barInSection: bar - start, start };
    start += s.bars;
  }
  return null;
}

export function planSongBar(song, bar, bank) {
  const loc = locateBar(song, bar);
  if (!loc) return null;
  const { section, barInSection } = loc;
  const tracks = {};
  for (const t of TRACK_IDS) {
    const idx = section.clips[t];
    const clip = idx === null || idx === undefined ? null : bank.tracks[t][idx];
    const off = section.offsets?.[t] || 0;
    tracks[t] = clip ? { clip: idx, clipBar: mod(barInSection + off, clip.bars) } : null;
  }
  return { tracks, harmonyBar: (section.hOff || 0) + barInSection, section: loc.index };
}

export function songHasTypes(song, types) {
  const have = new Set(song.sections.map((s) => s.type));
  return types.every((t) => have.has(t));
}

// 把錄下的每小節狀態壓成段落
export function recordingToSections(entries, bank) {
  const isEmpty = (p) => TRACK_IDS.every((t) => !p.tracks[t]);
  let list = entries.slice();
  while (list.length && isEmpty(list[0].plan)) list.shift();
  while (list.length && isEmpty(list[list.length - 1].plan)) list.pop();
  const progLen = bank.defaultProg.length;
  const sections = [];
  let cur = null;
  for (const e of list) {
    const p = e.plan;
    let continues = !!cur;
    if (cur) {
      for (const t of TRACK_IDS) {
        const a = cur.clips[t];
        const tp = p.tracks[t];
        if ((a === null) !== !tp) { continues = false; break; }
        if (!tp) continue;
        if (a !== tp.clip) { continues = false; break; }
        const clip = bank.tracks[t][a];
        if (mod(cur.offsets[t] + cur.bars, clip.bars) !== tp.clipBar) { continues = false; break; }
      }
      if (continues && !p.tracks.chords && mod(cur.hOff + cur.bars - p.harmonyBar, progLen) !== 0) continues = false;
    }
    if (continues && cur.bars < MAX_SECTION_BARS) {
      cur.bars += 1;
    } else {
      cur = makeSection('verse', 1);
      cur.offsets = {};
      for (const t of TRACK_IDS) {
        const tp = p.tracks[t];
        cur.clips[t] = tp ? tp.clip : null;
        cur.offsets[t] = tp ? tp.clipBar : 0;
      }
      cur.hOff = mod(p.harmonyBar, progLen);
      sections.push(cur);
    }
  }
  labelSections(sections, bank);
  return sections;
}

export function sectionEnergy(section, bank) {
  let e = 0;
  for (const t of TRACK_IDS) {
    const idx = section.clips[t];
    if (idx !== null && idx !== undefined && bank.tracks[t][idx]) e += 0.5 + bank.tracks[t][idx].energy;
  }
  return e;
}

function labelSections(sections, bank) {
  if (!sections.length) return;
  const energies = sections.map((s) => sectionEnergy(s, bank));
  const max = Math.max(...energies);
  sections.forEach((s, i) => {
    if (i === 0 && sections.length > 1) s.type = 'intro';
    else if (i === sections.length - 1 && sections.length > 2) s.type = 'outro';
    else if (energies[i] >= max - 0.3) s.type = 'chorus';
    else s.type = 'verse';
  });
}

// 一鍵排歌：用片段的能量高低排出一首完整的歌
export function autoArrange(bank) {
  const pick = (track, roles) => {
    const clips = bank.tracks[track];
    for (const r of roles) {
      const c = clips.find((x) => x.style === r);
      if (c) return c.index;
    }
    return 0;
  };
  const d = (r) => pick('drums', r);
  const b = (r) => pick('bass', r);
  const l = (r) => pick('lead', r);
  const fxIdx = (kinds) => pick('fx', kinds);
  const chordsMain = 0;
  const chordsAlt = bank.tracks.chords.findIndex((c, i) => i > 0 && c.bars === 4);
  const altC = chordsAlt > 0 ? chordsAlt : 1;
  return {
    sections: [
      makeSection('intro', 4, { drums: d(['light']), chords: chordsMain, fx: fxIdx(['crackle', 'rain', 'sweep', 'swell']) }),
      makeSection('verse', 8, { drums: d(['main']), bass: b(['main']), chords: chordsMain, lead: l(['sparse']) }),
      makeSection('chorus', 8, { drums: d(['busy', 'peak']), bass: b(['busy', 'octave']), chords: altC, lead: l(['hook']), fx: fxIdx(['sparkle', 'chop', 'arpEcho']) }),
      makeSection('verse', 8, { drums: d(['mainB', 'main']), bass: b(['mainB', 'main']), chords: chordsMain, lead: l(['call', 'counter']) }),
      makeSection('bridge', 4, { drums: d(['half']), bass: b(['sustain']), chords: altC, lead: l(['arp']), fx: fxIdx(['riser', 'revcym']) }),
      makeSection('chorus', 8, { drums: d(['peak', 'busy']), bass: b(['busy', 'octave']), chords: altC, lead: l(['hook']), fx: fxIdx(['impact', 'sparkle']) }),
      makeSection('outro', 4, { drums: d(['light']), chords: chordsMain, fx: fxIdx(['swell', 'down', 'crackle']) }),
    ],
  };
}
