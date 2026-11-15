import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gridToScreen, screenToGrid, gridToWorld, worldToGrid, actorDepth, furnitureDepth, sortByDepth, tileOrder,
  facingFromDelta, facingFromName, shopWorldBounds,
} from '../../src/iso/iso.js';
import { createCamera, setBounds, panCamera, zoomCamera, worldToScreen, screenToWorld } from '../../src/iso/camera.js';

test('iso：照計劃書的公式轉換', () => {
  // 螢幕 x = originX + (gx - gy) * 16；螢幕 y = originY + (gx + gy) * 8 - z
  assert.deepEqual(gridToScreen(0, 0, 0, 100, 50), { x: 100, y: 50 });
  assert.deepEqual(gridToScreen(3, 1, 0, 100, 50), { x: 132, y: 82 });
  assert.deepEqual(gridToScreen(1, 3, 10, 100, 50), { x: 68, y: 72 });
});

test('iso：座標轉換來回一致', () => {
  for (const [gx, gy] of [[0, 0], [1, 0], [0, 1], [3.25, 7.5], [19.9, 15.1], [-2, 4]]) {
    const s = gridToScreen(gx, gy, 0, 240, 40);
    const g = screenToGrid(s.x, s.y, 240, 40);
    assert.ok(Math.abs(g.gx - gx) < 1e-9 && Math.abs(g.gy - gy) < 1e-9);
    const w = gridToWorld(gx, gy);
    const g2 = worldToGrid(w.x, w.y);
    assert.ok(Math.abs(g2.gx - gx) < 1e-9 && Math.abs(g2.gy - gy) < 1e-9);
  }
});

test('iso：排序正確（家具和角色的前後遮擋）', () => {
  // 家具佔 (2,2) 一格。後面的角色先畫，前面的角色後畫。
  const furn = { id: 'f', depth: furnitureDepth(2, 2, 1, 1) };
  const behind = { id: 'behind', depth: actorDepth(1.5, 2.5) };
  const behind2 = { id: 'behind2', depth: actorDepth(2.5, 1.5) };
  const front = { id: 'front', depth: actorDepth(3.5, 2.5) };
  const front2 = { id: 'front2', depth: actorDepth(2.5, 3.5) };
  const order = sortByDepth([front, furn, behind, front2, behind2]).map((e) => e.id);
  assert.ok(order.indexOf('behind') < order.indexOf('f'));
  assert.ok(order.indexOf('behind2') < order.indexOf('f'));
  assert.ok(order.indexOf('f') < order.indexOf('front'));
  assert.ok(order.indexOf('f') < order.indexOf('front2'));
  // 大型家具：2×2 桌子在 (1,5)。站在它正前方的角色要後畫。
  const table = { id: 't', depth: furnitureDepth(1, 5, 2, 2) };
  const a = { id: 'a', depth: actorDepth(3.5, 6.5) };
  const b = { id: 'b', depth: actorDepth(0.5, 4.5) };
  assert.deepEqual(sortByDepth([a, table, b]).map((e) => e.id), ['b', 't', 'a']);
  // 同鍵維持原順序（穩定）
  assert.deepEqual(sortByDepth([{ id: 1, depth: 1 }, { id: 2, depth: 1 }, { id: 3, depth: 0 }]).map((e) => e.id), [3, 1, 2]);
});

test('iso：地板瓦片順序照 gx + gy 由小到大，且不重不漏', () => {
  const order = tileOrder(5, 3);
  assert.equal(order.length, 15);
  assert.equal(new Set(order.map(([x, y]) => `${x},${y}`)).size, 15);
  for (let i = 1; i < order.length; i++) assert.ok(order[i][0] + order[i][1] >= order[i - 1][0] + order[i - 1][1]);
});

test('iso：面向', () => {
  assert.deepEqual(facingFromDelta(1, 0), { back: false, flip: true });
  assert.deepEqual(facingFromDelta(0, 1), { back: false, flip: false });
  assert.deepEqual(facingFromDelta(-1, 0), { back: true, flip: false });
  assert.deepEqual(facingFromDelta(0, -1), { back: true, flip: true });
  assert.deepEqual(facingFromName('E'), facingFromDelta(1, 0));
  assert.deepEqual(facingFromName('S'), facingFromDelta(0, 1));
  assert.deepEqual(facingFromName('W'), facingFromDelta(-1, 0));
  assert.deepEqual(facingFromName('N'), facingFromDelta(0, -1));
});

test('camera：平移、縮放、範圍限制、座標來回', () => {
  const cam = createCamera({ x: 0, y: 20, w: 320, h: 200 });
  const b = shopWorldBounds(20, 16);
  setBounds(cam, { minX: b.minX, maxX: b.maxX, minY: b.minY - 40, maxY: b.maxY });
  panCamera(cam, -100000, -100000);
  assert.equal(cam.x, b.maxX - 160);
  assert.equal(cam.y, b.maxY - 100);
  panCamera(cam, 100000, 100000);
  assert.equal(cam.x, b.minX + 160);
  // 縮放只有 1 和 2
  zoomCamera(cam, 5, 100, 100);
  assert.equal(cam.zoom, 2);
  zoomCamera(cam, 0.3);
  assert.equal(cam.zoom, 1);
  const s = worldToScreen(cam, 37, -12);
  const w = screenToWorld(cam, s.x, s.y);
  assert.ok(Math.abs(w.x - 37) < 1e-9 && Math.abs(w.y + 12) < 1e-9);
  // 店面比視窗小：置中
  const cam2 = createCamera({ x: 0, y: 0, w: 480, h: 270 });
  setBounds(cam2, { minX: -50, maxX: 50, minY: 0, maxY: 60 });
  panCamera(cam2, 999, 999);
  assert.equal(cam2.x, 0);
  assert.equal(cam2.y, 30);
});
