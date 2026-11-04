// 配樂台（deck）：一隊一台。照著賽前拼好的歌一段一段播，
// 比賽中可以用十字鍵／肩鍵即時切換片段（在下一個小節線生效，跟 loop station 一樣）。
// 純邏輯，不碰音訊。

import { TRACK_IDS } from '../loops/genres.js';
import { locateBar, songTotalBars, sectionStartBar } from '../loops/song.js';
import { mod } from '../loops/theory.js';
import { computeFeatures } from './features.js';

export const PHRASE_BARS = 4;
export const MORALE_SECONDS = 8;

const keyOf = (clips) => TRACK_IDS.map((t) => (clips[t] === null || clips[t] === undefined ? '-' : clips[t])).join(',');

export class Deck {
  constructor({ id, name, bank, song, bpm, mixer = {} }) {
    this.id = id;
    this.name = name || id;
    this.bank = bank;
    this.song = song;
    this.bpm = bpm ?? bank.bpm;
    this.mixer = mixer;
    this.songBar = 0; // 在歌裡的位置（小節）
    this.barsPlayed = 0; // 這台實際播了幾個小節（沒在播的時候不前進）
    this.overrides = {}; // 現場切換：track → 片段編號或 null（關掉）
    this.pending = null; // 等下一個小節線才生效的指令
    this.lastChangeBar = 0;
    this.lastKey = null;
    this.moraleTime = -1e9;
    this.playing = false;
    this.cursor = 0; // 十字鍵選到的軌
    this.memory = {}; // 關掉之前的片段，再打開時用
    this.changes = 0;
    this.boosts = 0;
    this.log = [];
  }

  get totalBars() {
    return Math.max(1, songTotalBars(this.song));
  }

  sectionAt(songBar = this.songBar) {
    const loc = locateBar(this.song, mod(songBar, this.totalBars));
    return loc;
  }

  get sectionIndex() {
    return this.sectionAt()?.index ?? 0;
  }

  // 現在（或下一個小節）會播的片段組合
  clipsFor(songBar, overrides) {
    const loc = this.sectionAt(songBar);
    const out = {};
    for (const t of TRACK_IDS) {
      const base = loc ? loc.section.clips[t] : null;
      out[t] = t in overrides ? overrides[t] : base ?? null;
    }
    return out;
  }

  currentClips() {
    return this.clipsFor(this.songBar, this.overrides);
  }

  // 下一個小節會播的（含等待中的指令），給介面顯示
  upcomingClips() {
    const p = this.pending;
    let bar = this.songBar;
    let ov = this.overrides;
    if (p) {
      if (p.section !== undefined) {
        bar = sectionStartBar(this.song, p.section);
        ov = {};
      }
      ov = { ...ov, ...p.overrides };
    }
    return this.clipsFor(bar, ov);
  }

  ensurePending() {
    if (!this.pending) this.pending = { overrides: {} };
    return this.pending;
  }

  // ── 比賽中的控制 ──

  jumpSection(dir) {
    const n = this.song.sections.length;
    if (!n) return;
    const p = this.ensurePending();
    const from = p.section ?? this.sectionIndex;
    p.section = mod(from + dir, n);
    p.overrides = {};
    this.applyIfIdle();
  }

  cycleClip(track, dir = 1) {
    const up = this.upcomingClips();
    const n = this.bank.tracks[track].length;
    const cur = up[track];
    const next = cur === null || cur === undefined ? (dir > 0 ? 0 : n - 1) : mod(cur + dir, n);
    this.ensurePending().overrides[track] = next;
    this.applyIfIdle();
  }

  toggleTrack(track) {
    const up = this.upcomingClips();
    const cur = up[track];
    if (cur === null || cur === undefined) {
      const base = this.sectionAt()?.section.clips[track];
      this.ensurePending().overrides[track] = this.memory[track] ?? base ?? 0;
    } else {
      this.memory[track] = cur;
      this.ensurePending().overrides[track] = null;
    }
    this.applyIfIdle();
  }

  moveCursor(dir) {
    this.cursor = mod(this.cursor + dir, TRACK_IDS.length);
  }

  get cursorTrack() {
    return TRACK_IDS[this.cursor];
  }

  // 沒在播的台：指令立刻生效（沒有小節線可以對齊）
  applyIfIdle() {
    if (this.playing) return;
    this.applyPending();
    const key = keyOf(this.currentClips());
    if (key !== this.lastKey && this.lastKey !== null) {
      this.lastChangeBar = this.barsPlayed;
      this.changes += 1;
    }
    this.lastKey = key;
  }

  applyPending() {
    const p = this.pending;
    if (!p) return;
    if (p.section !== undefined) {
      this.songBar = sectionStartBar(this.song, p.section);
      this.overrides = {};
    }
    this.overrides = { ...this.overrides, ...p.overrides };
    this.pending = null;
  }

  // 在小節線上播一個小節。回傳給播放器的計畫（loops 的格式）。
  advanceBar(time = 0) {
    this.applyPending();
    const loc = this.sectionAt();
    const clips = this.currentClips();
    const key = keyOf(clips);
    let changed = false;
    let boosted = false;
    if (this.lastKey !== null && key !== this.lastKey) {
      changed = true;
      this.changes += 1;
      // 在樂句開頭（每 4 小節）換片段，而且不是一直狂換 → 士氣提振
      const onPhrase = mod(this.barsPlayed, PHRASE_BARS) === 0;
      if (onPhrase && this.barsPlayed - this.lastChangeBar >= PHRASE_BARS) {
        this.moraleTime = time;
        boosted = true;
        this.boosts += 1;
      }
      this.lastChangeBar = this.barsPlayed;
    }
    this.lastKey = key;
    const barInSection = loc ? loc.barInSection : 0;
    const tracks = {};
    for (const t of TRACK_IDS) {
      const idx = clips[t];
      const clip = idx === null || idx === undefined ? null : this.bank.tracks[t][idx];
      tracks[t] = clip ? { clip: idx, clipBar: mod(barInSection + (loc?.section.offsets?.[t] || 0), clip.bars) } : null;
    }
    const plan = { tracks, harmonyBar: (loc?.section.hOff || 0) + barInSection, section: loc?.index ?? 0 };
    const out = { plan, changed, boosted, bar: this.barsPlayed, section: loc?.index ?? 0, sectionType: loc?.section.type };
    this.songBar = mod(this.songBar + 1, this.totalBars);
    this.barsPlayed += 1;
    if (changed) {
      this.log.push({ bar: out.bar, time, boosted });
      if (this.log.length > 32) this.log.shift();
    }
    return out;
  }

  // 用 bpm 覆寫過的 bank，給播放器用
  playBank() {
    return this.bpm === this.bank.bpm ? this.bank : { ...this.bank, bpm: this.bpm };
  }

  morale(now) {
    const dt = now - this.moraleTime;
    if (dt < 0) return 0;
    return Math.max(0, 1 - dt / MORALE_SECONDS);
  }

  features() {
    return computeFeatures(
      { bank: this.bank, bpm: this.bpm, active: this.currentClips(), mixer: this.mixer, lastChangeBar: this.lastChangeBar },
      this.barsPlayed,
    );
  }

  barsToPhrase() {
    return mod(PHRASE_BARS - mod(this.barsPlayed, PHRASE_BARS), PHRASE_BARS);
  }
}
