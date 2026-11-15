// 小鋼珠物理。純邏輯。步長 1/120 秒。
// 彈珠和彈珠之間不碰撞，每顆彈珠獨立計算。
import { PACHINKO as P } from '../../data/balance.js';
import { rngNormal, rngRange } from '../../core/rng.js';

const CELL = 12;
const CONTACT = P.BALL_R + P.NAIL_R;

/** 結果代號：'A'、'B'、'C'、'D' 是入賞口，'S' 是啟動口，'out' 是沒進。 */
export const OUTCOMES = ['A', 'B', 'C', 'D', 'S', 'out'];

const geomCache = new Map();

/**
 * 把檯面資料整理成物理用的形狀（依釘子設定移動「可調整」的釘子）。有快取。
 * 回傳 { nails: [x, y, ...], walls: [x1, y1, x2, y2, ...], pockets, grid, launch, w, h }
 */
export function compileBoard(board, setting) {
  const key = `${board.id}|${setting}`;
  const hit = geomCache.get(key);
  if (hit && hit.src === board) return hit.geom;
  const si = Math.max(0, Math.min(4, setting - 1));
  const nails = [];
  for (const n of board.nails) {
    const dx = n.adj ? n.adj[si] : 0;
    const dy = n.ady ? n.ady[si] : 0;
    nails.push(n.x + dx, n.y + dy);
  }
  const walls = [];
  for (const w of board.walls) walls.push(w.x1, w.y1, w.x2, w.y2);
  const pockets = [];
  for (const pk of board.pockets) {
    const half = (pk.w + (pk.adjW ? pk.adjW[si] : 0)) / 2;
    const depth = pk.depth || 9;
    // 入賞口是一個上面開口的小杯子：兩側和底部是牆
    walls.push(pk.x - half, pk.y, pk.x - half, pk.y + depth);
    walls.push(pk.x + half, pk.y, pk.x + half, pk.y + depth);
    walls.push(pk.x - half, pk.y + depth, pk.x + half, pk.y + depth);
    const plate = pk.plate ? { y: pk.y - pk.plate.up, half: pk.plate.half[si] } : null;
    if (plate) walls.push(pk.x - plate.half, plate.y, pk.x + plate.half, plate.y);
    pockets.push({ kind: pk.kind, x: pk.x, y: pk.y, half, depth, plate });
  }
  const gw = Math.ceil(board.w / CELL);
  const gh = Math.ceil(board.h / CELL);
  const gridN = Array.from({ length: gw * gh }, () => []);
  const gridW = Array.from({ length: gw * gh }, () => []);
  const put = (grid, idx, x0, y0, x1, y1) => {
    const cx0 = Math.max(0, Math.floor(x0 / CELL));
    const cx1 = Math.min(gw - 1, Math.floor(x1 / CELL));
    const cy0 = Math.max(0, Math.floor(y0 / CELL));
    const cy1 = Math.min(gh - 1, Math.floor(y1 / CELL));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) grid[cy * gw + cx].push(idx);
  };
  for (let i = 0; i < nails.length; i += 2) put(gridN, i, nails[i] - CONTACT, nails[i + 1] - CONTACT, nails[i] + CONTACT, nails[i + 1] + CONTACT);
  for (let i = 0; i < walls.length; i += 4) {
    put(gridW, i, Math.min(walls[i], walls[i + 2]) - P.BALL_R, Math.min(walls[i + 1], walls[i + 3]) - P.BALL_R,
      Math.max(walls[i], walls[i + 2]) + P.BALL_R, Math.max(walls[i + 1], walls[i + 3]) + P.BALL_R);
  }
  const geom = { nails, walls, pockets, gridN, gridW, gw, gh, launch: board.launch, w: board.w, h: board.h, outY: board.outY || board.h - 8 };
  geomCache.set(key, { src: board, geom });
  return geom;
}

/**
 * 建立一顆剛射出的彈珠。power 是實際力道（已經加上漂移和機台抖動）。
 * 力道太弱射不上去：回傳的彈珠 done = 'out'（foul = true）。
 */
export function createBall(geom, power) {
  const L = geom.launch;
  const vx = L.vx0 + L.vx1 * power;
  const b = { x: L.x, y: L.y, vx: -vx, vy: L.vy || 0, t: 0, ax: L.x, ay: L.y, at: 0, done: null, foul: false, hits: 0 };
  if (vx <= L.vxMin) { b.done = 'out'; b.foul = true; }
  return b;
}

function collideNails(geom, b) {
  const cell = geom.gridN[Math.floor(b.y / CELL) * geom.gw + Math.floor(b.x / CELL)];
  if (!cell) return;
  const nails = geom.nails;
  for (let k = 0; k < cell.length; k++) {
    const i = cell[k];
    const dx = b.x - nails[i];
    const dy = b.y - nails[i + 1];
    const d2 = dx * dx + dy * dy;
    if (d2 >= CONTACT * CONTACT) continue;
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    b.x = nails[i] + nx * CONTACT;
    b.y = nails[i + 1] + ny * CONTACT;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + P.E_NAIL) * vn * nx;
      b.vy -= (1 + P.E_NAIL) * vn * ny;
      b.hits++;
      b.hitSpeed = -vn;
    }
  }
}

function collideWalls(geom, b) {
  const cell = geom.gridW[Math.floor(b.y / CELL) * geom.gw + Math.floor(b.x / CELL)];
  if (!cell) return;
  const walls = geom.walls;
  for (let k = 0; k < cell.length; k++) {
    const i = cell[k];
    const x1 = walls[i];
    const y1 = walls[i + 1];
    const ex = walls[i + 2] - x1;
    const ey = walls[i + 3] - y1;
    const len2 = ex * ex + ey * ey || 1;
    let t = ((b.x - x1) * ex + (b.y - y1) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = b.x - (x1 + ex * t);
    const dy = b.y - (y1 + ey * t);
    const d2 = dx * dx + dy * dy;
    if (d2 >= P.BALL_R * P.BALL_R) continue;
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    b.x += nx * (P.BALL_R - d);
    b.y += ny * (P.BALL_R - d);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + P.E_WALL) * vn * nx;
      b.vy -= (1 + P.E_WALL) * vn * ny;
    }
  }
}

function checkPockets(geom, b) {
  for (const pk of geom.pockets) {
    if (b.y > pk.y + 3 && b.y < pk.y + pk.depth && Math.abs(b.x - pk.x) < pk.half) return pk.kind;
  }
  return null;
}

/**
 * 讓一顆彈珠前進一個步長（1/120 秒）。結束時 b.done 會是結果代號。
 * rng 只在輕推卡住的彈珠時用到。
 */
export function stepBall(geom, b, rng) {
  if (b.done) return b.done;
  const speed = Math.hypot(b.vx, b.vy);
  const n = Math.max(1, Math.ceil((speed * P.DT) / P.SUBSTEP_PX));
  const h = P.DT / n;
  for (let s = 0; s < n; s++) {
    b.vy += P.GRAVITY * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    // 解兩輪：彈珠夾在釘子和牆中間時，第一輪推開後可能又壓到另一個
    collideNails(geom, b);
    collideWalls(geom, b);
    collideNails(geom, b);
    collideWalls(geom, b);
    collideNails(geom, b);
    // 檯面外框（保險：不讓彈珠跑到外面）
    if (b.x < P.BALL_R) { b.x = P.BALL_R; if (b.vx < 0) b.vx = -b.vx * P.E_WALL; }
    if (b.x > geom.w - P.BALL_R) { b.x = geom.w - P.BALL_R; if (b.vx > 0) b.vx = -b.vx * P.E_WALL; }
    if (b.y < P.BALL_R) { b.y = P.BALL_R; if (b.vy < 0) b.vy = -b.vy * P.E_WALL; }
    const hit = checkPockets(geom, b);
    if (hit) { b.done = hit; return hit; }
    if (b.y > geom.outY) { b.done = 'out'; return 'out'; }
  }
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > P.MAX_SPEED) { b.vx *= P.MAX_SPEED / sp; b.vy *= P.MAX_SPEED / sp; }
  b.t += P.DT;
  // 卡住的彈珠：偵測並輕推
  if (Math.abs(b.x - b.ax) + Math.abs(b.y - b.ay) > P.STUCK_DIST) {
    b.ax = b.x; b.ay = b.y; b.at = b.t;
  } else if (b.t - b.at > P.STUCK_T) {
    b.vx = rngRange(rng, -70, 70);
    b.vy = -rngRange(rng, 30, 80);
    b.ax = b.x; b.ay = b.y; b.at = b.t;
  }
  if (b.t >= P.MAX_T - 0.5) { b.done = 'out'; return 'out'; }
  return null;
}

/** 這顆彈珠的實際力道 = 給定的力道 + 機台抖動。 */
export function jitterPower(power, rng) {
  return power + rngNormal(rng, 0, P.JITTER_SD);
}

/**
 * 模擬一顆彈珠到結束。
 * power 是旋鈕值加上漂移；機台抖動在這裡加。回傳結果代號。
 */
export function simulateBall(board, nailSetting, power, rng) {
  const geom = compileBoard(board, nailSetting);
  const b = createBall(geom, jitterPower(power, rng));
  while (!b.done) stepBall(geom, b, rng);
  return b.done;
}

/** 測試用：模擬一顆彈珠，回傳完整資訊（結果、花的時間、路徑上離釘子最近的距離）。 */
export function traceBall(board, nailSetting, power, rng) {
  const geom = compileBoard(board, nailSetting);
  const b = createBall(geom, jitterPower(power, rng));
  let minNail = Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  while (!b.done) {
    stepBall(geom, b, rng);
    minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); minY = Math.min(minY, b.y);
    for (let i = 0; i < geom.nails.length; i += 2) {
      const d = Math.hypot(b.x - geom.nails[i], b.y - geom.nails[i + 1]);
      if (d < minNail) minNail = d;
    }
  }
  return { result: b.done, t: b.t, minNail, minX, maxX, minY, foul: b.foul };
}
