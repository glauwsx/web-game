// 籃球音遊的畫面：標題、主選單、選歌、節拍設定、延遲校正、操作說明、賽後節奏統計。
// 沿用 hoops 的選單元件（MenuList）與樣式。

import { MenuList, el, esc, footer, primaryType } from '../hoops/ui/screens.js';
import { GLYPHS } from '../hoops/input/input.js';
import { DEMOS } from '../music/demos.js';
import { loadSongs, loadLoopsProjects, resolveSong } from '../music/library.js';
import { computeFeatures } from '../music/features.js';
import { explain, headline } from '../music/effects.js';
import { arrangementChecks } from '../music/quality.js';
import { DIFFICULTIES, estimateLatency, judge, GRADE_INFO } from '../rhythm/judge.js';
import { BeatGrid } from '../rhythm/beatgrid.js';
import { TACTICS } from '../music/tactics.js';
import { GENRES } from '../loops/genres.js';

const BPM_VALUES = [null, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];

// ---------------- 標題 ----------------
export function titleScreen(app) {
  const root = el(`<div class="screen clear">
    <div class="title-logo hb-logo">
      <div class="big">HOOPBEAT</div>
      <div class="en">籃 球 音 遊</div>
      <div class="sub">你拼的歌，決定球隊怎麼打</div>
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
  const root = el(`<div class="screen"><div class="title-logo hb-logo" style="margin-bottom:3vh"><div class="big" style="font-size:64px">HOOPBEAT</div><div class="en" style="font-size:18px">籃 球 音 遊</div></div><div class="panel"></div></div>`);
  const panel = root.querySelector('.panel');
  const list = new MenuList([
    { label: '開始比賽', desc: '選隊、分配手把、選配樂，打一場五對五。兩人可以同隊或對戰。', action: () => { app.mode = 'play'; app.go('teams'); } },
    { label: '電腦對戰（觀賞）', desc: '兩隊電腦對打。換不同速度的歌，看看球隊打法怎麼變。', action: () => { app.mode = 'watch'; app.go('teams'); } },
    { label: '拼歌工作室', desc: '用 loop station 拼一首自己的歌，存起來帶進比賽。', action: () => app.go('songlab', { back: 'menu' }) },
    { label: '節拍設定與延遲校正', desc: '判定難度、音訊延遲校正、節拍器、音樂音量。', action: () => app.go('rhythm', { back: 'menu' }) },
    { label: '操作說明', desc: 'Xbox、PlayStation、Switch Pro 手把與鍵盤的按鍵表，以及拍點判定規則。', action: () => app.go('help', { back: 'menu' }) },
    {
      label: '音效音量', desc: '球場音效與觀眾聲。', values: [0, 0.2, 0.4, 0.6, 0.8, 1], get: () => app.settings.volume,
      set: (v) => { app.settings.volume = v; app.audio.setVolume(v); app.saveSettings(); }, format: (v) => `${Math.round(v * 100)}%`,
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

// ---------------- 歌曲清單 ----------------
export function songOptions() {
  const out = DEMOS.map((d) => ({ id: d.id, name: `${d.name}（${GENRES[d.genre].name} ${d.bpm}）`, blurb: d.blurb }));
  for (const s of loadSongs()) out.push({ id: `my:${s.id}`, name: `★ ${s.name}（${Math.round(s.bpm || s.bank.bpm)}）`, blurb: '我在拼歌工作室做的歌' });
  loadLoopsProjects().forEach((s, i) => out.push({ id: `lp:${i}`, name: `♫ ${s.name}（Loop 工坊）`, blurb: '從 Loop 工坊讀進來的歌' }));
  return out;
}

function songInfoHTML(song, label) {
  const deck = { bank: song.bank, bpm: song.bpm, mixer: song.mixer || {}, lastChangeBar: 0 };
  // 以副歌（或第一段）的編排估算特徵
  const secs = song.song.sections;
  const sec = secs.find((s) => s.type === 'chorus') || secs[0];
  const f = computeFeatures({ ...deck, active: sec ? sec.clips : {} }, 0);
  const lines = explain(f, undefined, { maxPerRule: 3 });
  const chk = arrangementChecks(song.song, song.mixer || {});
  return `<div class="song-info">
    <div class="si-hd">${esc(label)}：${esc(song.name)}</div>
    <div class="si-head">${esc(headline(f))}</div>
    <ul class="effects">${lines.map((l) => `<li class="t-${l.mood.tone}"><b>${esc(l.title)}</b> ${esc(l.mood.text)}${l.effects.length ? `：${esc(l.effects.join('、'))}` : ''}</li>`).join('')}</ul>
    <div class="si-checks">${chk.checks.map((c) => `<span class="${c.ok ? 'ok' : 'no'}" title="${esc(c.detail)}">${c.ok ? '✔' : '✘'} ${esc(c.label)}<small>${esc(c.detail)}</small></span>`).join('')}</div>
    <div class="si-note">特徵以「副歌」的片段組合估算。編曲檢查只看量得到的東西，不評好不好聽。</div>
  </div>`;
}

// ---------------- 選歌（開賽前） ----------------
export function songSelectScreen(app) {
  const s = app.settings;
  const root = el(`<div class="screen"><h1>選配樂 <small>攻方的歌會在球場上播</small></h1><div class="hb-two"><div class="panel left"></div><div class="panel right info-panel"></div></div></div>`);
  const panel = root.querySelector('.left');
  const info = root.querySelector('.info-panel');
  const opts = songOptions();
  const ids = opts.map((o) => o.id);
  if (!ids.includes(s.homeSong)) s.homeSong = ids[0];
  if (!ids.includes(s.awaySong)) s.awaySong = ids[Math.min(4, ids.length - 1)];
  const nameOf = (id) => opts.find((o) => o.id === id)?.name || id;
  const homeName = app.settings.home;
  void homeName;
  let previewKey = '';
  const showInfo = (team) => {
    const id = team === 0 ? s.homeSong : s.awaySong;
    const bpm = team === 0 ? s.homeBpm : s.awayBpm;
    const song = resolveSong(id, bpm);
    info.innerHTML = songInfoHTML(song, team === 0 ? '主隊' : '客隊');
    const key = `${id}|${bpm}`;
    if (key !== previewKey) {
      previewKey = key;
      app.previewSong(song);
    }
  };
  const items = [
    { label: '主隊配樂', team: 0, desc: '主隊進攻時播這首。', values: ids, get: () => s.homeSong, set: (v) => { s.homeSong = v; }, format: nameOf },
    { label: '主隊速度', team: 0, desc: '同一首歌換速度：越快跑越快但拍點越難抓；越慢越穩、傳導越好。', values: BPM_VALUES, get: () => s.homeBpm, set: (v) => { s.homeBpm = v; }, format: (v) => (v ? `${v} BPM` : '原速') },
    { label: '客隊配樂', team: 1, desc: '客隊進攻時播這首。', values: ids, get: () => s.awaySong, set: (v) => { s.awaySong = v; }, format: nameOf },
    { label: '客隊速度', team: 1, desc: '同一首歌換速度。', values: BPM_VALUES, get: () => s.awayBpm, set: (v) => { s.awayBpm = v; }, format: (v) => (v ? `${v} BPM` : '原速') },
    { label: '節拍判定', desc: '判定窗口的寬度。速度越快，窗口還會再變窄。', values: ['easy', 'normal', 'hard'], get: () => s.beatDifficulty, set: (v) => { s.beatDifficulty = v; }, format: (v) => DIFFICULTIES[v].name },
    { label: '拼一首新的歌…', desc: '進拼歌工作室，做好之後會出現在清單裡（★）。', action: () => { app.stopPreview(); app.go('songlab', { back: 'songs' }); } },
    { label: '跳球開賽 ▶', desc: '', action: () => { app.stopPreview(); app.hb().songsReady = true; app.startMatch(app.hb().pendingOverrides || {}); } },
  ];
  const list = new MenuList(items, { focus: 6, onChange: () => { app.saveSettings(); showInfo(curTeam()); } });
  const curTeam = () => items[list.focus]?.team ?? 0;
  let lastFocus = -1;
  panel.appendChild(list.el);
  panel.appendChild(list.desc);
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定'], ['back', '返回']]));
  showInfo(0);
  return {
    el: root,
    dispose() { app.stopPreview(); },
    input(arr) {
      for (const { mi } of arr) {
        const handled = list.handle(mi, app);
        if (list.focus !== lastFocus) {
          lastFocus = list.focus;
          if (items[list.focus]?.team !== undefined) showInfo(curTeam());
        }
        if (handled) return;
        if (mi.back) { app.audio.ui('back'); app.stopPreview(); app.go('settings'); return; }
      }
    },
  };
}

// ---------------- 節拍設定 ----------------
export function rhythmSettingsScreen(app, opts = {}) {
  const s = app.settings;
  const root = el(`<div class="screen"><h1>節拍設定</h1><div class="panel"></div></div>`);
  const panel = root.querySelector('.panel');
  const list = new MenuList([
    { label: '判定難度', desc: '簡單：Perfect ±55ms；普通：±42ms；困難：±30ms（以 120 BPM 計，速度越快越窄）。', values: ['easy', 'normal', 'hard'], get: () => s.beatDifficulty, set: (v) => { s.beatDifficulty = v; }, format: (v) => DIFFICULTIES[v].name },
    { label: '延遲校正', desc: '正值＝你的按鍵被記錄得比較晚（藍牙耳機常見），判定時會扣掉。←／→ 每次 5 毫秒。', values: Array.from({ length: 61 }, (_, i) => -100 + i * 5), get: () => Math.round(s.latencyMs / 5) * 5, set: (v) => { s.latencyMs = v; }, format: (v) => `${v > 0 ? '+' : ''}${v} ms` },
    { label: '自動測量延遲…', desc: '跟著節拍按 12 下，自動算出延遲校正值。', action: () => app.go('calib', { back: 'rhythm', backOpts: opts }) },
    { label: '節拍器聲音', desc: '比賽中每一拍加一聲提示音（抓不到拍子時很有用）。', values: [false, true], get: () => !!s.metronome, set: (v) => { s.metronome = v; }, format: (v) => (v ? '開' : '關') },
    { label: '音樂音量', desc: '配樂的音量。', values: [0, 0.2, 0.4, 0.6, 0.8, 0.85, 1], get: () => s.musicVolume, set: (v) => { s.musicVolume = v; app.stage.setMusicVolume(v); }, format: (v) => `${Math.round(v * 100)}%` },
    { label: '返回', desc: '', action: () => app.go(opts.back || 'menu') },
  ], { onChange: () => app.saveSettings() });
  panel.appendChild(list.el);
  panel.appendChild(list.desc);
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定'], ['back', '返回']]));
  return {
    el: root,
    input(arr) {
      for (const { mi } of arr) {
        if (list.handle(mi, app)) return;
        if (mi.back) { app.audio.ui('back'); app.go(opts.back || 'menu'); return; }
      }
    },
  };
}

// ---------------- 延遲校正 ----------------
export function calibrationScreen(app, opts = {}) {
  const BPM = 100;
  const N = 14;
  const root = el(`<div class="screen"><h1>延遲校正 <small>跟著節拍按下</small></h1>
    <div class="panel calib">
      <div class="calib-beat"><div class="dot"></div></div>
      <div class="calib-msg">聽到「滴」就按一下（Enter、空白鍵、K、滑鼠，或手把的任一顆按鈕）。看圓點閃也可以。</div>
      <div class="calib-taps"></div>
      <div class="calib-result"></div>
    </div></div>`);
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '按拍子'], ['back', '返回']]));
  const dot = root.querySelector('.dot');
  const tapsEl = root.querySelector('.calib-taps');
  const result = root.querySelector('.calib-result');
  const grid = new BeatGrid();
  let taps = [];
  let done = false;
  let raf = 0;
  let measured = null;
  const start = async () => {
    await app.stage.init();
    const ctx = app.stage.ctx;
    const t0 = ctx.currentTime + 0.6;
    grid.reset(t0, BPM);
    for (let i = 0; i < N + 6; i++) app.stage.sfx('tick', { at: grid.beatTime(i), strong: i % 4 === 0 });
    taps = [];
    done = false;
    measured = null;
    result.innerHTML = '';
    tapsEl.innerHTML = '';
  };
  const tap = (perfT) => {
    if (done || !grid.segments.length) return;
    const t = app.stage.audibleNow(perfT);
    if (t < grid.beatTime(1) - 0.3) return; // 前兩拍先聽
    taps.push(t);
    const off = Math.round((t - grid.nearest(t).time) * 1000);
    const g = judge(t, grid, { latencyMs: 0 }).grade;
    tapsEl.insertAdjacentHTML('beforeend', `<span style="color:${GRADE_INFO[g].color}">${off > 0 ? '+' : ''}${off}</span>`);
    if (taps.length >= 12) {
      done = true;
      measured = estimateLatency(taps.slice(2), grid);
      result.innerHTML = `量到的延遲：<b>${measured > 0 ? '+' : ''}${measured} ms</b>（目前設定 ${app.settings.latencyMs} ms）<br>
        <span class="menu-item focus" id="calib-apply">套用 ${measured} ms</span> <span class="menu-item" id="calib-again">重新測</span>`;
      result.querySelector('#calib-apply').addEventListener('click', apply);
      result.querySelector('#calib-again').addEventListener('click', start);
    }
  };
  const apply = () => {
    if (measured === null) return;
    app.settings.latencyMs = measured;
    app.saveSettings();
    app.toast(`延遲校正設為 ${measured} ms`, 'ok');
    app.go(opts.back || 'rhythm', opts.backOpts || {});
  };
  const onKey = (e) => {
    if (e.repeat) return;
    if (['Enter', 'Space', 'KeyK', 'KeyJ', 'NumpadEnter'].includes(e.code)) {
      if (done && e.code === 'Enter') { apply(); return; }
      tap(e.timeStamp);
    }
  };
  const onPointer = (e) => { if (!done && e.target.closest('.calib')) tap(e.timeStamp); };
  window.addEventListener('keydown', onKey);
  root.addEventListener('pointerdown', onPointer);
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!grid.segments.length) return;
    const now = app.stage.audibleNow();
    const nb = grid.nearest(now);
    const since = now - nb.time;
    const a = since >= 0 ? Math.max(0, 1 - since / 0.15) : 0;
    dot.style.transform = `scale(${1 + a * 0.5})`;
    dot.style.opacity = String(0.3 + a * 0.7);
  };
  loop();
  start();
  return {
    el: root,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    },
    input(arr) {
      for (const { id, mi } of arr) {
        if (mi.back) { app.audio.ui('back'); app.go(opts.back || 'rhythm', opts.backOpts || {}); return; }
        if (id !== 'kb' && mi.any) {
          if (done && mi.confirm) { apply(); return; }
          tap(performance.now());
        }
      }
    },
  };
}

// ---------------- 操作說明 ----------------
const KB = { bottom: 'K', right: 'L', left: 'J', top: 'I', lt: 'Space', rt: 'Shift', lb: 'Q', rb: 'E', start: 'Esc', back: 'R' };
const ROWS = [
  ['移動', 'stick', 'WASD／方向鍵'],
  ['衝刺', 'rt'],
  ['投籃（按住起跳，強拍放開）', 'left'],
  ['傳球（往搖桿方向）', 'bottom'],
  ['運球過人', 'right'],
  ['高吊傳球／空中接力', 'top'],
  ['防守：抄截', 'left'],
  ['防守：蓋火鍋／搶籃板', 'top'],
  ['防守：換人', 'bottom'],
  ['防守：壓低姿勢', 'lt'],
  ['戰術配樂（比賽計劃）', 'dpad', '1／2／3／4'],
  ['上一段／下一段', 'lbrb', 'Q／E'],
  ['回到原曲', 'back', 'R'],
  ['暫停', 'start'],
];

export function helpScreen(app, opts = {}) {
  const brands = ['xbox', 'ps', 'switch'];
  const cell = (b, k) => {
    if (k === 'stick') return b === 'switch' ? 'L 搖桿' : '左搖桿';
    if (k === 'dpad') return '十字鍵 ↑↓←→';
    if (k === 'lbrb') return `${GLYPHS[b].lb}／${GLYPHS[b].rb}`;
    return GLYPHS[b][k];
  };
  const rows = ROWS.map(([label, k, kb]) => `<tr><td>${esc(label)}</td>${brands.map((b) => `<td>${esc(cell(b, k))}</td>`).join('')}<td>${esc(kb || KB[k] || '')}</td></tr>`).join('');
  const tact = TACTICS.map((t) => `<li><b>${t.icon} ${esc(t.name)}</b>（十字鍵${({ up: '↑', down: '↓', left: '←', right: '→' })[t.dir]}／鍵盤 ${TACTICS.indexOf(t) + 1}）：${esc(t.desc)}</li>`).join('');
  const root = el(`<div class="screen"><div class="panel help-panel">
    <h1>操作說明</h1>
    <table class="help-table"><tr><th>動作</th><th>Xbox</th><th>PlayStation</th><th>Switch Pro</th><th>鍵盤</th></tr>${rows}</table>
    <div class="help-cols">
      <div><h3>拍點判定</h3><ul>
        <li>投籃、傳球、過人、抄截、蓋火鍋都會判定：按下的時間離拍點多近 → <b style="color:#ffd84a">Perfect</b>／<b style="color:#5ef0a0">Great</b>／<b style="color:#6cc6ff">Good</b>／<b style="color:#ff6b6b">Miss</b>。</li>
        <li>跳投在「放開」時判定，最佳出手點在<b>強拍</b>（每小節第 1、3 拍，金色）。踩在弱拍上最多 Great。</li>
        <li>腳下的圈縮到最小的瞬間就是拍點；底部軌道上的點碰到白線也是。</li>
        <li>連續踩中累積<b>節奏連擊</b>，全隊手感變好；Miss 會歸零。</li>
        <li>BPM 越快，拍點越密、判定窗口越窄。</li>
      </ul></div>
      <div><h3>比賽計劃（戰術配樂）</h3><ul>${tact}
        <li>改動在下一個小節線生效。在樂句開頭（每 4 小節）換，會有一段時間的士氣加成。</li>
        <li>同一組片段播太久，球員會「疲乏」：命中率、防守下降。</li>
        <li>球場上播的是<b>進攻方</b>的歌，換邊時切換。</li>
      </ul></div>
    </div>
  </div></div>`);
  root.insertAdjacentHTML('beforeend', footer(app, [['back', '返回']]));
  return {
    el: root,
    input(arr) {
      for (const { mi } of arr) if (mi.back || mi.confirm) { app.audio.ui('back'); app.go(opts.back || 'menu'); return; }
    },
  };
}

// ---------------- 賽後：節奏統計 ----------------
export function appendRhythmStats(app, screen) {
  const br = app.bridge;
  if (!br || !screen || !screen.el) return;
  const g = app.game;
  const row = (t) => {
    const s = br.stats[t];
    const tot = s.judged || 1;
    const d = br.deck(t);
    return `<tr><td>${esc(g.teams[t].data.abbr)}</td><td>${esc(d.name)}</td><td>${Math.round(d.baseBpm)}</td><td style="color:#ffd84a">${s.perfect}</td><td style="color:#5ef0a0">${s.great}</td><td style="color:#6cc6ff">${s.good}</td><td style="color:#ff6b6b">${s.miss}</td><td>${Math.round((100 * (s.perfect + s.great)) / tot)}%</td><td>${br.combos[t].max}</td><td>${s.rush}</td><td>${d.boosts}</td><td>${s.badPass}</td></tr>`;
  };
  const html = `<div class="rhythm-stats"><div class="box-title">節奏統計</div><table class="box"><tr><th>隊</th><th>配樂</th><th>BPM</th><th>Perfect</th><th>Great</th><th>Good</th><th>Miss</th><th>踩中率</th><th>最高連擊</th><th>等不及拍點</th><th>段落士氣</th><th>傳歪</th></tr>${row(0)}${row(1)}</table></div>`;
  const target = screen.el.querySelector('.results') || screen.el.querySelector('.panel') || screen.el;
  const btns = target.querySelector('.row-btns');
  if (btns) btns.insertAdjacentHTML('beforebegin', html);
  else target.insertAdjacentHTML('beforeend', html);
}

export { primaryType };
