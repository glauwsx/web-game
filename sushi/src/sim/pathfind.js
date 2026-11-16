// 格子尋路與店面格局資訊。純邏輯。
import { FURNITURE } from '../data/furniture.js';

/** 兩個格子的鍵。 */
const key = (x, y, w) => y * w + x;

// ---- 樓層（無限模式） ----
// 每層樓放在同一張大格子的不同區段：第 k 層（0 = 一樓）的格子 x 座標是「樓層內的 x + k × FLOOR_STRIDE」。
// 區段之間的空格擋住不能走。樓梯把相鄰兩層的兩個格子連起來。這樣尋路、顧客、員工都不用知道樓層。
export const FLOOR_STRIDE = 24;

export function floorCount(shop) {
  return shop.floors ? shop.floors.length : 1;
}

/** 格子的 x 座標在第幾層。 */
export function floorOfX(x) {
  return Math.floor(x / FLOOR_STRIDE);
}

/** 樓層內的 x 座標。 */
export function localX(x) {
  return x - floorOfX(x) * FLOOR_STRIDE;
}

/** 整張大格子的寬度。 */
export function totalWidth(shop) {
  return (floorCount(shop) - 1) * FLOOR_STRIDE + shop.w;
}

/** 這一格在不在店裡（某一層樓的地板上）。 */
export function insideShop(shop, x, y) {
  if (x < 0 || y < 0 || y >= shop.h) return false;
  return floorOfX(x) < floorCount(shop) && localX(x) < shop.w;
}

/** 樓梯的位置：每層樓左前角的兩格。左邊那格往上，右邊那格往下。 */
export function stairCell(shop, floor, up) {
  return [floor * FLOOR_STRIDE + (up ? 0 : 1), shop.h - 1];
}

/** 樓梯連起來的格子對：[[下層往上的格子], [上層往下的格子]]。 */
export function stairLinks(shop) {
  const out = [];
  for (let k = 0; k + 1 < floorCount(shop); k++) out.push([stairCell(shop, k, true), stairCell(shop, k + 1, false)]);
  return out;
}

/**
 * 廣度優先搜尋最短路。
 * blocked 是長度 w*h 的陣列（1 = 擋住）。from、to 是 [x, y]。
 * 回傳從 from 的下一格到 to 的格子清單；from 等於 to 回傳 []；走不到回傳 null。
 */
export function findPath(blocked, w, h, from, to, links = null) {
  const [fx, fy] = from;
  const [tx, ty] = to;
  if (fx < 0 || fy < 0 || fx >= w || fy >= h || tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
  if (blocked[key(tx, ty, w)]) return null;
  if (fx === tx && fy === ty) return [];
  const prev = new Int32Array(w * h).fill(-1);
  const start = key(fx, fy, w);
  const goal = key(tx, ty, w);
  const queue = [start];
  prev[start] = start;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === goal) break;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    // 鄰居的順序固定，結果才會是決定性的
    const nb = [[cx + 1, cy], [cx, cy + 1], [cx - 1, cy], [cx, cy - 1]];
    if (links && links[cur] !== undefined) nb.push([links[cur] % w, Math.floor(links[cur] / w)]);
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = key(nx, ny, w);
      if (prev[nk] !== -1 || blocked[nk]) continue;
      prev[nk] = cur;
      queue.push(nk);
    }
  }
  if (prev[goal] === -1) return null;
  const out = [];
  for (let cur = goal; cur !== start; cur = prev[cur]) out.push([cur % w, (cur - (cur % w)) / w]);
  return out.reverse();
}

/** 從 start 出發能走到的所有格子。回傳長度 w*h 的陣列（−1 = 走不到，其他 = 步數）。 */
export function floodFill(blocked, w, h, start, links = null) {
  const dist = new Array(w * h).fill(-1);
  const [sx, sy] = start;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || blocked[key(sx, sy, w)]) return dist;
  const queue = [key(sx, sy, w)];
  dist[queue[0]] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const nb = [[cx + 1, cy], [cx, cy + 1], [cx - 1, cy], [cx, cy - 1]];
    if (links && links[cur] !== undefined) nb.push([links[cur] % w, Math.floor(links[cur] / w)]);
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = key(nx, ny, w);
      if (dist[nk] !== -1 || blocked[nk]) continue;
      dist[nk] = dist[cur] + 1;
      queue.push(nk);
    }
  }
  return dist;
}

/** 家具的佔地格子。 */
export function footprintCells(f) {
  const def = FURNITURE[f.type];
  const out = [];
  for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) out.push([f.x + i, f.y + j]);
  return out;
}

/** 家具保留的格子（不能擺別的家具）。 */
export function reserveCells(f) {
  const def = FURNITURE[f.type];
  return (def.reserve || []).map(([dx, dy]) => [f.x + dx, f.y + dy]);
}

/**
 * 算出店面的格局資訊。
 * shop = { w, h, door: { gx }, furniture: [{ id, type, x, y }] }
 * 回傳 { w, h, blocked, dist, door: [x, y], access }。
 * access['家具id:位置編號'] = 可以用的進出格 [x, y]，或 null（走不到）。
 */
export function computeLayout(shop) {
  const w = totalWidth(shop);
  const h = shop.h;
  const blocked = new Array(w * h).fill(0);
  if (floorCount(shop) > 1) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!insideShop(shop, x, y)) blocked[key(x, y, w)] = 1;
  }
  for (const f of shop.furniture) {
    if (FURNITURE[f.type].walk) continue; // 樓梯可以踩
    for (const [x, y] of footprintCells(f)) {
      if (x >= 0 && y >= 0 && x < w && y < h) blocked[key(x, y, w)] = 1;
    }
  }
  let links = null;
  for (const [a, b] of stairLinks(shop)) {
    if (!links) links = {};
    links[key(a[0], a[1], w)] = key(b[0], b[1], w);
    links[key(b[0], b[1], w)] = key(a[0], a[1], w);
  }
  const door = [shop.door.gx, h - 1];
  const dist = floodFill(blocked, w, h, door, links);
  const access = {};
  for (const f of shop.furniture) {
    const def = FURNITURE[f.type];
    def.slots.forEach((slot, i) => {
      let best = null;
      for (const [dx, dy] of slot.access) {
        const x = f.x + dx;
        const y = f.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (dist[key(x, y, w)] < 0) continue;
        best = [x, y];
        break;
      }
      access[`${f.id}:${i}`] = best;
    });
  }
  return { w, h, blocked, dist, door, access, links };
}

// 格局資訊的快取。鍵是 shop 物件本身；shop.ver 改變時重算。
const layoutCache = new WeakMap();

/** 取得店面格局資訊（有快取）。改動家具之後要把 shop.ver 加 1。 */
export function getLayout(shop) {
  const hit = layoutCache.get(shop);
  if (hit && hit.ver === shop.ver) return hit.layout;
  const layout = computeLayout(shop);
  layoutCache.set(shop, { ver: shop.ver, layout });
  return layout;
}

/** 在店內從格子 a 走到格子 b 的路徑（格子中心的座標清單）。走不到回傳 null。 */
export function pathBetween(layout, a, b) {
  const cells = findPath(layout.blocked, layout.w, layout.h, a, b, layout.links);
  if (!cells) return null;
  return cells.map(([x, y]) => [x + 0.5, y + 0.5]);
}

/**
 * 檢查一件家具能不能擺在指定位置。
 * 回傳 { ok: true } 或 { ok: false, reason }。
 * reason：'outside'（超出店面）、'overlap'（重疊）、'door'（擋住入口）、'unreachable'（有位置走不到）。
 * ignoreId：移動家具時，忽略它自己。
 */
export function canPlace(shop, type, x, y, ignoreId = null) {
  const def = FURNITURE[type];
  if (!def) return { ok: false, reason: 'unknown' };
  const others = shop.furniture.filter((f) => f.id !== ignoreId);
  const cand = { id: -1, type, x, y };
  const mine = footprintCells(cand);
  const myReserve = reserveCells(cand);
  for (const [cx, cy] of mine.concat(myReserve)) {
    if (!insideShop(shop, cx, cy)) return { ok: false, reason: 'outside' };
  }
  const occupied = new Set();
  const reserved = new Set();
  for (const f of others) {
    for (const [cx, cy] of footprintCells(f)) occupied.add(`${cx},${cy}`);
    for (const [cx, cy] of reserveCells(f)) reserved.add(`${cx},${cy}`);
  }
  for (const [cx, cy] of mine) {
    if (occupied.has(`${cx},${cy}`) || reserved.has(`${cx},${cy}`)) return { ok: false, reason: 'overlap' };
    if (cx === shop.door.gx && cy === shop.h - 1) return { ok: false, reason: 'door' };
  }
  for (const [cx, cy] of myReserve) {
    if (occupied.has(`${cx},${cy}`)) return { ok: false, reason: 'overlap' };
    if (cx === shop.door.gx && cy === shop.h - 1) return { ok: false, reason: 'door' };
  }
  // 擺完之後，所有使用位置都要走得到
  const trial = { ...shop, furniture: others.concat([cand]) };
  const layout = computeLayout(trial);
  for (const f of trial.furniture) {
    const slots = FURNITURE[f.type].slots;
    for (let i = 0; i < slots.length; i++) {
      if (!layout.access[`${f.id}:${i}`]) return { ok: false, reason: 'unreachable' };
    }
  }
  return { ok: true };
}

/** 檢查整間店的格局是否合法（關卡資料檢查用）。回傳問題清單，空陣列代表沒問題。 */
export function validateShop(shop) {
  const problems = [];
  const seen = new Map();
  for (const f of shop.furniture) {
    const def = FURNITURE[f.type];
    if (!def) { problems.push(`unknown:${f.type}`); continue; }
    for (const [x, y] of footprintCells(f)) {
      if (x < 0 || y < 0 || x >= shop.w || y >= shop.h) problems.push(`outside:${f.type}@${f.x},${f.y}`);
      const k = `${x},${y}`;
      if (seen.has(k)) problems.push(`overlap:${f.type}@${f.x},${f.y}`);
      seen.set(k, f.id);
      if (x === shop.door.gx && y === shop.h - 1) problems.push(`door:${f.type}@${f.x},${f.y}`);
    }
  }
  for (const f of shop.furniture) {
    for (const [x, y] of reserveCells(f)) {
      if (x < 0 || y < 0 || x >= shop.w || y >= shop.h) problems.push(`reserve-outside:${f.type}@${f.x},${f.y}`);
      else if (seen.has(`${x},${y}`)) problems.push(`reserve-overlap:${f.type}@${f.x},${f.y}`);
    }
  }
  if (problems.length) return problems;
  const layout = computeLayout(shop);
  for (const f of shop.furniture) {
    FURNITURE[f.type].slots.forEach((slot, i) => {
      if (!layout.access[`${f.id}:${i}`]) problems.push(`unreachable:${f.type}@${f.x},${f.y}#${i}`);
    });
  }
  return problems;
}

/** 兩個矩形佔地之間的曼哈頓距離（格）。相鄰是 1。 */
export function rectDistance(ax, ay, aw, ah, bx, by, bw, bh) {
  const dx = Math.max(0, ax - (bx + bw - 1), bx - (ax + aw - 1));
  const dy = Math.max(0, ay - (by + bh - 1), by - (ay + ah - 1));
  return dx + dy;
}

/**
 * 讓角色沿著 path（座標清單）前進 speed 格。走完回傳 true。
 * 會更新 a.gx、a.gy 和最後的移動方向 a.fx、a.fy。
 */
export function advance(a, speed) {
  let left = speed;
  while (left > 0 && a.path.length) {
    const tx = a.path[0][0];
    const ty = a.path[0][1];
    const dx = tx - a.gx;
    const dy = ty - a.gy;
    const d = Math.hypot(dx, dy);
    // 走樓梯：下一個點在另一層樓，直接換過去
    if (Math.abs(dx) > FLOOR_STRIDE - 2) {
      a.gx = tx; a.gy = ty;
      a.path.shift();
      continue;
    }
    if (d > 1e-9) { a.fx = dx; a.fy = dy; }
    if (d <= left) {
      a.gx = tx; a.gy = ty;
      left -= d;
      a.path.shift();
    } else {
      a.gx += (dx / d) * left;
      a.gy += (dy / d) * left;
      left = 0;
    }
  }
  return a.path.length === 0;
}

/** 座標所在的格子。 */
export function cellOf(gx, gy, layout) {
  const x = Math.max(0, Math.min(layout.w - 1, Math.floor(gx)));
  const y = Math.max(0, Math.min(layout.h - 1, Math.floor(gy)));
  return [x, y];
}
