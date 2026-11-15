// 地板瓦片（32×16 菱形）和牆面。用程式畫。
import { grid, set, get, poly, rect, toSprite } from './pixgrid.js';

const DIAMOND = [[16, 0], [32, 8], [16, 16], [0, 8]];

/** 把瓦片內的像素座標反推成格子內的小數座標 (u, v)，範圍 0 到 1。 */
function uv(x, y) {
  const dx = x + 0.5 - 16;
  const dy = y + 0.5;
  return { u: (dx / 16 + dy / 8) / 2, v: (dy / 8 - dx / 16) / 2 };
}

function tile(fn) {
  const g = grid(32, 16);
  poly(g, DIAMOND, 'k');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) {
      if (get(g, x, y) === '.') continue;
      const { u, v } = uv(x, y);
      set(g, x, y, fn(u, v, x, y));
    }
  }
  return toSprite(g, { ax: 16, ay: 0 });
}

export const TILE_SPRITES = {
  // 木地板：木條沿著 gx 方向，每格三條
  'tile.wood': tile((u, v) => {
    const band = Math.floor(v * 3);
    if (v * 3 - band < 0.14) return 'b';
    const seam = (band % 2 ? 0.3 : 0.75);
    if (Math.abs(u - seam) < 0.04) return 'b';
    return band === 1 ? 'c' : 'd';
  }),
  // 榻榻米：草蓆加深色包邊
  'tile.tatami': tile((u, v, x, y) => {
    if (u < 0.07 || v < 0.07) return 'n';
    return (x + y * 2) % 4 === 0 ? 'l' : 'T';
  }),
  // 石板
  'tile.stone': tile((u, v) => {
    if (u < 0.06 || v < 0.06) return 'g';
    if (Math.abs(u - 0.5) < 0.04 && v > 0.5) return 'g';
    if (Math.abs(v - 0.5) < 0.04) return 'g';
    return 'A';
  }),
  // 街道（柏油）
  'tile.street': tile((u, v, x, y) => ((x * 7 + y * 13) % 11 === 0 ? 'C' : 'B')),
  // 街道中線
  'tile.streetLine': tile((u, v, x, y) => {
    if (Math.abs(v - 0.5) < 0.08 && u > 0.2 && u < 0.8) return 'W';
    return (x * 7 + y * 13) % 11 === 0 ? 'C' : 'B';
  }),
  // 人行道
  'tile.sidewalk': tile((u, v) => {
    if (u < 0.06 || v < 0.06 || Math.abs(u - 0.5) < 0.03 || Math.abs(v - 0.5) < 0.03) return 'g';
    return 'G';
  }),
  // 草地
  'tile.grass': tile((u, v, x, y) => ((x * 5 + y * 9) % 7 === 0 ? 'l' : (x * 3 + y * 11) % 13 === 0 ? 'n' : 'N')),
  // 門口的踏墊
  'tile.mat': tile((u, v) => {
    if (u < 0.12 || v < 0.12 || u > 0.88 || v > 0.88) return 'm';
    return 'r';
  }),
};

// ---- 牆面 ----
// 一格寬的牆段。高 WALL_H 像素。
// wallL：沿著 gy 方向（店的左後牆，在 gx = 0 那一邊）。
// wallR：沿著 gx 方向（店的右後牆，在 gy = 0 那一邊）。
export const WALL_H = 40;

function wallSeg(dir, fn) {
  // 寬 16、高 WALL_H + 8 的平行四邊形
  const g = grid(16, WALL_H + 8);
  for (let x = 0; x < 16; x++) {
    // dir = 'L'：左低右高；dir = 'R'：左高右低
    const top = dir === 'L' ? Math.floor((15 - x) / 2) : Math.floor(x / 2);
    for (let i = 0; i < WALL_H; i++) set(g, x, top + i, fn(x, i));
  }
  // 錨點：牆段底邊靠裡面的那個角
  return toSprite(g, dir === 'L' ? { ax: 16, ay: WALL_H } : { ax: 0, ay: WALL_H });
}

function plaster(light, dark) {
  return (x, i) => {
    if (i < 2) return 'a';
    if (i >= WALL_H - 9) return i === WALL_H - 9 ? 'a' : (x % 5 === 0 ? 'a' : 'b'); // 木腰板
    if (i === 12) return dark;
    return light;
  };
}

function shoji(x, i) {
  if (i < 2) return 'a';
  if (i >= WALL_H - 9) return i === WALL_H - 9 ? 'a' : (x % 5 === 0 ? 'a' : 'b');
  if (x % 8 === 0 || i % 8 === 4) return 'b';
  return 'w';
}

export const WALL_SPRITES = {
  'wall.L': wallSeg('L', plaster('W', 'd')),
  'wall.R': wallSeg('R', plaster('Y', 'd')),
  'wall.L.shoji': wallSeg('L', shoji),
  'wall.R.shoji': wallSeg('R', shoji),
};

// ---- 影子 ----
export const SHADOW_SPRITE = (() => {
  const g = grid(12, 5);
  rect(g, 2, 0, 8, 5, 'k');
  rect(g, 0, 1, 12, 3, 'k');
  rect(g, 1, 0, 10, 1, '.');
  rect(g, 3, 0, 6, 1, 'k');
  rect(g, 1, 4, 10, 1, '.');
  rect(g, 3, 4, 6, 1, 'k');
  return toSprite(g, { ax: 6, ay: 2 });
})();
