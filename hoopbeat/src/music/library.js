// 我的歌：存在瀏覽器（localStorage）。也可以讀 Loop 工坊（loops/）存的專案。
import { parseProject } from '../loops/project.js';
import { demoSong } from './demos.js';

const KEY = 'hoopbeat.songs.v1';
const LOOPS_SAVED = 'loops.saved.v1';

export function loadSongs() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((s) => s && s.bank && s.song) : [];
  } catch (e) {
    return [];
  }
}

export function saveSong(entry) {
  const list = loadSongs().filter((s) => s.id !== entry.id);
  list.unshift(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12)));
    return true;
  } catch (e) {
    return false;
  }
}

export function deleteSong(id) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadSongs().filter((s) => s.id !== id)));
  } catch (e) { /* ignore */ }
}

export function newSongId() {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

// 同一個網站上的 Loop 工坊存過的專案（有的話）
export function loadLoopsProjects() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOOPS_SAVED) || '[]');
    const arr = Array.isArray(raw) ? raw : Object.values(raw || {});
    const out = [];
    for (const item of arr) {
      try {
        const p = parseProject(item.project || item);
        if (p.song?.sections?.length) out.push({ id: `loops-${out.length}`, name: p.name || 'Loop 工坊的歌', bank: p.bank, song: p.song, bpm: p.bank.bpm, mixer: p.mixer || {} });
      } catch (e) { /* 格式不對就跳過 */ }
    }
    return out;
  } catch (e) {
    return [];
  }
}

// 匯入 Loop 工坊匯出的 .json 專案檔
export function songFromProjectJson(text) {
  const p = parseProject(text);
  return { id: newSongId(), name: p.name || '匯入的歌', bank: p.bank, song: p.song, bpm: p.bank.bpm, mixer: p.mixer || {} };
}

// 歌曲代號 → { name, bank, song, bpm, mixer }。代號：示範歌 id、my:<我的歌 id>、lp:<Loop 工坊第幾首>
export function resolveSong(id, bpm = null) {
  if (id && id.startsWith('my:')) {
    const mine = loadSongs().find((s) => s.id === id.slice(3));
    if (mine) return { name: mine.name, bank: mine.bank, song: mine.song, bpm: bpm ?? mine.bpm ?? mine.bank.bpm, mixer: mine.mixer || {} };
  }
  if (id && id.startsWith('lp:')) {
    const lp = loadLoopsProjects()[Number(id.slice(3))];
    if (lp) return { ...lp, bpm: bpm ?? lp.bpm };
  }
  return demoSong(id, bpm ?? undefined);
}
