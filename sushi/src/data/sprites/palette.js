// 整個遊戲共用的調色盤（最多 48 色）。像素圖資料裡一個字元代表一個顏色。
// '.' 是透明。

export const PALETTE = {
  '.': null,
  // 黑白灰
  k: '#1b1b1f', K: '#3a3a46', g: '#7b7b88', G: '#b9b9c4', w: '#ffffff', W: '#f6ecd4',
  // 膚色
  s: '#f5c9a0', S: '#d99a6c', t: '#b9774c',
  // 木頭
  a: '#4a2f1c', b: '#7a4f2e', c: '#b98552', d: '#e0b77c',
  // 紅、粉紅
  m: '#8a2c20', r: '#b5402f', R: '#e0604a', p: '#f09cb0', P: '#f7c9d4',
  // 橘、黃
  o: '#e2873b', e: '#e2a93b', y: '#f2c94c', Y: '#fbe9a0', D: '#f4d35e',
  // 綠
  n: '#3f6b2f', N: '#5d8c3c', l: '#9cc65a',
  // 藍
  u: '#1f2a4a', U: '#2f4270', i: '#4a72b8', I: '#8fb8e8', q: '#3aa6a0',
  // 紫
  v: '#5b3f7a', V: '#a98ac8',
  // 頭髮
  h: '#3b2a20', H: '#8a5a30',
  // 食物
  f: '#f08a5a', F: '#c9302c', x: '#f6b0a0', z: '#f39c2a', j: '#26331f',
  // 地面
  T: '#c8b070', A: '#8e8ea0', B: '#5b5262', C: '#6f6676', E: '#d5dde2',
};

/** 調色盤的顏色數（不含透明）。 */
export const PALETTE_SIZE = Object.keys(PALETTE).length - 1;
