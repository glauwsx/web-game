// 專案存檔：JSON 格式，可以存在瀏覽器（localStorage），也可以下載成檔案。

import { GENRES, TRACK_IDS } from './genres.js';
import { CLIPS_PER_TRACK } from './generator.js';
import { SECTION_TYPES, MAX_SECTION_BARS, newSectionId } from './song.js';

export const PROJECT_FORMAT = 'loops-workshop-project';
export const PROJECT_VERSION = 1;

export const STORAGE_KEYS = {
  autosave: 'loops.autosave.v1',
  saved: 'loops.saved.v1',
  progress: 'loops.progress.v1',
};

export function serializeProject({ name, bank, song, mixer }) {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    name: name || '我的歌',
    bank,
    song: { sections: song.sections.map((s) => ({ ...s })) },
    mixer,
  };
}

function fail(msg) {
  throw new Error(`專案檔格式不對：${msg}`);
}

// 檢查並整理讀進來的專案。格式不對就丟出錯誤（訊息是中文，可以直接顯示）。
export function parseProject(obj) {
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) { fail('不是有效的 JSON'); }
  }
  if (!obj || obj.format !== PROJECT_FORMAT) fail('這不是 Loop 工坊的專案檔');
  const { bank } = obj;
  if (!bank || !GENRES[bank.genre]) fail('曲風不明');
  if (typeof bank.bpm !== 'number' || bank.bpm < 40 || bank.bpm > 240) fail('速度不合理');
  if (!bank.key || typeof bank.key.tonic !== 'number') fail('缺少調性');
  for (const t of TRACK_IDS) {
    const clips = bank.tracks?.[t];
    if (!Array.isArray(clips) || clips.length === 0 || clips.length > CLIPS_PER_TRACK) fail(`「${t}」軌的片段不對`);
    for (const c of clips) {
      if (![1, 2, 4].includes(c.bars)) fail('片段長度只能是 1、2、4 小節');
    }
  }
  const sections = (obj.song?.sections || []).map((s) => {
    if (!SECTION_TYPES[s.type]) fail(`不認得的段落類型：${s.type}`);
    const bars = Math.round(Number(s.bars));
    if (!(bars >= 1 && bars <= MAX_SECTION_BARS)) fail('段落長度不合理');
    const clips = {};
    for (const t of TRACK_IDS) {
      const v = s.clips?.[t];
      clips[t] = v === null || v === undefined || !bank.tracks[t][v] ? null : v;
    }
    const out = { id: s.id || newSectionId(), type: s.type, bars, clips };
    if (s.offsets) out.offsets = s.offsets;
    if (s.hOff) out.hOff = s.hOff;
    return out;
  });
  const mixer = {};
  for (const t of TRACK_IDS) {
    const m = obj.mixer?.[t] || {};
    mixer[t] = { vol: typeof m.vol === 'number' ? Math.min(1, Math.max(0, m.vol)) : 0.8, mute: !!m.mute, solo: !!m.solo };
  }
  return { name: String(obj.name || '我的歌').slice(0, 60), bank, song: { sections }, mixer };
}

export function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function safeFilename(name) {
  return (name || 'loops').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'loops';
}
