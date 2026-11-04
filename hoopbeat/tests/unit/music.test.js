import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFeatures, syncopation, freshness, tempoValue } from '../../src/music/features.js';
import { teamModifiers, explain, headline, RULES } from '../../src/music/effects.js';
import { arrangementChecks } from '../../src/music/quality.js';

// ── 假資料：照 loops 生成器的格式手寫幾個片段 ──
const hats = (n) => Array.from({ length: n }, (_, i) => ({ s: (i * 16) / n, d: 'hatC', v: 0.6 }));
const fourFloor = { bars: 1, energy: 0.7, notes: [0, 4, 8, 12].map((s) => ({ s, d: 'kick', v: 1 })).concat([{ s: 4, d: 'clap', v: 1 }, { s: 12, d: 'clap', v: 1 }], hats(16)) };
const sparse = { bars: 1, energy: 0.2, notes: [{ s: 0, d: 'kick', v: 1 }, { s: 8, d: 'snare', v: 1 }] };
const funky = { bars: 1, energy: 0.6, notes: [{ s: 0, d: 'kick', v: 1 }, { s: 3, d: 'kick', v: 1 }, { s: 6, d: 'snare', v: 1 }, { s: 10, d: 'kick', v: 1 }, { s: 14, d: 'snare', v: 1 }].concat(hats(8)) };
const bassClip = { bars: 1, energy: 0.8, notes: [{ s: 0, rel: 0, len: 2 }, { s: 6, rel: 0, len: 2 }] };
const chordClip = { bars: 1, energy: 0.5, notes: [{ s: 0, len: 16 }] };
const leadClip = { bars: 2, energy: 0.6, notes: Array.from({ length: 12 }, (_, i) => ({ s: i * 2, rel: i % 5, len: 1 })) };
const fxClip = { bars: 1, energy: 0.4, notes: [{ s: 0, kind: 'riser', len: 16 }] };

const bank = (bpm = 120, swing = 0.5) => ({
  bpm,
  swing,
  tracks: { drums: [fourFloor, sparse, funky], bass: [bassClip], chords: [chordClip], lead: [leadClip], fx: [fxClip] },
});

const deck = (over = {}) => ({
  bank: bank(over.bpm, over.swing),
  bpm: over.bpm ?? 120,
  active: { drums: 0, bass: 0, chords: 0, lead: 0, fx: null, ...over.active },
  mixer: over.mixer || {},
  lastChangeBar: over.lastChangeBar ?? 0,
});

test('特徵：速度值，120 = 0，80 偏慢、170 偏快', () => {
  assert.equal(tempoValue(120), 0);
  assert.ok(tempoValue(80) < -0.7);
  assert.equal(tempoValue(170), 1);
  assert.equal(tempoValue(250), 1);
});

test('特徵：軌數越多、鼓越密，能量越高', () => {
  const full = computeFeatures(deck({ active: { fx: 0 } }));
  const thin = computeFeatures(deck({ active: { drums: 1, chords: null, lead: null } }));
  assert.equal(full.activeCount, 5);
  assert.equal(thin.activeCount, 2);
  assert.ok(full.energy > thin.energy + 0.3, `${full.energy} vs ${thin.energy}`);
  assert.ok(full.drumDensity > thin.drumDensity);
});

test('特徵：靜音或沒播的軌不算', () => {
  const muted = computeFeatures(deck({ mixer: { chords: { mute: true }, lead: { vol: 0 } } }));
  assert.equal(muted.harmony, 0);
  assert.equal(muted.melody, 0);
  assert.ok(muted.bass > 0);
  const silent = computeFeatures(deck({ active: { drums: null, bass: null, chords: null, lead: null } }));
  assert.equal(silent.silent, true);
  assert.equal(silent.energy, 0);
});

test('特徵：切分音與搖擺 → 律動', () => {
  assert.equal(syncopation(fourFloor, null), 0);
  assert.ok(syncopation(funky, null) > 0.5);
  const straight = computeFeatures(deck({ active: { drums: 0, bass: null } }));
  const swung = computeFeatures(deck({ active: { drums: 2, bass: null }, swing: 0.6 }));
  assert.ok(swung.groove > straight.groove + 0.4, `${swung.groove} vs ${straight.groove}`);
  // 沒有鼓，律動打折
  const noDrums = computeFeatures(deck({ active: { drums: null, bass: 0 }, swing: 0.6 }));
  assert.ok(noDrums.groove < swung.groove);
});

test('特徵：新鮮度——播太久會疲乏', () => {
  assert.equal(freshness(0), 1);
  assert.equal(freshness(8), 1);
  assert.ok(freshness(20) < 1 && freshness(20) > 0);
  assert.equal(freshness(40), 0);
  const f = computeFeatures(deck({ lastChangeBar: 4 }), 40);
  assert.equal(f.barsSinceChange, 36);
  assert.equal(f.freshness, 0);
});

test('對應：BPM 越快 → 跑越快、出手越早，但命中率降、失誤犯規變多', () => {
  const m80 = teamModifiers(computeFeatures(deck({ bpm: 80 })));
  const m120 = teamModifiers(computeFeatures(deck({ bpm: 120 })));
  const m170 = teamModifiers(computeFeatures(deck({ bpm: 170 })));
  assert.ok(m80.speed < m120.speed && m120.speed < m170.speed);
  assert.ok(m80.decision > m120.decision && m120.decision > m170.decision);
  assert.ok(m80.shot > m120.shot && m120.shot > m170.shot);
  assert.ok(m80.selection > m170.selection);
  assert.ok(m170.turnover > m120.turnover && m120.turnover >= m80.turnover);
  assert.ok(m170.foul > m120.foul * 1.8);
  assert.ok(m170.haste > 0.9 && m80.haste === 0 && m80.calm > 0.7);
  // 差距要明顯：170 比 120 命中率至少低 8 個百分點
  assert.ok(m120.shot - m170.shot >= 0.08);
});

test('對應：各特徵往設計的方向影響', () => {
  const base = computeFeatures(deck());
  const mBase = teamModifiers(base);
  // 能量 → 體力消耗、侵略性、抄截意願
  const hi = teamModifiers({ ...base, energy: 0.9 });
  const lo = teamModifiers({ ...base, energy: 0.1 });
  assert.ok(hi.stamina > lo.stamina && hi.aggression > lo.aggression && hi.steal > lo.steal);
  // 律動 → 過人
  assert.ok(teamModifiers({ ...base, groove: 0.9 }).dribble > teamModifiers({ ...base, groove: 0 }).dribble + 0.1);
  // 和弦 → 傳球、助攻
  const noCh = teamModifiers({ ...base, harmony: 0 });
  assert.ok(mBase.pass > noCh.pass && mBase.assist > noCh.assist);
  // 主旋律 → 投籃手感
  const noLead = teamModifiers({ ...base, melody: 0 });
  assert.ok(mBase.shot > noLead.shot && mBase.heat > noLead.heat);
  // 貝斯 → 防守、籃板
  const noBass = teamModifiers({ ...base, bass: 0 });
  assert.ok(mBase.defense > noBass.defense && mBase.rebound > noBass.rebound);
  // 疲乏 → 鬆散
  const stale = teamModifiers({ ...base, freshness: 0 });
  assert.ok(stale.shot < mBase.shot && stale.turnover > mBase.turnover && stale.defense < mBase.defense);
});

test('對應：節奏連擊與段落交界的士氣是加分', () => {
  const f = computeFeatures(deck());
  const none = teamModifiers(f);
  const combo = teamModifiers(f, { combo: 16, feel: 1, morale: 0 });
  const morale = teamModifiers(f, { combo: 0, feel: 0, morale: 1 });
  assert.ok(Math.abs(combo.shot - none.shot - 0.08) < 1e-9);
  assert.ok(morale.speed > none.speed && morale.defense > none.defense);
});

test('說明文字：BPM 160 顯示急躁和命中率下降', () => {
  const f = computeFeatures(deck({ bpm: 160 }));
  assert.equal(headline(f), 'BPM 160：急躁 +80%，命中率 −8%');
  const lines = explain(f);
  assert.equal(lines.length, RULES.length);
  assert.ok(lines[0].effects.some((t) => t.startsWith('犯規 +')));
  const slow = computeFeatures(deck({ bpm: 80 }));
  assert.match(headline(slow), /^BPM 80：沉穩 \+80%，命中率 \+3%$/);
  assert.match(headline(computeFeatures(deck({ bpm: 120 }))), /節奏剛好$/);
  // 有連擊時多一行
  assert.equal(explain(f, { combo: 5, feel: 0.3, morale: 0 }).length, RULES.length + 1);
});

test('說明文字和實際數值一致', () => {
  const f = computeFeatures(deck({ bpm: 150 }));
  const m = teamModifiers(f);
  const tempoLine = explain(f, undefined, { maxPerRule: 99 })[0];
  const shotTxt = tempoLine.effects.find((t) => t.startsWith('命中率'));
  const tempoShot = RULES[0].effects(f).find((e) => e.stat === 'shot').delta;
  assert.equal(shotTxt, `命中率 −${Math.round(-tempoShot * 100)}%`);
  assert.ok(m.shot <= tempoShot + 0.05);
});

test('編曲檢查：段落、變化、平衡、破音', () => {
  const S = (type, clips) => ({ type, bars: 8, clips });
  const good = {
    sections: [
      S('intro', { drums: null, bass: null, chords: 0, lead: null, fx: 0 }),
      S('verse', { drums: 1, bass: 0, chords: 0, lead: null, fx: null }),
      S('chorus', { drums: 0, bass: 0, chords: 0, lead: 0, fx: null }),
    ],
  };
  const r = arrangementChecks(good, {});
  assert.equal(r.score, 4, JSON.stringify(r.checks));
  const flat = { sections: [S('verse', { drums: 0, bass: null, chords: null, lead: null, fx: null })] };
  const r2 = arrangementChecks(flat, {}, { peak: 0.9 });
  assert.equal(r2.checks.find((c) => c.id === 'sections').ok, false);
  assert.equal(r2.checks.find((c) => c.id === 'variation').ok, false);
  assert.equal(r2.checks.find((c) => c.id === 'balance').ok, false);
  assert.equal(r2.checks.find((c) => c.id === 'clip').ok, false);
  const loud = arrangementChecks(good, { drums: { vol: 1 }, bass: { vol: 0.1 }, chords: { vol: 0.1 }, lead: { vol: 0.1 }, fx: { vol: 0.1 } });
  assert.equal(loud.checks.find((c) => c.id === 'balance').ok, false);
});
