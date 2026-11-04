// 片段生成器。輸入：曲風 + 種子。輸出：一組「片段庫」(bank)。
// 音高一律存成「相對於當下和弦根音的音級」(rel)，播放時才依和弦換算成 MIDI。
// 所以任何片段組合都在同一個調裡，和聲不會打架。

import { Rng, hashString } from './rng.js';
import { GENRES, TRACK_IDS } from './genres.js';
import { PROGRESSIONS } from './theory.js';

export const CLIPS_PER_TRACK = 8;
export const STEPS_PER_BAR = 16;
const LETTERS = 'ABCDEFGH';

const r3 = (x) => Math.round(x * 1000) / 1000;

// 格子字串 → 打點。X=重、x=中、o=輕、-=很輕
function grid(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const v = c === 'X' ? 1 : c === 'x' ? 0.82 : c === 'o' ? 0.5 : c === '-' ? 0.32 : 0;
    if (v > 0) out.push({ s: i, v });
  }
  return out;
}

function onsets(str) {
  return grid(str).map((g) => g.s);
}

// ───────────────────────── 鼓 ─────────────────────────

const DRUM_STYLES = {
  lofi: {
    kicks: ['X.........x.....', 'X......x..x.....', 'X.....x...x..x..', 'X..x......x.....', 'X.......x.x.....'],
    lightKick: 'x.........x.....',
    halfKick: 'X.........x.....',
    snare: '....X.......X...',
    halfSnare: '........X.......',
    ghosts: ['.......o......o.', '..o.......o.....', '.........o.....o'],
    hats: ['x-x-x-x-x-x-x-x-', 'x.x.x.x.x.x.x.x.', 'x-xox-x-x-xox-x-'],
    lightHats: 'o.o.o.o.o.o.o.o.',
    open: ['..............x.', '......x.........'],
    perc: { d: 'snap', g: '....x.......x...' },
    lightSnare: 'rim',
    fill: 'snare',
  },
  house: {
    kicks: ['X...X...X...X...', 'X...X...X...X..o', 'X...X...X..oX...'],
    lightKick: 'x...x...x...x...',
    halfKick: '................',
    snare: '....X.......X...',
    snareDrum: 'clap',
    halfSnare: '....x.......x...',
    ghosts: ['.......o........', '...........o...o'],
    hats: ['.-x-.-x-.-x-.-x-', '..x...x...x...x.', 'o-x-o-x-o-x-o-x-'],
    hatsAreOpen: true,
    lightHats: '..o...o...o...o.',
    closed: 'o.o.o.o.o.o.o.o.',
    open: ['..............x.'],
    perc: { d: 'shaker', g: 'o-o-o-o-o-o-o-o-' },
    perc2: { d: 'rim', g: '...x..x....x..x.' },
    lightSnare: 'clap',
    fill: 'snare',
  },
  synthwave: {
    kicks: ['X.......X.......', 'X.......X.x.....', 'X.....x.X.......', 'X..x....X.......'],
    lightKick: 'x.......x.......',
    halfKick: 'X...............',
    snare: '....X.......X...',
    snareDrum: 'bigsnare',
    halfSnare: '........X.......',
    ghosts: ['...............o'],
    hats: ['x.x.x.x.x.x.x.x.', 'x-x-x-x-x-x-x-x-', 'xox.xox.xox.xox.'],
    lightHats: 'o.o.o.o.o.o.o.o.',
    open: ['......x.......x.'],
    perc: { d: 'tomL', g: '..........o.....' },
    lightSnare: 'rim',
    fill: 'toms',
  },
  rock: {
    kicks: ['X.......X.......', 'X.......X.x.....', 'X..x....X.x.....', 'X.....x.X.......'],
    lightKick: 'x.......x.......',
    halfKick: 'X.........x.....',
    snare: '....X.......X...',
    halfSnare: '........X.......',
    ghosts: ['.......o......o.', '...o......o.....'],
    hats: ['x.x.x.x.x.x.x.x.', 'X.x.X.x.X.x.X.x.', 'x.x.x.x.x.x.x.o.'],
    lightHats: 'o...o...o...o...',
    open: ['..............x.', '......x.......x.'],
    perc: { d: 'hatO', g: '..............x.' },
    lightSnare: 'rim',
    fill: 'toms',
  },
  trap: {
    kicks: ['X......x..x.....', 'X.....x...x.....', 'X.......x.....x.', 'X..x......x..x..', 'X......x.x......'],
    lightKick: 'x...............',
    halfKick: 'X...............',
    snare: '........X.......',
    snareDrum: 'clap',
    halfSnare: '........x.......',
    ghosts: ['..............o.', '.....o..........'],
    hats: null, // 用滾奏產生
    lightHats: 'o.o.o.o.o.o.o.o.',
    open: ['......x.........', '..............x.'],
    perc: { d: 'rim', g: '...x.......x....' },
    lightSnare: 'snare',
    fill: 'trap',
  },
  chip: {
    kicks: ['X...X...X...X...', 'X.....x.X.......', 'X.......X.x.....', 'X..x..x.X.......'],
    lightKick: 'x.......x.......',
    halfKick: 'X.......x.......',
    snare: '....X.......X...',
    halfSnare: '........X.......',
    ghosts: ['.......o.......o'],
    hats: ['x.x.x.x.x.x.x.x.', 'xxx.xxx.xxx.xxx.', 'x-x-x-x-x-x-x-x-'],
    lightHats: 'o.o.o.o.o.o.o.o.',
    open: ['..............x.'],
    perc: { d: 'hatO', g: '......x.......x.' },
    lightSnare: 'snare',
    fill: 'snare',
  },
};

const DRUM_ROLES = [
  { role: 'light', name: '輕拍', bars: [1, 2], energy: 0.3 },
  { role: 'minimal', name: '極簡', bars: [1], energy: 0.4 },
  { role: 'main', name: '主律動', bars: [2], energy: 0.6 },
  { role: 'mainB', name: '律動變化', bars: [1, 2], energy: 0.65 },
  { role: 'half', name: '半拍感', bars: [2], energy: 0.5 },
  { role: 'busy', name: '熱鬧', bars: [2, 4], energy: 0.8 },
  { role: 'fill', name: '過門', bars: [1], energy: 0.75 },
  { role: 'peak', name: '全力衝刺', bars: [4], energy: 1 },
];

function trapHats(rng, density) {
  // 每一拍隨機選：八分、十六分、三連音、三十二分滾奏
  const out = [];
  for (let beat = 0; beat < 4; beat++) {
    const base = beat * 4;
    const kind = rng.weighted([
      ['8', 3 - density * 1.5],
      ['16', 3],
      ['trip', 1 + density],
      ['32', density * 1.5],
    ]);
    if (kind === '8') {
      out.push({ s: base, v: 0.8 }, { s: base + 2, v: 0.55 });
    } else if (kind === '16') {
      for (let i = 0; i < 4; i++) out.push({ s: base + i, v: i % 2 ? 0.45 : 0.78 });
    } else if (kind === 'trip') {
      for (let i = 0; i < 6; i++) out.push({ s: r3(base + (i * 4) / 6), v: 0.45 + 0.07 * i });
    } else {
      for (let i = 0; i < 8; i++) out.push({ s: base + i * 0.5, v: 0.35 + 0.06 * i });
    }
  }
  return out;
}

function fillNotes(kind, from, rng) {
  // from：過門從第幾個十六分音符開始（8 或 12）
  const out = [];
  const n = 16 - from;
  if (kind === 'toms') {
    const toms = n > 4 ? ['tomH', 'tomH', 'tomM', 'tomM', 'tomL', 'tomL', 'tomL', 'snare'] : ['tomH', 'tomM', 'tomL', 'tomL'];
    for (let i = 0; i < n; i++) out.push({ s: from + i, d: toms[Math.floor((i / n) * toms.length)], v: 0.6 + 0.4 * (i / n) });
  } else if (kind === 'trap') {
    for (let i = 0; i < n * 2; i++) out.push({ s: from + i * 0.5, d: 'snare', v: 0.3 + 0.6 * (i / (n * 2)) });
  } else {
    const rate = rng.chance(0.5) ? 1 : 2;
    for (let i = 0; i < n; i += rate) out.push({ s: from + i, d: 'snare', v: 0.45 + 0.55 * (i / n) });
  }
  return out;
}

function drumClip(styleId, roleDef, rng, humanize) {
  const st = DRUM_STYLES[styleId];
  const bars = rng.pick(roleDef.bars);
  const role = roleDef.role;
  const kickA = rng.pick(st.kicks);
  const kickB = rng.pick(st.kicks);
  const hatsA = st.hats ? rng.pick(st.hats) : null;
  const hatsB = st.hats ? rng.pick(st.hats) : null;
  const ghost = rng.pick(st.ghosts);
  const open = rng.pick(st.open);
  const snareDrum = st.snareDrum || 'snare';
  const density = role === 'busy' || role === 'peak' ? 0.9 : role === 'light' ? 0.1 : 0.5;
  const notes = [];

  for (let b = 0; b < bars; b++) {
    const bar = [];
    const add = (list, d, scale = 1) => {
      for (const g of list) bar.push({ s: g.s, d, v: g.v * scale });
    };
    const isLast = b === bars - 1;

    // 大鼓
    let kick = kickA;
    if (role === 'light') kick = st.lightKick;
    if (role === 'half') kick = st.halfKick;
    if ((role === 'mainB' || role === 'busy') && b % 2 === 1) kick = kickB;
    if (role === 'mainB' && bars === 1) kick = kickB;
    add(grid(kick), 'kick');

    // 小鼓／拍手
    if (role === 'light') add(grid(st.snare), st.lightSnare, 0.7);
    else if (role === 'half') add(grid(st.halfSnare), snareDrum);
    else if (role !== 'minimal') add(grid(st.snare), snareDrum);
    if (role === 'mainB' || role === 'busy' || role === 'peak') add(grid(ghost), 'snare', 0.8);

    // 鈸
    if (styleId === 'trap') {
      if (role === 'light') add(grid(st.lightHats), 'hatC');
      else add(trapHats(rng, density), 'hatC');
    } else {
      const hats = role === 'light' ? st.lightHats : role === 'mainB' || role === 'busy' ? hatsB : hatsA;
      if (st.hatsAreOpen && role !== 'light' && role !== 'minimal') {
        add(grid(hats).filter((g) => g.s % 4 === 2), 'hatO', 0.75);
        add(grid(hats).filter((g) => g.s % 4 !== 2), 'hatC');
      } else {
        add(grid(hats), 'hatC', role === 'light' ? 0.8 : 1);
      }
      if (st.closed && role !== 'light') add(grid(st.closed), 'hatC', 0.8);
    }
    if ((role === 'busy' || role === 'peak' || (role === 'main' && isLast)) && !st.hatsAreOpen) add(grid(open), 'hatO', 0.7);

    // 打擊樂
    if (role === 'busy' || role === 'peak') add(grid(st.perc.g), st.perc.d, 0.8);
    if (st.perc2 && (role === 'mainB' || role === 'peak')) add(grid(st.perc2.g), st.perc2.d, 0.8);

    // 銅鈸
    if (role === 'peak' && b === 0) bar.push({ s: 0, d: 'crash', v: 0.85 });

    // 過門
    let fillFrom = null;
    if (role === 'fill') fillFrom = rng.chance(0.5) ? 8 : 12;
    if (role === 'peak' && isLast) fillFrom = 12;
    if (role === 'busy' && isLast && bars === 4) fillFrom = 12;
    let finalBar = bar;
    if (fillFrom !== null) {
      finalBar = bar.filter((n) => n.s < fillFrom || n.d === 'kick' && n.s % 4 === 0 && styleId === 'house');
      finalBar = finalBar.filter((n) => !(n.s >= fillFrom && (n.d === 'snare' || n.d === 'clap' || n.d === 'bigsnare')));
      finalBar.push(...fillNotes(st.fill, fillFrom, rng));
    }

    for (const n of finalBar) {
      let s = n.s;
      if (humanize && !(n.d === 'kick' && s === 0)) s = Math.max(0, s + rng.range(-humanize, humanize));
      notes.push({ s: r3(b * 16 + s), d: n.d, v: r3(Math.min(1, n.v * rng.range(0.88, 1))) });
    }
  }
  notes.sort((a, b) => a.s - b.s);
  return { bars, notes, style: role };
}

// ───────────────────────── 貝斯 ─────────────────────────

const BASS_STYLES = {
  lofi: {
    rhythms: ['x.....x...x.....', 'x.........x..x..', 'x......x..x.....', 'x.......x.....x.', 'x..x......x.....'],
    sustain: 'x.......x.......', busy: 'x.....x.x.x..x..', legato: 0.92,
    pitch: { 0: 6, 4: 2, 7: 1, 2: 1, 5: 1 },
  },
  house: {
    rhythms: ['..x...x...x...x.', '..xx..x...xx..x.', '..x..xx...x..xx.', 'x..x..x.x..x..x.'],
    sustain: 'x.......x.......', busy: '.xx.xx.x.xx.xx.x', legato: 0.5,
    pitch: { 0: 6, 7: 3, 4: 1 },
  },
  synthwave: {
    rhythms: ['x.x.x.x.x.x.x.x.', 'x.xxx.xxx.xxx.xx', 'x.x.x.x.x.x.xxxx'],
    sustain: 'x...............', busy: 'xxxxxxxxxxxxxxxx', legato: 0.75,
    pitch: { 0: 8, 7: 2, 4: 1 },
  },
  poprock: {
    rhythms: ['x.x.x.x.x.x.x.x.', 'x...x...x...x...', 'x..x..x.x.x.x...', 'x.x.x.x.x.x.x.xx'],
    sustain: 'x.......x.......', busy: 'x.xxx.xxx.xxx.xx', legato: 0.8,
    pitch: { 0: 8, 4: 2, 7: 1 },
  },
  trap: {
    rhythms: ['x......x..x.....', 'x.....x...x.....', 'x.......x.....x.', 'x..x......x.....'],
    sustain: 'x...............', busy: 'x..x..x...x.x.x.', legato: 1,
    pitch: { 0: 6, 7: 2, 4: 1, '-3': 1 },
  },
  chip: {
    rhythms: ['x.x.x.x.x.x.x.x.', 'x.xxx.xxx.xxx.xx', 'xxxxxxxxxxxxxxxx'],
    sustain: 'x...x...x...x...', busy: 'xxxxxxxxxxxxxxxx', legato: 0.7,
    pitch: { 0: 6, 7: 4, 4: 2 },
  },
};

const BASS_ROLES = [
  { role: 'sustain', name: '長音', bars: [1, 2], energy: 0.3 },
  { role: 'main', name: '主線', bars: [1, 2], energy: 0.6 },
  { role: 'mainB', name: '主線變化', bars: [2], energy: 0.6 },
  { role: 'octave', name: '八度跳', bars: [1], energy: 0.7 },
  { role: 'walk', name: '走路線', bars: [2, 4], energy: 0.65 },
  { role: 'busy', name: '熱鬧', bars: [1, 2], energy: 0.85 },
  { role: 'high', name: '高把位', bars: [2], energy: 0.6 },
  { role: 'riff', name: '樂句', bars: [4], energy: 0.75 },
];

function bassClip(styleId, roleDef, rng) {
  const st = BASS_STYLES[styleId];
  const bars = rng.pick(roleDef.bars);
  const role = roleDef.role;
  const rA = rng.pick(st.rhythms);
  const rB = rng.pick(st.rhythms);
  const notes = [];
  let prevRel = 0;
  const walkSeq = rng.pick([[0, 2, 4, 2], [0, 4, 2, 1], [0, 1, 2, 4], [0, 4, 5, 4]]);
  for (let b = 0; b < bars; b++) {
    let rhythm = rA;
    if (role === 'sustain') rhythm = st.sustain;
    else if (role === 'busy') rhythm = st.busy;
    else if (role === 'mainB' && b % 2 === 1) rhythm = rB;
    else if (role === 'riff') rhythm = b % 2 === 0 ? rA : rB;
    else if (role === 'walk') rhythm = 'x...x...x...x...';
    const on = onsets(rhythm);
    for (let i = 0; i < on.length; i++) {
      const s = on[i];
      const next = i + 1 < on.length ? on[i + 1] : 16;
      let len = Math.max(0.5, (next - s) * st.legato);
      if (role === 'sustain') len = (next - s) * 0.96;
      let rel;
      if (role === 'walk') rel = walkSeq[i % walkSeq.length];
      else if (role === 'octave') rel = i % 2 === 0 ? 0 : 7;
      else if (i === 0 || s === 0) rel = 0;
      else if (styleId === 'chip' && role === 'busy') rel = [0, 4, 7, 4][i % 4];
      else rel = rng.weightedObj(st.pitch);
      if (role === 'riff' && b === bars - 1 && i === on.length - 1) rel = rng.pick([4, -1, 2]);
      const note = { s: b * 16 + s, len: r3(len), rel, v: r3(rng.range(0.82, 1) * (s % 4 === 0 ? 1 : 0.85)) };
      if (role === 'high') note.oct = 1;
      if (styleId === 'trap' && i > 0 && rel !== prevRel && rng.chance(0.35)) note.glide = prevRel;
      notes.push(note);
      prevRel = rel;
    }
  }
  return { bars, notes, style: role };
}

// ───────────────────────── 和弦 ─────────────────────────

const CHORD_STYLES = {
  lofi: [
    { id: 'sustain', name: '溫暖長音', grid: 'x...............', gate: 0.96, strum: 0.1 },
    { id: 'comp', name: '切分伴奏', grid: 'x......x........', gate: 0.9, strum: 0.08 },
    { id: 'stab', name: '短促和弦', grid: '..x...x...x..x..', gate: 0.5, strum: 0.04 },
    { id: 'arp', name: '分解和弦', arp: { rate: 2, pattern: [0, 1, 2, 3, 2, 1, 0, 1] } },
    { id: 'half', name: '二分音符', grid: 'x.......x.......', gate: 0.9, strum: 0.1 },
  ],
  house: [
    { id: 'stab', name: '切分和弦', grid: '...x..x...x..x..', gate: 0.35, strum: 0 },
    { id: 'off', name: '反拍和弦', grid: '..x...x...x...x.', gate: 0.4, strum: 0 },
    { id: 'pad', name: '鋪底長音', grid: 'x...............', gate: 0.98, strum: 0, voice: 'pad' },
    { id: 'piano', name: '鋼琴節奏', grid: 'x..x..x...x..x..', gate: 0.45, strum: 0.02, voice: 'piano' },
    { id: 'arp', name: '琶音', arp: { rate: 1, pattern: [0, 1, 2, 3] } },
  ],
  synthwave: [
    { id: 'pad', name: '霓虹鋪底', grid: 'x...............', gate: 0.98, strum: 0 },
    { id: 'pulse', name: '八分脈衝', grid: 'x.x.x.x.x.x.x.x.', gate: 0.6, strum: 0, voice: 'stab' },
    { id: 'arp', name: '十六分琶音', arp: { rate: 1, pattern: [0, 1, 2, 3, 2, 1] } },
    { id: 'half', name: '二分鋪底', grid: 'x.......x.......', gate: 0.95, strum: 0 },
    { id: 'stab', name: '合成器短音', grid: 'x..x..x.........', gate: 0.5, strum: 0, voice: 'stab' },
  ],
  poprock: [
    { id: 'strum', name: '八分刷奏', grid: 'X.x.x.x.X.x.x.x.', gate: 0.8, strum: 0.12, voice: 'guitar', power: true },
    { id: 'half', name: '鋼琴二分', grid: 'x.......x.......', gate: 0.95, strum: 0.03 },
    { id: 'sync', name: '切分刷奏', grid: 'x..x..x...x..x..', gate: 0.85, strum: 0.12, voice: 'guitar', power: true },
    { id: 'quarter', name: '四分鋼琴', grid: 'x...x...x...x...', gate: 0.8, strum: 0.02 },
    { id: 'arp', name: '分解和弦', arp: { rate: 2, pattern: [0, 1, 2, 1] } },
  ],
  trap: [
    { id: 'pad', name: '暗色鋪底', grid: 'x...............', gate: 0.98, strum: 0 },
    { id: 'bell', name: '鈴聲琶音', arp: { rate: 2, pattern: [0, 2, 1, 2] }, voice: 'bell' },
    { id: 'half', name: '二分長音', grid: 'x.......x.......', gate: 0.95, strum: 0 },
    { id: 'pluck', name: '撥奏', grid: 'x..x..x...x.....', gate: 0.4, strum: 0, voice: 'bell' },
  ],
  chip: [
    { id: 'arp', name: '快速琶音', arp: { rate: 1, pattern: [0, 1, 2, 1] } },
    { id: 'arp8', name: '八分琶音', arp: { rate: 2, pattern: [0, 1, 2, 3] } },
    { id: 'stab', name: '短和弦', grid: 'x...x...x...x...', gate: 0.4, strum: 0 },
    { id: 'off', name: '反拍和弦', grid: '..x...x...x...x.', gate: 0.4, strum: 0 },
    { id: 'pad', name: '長和弦', grid: 'x...............', gate: 0.95, strum: 0 },
  ],
};

function progressionFor(bars, mode, rng, defaultProg, forceDefault) {
  // 回傳 [{s, len, deg}]（以十六分音符為單位）
  const P = PROGRESSIONS[mode];
  if (bars === 4) {
    const prog = forceDefault ? defaultProg : rng.pick(P.four);
    return prog.map((deg, i) => ({ s: i * 16, len: 16, deg }));
  }
  if (bars === 2) {
    if (rng.chance(0.6)) {
      const prog = rng.pick(P.two);
      return prog.map((deg, i) => ({ s: i * 16, len: 16, deg }));
    }
    const prog = rng.pick(P.four);
    return prog.map((deg, i) => ({ s: i * 8, len: 8, deg }));
  }
  if (rng.chance(0.5)) return [{ s: 0, len: 16, deg: 0 }];
  const prog = rng.pick(P.two);
  return prog.map((deg, i) => ({ s: i * 8, len: 8, deg }));
}

// 長音如果跨過換和弦的位置，就在那裡切開，重新按下一個和弦
function splitAtChordChanges(hits, chords) {
  const out = [];
  for (const h of hits) {
    const end = h.s + h.len;
    let cur = h.s;
    for (const c of chords) {
      if (c.s > cur && c.s < end) {
        out.push({ ...h, s: cur, len: r3(Math.max(0.25, c.s - cur - 0.05)) });
        cur = c.s;
      }
    }
    out.push({ ...h, s: cur, len: r3(end - cur) });
  }
  return out;
}

function chordClip(styleId, genre, idx, rng, ctx) {
  const styles = CHORD_STYLES[styleId];
  const style = idx < styles.length ? styles[idx] : rng.pick(styles);
  const barOptions = [[4], [2, 4], [1, 2], [4], [2], [1, 4], [2, 4], [4]];
  const bars = idx === 0 ? 4 : rng.pick(barOptions[idx]);
  const chords = progressionFor(bars, ctx.key.mode, rng, ctx.defaultProg, idx === 0);
  const hits = [];
  if (style.arp) {
    const { rate, pattern } = style.arp;
    let k = 0;
    for (let s = 0; s < bars * 16; s += rate) {
      hits.push({ s, len: r3(rate * 0.9), v: r3((s % 4 === 0 ? 0.9 : 0.7) * rng.range(0.9, 1)), tone: pattern[k % pattern.length] });
      k++;
    }
  } else {
    const on = grid(style.grid);
    for (let b = 0; b < bars; b++) {
      for (let i = 0; i < on.length; i++) {
        const s = on[i].s;
        const next = i + 1 < on.length ? on[i + 1].s : 16;
        hits.push({ s: b * 16 + s, len: r3((next - s) * style.gate), v: r3(on[i].v * rng.range(0.9, 1)) });
      }
    }
  }
  const clip = {
    bars,
    chords,
    hits: style.arp ? hits : splitAtChordChanges(hits, chords),
    ext: style.power ? 'power' : genre.ext,
    strum: style.strum || 0,
    style: style.id,
    name: style.name,
  };
  if (style.voice) clip.voice = style.voice;
  return clip;
}

// ───────────────────────── 主旋律 ─────────────────────────

const LEAD_STYLES = {
  lofi: {
    cells: ['x.....x...x.....', 'x...x.....x..x..', '..x...x.x.......', 'x.......x...x...', '....x..x..x.....'],
    cadence: ['x.......x.......', 'x...x...........'],
    riff: ['x..x..x.........', 'x.x...x.........'], legato: 0.92, arpRate: 2,
  },
  house: {
    cells: ['x..x..x...x..x..', 'x.xx..x.x..x..x.', '..x..x..x..x..x.', 'x..x..x..x..x.x.'],
    cadence: ['x..x..x.........'],
    riff: ['x..x..x...x..x..', '..x..x..x..x..x.'], legato: 0.5, arpRate: 1,
  },
  synthwave: {
    cells: ['x.......x...x...', 'x...x...x.x.x...', 'x.x.x.x.x...x...', 'x.....x.....x...'],
    cadence: ['x...............', 'x.......x.......'],
    riff: ['x.x.x.x.x.x.x.x.', 'x..x..x.x..x..x.'], legato: 0.9, arpRate: 1,
  },
  poprock: {
    cells: ['x.x.x...x.x.x...', 'x...x.x.x...x...', '..x.x.x.x.x.x...', 'x.x...x.x.x.....'],
    cadence: ['x...x...x.......', 'x.......x.......'],
    riff: ['x.x.x...x.x.x...', 'x..x..x.x.......'], legato: 0.85, arpRate: 2,
  },
  trap: {
    cells: ['x.....x.....x...', 'x..x..x.........', 'x..x..x..x..x...', '......x.x.....x.'],
    cadence: ['x...........x...', 'x.......x.......'],
    riff: ['x..x..x..x..x...', 'x..x..x.........'], legato: 0.7, arpRate: 2,
  },
  chip: {
    cells: ['x.x.xxx.x.x.xxx.', 'x.x.x.x.x.xxx...', 'xxx.x.x.xxx.x...', 'x...x.x.x...x.x.'],
    cadence: ['x.x.x...x.......', 'x...x...x.......'],
    riff: ['x.xxx.xxx.x.x.x.', 'xx.xx.xx.x.x.x..'], legato: 0.8, arpRate: 1,
  },
};

const LEAD_ROLES = [
  { role: 'hook', name: '主題', bars: [4], energy: 0.8 },
  { role: 'hookB', name: '主題變奏', bars: [2], energy: 0.7 },
  { role: 'riff', name: '重複樂句', bars: [1], energy: 0.7 },
  { role: 'arp', name: '琶音', bars: [1, 2], energy: 0.6 },
  { role: 'sparse', name: '留白', bars: [4], energy: 0.4 },
  { role: 'counter', name: '對位旋律', bars: [2], energy: 0.5 },
  { role: 'call', name: '問答', bars: [2, 4], energy: 0.6 },
  { role: 'run', name: '快速音群', bars: [1], energy: 0.85 },
];

const CHORD_TONES = [-3, 0, 2, 4, 7, 9];

function pitchLine(ons, rng, { lo = -3, hi = 8, start, cadence = false, pool = CHORD_TONES } = {}) {
  let prev = start ?? rng.pick([0, 2, 4]);
  let dir = rng.chance(0.5) ? 1 : -1;
  const out = [];
  for (let i = 0; i < ons.length; i++) {
    const { s, len } = ons[i];
    const strong = s % 8 === 0 || len >= 4 || (s % 4 === 0 && rng.chance(0.6));
    let p;
    if (i === 0) p = prev;
    else if (strong || (cadence && i === ons.length - 1)) {
      const target = prev + dir * 2;
      const cands = pool.filter((c) => c >= lo && c <= hi);
      p = rng.weighted(cands.map((c) => [c, 1 / (1 + Math.abs(c - target)) + (c === prev ? 0.1 : 0)]));
    } else {
      const step = rng.weighted([[1, 5], [2, 2], [0, 1]]) * dir;
      p = prev + step;
    }
    if (p > hi) { p = hi - 1; dir = -1; }
    if (p < lo) { p = lo + 1; dir = 1; }
    if (rng.chance(0.28)) dir = -dir;
    if (cadence && i === ons.length - 1) {
      p = [0, 2, 4].reduce((best, c) => (Math.abs(c - prev) < Math.abs(best - prev) ? c : best), 0);
    }
    out.push(p);
    prev = p;
  }
  return out;
}

function cellOnsets(cell, legato, offset = 0) {
  const on = onsets(cell);
  return on.map((s, i) => {
    const next = i + 1 < on.length ? on[i + 1] : 16;
    return { s: s + offset, len: r3(Math.max(0.5, (next - s) * legato)) };
  });
}

function leadClip(styleId, roleDef, rng) {
  const st = LEAD_STYLES[styleId];
  const bars = rng.pick(roleDef.bars);
  const role = roleDef.role;
  const notes = [];
  const push = (ons, pitches, extra = {}) => {
    ons.forEach((o, i) => notes.push({ s: o.s, len: o.len, rel: pitches[i], v: r3(rng.range(0.78, 1) * (o.s % 4 === 0 ? 1 : 0.88)), ...extra }));
  };

  if (role === 'hook' || role === 'hookB' || role === 'call') {
    const cellA = rng.pick(st.cells);
    const onsA = cellOnsets(cellA, st.legato);
    const pA = pitchLine(onsA, rng);
    for (let b = 0; b < bars; b++) {
      const off = b * 16;
      if (role === 'call' && b % 2 === 1) {
        // 回答：後半小節才出來，音比較少
        const ons = cellOnsets('........x...x...', st.legato, off);
        push(ons, pitchLine(ons, rng, { start: pA[pA.length - 1], cadence: true }));
        continue;
      }
      if (b === bars - 1 && bars >= 2 && role !== 'call') {
        const ons = cellOnsets(rng.pick(st.cadence), Math.max(st.legato, 0.85), off);
        push(ons, pitchLine(ons, rng, { start: pA[0], cadence: true }));
        continue;
      }
      const ons = onsA.map((o) => ({ s: o.s + off, len: o.len }));
      let p = pA.slice();
      if (b % 2 === 1) {
        const tail = pitchLine(ons.slice(-2), rng, { start: p[p.length - 3] ?? p[0] });
        p = p.slice(0, -2).concat(tail).slice(0, ons.length);
        while (p.length < ons.length) p.push(0);
      }
      push(ons, p);
    }
  } else if (role === 'riff' || role === 'run') {
    const cell = role === 'run' ? 'xxxxxxxxxxxxxxxx' : rng.pick(st.riff);
    const ons = cellOnsets(cell, role === 'run' ? 0.8 : st.legato);
    let p;
    if (role === 'run') {
      const up = rng.chance(0.5);
      p = ons.map((_, i) => (up ? -2 + Math.floor(i * 0.65) : 8 - Math.floor(i * 0.65)));
      p[p.length - 1] = up ? 7 : 0;
    } else {
      p = pitchLine(ons, rng, { pool: [0, 2, 4, 7] });
    }
    push(ons, p);
  } else if (role === 'arp') {
    const rate = st.arpRate;
    const pat = rng.pick([[0, 2, 4, 7], [0, 4, 7, 4], [7, 4, 2, 0], [0, 2, 4, 2], [0, 4, 2, 7]]);
    let k = 0;
    for (let s = 0; s < bars * 16; s += rate) {
      notes.push({ s, len: r3(rate * 0.8), rel: pat[k % pat.length], v: r3((s % 4 === 0 ? 0.9 : 0.7) * rng.range(0.9, 1)) });
      k++;
    }
  } else if (role === 'sparse') {
    for (let b = 0; b < bars; b++) {
      const cell = rng.pick(['x.......x.......', 'x...........x...', '....x.......x...', 'x...............']);
      const ons = cellOnsets(cell, 0.95, b * 16);
      push(ons, pitchLine(ons, rng, { cadence: b === bars - 1 }));
    }
  } else if (role === 'counter') {
    for (let b = 0; b < bars; b++) {
      const ons = cellOnsets(rng.pick(['..x...x...x...x.', 'x...x...x...x...', '....x...x.....x.']), 0.7, b * 16);
      push(ons, pitchLine(ons, rng, { lo: 2, hi: 9, pool: [2, 4, 7, 9] }));
    }
  }
  return { bars, notes, style: role };
}

// ───────────────────────── 效果音 ─────────────────────────

const FX_NAMES = {
  riser: '上升音效', down: '下降音效', impact: '重擊', revcym: '反轉鈸', crackle: '黑膠沙沙',
  rain: '雨聲', sparkle: '閃亮音點', swell: '反向漸強', chop: '人聲切片', zap: '雷射',
  arpEcho: '回聲琶音', sweep: '掃頻',
};

function fxClip(kind, rng) {
  const notes = [];
  let bars = 1;
  let energy = 0.4;
  switch (kind) {
    case 'riser':
      bars = rng.pick([2, 4]);
      notes.push({ s: 0, len: bars * 16, kind: 'riser', v: 0.9 });
      energy = 0.7;
      break;
    case 'down':
      bars = rng.pick([1, 2]);
      notes.push({ s: 0, len: 16, kind: 'down', v: 0.9 });
      break;
    case 'impact':
      bars = rng.pick([1, 2, 4]);
      notes.push({ s: 0, len: 16, kind: 'impact', rel: 0, v: 1 });
      energy = 0.6;
      break;
    case 'revcym':
      bars = rng.pick([1, 2]);
      notes.push({ s: (bars - 1) * 16, len: 16, kind: 'revcym', v: 0.9 });
      energy = 0.5;
      break;
    case 'crackle':
      bars = rng.pick([1, 2, 4]);
      for (let b = 0; b < bars; b++) {
        notes.push({ s: b * 16, len: 16, kind: 'hiss', v: 0.8 });
        const n = rng.int(10, 18);
        for (let i = 0; i < n; i++) notes.push({ s: r3(b * 16 + rng.range(0, 15.9)), len: 0.1, kind: 'click', v: r3(rng.range(0.3, 1)) });
      }
      energy = 0.2;
      break;
    case 'rain':
      bars = rng.pick([2, 4]);
      for (let b = 0; b < bars; b++) notes.push({ s: b * 16, len: 16, kind: 'rain', v: r3(rng.range(0.7, 1)) });
      energy = 0.2;
      break;
    case 'sparkle': {
      bars = rng.pick([2, 4]);
      for (let b = 0; b < bars; b++) {
        const count = rng.int(2, 5);
        const steps = rng.shuffle([0, 2, 3, 6, 7, 9, 10, 12, 14]).slice(0, count).sort((a, z) => a - z);
        for (const s of steps) notes.push({ s: b * 16 + s, len: 2, kind: 'bell', rel: rng.pick([0, 2, 4, 7, 9]), v: r3(rng.range(0.5, 0.9)) });
      }
      energy = 0.4;
      break;
    }
    case 'swell':
      bars = rng.pick([1, 2, 4]);
      for (let b = 0; b < bars; b += bars >= 2 ? 2 : 1) {
        const s = b * 16 + (bars >= 2 ? 16 : 8);
        const len = bars >= 2 ? 16 : 8;
        for (const rel of [0, 2, 4]) notes.push({ s, len, kind: 'swell', rel, v: 0.8 });
      }
      energy = 0.5;
      break;
    case 'chop': {
      bars = rng.pick([1, 2]);
      const cell = rng.pick(['x..x..x...x.x...', 'x.x...x.x...x...', '..x..x....x..x..']);
      const vowel = rng.pick(['a', 'o']);
      for (let b = 0; b < bars; b++) {
        for (const s of onsets(cell)) notes.push({ s: b * 16 + s, len: 1.5, kind: 'vox', rel: rng.pick([0, 2, 4, 7]), vowel, v: r3(rng.range(0.7, 1)) });
      }
      energy = 0.6;
      break;
    }
    case 'zap':
      bars = rng.pick([1, 2]);
      for (let b = 0; b < bars; b++) {
        for (const s of onsets(rng.pick(['x.....x...x.....', 'x...x...x...x...', '......x.......x.']))) {
          notes.push({ s: b * 16 + s, len: 2, kind: 'zap', rel: rng.pick([0, 4, 7]), v: r3(rng.range(0.7, 1)) });
        }
      }
      energy = 0.6;
      break;
    case 'arpEcho': {
      bars = 2;
      const seq = rng.pick([[7, 4, 2], [0, 4, 7], [9, 7, 4]]);
      [0, 3, 6].forEach((s, i) => notes.push({ s, len: 1.5, kind: 'echo', rel: seq[i], v: 0.85 }));
      energy = 0.4;
      break;
    }
    case 'sweep':
      bars = rng.pick([1, 2]);
      for (let b = 0; b < bars; b++) notes.push({ s: b * 16, len: 8, kind: 'sweep', v: 0.8 }, { s: b * 16 + 8, len: 8, kind: 'sweep', v: 0.6 });
      energy = 0.4;
      break;
    default:
      break;
  }
  notes.sort((a, b) => a.s - b.s);
  return { bars, notes, style: kind, name: FX_NAMES[kind], energy };
}

// ───────────────────────── 組合 ─────────────────────────

const STYLE_FOR_GENRE = { lofi: 'lofi', house: 'house', synthwave: 'synthwave', poprock: 'poprock', trap: 'trap', chip: 'chip' };
const DRUM_STYLE_FOR_GENRE = { lofi: 'lofi', house: 'house', synthwave: 'synthwave', poprock: 'rock', trap: 'trap', chip: 'chip' };

export function defaultTrackSeed(genreId, seed, track) {
  return 10000 + (hashString(`${genreId}|${seed}|${track}`) % 90000);
}

export function bankContext(genreId, seed) {
  const genre = GENRES[genreId];
  if (!genre) throw new Error(`未知的曲風：${genreId}`);
  const rng = new Rng(`bank|${genreId}|${seed}`);
  const bpm = rng.int(genre.bpm[0], genre.bpm[1]);
  const mode = rng.weighted(genre.modes);
  const tonic = rng.pick(genre.tonics);
  const swing = r3(rng.range(genre.swing[0], genre.swing[1]));
  const defaultProg = rng.pick(PROGRESSIONS[mode].four);
  return { genre, bpm, key: { tonic, mode }, swing, defaultProg };
}

export function generateTrack(trackId, genreId, ctx, trackSeed) {
  const genre = GENRES[genreId];
  const rng = new Rng(`${trackId}|${trackSeed}|${genreId}|${ctx.key.mode}`);
  const clips = [];
  for (let i = 0; i < CLIPS_PER_TRACK; i++) {
    let c;
    let name;
    let energy;
    if (trackId === 'drums') {
      const role = DRUM_ROLES[i];
      c = drumClip(DRUM_STYLE_FOR_GENRE[genreId], role, rng, genre.humanize);
      name = role.name;
      energy = role.energy;
    } else if (trackId === 'bass') {
      const role = BASS_ROLES[i];
      c = bassClip(STYLE_FOR_GENRE[genreId], role, rng);
      name = role.name;
      energy = role.energy;
    } else if (trackId === 'chords') {
      c = chordClip(STYLE_FOR_GENRE[genreId], genre, i, rng, ctx);
      name = c.name;
      energy = c.style === 'pad' || c.style === 'sustain' ? 0.4 : 0.6;
    } else if (trackId === 'lead') {
      const role = LEAD_ROLES[i];
      c = leadClip(STYLE_FOR_GENRE[genreId], role, rng);
      name = role.name;
      energy = role.energy;
    } else {
      const kinds = genre.fxKinds;
      c = fxClip(kinds[i % kinds.length], rng);
      name = c.name;
      energy = c.energy;
    }
    const clip = { ...c, name, energy, letter: LETTERS[i], index: i, track: trackId };
    clips.push(clip);
  }
  return clips;
}

export function generateBank({ genre: genreId, seed, trackSeeds = {} }) {
  const seedStr = String(seed);
  const ctx = bankContext(genreId, seedStr);
  const seeds = {};
  const tracks = {};
  for (const t of TRACK_IDS) {
    seeds[t] = trackSeeds[t] ?? defaultTrackSeed(genreId, seedStr, t);
    tracks[t] = generateTrack(t, genreId, ctx, seeds[t]);
  }
  return {
    v: 1,
    genre: genreId,
    seed: seedStr,
    bpm: ctx.bpm,
    key: ctx.key,
    swing: ctx.swing,
    defaultProg: ctx.defaultProg,
    trackSeeds: seeds,
    tracks,
  };
}

export function regenerateTrack(bank, trackId, newSeed) {
  const ctx = { genre: GENRES[bank.genre], bpm: bank.bpm, key: bank.key, swing: bank.swing, defaultProg: bank.defaultProg };
  const seed = Number(newSeed);
  return {
    ...bank,
    trackSeeds: { ...bank.trackSeeds, [trackId]: seed },
    tracks: { ...bank.tracks, [trackId]: generateTrack(trackId, bank.genre, ctx, seed) },
  };
}

export function barDuration(bpm) {
  return (60 / bpm) * 4;
}
