// 球場與物理常數（單位：公尺、秒）。座標系：x 沿球場長邊，z 沿短邊，y 向上。
export const COURT = {
  halfLength: 14,          // 底線在 x = ±14
  halfWidth: 7.5,          // 邊線在 z = ±7.5
  hoopX: 12.425,           // 籃框中心離中線的距離
  rimY: 3.05,              // 籃框高度
  rimR: 0.225,             // 籃框內半徑
  rimTube: 0.009,          // 籃框鐵條半徑
  boardX: 12.8,            // 籃板正面
  boardHalfW: 0.9,
  boardBottom: 2.9,
  boardTop: 3.95,
  threeR: 6.75,            // 三分線半徑
  threeCornerZ: 6.6,       // 底角三分線
  threeCornerDx: 1.415,    // 直線段在籃框前方延伸的長度
  keyHalfW: 2.45,          // 禁區半寬
  keyLength: 5.8,          // 禁區長度（從底線起算）
  ftDist: 4.225,           // 罰球線到籃框中心
  centerCircleR: 1.8,
  restrictedR: 1.25,
};

export const BALL_R = 0.12;
export const GRAVITY = 9.81;
export const PLAYER_R = 0.36;
export const SIM_DT = 1 / 60;

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
export const POSITION_NAMES = {
  PG: '控球後衛',
  SG: '得分後衛',
  SF: '小前鋒',
  PF: '大前鋒',
  C: '中鋒',
};
export const POSITION_SHORT = { PG: '控衛', SG: '分衛', SF: '小前', PF: '大前', C: '中鋒' };

export const DIFFICULTY = {
  easy: {
    name: '簡單', aiRating: 0.88, reaction: 0.42, timingSigma: 0.085, humanWindow: 1.45,
    stealRate: 0.55, helpRate: 0.55, shotIQ: 0.75, blockRate: 0.6, interceptMul: 0.6,
  },
  normal: {
    name: '普通', aiRating: 0.97, reaction: 0.28, timingSigma: 0.06, humanWindow: 1.0,
    stealRate: 1.0, helpRate: 0.85, shotIQ: 0.9, blockRate: 1.0, interceptMul: 1.0,
  },
  hard: {
    name: '困難', aiRating: 1.04, reaction: 0.17, timingSigma: 0.045, humanWindow: 0.78,
    stealRate: 1.35, helpRate: 1.0, shotIQ: 1.0, blockRate: 1.25, interceptMul: 1.25,
  },
};
