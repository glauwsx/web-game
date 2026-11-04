// Loop 工坊：介面與遊戲流程。

import { Engine } from './engine.js';
import { generateBank, regenerateTrack, barDuration } from './generator.js';
import { GENRES, GENRE_IDS, TRACKS, TRACK_IDS } from './genres.js';
import { chordName, keyLabel } from './theory.js';
import {
  SECTION_TYPES, SECTION_TYPE_IDS, MAX_SECTION_BARS, makeSection, songTotalBars, sectionStartBar,
  recordingToSections, autoArrange,
} from './song.js';
import { renderSong, bufferToWav, TAIL_SECONDS } from './render.js';
import { serializeProject, parseProject, storageGet, storageSet, STORAGE_KEYS, downloadBlob, safeFilename } from './project.js';
import { CHALLENGES, evaluate, defaultStats } from './challenges.js';
import { randomSeed } from './rng.js';
import { encodeWav } from './wav.js';

const $ = (sel) => document.querySelector(sel);
const DEFAULT_GENRE = 'lofi';
const DEFAULT_SEED = '20261105';
const SECTION_DEFAULT_BARS = { intro: 4, verse: 8, chorus: 8, bridge: 4, outro: 4 };

function defaultMixer() {
  const m = {};
  for (const t of TRACK_IDS) m[t] = { vol: 0.8, mute: false, solo: false };
  return m;
}

const state = {
  name: '我的歌',
  bank: null,
  song: { sections: [] },
  mixer: defaultMixer(),
  selected: 0,
  view: 'loop',
  stats: defaultStats(),
  unlocked: {},
  lastLive: null,
  exporting: false,
};

const engine = new Engine(() => state);

// ───────────────────────── 小工具 ─────────────────────────

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined) e.append(c);
  return e;
}

function toast(msg, kind = '') {
  const t = el('div', { class: `toast ${kind}`, text: msg });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'badge' ? 3600 : 2600);
  while ($('#toasts').children.length > 2) $('#toasts').firstChild.remove();
}

function fmtTime(sec) {
  const tenths = Math.round(sec * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths - m * 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function trackInfo(id) {
  return TRACKS.find((t) => t.id === id);
}

let saveTimer = null;
function changed({ save = true, goals = true } = {}) {
  if (save) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storageSet(STORAGE_KEYS.autosave, serializeProject(state)), 400);
  }
  if (goals) checkGoals();
}

function saveProgress() {
  storageSet(STORAGE_KEYS.progress, { stats: state.stats, unlocked: state.unlocked });
}

// ───────────────────────── 挑戰 ─────────────────────────

function liveSnapshot() {
  const pos = engine.position();
  const out = {};
  for (const t of TRACK_IDS) out[t] = !!(pos && pos.plan && pos.plan.tracks[t]) && engine.mode === 'live';
  return out;
}

function checkGoals() {
  const fresh = evaluate({ song: state.song, stats: state.stats, live: liveSnapshot() }, state.unlocked);
  if (fresh.length) {
    saveProgress();
    for (const c of fresh) toast(`${c.icon} 解鎖徽章：${c.title}`, 'badge');
    renderGoals();
  }
}

function renderGoals() {
  const list = $('#goals');
  list.replaceChildren();
  const ctx = { song: state.song, stats: state.stats, live: liveSnapshot() };
  let done = 0;
  for (const c of CHALLENGES) {
    const ok = !!state.unlocked[c.id];
    if (ok) done++;
    let stateText = ok ? '已完成 ✓' : '';
    if (!ok && c.progress) {
      try { stateText = c.progress(ctx); } catch (e) { stateText = ''; }
    }
    list.append(el('li', { class: `goal ${ok ? 'done' : ''}`, 'data-goal': c.id }, [
      el('div', { class: 'goal-ico', text: c.icon }),
      el('div', { class: 'goal-text' }, [
        el('div', { class: 'goal-title', text: c.title }),
        el('div', { class: 'goal-desc', text: c.desc }),
        stateText ? el('div', { class: 'goal-state', text: stateText }) : null,
      ]),
    ]));
  }
  $('#goals-count').textContent = `${done} / ${CHALLENGES.length} 個徽章`;
  const badge = $('#tab-badge');
  badge.hidden = done === 0;
  badge.textContent = String(done);
}

// ───────────────────────── 生成 ─────────────────────────

function renderGenreChips() {
  const box = $('#genre-chips');
  box.replaceChildren();
  for (const id of GENRE_IDS) {
    const g = GENRES[id];
    box.append(el('button', {
      class: `chip ${state.bank?.genre === id ? 'on' : ''}`,
      role: 'radio',
      'aria-checked': state.bank?.genre === id ? 'true' : 'false',
      'data-genre': id,
      title: g.desc,
      onclick: () => generate(id, $('#seed-input').value.trim() || state.bank.seed),
    }, [el('span', { text: g.emoji }), el('span', { text: g.name })]));
  }
}

function renderMeta() {
  const b = state.bank;
  $('#meta-bpm').textContent = `${b.bpm} BPM`;
  $('#meta-key').textContent = keyLabel(b.key);
  $('#seed-input').value = b.seed;
}

function generate(genre, seed, { quiet = false } = {}) {
  seed = String(seed || randomSeed()).slice(0, 12);
  state.bank = generateBank({ genre, seed });
  if (!state.stats.genres.includes(genre)) {
    state.stats.genres.push(genre);
    saveProgress();
  }
  engine.applyGenre();
  renderGenreChips();
  renderMeta();
  renderGrid();
  renderTimeline();
  renderEditor();
  if (!quiet) toast(`${GENRES[genre].emoji} ${GENRES[genre].name}・${state.bank.bpm} BPM・${keyLabel(state.bank.key)}`);
  changed();
}

function regenTrack(track) {
  const seed = randomSeed();
  state.bank = regenerateTrack(state.bank, track, seed);
  state.stats.trackRegens += 1;
  saveProgress();
  renderGrid();
  renderTimeline();
  renderEditor();
  toast(`${trackInfo(track).name}重新生成（種子 #${seed}）`);
  changed();
}

// ───────────────────────── Loop 格子 ─────────────────────────

const gridEls = { cells: {}, stops: {}, heads: {} };

function clipSub(track, clip) {
  if (track === 'chords') return clip.chords.map((c) => chordName(c.deg, state.bank.key)).join(' ');
  return '';
}

function renderGrid() {
  const grid = $('#grid');
  grid.replaceChildren();
  gridEls.cells = {};
  gridEls.stops = {};
  gridEls.heads = {};
  for (const t of TRACKS) {
    const m = state.mixer[t.id];
    const col = el('div', { class: 'col', style: `--c:${t.color}`, 'data-track': t.id });
    const mBtn = el('button', { class: `m ${m.mute ? 'on' : ''}`, 'aria-label': `${t.name}靜音`, 'aria-pressed': String(m.mute), text: 'M', onclick: () => toggleMute(t.id) });
    const sBtn = el('button', { class: `s ${m.solo ? 'on' : ''}`, 'aria-label': `${t.name}獨奏`, 'aria-pressed': String(m.solo), text: 'S', onclick: () => toggleSolo(t.id) });
    const vol = el('input', { class: 'vol', type: 'range', min: '0', max: '1', step: '0.01', value: String(m.vol), 'aria-label': `${t.name}音量` });
    vol.addEventListener('input', () => setVolume(t.id, Number(vol.value)));
    const head = el('div', { class: 'track-head' }, [
      el('div', { class: 'track-name' }, [
        el('span', { class: 'tn-long', text: t.name }),
        el('span', { class: 'tn-short', text: t.short }),
      ]),
      el('button', {
        class: 'regen',
        title: '重新生成這一軌',
        'aria-label': `重新生成${t.name}（目前種子 ${state.bank.trackSeeds[t.id]}）`,
        onclick: () => regenTrack(t.id),
      }, [el('span', { class: 'regen-ico', text: '↻' }), el('span', { class: 'track-seed', text: String(state.bank.trackSeeds[t.id]) })]),
      el('div', { class: 'ms' }, [mBtn, sBtn]),
      vol,
    ]);
    gridEls.heads[t.id] = { mBtn, sBtn, vol };
    col.append(head);
    gridEls.cells[t.id] = [];
    state.bank.tracks[t.id].forEach((clip, i) => {
      const prog = el('div', { class: 'c-prog' });
      const cell = el('button', {
        class: 'cell',
        'data-track': t.id,
        'data-clip': String(i),
        'aria-label': `${t.name} ${clip.letter}：${clip.name}，${clip.bars} 小節`,
        onclick: () => tapClip(t.id, i),
      }, [
        el('div', { class: 'c-top' }, [el('span', { class: 'c-letter', text: clip.letter }), el('span', { class: 'c-bars', text: `${clip.bars}小節` })]),
        el('div', { class: 'c-name', text: clip.name }),
        el('div', { class: 'c-sub', text: clipSub(t.id, clip) }),
        prog,
      ]);
      cell._prog = prog;
      cell._state = '';
      gridEls.cells[t.id].push(cell);
      col.append(cell);
    });
    const stop = el('button', { class: 'stop-cell', 'data-stop': t.id, 'aria-label': `停止${t.name}`, text: '■ 停止', onclick: () => engine.queueStop(t.id) });
    gridEls.stops[t.id] = stop;
    col.append(stop);
    grid.append(col);
  }
}

function tapClip(track, i) {
  const pending = engine.live.pending[track];
  const pos = engine.position();
  const playingNow = pos?.plan?.tracks[track]?.clip;
  if (pending && !pending.stop && pending.clip === i) {
    engine.live.cancel(track);
    return;
  }
  if (engine.mode === 'live' && playingNow === i && !pending) {
    engine.queueStop(track);
    return;
  }
  engine.queueClip(track, i);
}

function toggleMute(t) {
  state.mixer[t].mute = !state.mixer[t].mute;
  if (state.mixer[t].mute) state.stats.usedMute = true;
  mixerChanged();
}

function toggleSolo(t) {
  state.mixer[t].solo = !state.mixer[t].solo;
  if (state.mixer[t].solo) state.stats.usedSolo = true;
  mixerChanged();
}

function setVolume(t, v) {
  state.mixer[t].vol = v;
  engine.applyMixer();
  changed({ goals: false });
}

function mixerChanged() {
  engine.applyMixer();
  for (const t of TRACK_IDS) {
    const h = gridEls.heads[t];
    if (!h) continue;
    h.mBtn.classList.toggle('on', state.mixer[t].mute);
    h.sBtn.classList.toggle('on', state.mixer[t].solo);
    h.mBtn.setAttribute('aria-pressed', String(state.mixer[t].mute));
    h.sBtn.setAttribute('aria-pressed', String(state.mixer[t].solo));
  }
  saveProgress();
  changed();
}

function defaultLive() {
  if (state.lastLive && Object.values(state.lastLive).some((v) => v !== null)) return state.lastLive;
  const find = (t, style) => Math.max(0, state.bank.tracks[t].findIndex((c) => c.style === style));
  return { drums: find('drums', 'main'), bass: find('bass', 'main'), chords: 0 };
}

function currentClips() {
  const pos = engine.position();
  const out = {};
  for (const t of TRACK_IDS) out[t] = pos?.plan?.tracks[t] ? pos.plan.tracks[t].clip : null;
  return out;
}

// ───────────────────────── 編曲 ─────────────────────────

function renderAddChips() {
  const box = $('#add-chips');
  box.replaceChildren();
  for (const id of SECTION_TYPE_IDS) {
    const st = SECTION_TYPES[id];
    box.append(el('button', { class: 'chip', style: `--sc:${st.color}`, 'data-add': id, onclick: () => addSection(id) }, [el('i'), el('span', { text: st.name })]));
  }
}

function renderTimeline() {
  const tl = $('#timeline');
  tl.replaceChildren();
  const secs = state.song.sections;
  const total = songTotalBars(state.song);
  $('#song-total').textContent = `共 ${secs.length} 段・${total} 小節・${fmtTime(total * barDuration(state.bank.bpm))}`;
  if (!secs.length) {
    tl.append(el('div', { class: 'empty', text: '還沒有段落。用下面的按鈕新增，或按「一鍵排歌」。也可以在 Loop 台按「錄音」把你的演奏錄進來。' }));
  }
  secs.forEach((s, i) => {
    const st = SECTION_TYPES[s.type];
    const dots = TRACKS.map((t) => {
      const idx = s.clips[t.id];
      const clip = idx === null ? null : state.bank.tracks[t.id][idx];
      return el('b', { class: clip ? 'on' : '', style: `--dc:${t.color}`, title: t.name, text: clip ? clip.letter : '·' });
    });
    const card = el('button', {
      class: `sec ${i === state.selected ? 'selected' : ''}`,
      style: `--sc:${st.color};width:${Math.max(92, Math.min(260, 40 + s.bars * 8))}px`,
      'data-index': String(i),
      'aria-label': `第 ${i + 1} 段：${st.name}，${s.bars} 小節`,
      onclick: () => { state.selected = i; renderTimeline(); renderEditor(); },
    }, [
      el('div', { class: 'sec-play' }),
      el('div', { class: 'sec-band', text: st.name }),
      el('div', { class: 'sec-body' }, [el('div', { class: 'sec-bars', text: `${s.bars} 小節` }), el('div', { class: 'sec-dots' }, dots)]),
    ]);
    tl.append(card);
  });
}

function renderEditor() {
  const box = $('#section-editor');
  box.replaceChildren();
  const s = state.song.sections[state.selected];
  if (!s) {
    box.append(el('div', { class: 'ed-empty', text: '選一個段落來編輯：類型、長度、每軌用哪個片段。' }));
    return;
  }
  const i = state.selected;
  box.append(el('div', { class: 'ed-title' }, [el('h2', { text: `第 ${i + 1} 段：${SECTION_TYPES[s.type].name}` }), el('span', { class: 'muted small', text: `從第 ${sectionStartBar(state.song, i) + 1} 小節開始` })]));

  box.append(el('div', { class: 'ed-row' }, [
    el('span', { class: 'ed-label', text: '類型' }),
    ...SECTION_TYPE_IDS.map((id) => el('button', {
      class: `chip type-chip ${s.type === id ? 'on' : ''}`,
      style: `--sc:${SECTION_TYPES[id].color}`,
      'data-type': id,
      text: SECTION_TYPES[id].name,
      onclick: () => { s.type = id; songChanged(); },
    })),
  ]));

  const setBars = (n) => {
    s.bars = Math.max(1, Math.min(MAX_SECTION_BARS, n));
    songChanged();
  };
  box.append(el('div', { class: 'ed-row' }, [
    el('span', { class: 'ed-label', text: '長度' }),
    el('div', { class: 'len-ctrl' }, [
      el('button', { 'aria-label': '少一小節', text: '−', onclick: () => setBars(s.bars - 1) }),
      el('output', { id: 'ed-bars', text: `${s.bars} 小節` }),
      el('button', { 'aria-label': '多一小節', text: '＋', onclick: () => setBars(s.bars + 1) }),
    ]),
    el('div', { class: 'quick' }, [2, 4, 8, 16].map((n) => el('button', { 'data-bars': String(n), text: String(n), onclick: () => setBars(n) }))),
  ]));

  for (const t of TRACKS) {
    const cur = s.clips[t.id];
    const chips = [el('button', { class: cur === null ? 'on' : '', 'data-pick': `${t.id}:none`, text: '—', 'aria-label': `${t.name}不用`, onclick: () => { s.clips[t.id] = null; clearOffset(s, t.id); songChanged(); } })];
    state.bank.tracks[t.id].forEach((c, ci) => {
      chips.push(el('button', {
        class: cur === ci ? 'on' : '',
        'data-pick': `${t.id}:${ci}`,
        title: `${c.name}（${c.bars} 小節）`,
        text: c.letter,
        onclick: () => { s.clips[t.id] = ci; clearOffset(s, t.id); songChanged(); },
      }));
    });
    box.append(el('div', { class: 'ed-track', style: `--c:${t.color}` }, [el('span', { class: 'ed-label', text: t.short }), el('div', { class: 'clip-chips' }, chips)]));
  }

  box.append(el('div', { class: 'ed-actions' }, [
    el('button', { class: 'btn primary', id: 'btn-play-section', text: '▶ 從這段播放', onclick: () => playSongFrom(i) }),
    el('button', { class: 'btn', text: '複製', onclick: () => duplicateSection(i) }),
    el('button', { class: 'btn', 'aria-label': '往前移', text: '◀', onclick: () => moveSection(i, -1) }),
    el('button', { class: 'btn', 'aria-label': '往後移', text: '▶', onclick: () => moveSection(i, 1) }),
    el('button', { class: 'btn danger', text: '刪除', onclick: () => deleteSection(i) }),
  ]));
}

function clearOffset(s, t) {
  if (s.offsets) s.offsets[t] = 0;
}

function songChanged() {
  renderTimeline();
  renderEditor();
  renderGoals();
  changed();
}

function addSection(type, clips = null, bars = null) {
  let c = clips;
  if (!c) {
    const live = currentClips();
    if (engine.mode === 'live' && Object.values(live).some((v) => v !== null)) c = live;
    else if (state.song.sections[state.selected]) c = { ...state.song.sections[state.selected].clips };
    else c = defaultLive();
  }
  const sec = makeSection(type, bars || SECTION_DEFAULT_BARS[type], c);
  const at = state.song.sections.length ? Math.min(state.selected + 1, state.song.sections.length) : 0;
  state.song.sections.splice(at, 0, sec);
  state.selected = at;
  songChanged();
  return sec;
}

function duplicateSection(i) {
  const s = state.song.sections[i];
  const copy = makeSection(s.type, s.bars, { ...s.clips });
  if (s.offsets) copy.offsets = { ...s.offsets };
  if (s.hOff) copy.hOff = s.hOff;
  state.song.sections.splice(i + 1, 0, copy);
  state.selected = i + 1;
  songChanged();
}

function moveSection(i, d) {
  const j = i + d;
  const secs = state.song.sections;
  if (j < 0 || j >= secs.length) return;
  [secs[i], secs[j]] = [secs[j], secs[i]];
  state.selected = j;
  songChanged();
}

function deleteSection(i) {
  state.song.sections.splice(i, 1);
  state.selected = Math.max(0, Math.min(state.selected, state.song.sections.length - 1));
  songChanged();
}

async function playSongFrom(i) {
  if (!songTotalBars(state.song)) {
    toast('編曲還是空的，先新增段落');
    return;
  }
  rememberLive();
  await engine.playSong(i);
  setPlayingUI();
}

function rememberLive() {
  if (engine.mode === 'live') {
    const c = currentClips();
    if (Object.values(c).some((v) => v !== null)) state.lastLive = c;
  }
}

// ───────────────────────── 傳輸列 ─────────────────────────

function setPlayingUI() {
  $('#app').classList.toggle('playing', engine.mode !== 'stopped');
  $('#btn-play').setAttribute('aria-label', engine.mode === 'stopped' ? '播放' : '停止');
}

async function togglePlay() {
  if (engine.mode !== 'stopped') {
    rememberLive();
    engine.stop();
  } else {
    await engine.startLive(defaultLive());
  }
  setPlayingUI();
}

async function toggleRecord() {
  if (engine.recording === 'idle') {
    await engine.startRecording(defaultLive());
    setPlayingUI();
    toast('下一個小節線開始錄音，盡情切換片段吧！');
  } else {
    engine.stopRecording(); // 結果由 'rec' 事件交給 finishRecording
  }
  updateRecButton();
}

function finishRecording(entries) {
  const secs = recordingToSections(entries, state.bank);
  const bars = secs.reduce((n, s) => n + s.bars, 0);
  if (!secs.length) {
    toast('這次沒有錄到聲音');
    return;
  }
  state.stats.recordedBars = Math.max(state.stats.recordedBars, bars);
  saveProgress();
  state.song.sections.push(...secs);
  state.selected = state.song.sections.length - secs.length;
  songChanged();
  toast(`已把 ${bars} 小節的演奏加進編曲（${secs.length} 個段落）`);
}

function updateRecButton() {
  const b = $('#btn-rec');
  const r = engine.recording;
  b.classList.toggle('armed', r === 'armed');
  b.classList.toggle('recording', r === 'recording');
  b.querySelector('.rec-label').textContent = r === 'idle' ? '錄音' : r === 'armed' ? '準備…' : '停止錄音';
}

// ───────────────────────── 畫面更新（每一格畫面） ─────────────────────────

let energy = 0;
let lastBeatKey = '';

function frame() {
  const pos = engine.position();
  const playing = !!pos && !pos.waiting;

  // 位置
  let txt = '已停止';
  if (engine.mode !== 'stopped') {
    if (!playing) txt = '準備中…';
    else if (pos.mode === 'song' && pos.section !== null && state.song.sections[pos.section]) {
      const s = state.song.sections[pos.section];
      const inSec = pos.bar - sectionStartBar(state.song, pos.section);
      txt = `${SECTION_TYPES[s.type].name} ${inSec + 1}/${s.bars}`;
    } else txt = `第 ${pos.bar + 1} 小節`;
  }
  const pm = $('#pos-main');
  if (pm.textContent !== txt) pm.textContent = txt;
  const beatKey = playing ? `${pos.bar}:${pos.beat}` : '';
  if (beatKey !== lastBeatKey) {
    lastBeatKey = beatKey;
    $('#beats').querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', playing && k === pos.beat));
  }

  // 格子
  for (const t of TRACK_IDS) {
    const cells = gridEls.cells[t];
    if (!cells) continue;
    const tp = playing ? pos.plan.tracks[t] : null;
    const pend = engine.live.pending[t];
    cells.forEach((cell, i) => {
      const isPlaying = !!tp && tp.clip === i;
      const isQueued = !!pend && !pend.stop && pend.clip === i;
      let st = '';
      if (isPlaying) st = isQueued ? 'playing queued' : pend ? 'playing stopping' : 'playing';
      else if (isQueued) st = 'queued';
      if (st !== cell._state) {
        cell.className = `cell ${st}`;
        cell._state = st;
      }
      if (tp && tp.clip === i) {
        const clip = state.bank.tracks[t][i];
        const p = ((tp.clipBar + pos.frac) / clip.bars) * 100;
        cell._prog.style.width = `${p.toFixed(1)}%`;
        cell.style.setProperty('--beat', (1 - pos.beatFrac).toFixed(2));
      }
    });
    const stopEl = gridEls.stops[t];
    if (stopEl) stopEl.classList.toggle('active', !!tp);
  }

  // 編曲時間軸
  const cards = $('#timeline').children;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (!c.classList.contains('sec')) continue;
    const now = playing && pos.mode === 'song' && pos.section === i;
    c.classList.toggle('now', now);
    const bar = c.firstChild;
    if (now) {
      const s = state.song.sections[i];
      const inSec = pos.bar - sectionStartBar(state.song, i);
      bar.style.width = `${(((inSec + pos.frac) / s.bars) * 100).toFixed(1)}%`;
    } else if (bar.style.width !== '0%') bar.style.width = '0%';
  }

  // 能量條
  // 能量 = 現在的音量（會跟著拍子跳）＋ 同時在播的軌數（疊越多越滿）
  const lvl = engine.mode === 'stopped' ? 0 : engine.level();
  const db = lvl > 0 ? 20 * Math.log10(lvl) : -100;
  const loud = Math.max(0, Math.min(1, (db + 36) / 30));
  const layers = playing ? TRACK_IDS.filter((t) => pos.plan.tracks[t] && (engine.gains[t] ?? 1) > 0).length / TRACK_IDS.length : 0;
  const target = engine.mode === 'stopped' ? 0 : 0.6 * loud + 0.4 * layers;
  energy = Math.max(target, energy * 0.94);
  $('#energy-fill').style.width = `${(energy * 100).toFixed(1)}%`;
  const label = engine.mode === 'stopped' ? '能量' : energy < 0.35 ? '能量：暖身中' : energy < 0.6 ? '能量：有感覺了' : energy < 0.85 ? '能量：很嗨！' : '能量：火力全開！';
  const le = $('#energy-label');
  if (le.textContent !== label) le.textContent = label;
  $('#energy').classList.toggle('hot', energy >= 0.85);

  requestAnimationFrame(frame);
}

// ───────────────────────── 匯出、存檔 ─────────────────────────

async function exportWav({ tail = $('#chk-tail').checked, download = true } = {}) {
  if (state.exporting) return null;
  if (!songTotalBars(state.song)) {
    toast('編曲還是空的，先新增段落');
    return null;
  }
  state.exporting = true;
  const btn = $('#btn-export');
  btn.disabled = true;
  btn.textContent = '算圖中…';
  $('#export-progress').hidden = false;
  $('#export-fill').style.width = '0%';
  const t0 = performance.now();
  try {
    const buffer = await renderSong({
      bank: state.bank, song: state.song, mixer: state.mixer, tail: tail ? TAIL_SECONDS : 0,
      onProgress: (p) => { $('#export-fill').style.width = `${Math.round(p * 100)}%`; },
    });
    const { wav, stats } = bufferToWav(buffer);
    const file = `${safeFilename(state.name)}.wav`;
    if (download) downloadBlob(new Blob([wav], { type: 'audio/wav' }), file);
    const mb = (wav.byteLength / 1048576).toFixed(1);
    $('#export-result').textContent = `完成：${file}・長度 ${fmtTime(stats.duration)}・峰值 ${stats.peakDb.toFixed(1)} dBFS・${mb} MB（花了 ${((performance.now() - t0) / 1000).toFixed(1)} 秒）`;
    state.stats.exports += 1;
    saveProgress();
    checkGoals();
    toast('💿 WAV 匯出完成');
    return { wav, stats };
  } catch (e) {
    console.warn(e);
    toast(`匯出失敗：${e.message}`, 'error');
    $('#export-result').textContent = `匯出失敗：${e.message}`;
    return null;
  } finally {
    state.exporting = false;
    btn.disabled = false;
    btn.textContent = '匯出整首歌';
    setTimeout(() => { $('#export-progress').hidden = true; }, 800);
  }
}

function applyProject(p, msg) {
  engine.stop();
  setPlayingUI();
  state.name = p.name;
  state.bank = p.bank;
  state.song = p.song;
  state.mixer = p.mixer;
  state.selected = 0;
  state.lastLive = null;
  $('#project-name').value = state.name;
  engine.applyGenre();
  engine.applyMixer();
  renderGenreChips();
  renderMeta();
  renderGrid();
  renderTimeline();
  renderEditor();
  renderGoals();
  if (msg) toast(msg);
  changed();
}

function loadFromObject(obj, msg) {
  try {
    applyProject(parseProject(obj), msg);
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

// ───────────────────────── 分頁 ─────────────────────────

function openHelp() {
  const d = $('#help');
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
}

function showView(v) {
  state.view = v;
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.dataset.view === v));
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === v));
  if (v === 'goals') renderGoals();
  window.scrollTo({ top: 0 });
}

// ───────────────────────── iOS 靜音開關 ─────────────────────────

let iosUnlocked = false;
function unlockAudio() {
  engine.init();
  if (iosUnlocked) return;
  iosUnlocked = true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;
  try {
    // 播一段無聲的音訊，讓 iOS 把聲音當成「媒體播放」，靜音開關打開時也聽得到
    const silent = encodeWav([new Float32Array(4410)], 44100);
    const a = new Audio(URL.createObjectURL(new Blob([silent], { type: 'audio/wav' })));
    a.loop = true;
    a.setAttribute('playsinline', '');
    a.volume = 0.01;
    a.play().catch(() => {});
  } catch (e) { /* ignore */ }
}

// ───────────────────────── 啟動 ─────────────────────────

function bind() {
  document.addEventListener('pointerdown', unlockAudio, { capture: true });
  document.addEventListener('keydown', unlockAudio, { capture: true });
  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-rec').addEventListener('click', toggleRecord);
  $('#btn-help').addEventListener('click', openHelp);
  $('#help').addEventListener('submit', (e) => {
    // 支援 <dialog> 的瀏覽器會自己關掉；不支援的才手動關
    if (typeof $('#help').close !== 'function') {
      e.preventDefault();
      $('#help').removeAttribute('open');
    }
  });
  $('#btn-dice').addEventListener('click', () => generate(state.bank.genre, randomSeed()));
  $('#btn-generate').addEventListener('click', () => generate(state.bank.genre, $('#seed-input').value.trim() || randomSeed()));
  $('#seed-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(state.bank.genre, e.target.value.trim()); });
  $('#btn-stop-all').addEventListener('click', () => engine.queueAllStop());
  $('#btn-add-current').addEventListener('click', () => {
    const c = currentClips();
    if (!Object.values(c).some((v) => v !== null)) {
      toast('先播放一些片段，再把組合加成段落');
      return;
    }
    const type = state.song.sections.length === 0 ? 'intro' : 'verse';
    const sec = addSection(type, c, 8);
    toast(`已加入「${SECTION_TYPES[sec.type].name}」段落（8 小節），到「編曲」可以修改`);
  });
  $('#btn-song-play').addEventListener('click', () => playSongFrom(0));
  $('#btn-song-from').addEventListener('click', () => playSongFrom(state.selected));
  $('#btn-auto').addEventListener('click', () => {
    if (state.song.sections.length && !confirm('一鍵排歌會取代目前的編曲，確定嗎？')) return;
    state.song = autoArrange(state.bank);
    state.selected = 0;
    songChanged();
    toast('排好一首 44 小節的歌了，按「播放整首」聽聽看');
  });
  $('#btn-export').addEventListener('click', () => exportWav());
  $('#project-name').addEventListener('input', (e) => { state.name = e.target.value; changed({ goals: false }); });
  $('#btn-save-local').addEventListener('click', () => {
    const ok = storageSet(STORAGE_KEYS.saved, serializeProject(state));
    toast(ok ? '已存到這個瀏覽器' : '存檔失敗：瀏覽器不允許儲存', ok ? '' : 'error');
  });
  $('#btn-load-local').addEventListener('click', () => {
    const p = storageGet(STORAGE_KEYS.saved);
    if (!p) { toast('瀏覽器裡還沒有存檔'); return; }
    loadFromObject(p, '已讀取瀏覽器裡的存檔');
  });
  $('#btn-save-file').addEventListener('click', () => {
    const json = JSON.stringify(serializeProject(state), null, 1);
    downloadBlob(new Blob([json], { type: 'application/json' }), `${safeFilename(state.name)}.json`);
    toast('專案檔已下載');
  });
  $('#btn-load-file').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    loadFromObject(text, `已開啟「${f.name}」`);
    e.target.value = '';
  });
  $('#btn-demo').addEventListener('click', async () => {
    try {
      const res = await fetch('examples/demo-project.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadFromObject(await res.json(), '已載入示範歌，按「播放整首」聽聽看');
      showView('song');
    } catch (e) {
      toast(`示範歌載入失敗：${e.message}`, 'error');
    }
  });
  $('#btn-clear-song').addEventListener('click', () => {
    if (!state.song.sections.length) return;
    if (!confirm('確定要清空所有段落嗎？')) return;
    if (engine.mode === 'song') engine.stop();
    state.song.sections = [];
    state.selected = 0;
    setPlayingUI();
    songChanged();
  });
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.tab)));
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.key === 'r' || e.key === 'R') toggleRecord();
  });

  engine.on('mode', () => { setPlayingUI(); updateRecButton(); });
  engine.on('launch', (list) => {
    state.stats.launches += list.length;
    setTimeout(checkGoals, 250);
  });
  engine.on('rec', (r) => {
    updateRecButton();
    // 不管是按「停止錄音」還是直接按停止，錄到的內容都存進編曲
    if (r.state === 'idle' && r.entries) finishRecording(r.entries);
  });
  engine.on('songEnd', () => { setPlayingUI(); });
  // 播放中每隔一段時間檢查一次「同時播放」類的挑戰
  setInterval(() => { if (engine.mode === 'live') checkGoals(); }, 1000);
}

function boot() {
  const progress = storageGet(STORAGE_KEYS.progress);
  if (progress) {
    state.stats = { ...defaultStats(), ...(progress.stats || {}) };
    state.unlocked = progress.unlocked || {};
  }
  bind();
  renderAddChips();
  let restored = false;
  const auto = storageGet(STORAGE_KEYS.autosave);
  if (auto) {
    try {
      const p = parseProject(auto);
      state.name = p.name;
      state.bank = p.bank;
      state.song = p.song;
      state.mixer = p.mixer;
      $('#project-name').value = state.name;
      restored = true;
    } catch (e) {
      restored = false;
    }
  }
  if (restored) {
    renderGenreChips();
    renderMeta();
    renderGrid();
    renderTimeline();
    renderEditor();
    toast('已還原上次的進度');
  } else {
    generate(DEFAULT_GENRE, DEFAULT_SEED, { quiet: true });
  }
  renderGoals();
  if (!progress) openHelp();
  requestAnimationFrame(frame);
}

// 讓自動化測試可以操作（不影響一般使用）
window.__loops = {
  state, engine, generate, regenTrack, exportWav, addSection, autoArrange: () => { state.song = autoArrange(state.bank); songChanged(); },
  renderSong, bufferToWav, finishRecording, showView,
};

boot();
