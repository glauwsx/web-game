// 輕度遊戲元素：挑戰與徽章。

import { songHasTypes, songTotalBars } from './song.js';

export const CHALLENGES = [
  {
    id: 'first-loop', icon: '🎵', title: '第一個 Loop', desc: '點一個片段，讓它開始播放',
    check: (s) => s.stats.launches >= 1,
  },
  {
    id: 'groove', icon: '🥁', title: '節奏組', desc: '讓鼓和貝斯同時播放',
    check: (s) => !!(s.live.drums && s.live.bass),
  },
  {
    id: 'full-band', icon: '🎚️', title: '全員到齊', desc: '五軌同時播放',
    check: (s) => ['drums', 'bass', 'chords', 'lead', 'fx'].every((t) => s.live[t]),
    progress: (s) => `${['drums', 'bass', 'chords', 'lead', 'fx'].filter((t) => s.live[t]).length} / 5 軌`,
  },
  {
    id: 'mixer', icon: '🎛️', title: '混音師', desc: '用過一次獨奏，也用過一次靜音',
    check: (s) => s.stats.usedSolo && s.stats.usedMute,
  },
  {
    id: 'song32', icon: '🏆', title: '完整的歌', desc: '做一首有前奏和副歌、至少 32 小節的歌',
    check: (s) => songHasTypes(s.song, ['intro', 'chorus']) && songTotalBars(s.song) >= 32,
    progress: (s) => {
      const parts = [];
      if (!songHasTypes(s.song, ['intro'])) parts.push('缺前奏');
      if (!songHasTypes(s.song, ['chorus'])) parts.push('缺副歌');
      parts.push(`${songTotalBars(s.song)} / 32 小節`);
      return parts.join('・');
    },
  },
  {
    id: 'story', icon: '📖', title: '起承轉合', desc: '一首歌裡有前奏、主歌、副歌、橋段、結尾',
    check: (s) => songHasTypes(s.song, ['intro', 'verse', 'chorus', 'bridge', 'outro']),
    progress: (s) => `${new Set(s.song.sections.map((x) => x.type)).size} / 5 種段落`,
  },
  {
    id: 'live', icon: '🔴', title: '現場演出', desc: '錄下至少 8 小節的演奏',
    check: (s) => s.stats.recordedBars >= 8,
    progress: (s) => `最長 ${s.stats.recordedBars} / 8 小節`,
  },
  {
    id: 'explorer', icon: '🧭', title: '曲風旅人', desc: '試過 3 種曲風',
    check: (s) => s.stats.genres.length >= 3,
    progress: (s) => `${s.stats.genres.length} / 3 種`,
  },
  {
    id: 'remix', icon: '🎲', title: '重新洗牌', desc: '單獨重新生成一軌',
    check: (s) => s.stats.trackRegens >= 1,
  },
  {
    id: 'export', icon: '💿', title: '出片了！', desc: '把一首歌匯出成 WAV',
    check: (s) => s.stats.exports >= 1,
  },
];

export function defaultStats() {
  return { launches: 0, usedSolo: false, usedMute: false, recordedBars: 0, genres: [], trackRegens: 0, exports: 0 };
}

// 回傳這次新解鎖的挑戰
export function evaluate(state, unlocked) {
  const fresh = [];
  for (const c of CHALLENGES) {
    if (unlocked[c.id]) continue;
    let ok = false;
    try { ok = !!c.check(state); } catch (e) { ok = false; }
    if (ok) {
      unlocked[c.id] = Date.now();
      fresh.push(c);
    }
  }
  return fresh;
}
