// 把「一個小節的計畫」變成實際的聲音。現場播放和離線匯出共用這一份。

import { GENRES, TRACK_IDS } from './genres.js';
import { chordTones, degToSemis, mod, normRoot, powerChord, trackBase, voiceChord } from './theory.js';
import { playBass, playChordNote, playDrum, playFx, playLead } from './synth.js';

export function chordAtStep(clip, step) {
  const total = clip.bars * 16;
  const s = mod(step, total);
  let found = clip.chords[0];
  for (const c of clip.chords) if (c.s <= s) found = c;
  return found;
}

// 某一步（十六分音符）的和弦根音（音級，-3..3）
export function harmonyRoot(bank, plan, step) {
  const cp = plan.tracks.chords;
  if (cp) {
    const clip = bank.tracks.chords[cp.clip];
    if (clip) return normRoot(chordAtStep(clip, cp.clipBar * 16 + step).deg);
  }
  const prog = bank.defaultProg;
  return normRoot(prog[mod(plan.harmonyBar, prog.length)]);
}

// 各軌的合理音域（MIDI）。超出就移八度，音名不變，所以仍在調內。
const RANGE = { bass: [28, 60], lead: [55, 93], fx: [55, 100], chords: [45, 88] };

export function pitchFor(bank, track, rel, oct, root) {
  let m = trackBase(track, bank.key.tonic) + degToSemis(root + rel + 7 * (oct || 0), bank.key.mode);
  const r = RANGE[track];
  if (r) {
    while (m < r[0]) m += 12;
    while (m > r[1]) m -= 12;
  }
  return m;
}

export function chordPitches(bank, clip, root) {
  if (clip.ext === 'power') return powerChord(root, bank.key, 52);
  const center = clip.voice === 'bell' ? 72 : bank.genre === 'chip' ? 68 : 62;
  return voiceChord(root, bank.key, chordTones(root, bank.key.mode, clip.ext || ''), center);
}

// 回傳這個小節要發出的所有音（純資料）。測試也會用到。
export function barEvents(bank, plan) {
  const events = [];
  for (const tid of TRACK_IDS) {
    const tp = plan.tracks[tid];
    if (!tp) continue;
    const clip = bank.tracks[tid][tp.clip];
    if (!clip) continue;
    const lo = tp.clipBar * 16;
    const hi = lo + 16;
    if (tid === 'chords') {
      for (const h of clip.hits) {
        if (h.s < lo || h.s >= hi) continue;
        const s = h.s - lo;
        const chord = chordAtStep(clip, h.s);
        const root = normRoot(chord.deg);
        let pitches = chordPitches(bank, clip, root);
        if (h.tone !== undefined) {
          const n = pitches.length;
          pitches = [pitches[h.tone % n] + 12 * Math.floor(h.tone / n)];
        }
        pitches.forEach((m, i) => {
          events.push({ track: tid, s: s + i * (clip.strum || 0), len: h.len, midi: m, v: h.v, voice: clip.voice, i });
        });
      }
      continue;
    }
    for (const n of clip.notes) {
      if (n.s < lo || n.s >= hi) continue;
      const s = n.s - lo;
      if (tid === 'drums') {
        events.push({ track: tid, s, drum: n.d, v: n.v });
        continue;
      }
      const ev = { track: tid, s, len: n.len, v: n.v, kind: n.kind, vowel: n.vowel };
      if (n.rel !== undefined) {
        const root = harmonyRoot(bank, plan, s);
        const pitchTrack = tid === 'fx' && n.kind === 'impact' ? 'bass' : tid === 'fx' && n.kind === 'swell' ? 'chords' : tid;
        ev.midi = pitchFor(bank, pitchTrack, n.rel, n.oct, root);
        if (n.kind === 'swell') ev.midi += 12;
        if (n.glide !== undefined) ev.from = pitchFor(bank, tid, n.glide, n.oct, root);
      }
      events.push(ev);
    }
  }
  return events;
}

export function scheduleBar({ graph, run, bank, plan, time, audible }) {
  const sound = GENRES[bank.genre].sound;
  const stepDur = 60 / bank.bpm / 4;
  const swingOff = (bank.swing - 0.5) * 2 * stepDur;
  const tOf = (s) => {
    const r = Math.round(s);
    const sw = Math.abs(s - r) < 0.2 && mod(r, 2) === 1 ? swingOff : 0;
    return time + s * stepDur + sw;
  };
  const R = graph.R;
  const events = barEvents(bank, plan);
  for (const ev of events) {
    const t = tOf(ev.s);
    const out = run.dest(ev.track);
    const dur = (ev.len || 1) * stepDur;
    switch (ev.track) {
      case 'drums':
        playDrum(R, out, sound.kit, ev.drum, t, ev.v);
        if (ev.drum === 'kick' && sound.duck && (!audible || audible('drums'))) graph.duck(t);
        break;
      case 'bass':
        playBass(R, out, sound.bass, t, dur, ev.midi, ev.v, ev.from ?? null);
        break;
      case 'chords': {
        const pan = ev.i === undefined ? 0 : [0, -0.22, 0.22, -0.12, 0.12][ev.i % 5];
        playChordNote(R, out, ev.voice || sound.chords, t, dur, ev.midi, ev.v, pan);
        break;
      }
      case 'lead':
        playLead(R, out, sound.lead, t, dur, ev.midi, ev.v);
        break;
      case 'fx':
        playFx(R, out, ev.kind, t, dur, ev.midi ?? 60, ev.v, { vowel: ev.vowel, pan: ((ev.s * 7) % 5) / 5 - 0.4 });
        break;
      default:
        break;
    }
  }
  return events.length;
}
