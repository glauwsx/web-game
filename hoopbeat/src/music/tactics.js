// 戰術配樂：比賽中用十字鍵一鍵換「比賽計劃」。
// 每個戰術 = 換掉幾軌的片段 + 調整速度。效果全部經過 features → effects 算出來，
// 所以畫面上預告的 buff／debuff 跟實際一樣。

import { TRACK_IDS } from '../loops/genres.js';
import { computeFeatures } from './features.js';
import { teamModifiers } from './effects.js';
import { windowsFor } from '../rhythm/judge.js';

function pick(bank, track, styles) {
  const clips = bank.tracks[track] || [];
  for (const s of styles) {
    const c = clips.find((x) => x.style === s);
    if (c) return c.index;
  }
  return clips.length ? 0 : null;
}

function chordPick(bank, prefer) {
  const clips = bank.tracks.chords || [];
  const c = clips.find((x) => prefer.includes(x.style));
  return c ? c.index : 0;
}

export const TACTICS = [
  {
    id: 'rush',
    dir: 'up',
    name: '全速衝刺',
    icon: '⏫',
    desc: '加快 15 BPM，鼓和貝斯換最熱鬧的片段',
    build: (deck) => ({
      bpm: deck.baseBpm + 15,
      clips: {
        drums: pick(deck.bank, 'drums', ['peak', 'busy']),
        bass: pick(deck.bank, 'bass', ['busy', 'octave']),
        fx: pick(deck.bank, 'fx', ['riser', 'impact', 'zap', 'sweep']),
      },
    }),
  },
  {
    id: 'steady',
    dir: 'down',
    name: '穩住節奏',
    icon: '⏬',
    desc: '放慢 15 BPM，鼓變輕、貝斯拉長音',
    build: (deck) => ({
      bpm: deck.baseBpm - 15,
      clips: {
        drums: pick(deck.bank, 'drums', ['half', 'light']),
        bass: pick(deck.bank, 'bass', ['sustain', 'main']),
        fx: null,
      },
    }),
  },
  {
    id: 'flow',
    dir: 'left',
    name: '團隊傳導',
    icon: '🔁',
    desc: '開和弦、走路貝斯、搖擺的鼓：傳球和過人變好',
    build: (deck) => ({
      bpm: deck.baseBpm,
      clips: {
        chords: chordPick(deck.bank, ['comp', 'stab', 'pad', 'sustain', 'arp']),
        bass: pick(deck.bank, 'bass', ['walk', 'mainB', 'main']),
        drums: pick(deck.bank, 'drums', ['mainB', 'main']),
        lead: null,
      },
    }),
  },
  {
    id: 'fire',
    dir: 'right',
    name: '手感火力',
    icon: '🔥',
    desc: '開主旋律的主題樂句：投籃手感變好、手感升溫更快',
    build: (deck) => ({
      bpm: deck.baseBpm,
      clips: {
        lead: pick(deck.bank, 'lead', ['hook', 'riff', 'run']),
        chords: chordPick(deck.bank, ['pad', 'sustain', 'comp', 'stab']),
        drums: pick(deck.bank, 'drums', ['main', 'mainB']),
      },
    }),
  },
];

export const TACTIC_BY_DIR = Object.fromEntries(TACTICS.map((t) => [t.dir, t]));
export const TACTIC_BY_ID = Object.fromEntries(TACTICS.map((t) => [t.id, t]));

export function applyTactic(deck, id) {
  const t = TACTIC_BY_ID[id];
  if (!t) return false;
  const plan = t.build(deck);
  deck.setClips(plan.clips, { bpm: plan.bpm, tactic: id });
  return true;
}

// 預告：如果現在換成這個戰術，跟現在比起來各項會怎麼變
export function previewTactic(deck, id) {
  const t = TACTIC_BY_ID[id];
  const plan = t.build(deck);
  const cur = deck.upcomingClips();
  const next = {};
  for (const tr of TRACK_IDS) next[tr] = tr in plan.clips ? plan.clips[tr] : cur[tr];
  // 預告不算疲乏：換了就是新的
  const base = { bank: deck.bank, mixer: deck.mixer, lastChangeBar: 0 };
  const fNow = computeFeatures({ ...base, bpm: deck.upcomingBpm(), active: cur }, 0);
  const bpm = Math.max(70, Math.min(180, plan.bpm));
  const fNext = computeFeatures({ ...base, bpm, active: next }, 0);
  const mNow = teamModifiers(fNow);
  const mNext = teamModifiers(fNext);
  const wNow = windowsFor('normal', fNow.bpm).great;
  const wNext = windowsFor('normal', fNext.bpm).great;
  const deltas = [
    { label: '跑速', v: mNext.speed - mNow.speed },
    { label: '命中率', v: mNext.shot - mNow.shot },
    { label: '失誤率', v: mNext.turnover - mNow.turnover, invert: true },
    { label: '犯規', v: mNext.foul - mNow.foul, invert: true },
    { label: '傳球', v: mNext.pass - mNow.pass },
    { label: '過人', v: mNext.dribble - mNow.dribble },
    { label: '抄截意願', v: mNext.steal - mNow.steal },
    { label: '防守', v: mNext.defense - mNow.defense },
    { label: '判定窗口', v: wNext / wNow - 1 },
  ].filter((d) => Math.abs(Math.round(d.v * 100)) >= 1);
  deltas.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  return { tactic: t, bpm, deltas, features: fNext, mods: mNext };
}

export function formatPreview(pv, max = 4) {
  return pv.deltas.slice(0, max).map((d) => {
    const n = Math.round(d.v * 100);
    const good = d.invert ? n < 0 : n > 0;
    return { text: `${d.label} ${n > 0 ? '+' : '−'}${Math.abs(n)}%`, good };
  });
}
