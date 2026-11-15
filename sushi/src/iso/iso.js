// 等角座標轉換與繪製排序。純邏輯。
// 格子座標 (gx, gy) 可以有小數。gx 往右下增加，gy 往左下增加。

export const TILE_W = 32;
export const TILE_H = 16;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** 格子座標轉成世界像素座標（原點是格子 (0,0) 的上方角）。z 是離地高度（像素）。 */
export function gridToWorld(gx, gy, z = 0) {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH - z };
}

/** 世界像素座標反推格子座標（z = 0）。 */
export function worldToGrid(x, y) {
  return { gx: (x / HW + y / HH) / 2, gy: (y / HH - x / HW) / 2 };
}

/** 格子座標轉螢幕座標。origin 是格子 (0,0) 在螢幕上的位置。 */
export function gridToScreen(gx, gy, z, originX, originY) {
  return { x: originX + (gx - gy) * HW, y: originY + (gx + gy) * HH - z };
}

/** 螢幕座標反推格子座標（z = 0）。 */
export function screenToGrid(sx, sy, originX, originY) {
  const dx = sx - originX;
  const dy = sy - originY;
  return { gx: (dx / HW + dy / HH) / 2, gy: (dy / HH - dx / HW) / 2 };
}

/** 角色的深度鍵：腳底座標的 gx + gy。 */
export function actorDepth(gx, gy) {
  return gx + gy;
}

/** 家具的深度鍵：佔地範圍裡最大的 gx + gy，再減 0.01。佔地是從 (x, y) 開始的 w×h 矩形。 */
export function furnitureDepth(x, y, w, h) {
  return x + w + y + h - 0.01;
}

/** 依深度鍵由小到大排序（穩定排序，同鍵維持原順序）。 */
export function sortByDepth(list) {
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (a.item.depth - b.item.depth) || (a.i - b.i))
    .map((e) => e.item);
}

/** 一塊 w×h 的店面在世界座標裡的外框（不含牆高）。 */
export function shopWorldBounds(w, h) {
  return { minX: -h * HW, maxX: w * HW, minY: 0, maxY: (w + h) * HH };
}

/** 地板瓦片的繪製順序：照 gx + gy 由小到大。回傳 [[gx, gy], ...]。 */
export function tileOrder(w, h) {
  const out = [];
  for (let s = 0; s <= w + h - 2; s++) {
    for (let gx = Math.max(0, s - h + 1); gx <= Math.min(w - 1, s); gx++) out.push([gx, s - gx]);
  }
  return out;
}

/** 從移動方向算出面向。回傳 { back, flip }：back 是背對鏡頭，flip 是水平翻轉。 */
// 基本畫格：正面朝左下（+gy）、背面朝左上（−gx）。翻轉後分別是右下（+gx）、右上（−gy）。
export function facingFromDelta(dgx, dgy) {
  if (Math.abs(dgx) >= Math.abs(dgy)) {
    return dgx >= 0 ? { back: false, flip: true } : { back: true, flip: false };
  }
  return dgy >= 0 ? { back: false, flip: false } : { back: true, flip: true };
}

/** 面向名稱轉成 { back, flip }。'S' = +gy（左下）、'E' = +gx（右下）、'N' = −gy（右上）、'W' = −gx（左上）。 */
export function facingFromName(name) {
  switch (name) {
    case 'E': return { back: false, flip: true };
    case 'N': return { back: true, flip: true };
    case 'W': return { back: true, flip: false };
    default: return { back: false, flip: false };
  }
}
