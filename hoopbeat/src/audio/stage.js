// 瀏覽器的音訊層：每台配樂台一組 loops 混音台，指揮決定現在播哪一台。
// 也負責比賽音效（運球、進球、哨聲……），全部用程式合成。

import { buildGraph } from '../loops/mixer.js';
import { scheduleBar } from '../loops/player.js';
import { GENRES } from '../loops/genres.js';

const LOOKAHEAD = 0.15;

function makeTimer(cb) {
  // 用 Worker 當計時器：分頁在背景時比較不會被節流
  try {
    const src = 'let id=null;onmessage=e=>{if(e.data==="start"){clearInterval(id);id=setInterval(()=>postMessage(0),25);}else{clearInterval(id);}}';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = cb;
    return { start: () => w.postMessage('start'), stop: () => w.postMessage('stop') };
  } catch (e) {
    let id = null;
    return { start: () => { clearInterval(id); id = setInterval(cb, 25); }, stop: () => clearInterval(id) };
  }
}

let sharedCtx = null;
export function audioContext() {
  if (!sharedCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new AC({ latencyHint: 'interactive' });
  }
  return sharedCtx;
}

export class Stage {
  constructor() {
    this.ctx = null;
    this.conductor = null;
    this.graphs = {};
    this.runs = {};
    this.timer = makeTimer(() => this.tick());
    this.musicVolume = 0.9;
    this.sfxVolume = 0.8;
    this.peak = 0;
    this.onBar = null;
  }

  async init() {
    this.ctx = audioContext();
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch (e) { /* 等下一次手勢 */ }
    }
    if (!this.sfxOut) {
      this.sfxOut = this.ctx.createGain();
      this.sfxOut.gain.value = this.sfxVolume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      this.sfxOut.connect(comp).connect(this.ctx.destination);
      this.noise = this.makeNoise();
    }
    return this.ctx;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  // 耳朵「現在」聽到的是音訊時鐘的哪個時間。perfTime 可以給按鍵事件的時間（performance.now 的單位）
  audibleNow(perfTime = performance.now()) {
    const ctx = this.ctx;
    if (!ctx) return perfTime / 1000;
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + (perfTime - ts.performanceTime) / 1000;
    }
    return ctx.currentTime - this.outputLatency() - (performance.now() - perfTime) / 1000;
  }

  // 耳朵現在聽到的時間（扣掉輸出延遲）
  outputLatency() {
    if (!this.ctx) return 0;
    return Math.min(0.2, this.ctx.outputLatency || this.ctx.baseLatency || 0);
  }

  graphFor(deck) {
    let g = this.graphs[deck.id];
    if (!g || g.ctx !== this.ctx) {
      g = buildGraph(this.ctx);
      g.out.gain.value = 0;
      this.graphs[deck.id] = g;
    }
    g.setGenre(GENRES[deck.bank.genre].sound, deck.bpm);
    g.applyMixer(deck.mixer || {});
    return g;
  }

  // 開始播：conductor 決定播哪一台。AudioContext 已經建立時是同步的（拍點格線馬上可以用）
  play(conductor, firstDeckId) {
    if (!this.ctx) this.ctx = audioContext();
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (!this.sfxOut) this.init();
    this.stop();
    this.conductor = conductor;
    for (const d of Object.values(conductor.decks)) {
      const g = this.graphFor(d);
      this.runs[d.id] = g.newRun();
    }
    conductor.start(this.ctx.currentTime + 0.12, firstDeckId);
    this.timer.start();
    this.tick();
  }

  // 配樂台換了 bank（重新生成）之後呼叫
  refreshDeck(deck) {
    if (!this.ctx) return;
    this.graphFor(deck);
  }

  stop() {
    this.timer.stop();
    if (this.conductor) this.conductor.stop();
    const t = this.ctx ? this.ctx.currentTime : 0;
    for (const id of Object.keys(this.runs)) this.runs[id].stop(t);
    for (const g of Object.values(this.graphs)) g.out.gain.setTargetAtTime(0, t, 0.05);
    this.runs = {};
    this.conductor = null;
  }

  pause() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  tick() {
    if (!this.conductor || !this.ctx) return;
    this.conductor.tick(this.ctx.currentTime, LOOKAHEAD, (deck, res, time) => {
      const g = this.graphs[deck.id];
      if (!g) return;
      // 換台：新的一台淡入、舊的淡出（留一點殘響尾巴）
      for (const [id, other] of Object.entries(this.graphs)) {
        const on = id === deck.id;
        other.out.gain.cancelScheduledValues(time);
        other.out.gain.setTargetAtTime(on ? this.musicVolume : 0, time - (on ? 0.01 : 0), on ? 0.01 : 0.12);
      }
      if (g.hbBpm !== deck.bpm) {
        g.hbBpm = deck.bpm;
        g.setGenre(GENRES[deck.bank.genre].sound, deck.bpm);
      }
      scheduleBar({ graph: g, run: this.runs[deck.id], bank: deck.playBank(), plan: res.plan, time, audible: () => true });
      if (this.onBar) this.onBar(deck, res, time);
    });
    this.measurePeak();
  }

  measurePeak() {
    const id = this.conductor?.audible;
    const g = id && this.graphs[id];
    if (!g) return;
    const a = g.analyser;
    const buf = this.peakBuf || (this.peakBuf = new Float32Array(a.fftSize));
    a.getFloatTimeDomainData(buf);
    let p = 0;
    for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
    this.peak = Math.max(p, this.peak * 0.995);
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.conductor) {
      const g = this.graphs[this.conductor.audible];
      if (g) g.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxOut) this.sfxOut.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // ── 音效 ──

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x3fffffff - 1);
    }
    return buf;
  }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  tone(freq, t, dur, { type = 'sine', vol = 0.3, slide = null } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.004, vol, dur);
    o.connect(g).connect(this.sfxOut);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseHit(t, dur, { freq = 2000, q = 1, vol = 0.3, type = 'bandpass' } = {}) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, vol, dur);
    s.connect(f).connect(g).connect(this.sfxOut);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  sfx(name, opts = {}) {
    if (!this.ctx || !this.sfxOut || this.ctx.state !== 'running') return;
    const t = (opts.at ?? this.ctx.currentTime) + 0.005;
    switch (name) {
      case 'bounce':
        this.tone(95, t, 0.09, { vol: 0.35, slide: 55 });
        this.noiseHit(t, 0.03, { freq: 900, vol: 0.12 });
        break;
      case 'swish':
        this.noiseHit(t, 0.28, { freq: 3200, q: 0.6, vol: 0.22, type: 'highpass' });
        break;
      case 'rim':
        this.tone(520, t, 0.25, { type: 'triangle', vol: 0.18 });
        this.tone(830, t, 0.18, { type: 'triangle', vol: 0.1 });
        break;
      case 'board':
        this.noiseHit(t, 0.12, { freq: 400, q: 0.8, vol: 0.3 });
        break;
      case 'whistle':
        this.tone(2900, t, 0.35, { type: 'sine', vol: 0.18 });
        this.tone(3020, t, 0.35, { type: 'sine', vol: 0.1 });
        break;
      case 'buzzer':
        this.tone(220, t, 0.9, { type: 'square', vol: 0.12 });
        this.tone(223, t, 0.9, { type: 'sawtooth', vol: 0.08 });
        break;
      case 'steal':
        this.noiseHit(t, 0.06, { freq: 1800, vol: 0.3 });
        this.tone(660, t, 0.08, { type: 'square', vol: 0.08, slide: 330 });
        break;
      case 'block':
        this.noiseHit(t, 0.15, { freq: 300, vol: 0.4 });
        this.tone(140, t, 0.2, { type: 'square', vol: 0.12, slide: 60 });
        break;
      case 'pass':
        this.noiseHit(t, 0.05, { freq: 1200, q: 2, vol: 0.12 });
        break;
      case 'perfect':
        this.tone(1568, t, 0.25, { type: 'triangle', vol: 0.12 });
        this.tone(2349, t + 0.04, 0.3, { type: 'sine', vol: 0.08 });
        break;
      case 'great':
        this.tone(1175, t, 0.18, { type: 'triangle', vol: 0.1 });
        break;
      case 'good':
        this.tone(880, t, 0.12, { type: 'sine', vol: 0.08 });
        break;
      case 'miss':
        this.tone(180, t, 0.18, { type: 'sawtooth', vol: 0.06, slide: 120 });
        break;
      case 'tick':
        this.tone(opts.strong ? 1760 : 1320, t, 0.05, { type: 'sine', vol: opts.strong ? 0.25 : 0.15 });
        break;
      case 'cheer':
        for (let i = 0; i < 6; i++) this.noiseHit(t + i * 0.05, 0.9, { freq: 1200 + i * 200, q: 0.5, vol: 0.05 });
        break;
      case 'ui':
        this.tone(opts.freq || 660, t, 0.06, { type: 'triangle', vol: 0.08 });
        break;
      default:
        break;
    }
  }
}
