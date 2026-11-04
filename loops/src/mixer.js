// 混音台：五軌 → 殘響／延遲 → 主輸出（壓縮器 → 限幅器 → 軟削波）。
// 軟削波的曲線最高只到 0.86，所以輸出永遠低於 0 dBFS，不會破音。

import { createResources } from './synth.js';
import { TRACK_IDS } from './genres.js';
import { Rng } from './rng.js';

// 各軌送往殘響、延遲的量，以及各軌的高通（清掉低頻，避免混濁）
const TRACK_SETUP = {
  drums: { rev: 0.1, dly: 0, hp: 0, trim: 1.0, pan: 0, duck: false },
  bass: { rev: 0, dly: 0, hp: 0, trim: 1.0, pan: 0, duck: true },
  chords: { rev: 0.45, dly: 0.1, hp: 140, trim: 1.0, pan: 0, duck: true },
  lead: { rev: 0.4, dly: 0.45, hp: 180, trim: 1.0, pan: 0.05, duck: true },
  fx: { rev: 0.55, dly: 0.4, hp: 120, trim: 1.0, pan: -0.08, duck: false },
};

export const SOFT_CLIP_CEILING = 0.86;

function softClipCurve() {
  const n = 2048;
  const curve = new Float32Array(n);
  const knee = 0.6;
  const room = SOFT_CLIP_CEILING - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

function makeImpulse(ctx, seconds) {
  const rng = new Rng('impulse');
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / sr;
      const decay = Math.exp((-6.9 * tt) / seconds);
      // 越後面越暗（模擬空氣吸收）
      const a = 0.85 - 0.75 * (i / len);
      lp += (rng.float() * 2 - 1 - lp) * a;
      const pre = tt < 0.012 ? tt / 0.012 : 1;
      d[i] = lp * decay * pre;
    }
  }
  return buf;
}

function setParam(ctx, param, value, smooth = 0.02) {
  if (typeof ctx.startRendering === 'function') {
    param.setValueAtTime(value, ctx.currentTime);
  } else {
    param.setTargetAtTime(value, ctx.currentTime, smooth);
  }
}

export function volumeToGain(vol) {
  return vol <= 0 ? 0 : vol * vol * 1.4;
}

export function effectiveGains(mixer) {
  const anySolo = TRACK_IDS.some((t) => mixer[t]?.solo);
  const out = {};
  for (const t of TRACK_IDS) {
    const m = mixer[t] || { vol: 0.8 };
    const on = anySolo ? !!m.solo : !m.mute;
    out[t] = on ? volumeToGain(m.vol ?? 0.8) : 0;
  }
  return out;
}

export function buildGraph(ctx, { raw = false } = {}) {
  const R = createResources(ctx);
  const masterIn = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 28;
  const color = ctx.createBiquadFilter();
  color.type = 'lowpass';
  color.frequency.value = 18000;
  color.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.015;
  comp.release.value = 0.22;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.2;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;

  const clipper = ctx.createWaveShaper();
  clipper.curve = softClipCurve();
  clipper.oversample = '2x';

  const out = ctx.createGain();
  out.gain.value = 1;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;

  if (raw) masterIn.connect(out); // 校正音量用：跳過主輸出處理
  else masterIn.connect(hp).connect(color).connect(comp).connect(makeup).connect(limiter).connect(clipper).connect(out);
  out.connect(ctx.destination);
  out.connect(analyser);

  // 殘響
  const revIn = ctx.createGain();
  const revHP = ctx.createBiquadFilter();
  revHP.type = 'highpass';
  revHP.frequency.value = 220;
  const conv = ctx.createConvolver();
  conv.normalize = true;
  conv.buffer = makeImpulse(ctx, 2.4);
  const revOut = ctx.createGain();
  revOut.gain.value = 0.5;
  revIn.connect(revHP).connect(conv).connect(revOut).connect(masterIn);

  // 延遲（附點八分音符）
  const dlyIn = ctx.createGain();
  const dly = ctx.createDelay(2.5);
  dly.delayTime.value = 0.375;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const dlyLP = ctx.createBiquadFilter();
  dlyLP.type = 'lowpass';
  dlyLP.frequency.value = 3000;
  const dlyHP = ctx.createBiquadFilter();
  dlyHP.type = 'highpass';
  dlyHP.frequency.value = 300;
  const dlyOut = ctx.createGain();
  dlyOut.gain.value = 0.3;
  dlyIn.connect(dly);
  dly.connect(dlyLP).connect(dlyHP);
  dlyHP.connect(fb).connect(dly);
  dlyHP.connect(dlyOut).connect(masterIn);
  const dlyToRev = ctx.createGain();
  dlyToRev.gain.value = 0.25;
  dlyOut.connect(dlyToRev).connect(revIn);

  // 錄音帶晃動（Lo-fi）
  const wowOsc = ctx.createOscillator();
  wowOsc.frequency.value = 0.55;
  const wow = ctx.createGain();
  wow.gain.value = 0;
  wowOsc.connect(wow);
  wowOsc.start(0);
  R.wow = wow;

  // 側鏈壓縮（大鼓踩下去時，其他樂器讓一下）
  const duck = ctx.createGain();
  duck.gain.value = 1;
  duck.connect(masterIn);

  const tracks = {};
  for (const id of TRACK_IDS) {
    const s = TRACK_SETUP[id];
    const input = ctx.createGain();
    let node = input;
    if (s.hp) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = s.hp;
      node = node.connect(f);
    }
    const trim = ctx.createGain();
    trim.gain.value = s.trim;
    node = node.connect(trim);
    const fader = ctx.createGain();
    fader.gain.value = volumeToGain(0.8);
    node.connect(fader);
    let post = fader;
    if (s.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = s.pan;
      post = fader.connect(p);
    }
    post.connect(s.duck ? duck : masterIn);
    const revSend = ctx.createGain();
    revSend.gain.value = s.rev;
    fader.connect(revSend).connect(revIn);
    const dlySend = ctx.createGain();
    dlySend.gain.value = s.dly;
    fader.connect(dlySend).connect(dlyIn);
    // 額外濕聲（例如合成器浪潮的大小鼓）：跟著音量推桿一起變化
    const wetIn = ctx.createGain();
    const wetTrim = ctx.createGain();
    wetTrim.gain.value = s.trim;
    const wetFader = ctx.createGain();
    wetFader.gain.value = fader.gain.value;
    wetIn.connect(wetTrim).connect(wetFader).connect(revIn);
    tracks[id] = { input, trim, wetTrim, fader, wetIn, wetFader, revSend, dlySend };
  }

  let duckDepth = 0;

  const graph = {
    ctx,
    R,
    tracks,
    analyser,
    out,
    setGenre(sound, bpm) {
      setParam(ctx, color.frequency, sound.lowpass || 18000, 0.1);
      setParam(ctx, revOut.gain, 0.35 + (sound.reverb || 0.2) * 1.6, 0.1);
      setParam(ctx, dlyOut.gain, (sound.delay || 0.15) * 1.5, 0.1);
      setParam(ctx, dly.delayTime, Math.min(2.4, (60 / bpm) * 0.75), 0.05);
      setParam(ctx, wow.gain, sound.wow || 0, 0.1);
      duckDepth = sound.duck || 0;
      for (const id of TRACK_IDS) {
        const g = TRACK_SETUP[id].trim * (sound.trims?.[id] ?? 1);
        setParam(ctx, tracks[id].trim.gain, g, 0.05);
        setParam(ctx, tracks[id].wetTrim.gain, g, 0.05);
      }
    },
    setTrackGain(id, g) {
      const tr = tracks[id];
      setParam(ctx, tr.fader.gain, g, 0.015);
      setParam(ctx, tr.wetFader.gain, g, 0.015);
    },
    applyMixer(mixer) {
      const gains = effectiveGains(mixer);
      for (const id of TRACK_IDS) graph.setTrackGain(id, gains[id]);
      return gains;
    },
    duck(t) {
      if (!duckDepth) return;
      duck.gain.setTargetAtTime(1 - duckDepth, t, 0.004);
      duck.gain.setTargetAtTime(1, t + 0.05, 0.09);
    },
    // 每次按播放都開一組新的「閘門」，停止時把它關掉，舊的音就不會拖尾
    newRun() {
      const gates = {};
      for (const id of TRACK_IDS) {
        const dry = ctx.createGain();
        const wet = ctx.createGain();
        dry.connect(tracks[id].input);
        wet.connect(tracks[id].wetIn);
        gates[id] = { dry, wet };
      }
      return {
        dest: (id) => gates[id],
        stop(time) {
          for (const id of TRACK_IDS) {
            gates[id].dry.gain.setTargetAtTime(0, time, 0.012);
            gates[id].wet.gain.setTargetAtTime(0, time, 0.03);
          }
          setTimeout(() => {
            for (const id of TRACK_IDS) {
              try { gates[id].dry.disconnect(); gates[id].wet.disconnect(); } catch (e) { /* ignore */ }
            }
          }, 1500);
        },
      };
    },
  };
  return graph;
}
