// 畫店鋪、家具、角色。
// 靜態的部分（店外地面、地板、後牆）先畫到離屏畫布快取，每個畫面只貼一次。
import { gridToWorld, tileOrder, sortByDepth, actorDepth, furnitureDepth, TILE_W, TILE_H } from './iso.js';
import { worldToScreen } from './camera.js';
import { getSprite, getCharFrame, drawSprite } from './sprites.js';
import { WALL_H } from '../data/sprites/tiles.js';

export const OUTSIDE = 5; // 店外多畫幾格（街道、人行道）
const SIDEWALK = 2;

/**
 * 算出包含店外的世界範圍（給相機和背景快取用）。
 * shop = { w, h, floor, door: { gx }, wall }
 */
export function sceneBounds(shop) {
  const minX = -(shop.h + OUTSIDE) * (TILE_W / 2);
  const maxX = (shop.w + OUTSIDE) * (TILE_W / 2);
  const minY = -WALL_H - 60;
  const maxY = (shop.w + shop.h + OUTSIDE) * (TILE_H / 2) + 8;
  return { minX, maxX, minY, maxY };
}

/** 相機可以移動的範圍：店面加一點邊。 */
export function cameraBounds(shop) {
  return {
    minX: -shop.h * (TILE_W / 2) - 24,
    maxX: shop.w * (TILE_W / 2) + 24,
    minY: -WALL_H - 14,
    maxY: (shop.w + shop.h) * (TILE_H / 2) + 30,
  };
}

function outsideTile(shop, gx, gy) {
  // 店的前方（gy ≥ h）：人行道、街道。右前方（gx ≥ w）：人行道、草地。後方：草地。
  if (gy >= shop.h && gx >= -OUTSIDE) {
    const d = gy - shop.h;
    if (d < SIDEWALK) return 'tile.sidewalk';
    if (d === SIDEWALK + 1) return 'tile.streetLine';
    return 'tile.street';
  }
  if (gx >= shop.w) return gx - shop.w < 1 ? 'tile.sidewalk' : 'tile.grass';
  return 'tile.grass';
}

function floorTile(shop, gx, gy) {
  if (typeof shop.floor === 'function') return shop.floor(gx, gy);
  if (shop.door && gx === shop.door.gx && gy === shop.h - 1) return 'tile.mat';
  return `tile.${shop.floor || 'wood'}`;
}

const bgCache = new Map();

function buildBackground(shop) {
  const b = sceneBounds(shop);
  const c = document.createElement('canvas');
  c.width = b.maxX - b.minX;
  c.height = b.maxY - b.minY;
  const ctx = c.getContext('2d');
  const ox = -b.minX;
  const oy = -b.minY;
  const put = (name, gx, gy, z = 0) => {
    const w = gridToWorld(gx, gy, z);
    drawSprite(ctx, getSprite(name), ox + w.x, oy + w.y);
  };
  // 店外地面
  const lo = -OUTSIDE;
  const W = shop.w + OUTSIDE;
  const H = shop.h + OUTSIDE;
  for (let s = lo * 2; s <= W + H - 2; s++) {
    for (let gx = lo; gx < W; gx++) {
      const gy = s - gx;
      if (gy < lo || gy >= H) continue;
      if (gx >= 0 && gy >= 0 && gx < shop.w && gy < shop.h) continue;
      put(outsideTile(shop, gx, gy), gx, gy);
    }
  }
  // 後方的鄰居房屋和電線桿
  if (shop.scenery !== false) {
    put('scene.houseB', -4.2, Math.max(0, shop.h * 0.2));
    put('scene.houseA', Math.max(0, shop.w * 0.35), -4.2);
    put('scene.houseC', shop.w + 0.6, -3.6);
    put('scene.pole', -1.2, -1.2);
  }
  // 地板
  for (const [gx, gy] of tileOrder(shop.w, shop.h)) put(floorTile(shop, gx, gy), gx, gy);
  // 地板前緣的厚度
  const fl = gridToWorld(0, shop.h);
  const fm = gridToWorld(shop.w, shop.h);
  const fr = gridToWorld(shop.w, 0);
  ctx.fillStyle = '#4a2f1c';
  ctx.beginPath();
  ctx.moveTo(ox + fl.x, oy + fl.y); ctx.lineTo(ox + fm.x, oy + fm.y); ctx.lineTo(ox + fm.x, oy + fm.y + 4); ctx.lineTo(ox + fl.x, oy + fl.y + 4);
  ctx.fill();
  ctx.fillStyle = '#7a4f2e';
  ctx.beginPath();
  ctx.moveTo(ox + fm.x, oy + fm.y); ctx.lineTo(ox + fr.x, oy + fr.y); ctx.lineTo(ox + fr.x, oy + fr.y + 4); ctx.lineTo(ox + fm.x, oy + fm.y + 4);
  ctx.fill();
  // 後牆
  const style = shop.wall ? `.${shop.wall}` : '';
  for (let gy = shop.h - 1; gy >= 0; gy--) put((gy % 3 === 1 && shop.wall !== 'plain') ? 'wall.L.shoji' : `wall.L${style}`, 0, gy);
  for (let gx = shop.w - 1; gx >= 0; gx--) put((gx % 4 === 2 && shop.wall !== 'plain') ? 'wall.R.shoji' : `wall.R${style}`, gx, 0);
  // 牆角的柱子
  ctx.fillStyle = '#4a2f1c';
  ctx.fillRect(ox - 1, oy - WALL_H - 1, 2, WALL_H + 1);
  return { canvas: c, ox, oy };
}

function background(shop) {
  const key = `${shop.w}x${shop.h}|${typeof shop.floor === 'function' ? shop.floorKey || 'fn' : shop.floor}|${shop.door ? shop.door.gx : ''}|${shop.wall || ''}|${shop.scenery === false ? 0 : 1}`;
  let bg = bgCache.get(key);
  if (!bg) {
    if (bgCache.size > 6) bgCache.clear();
    bg = buildBackground(shop);
    bgCache.set(key, bg);
  }
  return bg;
}

/** 清掉背景快取（擴建或換地板之後呼叫）。 */
export function invalidateBackground() {
  bgCache.clear();
}

/**
 * 畫整個場景。
 * items 是要排序的物件清單：
 *   { kind: 'furn', type, x, y, w, h, sprite? }
 *   { kind: 'actor', charId, gx, gy, z?, pose?, back?, flip?, depth?, shadow? }
 *   { kind: 'sprite', name, gx, gy, z?, depth, flip? }
 * 回傳排序後的清單（每個物件多了 sx、sy，給點選判定用）。
 */
export function drawScene(ctx, cam, shop, items, opts = {}) {
  const v = cam.view;
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.x, v.y, v.w, v.h);
  ctx.clip();
  ctx.fillStyle = opts.sky || '#4f7a45';
  ctx.fillRect(v.x, v.y, v.w, v.h);

  const o = worldToScreen(cam, 0, 0);
  ctx.translate(Math.round(o.x), Math.round(o.y));
  ctx.scale(cam.zoom, cam.zoom);

  const bg = background(shop);
  ctx.drawImage(bg.canvas, -bg.ox, -bg.oy);

  // 入口門框
  const list = [];
  if (shop.door) {
    list.push({ kind: 'sprite', name: 'furn.door', gx: shop.door.gx, gy: shop.h - 1, depth: shop.door.gx + shop.h + 0.45 });
  }
  for (const it of items) {
    if (it.depth === undefined) {
      it.depth = it.kind === 'furn' ? furnitureDepth(it.x, it.y, it.w, it.h) : actorDepth(it.gx, it.gy);
    }
    list.push(it);
  }
  const sorted = sortByDepth(list);
  for (const it of sorted) {
    if (it.kind === 'furn') {
      const w = gridToWorld(it.x, it.y);
      it.sx = w.x; it.sy = w.y;
      if (it.ghost) ctx.globalAlpha = 0.6;
      drawSprite(ctx, getSprite(it.sprite || `furn.${it.type}`), w.x, w.y);
      if (it.ghost) ctx.globalAlpha = 1;
      if (it.draw) it.draw(ctx, w.x, w.y);
    } else if (it.kind === 'actor') {
      const w = gridToWorld(it.gx, it.gy);
      it.sx = w.x; it.sy = w.y - (it.z || 0);
      if (it.shadow !== false) {
        ctx.globalAlpha = 0.25;
        drawSprite(ctx, getSprite('shadow'), w.x, w.y);
        ctx.globalAlpha = 1;
      }
      drawSprite(ctx, getCharFrame(it.charId, it.pose || 'stand', !!it.back, !!it.flip), w.x, w.y - (it.z || 0) + 1);
      if (it.draw) it.draw(ctx, it.sx, it.sy);
    } else if (it.kind === 'sprite') {
      const w = gridToWorld(it.gx, it.gy, it.z || 0);
      it.sx = w.x; it.sy = w.y;
      drawSprite(ctx, getSprite(it.name, !!it.flip), w.x, w.y);
    } else if (it.kind === 'custom' && it.draw) {
      const w = gridToWorld(it.gx, it.gy, it.z || 0);
      it.draw(ctx, w.x, w.y);
    }
  }
  if (opts.overlay) opts.overlay(ctx);
  ctx.restore();
  return sorted;
}

/** 在世界座標畫一個格子的菱形外框（選取框、擺設預覽用）。要在 drawScene 的 overlay 裡呼叫。 */
export function strokeCell(ctx, gx, gy, w, h, color) {
  const a = gridToWorld(gx, gy);
  const b = gridToWorld(gx + w, gy);
  const c = gridToWorld(gx + w, gy + h);
  const d = gridToWorld(gx, gy + h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y + 0.5); ctx.lineTo(b.x, b.y + 0.5); ctx.lineTo(c.x, c.y + 0.5); ctx.lineTo(d.x, d.y + 0.5); ctx.closePath();
  ctx.stroke();
}

export function fillCell(ctx, gx, gy, w, h, color) {
  const a = gridToWorld(gx, gy);
  const b = gridToWorld(gx + w, gy);
  const c = gridToWorld(gx + w, gy + h);
  const d = gridToWorld(gx, gy + h);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  ctx.fill();
}
