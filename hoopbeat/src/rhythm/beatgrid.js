// 拍點格線（beat grid）：記錄「第幾拍在什麼時間」。
// 純邏輯，不碰音訊，可以在 Node 裡測試。
// 速度可以在小節線上改變（例如換成另一隊的配樂），所以用「速度段落」串起來。

export const BEATS_PER_BAR = 4;

export class BeatGrid {
  constructor(beatsPerBar = BEATS_PER_BAR) {
    this.beatsPerBar = beatsPerBar;
    this.segments = []; // { time, bpm, beat }：從 time 開始、第 beat 拍起，速度是 bpm
  }

  // 從頭開始：time 這個時間點是第 0 拍
  reset(time, bpm) {
    this.segments = [{ time, bpm, beat: 0 }];
  }

  // 從第 beat 拍開始改成新的速度（beat 要落在拍點上）
  setTempoAtBeat(beat, bpm) {
    if (!this.segments.length) throw new Error('BeatGrid 還沒 reset');
    const time = this.beatTime(beat);
    // 丟掉這一拍之後的舊段落
    this.segments = this.segments.filter((s) => s.beat < beat);
    this.segments.push({ time, bpm, beat });
  }

  segmentForBeat(beat) {
    let seg = this.segments[0];
    for (const s of this.segments) if (s.beat <= beat) seg = s;
    return seg;
  }

  segmentForTime(time) {
    let seg = this.segments[0];
    for (const s of this.segments) if (s.time <= time + 1e-9) seg = s;
    return seg;
  }

  interval(bpm) {
    return 60 / bpm;
  }

  beatTime(beat) {
    const s = this.segmentForBeat(beat);
    return s.time + (beat - s.beat) * (60 / s.bpm);
  }

  bpmAt(time) {
    return this.segmentForTime(time).bpm;
  }

  // 連續的拍數（可以有小數），例如 3.5 = 第 3 拍和第 4 拍中間
  beatPosition(time) {
    const s = this.segmentForTime(time);
    return s.beat + (time - s.time) / (60 / s.bpm);
  }

  // 最接近 time 的拍點
  nearest(time) {
    const pos = this.beatPosition(time);
    const lo = Math.floor(pos);
    const cands = [lo - 1, lo, lo + 1, lo + 2];
    let best = null;
    for (const b of cands) {
      const t = this.beatTime(b);
      const d = Math.abs(time - t);
      if (!best || d < best.dist) best = { beat: b, time: t, dist: d };
    }
    return this.describe(best.beat);
  }

  describe(beat) {
    const s = this.segmentForBeat(beat);
    const inBar = ((beat % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar;
    return {
      beat,
      time: this.beatTime(beat),
      bpm: s.bpm,
      interval: 60 / s.bpm,
      beatInBar: inBar,
      bar: Math.floor(beat / this.beatsPerBar),
      downbeat: inBar === 0,
      // 4/4 拍的強拍：第 1 拍和第 3 拍
      strong: inBar === 0 || inBar === 2,
    };
  }

  // 拍子相位：0 = 剛好在拍點上，接近 1 = 快到下一拍。畫節拍圈用。
  phase(time) {
    const pos = this.beatPosition(time);
    return pos - Math.floor(pos);
  }

  // 下一個（或同一個）拍點；strongOnly 時只找強拍
  nextBeat(time, { strongOnly = false } = {}) {
    let b = Math.ceil(this.beatPosition(time) - 1e-6);
    for (let i = 0; i < 8; i++, b++) {
      const d = this.describe(b);
      if (!strongOnly || d.strong) return d;
    }
    return this.describe(b);
  }
}
