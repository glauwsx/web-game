// 指揮：管兩台配樂台、決定現在播哪一台、維護拍點格線。
// 純邏輯。瀏覽器裡用音訊時鐘驅動並真的發聲；無頭模擬時用模擬時間驅動、不發聲。
// 規則：播「進攻方」的歌。換邊時在下一個小節線切換（速度也跟著換）。

import { BeatGrid, BEATS_PER_BAR } from '../rhythm/beatgrid.js';

export class Conductor {
  constructor(decks) {
    this.decks = decks; // { home: Deck, away: Deck }
    this.grid = new BeatGrid(BEATS_PER_BAR);
    this.audible = Object.keys(decks)[0];
    this.nextAudible = null;
    this.running = false;
    this.nextBar = 0;
    this.nextBarTime = 0;
    this.curBpm = null;
    this.timeline = [];
    this.listeners = [];
  }

  onBar(fn) {
    this.listeners.push(fn);
  }

  start(time, deckId = this.audible) {
    this.audible = deckId;
    this.nextAudible = null;
    const bpm = this.decks[deckId].bpm;
    this.grid.reset(time, bpm);
    this.curBpm = bpm;
    this.nextBar = 0;
    this.nextBarTime = time;
    this.running = true;
    this.timeline = [];
  }

  stop() {
    this.running = false;
    for (const d of Object.values(this.decks)) d.playing = false;
  }

  // 換成另一隊的歌（下一個還沒排程的小節線生效）
  setAudible(deckId) {
    if (deckId === this.audible && this.nextAudible === null) return;
    this.nextAudible = deckId === this.audible ? null : deckId;
  }

  get pendingSwitch() {
    return this.nextAudible;
  }

  // 排程到 now + lookahead。schedule(deck, result, time, dur, bar) 由呼叫端決定要不要發聲。
  tick(now, lookahead = 0.15, schedule = null) {
    let guard = 0;
    while (this.running && this.nextBarTime < now + lookahead && guard++ < 64) {
      if (this.nextAudible !== null) {
        this.audible = this.nextAudible;
        this.nextAudible = null;
      }
      const deck = this.decks[this.audible];
      const bar = this.nextBar;
      const time = this.nextBarTime;
      if (deck.bpm !== this.curBpm) {
        this.grid.setTempoAtBeat(bar * BEATS_PER_BAR, deck.bpm);
        this.curBpm = deck.bpm;
      }
      for (const d of Object.values(this.decks)) d.playing = d === deck;
      const dur = (60 / deck.bpm) * BEATS_PER_BAR;
      const res = deck.advanceBar(time);
      const entry = { bar, time, dur, deck: this.audible, section: res.section, sectionType: res.sectionType, changed: res.changed, boosted: res.boosted };
      this.timeline.push(entry);
      if (this.timeline.length > 24) this.timeline.shift();
      if (schedule) schedule(deck, res, time, dur, bar);
      for (const fn of this.listeners) fn(entry, res);
      this.nextBar = bar + 1;
      this.nextBarTime = time + dur;
    }
  }

  // 某個時間點正在播的小節
  entryAt(time) {
    let cur = null;
    for (const e of this.timeline) if (e.time <= time + 1e-9) cur = e;
    return cur;
  }

  bpmAt(time) {
    return this.grid.segments.length ? this.grid.bpmAt(time) : this.decks[this.audible].bpm;
  }
}
