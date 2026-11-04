// 拍點判定：按下的時間離拍點多近 → Perfect／Great／Good／Miss。
// 純邏輯，不碰音訊。時間一律用「音訊時鐘」的秒數。

export const GRADES = ['perfect', 'great', 'good', 'miss'];

export const GRADE_INFO = {
  perfect: { label: 'Perfect', zh: '完美', color: '#ffd84a', keepsCombo: true },
  great: { label: 'Great', zh: '很好', color: '#5ef0a0', keepsCombo: true },
  good: { label: 'Good', zh: '還行', color: '#6cc6ff', keepsCombo: true },
  miss: { label: 'Miss', zh: '沒踩到', color: '#ff6b6b', keepsCombo: false },
};

// 120 BPM 時的判定窗口（毫秒，單邊）。別的速度會依比例縮放。
export const DIFFICULTIES = {
  easy: { name: '簡單', perfect: 55, great: 95, good: 150 },
  normal: { name: '普通', perfect: 42, great: 78, good: 125 },
  hard: { name: '困難', perfect: 30, great: 58, good: 95 },
};

export const REFERENCE_BPM = 120;

// 速度越快，窗口越窄（毫秒）。拍點更密、更難踩準，這是「打得急躁」的一部分。
export function tempoWindowScale(bpm) {
  const s = Math.pow(REFERENCE_BPM / bpm, 0.85);
  return Math.min(1.4, Math.max(0.6, s));
}

export function windowsFor(difficulty = 'normal', bpm = REFERENCE_BPM) {
  const d = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const scale = tempoWindowScale(bpm);
  // Good 窗口最多到半拍的 80%，避免兩個拍點的窗口重疊
  const cap = (60000 / bpm / 2) * 0.8;
  const good = Math.min(d.good * scale, cap);
  const great = Math.min(d.great * scale, good * 0.75);
  const perfect = Math.min(d.perfect * scale, great * 0.65);
  return { perfect, great, good };
}

export function gradeForOffset(absMs, win) {
  if (absMs <= win.perfect) return 'perfect';
  if (absMs <= win.great) return 'great';
  if (absMs <= win.good) return 'good';
  return 'miss';
}

const DOWNGRADE = { perfect: 'great', great: 'good', good: 'good', miss: 'miss' };

// 判定一次按鍵。
//   pressTime：按下的時間（音訊時鐘，秒）
//   grid：BeatGrid
//   latencyMs：延遲校正。正值 = 「聽到拍子再按，記錄到的時間會晚這麼多」，判定前先扣掉。
//   strongOnly：投籃用。最佳出手點在強拍（第 1、3 拍）；踩在弱拍上最多只算 Great。
export function judge(pressTime, grid, { latencyMs = 0, difficulty = 'normal', strongOnly = false } = {}) {
  const t = pressTime - latencyMs / 1000;
  const nb = grid.nearest(t);
  const offsetMs = (t - nb.time) * 1000;
  const win = windowsFor(difficulty, nb.bpm);
  let grade = gradeForOffset(Math.abs(offsetMs), win);
  let weakBeat = false;
  if (strongOnly && !nb.strong && grade !== 'miss') {
    grade = DOWNGRADE[grade];
    weakBeat = true;
  }
  return {
    grade,
    offsetMs,
    early: offsetMs < 0,
    beat: nb.beat,
    beatTime: nb.time,
    strong: nb.strong,
    downbeat: nb.downbeat,
    weakBeat,
    bpm: nb.bpm,
    windows: win,
  };
}

// 延遲校正：玩家跟著節拍按幾下，取偏移的中位數（毫秒）。
// 回傳值可以直接當 latencyMs 用。
export function estimateLatency(pressTimes, grid) {
  const offs = pressTimes
    .map((p) => {
      const nb = grid.nearest(p);
      return (p - nb.time) * 1000;
    })
    .sort((a, b) => a - b);
  if (!offs.length) return 0;
  const mid = Math.floor(offs.length / 2);
  const med = offs.length % 2 ? offs[mid] : (offs[mid - 1] + offs[mid]) / 2;
  return Math.round(med);
}

// 節奏連擊：連續踩中累積，Miss 歸零。
export class Combo {
  constructor() {
    this.reset();
  }

  reset() {
    this.count = 0;
    this.max = 0;
    this.hits = { perfect: 0, great: 0, good: 0, miss: 0 };
  }

  register(grade) {
    this.hits[grade] = (this.hits[grade] || 0) + 1;
    if (GRADE_INFO[grade].keepsCombo) {
      this.count += 1;
      if (this.count > this.max) this.max = this.count;
    } else {
      this.count = 0;
    }
    return this.count;
  }

  // 連擊帶來的「手感」：0～1，連擊 16 下以上就滿
  feel() {
    return Math.min(1, this.count / 16);
  }

  accuracy() {
    const total = GRADES.reduce((s, g) => s + this.hits[g], 0);
    if (!total) return 0;
    return (this.hits.perfect + this.hits.great * 0.7 + this.hits.good * 0.4) / total;
  }
}
