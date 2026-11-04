// 遊戲主程式：畫面流程、主迴圈（固定時間步長）、輸入分配、測試用除錯介面。
import { Game } from './sim/game.js';
import { SIM_DT } from './sim/constants.js';
import { TEAMS, getTeam } from './data/teams.js';
import { GameRenderer } from './render/renderer.js';
import { InputManager } from './input/input.js';
import { AudioSystem } from './audio/audio.js';
import { HUD } from './ui/hud.js';
import * as S from './ui/screens.js';
import { emptyInput } from './sim/control.js';

const DEFAULTS = { home: 'owls', away: 'rhinos', difficulty: 'normal', quarterMinutes: 3, autoSub: true, camera: 'broadcast', volume: 0.8 };

export class App {
  constructor() {
    this.settings = Object.assign({}, DEFAULTS, this.loadSettings());
    this.input = new InputManager();
    this.audio = new AudioSystem();
    this.audio.setVolume(this.settings.volume);
    this.renderer = new GameRenderer(document.getElementById('gl'));
    this.hud = new HUD(this);
    this.screensEl = document.getElementById('screens');
    this.toastsEl = document.getElementById('toasts');
    this.assign = new Map([['kb', -1]]);
    this.mode = 'play';
    this.screen = null;
    this.screenName = '';
    this.game = null;
    this.demo = true;
    this.paused = false;
    this.timeScale = 1;
    this.renderEnabled = true;
    this.acc = 0;
    this.last = performance.now();
    this.pending = new Map();
    this.stepHooks = [];
    this.perf = { frames: 0, t0: performance.now(), fps: 60, slow: 0, quality: 2 };
    this.errors = [];

    this.input.on((type, dev) => this.onDevice(type, dev));
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.input.on((type) => { if (type === 'activity') unlock(); });

    // 切到別的分頁時自動暫停
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && !this.demo && !this.paused && !this.screen && this.timeScale <= 1) this.pause();
    });

    this.startDemo();
    this.go('title');
    this.exposeDebug();
    requestAnimationFrame((t) => this.frame(t));
  }

  loadSettings() {
    try { return JSON.parse(localStorage.getItem('steelrim.settings') || '{}'); } catch (e) { return {}; }
  }
  saveSettings() {
    try { localStorage.setItem('steelrim.settings', JSON.stringify(this.settings)); } catch (e) { /* 無痕模式可能不能存 */ }
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.toastsEl.appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }

  onDevice(type, dev) {
    if (type === 'connected') {
      this.toast(`已連接：${dev.name} #${dev.index + 1}`, 'ok');
      if (!this.assign.has(dev.id)) this.assign.set(dev.id, 0);
      if (this.screen && this.screen.refresh) this.screen.refresh();
      // 比賽中重新插回原本的手把
      if (this.game && !this.demo && this.paused && this.pauseReason && this.game.humans.some((h) => h.id === dev.id)) {
        this.pauseReason = null;
        this.toast('手把已重新連接，按繼續就能回到比賽', 'ok');
      }
    } else if (type === 'disconnected') {
      this.toast(`手把已中斷：${dev.name} #${dev.index + 1}`, 'warn');
      if (this.screen && this.screen.refresh) this.screen.refresh();
      if (this.game && !this.demo && this.game.humans.some((h) => h.id === dev.id) && !this.paused) {
        this.pauseReason = '手把已中斷，請重新連接，或改用其他裝置繼續。';
        this.pause(this.pauseReason);
      }
    }
  }

  // ---------- 畫面 ----------
  go(name, opts = {}) {
    const makers = {
      title: () => S.titleScreen(this),
      menu: () => S.mainMenu(this),
      teams: () => S.teamSelect(this),
      controllers: () => S.controllerAssign(this),
      settings: () => S.settingsScreen(this),
      help: () => S.helpScreen(this, opts),
      pause: () => S.pauseScreen(this, { reason: this.pauseReason }),
      break: () => S.periodBreakScreen(this),
      boxscore: () => S.boxScoreScreen(this, opts),
      results: () => S.boxScoreScreen(this, { final: true }),
    };
    this.screensEl.innerHTML = '';
    this.screen = null;
    this.screenName = name;
    if (name && makers[name]) {
      this.screen = makers[name]();
      this.screensEl.appendChild(this.screen.el);
    }
    this.hud.show(!!this.game && !this.demo && !['title', 'menu', 'teams', 'controllers', 'settings'].includes(name));
    document.body.classList.toggle('menu-open', !!this.screen);
  }

  closeScreens() {
    document.body.classList.remove('menu-open');
    this.screensEl.innerHTML = '';
    this.screen = null;
    this.screenName = '';
    this.hud.show(!!this.game && !this.demo);
  }

  // ---------- 比賽 ----------
  startDemo() {
    const keys = TEAMS.map((t) => t.key);
    const a = keys[Math.floor(Math.random() * keys.length)];
    let b = keys[Math.floor(Math.random() * keys.length)];
    if (b === a) b = keys[(keys.indexOf(a) + 1) % keys.length];
    this.game = new Game({ home: getTeam(a), away: getTeam(b), quarterMinutes: 2, difficulty: 'normal', autoContinue: true, humans: [] });
    this.game.start();
    this.demo = true;
    this.paused = false;
    this.renderer.setupMatch(this.game);
    this.hud.setupMatch(this.game);
  }

  startMatch(overrides = {}) {
    const s = Object.assign({}, this.settings, overrides);
    const humans = [];
    if (this.mode !== 'watch' && !overrides.cpuOnly) {
      const devs = this.input.connectedDevices();
      const pads = devs.filter((d) => d.kind === 'gamepad').slice(0, 2);
      const order = [devs.find((d) => d.id === 'kb'), ...pads].filter(Boolean);
      for (const d of order) {
        const side = this.assign.get(d.id) ?? 0;
        if (side !== 0) humans.push({ id: d.id, team: side < 0 ? 0 : 1 });
      }
      // 每隊最多 2 位玩家
      for (const t of [0, 1]) {
        const mine = humans.filter((h) => h.team === t);
        while (mine.length > 2) { const x = mine.pop(); humans.splice(humans.indexOf(x), 1); }
      }
    }
    if (overrides.humans) humans.splice(0, humans.length, ...overrides.humans);
    humans.forEach((h, i) => { h.label = `${i + 1}P`; });
    this.game = new Game({
      home: getTeam(s.home), away: getTeam(s.away), quarterMinutes: s.quarterMinutes, difficulty: s.difficulty,
      autoSub: s.autoSub, humans, seed: s.seed ?? ((Math.random() * 1e9) | 0), autoContinue: !!overrides.autoContinue,
    });
    this.game.start();
    this.demo = false;
    this.paused = false;
    this.pauseReason = null;
    this.acc = 0;
    this.pending.clear();
    this.renderer.setupMatch(this.game);
    this.hud.setupMatch(this.game);
    this.closeScreens();
    this.hud.show(true);
    this.audio.setCrowd(0.5);
  }

  pause(reason = null) {
    if (!this.game || this.demo) return;
    this.paused = true;
    this.pauseReason = reason;
    this.go('pause');
  }

  resume() {
    if (this.pauseReason && this.game.humans.some((h) => h.id !== 'kb' && !this.input.devices.get(h.id)?.connected)) {
      // 手把還沒接回：把那位玩家改成鍵盤控制，避免卡住
      for (const h of this.game.humans) {
        if (h.id !== 'kb' && !this.input.devices.get(h.id)?.connected && !this.game.humans.some((x) => x.id === 'kb')) {
          h.id = 'kb';
          this.toast(`${h.label} 改用鍵盤操作`, 'ok');
        }
      }
    }
    this.paused = false;
    this.pauseReason = null;
    this.closeScreens();
    if (this.game.phase === 'periodBreak') this.go('break');
  }

  continueBreak() {
    if (this.game && this.game.phase === 'periodBreak') this.game.continueAfterBreak();
    this.closeScreens();
  }

  quitToMenu() {
    this.paused = false;
    this.pauseReason = null;
    this.startDemo();
    this.audio.setCrowd(0.25);
    this.go('menu');
  }

  // ---------- 主迴圈 ----------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.1);
    try {
      this.tick(dt, now);
    } catch (err) {
      this.errors.push(String(err && err.stack || err));
      console.error(err);
    }
  }

  menuInputs() {
    return this.input.connectedDevices().map((d) => ({ id: d.id, mi: this.input.menuInput(d.id) }));
  }

  tick(dt, now) {
    this.input.poll();
    const g = this.game;
    if (this.screen) {
      this.screen.input(this.menuInputs());
    } else if (g && !this.demo) {
      for (const d of this.input.connectedDevices()) {
        const mi = this.input.gameInput(d.id);
        if (mi.pause && g.phase !== 'gameOver') { this.audio.ui('select'); this.pause(); break; }
      }
    }

    // 收集玩家輸入（按下的瞬間要保留到下一個模擬步驟）
    if (g && !this.demo) {
      for (const h of g.humans) {
        const cur = this.input.gameInput(h.id);
        const pend = this.pending.get(h.id) || emptyInput();
        for (const k of ['shootDown', 'passDown', 'moveDown', 'lobDown']) cur[k] = cur[k] || pend[k];
        this.pending.set(h.id, cur);
      }
    }

    const running = g && !(this.paused && !this.demo) && !(this.screen && !this.demo && ['pause', 'help', 'boxscore'].includes(this.screenName));
    if (running) {
      this.acc += dt * this.timeScale;
      const maxSteps = this.timeScale > 1 ? Math.ceil(this.timeScale * 4) : 6;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < maxSteps) {
        if (!this.demo) {
          for (const h of g.humans) {
            const inp = this.pending.get(h.id) || emptyInput();
            g.setHumanInput(h.id, inp);
            const cleared = Object.assign({}, inp, { shootDown: false, passDown: false, moveDown: false, lobDown: false });
            this.pending.set(h.id, cleared);
          }
        }
        g.step(SIM_DT);
        for (const fn of this.stepHooks) fn(g);
        this.acc -= SIM_DT;
        steps++;
        this.handleEvents(g);
      }
      if (steps >= maxSteps) this.acc = 0;
    }

    // 比賽階段對應的畫面
    if (g && !this.demo) {
      if (g.phase === 'periodBreak' && !this.screen && !this.paused) this.go('break');
      if (this.screenName === 'break' && g.phase !== 'periodBreak') this.closeScreens();
      if (g.phase === 'gameOver' && this.screenName !== 'results' && !this.paused) {
        this.gameOverTimer = (this.gameOverTimer || 0) + dt;
        if (this.gameOverTimer > 1.2) { this.gameOverTimer = 0; this.go('results'); this.audio.setCrowd(0.25); }
      }
    } else if (g && this.demo) {
      if (g.phase === 'gameOver') this.startDemo();
    }

    if (g && this.renderEnabled) {
      this.renderer.update(dt, g, { cameraMode: this.settings.camera });
      this.renderer.render();
      if (!this.demo) this.hud.update(dt, g, this.renderer);
    }
    this.input.endFrame();
    this.trackPerf(dt, now);
  }

  handleEvents(g) {
    const ev = g.events;
    if (!ev.length) return;
    if (this.renderEnabled) this.renderer.onEvents(ev, g);
    if (!this.demo || this.screenName === 'title' || this.screenName === 'menu') {
      if (this.timeScale <= 1) this.audio.onEvents(ev, g);
    }
    if (!this.demo) {
      this.hud.onEvents(ev, g);
      for (const e of ev) {
        if (e.type === 'score' || e.type === 'steal' || e.type === 'block') {
          for (const h of g.humans) {
            const p = e.player;
            if (p && p.team === h.team) this.input.vibrate(h.id, 0.4, 0.6, 140);
          }
        }
      }
    }
    g.events.length = 0;
  }

  // 自動畫質：連續掉幀就降低解析度
  trackPerf(dt, now) {
    const p = this.perf;
    p.frames++;
    if (now - p.t0 > 1000) {
      p.fps = (p.frames * 1000) / (now - p.t0);
      p.frames = 0;
      p.t0 = now;
      if (this.renderEnabled && this.timeScale <= 1 && !document.hidden) {
        if (p.fps < 50) p.slow++; else p.slow = Math.max(0, p.slow - 1);
        if (p.slow >= 3 && p.quality > 0) { p.quality--; p.slow = 0; this.renderer.setQuality(p.quality); }
      }
    }
  }

  // ---------- 測試用介面 ----------
  exposeDebug() {
    const app = this;
    window.__hoops = {
      app,
      get game() { return app.game; },
      state() { return app.game ? app.game.snapshot() : null; },
      startMatch(opts = {}) {
        if (opts.home) app.settings.home = opts.home;
        if (opts.away) app.settings.away = opts.away;
        if (opts.quarterMinutes) app.settings.quarterMinutes = opts.quarterMinutes;
        if (opts.difficulty) app.settings.difficulty = opts.difficulty;
        app.mode = opts.cpuOnly ? 'watch' : 'play';
        app.startMatch(opts);
        return true;
      },
      setTimeScale(n) { app.timeScale = n; },
      setRender(on) { app.renderEnabled = on; },
      addStepHook(fn) { app.stepHooks.push(fn); },
      clearStepHooks() { app.stepHooks.length = 0; },
      screen() { return app.screenName; },
      // 把球交給某位玩家控制的球員（測試輸入用）
      giveBallToHuman(label = '1P') {
        const g = app.game;
        const h = g.humans.find((x) => x.label === label);
        if (!h || !h.player) return null;
        const p = h.player;
        g.setPhase('live');
        g.ball.shot = null; g.ball.pass = null;
        g.ball.release('loose');
        g.ball.pos = { x: p.pos.x, y: 1, z: p.pos.z };
        g.gainBall(p, 'debug');
        return p.name;
      },
      // 讓對手持球並站在玩家球員面前（測試抄截用）
      giveBallToOpponent(label = '1P') {
        const g = app.game;
        const h = g.humans.find((x) => x.label === label);
        if (!h || !h.player) return null;
        const me = h.player;
        const opp = g.onCourt(1 - me.team)[0];
        g.setPhase('live');
        g.ball.shot = null; g.ball.pass = null;
        opp.pos.x = me.pos.x + Math.cos(me.facing) * 0.75;
        opp.pos.z = me.pos.z + Math.sin(me.facing) * 0.75;
        opp.action = null;
        g.ball.release('loose');
        g.ball.pos = { x: opp.pos.x, y: 1, z: opp.pos.z };
        g.gainBall(opp, 'debug');
        if (me.human) me.facing = Math.atan2(opp.pos.z - me.pos.z, opp.pos.x - me.pos.x);
        return opp.name;
      },
      humanPlayer(label = '1P') {
        const g = app.game;
        const h = g && g.humans.find((x) => x.label === label);
        if (!h || !h.player) return null;
        const p = h.player;
        return { name: p.name, x: p.pos.x, z: p.pos.z, team: p.team, hasBall: g.ball.holder === p, action: p.action ? p.action.type : null, fga: p.stats.fga, stealCooldown: p.stealCooldown, device: h.id };
      },
      go(n) { app.go(n); },
      continueBreak() { app.continueBreak(); },
      errors: app.errors,
      perf: app.perf,
    };
  }
}
