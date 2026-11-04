// 音色：全部用 Web Audio 即時合成。AudioContext 和 OfflineAudioContext 都能用。
// 每個音色函式：(R, out, t, ...) ，out = { dry, wet }，wet 會送進殘響。

import { Rng } from './rng.js';
import { midiToFreq } from './theory.js';

// ───────────── 共用資源 ─────────────

export function createResources(ctx) {
  const rng = new Rng('noise-buffers');
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2);
  const noise = ctx.createBuffer(1, len, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < len; i++) nd[i] = rng.float() * 2 - 1;

  // 8-bit 風格的「粗顆粒」雜訊：取樣保持 + 量化
  const crunch = ctx.createBuffer(1, len, sr);
  const cd = crunch.getChannelData(0);
  let hold = 0;
  for (let i = 0; i < len; i++) {
    if (i % 7 === 0) hold = rng.float() < 0.5 ? -1 : 1;
    cd[i] = hold * 0.8;
  }

  const pulse = (duty) => {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  };

  return {
    ctx,
    noise,
    crunch,
    pulse12: pulse(0.125),
    pulse25: pulse(0.25),
    shapers: new Map(),
    noiseRng: new Rng('noise-offsets'),
    wow: null, // 由 mixer 設定（Lo-fi 的錄音帶晃動）
  };
}

function shaperCurve(R, drive) {
  const key = drive.toFixed(2);
  if (R.shapers.has(key)) return R.shapers.get(key);
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  R.shapers.set(key, curve);
  return curve;
}

function shaper(R, drive) {
  const ws = R.ctx.createWaveShaper();
  ws.curve = shaperCurve(R, drive);
  return ws;
}

function filt(ctx, type, f, q = 0.707) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

function gainNode(ctx, v = 0) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function osc(ctx, type, freq, t, end, R) {
  const o = ctx.createOscillator();
  if (type === 'pulse12') o.setPeriodicWave(R.pulse12);
  else if (type === 'pulse25') o.setPeriodicWave(R.pulse25);
  else o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(end);
  return o;
}

function noiseSrc(R, t, end, buf) {
  const s = R.ctx.createBufferSource();
  s.buffer = buf || R.noise;
  s.loop = true;
  s.start(t, R.noiseRng.float() * 1.5);
  s.stop(end);
  return s;
}

// 打擊樂包絡：線性起音、指數衰減。回傳結束時間。
function percEnv(param, t, attack, decay, peak) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return t + attack + decay + 0.01;
}

// ADSR（不依賴 cancelAndHoldAtTime，Firefox/Safari 也能用）。回傳完全安靜的時間。
function adsr(param, t, dur, a, d, s, r, peak) {
  const sus = peak * s;
  const tEnd = t + Math.max(dur, 0.01);
  param.setValueAtTime(0, t);
  if (dur <= a) {
    const v = peak * (dur / a);
    param.linearRampToValueAtTime(v, tEnd);
    param.setTargetAtTime(0, tEnd, r / 4);
    return tEnd + r * 1.6;
  }
  param.linearRampToValueAtTime(peak, t + a);
  const tau = Math.max(d, 0.002) / 3;
  param.setTargetAtTime(sus, t + a, tau);
  const vEnd = sus + (peak - sus) * Math.exp(-(dur - a) / tau);
  param.setValueAtTime(vEnd, tEnd);
  param.setTargetAtTime(0, tEnd, r / 4);
  return tEnd + r * 1.6;
}

function attachWow(R, o, end) {
  if (!R.wow) return;
  R.wow.connect(o.detune);
  o.addEventListener('ended', () => {
    try { R.wow.disconnect(o.detune); } catch (e) { /* 已斷開 */ }
  });
}

function vibrato(R, o, t, end, rate, cents, delay = 0.25) {
  const ctx = R.ctx;
  const lfo = osc(ctx, 'sine', rate, t, end, R);
  const depth = gainNode(ctx, 0);
  depth.gain.setValueAtTime(0, t);
  depth.gain.setValueAtTime(0, t + delay);
  depth.gain.linearRampToValueAtTime(cents, t + delay + 0.35);
  lfo.connect(depth).connect(o.detune);
}

// ───────────── 鼓組 ─────────────

const BASE_KIT = {
  kick: { f0: 150, f1: 48, pd: 0.07, decay: 0.42, lvl: 0.95, drive: 1.4, click: 0.18, lp: 0 },
  snare: { tone: 190, toneLvl: 0.3, toneDecay: 0.08, noiseLvl: 0.42, noiseDecay: 0.16, hp: 1200, lp: 9000, wet: 0.12 },
  clap: { lvl: 0.42, decay: 0.16, bp: 1300, wet: 0.2 },
  hatC: { hp: 7500, decay: 0.045, lvl: 0.2, lp: 14000 },
  hatO: { hp: 7000, decay: 0.25, lvl: 0.13, lp: 13000 },
  rim: { f: 1700, lvl: 0.24 },
  snap: { lvl: 0.32 },
  shaker: { lvl: 0.1 },
  tom: { lvl: 0.42 },
  crash: { lvl: 0.12, decay: 1.6 },
};

const KITS = {
  lofi: {
    kick: { f0: 118, f1: 46, pd: 0.08, decay: 0.4, lvl: 0.95, drive: 1.8, click: 0.08, lp: 2400 },
    snare: { tone: 180, toneLvl: 0.25, toneDecay: 0.09, noiseLvl: 0.4, noiseDecay: 0.17, hp: 1100, lp: 5200, wet: 0.18 },
    hatC: { hp: 6000, decay: 0.04, lvl: 0.17, lp: 8500 },
    hatO: { hp: 6000, decay: 0.22, lvl: 0.11, lp: 8000 },
    rim: { f: 1400, lvl: 0.22 },
  },
  house: {
    kick: { f0: 165, f1: 50, pd: 0.06, decay: 0.45, lvl: 1, drive: 1.5, click: 0.2, lp: 0 },
    clap: { lvl: 0.45, decay: 0.18, bp: 1250, wet: 0.22 },
    hatO: { hp: 7500, decay: 0.2, lvl: 0.14, lp: 14000 },
  },
  synthwave: {
    kick: { f0: 140, f1: 45, pd: 0.08, decay: 0.5, lvl: 1, drive: 1.3, click: 0.12, lp: 0 },
    bigsnare: { tone: 170, toneLvl: 0.32, toneDecay: 0.12, noiseLvl: 0.42, noiseDecay: 0.3, hp: 900, lp: 8000, wet: 0.75 },
  },
  rock: {
    kick: { f0: 135, f1: 55, pd: 0.05, decay: 0.32, lvl: 0.95, drive: 1.6, click: 0.3, lp: 0 },
    snare: { tone: 200, toneLvl: 0.34, toneDecay: 0.1, noiseLvl: 0.45, noiseDecay: 0.2, hp: 1000, lp: 10000, wet: 0.22 },
    crash: { lvl: 0.14, decay: 1.8 },
  },
  trap: {
    kick: { f0: 170, f1: 52, pd: 0.045, decay: 0.28, lvl: 0.95, drive: 2, click: 0.22, lp: 0 },
    clap: { lvl: 0.48, decay: 0.2, bp: 1400, wet: 0.25 },
    hatC: { hp: 8500, decay: 0.035, lvl: 0.18, lp: 16000 },
    snare: { tone: 210, toneLvl: 0.25, toneDecay: 0.06, noiseLvl: 0.36, noiseDecay: 0.1, hp: 1500, lp: 11000, wet: 0.1 },
  },
  chip: {
    kick: { f0: 260, f1: 45, pd: 0.09, decay: 0.16, lvl: 0.5, drive: 0, click: 0, lp: 0, tone: 'square', chipLP: 1800 },
    snare: { tone: 0, toneLvl: 0, toneDecay: 0.05, noiseLvl: 0.34, noiseDecay: 0.12, hp: 600, lp: 9000, wet: 0.05, crunch: true },
    hatC: { hp: 5000, decay: 0.03, lvl: 0.14, lp: 16000, crunch: true },
    hatO: { hp: 5000, decay: 0.16, lvl: 0.09, lp: 16000, crunch: true },
  },
};

function kitFor(id) {
  const k = KITS[id] || {};
  const out = {};
  for (const key of Object.keys(BASE_KIT)) out[key] = { ...BASE_KIT[key], ...(k[key] || {}) };
  out.bigsnare = { ...out.snare, ...(k.bigsnare || {}) };
  return out;
}

const kitCache = new Map();

// 各種鼓聲的相對音量（校正過：大鼓約 -6 dB、小鼓 -10、鈸 -22）
const DRUM_GAIN = {
  kick: 0.5, snare: 0.7, bigsnare: 0.62, clap: 1.25, hatC: 1.4, hatO: 1.1, rim: 1.4, snap: 1.0, shaker: 1.2,
  tomH: 0.63, tomM: 0.63, tomL: 0.63, crash: 1,
};
const KIT_GAIN = {
  lofi: { hatC: 0.8, hatO: 0.9 },
  trap: { hatC: 1.15, snare: 1.3 },
  chip: { kick: 1.6, snare: 0.8, hatC: 1.0, hatO: 1.3, clap: 1.4 },
};

export function playDrum(R, out, kitId, drum, t, vel) {
  if (!kitCache.has(kitId)) kitCache.set(kitId, kitFor(kitId));
  const kit = kitCache.get(kitId);
  vel *= (DRUM_GAIN[drum] ?? 1) * (KIT_GAIN[kitId]?.[drum] ?? 1);
  const ctx = R.ctx;
  switch (drum) {
    case 'kick': {
      const k = kit.kick;
      const end = t + k.decay + 0.05;
      const o = osc(ctx, k.tone || 'sine', k.f0, t, end, R);
      o.frequency.exponentialRampToValueAtTime(k.f1, t + k.pd);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.002, k.decay, k.lvl * vel);
      let node = o;
      if (k.drive) node = node.connect(shaper(R, k.drive));
      if (k.lp) node = node.connect(filt(ctx, 'lowpass', k.lp));
      if (k.chipLP) node = node.connect(filt(ctx, 'lowpass', k.chipLP));
      node.connect(g).connect(out.dry);
      if (k.click) {
        const n = noiseSrc(R, t, t + 0.03);
        const cg = gainNode(ctx);
        percEnv(cg.gain, t, 0.0005, 0.012, k.click * vel);
        n.connect(filt(ctx, 'highpass', 2500)).connect(cg).connect(out.dry);
      }
      break;
    }
    case 'snare':
    case 'bigsnare': {
      const s = kit[drum];
      if (s.tone) {
        const end = t + s.toneDecay + 0.05;
        const o = osc(ctx, 'triangle', s.tone * 1.3, t, end, R);
        o.frequency.exponentialRampToValueAtTime(s.tone, t + 0.03);
        const g = gainNode(ctx);
        percEnv(g.gain, t, 0.001, s.toneDecay, s.toneLvl * vel);
        o.connect(g).connect(out.dry);
      }
      const end = t + s.noiseDecay + 0.05;
      const n = noiseSrc(R, t, end, s.crunch ? R.crunch : R.noise);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.001, s.noiseDecay, s.noiseLvl * vel);
      n.connect(filt(ctx, 'highpass', s.hp)).connect(filt(ctx, 'lowpass', s.lp)).connect(g);
      g.connect(out.dry);
      if (s.wet) {
        const w = gainNode(ctx, s.wet);
        g.connect(w).connect(out.wet);
      }
      break;
    }
    case 'clap': {
      const c = kit.clap;
      const end = t + 0.04 + c.decay + 0.05;
      const n = noiseSrc(R, t, end);
      const g = gainNode(ctx);
      const p = c.lvl * vel;
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < 3; i++) {
        const ti = t + i * 0.011;
        g.gain.setValueAtTime(p, ti);
        g.gain.exponentialRampToValueAtTime(p * 0.15, ti + 0.009);
      }
      g.gain.setValueAtTime(p, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.033 + c.decay);
      n.connect(filt(ctx, 'bandpass', c.bp, 1.1)).connect(g).connect(out.dry);
      const w = gainNode(ctx, c.wet);
      g.connect(w).connect(out.wet);
      break;
    }
    case 'hatC':
    case 'hatO': {
      const h = kit[drum];
      const end = t + h.decay + 0.05;
      const n = noiseSrc(R, t, end, h.crunch ? R.crunch : R.noise);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.001, h.decay, h.lvl * vel);
      n.connect(filt(ctx, 'highpass', h.hp)).connect(filt(ctx, 'lowpass', h.lp)).connect(g).connect(out.dry);
      break;
    }
    case 'rim': {
      const r = kit.rim;
      const o = osc(ctx, 'triangle', r.f, t, t + 0.06, R);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.0005, 0.03, r.lvl * vel);
      o.connect(filt(ctx, 'bandpass', r.f, 3)).connect(g).connect(out.dry);
      const n = noiseSrc(R, t, t + 0.04);
      const ng = gainNode(ctx);
      percEnv(ng.gain, t, 0.0005, 0.02, r.lvl * 0.6 * vel);
      n.connect(filt(ctx, 'bandpass', 2600, 2)).connect(ng).connect(out.dry);
      break;
    }
    case 'snap': {
      const n = noiseSrc(R, t, t + 0.12);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.001, 0.07, kit.snap.lvl * vel);
      n.connect(filt(ctx, 'bandpass', 2300, 2.2)).connect(g).connect(out.dry);
      const w = gainNode(ctx, 0.3);
      g.connect(w).connect(out.wet);
      break;
    }
    case 'shaker': {
      const n = noiseSrc(R, t, t + 0.1);
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(kit.shaker.lvl * vel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      n.connect(filt(ctx, 'bandpass', 7500, 1.2)).connect(g).connect(out.dry);
      break;
    }
    case 'tomH':
    case 'tomM':
    case 'tomL': {
      const f = drum === 'tomH' ? 210 : drum === 'tomM' ? 155 : 110;
      const end = t + 0.4;
      const o = osc(ctx, 'sine', f * 1.5, t, end, R);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.002, 0.32, kit.tom.lvl * vel);
      o.connect(shaper(R, 1.3)).connect(g).connect(out.dry);
      const w = gainNode(ctx, 0.2);
      g.connect(w).connect(out.wet);
      break;
    }
    case 'crash': {
      const c = kit.crash;
      const end = t + c.decay + 0.1;
      const n = noiseSrc(R, t, end);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.002, c.decay, c.lvl * vel);
      n.connect(filt(ctx, 'highpass', 4500)).connect(filt(ctx, 'peaking', 8000, 0.8)).connect(g).connect(out.dry);
      const w = gainNode(ctx, 0.25);
      g.connect(w).connect(out.wet);
      break;
    }
    default:
      break;
  }
}

// ───────────── 貝斯 ─────────────

export function playBass(R, out, voice, t, dur, midi, vel, fromMidi = null) {
  const ctx = R.ctx;
  const f = midiToFreq(midi);
  switch (voice) {
    case 'round': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.008, 0.3, 0.7, 0.09, 0.5 * vel);
      const o1 = osc(ctx, 'sine', f, t, end, R);
      const o2 = osc(ctx, 'triangle', f, t, end, R);
      const g2 = gainNode(ctx, 0.35);
      const lp = filt(ctx, 'lowpass', 750, 0.8);
      o1.connect(lp);
      o2.connect(g2).connect(lp);
      lp.connect(shaper(R, 1.2)).connect(amp).connect(out.dry);
      attachWow(R, o1, end);
      break;
    }
    case 'organ': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.005, 0.18, 0.6, 0.05, 0.34 * vel);
      const o1 = osc(ctx, 'square', f, t, end, R);
      const o2 = osc(ctx, 'sine', f, t, end, R);
      const lp = filt(ctx, 'lowpass', 600, 3);
      lp.frequency.setValueAtTime(1900, t);
      lp.frequency.setTargetAtTime(520, t, 0.06);
      const g1 = gainNode(ctx, 0.5);
      o1.connect(g1).connect(lp);
      o2.connect(lp);
      lp.connect(amp).connect(out.dry);
      break;
    }
    case 'sawPulse': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.004, 0.2, 0.55, 0.06, 0.32 * vel);
      const o1 = osc(ctx, 'sawtooth', f, t, end, R);
      const o2 = osc(ctx, 'sawtooth', f, t, end, R);
      o2.detune.value = 8;
      const lp = filt(ctx, 'lowpass', 500, 5);
      lp.frequency.setValueAtTime(2200, t);
      lp.frequency.setTargetAtTime(480, t, 0.07);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(amp).connect(out.dry);
      break;
    }
    case 'pick': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.004, 0.3, 0.55, 0.07, 0.32 * vel);
      const o1 = osc(ctx, 'sawtooth', f, t, end, R);
      const o2 = osc(ctx, 'square', f, t, end, R);
      const g2 = gainNode(ctx, 0.4);
      const lp = filt(ctx, 'lowpass', 1000, 1.2);
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.setTargetAtTime(900, t, 0.05);
      o1.connect(lp);
      o2.connect(g2).connect(lp);
      lp.connect(shaper(R, 1.5)).connect(amp).connect(out.dry);
      break;
    }
    case '808': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.003, 1.1, 0.55, 0.12, 0.55 * vel);
      const o = osc(ctx, 'sine', f, t, end, R);
      if (fromMidi !== null) {
        o.frequency.setValueAtTime(midiToFreq(fromMidi), t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
      } else {
        o.frequency.setValueAtTime(f * 1.6, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      }
      o.connect(shaper(R, 2.4)).connect(filt(ctx, 'lowpass', 2400)).connect(amp).connect(out.dry);
      break;
    }
    case 'tri': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.002, 0.1, 0.8, 0.03, 0.42 * vel);
      const o = osc(ctx, 'triangle', f, t, end, R);
      const p = osc(ctx, 'pulse25', f, t, end, R);
      const pg = gainNode(ctx, 0.12);
      o.connect(amp);
      p.connect(pg).connect(filt(ctx, 'lowpass', 2200)).connect(amp);
      amp.connect(out.dry);
      break;
    }
    default:
      break;
  }
}

// ───────────── 和弦（每次叫一個音） ─────────────

export function playChordNote(R, out, voice, t, dur, midi, vel, pan = 0) {
  const ctx = R.ctx;
  const f = midiToFreq(midi);
  let dest = out.dry;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(out.dry);
    dest = p;
  }
  switch (voice) {
    case 'ep': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.004, 1.4, 0.25, 0.35, 0.15 * vel);
      const car = osc(ctx, 'sine', f, t, end, R);
      const mod = osc(ctx, 'sine', f, t, end, R);
      const mg = gainNode(ctx);
      mg.gain.setValueAtTime(f * 1.4 * vel, t);
      mg.gain.setTargetAtTime(f * 0.12, t, 0.22);
      mod.connect(mg).connect(car.frequency);
      const tine = osc(ctx, 'sine', f * 4, t, Math.min(end, t + 0.5), R);
      const tg = gainNode(ctx);
      percEnv(tg.gain, t, 0.002, 0.25, 0.03 * vel);
      tine.connect(tg).connect(dest);
      car.connect(amp).connect(filt(ctx, 'lowpass', 3600)).connect(dest);
      attachWow(R, car, end);
      attachWow(R, mod, end);
      break;
    }
    case 'stab': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.003, 0.22, 0.25, 0.1, 0.09 * vel);
      const o1 = osc(ctx, 'sawtooth', f, t, end, R);
      const o2 = osc(ctx, 'sawtooth', f, t, end, R);
      o2.detune.value = -9;
      const lp = filt(ctx, 'lowpass', 900, 2);
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.setTargetAtTime(900, t, 0.06);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(amp).connect(dest);
      attachWow(R, o1, end);
      break;
    }
    case 'pad': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.3, 0.6, 0.78, 0.7, 0.06 * vel);
      const o1 = osc(ctx, 'sawtooth', f, t, end, R);
      const o2 = osc(ctx, 'sawtooth', f, t, end, R);
      o1.detune.value = -10;
      o2.detune.value = 10;
      const lp = filt(ctx, 'lowpass', 1700, 0.8);
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.linearRampToValueAtTime(2000, t + Math.min(dur, 1.5));
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(amp).connect(dest);
      const w = gainNode(ctx, 0.35);
      amp.connect(w).connect(out.wet);
      attachWow(R, o1, end);
      break;
    }
    case 'piano': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.002, 1.0, 0.18, 0.28, 0.13 * vel);
      const car = osc(ctx, 'sine', f, t, end, R);
      const mod = osc(ctx, 'sine', f * 2, t, end, R);
      const mg = gainNode(ctx);
      mg.gain.setValueAtTime(f * 1.1 * vel, t);
      mg.gain.setTargetAtTime(f * 0.08, t, 0.12);
      mod.connect(mg).connect(car.frequency);
      const tri = osc(ctx, 'triangle', f, t, end, R);
      const tg = gainNode(ctx, 0.35);
      tri.connect(tg).connect(amp);
      car.connect(amp);
      amp.connect(filt(ctx, 'lowpass', 5000)).connect(dest);
      break;
    }
    case 'guitar': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.003, 0.5, 0.5, 0.08, 0.055 * vel);
      const o1 = osc(ctx, 'sawtooth', f, t, end, R);
      const o2 = osc(ctx, 'sawtooth', f, t, end, R);
      o2.detune.value = 6;
      const pre = gainNode(ctx, 0.8);
      o1.connect(pre);
      o2.connect(pre);
      pre.connect(shaper(R, 3)).connect(filt(ctx, 'lowpass', 2300, 0.9)).connect(filt(ctx, 'highpass', 120)).connect(amp).connect(dest);
      break;
    }
    case 'darkpad': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.45, 0.8, 0.8, 0.9, 0.11 * vel);
      const o1 = osc(ctx, 'triangle', f, t, end, R);
      const o2 = osc(ctx, 'triangle', f, t, end, R);
      o1.detune.value = -7;
      o2.detune.value = 7;
      const lp = filt(ctx, 'lowpass', 1500, 0.7);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(amp).connect(dest);
      const w = gainNode(ctx, 0.4);
      amp.connect(w).connect(out.wet);
      break;
    }
    case 'bell': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, Math.max(dur, 0.05), 0.002, 1.0, 0.0, 0.4, 0.13 * vel);
      const car = osc(ctx, 'sine', f, t, end, R);
      const mod = osc(ctx, 'sine', f * 2, t, end, R);
      const mg = gainNode(ctx);
      mg.gain.setValueAtTime(f * 2.2, t);
      mg.gain.setTargetAtTime(0, t, 0.3);
      mod.connect(mg).connect(car.frequency);
      car.connect(amp).connect(dest);
      const w = gainNode(ctx, 0.3);
      amp.connect(w).connect(out.wet);
      break;
    }
    case 'pulse': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.002, 0.08, 0.55, 0.03, 0.07 * vel);
      const o = osc(ctx, 'pulse25', f, t, end, R);
      o.connect(amp).connect(dest);
      break;
    }
    default:
      break;
  }
}

// ───────────── 主旋律 ─────────────

export function playLead(R, out, voice, t, dur, midi, vel) {
  const ctx = R.ctx;
  const f = midiToFreq(midi);
  switch (voice) {
    case 'flute': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.05, 0.25, 0.8, 0.14, 0.2 * vel);
      const o1 = osc(ctx, 'sine', f, t, end, R);
      const o2 = osc(ctx, 'triangle', f * 2, t, end, R);
      const g2 = gainNode(ctx, 0.12);
      const lp = filt(ctx, 'lowpass', 3000);
      o1.connect(lp);
      o2.connect(g2).connect(lp);
      const breath = noiseSrc(R, t, end);
      const bg = gainNode(ctx, 0);
      adsr(bg.gain, t, dur, 0.03, 0.1, 0.4, 0.1, 0.035 * vel);
      breath.connect(filt(ctx, 'bandpass', Math.min(f * 2, 9000), 4)).connect(bg).connect(amp);
      lp.connect(amp).connect(out.dry);
      vibrato(R, o1, t, end, 5, 12);
      attachWow(R, o1, end);
      break;
    }
    case 'pluck': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.002, 0.25, 0.12, 0.12, 0.15 * vel);
      const o1 = osc(ctx, 'sawtooth', f, t, end, R);
      const o2 = osc(ctx, 'square', f, t, end, R);
      o2.detune.value = 5;
      const g2 = gainNode(ctx, 0.5);
      const lp = filt(ctx, 'lowpass', 600, 4);
      lp.frequency.setValueAtTime(4500, t);
      lp.frequency.setTargetAtTime(700, t, 0.06);
      o1.connect(lp);
      o2.connect(g2).connect(lp);
      lp.connect(amp).connect(out.dry);
      break;
    }
    case 'sawLead': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.012, 0.3, 0.8, 0.16, 0.085 * vel);
      const o1 = osc(ctx, 'sawtooth', f, t, end, R);
      const o2 = osc(ctx, 'sawtooth', f, t, end, R);
      o1.detune.value = -7;
      o2.detune.value = 7;
      const lp = filt(ctx, 'lowpass', 3000, 1);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(amp).connect(out.dry);
      vibrato(R, o1, t, end, 5.5, 14, 0.3);
      vibrato(R, o2, t, end, 5.5, 14, 0.3);
      break;
    }
    case 'square': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.006, 0.2, 0.72, 0.1, 0.075 * vel);
      const o1 = osc(ctx, 'square', f, t, end, R);
      const o2 = osc(ctx, 'sawtooth', f, t, end, R);
      o2.detune.value = 4;
      const g2 = gainNode(ctx, 0.45);
      const lp = filt(ctx, 'lowpass', 2500, 0.9);
      o1.connect(lp);
      o2.connect(g2).connect(lp);
      lp.connect(amp).connect(out.dry);
      vibrato(R, o1, t, end, 5.5, 10, 0.3);
      break;
    }
    case 'bell': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, Math.max(dur, 0.1), 0.002, 1.2, 0.05, 0.5, 0.17 * vel);
      const car = osc(ctx, 'sine', f, t, end, R);
      const mod = osc(ctx, 'sine', f * 3, t, end, R);
      const mg = gainNode(ctx);
      mg.gain.setValueAtTime(f * 1.8, t);
      mg.gain.setTargetAtTime(0, t, 0.25);
      mod.connect(mg).connect(car.frequency);
      const sub = osc(ctx, 'sine', f, t, end, R);
      const sg = gainNode(ctx, 0.4);
      sub.connect(sg).connect(amp);
      car.connect(amp).connect(out.dry);
      break;
    }
    case 'pulse': {
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.002, 0.12, 0.7, 0.04, 0.075 * vel);
      const o = osc(ctx, 'pulse12', f, t, end, R);
      o.connect(amp).connect(out.dry);
      vibrato(R, o, t, end, 6, 15, 0.18);
      break;
    }
    default:
      break;
  }
}

// ───────────── 效果音 ─────────────

export function playFx(R, out, kind, t, dur, midi, vel, extra = {}) {
  const ctx = R.ctx;
  switch (kind) {
    case 'riser': {
      const end = t + dur + 0.05;
      const n = noiseSrc(R, t, end);
      const bp = filt(ctx, 'bandpass', 300, 2.5);
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * vel, t + dur);
      g.gain.setTargetAtTime(0, t + dur, 0.015);
      n.connect(bp).connect(g).connect(out.dry);
      const w = gainNode(ctx, 0.5);
      g.connect(w).connect(out.wet);
      break;
    }
    case 'down': {
      const end = t + dur + 0.05;
      const n = noiseSrc(R, t, end);
      const bp = filt(ctx, 'bandpass', 6000, 2);
      bp.frequency.setValueAtTime(6000, t);
      bp.frequency.exponentialRampToValueAtTime(180, t + dur);
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0.28 * vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp).connect(g).connect(out.dry);
      const w = gainNode(ctx, 0.5);
      g.connect(w).connect(out.wet);
      break;
    }
    case 'impact': {
      const f = midiToFreq(midi);
      const end = t + 1.4;
      const o = osc(ctx, 'sine', f * 2, t, end, R);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.15);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.003, 1.3, 0.5 * vel);
      o.connect(shaper(R, 1.6)).connect(g).connect(out.dry);
      const n = noiseSrc(R, t, t + 0.8);
      const ng = gainNode(ctx);
      percEnv(ng.gain, t, 0.002, 0.7, 0.18 * vel);
      n.connect(filt(ctx, 'lowpass', 3500)).connect(ng).connect(out.dry);
      const w = gainNode(ctx, 0.8);
      ng.connect(w).connect(out.wet);
      break;
    }
    case 'revcym': {
      const end = t + dur + 0.05;
      const n = noiseSrc(R, t, end);
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22 * vel, t + dur);
      g.gain.setTargetAtTime(0, t + dur, 0.01);
      n.connect(filt(ctx, 'highpass', 3500)).connect(filt(ctx, 'peaking', 8500, 0.7)).connect(g).connect(out.dry);
      const w = gainNode(ctx, 0.3);
      g.connect(w).connect(out.wet);
      break;
    }
    case 'hiss': {
      const end = t + dur + 0.1;
      const n = noiseSrc(R, t, end);
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.022 * vel, t + 0.05);
      g.gain.setValueAtTime(0.022 * vel, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.06);
      n.connect(filt(ctx, 'bandpass', 3200, 0.6)).connect(g).connect(out.dry);
      break;
    }
    case 'click': {
      const n = noiseSrc(R, t, t + 0.02);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.0003, 0.004, 0.22 * vel);
      n.connect(filt(ctx, 'highpass', 1500)).connect(g).connect(out.dry);
      break;
    }
    case 'rain': {
      const end = t + dur + 0.4;
      const n = noiseSrc(R, t, end);
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07 * vel, t + 0.35);
      g.gain.setValueAtTime(0.07 * vel, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.35);
      n.connect(filt(ctx, 'highpass', 500)).connect(filt(ctx, 'lowpass', 2600, 0.5)).connect(g).connect(out.dry);
      break;
    }
    case 'bell':
    case 'echo': {
      playChordNote(R, out, 'bell', t, dur, midi, vel * (kind === 'echo' ? 0.9 : 0.7), extra.pan || 0);
      break;
    }
    case 'swell': {
      const f = midiToFreq(midi);
      const end = t + dur + 0.05;
      const o1 = osc(ctx, 'sawtooth', f, t, end, R);
      const o2 = osc(ctx, 'sawtooth', f, t, end, R);
      o2.detune.value = 12;
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045 * vel, t + dur);
      g.gain.setTargetAtTime(0, t + dur, 0.015);
      const lp = filt(ctx, 'lowpass', 600, 1);
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.exponentialRampToValueAtTime(3500, t + dur);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(g).connect(out.dry);
      const w = gainNode(ctx, 0.4);
      g.connect(w).connect(out.wet);
      break;
    }
    case 'vox': {
      const f = midiToFreq(midi);
      const amp = gainNode(ctx);
      const end = adsr(amp.gain, t, dur, 0.012, 0.15, 0.6, 0.08, 0.3 * vel);
      const o = osc(ctx, 'sawtooth', f, t, end, R);
      const formants = extra.vowel === 'o' ? [[450, 1], [800, 0.6]] : [[800, 1], [1200, 0.5]];
      for (const [ff, lvl] of formants) {
        const g = gainNode(ctx, lvl);
        o.connect(filt(ctx, 'bandpass', ff, 7)).connect(g).connect(amp);
      }
      amp.connect(out.dry);
      const w = gainNode(ctx, 0.3);
      amp.connect(w).connect(out.wet);
      break;
    }
    case 'zap': {
      const f = midiToFreq(midi);
      const end = t + 0.25;
      const o = osc(ctx, 'square', f * 2, t, end, R);
      o.frequency.exponentialRampToValueAtTime(f / 2, t + 0.18);
      const g = gainNode(ctx);
      percEnv(g.gain, t, 0.002, 0.2, 0.07 * vel);
      o.connect(filt(ctx, 'lowpass', 3500)).connect(g).connect(out.dry);
      break;
    }
    case 'sweep': {
      const end = t + dur + 0.05;
      const n = noiseSrc(R, t, end);
      const bp = filt(ctx, 'bandpass', 500, 3);
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(3800, t + dur * 0.6);
      bp.frequency.exponentialRampToValueAtTime(900, t + dur);
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14 * vel, t + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp).connect(g).connect(out.dry);
      break;
    }
    default:
      break;
  }
}
