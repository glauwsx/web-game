// 用 OfflineAudioContext 把整首歌算出來。

import { buildGraph, effectiveGains } from './mixer.js';
import { scheduleBar } from './player.js';
import { planSongBar, songTotalBars } from './song.js';
import { GENRES, TRACK_IDS } from './genres.js';
import { barDuration } from './generator.js';
import { encodeWav, analyzeChannels } from './wav.js';

export const EXPORT_SAMPLE_RATE = 44100;
export const TAIL_SECONDS = 2;

export function expectedFrames(bank, song, tail, sampleRate = EXPORT_SAMPLE_RATE) {
  const bars = songTotalBars(song);
  return Math.ceil((bars * barDuration(bank.bpm) + tail) * sampleRate);
}

export async function renderSong({ bank, song, mixer, tail = TAIL_SECONDS, sampleRate = EXPORT_SAMPLE_RATE, only = null, onProgress, raw = false }) {
  const bars = songTotalBars(song);
  if (!bars) throw new Error('編曲是空的，先新增段落');
  const barDur = barDuration(bank.bpm);
  const length = expectedFrames(bank, song, tail, sampleRate);
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new OAC(2, length, sampleRate);
  const graph = buildGraph(ctx, { raw });
  graph.setGenre(GENRES[bank.genre].sound, bank.bpm);
  let mix = mixer;
  if (only) {
    mix = {};
    for (const t of TRACK_IDS) mix[t] = { ...(mixer[t] || { vol: 0.8 }), mute: false, solo: t === only };
  }
  const gains = graph.applyMixer(mix);
  const audible = (t) => gains[t] > 0;
  const run = graph.newRun();
  const scheduleRange = (b0, b1) => {
    for (let b = b0; b < b1; b++) {
      const plan = planSongBar(song, b, bank);
      if (plan) scheduleBar({ graph, run, bank, plan, time: b * barDur, audible });
    }
  };
  const CHUNK = 4;
  if (typeof ctx.suspend === 'function' && bars > CHUNK) {
    scheduleRange(0, CHUNK);
    for (let b = CHUNK; b < bars; b += CHUNK) {
      const frame = Math.floor((Math.max(0.01, b * barDur - 0.5) * sampleRate) / 128) * 128;
      const at = frame / sampleRate;
      const from = b;
      ctx.suspend(at).then(() => {
        scheduleRange(from, Math.min(from + CHUNK, bars));
        onProgress?.(from / bars);
        ctx.resume();
      });
    }
  } else {
    scheduleRange(0, bars);
  }
  const buffer = await ctx.startRendering();
  onProgress?.(1);
  return buffer;
}

export function bufferToWav(buffer) {
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  return {
    wav: encodeWav(channels, buffer.sampleRate),
    stats: { ...analyzeChannels(channels), frames: buffer.length, duration: buffer.length / buffer.sampleRate, sampleRate: buffer.sampleRate },
  };
}
