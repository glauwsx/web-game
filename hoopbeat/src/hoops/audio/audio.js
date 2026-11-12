// 音效：全部用 Web Audio 即時合成，不載入任何音檔。

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.lastPlay = {};
  }

  // 必須在使用者操作後呼叫
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = (AudioSystem.sharedContext && AudioSystem.sharedContext()) || new AC(); // HOOPBEAT: 跟配樂共用一個 AudioContext
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);
      this.crowdBus = c.createGain();
      this.crowdBus.gain.value = 0.0;
      this.crowdBus.connect(this.master);
      this.noiseBuf = this.makeNoise(2.0);
      this.startCrowd();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  makeNoise(sec) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      // 粉紅雜訊近似
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }

  ok(name, gap = 0.03) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return false;
    const t = this.ctx.currentTime;
    if (this.lastPlay[name] && t - this.lastPlay[name] < gap) return false;
    this.lastPlay[name] = t;
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.005, dest = null } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    src.start(t, Math.random() * 1.0, attack + dur + 0.05);
    return { src, f, g };
  }

  tone(t, freq, dur, { type = 'sine', gain = 0.3, attack = 0.004, slide = null, dest = null } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + attack + dur + 0.05);
    return { o, g };
  }

  // 運球／球落地
  bounce(intensity = 1, pan = 0) {
    if (!this.ok('bounce', 0.04)) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, intensity);
    this.tone(t, 140 + v * 30, 0.09, { gain: 0.35 * v + 0.05, slide: 60 });
    this.noise(t, 0.05, { freq: 900, q: 0.8, gain: 0.12 * v });
    void pan;
  }

  // 籃框金屬聲
  rim(intensity = 1) {
    if (!this.ok('rim', 0.05)) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, 0.3 + intensity * 0.25);
    for (const [f, g, d] of [[612, 0.16, 0.5], [1347, 0.09, 0.35], [2290, 0.05, 0.22], [3120, 0.03, 0.15]]) {
      this.tone(t, f * (0.98 + Math.random() * 0.04), d, { gain: g * v, type: 'triangle' });
    }
    this.noise(t, 0.04, { freq: 3000, q: 2, gain: 0.15 * v });
  }

  board(intensity = 1) {
    if (!this.ok('board', 0.06)) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, 0.4 + intensity * 0.2);
    this.tone(t, 220, 0.16, { gain: 0.25 * v, slide: 120, type: 'triangle' });
    this.noise(t, 0.12, { freq: 500, q: 0.7, gain: 0.25 * v });
  }

  swish() {
    if (!this.ok('swish', 0.2)) return;
    const t = this.ctx.currentTime;
    const n = this.noise(t, 0.32, { type: 'bandpass', freq: 2600, q: 0.6, gain: 0.35, attack: 0.03 });
    n.f.frequency.setValueAtTime(3400, t);
    n.f.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
  }

  whistle() {
    if (!this.ok('whistle', 0.3)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const dur = 0.55;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.setValueAtTime(0.22, t + dur - 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // 哨子的滾珠顫音
    const trem = c.createGain();
    trem.gain.value = 0.6;
    const lfo = c.createOscillator();
    lfo.frequency.value = 32;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain); lfoGain.connect(trem.gain);
    for (const f of [2750, 2920]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(trem);
      o.start(t); o.stop(t + dur + 0.05);
    }
    trem.connect(g); g.connect(this.sfx);
    lfo.start(t); lfo.stop(t + dur + 0.05);
    this.noise(t, dur * 0.9, { freq: 2850, q: 8, gain: 0.05, attack: 0.02 });
  }

  buzzer(short = false) {
    if (!this.ok('buzzer', 0.4)) return;
    const t = this.ctx.currentTime;
    const dur = short ? 0.5 : 1.3;
    const c = this.ctx;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.setValueAtTime(0.18, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const fr of [196, 198.5, 392]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.05);
    }
    f.connect(g); g.connect(this.sfx);
  }

  squeak() {
    if (!this.ok('squeak', 0.35)) return;
    const t = this.ctx.currentTime;
    this.tone(t, 1900 + Math.random() * 900, 0.07, { gain: 0.05, slide: 2600 + Math.random() * 800, type: 'sine' });
  }

  pass() {
    if (!this.ok('pass', 0.06)) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.08, { freq: 700, q: 0.7, gain: 0.05, attack: 0.02 });
  }

  catchBall() {
    if (!this.ok('catch', 0.06)) return;
    const t = this.ctx.currentTime;
    this.tone(t, 180, 0.05, { gain: 0.12, slide: 110 });
  }

  ui(kind = 'move') {
    if (!this.ok('ui' + kind, 0.03)) return;
    const t = this.ctx.currentTime;
    if (kind === 'move') this.tone(t, 660, 0.05, { gain: 0.06, type: 'triangle' });
    else if (kind === 'select') { this.tone(t, 880, 0.08, { gain: 0.08, type: 'triangle' }); this.tone(t + 0.06, 1320, 0.1, { gain: 0.06, type: 'triangle' }); }
    else if (kind === 'back') this.tone(t, 440, 0.08, { gain: 0.07, type: 'triangle', slide: 330 });
    else if (kind === 'perfect') { this.tone(t, 1046, 0.12, { gain: 0.07, type: 'sine' }); this.tone(t + 0.05, 1568, 0.16, { gain: 0.06, type: 'sine' }); }
  }

  startCrowd() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.5;
    const f2 = c.createBiquadFilter();
    f2.type = 'lowpass'; f2.frequency.value = 2400;
    const g = c.createGain();
    g.gain.value = 0.35;
    // 群眾聲起伏
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = c.createGain();
    lg.gain.value = 0.08;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(f2); f2.connect(g); g.connect(this.crowdBus);
    src.start(); lfo.start();
    this.crowdFilter = f;
  }

  setCrowd(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.crowdBus.gain.setTargetAtTime(level, t, 0.4);
  }

  cheer(strength = 1) {
    if (!this.ok('cheer', 0.5)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const dur = 1.6 + strength;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28 * strength, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.1);
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1500, t + 0.3);
    f.frequency.linearRampToValueAtTime(1000, t + dur);
  }

  groan() {
    if (!this.ok('groan', 0.8)) return;
    const t = this.ctx.currentTime;
    const n = this.noise(t, 0.9, { type: 'bandpass', freq: 500, q: 0.6, gain: 0.12, attack: 0.1 });
    n.f.frequency.setValueAtTime(700, t);
    n.f.frequency.exponentialRampToValueAtTime(320, t + 0.9);
  }

  // ---------- 選單音樂：用合成器即時演奏的循環 ----------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    const c = this.ctx;
    this.musicOn = true;
    if (!this.musicBus) {
      this.musicBus = c.createGain();
      this.musicBus.connect(this.master);
    }
    this.musicBus.gain.cancelScheduledValues(c.currentTime);
    this.musicBus.gain.setValueAtTime(0.0001, c.currentTime);
    this.musicBus.gain.exponentialRampToValueAtTime(0.16, c.currentTime + 1.5);
    this.step = 0;
    this.nextNote = c.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 60);
  }

  stopMusic() {
    if (!this.musicOn) return;
    this.musicOn = false;
    clearInterval(this.musicTimer);
    if (this.ctx && this.musicBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    }
  }

  scheduleMusic() {
    const c = this.ctx;
    const stepDur = 60 / 98 / 4;
    // A 小調：Am - F - C - G
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const bassPat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0];
    const kickPat = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    while (this.nextNote < c.currentTime + 0.25) {
      const t = this.nextNote;
      const st = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const ch = chords[bar];
      const d = this.musicBus;
      if (kickPat[st]) this.tone(t, 110, 0.18, { gain: 0.5, slide: 42, dest: d });
      if (st === 4 || st === 12) this.noise(t, 0.12, { freq: 1900, q: 0.8, gain: 0.22, dest: d });
      if (st % 2 === 0) this.noise(t, 0.03, { type: 'highpass', freq: 7000, q: 0.5, gain: st % 4 === 2 ? 0.1 : 0.05, dest: d });
      if (bassPat[st]) this.tone(t, mtof(ch[0] - 24 + (st === 10 ? 7 : 0)), stepDur * 1.6, { type: 'sawtooth', gain: 0.12, dest: d });
      if (st === 0) for (const n of ch) this.tone(t, mtof(n), stepDur * 14, { type: 'triangle', gain: 0.035, attack: 0.2, dest: d });
      if (st === 7 || st === 15) this.tone(t, mtof(ch[(this.step >> 4) % 3] + 12), stepDur * 1.5, { type: 'square', gain: 0.025, dest: d });
      this.nextNote += stepDur;
      this.step++;
    }
  }

  // 依比賽事件播放
  onEvents(events, game) {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case 'bounce': this.bounce(e.dribble ? 0.7 : Math.min(1, (e.speed || 2) / 6)); break;
        case 'rim': this.rim(e.speed || 2); break;
        case 'board': this.board(e.speed || 2); break;
        case 'score':
          if (e.kind !== 'dunk') this.swish(); else this.rim(4);
          this.cheer(e.points === 3 || e.kind === 'dunk' ? 1.3 : e.kind === 'ft' ? 0.5 : 0.9);
          break;
        case 'whistle': this.whistle(); break;
        case 'buzzer': this.buzzer(e.short); break;
        case 'pass': this.pass(); break;
        case 'dribbleMove': this.squeak(); break;
        case 'block': this.board(3); this.cheer(1.1); break;
        case 'steal': this.cheer(0.9); break;
        case 'shot': if (e.human && e.timing === 'perfect') this.ui('perfect'); break;
        default: break;
      }
    }
    void game;
  }
}
