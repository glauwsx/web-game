// 音樂播放器：把 data/music.js 的樂譜排進 Web Audio 的時間軸（往前多排 0.15 秒，計時器每 25 毫秒看一次）。
// 換曲時舊的淡出 0.4 秒。音訊還沒啟動（使用者還沒點過畫面）時什麼都不做。

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LOOKAHEAD = 0.15;
const TICK_MS = 25;
const FADE = 0.4;

/** 音名轉 MIDI 編號：'C4' → 60、'F#4' → 66、'Bb3' → 58。 */
export function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const midiFreq = (n) => 440 * 2 ** ((n - 69) / 12);

/** 把一行樂譜變成 [{ step, midi, len }]（len 以八分音符計）。 */
export function parseTrack(text) {
  const tokens = text.split(/\s+/).filter((x) => x && x !== '|');
  const out = [];
  tokens.forEach((tok, i) => {
    if (tok === '-') { if (out.length && out[out.length - 1].end === i) { out[out.length - 1].len++; out[out.length - 1].end++; } return; }
    if (tok === '.') return;
    const midi = noteToMidi(tok);
    if (midi !== null) out.push({ step: i, midi, len: 1, end: i + 1 });
  });
  return { notes: out.map(({ step, midi, len }) => ({ step, midi, len })), steps: tokens.length };
}

/** 由和弦根音和節奏型產生貝斯。 */
function buildBass(chords, pattern) {
  const pat = pattern.split(/\s+/).filter(Boolean);
  const notes = [];
  chords.forEach((root, bar) => {
    const r = noteToMidi(root);
    pat.forEach((p, i) => {
      if (p === '.') return;
      const midi = p === 'o' ? r + 12 : p === 'f' ? r + 7 : r;
      notes.push({ step: bar * pat.length + i, midi, len: 1 });
    });
  });
  return { notes, steps: chords.length * pat.length };
}

/** 把整首歌整理成每一步要播的東西。有快取。 */
const compiled = {};
export function compileSong(name, song) {
  if (compiled[name]) return compiled[name];
  const lead = parseTrack(song.lead);
  const bass = buildBass(song.chords, song.bassPattern);
  const drumTokens = song.drums.split(/\s+/).filter((x) => x && x !== '|');
  const steps = Math.max(lead.steps, bass.steps);
  const at = Array.from({ length: steps }, () => []);
  for (const n of lead.notes) at[n.step].push({ ch: 'lead', ...n });
  for (const n of bass.notes) at[n.step].push({ ch: 'bass', ...n });
  for (let i = 0; i < steps; i++) {
    const d = drumTokens[i % drumTokens.length];
    if (d && d !== '.') at[i].push({ ch: 'drum', kind: d });
  }
  compiled[name] = { steps, at, stepDur: 60 / song.bpm / 2, leadWave: song.leadWave || 'square' };
  return compiled[name];
}

/**
 * 建立播放器。audio 是 core/audio.js 的物件（要用它的 ctx 和 musicGain）。
 * songs 是 data/music.js 的 SONGS。
 */
export function createMusic(audio, songs) {
  let cur = null;   // { name, song, step, next, gain }
  let timer = 0;
  let noiseBuf = null;

  function noise(ctx) {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 777;
    for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
    return noiseBuf;
  }

  function voice(ctx, dest, wave, freq, t, dur, vol) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol * 0.7, t + Math.max(0.01, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  function drum(ctx, dest, kind, t) {
    if (kind === 'k') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = kind === 'h' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'h' ? 7000 : 1800;
    const g = ctx.createGain();
    const dur = kind === 'h' ? 0.03 : 0.1;
    g.gain.setValueAtTime(kind === 'h' ? 0.12 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function schedule() {
    const ctx = audio.ctx;
    if (!cur || !ctx || ctx.state !== 'running') return;
    const song = cur.song;
    // 分頁回到前景時時間跳很多：不補播，直接從現在開始
    if (cur.next < ctx.currentTime - 0.2) cur.next = ctx.currentTime + 0.05;
    while (cur.next < ctx.currentTime + LOOKAHEAD) {
      for (const e of song.at[cur.step]) {
        if (e.ch === 'drum') drum(ctx, cur.gain, e.kind, cur.next);
        else if (e.ch === 'lead') voice(ctx, cur.gain, song.leadWave, midiFreq(e.midi), cur.next, e.len * song.stepDur * 0.95, 0.16);
        else voice(ctx, cur.gain, 'triangle', midiFreq(e.midi), cur.next, e.len * song.stepDur * 0.9, 0.3);
      }
      cur.next += song.stepDur;
      cur.step = (cur.step + 1) % song.steps;
    }
  }

  return {
    /** 播一首歌（名稱是 SONGS 的鍵）。已經在播就不重來。null 是停止。 */
    play(name) {
      if ((cur ? cur.name : null) === name) return;
      const ctx = audio.ctx;
      if (!ctx || !audio.musicGain) return; // 音訊還沒啟動：等下次再試
      if (cur) {
        const old = cur.gain;
        old.gain.setValueAtTime(old.gain.value, ctx.currentTime);
        old.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + FADE);
        setTimeout(() => old.disconnect(), FADE * 1000 + 300);
        cur = null;
      }
      if (!name || !songs[name]) return;
      const gain = ctx.createGain();
      gain.connect(audio.musicGain);
      cur = { name, song: compileSong(name, songs[name]), step: 0, next: ctx.currentTime + 0.05, gain };
      if (!timer) timer = setInterval(schedule, TICK_MS);
    },
    current: () => (cur ? cur.name : null),
  };
}
