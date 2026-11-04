// 鋼框聯盟（虛構）球隊與球員資料。所有名稱、隊徽、球員都是原創，與真實人物或組織無關。
// 能力值：three 三分、mid 中距離、inside 籃下、speed 速度、handle 控球、defense 防守、
// rebound 籃板、block 阻攻；height 身高（公分）。

const P = (name, number, pos, height, three, mid, inside, speed, handle, defense, rebound, block) => ({
  name, number, pos, height,
  ratings: { three, mid, inside, speed, handle, defense, rebound, block },
});

export const TEAMS = [
  {
    key: 'owls',
    city: '霧港', name: '夜梟', abbr: 'MST', en: 'Mistport Owls',
    style: '外線火力',
    dark: { jersey: '#33245e', trim: '#e8b923', number: '#f6d76e', shorts: '#2a1d4e' },
    light: { jersey: '#f3efe4', trim: '#33245e', number: '#33245e', shorts: '#e7e1d1' },
    court: '#5a4596',
    roster: [
      P('葉承澔', 3, 'PG', 185, 86, 80, 66, 88, 90, 66, 40, 22),
      P('唐柏睿', 11, 'SG', 193, 90, 84, 62, 78, 74, 64, 46, 30),
      P('莫凱倫', 24, 'SF', 201, 80, 78, 72, 74, 66, 72, 60, 46),
      P('鄒奕騰', 34, 'PF', 205, 72, 74, 76, 64, 52, 70, 74, 60),
      P('賀天朗', 50, 'C', 213, 40, 58, 82, 54, 40, 76, 86, 80),
      P('閔子期', 7, 'PG', 180, 78, 72, 58, 84, 82, 70, 34, 18),
      P('嚴書珩', 15, 'SF', 198, 74, 70, 68, 70, 60, 74, 56, 44),
      P('喬力安', 42, 'C', 208, 30, 50, 76, 56, 36, 72, 80, 74),
    ],
  },
  {
    key: 'rhinos',
    city: '赤岩', name: '犀牛', abbr: 'RDR', en: 'Redrock Rhinos',
    style: '禁區肉搏',
    dark: { jersey: '#a32a22', trim: '#222222', number: '#ffffff', shorts: '#8c231c' },
    light: { jersey: '#f4f4f4', trim: '#a32a22', number: '#a32a22', shorts: '#e6e6e6' },
    court: '#b4442f',
    roster: [
      P('霍子堯', 1, 'PG', 188, 74, 74, 72, 84, 84, 72, 44, 24),
      P('馮景澄', 8, 'SG', 195, 76, 78, 74, 80, 72, 70, 48, 32),
      P('盧岳峰', 21, 'SF', 200, 66, 72, 82, 76, 64, 74, 64, 48),
      P('鐵雲翔', 33, 'PF', 206, 50, 66, 86, 66, 50, 78, 84, 66),
      P('巴昂特', 55, 'C', 216, 25, 50, 90, 50, 34, 80, 90, 88),
      P('祁勇信', 4, 'SG', 190, 70, 72, 68, 82, 76, 68, 42, 26),
      P('甘霆', 13, 'PF', 203, 46, 62, 80, 64, 48, 76, 80, 62),
      P('萬嘉駒', 44, 'C', 211, 20, 46, 82, 52, 32, 74, 84, 78),
    ],
  },
  {
    key: 'rays',
    city: '青嵐', name: '飛魟', abbr: 'AZR', en: 'Azure Gale Rays',
    style: '快攻轉換',
    dark: { jersey: '#0d6e7d', trim: '#f2c14e', number: '#ffffff', shorts: '#0a5b67' },
    light: { jersey: '#eaf7f6', trim: '#0d6e7d', number: '#0d6e7d', shorts: '#d8efed' },
    court: '#178b9b',
    roster: [
      P('沈逸風', 0, 'PG', 178, 80, 76, 70, 96, 92, 70, 36, 18),
      P('江晨曦', 5, 'SG', 190, 84, 78, 70, 90, 78, 72, 42, 28),
      P('白予恆', 10, 'SF', 198, 76, 72, 76, 88, 70, 74, 58, 46),
      P('范朔', 23, 'PF', 203, 68, 70, 78, 80, 60, 72, 70, 58),
      P('柯沐陽', 31, 'C', 208, 48, 62, 80, 72, 46, 74, 80, 74),
      P('溫亦辰', 2, 'PG', 183, 74, 70, 64, 90, 84, 66, 34, 16),
      P('單星野', 17, 'SF', 196, 72, 68, 72, 84, 66, 70, 52, 40),
      P('季遠帆', 45, 'C', 210, 34, 54, 78, 64, 40, 72, 82, 76),
    ],
  },
  {
    key: 'leopards',
    city: '北嶺', name: '雪豹', abbr: 'NRS', en: 'Northridge Snow Leopards',
    style: '鐵血防守',
    dark: { jersey: '#1f3c7a', trim: '#9cc7ff', number: '#ffffff', shorts: '#183064' },
    light: { jersey: '#f5f8fc', trim: '#1f3c7a', number: '#1f3c7a', shorts: '#e4eaf4' },
    court: '#2f58a8',
    roster: [
      P('韓立澤', 6, 'PG', 186, 72, 74, 66, 82, 80, 86, 42, 30),
      P('裴昊', 12, 'SG', 194, 78, 72, 66, 80, 70, 88, 48, 40),
      P('俞冬', 20, 'SF', 202, 70, 70, 72, 76, 62, 90, 62, 58),
      P('雷霈', 32, 'PF', 207, 56, 66, 78, 68, 50, 86, 80, 76),
      P('聶北辰', 41, 'C', 214, 30, 54, 82, 56, 36, 88, 88, 92),
      P('封以安', 9, 'SG', 189, 74, 68, 62, 82, 72, 82, 40, 30),
      P('寧崇', 25, 'SF', 200, 64, 66, 70, 74, 58, 84, 60, 54),
      P('冷鐸', 52, 'C', 211, 22, 48, 76, 54, 32, 84, 84, 86),
    ],
  },
  {
    key: 'scorpions',
    city: '金沙', name: '蠍子', abbr: 'GSS', en: 'Goldsand Scorpions',
    style: '全能球星',
    dark: { jersey: '#1b1b1f', trim: '#d9a21b', number: '#f2c94c', shorts: '#141417' },
    light: { jersey: '#f7efd9', trim: '#1b1b1f', number: '#1b1b1f', shorts: '#ece0c0' },
    court: '#b88a1a',
    roster: [
      P('尹燿', 14, 'PG', 187, 84, 82, 74, 86, 88, 74, 44, 26),
      P('歐陽澄', 22, 'SG', 196, 88, 86, 76, 82, 80, 72, 50, 34),
      P('費理昂', 30, 'SF', 203, 80, 82, 82, 80, 74, 78, 66, 52),
      P('魏千里', 35, 'PF', 206, 66, 74, 82, 70, 58, 76, 78, 64),
      P('杭鐵心', 0, 'C', 212, 44, 62, 86, 60, 44, 78, 86, 80),
      P('卓弋', 3, 'PG', 182, 76, 74, 64, 86, 82, 70, 36, 20),
      P('龐毅然', 19, 'SF', 199, 70, 70, 74, 76, 62, 74, 58, 46),
      P('司馬岑', 54, 'C', 209, 36, 56, 80, 58, 40, 74, 82, 72),
    ],
  },
  {
    key: 'frogs',
    city: '翠林', name: '樹蛙', abbr: 'JWT', en: 'Jadewood Treefrogs',
    style: '彈跳運動',
    dark: { jersey: '#23743a', trim: '#c6f25a', number: '#ffffff', shorts: '#1c5f30' },
    light: { jersey: '#f0f8ea', trim: '#23743a', number: '#23743a', shorts: '#dcefd0' },
    court: '#2f8f48',
    roster: [
      P('藍小樂', 1, 'PG', 181, 76, 70, 72, 92, 86, 68, 40, 22),
      P('程躍', 9, 'SG', 192, 72, 70, 80, 92, 74, 70, 50, 44),
      P('席飛鴻', 16, 'SF', 199, 68, 68, 84, 90, 68, 70, 64, 58),
      P('芮彬', 26, 'PF', 204, 58, 64, 84, 80, 56, 72, 78, 70),
      P('包山', 36, 'C', 210, 28, 52, 86, 70, 40, 74, 86, 84),
      P('茅于晏', 6, 'SG', 188, 70, 68, 70, 88, 74, 66, 42, 30),
      P('畢揚', 18, 'SF', 197, 64, 64, 78, 86, 62, 68, 58, 52),
      P('金戈', 40, 'C', 208, 30, 48, 80, 68, 36, 70, 82, 78),
    ],
  },
];

const OVR_WEIGHTS = {
  PG: { three: 0.18, mid: 0.14, inside: 0.08, speed: 0.17, handle: 0.22, defense: 0.13, rebound: 0.04, block: 0.04 },
  SG: { three: 0.24, mid: 0.17, inside: 0.1, speed: 0.15, handle: 0.12, defense: 0.14, rebound: 0.04, block: 0.04 },
  SF: { three: 0.15, mid: 0.14, inside: 0.16, speed: 0.13, handle: 0.09, defense: 0.17, rebound: 0.09, block: 0.07 },
  PF: { three: 0.08, mid: 0.11, inside: 0.22, speed: 0.09, handle: 0.05, defense: 0.17, rebound: 0.16, block: 0.12 },
  C: { three: 0.03, mid: 0.07, inside: 0.25, speed: 0.07, handle: 0.03, defense: 0.18, rebound: 0.19, block: 0.18 },
};

export function overall(player) {
  const w = OVR_WEIGHTS[player.pos];
  let s = 0;
  for (const k in w) s += w[k] * player.ratings[k];
  // 換算成比較直覺的整體評價（約 60–92）
  return Math.round(s * 0.9 + 14);
}

export function teamRatings(team) {
  const starters = team.roster.slice(0, 5);
  const avg = (fn) => Math.round(starters.reduce((a, p) => a + fn(p), 0) / starters.length);
  return {
    overall: avg(overall),
    offense: avg((p) => (p.ratings.three + p.ratings.mid + p.ratings.inside + p.ratings.handle) / 4),
    defense: avg((p) => (p.ratings.defense * 2 + p.ratings.block + p.ratings.rebound) / 4),
    athletic: avg((p) => (p.ratings.speed * 2 + p.ratings.rebound) / 3),
  };
}

export function teamFullName(team) {
  return `${team.city}${team.name}`;
}

export function getTeam(key) {
  return TEAMS.find((t) => t.key === key) || TEAMS[0];
}
