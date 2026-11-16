// 家具與設施的等角像素圖。每件一張，用程式畫。
// 圖裡的錨點 (ax, ay) 對到佔地最上方那個角（格子座標是家具的 x, y）。
import { isoCanvas, isoBox, isoFlat, isoP, isoSprite, rect, set, dots, poly, stamp } from './pixgrid.js';

/** 在等角平面上的某一點畫一個小矩形（螢幕座標對齊）。 */
function at(ic, u, v, z) {
  const [x, y] = isoP(ic, u, v, z);
  return [Math.round(x), Math.round(y)];
}

// 板前檯 2×1：木頭吧台，上面有砧板、玻璃食材櫃
function chefStation() {
  const ic = isoCanvas(2, 1, 26);
  isoBox(ic, 0, 0.15, 0, 2, 0.95, 13, 'd', 'c', 'b');
  isoBox(ic, 0, 0.1, 13, 2, 1, 15, 'c', 'b', 'a'); // 檯面
  // 玻璃食材櫃（靠顧客那一側）
  isoBox(ic, 0.15, 0.55, 15, 1.85, 0.9, 21, 'E', 'I', 'I');
  isoFlat(ic, 0.25, 0.6, 1.75, 0.85, 16, 'w');
  // 櫃子裡的魚料
  for (const [u, c] of [[0.4, 'F'], [0.7, 'f'], [1.0, 'x'], [1.3, 'z'], [1.6, 'w']]) {
    const [x, y] = at(ic, u, 0.72, 17);
    rect(ic.g, x - 1, y - 1, 3, 2, c);
  }
  // 砧板（靠師傅那一側）
  isoFlat(ic, 0.6, 0.15, 1.4, 0.45, 15.5, 'Y');
  const [kx, ky] = at(ic, 1.55, 0.3, 16);
  rect(ic.g, kx, ky - 1, 4, 1, 'E'); // 菜刀
  set(ic.g, kx - 1, ky - 1, 'a');
  return isoSprite(ic);
}

// 吧台座 1×1：一張圓凳
function counterSeat() {
  const ic = isoCanvas(1, 1, 12);
  const [cx, cy] = at(ic, 0.5, 0.5, 0);
  // 椅腳
  rect(ic.g, cx - 3, cy - 6, 1, 7, 'a');
  rect(ic.g, cx + 2, cy - 6, 1, 7, 'a');
  rect(ic.g, cx - 1, cy - 4, 1, 7, 'a');
  rect(ic.g, cx - 3, cy - 2, 6, 1, 'b');
  // 椅面
  rect(ic.g, cx - 4, cy - 9, 8, 3, 'r');
  rect(ic.g, cx - 5, cy - 8, 10, 1, 'r');
  rect(ic.g, cx - 3, cy - 10, 6, 1, 'R');
  rect(ic.g, cx - 4, cy - 6, 8, 1, 'm');
  return isoSprite(ic);
}

// 桌位 2×2：矮木桌加四張椅子
function tableSet() {
  const ic = isoCanvas(2, 2, 16);
  const stool = (u, v) => {
    isoBox(ic, u - 0.22, v - 0.22, 0, u + 0.22, v + 0.22, 6, 'R', 'r', 'm');
  };
  // 後面兩張椅子先畫
  stool(0.45, 0.45);
  stool(1.55, 0.45);
  stool(0.45, 1.55);
  // 桌腳
  isoBox(ic, 0.9, 0.9, 0, 1.1, 1.1, 9, null, 'a', 'a');
  // 桌面
  isoBox(ic, 0.55, 0.55, 9, 1.45, 1.45, 11, 'd', 'c', 'b');
  // 桌上的醬油瓶和茶杯
  const [sx, sy] = at(ic, 1.0, 0.8, 11);
  rect(ic.g, sx, sy - 3, 2, 3, 'a'); set(ic.g, sx, sy - 4, 'r');
  const [tx, ty] = at(ic, 0.8, 1.1, 11);
  rect(ic.g, tx, ty - 2, 2, 2, 'q');
  // 最前面那張椅子最後畫
  stool(1.55, 1.55);
  return isoSprite(ic);
}

// 小鋼珠台 1×2：機台在後（v 小），椅子在前
function pachinko() {
  const ic = isoCanvas(1, 2, 34);
  // 機台本體
  isoBox(ic, 0.1, 0.05, 0, 0.9, 0.6, 32, 'G', 'i', 'U');
  // 正面（朝 +gy）的檯面玻璃
  const P = (u, z) => isoP(ic, u, 0.6, z);
  poly(ic.g, [P(0.18, 29), P(0.82, 29), P(0.82, 11), P(0.18, 11)], 'u');
  poly(ic.g, [P(0.22, 28), P(0.78, 28), P(0.78, 12), P(0.22, 12)], 'I');
  // 釘子和彈珠
  for (const [u, z, c] of [[0.3, 25, 'e'], [0.5, 26, 'e'], [0.7, 25, 'e'], [0.4, 21, 'e'], [0.6, 21, 'e'], [0.3, 17, 'e'], [0.5, 18, 'w'], [0.7, 17, 'e'], [0.45, 14, 'F'], [0.6, 15, 'w']]) {
    const [x, y] = P(u, z);
    set(ic.g, Math.round(x), Math.round(y), c);
  }
  // 下方的承珠盤和旋鈕
  poly(ic.g, [P(0.18, 9), P(0.82, 9), P(0.82, 5), P(0.18, 5)], 'y');
  const [hx, hy] = P(0.75, 4);
  rect(ic.g, Math.round(hx) - 1, Math.round(hy) - 1, 3, 3, 'r');
  // 頂部的燈
  isoBox(ic, 0.3, 0.2, 32, 0.7, 0.5, 34, 'R', 'r', 'm');
  // 椅子
  isoBox(ic, 0.28, 1.2, 0, 0.72, 1.64, 7, 'R', 'r', 'm');
  return isoSprite(ic);
}

// 賽車機台 1×2：街機。正面（朝 +gy）有螢幕、方向盤，前面有一張賽車椅
function raceCab() {
  const ic = isoCanvas(1, 2, 38);
  // 機台本體（黑色帶紅邊）
  isoBox(ic, 0.08, 0.05, 0, 0.92, 0.62, 34, 'K', 'k', 'K');
  // 頂部的招牌燈箱
  isoBox(ic, 0.08, 0.05, 34, 0.92, 0.5, 38, 'y', 'r', 'R');
  const P = (u, z) => isoP(ic, u, 0.62, z);
  // 招牌上的格紋旗
  for (const [u, c] of [[0.3, 'k'], [0.42, 'w'], [0.54, 'k'], [0.66, 'w']]) {
    const [x, y] = isoP(ic, u, 0.5, 36);
    set(ic.g, Math.round(x), Math.round(y), c);
  }
  // 螢幕：天空、地平線、路
  poly(ic.g, [P(0.16, 31), P(0.84, 31), P(0.84, 15), P(0.16, 15)], 'u');
  poly(ic.g, [P(0.2, 30), P(0.8, 30), P(0.8, 24), P(0.2, 24)], 'I');
  poly(ic.g, [P(0.2, 24), P(0.8, 24), P(0.8, 16), P(0.2, 16)], 'N');
  poly(ic.g, [P(0.46, 24), P(0.54, 24), P(0.74, 16), P(0.26, 16)], 'B');
  const [cx, cy] = P(0.5, 18);
  rect(ic.g, Math.round(cx) - 1, Math.round(cy) - 1, 2, 1, 'y'); // 螢幕裡的小黃瓜捲車
  // 控制台和方向盤
  poly(ic.g, [P(0.12, 13), P(0.88, 13), P(0.88, 9), P(0.12, 9)], 'r');
  const [wx, wy] = P(0.5, 12);
  stamp(ic.g, Math.round(wx) - 3, Math.round(wy) - 2, ['.kkkk.', 'k....k', 'k.gg.k', '.kkkk.']);
  // 賽車椅
  isoBox(ic, 0.25, 1.15, 0, 0.75, 1.7, 7, 'R', 'r', 'm');
  isoBox(ic, 0.25, 1.55, 7, 0.75, 1.72, 15, 'R', 'r', 'm');
  return isoSprite(ic);
}

function fridge() {
  const ic = isoCanvas(1, 1, 30);
  isoBox(ic, 0.1, 0.1, 0, 0.9, 0.9, 29, 'E', 'G', 'g');
  const P = (u, z) => isoP(ic, u, 0.9, z);
  poly(ic.g, [P(0.15, 27), P(0.85, 27), P(0.85, 17), P(0.15, 17)], 'w');
  poly(ic.g, [P(0.15, 15), P(0.85, 15), P(0.85, 2), P(0.15, 2)], 'w');
  const [hx, hy] = P(0.75, 21);
  rect(ic.g, Math.round(hx), Math.round(hy) - 2, 1, 4, 'K');
  const [h2x, h2y] = P(0.75, 11);
  rect(ic.g, Math.round(h2x), Math.round(h2y) - 2, 1, 4, 'K');
  const [mx, my] = P(0.35, 23);
  rect(ic.g, Math.round(mx), Math.round(my), 2, 2, 'I');
  return isoSprite(ic);
}

function lantern() {
  const ic = isoCanvas(1, 1, 30);
  const [cx, cy] = at(ic, 0.5, 0.5, 0);
  rect(ic.g, cx - 3, cy - 1, 6, 2, 'a'); // 底座
  rect(ic.g, cx, cy - 28, 1, 27, 'a'); // 柱子
  rect(ic.g, cx - 4, cy - 28, 9, 1, 'a');
  // 燈籠
  rect(ic.g, cx - 6, cy - 26, 5, 1, 'k');
  rect(ic.g, cx - 7, cy - 25, 7, 9, 'r');
  rect(ic.g, cx - 6, cy - 25, 5, 9, 'R');
  rect(ic.g, cx - 5, cy - 23, 3, 5, 'Y');
  rect(ic.g, cx - 6, cy - 16, 5, 1, 'k');
  return isoSprite(ic);
}

function fishTank() {
  const ic = isoCanvas(2, 1, 22);
  isoBox(ic, 0.1, 0.15, 0, 1.9, 0.85, 8, 'b', 'b', 'a');
  isoBox(ic, 0.1, 0.15, 8, 1.9, 0.85, 21, 'I', 'i', 'i');
  const P = (u, z) => isoP(ic, u, 0.85, z);
  poly(ic.g, [P(0.16, 20), P(1.84, 20), P(1.84, 9), P(0.16, 9)], 'I');
  // 魚和水草
  for (const [u, z, c] of [[0.5, 16, 'R'], [1.1, 13, 'y'], [1.5, 17, 'f']]) {
    const [x, y] = P(u, z);
    rect(ic.g, Math.round(x), Math.round(y), 3, 2, c);
    set(ic.g, Math.round(x) - 1, Math.round(y), c);
  }
  for (const u of [0.3, 0.9, 1.7]) {
    const [x, y] = P(u, 10);
    rect(ic.g, Math.round(x), Math.round(y) - 3, 1, 4, 'n');
  }
  return isoSprite(ic);
}

function plant() {
  const ic = isoCanvas(1, 1, 22);
  const [cx, cy] = at(ic, 0.5, 0.5, 0);
  rect(ic.g, cx - 3, cy - 5, 7, 6, 'o');
  rect(ic.g, cx - 4, cy - 6, 9, 2, 'm');
  stamp(ic.g, cx - 6, cy - 20, [
    '....N...N....',
    '...NlN.NlN...',
    '.N.NlNNNlN.N.',
    'NlN.NlNlN.NlN',
    'NlNN.NlN.NNlN',
    '.NlNNNlNNNlN.',
    '..NNlNnNlNN..',
    '....NnnnN....',
    '.....nnn.....',
    '......n......',
    '......n......',
    '......n......',
    '......n......',
    '......n......',
  ]);
  return isoSprite(ic);
}

function uniformSign() {
  const ic = isoCanvas(1, 1, 26);
  const [cx, cy] = at(ic, 0.5, 0.5, 0);
  // A 字立牌
  rect(ic.g, cx - 6, cy - 22, 1, 23, 'a');
  rect(ic.g, cx + 6, cy - 22, 1, 23, 'a');
  rect(ic.g, cx - 6, cy - 24, 13, 20, 'y');
  rect(ic.g, cx - 6, cy - 24, 13, 1, 'a');
  rect(ic.g, cx - 6, cy - 5, 13, 1, 'a');
  // 「300」
  stamp(ic.g, cx - 5, cy - 20, [
    'rrr.rrr.rrr',
    '..r.r.r.r.r',
    'rrr.r.r.r.r',
    '..r.r.r.r.r',
    'rrr.rrr.rrr',
  ]);
  rect(ic.g, cx - 4, cy - 12, 9, 1, 'r');
  rect(ic.g, cx - 3, cy - 10, 7, 2, 'F');
  rect(ic.g, cx - 3, cy - 8, 7, 1, 'w');
  return isoSprite(ic);
}

// 入口的門框（不是家具，畫在店的前緣）
function doorFrame() {
  const ic = isoCanvas(1, 1, 36);
  const P = (u, z) => isoP(ic, u, 1, z);
  // 兩根柱子和橫樑
  poly(ic.g, [P(0, 34), P(0.12, 34), P(0.12, 0), P(0, 0)], 'a');
  poly(ic.g, [P(0.88, 34), P(1, 34), P(1, 0), P(0.88, 0)], 'a');
  poly(ic.g, [P(0, 36), P(1, 36), P(1, 31), P(0, 31)], 'b');
  // 暖簾
  poly(ic.g, [P(0.12, 31), P(0.88, 31), P(0.88, 21), P(0.12, 21)], 'U');
  for (const u of [0.31, 0.5, 0.69]) {
    const [x, y] = P(u, 21);
    rect(ic.g, Math.round(x), Math.round(y) - 6, 1, 6, 'u');
  }
  const [x, y] = P(0.5, 27);
  rect(ic.g, Math.round(x) - 1, Math.round(y) - 1, 3, 3, 'W');
  return isoSprite(ic);
}

// 包廂 2×2：屏風圍起來的矮桌，坐墊是紫色
function booth() {
  const ic = isoCanvas(2, 2, 26);
  // 後面兩片屏風
  isoBox(ic, 0, 0, 0, 2, 0.08, 24, 'a', 'Y', 'b');
  isoBox(ic, 0, 0, 0, 0.08, 2, 24, 'Y', 'a', 'b');
  const cushion = (u, v) => isoBox(ic, u - 0.24, v - 0.24, 0, u + 0.24, v + 0.24, 5, 'V', 'v', 'v');
  cushion(0.5, 0.5);
  cushion(1.55, 0.5);
  cushion(0.5, 1.55);
  isoBox(ic, 0.9, 0.9, 0, 1.1, 1.1, 8, null, 'a', 'a');
  isoBox(ic, 0.55, 0.55, 8, 1.45, 1.45, 10, 'k', 'K', 'K'); // 黑漆桌面
  const [sx, sy] = at(ic, 1.0, 0.85, 10);
  rect(ic.g, sx, sy - 3, 2, 3, 'r'); set(ic.g, sx, sy - 4, 'y');
  const [tx, ty] = at(ic, 0.8, 1.15, 10);
  rect(ic.g, tx, ty - 2, 3, 2, 'w');
  cushion(1.55, 1.55);
  return isoSprite(ic);
}

// 樓梯 2×1：左邊往上（幾階踏板），右邊往下（地板上的開口）
function stairs() {
  const ic = isoCanvas(2, 1, 12);
  for (let i = 0; i < 4; i++) isoBox(ic, 0.05, 0.1 + i * 0.2, 0, 0.95, 0.3 + i * 0.2, 10 - i * 3 + 1, 'c', 'b', 'a');
  isoFlat(ic, 1.05, 0.08, 1.95, 0.92, 0.5, 'k');
  isoFlat(ic, 1.15, 0.5, 1.85, 0.9, 0.6, 'a');
  isoFlat(ic, 1.15, 0.7, 1.85, 0.9, 0.7, 'b');
  return isoSprite(ic);
}

export const FURNITURE_SPRITES = {
  'furn.booth': booth(),
  'furn.stairs': stairs(),
  'furn.chefStation': chefStation(),
  'furn.counterSeat': counterSeat(),
  'furn.tableSet': tableSet(),
  'furn.pachinko': pachinko(),
  'furn.raceCab': raceCab(),
  'furn.fridge': fridge(),
  'furn.lantern': lantern(),
  'furn.fishTank': fishTank(),
  'furn.plant': plant(),
  'furn.uniformSign': uniformSign(),
  'furn.door': doorFrame(),
};

// ---- 店外的背景物件 ----
function house(wallC, roofC, roofD) {
  const ic = isoCanvas(3, 3, 52);
  isoBox(ic, 0.2, 0.2, 0, 2.8, 2.8, 26, wallC, wallC, 'd');
  // 屋頂（斜的：用兩層方塊近似）
  isoBox(ic, 0, 0, 26, 3, 3, 30, roofC, roofD, roofD);
  isoBox(ic, 0.4, 0.4, 30, 2.6, 2.6, 38, roofC, roofD, roofD);
  isoBox(ic, 0.9, 0.9, 38, 2.1, 2.1, 44, roofC, roofD, roofD);
  // 門和窗（朝 +gy 的牆）
  const P = (u, z) => isoP(ic, u, 2.8, z);
  poly(ic.g, [P(1.2, 16), P(1.8, 16), P(1.8, 0), P(1.2, 0)], 'a');
  poly(ic.g, [P(0.4, 20), P(0.9, 20), P(0.9, 10), P(0.4, 10)], 'I');
  poly(ic.g, [P(2.1, 20), P(2.6, 20), P(2.6, 10), P(2.1, 10)], 'I');
  return isoSprite(ic);
}

function pole() {
  const ic = isoCanvas(1, 1, 60);
  const [cx, cy] = at(ic, 0.5, 0.5, 0);
  rect(ic.g, cx, cy - 58, 2, 59, 'g');
  rect(ic.g, cx - 7, cy - 54, 16, 1, 'K');
  rect(ic.g, cx - 5, cy - 48, 12, 1, 'K');
  dots(ic.g, [[cx - 7, cy - 55], [cx + 8, cy - 55], [cx - 5, cy - 49], [cx + 6, cy - 49]], 'w');
  rect(ic.g, cx - 1, cy - 40, 4, 6, 'G');
  return isoSprite(ic);
}

export const SCENERY_SPRITES = {
  'scene.houseA': house('W', 'i', 'U'),
  'scene.houseB': house('Y', 'r', 'm'),
  'scene.houseC': house('E', 'g', 'K'),
  'scene.pole': pole(),
};
