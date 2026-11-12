// 籃球音遊主程式：沿用 hoops 的 App（畫面流程、主迴圈、輸入、轉播），加上配樂、拍點判定、節拍 HUD。

import { App } from './hoops/app.js';
import { AudioSystem } from './hoops/audio/audio.js';
import { Stage, audioContext } from './audio/stage.js';
import { Deck } from './music/deck.js';
import { Conductor } from './music/conductor.js';
import { BeatBridge } from './game/beatbridge.js';
import { applyTactic, TACTIC_BY_DIR } from './music/tactics.js';
import { DEMOS } from './music/demos.js';
import { BeatHUD } from './ui/beathud.js';
import { BeatViz } from './ui/beatviz.js';
import * as HB from './ui/hbscreens.js';
import { songLabScreen } from './ui/songlab.js';
import { resolveSong } from './music/library.js';

const HB_DEFAULTS = { beatDifficulty: 'normal', latencyMs: 0, musicVolume: 0.85, metronome: false, homeSong: 'house120', awaySong: 'trap150', homeBpm: null, awayBpm: null };

AudioSystem.sharedContext = () => audioContext();

export class HoopbeatApp extends App {
  // hoops 的建構子會先呼叫 startDemo()／go()，所以自己的狀態用 hb() 延遲建立
  hb() {
    if (!this._hb) {
      this._hb = { stage: new Stage(), bridge: null, conductor: null, songsReady: false, pendingOverrides: null, preview: null };
    }
    return this._hb;
  }

  get stage() {
    return this.hb().stage;
  }

  get bridge() {
    return this.hb().bridge;
  }

  loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('hoopbeat.settings') || '{}'); } catch (e) { s = {}; }
    return Object.assign({}, HB_DEFAULTS, s);
  }

  saveSettings() {
    try { localStorage.setItem('hoopbeat.settings', JSON.stringify(this.settings)); } catch (e) { /* 無痕模式 */ }
  }

  setupHB() {
    if (this.beatHud) return;
    this.settings = Object.assign({}, HB_DEFAULTS, this.settings);
    this.beatHud = new BeatHUD(this);
    this.beatViz = new BeatViz(this.renderer);
    this.stage.musicVolume = this.settings.musicVolume;
    // 在 hoops 的每一幀裡插入：戰術配樂輸入（endFrame 之前）、節拍圈（render 之前）、節拍 HUD
    const origEnd = this.input.endFrame.bind(this.input);
    this.input.endFrame = () => { this.processDJ(); origEnd(); };
    const origUpd = this.renderer.update.bind(this.renderer);
    this.renderer.update = (dt, g, opts) => {
      origUpd(dt, g, opts);
      if (g === this.game && !this.demo) this.beatViz.update(dt, g, this.bridge);
      else this.beatViz.update(dt, g, null);
    };
    const origHud = this.hud.update.bind(this.hud);
    this.hud.update = (dt, g, r) => {
      origHud(dt, g, r);
      this.beatHud.update(dt, g, r);
    };
    // 投籃條改成跟著拍子走（有配樂時）；沒有配樂（例如標題畫面的示範賽）就用 hoops 原本的
    const origMeter = this.hud.updateMeter.bind(this.hud);
    this.hud.updateMeter = (dt, g, r) => (this.bridge && g === this.game ? this.beatHud.updateMeter(dt, g, r) : origMeter(dt, g, r));
    const origShow = this.hud.show.bind(this.hud);
    this.hud.show = (on) => { origShow(on); this.beatHud.show(on && !!this.bridge); };
    const unlock = () => { this.stage.init(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.input.on((type) => { if (type === 'activity') unlock(); });
    this.exposeHBDebug();
  }

  // ── 裝置 ──
  // 手把一接上就接手鍵盤的位置，鍵盤改成不下場（除非玩家自己在「手把分配」動過鍵盤）。
  // 不這樣做的話，鍵盤會一直佔著一個沒人操作的球員。
  onDevice(type, dev) {
    if (dev && dev.kind === 'gamepad' && !this.kbPinned) {
      const padSides = () => this.input.connectedDevices().filter((d) => d.kind === 'gamepad' && d.id !== dev.id).map((d) => this.assign.get(d.id) ?? 0);
      if (type === 'connected') {
        const kbSide = this.assign.get('kb') ?? 0;
        if (kbSide !== 0 && !(this.assign.get(dev.id) ?? 0)) {
          this.assign.set(dev.id, kbSide);
          this.assign.set('kb', 0);
        }
        // 比賽中：鍵盤玩家直接換成這支手把
        const g = this.game;
        if (g && !this.demo && !g.humans.some((h) => h.id === dev.id)) {
          const h = g.humans.find((x) => x.id === 'kb');
          if (h) {
            h.id = dev.id;
            this.pending.delete('kb');
            this.toast(`${h.label} 改用手把操作`, 'ok');
          }
        }
      } else if (type === 'disconnected') {
        // 最後一支手把拔掉：位置還給鍵盤
        const side = this.assign.get(dev.id) ?? 0;
        if (side !== 0 && (this.assign.get('kb') ?? 0) === 0 && !padSides().some((s) => s !== 0)) {
          this.assign.set('kb', side);
          this.assign.set(dev.id, 0);
        }
      }
    }
    super.onDevice(type, dev);
  }

  // ── 畫面 ──
  go(name, opts = {}) {
    this.setupHB();
    const mine = {
      title: () => HB.titleScreen(this),
      menu: () => HB.mainMenu(this),
      help: () => HB.helpScreen(this, opts),
      songs: () => HB.songSelectScreen(this),
      songlab: () => songLabScreen(this, opts),
      calib: () => HB.calibrationScreen(this, opts),
      rhythm: () => HB.rhythmSettingsScreen(this, opts),
    };
    if (this.screen && this.screen.dispose) this.screen.dispose();
    if (mine[name]) {
      this.screensEl.innerHTML = '';
      this.screenName = name;
      this.screen = mine[name]();
      this.screensEl.appendChild(this.screen.el);
      this.hud.show(!!this.game && !this.demo && !['title', 'menu', 'songs', 'songlab', 'calib', 'rhythm'].includes(name));
      return;
    }
    super.go(name, opts);
    if (name === 'results' || name === 'boxscore') HB.appendRhythmStats(this, this.screen);
  }

  // ── 比賽 ──
  startMatch(overrides = {}) {
    this.setupHB();
    const hb = this.hb();
    if (!hb.songsReady && !overrides.skipSongs) {
      hb.pendingOverrides = overrides;
      this.go('songs');
      return;
    }
    hb.songsReady = false;
    this.stopPreview();
    super.startMatch(overrides);
    this.attachMusic(overrides);
  }

  songFor(team) {
    const s = this.settings;
    const id = team === 0 ? s.homeSong : s.awaySong;
    const bpm = team === 0 ? s.homeBpm : s.awayBpm;
    return resolveSong(id, bpm);
  }

  attachMusic(overrides = {}) {
    const hb = this.hb();
    const songs = overrides.songs || [this.songFor(0), this.songFor(1)];
    const decks = {
      home: new Deck({ id: 'home', ...songs[0] }),
      away: new Deck({ id: 'away', ...songs[1] }),
    };
    const conductor = new Conductor(decks);
    const fast = this.timeScale > 1;
    const bridge = new BeatBridge({
      conductor,
      clock: fast ? null : () => this.stage.audibleNow(),
      headless: fast,
      difficulty: this.settings.beatDifficulty,
      latencyMs: this.settings.latencyMs,
    }).install(this.game);
    hb.conductor = conductor;
    hb.bridge = bridge;
    // 鍵盤：用按鍵事件的時間判定（比每一幀讀一次精確）
    const KEY_OF = { shot: 'KeyJ', steal: 'KeyJ', pass: 'KeyK', dribble: 'KeyL', block: 'KeyI' };
    bridge.humanTime = (p, kind, edge) => {
      if (bridge.headless) return null;
      const h = this.game.humans.find((x) => x.player === p);
      if (!h || h.id !== 'kb') return null;
      const map = edge === 'up' ? this.input.keyUpAt : this.input.keyDownAt;
      const ts = map.get(KEY_OF[kind]);
      return ts === undefined ? null : this.stage.audibleNow(ts);
    };
    if (!fast) this.stage.play(conductor, 'home');
    this.beatHud.setup(bridge, this.game);
    this.beatHud.show(true);
  }

  quitToMenu() {
    this.stage.stop();
    this.hb().bridge = null;
    super.quitToMenu();
  }

  startDemo() {
    if (this._hb) {
      this._hb.bridge = null;
      if (this._hb.stage) this._hb.stage.stop();
    }
    super.startDemo();
  }

  pause(reason) {
    super.pause(reason);
  }

  // ── 戰術配樂（十字鍵／肩鍵／數字鍵） ──
  processDJ() {
    const g = this.game;
    const br = this.bridge;
    if (!g || this.demo || !br || this.screen || this.paused) return;
    for (const h of g.humans) {
      const inp = this.input.gameInput(h.id);
      const dj = inp.dj;
      if (!dj) continue;
      const deck = br.deck(h.team);
      let did = null;
      for (const dir of ['up', 'down', 'left', 'right']) {
        if (dj[dir]) {
          const t = TACTIC_BY_DIR[dir];
          applyTactic(deck, t.id);
          did = `${t.icon} ${t.name}`;
        }
      }
      if (dj.prev) { deck.jumpSection(-1); did = '上一段'; }
      if (dj.next) { deck.jumpSection(1); did = '下一段'; }
      if (dj.reset) { deck.resetLive(); did = '回到原曲'; }
      if (dj.view) {
        const v = this.beatHud.cycleView();
        this.hud.showTicker(`音樂面板：${v}`, 1.2);
      }
      if (did) {
        this.audio.ui('move');
        const wait = deck.playing ? '（下一小節生效）' : '（已換好，換你進攻時會播）';
        this.hud.showTicker(`${h.label} ${g.teams[h.team].data.abbr}：${did}${wait}`, 1.8);
      }
    }
  }

  tick(dt, now) {
    // 加速模擬：拍點改用模擬時間，配樂停掉
    const br = this.bridge;
    if (br && this.game && !this.demo) {
      const fast = this.timeScale > 1;
      if (fast && !br.headless) { br.setClock(null, true); this.stage.stop(); }
      else if (!fast && br.headless) { br.setClock(() => this.stage.audibleNow(), false); this.stage.play(br.conductor, br.conductor.audible); }
    }
    super.tick(dt, now);
  }

  handleEvents(g) {
    if (g.events.length && !this.demo && this.beatHud) {
      this.beatHud.onEvents(g.events, g, this.renderer);
      for (const e of g.events) if (e.type === 'beatJudge') this.beatViz.onJudge(e);
    }
    super.handleEvents(g);
  }

  // ── 選歌時的試聽 ──
  previewSong(song) {
    this.stopPreview();
    if (!song) return;
    const deck = new Deck({ id: 'preview', ...song });
    const c = new Conductor({ preview: deck });
    this.hb().preview = c;
    this.stage.play(c, 'preview');
  }

  stopPreview() {
    const hb = this.hb();
    if (hb.preview) {
      this.stage.stop();
      hb.preview = null;
    }
  }

  exposeHBDebug() {
    const app = this;
    window.__hoopbeat = {
      app,
      get bridge() { return app.bridge; },
      get game() { return app.game; },
      startMatch(opts = {}) {
        if (opts.home) app.settings.home = opts.home;
        if (opts.away) app.settings.away = opts.away;
        if (opts.homeSong) app.settings.homeSong = opts.homeSong;
        if (opts.awaySong) app.settings.awaySong = opts.awaySong;
        if (opts.quarterMinutes) app.settings.quarterMinutes = opts.quarterMinutes;
        app.mode = opts.cpuOnly ? 'watch' : 'play';
        app.startMatch({ ...opts, skipSongs: true });
        return true;
      },
      demos: DEMOS.map((d) => d.id),
      state() {
        const br = app.bridge;
        if (!br) return null;
        return {
          audible: br.conductor.audible,
          bpm: [br.deck(0).bpm, br.deck(1).bpm],
          tactic: [br.deck(0).tactic, br.deck(1).tactic],
          combo: br.combos.map((c) => c.count),
          stats: br.stats,
          judgments: br.judgments.slice(-10).map((j) => ({ grade: j.grade, kind: j.kind, human: j.human, offsetMs: Math.round(j.offsetMs) })),
          speed: br.mods.map((m) => +m.speed.toFixed(3)),
        };
      },
    };
  }
}

export { resolveSong };
