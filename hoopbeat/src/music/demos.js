// 示範歌：用 loops 的生成器 + 一鍵排歌產生，不用另外存音檔。

import { generateBank } from '../loops/generator.js';
import { autoArrange } from '../loops/song.js';
import { GENRES } from '../loops/genres.js';

export const DEMOS = [
  { id: 'lofi80', name: '午後慢投', genre: 'lofi', seed: 'hoop-1', bpm: 80, blurb: '慢、穩，挑好球再出手' },
  { id: 'synth104', name: '霓虹夜賽', genre: 'synthwave', seed: 'hoop-4', bpm: 104, blurb: '中慢速，鋪底厚，傳導好' },
  { id: 'house120', name: '主場浩室', genre: 'house', seed: 'hoop-2', bpm: 120, blurb: '基準速度，什麼都平均' },
  { id: 'rock128', name: '熱血搖滾', genre: 'poprock', seed: 'hoop-5', bpm: 128, blurb: '稍快，主旋律亮' },
  { id: 'trap150', name: '地下陷阱', genre: 'trap', seed: 'hoop-3', bpm: 150, blurb: '快、重低音，防守兇' },
  { id: 'chip170', name: '極速電玩', genre: 'chip', seed: 'hoop-6', bpm: 170, blurb: '非常快，跑很兇但很急躁' },
];

export function demoSong(id, bpmOverride) {
  const d = DEMOS.find((x) => x.id === id) || DEMOS[2];
  const bank = generateBank({ genre: d.genre, seed: d.seed });
  const song = autoArrange(bank);
  return { name: d.name, demoId: d.id, bank, song, bpm: bpmOverride ?? d.bpm, mixer: {} };
}

// 同一首歌、不同速度（BPM 實驗用）
export function songAtBpm(genre, seed, bpm) {
  const bank = generateBank({ genre, seed });
  return { name: `${GENRES[genre].name} ${bpm}`, bank, song: autoArrange(bank), bpm, mixer: {} };
}
