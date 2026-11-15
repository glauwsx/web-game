// 像素格工具：用程式畫像素圖，最後輸出成 { w, h, palette, rows } 的資料格式。
// 純邏輯，Node.js 可用。
import { PALETTE } from './palette.js';

export function grid(w, h) {
  return { w, h, d: new Array(w * h).fill('.') };
}

export function get(g, x, y) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return '.';
  return g.d[y * g.w + x];
}

export function set(g, x, y, c) {
  if (!c || x < 0 || y < 0 || x >= g.w || y >= g.h) return;
  g.d[y * g.w + x] = c;
}

/** 填矩形。 */
export function rect(g, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(g, x + i, y + j, c);
}

/** 一次畫多個點。pts 是 [[x, y], ...]。 */
export function dots(g, pts, c) {
  for (const [x, y] of pts) set(g, x, y, c);
}

/** 用字串畫一小塊。rows 例如 ['.kk.', 'kwwk']。'.' 不畫，' ' 也不畫。 */
export function stamp(g, x, y, rows) {
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const c = rows[j][i];
      if (c !== '.' && c !== ' ') set(g, x + i, y + j, c);
    }
  }
}

/** 填多邊形（取像素中心判斷）。pts 是 [[x, y], ...]。 */
export function poly(g, pts, c) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(g.h - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
        xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.ceil(xs[i] - 0.5);
      const xb = Math.floor(xs[i + 1] - 0.5);
      for (let x = xa; x <= xb; x++) set(g, x, y, c);
    }
  }
}

/** 把 src 貼到 dst（透明的地方不貼）。 */
export function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const c = src.d[y * src.w + x];
      if (c !== '.') set(dst, dx + x, dy + y, c);
    }
  }
}

/** 在圖形外圍加一圈輪廓（只填透明的格子）。 */
export function outline(g, c = 'k') {
  const add = [];
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (get(g, x, y) !== '.') continue;
      if (get(g, x - 1, y) !== '.' || get(g, x + 1, y) !== '.' || get(g, x, y - 1) !== '.' || get(g, x, y + 1) !== '.') add.push([x, y]);
    }
  }
  dots(g, add, c);
  return g;
}

/** 水平翻轉，回傳新的像素格。 */
export function flipH(g) {
  const out = grid(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) out.d[y * g.w + (g.w - 1 - x)] = g.d[y * g.w + x];
  return out;
}

/** 把某個顏色全部換成另一個。 */
export function swap(g, from, to) {
  for (let i = 0; i < g.d.length; i++) if (g.d[i] === from) g.d[i] = to;
  return g;
}

/** 輸出成像素圖資料格式。extra 可以帶錨點等額外欄位。 */
export function toSprite(g, extra) {
  const rows = [];
  for (let y = 0; y < g.h; y++) rows.push(g.d.slice(y * g.w, (y + 1) * g.w).join(''));
  return { w: g.w, h: g.h, palette: PALETTE, rows, ...extra };
}

/** 從字串陣列建立像素圖資料（手畫的小圖用）。 */
export function fromRows(rows, extra) {
  return { w: rows[0].length, h: rows.length, palette: PALETTE, rows, ...extra };
}

// ---- 等角圖形 ----
// 等角畫布：給一件佔地 fw×fh、高 height 像素的家具用。
// 錨點 (ax, ay) 是佔地最上方那個角（格子座標 (0,0)，離地 0）在圖裡的位置。
export function isoCanvas(fw, fh, height, padBottom = 0) {
  const w = (fw + fh) * 16;
  const h = (fw + fh) * 8 + height + padBottom;
  return { g: grid(w, h), ax: fh * 16, ay: height, fw, fh };
}

/** 格子座標（相對於佔地左上角）轉成圖裡的像素位置。 */
export function isoP(ic, u, v, z = 0) {
  return [ic.ax + (u - v) * 16, ic.ay + (u + v) * 8 - z];
}

/** 畫一個等角方塊。top、left、right 是三個可見面的顏色。 */
export function isoBox(ic, u0, v0, z0, u1, v1, z1, top, left, right) {
  const P = (u, v, z) => isoP(ic, u, v, z);
  if (left) poly(ic.g, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], left);
  if (right) poly(ic.g, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], right);
  if (top) poly(ic.g, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], top);
}

/** 畫一塊等角平面（在高度 z）。 */
export function isoFlat(ic, u0, v0, u1, v1, z, c) {
  const P = (u, v) => isoP(ic, u, v, z);
  poly(ic.g, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], c);
}

/** 等角畫布輸出成像素圖資料（帶錨點）。 */
export function isoSprite(ic, extra) {
  return toSprite(ic.g, { ax: ic.ax, ay: ic.ay, ...extra });
}
