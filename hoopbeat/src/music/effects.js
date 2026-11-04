// 音樂特徵 → 球隊表現的對應規則。
// 每條規則只看一個特徵，產生幾個「加成」；全部加總就是球隊的修正值。
// 畫面上的說明文字也從同一份規則產生，所以「看到的」一定等於「實際用的」。

export const STATS = {
  speed: { label: '跑速', kind: 'mult' },
  shot: { label: '命中率', kind: 'pp' },
  selection: { label: '選擇投籃', kind: 'pp' },
  decision: { label: '出手前等待', kind: 'mult' },
  turnover: { label: '失誤率', kind: 'pp' },
  foul: { label: '犯規', kind: 'mult' },
  stamina: { label: '體力消耗', kind: 'mult' },
  aggression: { label: '侵略性', kind: 'pp' },
  steal: { label: '抄截意願', kind: 'mult' },
  dribble: { label: '過人成功', kind: 'pp' },
  pass: { label: '傳球準度', kind: 'pp' },
  assist: { label: '助攻加成', kind: 'pp' },
  heat: { label: '手感升溫', kind: 'mult' },
  defense: { label: '防守', kind: 'mult' },
  rebound: { label: '籃板', kind: 'mult' },
};

export const STAT_IDS = Object.keys(STATS);

const pctOf = (x) => Math.round(x * 100);

// 規則：feature 是特徵名稱，title 產生左邊的標題，effects 回傳 [{ stat, delta }]
export const RULES = [
  {
    id: 'tempo',
    title: (f) => `BPM ${Math.round(f.bpm)}`,
    mood: (f) => {
      const haste = Math.max(0, f.tempo);
      const calm = Math.max(0, -f.tempo);
      if (haste > 0.04) return { text: `急躁 +${pctOf(haste)}%`, tone: 'hot' };
      if (calm > 0.04) return { text: `沉穩 +${pctOf(calm)}%`, tone: 'calm' };
      return { text: '節奏剛好', tone: 'neutral' };
    },
    effects: (f) => {
      const haste = Math.max(0, f.tempo);
      const calm = Math.max(0, -f.tempo);
      return [
        { stat: 'speed', delta: 0.22 * f.tempo },
        { stat: 'decision', delta: -0.5 * haste + 0.45 * calm },
        { stat: 'shot', delta: -0.1 * haste + 0.04 * calm },
        { stat: 'selection', delta: -0.25 * haste + 0.2 * calm },
        { stat: 'turnover', delta: 0.07 * haste - 0.015 * calm },
        { stat: 'foul', delta: 1.3 * haste - 0.2 * calm },
        { stat: 'stamina', delta: 0.3 * haste - 0.1 * calm },
        { stat: 'aggression', delta: 0.2 * haste - 0.1 * calm },
        // 慢歌主打傳導：傳得準、助攻加成高；但抄截意願低
        { stat: 'pass', delta: 0.06 * calm - 0.03 * haste },
        { stat: 'assist', delta: 0.07 * calm },
        { stat: 'steal', delta: 0.25 * haste - 0.3 * calm },
      ];
    },
  },
  {
    id: 'energy',
    title: (f) => `能量 ${pctOf(f.energy)}%`,
    mood: (f) => (f.energy > 0.6 ? { text: '火力全開', tone: 'hot' } : f.energy < 0.25 ? { text: '提不起勁', tone: 'calm' } : { text: '有精神', tone: 'neutral' }),
    effects: (f) => [
      { stat: 'stamina', delta: 0.7 * (f.energy - 0.4) },
      { stat: 'aggression', delta: 0.55 * (f.energy - 0.4) },
      { stat: 'steal', delta: 0.9 * (f.energy - 0.4) },
      { stat: 'speed', delta: 0.06 * (f.energy - 0.4) },
    ],
  },
  {
    id: 'groove',
    title: (f) => `律動 ${pctOf(f.groove)}%`,
    mood: (f) => (f.groove > 0.45 ? { text: '腳步有彈性', tone: 'good' } : { text: '方正的拍子', tone: 'neutral' }),
    effects: (f) => [{ stat: 'dribble', delta: 0.16 * f.groove - 0.03 }],
  },
  {
    id: 'harmony',
    title: (f) => (f.harmony > 0.05 ? '和弦 有' : '和弦 沒有'),
    mood: (f) => (f.harmony > 0.05 ? { text: '團隊默契', tone: 'good' } : { text: '各打各的', tone: 'bad' }),
    effects: (f) => [
      { stat: 'pass', delta: 0.06 * f.harmony - 0.02 },
      { stat: 'assist', delta: 0.08 * f.harmony },
    ],
  },
  {
    id: 'melody',
    title: (f) => (f.melody > 0.05 ? '主旋律 有' : '主旋律 沒有'),
    mood: (f) => (f.melody > 0.05 ? { text: '手感會發燙', tone: 'good' } : { text: '手感平平', tone: 'neutral' }),
    effects: (f) => [
      { stat: 'shot', delta: 0.04 * f.melody },
      { stat: 'heat', delta: 1.0 * f.melody - 0.3 },
    ],
  },
  {
    id: 'bass',
    title: (f) => (f.bass > 0.05 ? `貝斯 ${pctOf(f.bass)}%` : '貝斯 沒有'),
    mood: (f) => (f.bass > 0.05 ? { text: '下盤穩', tone: 'good' } : { text: '防守虛浮', tone: 'bad' }),
    effects: (f) => [
      { stat: 'defense', delta: 0.3 * f.bass - 0.1 },
      { stat: 'rebound', delta: 0.4 * f.bass - 0.12 },
    ],
  },
  {
    id: 'fresh',
    title: (f) => `新鮮度 ${pctOf(f.freshness)}%`,
    mood: (f) => (f.freshness < 0.5 ? { text: '聽膩了，鬆散', tone: 'bad' } : f.freshness < 1 ? { text: '開始疲乏', tone: 'neutral' } : { text: '新鮮', tone: 'good' }),
    effects: (f) => {
      const stale = 1 - f.freshness;
      return [
        { stat: 'shot', delta: -0.07 * stale },
        { stat: 'turnover', delta: 0.05 * stale },
        { stat: 'defense', delta: -0.15 * stale },
        { stat: 'speed', delta: -0.05 * stale },
      ];
    },
  },
];

// 臨時加成：節奏連擊（feel 0～1）、段落交界換片段的士氣（morale 0～1）
export const BONUS_RULES = [
  {
    id: 'combo',
    title: (b) => `節奏連擊 ${b.combo}`,
    active: (b) => b.combo > 0,
    effects: (b) => [
      { stat: 'shot', delta: 0.08 * b.feel },
      { stat: 'pass', delta: 0.04 * b.feel },
      { stat: 'dribble', delta: 0.05 * b.feel },
    ],
  },
  {
    id: 'morale',
    title: () => '段落交界換歌',
    active: (b) => b.morale > 0.01,
    effects: (b) => [
      { stat: 'shot', delta: 0.05 * b.morale },
      { stat: 'speed', delta: 0.05 * b.morale },
      { stat: 'defense', delta: 0.08 * b.morale },
    ],
  },
];

export function baseModifiers() {
  const m = {};
  for (const id of STAT_IDS) m[id] = STATS[id].kind === 'mult' ? 1 : 0;
  return m;
}

// 特徵 → 修正值。bonus = { combo, feel, morale }
export function teamModifiers(f, bonus = { combo: 0, feel: 0, morale: 0 }) {
  const m = baseModifiers();
  const add = (list) => {
    for (const e of list) m[e.stat] += e.delta;
  };
  if (f.silent) {
    // 沒有音樂：大家提不起勁
    add([{ stat: 'speed', delta: -0.1 }, { stat: 'shot', delta: -0.04 }, { stat: 'defense', delta: -0.1 }]);
  } else {
    for (const r of RULES) add(r.effects(f));
  }
  for (const r of BONUS_RULES) if (r.active(bonus)) add(r.effects(bonus));
  // 安全範圍
  m.speed = Math.max(0.6, Math.min(1.45, m.speed));
  m.foul = Math.max(0.4, m.foul);
  m.stamina = Math.max(0.4, m.stamina);
  m.decision = Math.max(0.3, m.decision);
  m.heat = Math.max(0.2, m.heat);
  m.haste = Math.max(0, f.tempo);
  m.calm = Math.max(0, -f.tempo);
  m.aggression = Math.max(0, Math.min(1, 0.4 + m.aggression));
  return m;
}

export function formatDelta(stat, delta) {
  const kind = STATS[stat].kind;
  const v = Math.round(delta * 100);
  if (kind === 'mult') return `${STATS[stat].label} ${v >= 0 ? '+' : '−'}${Math.abs(v)}%`;
  return `${STATS[stat].label} ${v >= 0 ? '+' : '−'}${Math.abs(v)}%`;
}

// 給畫面用的說明：每個特徵一行，列出影響最大的幾項（四捨五入後是 0 的不列）
export function explain(f, bonus = { combo: 0, feel: 0, morale: 0 }, { maxPerRule = 4 } = {}) {
  const lines = [];
  if (f.silent) {
    lines.push({ id: 'silent', title: '沒有音樂', mood: { text: '提不起勁', tone: 'bad' }, effects: ['跑速 −10%', '命中率 −4%', '防守 −10%'] });
  } else {
    for (const r of RULES) {
      const effs = r.effects(f)
        .filter((e) => Math.abs(Math.round(e.delta * 100)) >= 1)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, maxPerRule)
        .map((e) => formatDelta(e.stat, e.delta));
      lines.push({ id: r.id, title: r.title(f), mood: r.mood(f), effects: effs });
    }
  }
  for (const r of BONUS_RULES) {
    if (!r.active(bonus)) continue;
    const effs = r.effects(bonus)
      .filter((e) => Math.abs(Math.round(e.delta * 100)) >= 1)
      .map((e) => formatDelta(e.stat, e.delta));
    lines.push({ id: r.id, title: r.title(bonus), mood: { text: '加成', tone: 'good' }, effects: effs });
  }
  return lines;
}

// 一行摘要，例如「BPM 160：急躁 +80%，命中率 −8%」
export function headline(f) {
  const r = RULES[0];
  const mood = r.mood(f).text;
  const shot = r.effects(f).find((e) => e.stat === 'shot').delta;
  const v = Math.round(shot * 100);
  const shotTxt = v === 0 ? '' : `，命中率 ${v > 0 ? '+' : '−'}${Math.abs(v)}%`;
  return `${r.title(f)}：${mood}${shotTxt}`;
}

// 動作判定的結果 → 成功率的加減（百分點）。投籃、傳球、過人、抄截、蓋火鍋共用。
export const GRADE_EFFECT = {
  shot: { perfect: 0.14, great: 0.06, good: 0, miss: -0.14 },
  pass: { perfect: 0.06, great: 0.03, good: 0, miss: -0.1 },
  dribble: { perfect: 0.25, great: 0.14, good: 0.04, miss: -0.15 },
  steal: { perfect: 0.22, great: 0.12, good: 0.03, miss: -0.1 },
  block: { perfect: 0.22, great: 0.12, good: 0.03, miss: -0.1 },
};
