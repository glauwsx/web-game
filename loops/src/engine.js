// 即時播放引擎：AudioContext、提前排程、量化切換片段、歌曲播放、錄音。

import { buildGraph } from './mixer.js';
import { scheduleBar } from './player.js';
import { LiveState, Scheduler } from './transport.js';
import { planSongBar, sectionStartBar, songTotalBars } from './song.js';
import { GENRES, TRACK_IDS } from './genres.js';
import { barDuration } from './generator.js';

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

export class Engine {
  constructor(getState) {
    this.getState = getState; // () => ({ bank, song, mixer })
    this.ctx = null;
    this.graph = null;
    this.run = null;
    this.mode = 'stopped'; // stopped | live | song
    this.live = new LiveState(TRACK_IDS);
    this.timeline = [];
    this.lastPlan = null;
    this.rec = null;
    this.switchToLive = false;
    this.listeners = {};
    this.gains = {};
    this.songEndTimer = null;
    this.scheduler = new Scheduler({
      lookahead: LOOKAHEAD,
      getBarDur: () => barDuration(this.getState().bank.bpm),
      onBar: (bar, time, dur) => this.onBar(bar, time, dur),
    });
    this.timer = makeTimer(() => this.tick());
  }

  on(evt, fn) {
    (this.listeners[evt] ||= []).push(fn);
  }

  emit(evt, data) {
    for (const fn of this.listeners[evt] || []) fn(data);
  }

  get ready() {
    return !!this.ctx;
  }

  async init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.graph = buildGraph(this.ctx);
      this.applyGenre();
      this.applyMixer();
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch (e) { /* 不支援就算了 */ }
    }
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch (e) { /* 等下一次手勢 */ }
    }
  }

  applyGenre() {
    if (!this.graph) return;
    const { bank } = this.getState();
    this.graph.setGenre(GENRES[bank.genre].sound, bank.bpm);
  }

  applyMixer() {
    if (!this.graph) return;
    this.gains = this.graph.applyMixer(this.getState().mixer);
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // 耳朵現在聽到的時間（扣掉輸出延遲）
  audibleTime() {
    if (!this.ctx) return 0;
    const lat = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return this.ctx.currentTime - Math.min(lat, 0.2);
  }

  tick() {
    if (this.scheduler.running && this.ctx) this.scheduler.tick(this.ctx.currentTime);
  }

  startTransport(firstBar = 0) {
    this.run = this.graph.newRun();
    this.timeline = [];
    this.lastPlan = null;
    this.scheduler.start(this.ctx.currentTime + 0.06, firstBar);
    this.timer.start();
    this.tick();
  }

  onBar(bar, time, dur) {
    const { bank, song } = this.getState();
    let plan = null;
    let section = null;
    if (this.mode === 'song' && this.switchToLive) {
      this.switchToLive = false;
      this.live.adopt(this.lastPlan, bar, bank);
      this.mode = 'live';
      this.emit('mode', 'live');
    }
    if (this.mode === 'song') {
      if (bar >= songTotalBars(song)) {
        this.finishSong(time);
        return 'stop';
      }
      plan = planSongBar(song, bar, bank);
      if (!plan) {
        this.finishSong(time);
        return 'stop';
      }
      section = plan.section;
    } else {
      const launched = this.live.advance(bar);
      if (launched.length) this.emit('launch', launched);
      plan = this.live.plan(bar, bank);
    }
    if (this.rec) {
      if (this.rec.armed) {
        this.rec.armed = false;
        this.rec.startBar = bar;
        this.rec.startTime = time;
        this.emit('rec', { state: 'recording', startTime: time });
      }
      this.rec.entries.push({ bar, time, dur, plan });
    }
    scheduleBar({ graph: this.graph, run: this.run, bank, plan, time, audible: (t) => (this.gains[t] ?? 1) > 0 });
    this.lastPlan = plan;
    this.timeline.push({ bar, time, dur, plan, mode: this.mode, section });
    if (this.timeline.length > 16) this.timeline.shift();
    return null;
  }

  finishSong(time) {
    const delay = Math.max(0, (time - this.ctx.currentTime) * 1000 + 300);
    clearTimeout(this.songEndTimer);
    this.songEndTimer = setTimeout(() => {
      if (this.mode === 'song') this.stop();
      this.emit('songEnd');
    }, delay);
  }

  // ── 現場模式 ──

  async queueClip(track, clip) {
    await this.init();
    if (this.mode === 'song') this.switchToLive = true;
    this.live.queue(track, clip);
    if (this.mode === 'stopped') {
      this.mode = 'live';
      this.live.clear();
      this.live.queue(track, clip);
      this.startTransport(0);
      this.emit('mode', 'live');
    }
    this.emit('queue', { track, clip });
  }

  queueStop(track) {
    if (this.mode === 'song') {
      this.switchToLive = true;
      // 切回現場時會接續播放，這裡記住要停的軌道
    }
    this.live.queueStop(track);
    if (this.mode === 'song') this.live.pending[track] = { stop: true };
    this.emit('queue', { track, clip: null });
  }

  queueAllStop() {
    for (const t of TRACK_IDS) this.queueStop(t);
  }

  async startLive(defaults) {
    await this.init();
    if (this.mode !== 'stopped') return;
    if (!this.live.hasAnything() && defaults) {
      for (const [t, c] of Object.entries(defaults)) if (c !== null && c !== undefined) this.live.queue(t, c);
    }
    this.mode = 'live';
    this.startTransport(0);
    this.emit('mode', 'live');
  }

  // ── 歌曲模式 ──

  async playSong(fromSection = 0) {
    await this.init();
    const { song } = this.getState();
    if (!songTotalBars(song)) return false;
    if (this.mode !== 'stopped') this.stop(true);
    this.mode = 'song';
    this.switchToLive = false;
    this.live.clear();
    this.startTransport(sectionStartBar(song, fromSection));
    this.emit('mode', 'song');
    return true;
  }

  stop(silent = false) {
    if (this.rec) this.stopRecording();
    clearTimeout(this.songEndTimer);
    this.scheduler.stop();
    this.timer.stop();
    if (this.run && this.ctx) this.run.stop(this.ctx.currentTime);
    this.run = null;
    this.mode = 'stopped';
    this.switchToLive = false;
    this.live.clear();
    this.timeline = [];
    this.lastPlan = null;
    if (!silent) this.emit('mode', 'stopped');
  }

  // ── 錄音 ──

  async startRecording(defaults) {
    await this.init();
    this.rec = { armed: true, entries: [] };
    this.emit('rec', { state: 'armed' });
    if (this.mode === 'stopped') await this.startLive(defaults);
  }

  stopRecording() {
    if (!this.rec) return [];
    const now = this.audibleTime();
    const entries = this.rec.entries.filter((e) => e.time < now - 0.2 * e.dur);
    this.rec = null;
    this.emit('rec', { state: 'idle', entries });
    return entries;
  }

  get recording() {
    return this.rec ? (this.rec.armed ? 'armed' : 'recording') : 'idle';
  }

  // ── 給介面用：現在聽到的是哪一個小節 ──

  position() {
    if (this.mode === 'stopped' || !this.timeline.length) return null;
    const t = this.audibleTime();
    let cur = null;
    for (const e of this.timeline) if (e.time <= t) cur = e;
    if (!cur) return { waiting: true, mode: this.mode, next: this.timeline[0] };
    const frac = Math.min(0.9999, Math.max(0, (t - cur.time) / cur.dur));
    return { ...cur, frac, beat: Math.floor(frac * 4), beatFrac: (frac * 4) % 1 };
  }

  level() {
    if (!this.graph) return 0;
    const a = this.graph.analyser;
    const buf = this.levelBuf || (this.levelBuf = new Float32Array(a.fftSize));
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }
}
