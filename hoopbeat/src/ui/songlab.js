// 拼歌工作室：簡化版的 loop station。
// 選曲風 → 點片段即時試聽（在下一個小節線切換）→ 把喜歡的組合存成段落 → 存成「我的歌」帶去比賽。
// 手把：十字鍵／搖桿在按鈕之間移動，A 確定，B 返回。滑鼠也可以直接點。

import { el, esc, footer } from '../hoops/ui/screens.js';
import { GENRES, GENRE_IDS, TRACKS, TRACK_IDS } from '../loops/genres.js';
import { generateBank, regenerateTrack } from '../loops/generator.js';
import { autoArrange, makeSection, SECTION_TYPES, SECTION_TYPE_IDS } from '../loops/song.js';
import { Deck } from '../music/deck.js';
import { Conductor } from '../music/conductor.js';
import { computeFeatures } from '../music/features.js';
import { explain, headline } from '../music/effects.js';
import { arrangementChecks } from '../music/quality.js';
import { saveSong, newSongId, loadSongs } from '../music/library.js';

const BAR_CHOICES = [4, 8, 16];

// 空間導覽：往某個方向找最近的可聚焦元素
function navMove(root, cur, dir) {
  const els = [...root.querySelectorAll('[data-nav]')].filter((e) => e.offsetParent !== null);
  if (!cur || !els.includes(cur)) return els[0] || null;
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best = null;
  let bs = Infinity;
  for (const e of els) {
    if (e === cur) continue;
    const b = e.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    let main;
    let side;
    if (dir === 'left') { main = -dx; side = Math.abs(dy); }
    else if (dir === 'right') { main = dx; side = Math.abs(dy); }
    else if (dir === 'up') { main = -dy; side = Math.abs(dx); }
    else { main = dy; side = Math.abs(dx); }
    if (main <= 4) continue;
    const score = main + side * 2.2;
    if (score < bs) { bs = score; best = e; }
  }
  return best || cur;
}

export function songLabScreen(app, opts = {}) {
  const st = {
    genre: 'house',
    seed: `lab-${Math.floor(Math.random() * 1e5)}`,
    bank: null,
    bpm: 120,
    live: { drums: null, bass: null, chords: null, lead: null, fx: null },
    sections: [],
    sel: -1,
    newType: 'verse',
    newBars: 8,
    mode: 'live', // live = 試聽目前的組合；song = 播整首
    playing: false,
    name: `我的歌 ${loadSongs().length + 1}`,
  };
  const liveSection = { id: 'live', type: 'verse', bars: 8, clips: st.live };

  const regen = (keepBpm = false) => {
    st.bank = generateBank({ genre: st.genre, seed: st.seed });
    if (!keepBpm) st.bpm = st.bank.bpm;
    const arr = autoArrange(st.bank);
    st.sections = arr.sections;
    const ch = arr.sections.find((s) => s.type === 'chorus') || arr.sections[0];
    for (const t of TRACK_IDS) st.live[t] = ch.clips[t];
    st.sel = -1;
  };
  regen();

  const root = el(`<div class="screen lab-screen">
    <div class="lab">
      <div class="lab-top"></div>
      <div class="lab-main">
        <div class="lab-left"><div class="lab-grid"></div><div class="lab-arr"></div></div>
        <div class="lab-right panel"></div>
      </div>
    </div>
  </div>`);
  root.insertAdjacentHTML('beforeend', footer(app, [['confirm', '確定／播放片段'], ['back', '返回']]));
  const topEl = root.querySelector('.lab-top');
  const gridEl = root.querySelector('.lab-grid');
  const arrEl = root.querySelector('.lab-arr');
  const infoEl = root.querySelector('.lab-right');
  let focus = null;
  let deck = null;

  const setFocus = (e) => {
    if (focus) focus.classList.remove('nav-focus');
    focus = e;
    if (focus) {
      focus.classList.add('nav-focus');
      focus.scrollIntoView({ block: 'nearest' });
    }
  };

  // ── 播放 ──
  const startPlay = () => {
    const song = st.mode === 'song' && st.sections.length ? { sections: st.sections } : { sections: [liveSection] };
    deck = new Deck({ id: 'lab', name: st.name, bank: st.bank, song, bpm: st.bpm });
    const c = new Conductor({ lab: deck });
    app.stage.play(c, 'lab');
    st.playing = true;
  };
  const stopPlay = () => {
    app.stage.stop();
    st.playing = false;
    deck = null;
  };
  const restartIfPlaying = () => { if (st.playing) startPlay(); };

  // ── 畫面 ──
  const render = () => {
    const focusKey = focus?.dataset.key;
    const g = GENRES[st.genre];
    topEl.innerHTML = `
      <h1>拼歌工作室</h1>
      <div class="lab-bar">
        <span class="lab-ctl"><span class="btn sm" data-nav data-key="g-" data-act="genre" data-v="-1">◀</span><b>${g.emoji} ${esc(g.name)}</b><span class="btn sm" data-nav data-key="g+" data-act="genre" data-v="1">▶</span></span>
        <span class="lab-ctl"><span class="btn sm" data-nav data-key="b-" data-act="bpm" data-v="-5">−</span><b>BPM ${st.bpm}</b><span class="btn sm" data-nav data-key="b+" data-act="bpm" data-v="5">＋</span></span>
        <span class="btn" data-nav data-key="dice" data-act="dice">🎲 換一組片段</span>
        <span class="btn ${st.playing ? 'on' : ''}" data-nav data-key="play" data-act="play">${st.playing ? '■ 停止' : '▶ 播放'}</span>
        <span class="btn ${st.mode === 'song' ? 'on' : ''}" data-nav data-key="mode" data-act="mode">${st.mode === 'song' ? '播整首' : '試聽組合'}</span>
      </div>`;
    const playingClips = deck ? deck.currentClips() : {};
    gridEl.innerHTML = TRACKS.map((tr) => `<div class="lab-row">
        <span class="lab-track" style="color:${tr.color}">${tr.icon} ${esc(tr.name)}</span>
        ${st.bank.tracks[tr.id].map((c, i) => {
          const on = st.live[tr.id] === i;
          const now = playingClips[tr.id] === i && st.mode === 'live';
          return `<span class="clip ${on ? 'on' : ''} ${now ? 'now' : ''}" data-nav data-key="c-${tr.id}-${i}" data-act="clip" data-t="${tr.id}" data-i="${i}" style="--c:${tr.color}" title="${esc(c.name)}"><b>${c.letter}</b><small>${esc(c.name)}</small></span>`;
        }).join('')}
        <span class="clip stop ${st.live[tr.id] === null ? 'on' : ''}" data-nav data-key="s-${tr.id}" data-act="clip" data-t="${tr.id}" data-i="-1"><b>✕</b><small>關掉</small></span>
      </div>`).join('');
    const total = st.sections.reduce((a, s) => a + s.bars, 0);
    arrEl.innerHTML = `<div class="lab-arr-hd">段落編排（${st.sections.length} 段、${total} 小節）</div>
      <div class="lab-secs">${st.sections.map((s, i) => `<span class="sec ${i === st.sel ? 'sel' : ''}" data-nav data-key="sec-${i}" data-act="sec" data-i="${i}" style="--c:${SECTION_TYPES[s.type].color}">${esc(SECTION_TYPES[s.type].name)} ${s.bars}</span>`).join('') || '<span class="dim">還沒有段落</span>'}</div>
      <div class="lab-arr-btns">
        <span class="lab-ctl"><span class="btn sm" data-nav data-key="t-" data-act="ntype" data-v="-1">◀</span><b>${esc(SECTION_TYPES[st.newType].name)}</b><span class="btn sm" data-nav data-key="t+" data-act="ntype" data-v="1">▶</span></span>
        <span class="lab-ctl"><span class="btn sm" data-nav data-key="n-" data-act="nbars" data-v="-1">◀</span><b>${st.newBars} 小節</b><span class="btn sm" data-nav data-key="n+" data-act="nbars" data-v="1">▶</span></span>
        <span class="btn" data-nav data-key="add" data-act="add">＋ 把現在的組合加成段落</span>
        ${st.sel >= 0 ? '<span class="btn" data-nav data-key="over" data-act="over">覆蓋選取的段落</span><span class="btn" data-nav data-key="del" data-act="del">刪除選取的段落</span>' : ''}
        <span class="btn" data-nav data-key="auto" data-act="auto">一鍵排歌</span>
        <span class="btn" data-nav data-key="clear" data-act="clear">清空</span>
      </div>
      <div class="lab-arr-btns">
        <span class="btn primary" data-nav data-key="save" data-act="save">💾 存成「${esc(st.name)}」${opts.back === 'songs' ? '並帶去比賽' : ''}</span>
        <span class="btn" data-nav data-key="back" data-act="back">返回</span>
      </div>`;
    renderInfo();
    const again = focusKey && root.querySelector(`[data-key="${focusKey}"]`);
    setFocus(again || root.querySelector('[data-key="play"]'));
  };

  const renderInfo = () => {
    const f = computeFeatures({ bank: st.bank, bpm: st.bpm, active: st.live, mixer: {}, lastChangeBar: 0 }, 0);
    const lines = explain(f, undefined, { maxPerRule: 3 });
    const chk = arrangementChecks({ sections: st.sections }, {}, { peak: st.playing ? app.stage.peak : null });
    infoEl.innerHTML = `<div class="si-hd">現在這組片段對球隊的影響</div>
      <div class="si-head">${esc(headline(f))}</div>
      <ul class="effects">${lines.map((l) => `<li class="t-${l.mood.tone}"><b>${esc(l.title)}</b> ${esc(l.mood.text)}${l.effects.length ? `：${esc(l.effects.join('、'))}` : ''}</li>`).join('')}</ul>
      <div class="si-hd" style="margin-top:10px">編曲檢查（只看量得到的）</div>
      <div class="si-checks">${chk.checks.map((c) => `<span class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✔' : '✘'} ${esc(c.label)}<small>${esc(c.detail)}</small></span>`).join('')}</div>
      <div class="si-note">比賽時特徵會跟著段落變化。同一組片段播超過 8 小節開始疲乏。</div>`;
  };

  // ── 動作 ──
  const act = (e) => {
    if (!e) return;
    const a = e.dataset.act;
    const v = Number(e.dataset.v || 0);
    app.audio.ui('move');
    switch (a) {
      case 'genre': {
        const i = GENRE_IDS.indexOf(st.genre);
        st.genre = GENRE_IDS[(i + v + GENRE_IDS.length) % GENRE_IDS.length];
        regen();
        restartIfPlaying();
        break;
      }
      case 'bpm':
        st.bpm = Math.max(70, Math.min(180, st.bpm + v));
        if (deck) deck.bpm = st.bpm;
        break;
      case 'dice':
        st.seed = `lab-${Math.floor(Math.random() * 1e6)}`;
        regen(true);
        restartIfPlaying();
        break;
      case 'play':
        if (st.playing) stopPlay(); else startPlay();
        break;
      case 'mode':
        st.mode = st.mode === 'live' ? 'song' : 'live';
        restartIfPlaying();
        break;
      case 'clip': {
        const t = e.dataset.t;
        const i = Number(e.dataset.i);
        st.live[t] = i < 0 || st.live[t] === i ? null : i;
        if (st.mode === 'song') { st.mode = 'live'; restartIfPlaying(); }
        if (!st.playing) startPlay();
        break;
      }
      case 'sec': {
        const i = Number(e.dataset.i);
        st.sel = st.sel === i ? -1 : i;
        if (st.sel >= 0) {
          const s = st.sections[i];
          for (const t of TRACK_IDS) st.live[t] = s.clips[t] ?? null;
          st.newType = s.type;
          st.newBars = BAR_CHOICES.includes(s.bars) ? s.bars : 8;
        }
        break;
      }
      case 'ntype': {
        const i = SECTION_TYPE_IDS.indexOf(st.newType);
        st.newType = SECTION_TYPE_IDS[(i + v + SECTION_TYPE_IDS.length) % SECTION_TYPE_IDS.length];
        break;
      }
      case 'nbars': {
        const i = BAR_CHOICES.indexOf(st.newBars);
        st.newBars = BAR_CHOICES[(i + v + BAR_CHOICES.length) % BAR_CHOICES.length];
        break;
      }
      case 'add':
        st.sections.push(makeSection(st.newType, st.newBars, { ...st.live }));
        st.sel = -1;
        break;
      case 'over':
        if (st.sel >= 0) st.sections[st.sel] = { ...makeSection(st.newType, st.newBars, { ...st.live }) };
        break;
      case 'del':
        if (st.sel >= 0) st.sections.splice(st.sel, 1);
        st.sel = -1;
        break;
      case 'auto':
        st.sections = autoArrange(st.bank).sections;
        st.sel = -1;
        break;
      case 'clear':
        st.sections = [];
        st.sel = -1;
        break;
      case 'save':
        save();
        return;
      case 'back':
        leave();
        return;
      default:
        break;
    }
    render();
  };

  const save = () => {
    if (!st.sections.length) st.sections.push(makeSection('verse', 8, { ...st.live }));
    const id = newSongId();
    const ok = saveSong({ id, name: st.name, genre: st.genre, bank: st.bank, song: { sections: st.sections }, bpm: st.bpm, mixer: {} });
    app.toast(ok ? `已存成「${st.name}」` : '存檔失敗（瀏覽器不允許儲存），這首歌只能在這次使用', ok ? 'ok' : 'warn');
    if (opts.back === 'songs') {
      if (opts.team === 1) app.settings.awaySong = `my:${id}`;
      else app.settings.homeSong = `my:${id}`;
      app.settings[opts.team === 1 ? 'awayBpm' : 'homeBpm'] = null;
      app.saveSettings();
    }
    leave();
  };

  const leave = () => {
    stopPlay();
    app.go(opts.back || 'menu');
  };

  root.addEventListener('click', (ev) => {
    const e = ev.target.closest('[data-act]');
    if (e) { setFocus(e); act(e); }
  });

  render();
  let infoTimer = 0;
  return {
    el: root,
    dispose() { stopPlay(); },
    input(arr) {
      infoTimer += 1;
      if (infoTimer % 15 === 0) {
        // 正在播的片段會閃，順便更新破音檢查
        gridEl.querySelectorAll('.clip.now').forEach((x) => x.classList.remove('now'));
        if (deck && st.mode === 'live') {
          const cur = deck.currentClips();
          for (const t of TRACK_IDS) {
            const x = gridEl.querySelector(`[data-key="c-${t}-${cur[t]}"]`);
            if (x) x.classList.add('now');
          }
        }
        if (infoTimer % 60 === 0) renderInfo();
      }
      for (const { mi } of arr) {
        for (const d of ['up', 'down', 'left', 'right']) if (mi[d]) { setFocus(navMove(root, focus, d)); app.audio.ui('move'); }
        if (mi.confirm) { act(focus); return; }
        if (mi.back) { app.audio.ui('back'); leave(); return; }
      }
    },
  };
}

export { regenerateTrack };
