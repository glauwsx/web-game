// 選單畫面：標題、主選單、選隊、手把分配、比賽設定、操作說明、暫停、換節、賽後數據。
import { TEAMS, teamRatings, overall, teamFullName } from '../data/teams.js';
import { POSITION_SHORT, DIFFICULTY } from '../sim/constants.js';
import { logoCanvas } from '../render/logos.js';
import { PAD_NAMES } from '../input/input.js';
import { glyph, stickGlyph } from './glyphs.js';
import { periodShort, periodLabel } from '../sim/rules.js';

export function el(html) { // HOOPBEAT: export
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

export function esc(s) { // HOOPBEAT: export
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 主要裝置的類型（拿來顯示按鍵符號）
export function primaryType(app) { // HOOPBEAT: export
  const pads = app.input.connectedDevices().filter((d) => d.kind === 'gamepad');
  return pads.length ? pads[0].type : 'keyboard';
}

export function footer(app, items) { // HOOPBEAT: export
  const t = primaryType(app);
  return `<div class="footer-hints">${items.map(([a, label]) => `<span>${glyph(t, a)} ${label}</span>`).join('')}</div>`;
}

// 通用選單清單
export class MenuList { // HOOPBEAT: export
  constructor(items, opts = {}) {
    this.items = items;
    this.focus = opts.focus || 0;
    this.opts = opts;
    this.el = document.createElement('div');
    this.el.className = 'menu-list';
    this.desc = document.createElement('div');
    this.desc.className = 'menu-desc';
    this.render();
  }
  render() {
    this.el.innerHTML = '';
    this.items.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'menu-item' + (i === this.focus ? ' focus' : '') + (it.disabled ? ' disabled' : '');
      const val = it.values ? `<span class="val"><span class="arr">◀</span>${esc(it.format ? it.format(it.get()) : it.get())}<span class="arr">▶</span></span>` : '';
      d.innerHTML = `<span>${esc(it.label)}</span>${val}`;
      d.addEventListener('mouseenter', () => { this.focus = i; this.render(); });
      d.addEventListener('click', (e) => {
        this.focus = i;
        if (it.values) {
          const rect = d.getBoundingClientRect();
          this.change(it, e.clientX < rect.left + rect.width * 0.6 && e.clientX > rect.left + rect.width * 0.5 ? -1 : 1);
        } else if (it.action && !it.disabled) it.action();
        this.render();
      });
      this.el.appendChild(d);
    });
    const cur = this.items[this.focus];
    this.desc.textContent = cur && cur.desc ? cur.desc : '';
  }
  change(it, dir) {
    const vals = it.values;
    const idx = vals.indexOf(it.get());
    const n = vals[(idx + dir + vals.length) % vals.length];
    it.set(n);
    if (this.opts.onChange) this.opts.onChange();
  }
  handle(mi, app) {
    let moved = false;
    if (mi.up) { this.focus = (this.focus - 1 + this.items.length) % this.items.length; moved = true; }
    if (mi.down) { this.focus = (this.focus + 1) % this.items.length; moved = true; }
    const it = this.items[this.focus];
    if (it && it.values && (mi.left || mi.right)) { this.change(it, mi.left ? -1 : 1); moved = true; }
    if (moved) { app.audio.ui('move'); this.render(); }
    if (mi.confirm && it) {
      if (it.values) { this.change(it, 1); this.render(); app.audio.ui('move'); }
      else if (it.action && !it.disabled) { app.audio.ui('select'); it.action(); }
      return true;
    }
    return false;
  }
}

// ---------------- 標題 ----------------
export function titleScreen(app) {
  const root = el(`<div class="screen clear">
    <div class="title-logo">
      <div class="big">鋼框</div>
      <div class="en">STEELRIM</div>
      <div class="sub">五對五全場籃球 · 鋼框聯盟</div>
    </div>
    <div class="press">按任意鍵或手把按鈕開始</div>
    <div class="devices-line"></div>
  </div>`);
  const devLine = root.querySelector('.devices-line');
  const refresh = () => {
    const devs = app.input.connectedDevices();
    devLine.innerHTML = devs.map((d) => `<span class="chip on">● ${esc(d.name)}${d.kind === 'gamepad' ? ` #${d.index + 1}` : ''}</span>`).join('')
      + (devs.filter((d) => d.kind === 'gamepad').length === 0 ? '<span class="chip">插上手把後按任一鍵即可偵測</span>' : '');
  };
  refresh();
  root.addEventListener('click', () => app.go('menu'));
  return {
    el: root,
    refresh,
    input(list) {
      for (const { mi } of list) if (mi.any) { app.audio.ui('select'); app.go('menu'); return; }
    },
  };
}

// ---------------- 主選單 ----------------
export function mainMenu(app) {
  const root = el(`<div class="screen"><div class="title-logo" style="margin-bottom:3vh"><div class="big" style="font-size:72px">鋼框</div><div class="en" style="font-size:18px">STEELRIM</div></div><div class="panel"></div></div>`);
  const panel = root.querySelector('.panel');
  const list = new MenuList([
    { label: '開始比賽', desc: '選擇球隊與手把，打一場五對五全場比賽。', action: () => { app.mode = 'play'; app.go('teams'); } },
    { label: '電腦對戰（觀賞）', desc: '讓兩隊電腦對打，可以觀察戰術與節奏。', action: () => { app.mode = 'watch'; app.go('teams'); } },
    { label: '操作說明', desc: 'Xbox、PlayStation、Switch Pro 手把與鍵盤的完整按鍵表。', action: () => app.go('help', { back: 'menu' }) },
    {
      label: '音量', desc: '音效與觀眾聲的總音量。', values: [0, 0.2, 0.4, 0.6, 0.8, 1], get: () => app.settings.volume,
      set: (v) => { app.settings.volume = v; app.audio.setVolume(v); app.saveSettings(); }, format: (v) => `${Math.round(v * 100)}%`,
    },
    {
      label: '選單音樂', desc: '選單畫面的背景音樂（全部用 Web Audio 即時合成）。', values: [true, false], get: () => app.settings.music,
      set: (v) => { app.settings.music = v; app.saveSettings(); app.updateMusic(); }, format: (v) => (v ? '開' : '關'),
    },
  ]);
  panel.appendChild(list.el);
  panel.appendChild(list.desc);
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定'], ['back', '返回']]));
  return {
    el: root,
    input(arr) {
      for (const { mi } of arr) {
        if (list.handle(mi, app)) return;
        if (mi.back) { app.audio.ui('back'); app.go('title'); return; }
      }
    },
  };
}

// ---------------- 選隊 ----------------
function teamCard(team, sideLabel) {
  const r = teamRatings(team);
  const rows = team.roster.map((p, i) => `<tr class="${i >= 5 ? 'bench' : ''}"><td class="n">#${p.number}</td><td>${esc(p.name)}</td><td class="ps">${POSITION_SHORT[p.pos]}</td><td>${(p.height / 100).toFixed(2)}m</td><td class="o">${overall(p)}</td></tr>`).join('');
  return `<div class="side-tag">${sideLabel}</div>
    <div class="head"><canvas width="128" height="128"></canvas><div><div class="nm">${esc(teamFullName(team))}</div><div class="en">${esc(team.en)} · ${team.abbr}</div><span class="style">${esc(team.style)}</span></div></div>
    <div class="bars">
      <span>整體</span><div class="bar"><i style="width:${r.overall}%"></i></div><b>${r.overall}</b>
      <span>進攻</span><div class="bar"><i style="width:${r.offense}%"></i></div><b>${r.offense}</b>
      <span>防守</span><div class="bar"><i style="width:${r.defense}%"></i></div><b>${r.defense}</b>
      <span>運動</span><div class="bar"><i style="width:${r.athletic}%"></i></div><b>${r.athletic}</b>
    </div>
    <table class="roster">${rows}</table>
    <div class="nav l">◀</div><div class="nav r">▶</div>`;
}

export function teamSelect(app) {
  const root = el(`<div class="screen"><h1>選擇球隊 <small>${app.mode === 'watch' ? '電腦對戰' : '主隊在上半場由左往右進攻'}</small></h1><div class="teams-wrap"></div><div class="panel next-btn" style="padding:10px"><div class="menu-list" style="min-width:300px"></div></div></div>`);
  const wrap = root.querySelector('.teams-wrap');
  const btnList = root.querySelector('.menu-list');
  let focus = 0;
  const cards = [document.createElement('div'), document.createElement('div')];
  cards.forEach((c, i) => {
    c.className = 'team-card';
    wrap.appendChild(c);
    c.addEventListener('click', (e) => {
      focus = i;
      const t = e.target;
      if (t.classList.contains('nav')) cycle(i, t.classList.contains('l') ? -1 : 1);
      render();
    });
  });
  const idx = (key) => TEAMS.findIndex((t) => t.key === key);
  const cycle = (i, dir) => {
    const k = i === 0 ? 'home' : 'away';
    let n = (idx(app.settings[k]) + dir + TEAMS.length) % TEAMS.length;
    const other = app.settings[i === 0 ? 'away' : 'home'];
    if (TEAMS[n].key === other) n = (n + dir + TEAMS.length) % TEAMS.length;
    app.settings[k] = TEAMS[n].key;
    app.audio.ui('move');
    app.saveSettings();
  };
  const next = () => { app.audio.ui('select'); app.go(app.mode === 'watch' ? 'settings' : 'controllers'); };
  const render = () => {
    cards.forEach((c, i) => {
      const team = TEAMS[idx(app.settings[i === 0 ? 'home' : 'away'])];
      c.innerHTML = teamCard(team, i === 0 ? '主 隊 HOME' : '客 隊 AWAY');
      c.classList.toggle('focus', focus === i);
      const cv = c.querySelector('canvas');
      cv.getContext('2d').drawImage(logoCanvas(team, 128), 0, 0);
      c.style.background = `linear-gradient(160deg, ${team.dark.jersey}cc, rgba(14,19,30,0.95) 55%)`;
    });
    btnList.innerHTML = `<div class="menu-item ${focus === 2 ? 'focus' : ''}" style="justify-content:center">下一步 ▶</div>`;
    btnList.firstChild.onclick = next;
  };
  render();
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定'], ['back', '返回']]) .replace('</div>', `<span>${stickGlyph(primaryType(app))} 上下選擇、左右換隊</span></div>`));
  return {
    el: root,
    input(arr) {
      for (const { mi } of arr) {
        if (mi.up) { focus = (focus + 2) % 3; app.audio.ui('move'); render(); }
        if (mi.down) { focus = (focus + 1) % 3; app.audio.ui('move'); render(); }
        if ((mi.left || mi.right) && focus < 2) { cycle(focus, mi.left ? -1 : 1); render(); }
        if (mi.confirm) { if (focus < 2) { focus += 1; app.audio.ui('move'); render(); } else next(); return; }
        if (mi.back) { app.audio.ui('back'); app.go('menu'); return; }
      }
    },
  };
}

// ---------------- 手把分配 ----------------
export function controllerAssign(app) {
  const home = TEAMS.find((t) => t.key === app.settings.home);
  const away = TEAMS.find((t) => t.key === app.settings.away);
  const root = el(`<div class="screen"><h1>手把分配 <small>每個裝置用自己的方向鍵左右移動</small></h1>
    <div class="panel assign">
      <div class="assign-head"><span class="home">◀ ${esc(teamFullName(home))}</span><span>電腦</span><span class="away">${esc(teamFullName(away))} ▶</span></div>
      <div class="rows"></div>
      <div class="assign-note"></div>
    </div></div>`);
  const rows = root.querySelector('.rows');
  const note = root.querySelector('.assign-note');
  const render = () => {
    const devs = app.input.connectedDevices();
    // 手把最多 2 支
    const pads = devs.filter((d) => d.kind === 'gamepad').slice(0, 2);
    const shown = [devs.find((d) => d.id === 'kb'), ...pads].filter(Boolean);
    rows.innerHTML = '';
    let humans = 0;
    for (const d of shown) {
      const side = app.assign.get(d.id) ?? 0;
      if (side !== 0) humans++;
      const row = document.createElement('div');
      row.className = 'assign-row';
      const cls = side < 0 ? 'home' : side > 0 ? 'away' : '';
      const token = `<span class="dev-token ${cls}">${d.kind === 'gamepad' ? '🎮' : '⌨️'} ${esc(d.name)}${d.kind === 'gamepad' ? ` #${d.index + 1}` : ''}</span>`;
      row.innerHTML = `<div>${side < 0 ? token : ''}</div><div>${side === 0 ? token : ''}</div><div>${side > 0 ? token : ''}</div>`;
      row.addEventListener('click', (e) => {
        const r = row.getBoundingClientRect();
        const third = (e.clientX - r.left) / r.width;
        app.assign.set(d.id, third < 0.33 ? -1 : third > 0.66 ? 1 : 0);
        app.audio.ui('move');
        render();
      });
      rows.appendChild(row);
    }
    const t = primaryType(app);
    note.innerHTML = `${humans === 0 ? '目前沒有人加入：會變成電腦對戰觀賞。' : `共 ${humans} 位玩家。可以 1P 對 2P，也可以兩人同隊打電腦。`}<br>按 ${glyph(t, 'confirm')} 繼續　·　手把可以隨時插拔，插上後會自動出現在這裡`;
  };
  render();
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定'], ['back', '返回']]));
  return {
    el: root,
    refresh: render,
    input(arr) {
      for (const { id, mi } of arr) {
        const cur = app.assign.get(id) ?? 0;
        if (mi.left && cur > -1) { app.assign.set(id, cur - 1); app.audio.ui('move'); render(); }
        if (mi.right && cur < 1) { app.assign.set(id, cur + 1); app.audio.ui('move'); render(); }
        if (mi.confirm) { app.audio.ui('select'); app.go('settings'); return; }
        if (mi.back) { app.audio.ui('back'); app.go('teams'); return; }
      }
    },
  };
}

// ---------------- 比賽設定 ----------------
export function settingsScreen(app) {
  const root = el(`<div class="screen"><h1>比賽設定</h1><div class="panel"></div></div>`);
  const panel = root.querySelector('.panel');
  const s = app.settings;
  const list = new MenuList([
    { label: '難度', desc: '影響電腦的反應、命中率、抄截與協防頻率，以及你的投籃時機寬容度。', values: ['easy', 'normal', 'hard'], get: () => s.difficulty, set: (v) => { s.difficulty = v; }, format: (v) => DIFFICULTY[v].name },
    { label: '每節長度', desc: '比賽共 4 節，平手進入延長賽。', values: [2, 3, 4, 5, 6, 8, 10, 12], get: () => s.quarterMinutes, set: (v) => { s.quarterMinutes = v; }, format: (v) => `${v} 分鐘` },
    { label: '自動換人', desc: '體力下降時，在死球時自動換上板凳球員。', values: [true, false], get: () => s.autoSub, set: (v) => { s.autoSub = v; }, format: (v) => (v ? '開' : '關') },
    { label: '鏡頭', desc: '轉播視角的遠近。', values: ['broadcast', 'close'], get: () => s.camera, set: (v) => { s.camera = v; }, format: (v) => (v === 'close' ? '近景轉播' : '標準轉播') },
    { label: '跳球開賽 ▶', desc: '', action: () => app.startMatch() },
  ], { focus: 4, onChange: () => app.saveSettings() });
  panel.appendChild(list.el);
  panel.appendChild(list.desc);
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定'], ['back', '返回']]));
  return {
    el: root,
    input(arr) {
      for (const { mi } of arr) {
        if (list.handle(mi, app)) return;
        if (mi.back) { app.audio.ui('back'); app.go(app.mode === 'watch' ? 'teams' : 'controllers'); return; }
      }
    },
  };
}

// ---------------- 操作說明 ----------------
const HELP_ROWS = {
  offense: [['stick', '移動'], ['sprint', '衝刺'], ['shoot', '按住起跳投籃，最高點放開'], ['pass', '往搖桿方向傳給最近的隊友'], ['move', '運球過人（胯下、轉身）'], ['lob', '高吊傳球／空中接力']],
  defense: [['stick', '移動'], ['stance', '壓低防守姿勢（較慢、干擾較強）'], ['steal', '抄截（可能犯規）'], ['block', '跳起蓋火鍋／搶籃板'], ['switch', '切換到離球最近的球員'], ['sprint', '衝刺']],
  other: [['pause', '暫停選單'], ['pass', '無球時：要球'], ['lob', '無球時：要求空中接力']],
};

export function helpScreen(app, opts = {}) {
  const types = [['xbox', 'Xbox'], ['ps', 'PlayStation'], ['switch', 'Switch Pro'], ['keyboard', '鍵盤']];
  let tab = Math.max(0, types.findIndex(([t]) => t === primaryType(app)));
  const root = el(`<div class="screen"><div class="panel help"><h1>操作說明</h1><div class="help-tabs"></div><div class="help-body"></div></div></div>`);
  const tabs = root.querySelector('.help-tabs');
  const body = root.querySelector('.help-body');
  const row = (t, [a, label]) => `<tr><td>${a === 'stick' ? stickGlyph(t) : glyph(t, a)}</td><td>${label}</td></tr>`;
  const render = () => {
    tabs.innerHTML = types.map(([t, n], i) => `<div class="tab ${i === tab ? 'on' : ''}" data-i="${i}">${n}</div>`).join('');
    tabs.querySelectorAll('.tab').forEach((d) => { d.onclick = () => { tab = +d.dataset.i; render(); }; });
    const t = types[tab][0];
    body.innerHTML = `<div class="help-grid">
      <div><h3>進攻（持球）</h3><table>${HELP_ROWS.offense.map((r) => row(t, r)).join('')}</table></div>
      <div><h3>防守</h3><table>${HELP_ROWS.defense.map((r) => row(t, r)).join('')}</table></div>
      <div><h3>其他</h3><table>${HELP_ROWS.other.map((r) => row(t, r)).join('')}</table></div>
      <div><h3>小技巧</h3><div class="help-tips">
        • 投籃時看球員旁邊的時機條，綠色區域放開就是「完美出手」。<br>
        • 靠近籃框並且往籃框跑時按投籃，會自動上籃或灌籃。<br>
        • 隊友往籃下切入時按 ${glyph(t, 'lob')}，可以傳空中接力。<br>
        • 防守貼太近亂抄、或從背後抄，容易被吹犯規。<br>
        • 單節團隊犯規第 5 次起，對手直接罰球。
      </div></div>
    </div>`;
  };
  render();
  root.insertAdjacentHTML('beforeend', footer(app, [['back', '返回']]).replace('</div>', `<span>${stickGlyph(primaryType(app))} 左右切換手把種類</span></div>`));
  return {
    el: root,
    input(arr) {
      for (const { mi } of arr) {
        if (mi.left) { tab = (tab + types.length - 1) % types.length; app.audio.ui('move'); render(); }
        if (mi.right) { tab = (tab + 1) % types.length; app.audio.ui('move'); render(); }
        if (mi.back || mi.confirm || mi.start) { app.audio.ui('back'); app.go(opts.back || 'menu'); return; }
      }
    },
  };
}

// ---------------- 暫停 ----------------
export function pauseScreen(app, opts = {}) {
  const root = el(`<div class="screen clear"><h1>暫停</h1><div class="panel"></div></div>`);
  const panel = root.querySelector('.panel');
  if (opts.reason) panel.insertAdjacentHTML('afterbegin', `<div style="color:#ffb347;font-weight:800;margin-bottom:14px;text-align:center">${esc(opts.reason)}</div>`);
  const list = new MenuList([
    { label: '繼續比賽', action: () => app.resume() },
    { label: '本場數據', action: () => app.go('boxscore', { back: 'pause' }) },
    { label: '操作說明', action: () => app.go('help', { back: 'pause' }) },
    { label: '重新開始', action: () => app.startMatch() },
    { label: '離開比賽', desc: '回到主選單，這場比賽不會保留。', action: () => app.quitToMenu() },
  ]);
  panel.appendChild(list.el);
  panel.appendChild(list.desc);
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定'], ['back', '繼續比賽']]));
  return {
    el: root,
    input(arr) {
      for (const { mi } of arr) {
        if (list.handle(mi, app)) return;
        if (mi.back || mi.start) { app.audio.ui('back'); app.resume(); return; }
      }
    },
  };
}

// ---------------- 換節 ----------------
function periodTable(game) {
  const r = game.rules;
  const n = Math.max(r.periodScores[0].length, r.periodScores[1].length, r.periods);
  const heads = Array.from({ length: n }, (_, i) => `<th>${periodShort(r, i + 1)}</th>`).join('');
  const line = (t) => Array.from({ length: n }, (_, i) => `<td>${r.periodScores[t][i] ?? '-'}</td>`).join('');
  return `<table class="periods"><tr><th></th>${heads}<th>總分</th></tr>
    <tr><td>${game.teams[0].data.abbr}</td>${line(0)}<td><b>${r.score[0]}</b></td></tr>
    <tr><td>${game.teams[1].data.abbr}</td>${line(1)}<td><b>${r.score[1]}</b></td></tr></table>`;
}

function bigScore(game) {
  const t = game.teams;
  return `<div class="bigscore">
    <div class="t"><canvas width="128" height="128"></canvas><div>${esc(teamFullName(t[0].data))}</div></div>
    <div class="s">${game.rules.score[0]}</div><div class="vs">—</div><div class="s">${game.rules.score[1]}</div>
    <div class="t"><canvas width="128" height="128"></canvas><div>${esc(teamFullName(t[1].data))}</div></div></div>`;
}

function paintLogos(root, game) {
  root.querySelectorAll('.bigscore canvas').forEach((c, i) => c.getContext('2d').drawImage(logoCanvas(game.teams[i].data, 128), 0, 0));
}

export function periodBreakScreen(app) {
  const g = app.game;
  const res = g.pd.res || {};
  const was = g.pd.wasPeriod;
  const title = res.halftime ? '中場休息' : `${periodLabel(g.rules, was)}結束`;
  const nextLabel = res.overtime ? '延長賽即將開始' : `${periodLabel(g.rules)}即將開始`;
  const root = el(`<div class="screen clear"><div class="panel break-box"><h1>${title}</h1>${bigScore(g)}${periodTable(g)}
    <div class="menu-desc">${nextLabel}${res.halftime ? '，雙方交換場地' : ''}</div><div class="row-btns"></div></div></div>`);
  paintLogos(root, g);
  const list = new MenuList([
    { label: '繼續 ▶', action: () => app.continueBreak() },
    { label: '本場數據', action: () => app.go('boxscore', { back: 'break' }) },
  ]);
  list.el.style.minWidth = '260px';
  root.querySelector('.row-btns').appendChild(list.el);
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定']]));
  return {
    el: root,
    input(arr) {
      for (const { mi } of arr) {
        if (list.handle(mi, app)) return;
        if (mi.start) { app.continueBreak(); return; }
      }
    },
  };
}

// ---------------- 數據 ----------------
function boxTable(game, ti) {
  const t = game.teams[ti];
  const ps = t.players;
  const fmtMin = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const rows = ps.map((p) => {
    const s = p.stats;
    const dnp = s.sec < 1;
    return `<tr class="${dnp ? 'dnp' : ''}"><td>#${p.number} ${esc(p.name)} <span style="color:#7d889c;font-size:12px">${POSITION_SHORT[p.pos0]}</span></td>
      <td>${dnp ? '—' : fmtMin(s.sec)}</td><td class="pts">${s.pts}</td><td>${s.reb}</td><td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td>
      <td>${s.fgm}-${s.fga}</td><td>${s.tpm}-${s.tpa}</td><td>${s.ftm}-${s.fta}</td><td>${s.tov}</td><td>${s.pf}</td></tr>`;
  }).join('');
  const sum = (k) => ps.reduce((a, p) => a + p.stats[k], 0);
  return `<div><div class="box-title"><canvas width="64" height="64"></canvas>${esc(teamFullName(t.data))}</div>
    <table class="box"><tr><th>球員</th><th>時間</th><th>得分</th><th>籃板</th><th>助攻</th><th>抄截</th><th>阻攻</th><th>投籃</th><th>三分</th><th>罰球</th><th>失誤</th><th>犯規</th></tr>
    ${rows}
    <tr class="total"><td>全隊</td><td></td><td class="pts">${sum('pts')}</td><td>${sum('reb')}</td><td>${sum('ast')}</td><td>${sum('stl')}</td><td>${sum('blk')}</td><td>${sum('fgm')}-${sum('fga')}</td><td>${sum('tpm')}-${sum('tpa')}</td><td>${sum('ftm')}-${sum('fta')}</td><td>${sum('tov')}</td><td>${sum('pf')}</td></tr></table></div>`;
}

function mvpOf(game) {
  const w = game.rules.score[0] >= game.rules.score[1] ? 0 : 1;
  let best = null, bs = -1;
  for (const p of game.teams[w].players) {
    const s = p.stats;
    const v = s.pts + s.reb * 1.2 + s.ast * 1.5 + s.stl * 2 + s.blk * 2 - s.tov;
    if (v > bs) { bs = v; best = p; }
  }
  return best;
}

export function boxScoreScreen(app, opts = {}) {
  const g = app.game;
  const final = !!opts.final;
  const root = el(`<div class="screen"><div class="panel results"><h1 style="text-align:center">${final ? '比賽結束' : '本場數據'}</h1>
    ${bigScore(g)}${periodTable(g)}<div style="text-align:center" class="mvp-wrap"></div>
    <div class="box-wrap">${boxTable(g, 0)}${boxTable(g, 1)}</div><div class="row-btns"></div></div></div>`);
  paintLogos(root, g);
  root.querySelectorAll('.box-title canvas').forEach((c, i) => c.getContext('2d').drawImage(logoCanvas(g.teams[i].data, 64), 0, 0));
  if (final) {
    const m = mvpOf(g);
    if (m) root.querySelector('.mvp-wrap').innerHTML = `<div class="mvp">★ 本場最有價值球員：#${m.number} ${esc(m.name)}　${m.stats.pts} 分 ${m.stats.reb} 籃板 ${m.stats.ast} 助攻</div>`;
  }
  const items = final
    ? [{ label: '再來一場', action: () => app.startMatch() }, { label: '換隊重選', action: () => { app.startDemo(); app.go('teams'); } }, { label: '回主選單', action: () => app.quitToMenu() }]
    : [{ label: '返回', action: () => app.go(opts.back === 'break' ? 'break' : 'pause') }];
  const list = new MenuList(items);
  list.el.style.flexDirection = 'row';
  list.el.style.minWidth = '0';
  root.querySelector('.row-btns').appendChild(list.el);
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定'], ['back', '返回']]));
  const panel = root.querySelector('.results');
  return {
    el: root,
    input(arr) {
      for (const { mi } of arr) {
        if (mi.left) mi.up = true;
        if (mi.right) mi.down = true;
        if (mi.up && !mi.left && list.items.length === 1) { panel.scrollTop -= 80; mi.up = false; }
        if (mi.down && !mi.right && list.items.length === 1) { panel.scrollTop += 80; mi.down = false; }
        if (list.handle(mi, app)) return;
        if (mi.back) { app.audio.ui('back'); if (final) app.quitToMenu(); else app.go(opts.back === 'break' ? 'break' : 'pause'); return; }
      }
    },
  };
}

export { PAD_NAMES };
