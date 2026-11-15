// 像素圖資料轉成畫布並快取。
import { STATIC_SPRITES, characterFrames } from '../data/sprites/index.js';

const cache = new Map();

/** 把像素圖資料畫成一張畫布。flip = true 時水平翻轉。 */
export function spriteToCanvas(sprite, flip = false) {
  const c = document.createElement('canvas');
  c.width = sprite.w;
  c.height = sprite.h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < sprite.w; x++) {
      const color = sprite.palette[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(flip ? sprite.w - 1 - x : x, y, 1, 1);
    }
  }
  return c;
}

function cached(key, sprite, flip) {
  let e = cache.get(key);
  if (!e) {
    e = {
      canvas: spriteToCanvas(sprite, flip),
      ax: flip ? sprite.w - (sprite.ax ?? 0) : (sprite.ax ?? 0),
      ay: sprite.ay ?? 0,
      w: sprite.w,
      h: sprite.h,
    };
    cache.set(key, e);
  }
  return e;
}

/** 取得靜態像素圖的畫布。回傳 { canvas, ax, ay, w, h }，找不到回傳 null。 */
export function getSprite(name, flip = false) {
  const sprite = STATIC_SPRITES[name];
  if (!sprite) return null;
  return cached(`${name}|${flip ? 1 : 0}`, sprite, flip);
}

/** 取得角色某個畫格的畫布。 */
export function getCharFrame(charId, pose, back = false, flip = false) {
  const frames = characterFrames(charId);
  if (!frames) return null;
  const set = back ? frames.back : frames.front;
  const sprite = set[pose] || set.stand;
  return cached(`c:${charId}|${pose}|${back ? 1 : 0}|${flip ? 1 : 0}`, sprite, flip);
}

/** 取得角色的大頭像畫布。 */
export function getPortrait(charId, angry = false) {
  const frames = characterFrames(charId);
  if (!frames) return null;
  return cached(`p:${charId}|${angry ? 1 : 0}`, angry ? frames.portraitAngry : frames.portrait, false);
}

/** 把像素圖畫在指定位置（錨點對齊 x, y）。 */
export function drawSprite(ctx, entry, x, y) {
  if (!entry) return;
  ctx.drawImage(entry.canvas, Math.round(x - entry.ax), Math.round(y - entry.ay));
}

/** 把像素圖轉成 data URL（DOM 介面的圖示用）。scale 是放大倍數。 */
const urlCache = new Map();
export function spriteDataURL(entry, scale = 1) {
  if (!entry) return '';
  const key = entry.canvas;
  let m = urlCache.get(key);
  if (!m) { m = {}; urlCache.set(key, m); }
  if (!m[scale]) {
    const c = document.createElement('canvas');
    c.width = entry.w * scale;
    c.height = entry.h * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(entry.canvas, 0, 0, c.width, c.height);
    m[scale] = c.toDataURL();
  }
  return m[scale];
}
