// 音樂特徵：直接從 loop station 的資料算，不分析音訊。
// 輸入一個「配樂台」(deck)：片段庫 bank、每軌正在播哪個片段、音量、上次換片段的小節。
// 輸出 0～1 的特徵值，給 effects.js 換算成球員表現。

export const TRACK_IDS = ['drums', 'bass', 'chords', 'lead', 'fx'];

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// 鼓的打點中，哪些算「骨架」（大鼓、小鼓、拍手），用來算切分音
const BACKBONE = new Set(['kick', 'snare', 'clap', 'bigsnare', 'rim']);

// 一軌的音量（0～1）。沒在播或靜音 = 0。
export function trackLevel(deck, t) {
  if (deck.active?.[t] === null || deck.active?.[t] === undefined) return 0;
  const m = deck.mixer?.[t];
  if (m?.mute) return 0;
  const vol = m?.vol ?? 0.8;
  return clamp01(vol / 0.8);
}

export function activeClip(deck, t) {
  const idx = deck.active?.[t];
  if (idx === null || idx === undefined) return null;
  return deck.bank?.tracks?.[t]?.[idx] || null;
}

// 每小節幾個鼓點
export function drumNotesPerBar(clip) {
  if (!clip || !clip.notes?.length) return 0;
  return clip.notes.length / (clip.bars || 1);
}

// 切分音比例：骨架打點中，不落在四分音符上的比例（16 分音符格子，s % 4 !== 0）
export function syncopation(drumClip, bassClip) {
  const ons = [];
  if (drumClip) for (const n of drumClip.notes) if (BACKBONE.has(n.d)) ons.push(n.s);
  if (bassClip) for (const n of bassClip.notes) ons.push(n.s);
  if (!ons.length) return 0;
  const off = ons.filter((s) => Math.abs(s - Math.round(s / 4) * 4) > 0.25).length;
  return off / ons.length;
}

// 主旋律的音符密度：每小節幾個音
export function noteDensity(clip) {
  if (!clip || !clip.notes?.length) return 0;
  return clip.notes.length / (clip.bars || 1);
}

// 速度 → -1（很慢）～ +1（很快），120 BPM = 0
export function tempoValue(bpm) {
  return Math.max(-1, Math.min(1, (bpm - 120) / 50));
}

// 新鮮度：同一組片段播超過 8 小節開始疲乏，32 小節後完全疲乏
export const FRESH_BARS = 8;
export const STALE_BARS = 32;
export function freshness(barsSinceChange) {
  if (barsSinceChange <= FRESH_BARS) return 1;
  return clamp01(1 - (barsSinceChange - FRESH_BARS) / (STALE_BARS - FRESH_BARS));
}

export function computeFeatures(deck, bar = 0) {
  const bpm = deck.bpm ?? deck.bank?.bpm ?? 120;
  const levels = {};
  for (const t of TRACK_IDS) levels[t] = trackLevel(deck, t);
  const clips = {};
  for (const t of TRACK_IDS) clips[t] = levels[t] > 0 ? activeClip(deck, t) : null;

  const activeCount = TRACK_IDS.filter((t) => levels[t] > 0.05).length;

  // 鼓的密度：每小節 6 點以下 = 0，28 點以上 = 1
  const dpb = drumNotesPerBar(clips.drums);
  const drumDensity = clamp01((dpb - 6) / 22) * levels.drums;

  // 各片段自帶的能量（生成器給的 0～1），用音量加權
  let eSum = 0;
  let wSum = 0;
  for (const t of TRACK_IDS) {
    if (!clips[t]) continue;
    eSum += (clips[t].energy ?? 0.5) * levels[t];
    wSum += levels[t];
  }
  const clipEnergy = wSum ? eSum / wSum : 0;
  const energy = clamp01(0.3 * (activeCount / 5) + 0.4 * drumDensity + 0.3 * clipEnergy * Math.min(1, wSum / 2));

  // 律動：搖擺感 + 切分音
  const swing = deck.bank?.swing ?? 0.5;
  const swingNorm = clamp01((swing - 0.5) / 0.12);
  const synco = syncopation(clips.drums, clips.bass);
  let groove = clamp01(0.5 * swingNorm + 0.5 * Math.min(1, synco * 1.6));
  if (!clips.drums) groove *= 0.4;

  const harmony = clamp01(levels.chords);
  const leadDens = clamp01(noteDensity(clips.lead) / 8);
  const melody = clips.lead ? clamp01(levels.lead * (0.6 + 0.4 * leadDens)) : 0;
  const bass = clips.bass ? clamp01(levels.bass * (0.6 + 0.4 * (clips.bass.energy ?? 0.5))) : 0;
  const fx = levels.fx;

  const lastChange = deck.lastChangeBar ?? 0;
  const barsSinceChange = Math.max(0, bar - lastChange);
  const fresh = freshness(barsSinceChange);

  return {
    bpm,
    tempo: tempoValue(bpm),
    energy,
    drumDensity,
    drumNotesPerBar: dpb,
    groove,
    swing,
    syncopation: synco,
    harmony,
    melody,
    bass,
    fx,
    activeCount,
    levels,
    barsSinceChange,
    freshness: fresh,
    silent: activeCount === 0,
  };
}

// 這次切換是不是落在「段落交界」：4 小節一句，在句首換片段可以提振士氣
export function isPhraseBoundary(bar, phraseBars = 4) {
  return bar % phraseBars === 0;
}
