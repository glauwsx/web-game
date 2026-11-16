// 盤面的積木：釘子、牆、入賞口、鬱金香、風車。座標單位是公釐，盤面 400×400。
import { PH } from '../physics.js';

const D2R = Math.PI / 180;

export function mkBoard() {
  return {
    W: 400, H: 400, cx: 200, cy: 200, R: 192, outY: 380,
    nails: [], walls: [], gates: [], bumpers: [], sensors: [], stages: [],
    pockets: [], tulips: [], labels: [], keep: [], deco: [], art: {},
  };
}

export function nail(b, x, y, tag) { b.nails.push({ x, y, tag }); }

/** 一排釘子，共 n 根（含兩端）。 */
export function row(b, x1, y1, x2, y2, n, tag) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    nail(b, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, tag);
  }
}

/** 左右對稱的一對釘子。 */
export function pair(b, dx, y, tag) { nail(b, b.cx - dx, y, tag); nail(b, b.cx + dx, y, tag); }

export function wall(b, x1, y1, x2, y2, look) { b.walls.push({ x1, y1, x2, y2, look }); }

export function poly(b, pts, closed, look) {
  for (let i = 0; i < pts.length - 1; i++) wall(b, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], look);
  if (closed) wall(b, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], look);
}

/**
 * 道釘：一排很密的釘子，鋼珠在上面滾。物理上當成一條有阻力的斜線，畫面上畫成釘子。
 */
export function michi(b, x1, y1, x2, y2, drag = 2.2) {
  b.walls.push({ x1, y1, x2, y2, look: 'michi', drag });
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.round(len / 9.5) + 1);
  for (let i = 0; i < n; i++) b.deco.push({ x: x1 + ((x2 - x1) * i) / (n - 1), y: y1 + ((y2 - y1) * i) / (n - 1) });
}

export function gate(b, id, x1, y1, x2, y2, on) {
  const g = { id, x1, y1, x2, y2, on: !!on };
  b.gates.push(g);
  return g;
}

export function setGate(b, id, on) { for (const g of b.gates) if (g.id === id) g.on = on; }

export function sensor(b, s) { b.sensors.push({ on: true, ...s }); return b.sensors[b.sensors.length - 1]; }

export function keep(b, x, y, r) { b.keep.push({ x, y, r }); }

/**
 * 入賞口：上面開口的小杯子。(x, y) 是開口中心。
 * o = { id, kind, pay, half, depth, name, color }
 */
export function pocket(b, o) {
  const half = o.half || 7.6, depth = o.depth || 11;
  const { x, y } = o;
  wall(b, x - half, y, x - half, y + depth, 'cup');
  wall(b, x + half, y, x + half, y + depth, 'cup');
  wall(b, x - half, y + depth, x + half, y + depth, 'cup');
  sensor(b, { id: o.id, kind: o.kind || 'pocket', pay: o.pay || 0, n: o.n, x: x - half, y: y + 4, w: half * 2, h: depth - 4 });
  const p = { ...o, half, depth };
  b.pockets.push(p);
  keep(b, x, y + 4, half + 9);
  return p;
}

/** 鬱金香：入賞口加上兩片花瓣。合起來時開口只有一顆鋼珠寬，張開時花瓣接住旁邊的鋼珠。 */
export function tulip(b, o) {
  const p = pocket(b, { ...o, kind: o.kind || 'tulip', half: 7.4 });
  const { x, y } = o;
  const h = 7.4;
  const reach = o.reach || 13;
  gate(b, `${o.id}:c`, x - h, y, x - h, y - 9, true);
  gate(b, `${o.id}:c`, x + h, y, x + h, y - 9, true);
  gate(b, `${o.id}:o`, x - h, y, x - h - reach, y - 10, false);
  gate(b, `${o.id}:o`, x + h, y, x + h + reach, y - 10, false);
  const t = { id: o.id, x, y, reach, open: false, p };
  b.tulips.push(t);
  keep(b, x, y - 6, h + reach + 7);
  return t;
}

export function setTulip(b, id, open) {
  const t = b.tulips.find((q) => q.id === id);
  if (!t || t.open === open) return false;
  t.open = open;
  setGate(b, `${id}:c`, !open);
  setGate(b, `${id}:o`, open);
  return true;
}

/** 風車。 */
export function windmill(b, x, y) {
  b.bumpers.push({ x, y, r: 4.2, e: 0.45, kick: 110, spin: 0, ang: 0, kind: 'mill' });
  keep(b, x, y, 14);
}

/** 橡膠：把鋼珠彈回去。 */
export function rubber(b, x, y, r = 5) {
  b.bumpers.push({ x, y, r, e: 0.5, kick: 0, kind: 'rubber' });
  keep(b, x, y, r + 12);
}

export function label(b, x, y, text, tx, ty) { b.labels.push({ x, y, text, tx: tx ?? x, ty: ty ?? y }); }

function segDist(px, py, w) {
  const ex = w.x2 - w.x1, ey = w.y2 - w.y1;
  const len2 = ex * ex + ey * ey || 1;
  let t = ((px - w.x1) * ex + (py - w.y1) * ey) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (w.x1 + ex * t), py - (w.y1 + ey * t));
}

/** 這個位置能不能放一根「釘林」的釘子（離別的東西夠遠，鋼珠才過得去）。 */
export function clearAt(b, x, y, dn = 15.6, dw = 14.2) {
  const dx = x - b.cx, dy = y - b.cy;
  const rho = Math.hypot(dx, dy);
  if (rho > b.R - 21) return false;                       // 外軌旁邊留一條路
  let a = Math.atan2(dy, dx) / D2R;
  if (a < 0) a += 360;
  if (a > PH.LANE_A0 - 6 && a < PH.LANE_A1 + 3 && rho > b.R - PH.LANE_W - 14) return false; // 內軌旁邊
  for (const n of b.nails) if (Math.hypot(n.x - x, n.y - y) < dn) return false;
  for (const w of b.walls) if (segDist(x, y, w) < dw) return false;
  for (const g of b.gates) if (segDist(x, y, g) < dw) return false;
  for (const p of b.bumpers) if (Math.hypot(p.x - x, p.y - y) < p.r + 13.5) return false;
  for (const k of b.keep) if (Math.hypot(k.x - x, k.y - y) < k.r) return false;
  return true;
}

/** 交錯排列的釘林。inside(x, y) 決定範圍。要在所有手動放的東西之後呼叫。 */
export function field(b, inside, sx, sy, x0 = 10, y0 = 24, tag) {
  let r = 0;
  for (let y = y0; y < 390; y += sy, r++) {
    for (let x = x0 + (r % 2 ? sx / 2 : 0); x < 392; x += sx) {
      if (inside(x, y) && clearAt(b, x, y)) nail(b, Math.round(x * 10) / 10, Math.round(y * 10) / 10, tag);
    }
  }
}

/** 內軌和發射軌道底部的牆。每個盤面都要呼叫。 */
export function rails(b) {
  const ri = b.R - PH.LANE_W;
  const pts = [];
  for (let a = PH.LANE_A0; a <= PH.LANE_A1 + 0.01; a += 3) pts.push([b.cx + ri * Math.cos(a * D2R), b.cy + ri * Math.sin(a * D2R)]);
  poly(b, pts, false, 'rail');
  const a0 = PH.LANE_A0 * D2R;
  wall(b, b.cx + ri * Math.cos(a0), b.cy + ri * Math.sin(a0), b.cx + b.R * Math.cos(a0), b.cy + b.R * Math.sin(a0), 'rail');
}
