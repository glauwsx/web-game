import test from 'node:test';
import assert from 'node:assert/strict';
import { findPath, floodFill, computeLayout, canPlace, validateShop, rectDistance, advance } from '../../src/sim/pathfind.js';

function gridFrom(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const blocked = [];
  for (const r of rows) for (const ch of r) blocked.push(ch === '#' ? 1 : 0);
  return { blocked, w, h };
}

test('pathfind：找得到最短路', () => {
  const g = gridFrom([
    '.....',
    '.###.',
    '.....',
  ]);
  const p = findPath(g.blocked, g.w, g.h, [0, 0], [4, 2]);
  assert.equal(p.length, 6); // 曼哈頓距離 6，沒有更短的
  assert.deepEqual(p[p.length - 1], [4, 2]);
  // 每一步都相鄰，而且不踩到障礙
  let prev = [0, 0];
  for (const c of p) {
    assert.equal(Math.abs(c[0] - prev[0]) + Math.abs(c[1] - prev[1]), 1);
    assert.equal(g.blocked[c[1] * g.w + c[0]], 0);
    prev = c;
  }
  // 要繞路的情況
  const g2 = gridFrom([
    '..#..',
    '..#..',
    '.....',
  ]);
  assert.equal(findPath(g2.blocked, g2.w, g2.h, [0, 0], [4, 0]).length, 8);
  assert.deepEqual(findPath(g2.blocked, g2.w, g2.h, [1, 1], [1, 1]), []);
});

test('pathfind：被擋住時回報找不到', () => {
  const g = gridFrom([
    '..#..',
    '..#..',
    '..#..',
  ]);
  assert.equal(findPath(g.blocked, g.w, g.h, [0, 0], [4, 0]), null);
  assert.equal(findPath(g.blocked, g.w, g.h, [0, 0], [2, 1]), null); // 終點本身是障礙
  assert.equal(findPath(g.blocked, g.w, g.h, [0, 0], [9, 9]), null); // 超出範圍
  const d = floodFill(g.blocked, g.w, g.h, [0, 0]);
  assert.equal(d[0], 0);
  assert.equal(d[1 * 5 + 1], 2);
  assert.equal(d[4], -1);
});

test('pathfind：同樣的輸入每次結果相同', () => {
  const g = gridFrom(['......', '.##...', '......', '...##.', '......']);
  const a = JSON.stringify(findPath(g.blocked, g.w, g.h, [0, 0], [5, 4]));
  for (let i = 0; i < 5; i++) assert.equal(JSON.stringify(findPath(g.blocked, g.w, g.h, [0, 0], [5, 4])), a);
});

const shop = (furniture, w = 8, h = 8) => ({ w, h, door: { gx: 3 }, ver: 1, furniture: furniture.map((f, i) => ({ id: i + 1, ...f })) });

test('layout：每個使用位置都算出走得到的進出格', () => {
  const s = shop([
    { type: 'chefStation', x: 2, y: 1 },
    { type: 'counterSeat', x: 2, y: 2 },
    { type: 'tableSet', x: 5, y: 4 },
  ]);
  const L = computeLayout(s);
  assert.deepEqual(L.door, [3, 7]);
  assert.deepEqual(L.access['1:0'], [2, 0]);
  assert.deepEqual(L.access['2:0'], [2, 3]);
  for (let i = 0; i < 4; i++) assert.ok(L.access[`3:${i}`]);
  assert.deepEqual(validateShop(s), []);
});

test('擺放規則：不能超出店面、重疊、擋住入口、把位置封死', () => {
  const s = shop([{ type: 'chefStation', x: 2, y: 1 }, { type: 'counterSeat', x: 2, y: 2 }]);
  assert.deepEqual(canPlace(s, 'plant', 0, 0), { ok: true });
  assert.equal(canPlace(s, 'plant', 8, 0).reason, 'outside');
  assert.equal(canPlace(s, 'fishTank', 7, 0).reason, 'outside');
  assert.equal(canPlace(s, 'plant', 2, 2).reason, 'overlap');
  assert.equal(canPlace(s, 'plant', 2, 0).reason, 'overlap'); // 師傅站的格子要保留
  assert.equal(canPlace(s, 'chefStation', 0, 0).reason, 'outside'); // 後面沒有站的地方
  assert.equal(canPlace(s, 'plant', 3, 7).reason, 'door');
  // 把吧台座四周封死
  const s2 = shop([{ type: 'counterSeat', x: 0, y: 0 }, { type: 'plant', x: 1, y: 0 }]);
  assert.equal(canPlace(s2, 'plant', 0, 1).reason, 'unreachable');
  // 把入口圍起來
  const s3 = shop([{ type: 'counterSeat', x: 0, y: 0 }, { type: 'plant', x: 2, y: 7 }, { type: 'plant', x: 4, y: 7 }]);
  assert.equal(canPlace(s3, 'plant', 3, 6).reason, 'unreachable');
  // 移動自己時忽略自己
  assert.deepEqual(canPlace(s, 'counterSeat', 2, 2, 2), { ok: true });
  // validateShop 抓得到問題
  assert.ok(validateShop(shop([{ type: 'plant', x: 0, y: 0 }, { type: 'plant', x: 0, y: 0 }])).length > 0);
  assert.ok(validateShop(shop([{ type: 'plant', x: 3, y: 7 }])).length > 0);
});

test('rectDistance、advance', () => {
  assert.equal(rectDistance(2, 1, 2, 1, 2, 2, 1, 1), 1);
  assert.equal(rectDistance(2, 1, 2, 1, 4, 2, 1, 1), 2);
  assert.equal(rectDistance(2, 1, 2, 1, 5, 4, 2, 2), 5);
  const a = { gx: 0, gy: 0, path: [[1, 0], [1, 1]] };
  assert.equal(advance(a, 0.6), false);
  assert.ok(Math.abs(a.gx - 0.6) < 1e-9);
  assert.equal(advance(a, 0.6), false);
  assert.ok(Math.abs(a.gx - 1) < 1e-9 && Math.abs(a.gy - 0.2) < 1e-9);
  assert.equal(advance(a, 5), true);
  assert.deepEqual([a.gx, a.gy], [1, 1]);
});
