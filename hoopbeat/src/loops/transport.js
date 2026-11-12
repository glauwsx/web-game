// 拍子與量化排程（純邏輯，不碰音訊，可以在 Node 裡測試）。
// 規則：使用者點片段 → 排入佇列 → 下一個還沒排程的小節線才開始播。

import { mod } from './theory.js';

export class Scheduler {
  // getBarDur(bar) 回傳該小節長度（秒）；onBar(bar, time, dur) 排程一個小節
  constructor({ lookahead = 0.15, getBarDur, onBar }) {
    this.lookahead = lookahead;
    this.getBarDur = getBarDur;
    this.onBar = onBar;
    this.running = false;
    this.nextBar = 0;
    this.nextBarTime = 0;
  }

  start(time, firstBar = 0) {
    this.running = true;
    this.nextBar = firstBar;
    this.nextBarTime = time;
  }

  stop() {
    this.running = false;
  }

  tick(now) {
    let guard = 0;
    while (this.running && this.nextBarTime < now + this.lookahead && guard++ < 64) {
      const bar = this.nextBar;
      const time = this.nextBarTime;
      const dur = this.getBarDur(bar);
      const result = this.onBar(bar, time, dur);
      this.nextBar = bar + 1;
      this.nextBarTime = time + dur;
      if (result === 'stop') this.running = false;
    }
  }
}

// 現場演奏的狀態：每軌最多一個正在播的片段，加上最多一個等待中的指令。
export class LiveState {
  constructor(trackIds) {
    this.trackIds = trackIds;
    this.active = {};
    this.pending = {};
    this.harmonyOffset = 0;
    for (const t of trackIds) {
      this.active[t] = null;
    }
  }

  queue(track, clip) {
    const a = this.active[track];
    // 再點一次正在播的片段：取消等待中的切換
    if (a && a.clip === clip && this.pending[track] && !this.pending[track].stop) {
      delete this.pending[track];
      return;
    }
    this.pending[track] = { clip };
  }

  queueStop(track) {
    if (!this.active[track]) {
      delete this.pending[track];
      return;
    }
    this.pending[track] = { stop: true };
  }

  cancel(track) {
    delete this.pending[track];
  }

  clear() {
    for (const t of this.trackIds) this.active[t] = null;
    this.pending = {};
    this.harmonyOffset = 0;
  }

  hasAnything() {
    return this.trackIds.some((t) => this.active[t] || (this.pending[t] && !this.pending[t].stop));
  }

  // 在小節線上套用等待中的指令。回傳這個小節開始的片段。
  advance(bar) {
    const launched = [];
    for (const t of this.trackIds) {
      const p = this.pending[t];
      if (!p) continue;
      if (p.stop) this.active[t] = null;
      else {
        this.active[t] = { clip: p.clip, launchBar: bar, offset: 0 };
        launched.push({ track: t, clip: p.clip, bar });
      }
      delete this.pending[t];
    }
    return launched;
  }

  // 從歌曲模式切回現場模式時，讓片段接續播放，不要從頭開始
  adopt(prevPlan, bar, bank) {
    for (const t of this.trackIds) {
      const tp = prevPlan?.tracks?.[t];
      const clip = tp ? bank.tracks[t][tp.clip] : null;
      this.active[t] = clip ? { clip: tp.clip, launchBar: bar, offset: (tp.clipBar + 1) % clip.bars } : null;
    }
    this.harmonyOffset = prevPlan ? prevPlan.harmonyBar + 1 - bar : 0;
  }

  plan(bar, bank) {
    const tracks = {};
    for (const t of this.trackIds) {
      const a = this.active[t];
      const clip = a ? bank.tracks[t][a.clip] : null;
      tracks[t] = clip ? { clip: a.clip, clipBar: mod(bar - a.launchBar + a.offset, clip.bars) } : null;
    }
    return { tracks, harmonyBar: bar + this.harmonyOffset };
  }
}

// 某個時間點之後，第一個「還來得及排程」的小節線
export function nextLaunchBar(now, startTime, barDur, lookahead) {
  return Math.max(0, Math.ceil((now + lookahead - startTime) / barDur - 1e-9));
}
