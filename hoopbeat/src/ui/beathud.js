// 節拍 HUD：拍點軌道、跟著拍子跳的邊框、判定字、兩隊的音樂面板、比賽計劃（戰術配樂）卡片。
// 只讀資料、不改比賽狀態。

import { explain, headline } from '../music/effects.js';
import { GRADE_INFO } from '../rhythm/judge.js';
import { TACTICS, previewTactic, formatPreview, TACTIC_BY_ID } from '../music/tactics.js';
import { SECTION_TYPES } from '../loops/song.js';
import { GENRES } from '../loops/genres.js';
import { glyph } from '../hoops/ui/glyphs.js';
import { GLYPHS } from '../hoops/input/input.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => Math.round(x * 100);
const KIND_ZH = { shot: '投籃', pass: '傳球', dribble: '過人', steal: '抄截', block: '蓋火鍋' };
const DIR_ARROW = { up: '↑', down: '↓', left: '←', right: '→' };

export class BeatHUD {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('hb-hud');
    this.pulse = document.getElementById('hb-pulse');
    this.lane = document.getElementById('hb-lane');
    this.laneCtx = this.lane.getContext('2d');
    this.laneInfo = document.getElementById('hb-lane-info');
    this.panels = [document.getElementById('hb-panel-home'), document.getElementById('hb-panel-away')];
    this.popups = document.getElementById('hb-popups');
    this.comboEl = document.getElementById('hb-combo');
    this.bridge = null;
    this.panelTimer = 0;
    this.previewCache = [null, null];
    this.previewTimer = 0;
    this.view = 'normal'; // normal → detail → mini
  }

  cycleView() {
    const order = ['normal', 'detail', 'mini'];
    this.view = order[(order.indexOf(this.view) + 1) % order.length];
    for (const p of this.panels) p.dataset.view = this.view;
    this.panelTimer = 0;
    return { normal: '標準', detail: '詳細', mini: '精簡' }[this.view];
  }

  setup(bridge, game) {
    this.bridge = bridge;
    this.game = game;
    this.previewCache = [null, null];
    this.panelTimer = 0;
    this.popups.innerHTML = '';
    this.lastBeat = null;
    for (let t = 0; t < 2; t++) { this.panels[t].innerHTML = ''; this.panels[t].dataset.view = this.view; }
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  padTypeFor(team) {
    const g = this.game;
    const h = g && g.teams[team].humans[0];
    if (!h) return null;
    if (h.id === 'kb') return 'keyboard';
    const dev = this.app.input.devices.get(h.id);
    return dev ? dev.type : 'xbox';
  }

  onEvents(events, game, renderer) {
    if (!this.bridge) return;
    for (const e of events) {
      if (e.type === 'beatJudge') this.popup(e, game, renderer);
    }
  }

  popup(e, game, renderer) {
    const p = e.player;
    if (!p || !renderer) return;
    const pos = renderer.project(p.pos.x, p.y + p.height + 0.55, p.pos.z);
    if (pos.behind) return;
    const info = GRADE_INFO[e.grade];
    const d = document.createElement('div');
    d.className = `hb-judge ${e.human ? 'human' : 'cpu'} g-${e.grade}`;
    d.style.left = `${pos.x}px`;
    d.style.top = `${pos.y}px`;
    d.style.color = info.color;
    let sub = KIND_ZH[e.kind] || '';
    if (e.human && e.grade !== 'perfect') sub += ` ${e.offsetMs < 0 ? '早' : '晚'} ${Math.abs(Math.round(e.offsetMs))}ms`;
    if (e.weakBeat) sub += '（弱拍）';
    if (e.kind === 'shot' && e.strong && e.grade === 'perfect') sub = '強拍出手！';
    d.innerHTML = `<b>${info.label}</b><small>${esc(sub)}</small>`;
    this.popups.appendChild(d);
    setTimeout(() => d.remove(), e.human ? 900 : 650);
    if (e.human) {
      this.app.stage?.sfx(e.grade);
      if (e.combo > 0 && e.combo % 10 === 0) this.app.hud.showBanner(`節奏連擊 ${e.combo}！`, '#ffd84a', 1.2);
    }
  }

  update(dt, game, renderer) {
    const br = this.bridge;
    if (!br || !br.grid.segments.length) return;
    const now = br.now();
    const grid = br.grid;
    const phase = grid.phase(now);
    const nb = grid.nearest(now);
    // 全畫面邊框跟著拍子跳：剛過拍點最亮，強拍更亮
    const since = now - nb.time;
    const flash = since >= 0 ? Math.max(0, 1 - since / 0.22) : 0;
    const col = this.bridge.conductor.audible === 'home' ? 0 : 1;
    this.pulse.style.opacity = (flash * (nb.downbeat ? 0.85 : nb.strong ? 0.6 : 0.32)).toFixed(3);
    this.pulse.dataset.side = col ? 'away' : 'home';
    if (nb.beat !== this.lastBeat && since >= 0) {
      this.lastBeat = nb.beat;
      if (this.app.settings.metronome) this.app.stage?.sfx('tick', { strong: nb.strong });
    }
    void phase;
    this.drawLane(now, grid);
    this.panelTimer -= dt;
    if (this.panelTimer <= 0) {
      this.panelTimer = 0.2;
      this.renderPanels(game, now);
    }
  }

  drawLane(now, grid) {
    const c = this.lane;
    const ctx = this.laneCtx;
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    const hitX = w * 0.18;
    const ahead = 2.0;
    const behind = 0.35;
    const xOf = (t) => hitX + ((t - now) / ahead) * (w - hitX - 10);
    // 底
    ctx.fillStyle = 'rgba(8,11,18,0.7)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.fill();
    // 判定窗口（Perfect／Great／Good）
    const nb = grid.nearest(now);
    const win = this.bridge ? this.windows(nb.bpm) : null;
    if (win) {
      const px = (ms) => (ms / 1000 / ahead) * (w - hitX - 10);
      ctx.fillStyle = 'rgba(108,198,255,0.16)';
      ctx.fillRect(hitX - px(win.good), 4, px(win.good) * 2, h - 8);
      ctx.fillStyle = 'rgba(94,240,160,0.2)';
      ctx.fillRect(hitX - px(win.great), 4, px(win.great) * 2, h - 8);
      ctx.fillStyle = 'rgba(255,216,74,0.35)';
      ctx.fillRect(hitX - px(win.perfect), 4, px(win.perfect) * 2, h - 8);
    }
    // 拍點
    const pos = grid.beatPosition(now);
    for (let b = Math.floor(pos) - 1; b < pos + 10; b++) {
      const d = grid.describe(b);
      if (d.time < now - behind || d.time > now + ahead) continue;
      const x = xOf(d.time);
      const r = d.downbeat ? h * 0.36 : d.strong ? h * 0.3 : h * 0.2;
      const past = d.time < now;
      ctx.globalAlpha = past ? Math.max(0, 1 - (now - d.time) / behind) : 1;
      ctx.fillStyle = d.strong ? '#ffd84a' : '#e9eef7';
      ctx.beginPath();
      ctx.arc(x, h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      if (d.downbeat) {
        ctx.strokeStyle = 'rgba(255,216,74,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 3);
        ctx.lineTo(x, h - 3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 判定線
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hitX, 3);
    ctx.lineTo(hitX, h - 3);
    ctx.stroke();
    // 最近幾次真人的判定：畫在早／晚的位置
    const js = this.bridge.judgments.filter((j) => j.human && now - j.t < 1.6 && j.grade);
    for (const j of js) {
      const x = hitX + (j.offsetMs / 1000 / ahead) * (w - hitX - 10);
      ctx.globalAlpha = Math.max(0, 1 - (now - j.t) / 1.6);
      ctx.fillStyle = GRADE_INFO[j.grade].color;
      ctx.fillRect(x - 2, 2, 4, h - 4);
      ctx.globalAlpha = 1;
    }
    const deck = this.bridge.conductor.decks[this.bridge.conductor.audible];
    const t = this.bridge.conductor.audible === 'home' ? 0 : 1;
    const team = this.game.teams[t].data;
    const sec = deck.sectionAt()?.section;
    const inBar = ((Math.floor(pos) % 4) + 4) % 4;
    const dots = [0, 1, 2, 3].map((i) => `<i class="${i === inBar ? 'on' : ''}${i % 2 === 0 ? ' strong' : ''}"></i>`).join('');
    const key = `${team.abbr}|${Math.round(deck.bpm)}|${sec?.type}|${inBar}`;
    if (key !== this.laneKey) {
      this.laneKey = key;
      this.laneInfo.innerHTML = `<span class="now">♪ ${esc(team.abbr)} 的歌（攻方）</span><span>BPM ${Math.round(deck.bpm)}</span><span>${esc(SECTION_TYPES[sec?.type]?.name || '')}</span><span class="dots">${dots}</span>`;
    }
  }

  windows(bpm) {
    const key = `${this.bridge.difficulty}|${bpm}`;
    if (this.winKey !== key) {
      this.winKey = key;
      this.winCache = this.bridge.windowsFor(bpm);
    }
    return this.winCache;
  }

  renderPanels(game, now) {
    const br = this.bridge;
    this.previewTimer -= 0.2;
    const refreshPreview = this.previewTimer <= 0;
    if (refreshPreview) this.previewTimer = 0.8;
    for (let t = 0; t < 2; t++) {
      const el = this.panels[t];
      const deck = br.deck(t);
      const f = br.feats[t];
      if (!f) continue;
      const m = br.mods[t];
      const combo = br.combos[t];
      const team = game.teams[t].data;
      const playing = br.conductor.audible === deck.id;
      const sec = deck.sectionAt()?.section;
      const pending = deck.pending;
      const human = game.teams[t].humans.length > 0;
      const bar = (v) => `<span class="bar"><i style="width:${pct(Math.max(0, Math.min(1, v)))}%"></i></span>`;
      const lines = explain(f, { combo: combo.count, feel: combo.feel(), morale: deck.morale(now) }, { maxPerRule: 1 });
      const tact = deck.tactic ? TACTIC_BY_ID[deck.tactic] : null;
      let pendTxt = '';
      if (pending) {
        const parts = [];
        if (pending.tactic) parts.push(TACTIC_BY_ID[pending.tactic].name);
        else if (pending.replace && !pending.tactic) parts.push('回到原曲');
        if (pending.section !== undefined) parts.push(`跳到${SECTION_TYPES[deck.song.sections[pending.section].type]?.name || '下一段'}`);
        pendTxt = `<div class="pend">下一小節：${esc(parts.join('、') || '換片段')}</div>`;
      }
      let html = `<div class="hd" style="border-color:${team.dark.trim}">
          <span class="abbr" style="background:${team.dark.jersey};color:${team.dark.trim}">${esc(team.abbr)}</span>
          <span class="song">${esc(deck.name)}</span>
          ${playing ? '<span class="live">♪ 播放中</span>' : '<span class="idle">待命</span>'}
        </div>
        <div class="meta">${esc(GENRES[deck.bank.genre].name)} · BPM <b>${Math.round(deck.bpm)}</b> · ${esc(SECTION_TYPES[sec?.type]?.name || '')}${tact ? ` · <b class="tact">${tact.icon} ${esc(tact.name)}</b>` : ''}</div>
        <div class="head">${esc(headline(f))}</div>
        <div class="feats">
          <span>能量${bar(f.energy)}</span><span>律動${bar(f.groove)}</span><span>新鮮${bar(f.freshness)}</span>
          <span class="${f.harmony > 0.05 ? 'on' : 'off'}">和弦</span><span class="${f.melody > 0.05 ? 'on' : 'off'}">主旋律</span><span class="${f.bass > 0.05 ? 'on' : 'off'}">貝斯</span>
        </div>
        <ul class="effects">${lines.slice(1).map((l) => `<li class="t-${l.mood.tone}"><b>${esc(l.title)}</b>${l.effects.length ? ` ${esc(l.effects.join('、'))}` : ` ${esc(l.mood.text)}`}</li>`).join('')}</ul>
        <div class="chips">${lines.slice(1).filter((l) => l.effects.length).map((l) => `<span class="t-${l.mood.tone}" title="${esc(l.title)}">${esc(l.effects[0])}</span>`).join('')}</div>
        <div class="combo">節奏連擊 <b>${combo.count}</b>${combo.count >= 16 ? ' 🔥' : ''} <small>最高 ${combo.max}</small></div>
        ${pendTxt}`;
      if (human) {
        if (refreshPreview || !this.previewCache[t]) this.previewCache[t] = TACTICS.map((tc) => ({ tc, pv: previewTactic(deck, tc.id) }));
        const type = this.padTypeFor(t);
        const kb = type === 'keyboard';
        const keyFor = (tc, i) => (kb ? `<span class="glyph kb">${i + 1}</span>` : `<span class="glyph wide dpad">${DIR_ARROW[tc.dir]}</span>`);
        html += `<div class="plan"><div class="plan-hd">比賽計劃（${kb ? '數字鍵 1～4' : '十字鍵'}）</div>${this.previewCache[t]
          .map(({ tc, pv }, i) => `<div class="opt${deck.tactic === tc.id ? ' cur' : ''}">${keyFor(tc, i)}<b>${tc.icon} ${esc(tc.name)}</b>${formatPreview(pv, 2).map((d) => `<span class="${d.good ? 'g' : 'b'}">${esc(d.text)}</span>`).join('')}</div>`)
          .join('')}
          <div class="plan-ft">${kb ? '<span class="glyph kb">Tab</span>' : `<span class="glyph wide">${type === 'ps' ? 'R3' : 'RS'}</span>`} 面板 ${kb ? '<span class="glyph kb">Q</span><span class="glyph kb">E</span>' : `${glyph(type, 'lb')}${glyph(type, 'rb')}`} 段落 ${kb ? '<span class="glyph kb">R</span>' : `<span class="glyph wide">${(GLYPHS[type] || GLYPHS.xbox).back}</span>`} 原曲</div></div>`;
      }
      el.innerHTML = html;
      el.classList.toggle('playing', playing);
    }
  }
}
