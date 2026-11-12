// 比賽中的 HUD：比分板、訊息橫幅、投籃時機條、按鍵提示、傳球目標、畫面外指示。
import { logoCanvas } from '../render/logos.js';
import { formatClock, periodShort, inBonus } from '../sim/rules.js';
import { glyph } from './glyphs.js';
import { teamFullName } from '../data/teams.js';

const HUMAN_COLORS = ['#3fa9ff', '#ff5a5a', '#ffd23f', '#6dff8a'];

export class HUD {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('hud');
    this.sb = document.getElementById('scoreboard');
    this.banner = document.getElementById('banner');
    this.meter = document.getElementById('meter');
    this.meterFill = this.meter.querySelector('.meter-fill');
    this.meterZone = this.meter.querySelector('.meter-zone');
    this.meterLabel = this.meter.querySelector('.meter-label');
    this.hints = document.getElementById('hints');
    this.markers = document.getElementById('overlay-markers');
    this.ticker = document.getElementById('ticker');
    this.fadeEl = document.getElementById('fade');
    this.bannerTimer = 0;
    this.tickerTimer = 0;
    this.meterTimer = 0;
    this.meterShot = null;
    this.hintKey = '';
    this.queue = [];
  }

  setupMatch(game) {
    const t = game.teams;
    const team = (i) => {
      const d = t[i].data;
      const kit = d[t[i].kit];
      const bg = i === 0 ? d.light.jersey : d.dark.jersey;
      const fg = i === 0 ? d.light.number : d.dark.number;
      return `<div class="sb-team ${i === 0 ? 'home' : 'away'}" style="background:${d.dark.jersey};color:#fff">
        <canvas width="84" height="84"></canvas><span class="abbr" style="color:${d.dark.trim}">${d.abbr}</span><span class="pts">0</span>
        <div class="fouls">${'<i></i>'.repeat(5)}</div><div class="bonus"></div><div class="poss"></div></div>`;
      void kit; void bg; void fg;
    };
    this.sb.innerHTML = `${team(0)}<div class="sb-mid"><span class="per">Q1</span><span class="clock">3:00</span><span class="shot">24</span></div>${team(1)}`;
    this.sb.querySelectorAll('canvas').forEach((c, i) => c.getContext('2d').drawImage(logoCanvas(t[i].data, 84), 0, 0));
    this.els = {
      teams: [...this.sb.querySelectorAll('.sb-team')],
      pts: [...this.sb.querySelectorAll('.pts')],
      fouls: [...this.sb.querySelectorAll('.fouls')],
      bonus: [...this.sb.querySelectorAll('.bonus')],
      per: this.sb.querySelector('.per'),
      clock: this.sb.querySelector('.clock'),
      shot: this.sb.querySelector('.shot'),
    };
    this.cache = {};
    this.hintKey = '';
    this.banner.classList.remove('show');
    this.meter.classList.remove('show');
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  set(key, el, val, prop = 'textContent') {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    el[prop] = val;
  }

  showBanner(text, color = '#ffffff', dur = 1.8) {
    this.banner.textContent = text;
    this.banner.style.color = color;
    this.banner.classList.add('show');
    this.bannerTimer = dur;
  }

  showTicker(text, dur = 2.2) {
    this.ticker.textContent = text;
    this.ticker.classList.add('show');
    this.tickerTimer = dur;
  }

  fade(quick = false) {
    this.fadeEl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.fadeEl.classList.remove('on')));
    void quick;
  }

  onEvents(events, game) {
    const teamColor = (ti) => (ti >= 0 ? game.teams[ti].data.dark.trim : '#ffffff');
    for (const e of events) {
      if (e.type === 'message') {
        const big = ['three', 'dunk', 'block', 'steal', 'andone', 'ankle', 'period', 'violation'].includes(e.kind);
        if (big || e.kind === 'foul' || e.kind === 'oob' || e.kind === 'turnover') this.showBanner(e.text, teamColor(e.team), e.kind === 'period' ? 2.2 : 1.6);
        else this.showTicker(e.text);
      } else if (e.type === 'score' && e.kind !== 'ft' && e.points === 2 && e.kind !== 'dunk') {
        const who = e.player ? e.player.name : '';
        this.showTicker(`${who} 得分${e.assister ? `（${e.assister.name} 助攻）` : ''}`);
      } else if (e.type === 'score' && e.kind === 'ft') {
        this.showTicker(`${e.player ? e.player.name : ''} 罰球命中`);
      } else if (e.type === 'fade') {
        this.fade(e.quick);
      } else if (e.type === 'shot' && e.human && (e.kind === 'jump' || e.kind === 'ft')) {
        const label = { perfect: '完美出手！', early: '太早', late: '太晚' }[e.timing] || '';
        this.meterLabel.textContent = label;
        this.meterLabel.style.color = e.timing === 'perfect' ? '#3ddc84' : '#ffb347';
        this.meterTimer = 1.1;
        this.showShotInfo(e);
      } else if (e.type === 'shot' && e.human) {
        this.showShotInfo(e);
      } else if (e.type === 'ftSetup') {
        this.showTicker(`${e.shooter.name} 罰球 第 ${e.index + 1} 罰／共 ${e.total} 罰`, 2.5);
      } else if (e.type === 'sub') {
        this.showTicker(`${teamFullName(game.teams[e.team].data)} 換人：${e.sub.name} 上場，${e.out.name} 下場`, 2.5);
      }
    }
  }

  // 玩家出手後顯示命中率與干擾程度，讓人知道能力值、距離、防守的影響
  showShotInfo(e) {
    const c = e.contest || 0;
    const cl = e.kind === 'ft' ? '' : c < 0.2 ? '空檔' : c < 0.45 ? '輕度干擾' : c < 0.75 ? '中度干擾' : '強力干擾';
    const kind = { jump: e.points === 3 ? '三分' : '跳投', layup: '上籃', dunk: '灌籃', ft: '罰球' }[e.kind] || '';
    this.showTicker(`${e.player.name} ${kind}・命中率 ${Math.round(e.prob * 100)}%${cl ? '・' + cl : ''}`, 2.4);
  }

  update(dt, game, renderer) {
    const r = game.rules;
    const E = this.els;
    if (!E) return;
    for (const i of [0, 1]) {
      this.set('pts' + i, E.pts[i], String(r.score[i]));
      const f = r.teamFouls[i];
      const key = 'f' + i + '_' + f;
      if (this.cache['fk' + i] !== key) {
        this.cache['fk' + i] = key;
        [...E.fouls[i].children].forEach((d, k) => d.classList.toggle('on', k < f));
        E.bonus[i].textContent = inBonus(r, i) ? (f >= 5 ? '加罰中' : '再犯即加罰') : '';
      }
      const has = r.possession === i;
      if (this.cache['poss' + i] !== has) { this.cache['poss' + i] = has; E.teams[i].classList.toggle('has', has); }
    }
    this.set('per', E.per, periodShort(r));
    this.set('clock', E.clock, formatClock(r.gameClock));
    const sc = r.shotClockOff ? '' : String(Math.ceil(Math.max(0, r.shotClock) - 1e-6));
    this.set('shot', E.shot, sc);
    const low = !r.shotClockOff && r.shotClock < 5 && game.phase === 'live';
    if (this.cache.low !== low) { this.cache.low = low; E.shot.classList.toggle('low', low); }

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    this.tickerTimer -= dt;
    if (this.tickerTimer <= 0) this.ticker.classList.remove('show');

    this.updateMeter(dt, game, renderer);
    this.updateMarkers(game, renderer);
    this.updateHints(game);
  }

  updateMeter(dt, game, renderer) {
    let shooter = null;
    for (const h of game.humans) {
      const p = h.player;
      if (p && p.action && p.action.type === 'shot' && (p.action.kind === 'jump' || p.action.kind === 'ft') && p.action.humanHold) shooter = p;
    }
    if (shooter) this.meterShot = shooter;
    this.meterTimer -= dt;
    const p = this.meterShot;
    if (!p || (!shooter && this.meterTimer <= 0)) {
      this.meter.classList.remove('show');
      this.meterShot = null;
      if (!shooter) this.meterLabel.textContent = '';
      return;
    }
    const a = p.action;
    const pos = renderer.project(p.pos.x, p.y + p.height * 0.8, p.pos.z);
    this.meter.style.left = `${pos.x + 46}px`;
    this.meter.style.top = `${pos.y - 60}px`;
    this.meter.classList.add('show');
    if (a && a.type === 'shot' && a.ideal) {
      const tMax = a.ideal * 1.6;
      const frac = Math.min(1, (a.released ? a.releaseT : a.t) / tMax);
      this.meterFill.style.height = `${frac * 100}%`;
      const win = a.perfectWin || 0.035;
      const zc = a.ideal / tMax, zh = (win * 2) / tMax;
      this.meterZone.style.bottom = `${(zc - zh / 2) * 100}%`;
      this.meterZone.style.height = `${Math.max(4, zh * 96)}px`;
      if (!a.released) this.meterLabel.textContent = '';
    }
  }

  updateMarkers(game, renderer) {
    let html = '';
    const W = window.innerWidth, H = window.innerHeight;
    for (const h of game.humans) {
      const p = h.player;
      if (!p || !p.onCourt) continue;
      const dev = this.app.input.devices.get(h.id);
      const type = dev ? dev.type : 'keyboard';
      const col = HUMAN_COLORS[h.slot % HUMAN_COLORS.length];
      // 畫面外指示
      const sp = renderer.project(p.pos.x, p.height, p.pos.z);
      if (sp.x < 20 || sp.x > W - 20 || sp.y < 20 || sp.y > H - 20) {
        const x = Math.max(40, Math.min(W - 40, sp.x)), y = Math.max(90, Math.min(H - 70, sp.y));
        html += `<div class="offscreen" style="left:${x - 24}px;top:${y - 14}px;border-color:${col};color:${col}">${sp.x < 20 ? '◀ ' : ''}${h.label}${sp.x > W - 20 ? ' ▶' : ''}</div>`;
      }
      // 持球時顯示傳球目標
      if (game.ball.holder === p && game.phase === 'live' && !p.action) {
        const t = game.pickPassTarget(p, h.input.mx, h.input.my);
        if (t) {
          const q = renderer.project(t.pos.x, t.y + t.height * 1.22, t.pos.z);
          html += `<div class="marker" style="left:${q.x}px;top:${q.y}px">${glyph(type, 'pass')}</div>`;
        }
      }
      // 罰球提示
      if (game.phase === 'freethrow' && game.ball.holder === p && game.pd.state === 'ready' && !p.action) {
        const q = renderer.project(p.pos.x, p.height * 1.3, p.pos.z);
        html += `<div class="marker" style="left:${q.x}px;top:${q.y}px"><span class="hint-box">按住 ${glyph(type, 'shoot')} 罰球，放開出手</span></div>`;
      }
      if (game.phase === 'tipoff' && game.pd.jumpers && game.pd.jumpers.includes(p) && !game.pd.jumped[p.team]) {
        const q = renderer.project(p.pos.x, p.height * 1.45, p.pos.z);
        const dx = p.pos.x < 0 ? -110 : 110;
        html += `<div class="marker" style="left:${q.x + dx}px;top:${q.y}px"><span class="hint-box">${h.label} 球往下掉時按 ${glyph(type, 'block')} 跳球</span></div>`;
      }
    }
    // 電腦持球者的名牌
    const hd = game.ball.holder;
    if (hd && !hd.human && game.phase !== 'gameOver') {
      const q = renderer.project(hd.pos.x, hd.y + hd.height * 1.2, hd.pos.z);
      const col = game.teams[hd.team].data.dark.trim;
      html += `<div class="marker" style="left:${Math.round(q.x)}px;top:${Math.round(q.y)}px"><span class="nameplate" style="border-color:${col}">#${hd.number} ${hd.name}</span></div>`;
    }
    if (this.cache.markers !== html) { this.cache.markers = html; this.markers.innerHTML = html; }
  }

  updateHints(game) {
    const boxes = [];
    for (const h of game.humans) {
      const p = h.player;
      if (!p) continue;
      const dev = this.app.input.devices.get(h.id);
      const type = dev ? dev.type : 'keyboard';
      const off = game.offenseTeam() === p.team;
      const hasBall = game.ball.holder === p;
      let items;
      if (hasBall) items = [['shoot', '投籃'], ['pass', '傳球'], ['move', '過人'], ['lob', '高吊'], ['sprint', '衝刺']];
      else if (off) items = [['pass', '要球'], ['lob', '要空中接力'], ['sprint', '衝刺']];
      else items = [['steal', '抄截'], ['block', '蓋火鍋'], ['switch', '換人'], ['stance', '壓低'], ['sprint', '衝刺']];
      const col = HUMAN_COLORS[h.slot % HUMAN_COLORS.length];
      // HOOPBEAT: 手把持球時提示右搖桿運球
      const rs = hasBall && type !== 'keyboard' ? `<span><span class="glyph wide" style="color:#cfd6e4">${type === 'switch' ? 'R 搖桿' : '右搖桿'}</span>運球</span>` : '';
      boxes.push(`<div class="hint-box"><span class="who" style="background:${col}">${h.label}</span><span style="color:#cfd6e4">#${p.number} ${p.name}</span>${items.map(([a, l]) => `<span>${glyph(type, a)}${l}</span>`).join('')}${rs}</div>`);
    }
    const key = boxes.join('|');
    if (key !== this.hintKey) {
      this.hintKey = key;
      this.hints.innerHTML = boxes.length === 1 ? boxes[0] + '<div></div>' : boxes.join('');
    }
  }
}
