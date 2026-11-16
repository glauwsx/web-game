// 小鋼珠物理。單位是公釐：盤面 400×400，鋼珠直徑 11。步長 1/120 秒。
// 鋼珠和鋼珠之間不碰撞。
//
// 盤面（board）的形狀：
//   外軌：圓（cx, cy, R）。鋼珠沿著外軌內側跑。
//   發射軌道：外軌和內軌（半徑 R − LANE_W）之間，角度 LANE_A0 到 LANE_A1（左側）。
//   nails 釘子、walls 牆、gates 會開關的牆、bumpers 風車、sensors 感應區、stages 舞台。
import { rr, normal } from './rng.js';

export const PH = {
  DT: 1 / 120,
  G: 2600,            // 重力（比真機慢，看得清楚）
  BALL_R: 5.5,
  NAIL_R: 1.3,
  E_NAIL: 0.45,
  E_WALL: 0.35,
  E_RAIL: 0.15,
  SUB: 2.5,           // 一個子步最多移動幾公釐
  MAX_T: 30,
  LANE_W: 15,
  LANE_A0: 140,       // 發射軌道下端的角度（度，x 軸往右、y 軸往下）
  LANE_A1: 215,       // 發射軌道上端（開口）
  V0: 1000, V1: 600,  // 發射速度 = V0 + V1 × 力道
  JITTER: 0.008,      // 力道的抖動（標準差）
  CELL: 16,
};

const D2R = Math.PI / 180;
const CONTACT = PH.BALL_R + PH.NAIL_R;

/** 把盤面整理成物理用的資料（建格子）。 */
export function compile(board) {
  const gw = Math.ceil(board.W / PH.CELL);
  const gh = Math.ceil(board.H / PH.CELL) + 1;
  const gN = Array.from({ length: gw * gh }, () => []);
  const gW = Array.from({ length: gw * gh }, () => []);
  const gB = Array.from({ length: gw * gh }, () => []);
  const put = (g, i, x0, y0, x1, y1) => {
    const a0 = Math.max(0, Math.floor(x0 / PH.CELL)), a1 = Math.min(gw - 1, Math.floor(x1 / PH.CELL));
    const b0 = Math.max(0, Math.floor(y0 / PH.CELL)), b1 = Math.min(gh - 1, Math.floor(y1 / PH.CELL));
    for (let y = b0; y <= b1; y++) for (let x = a0; x <= a1; x++) g[y * gw + x].push(i);
  };
  board.nails.forEach((n, i) => put(gN, i, n.x - CONTACT, n.y - CONTACT, n.x + CONTACT, n.y + CONTACT));
  board.walls.forEach((w, i) => put(gW, i, Math.min(w.x1, w.x2) - PH.BALL_R, Math.min(w.y1, w.y2) - PH.BALL_R,
    Math.max(w.x1, w.x2) + PH.BALL_R, Math.max(w.y1, w.y2) + PH.BALL_R));
  board.bumpers.forEach((p, i) => put(gB, i, p.x - p.r - PH.BALL_R, p.y - p.r - PH.BALL_R, p.x + p.r + PH.BALL_R, p.y + p.r + PH.BALL_R));
  const ri = board.R - PH.LANE_W;
  const a1 = PH.LANE_A1 * D2R;
  // 發射軌道開口的單向閥：已經進盤面的鋼珠不能掉回軌道
  const valve = {
    x1: board.cx + (ri - 1) * Math.cos(a1), y1: board.cy + (ri - 1) * Math.sin(a1),
    x2: board.cx + board.R * Math.cos(a1), y2: board.cy + board.R * Math.sin(a1),
  };
  board.geom = { gw, gh, gN, gW, gB, valve, ri };
  return board;
}

export function createWorld(board, logic, rng) {
  if (!board.geom) compile(board);
  return { board, logic, rng, balls: [], time: 0, nextId: 1, events: [] };
}

/** 射一顆鋼珠。power 0–1。 */
export function launch(w, power) {
  const b = w.board;
  const p = Math.max(0, Math.min(1, power)) + normal(w.rng, PH.JITTER);
  const a = (PH.LANE_A0 + 4) * D2R;
  const rho = b.R - PH.BALL_R;
  const v = PH.V0 + PH.V1 * p;
  const ball = {
    id: w.nextId++, x: b.cx + rho * Math.cos(a), y: b.cy + rho * Math.sin(a),
    vx: -Math.sin(a) * v, vy: Math.cos(a) * v,
    t: 0, free: false, mode: 0, inS: null, ax: 0, ay: 0, at: 0, done: null, stage: null, s: 0, sv: 0, st: 0, hit: 0,
  };
  w.balls.push(ball);
  return ball;
}

let curH = 0;
function hitSeg(b, x1, y1, x2, y2, e, drag) {
  const ex = x2 - x1, ey = y2 - y1;
  const len2 = ex * ex + ey * ey || 1;
  let t = ((b.x - x1) * ex + (b.y - y1) * ey) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = b.x - (x1 + ex * t), dy = b.y - (y1 + ey * t);
  const d2 = dx * dx + dy * dy;
  if (d2 >= PH.BALL_R * PH.BALL_R) return false;
  const d = Math.sqrt(d2) || 1e-4;
  const nx = dx / d, ny = dy / d;
  b.x += nx * (PH.BALL_R - d);
  b.y += ny * (PH.BALL_R - d);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const k = vn > -45 ? 1 : 1 + e;   // 很慢的碰撞不反彈，讓鋼珠可以沿著牆滾
    b.vx -= k * vn * nx;
    b.vy -= k * vn * ny;
  }
  if (drag) { const f = Math.max(0, 1 - drag * curH); b.vx *= f; b.vy *= f; }
  return true;
}

function collide(w, b) {
  const bd = w.board, g = bd.geom;
  // 外軌
  let dx = b.x - bd.cx, dy = b.y - bd.cy;
  const lim = bd.R - PH.BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 > lim * lim) {
    const d = Math.sqrt(d2);
    const nx = -dx / d, ny = -dy / d;
    b.x = bd.cx - nx * lim; b.y = bd.cy - ny * lim;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const k = vn > -60 ? 1 : 1 + PH.E_RAIL;
      b.vx -= k * vn * nx; b.vy -= k * vn * ny;
    }
  }
  const ci = Math.floor(b.y / PH.CELL) * g.gw + Math.floor(b.x / PH.CELL);
  const cn = g.gN[ci];
  if (cn) {
    for (let k = 0; k < cn.length; k++) {
      const n = bd.nails[cn[k]];
      dx = b.x - n.x; dy = b.y - n.y;
      const q = dx * dx + dy * dy;
      if (q >= CONTACT * CONTACT) continue;
      const d = Math.sqrt(q) || 1e-4;
      const nx = dx / d, ny = dy / d;
      b.x = n.x + nx * CONTACT; b.y = n.y + ny * CONTACT;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + PH.E_NAIL) * vn * nx; b.vy -= (1 + PH.E_NAIL) * vn * ny;
        // 一點點隨機偏轉：真的釘子不是完美的圓柱
        const a = rr(w.rng, -0.07, 0.07), c = Math.cos(a), s = Math.sin(a);
        const vx = b.vx * c - b.vy * s; b.vy = b.vx * s + b.vy * c; b.vx = vx;
        if (-vn > 150) b.hit = -vn;
      }
    }
    const cb = g.gB[ci];
    for (let k = 0; k < cb.length; k++) {
      const p = bd.bumpers[cb[k]];
      dx = b.x - p.x; dy = b.y - p.y;
      const rad = p.r + PH.BALL_R;
      const q = dx * dx + dy * dy;
      if (q >= rad * rad) continue;
      const d = Math.sqrt(q) || 1e-4;
      const nx = dx / d, ny = dy / d;
      b.x = p.x + nx * rad; b.y = p.y + ny * rad;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + p.e) * vn * nx; b.vy -= (1 + p.e) * vn * ny;
        if (p.kick) {
          // 風車：葉片把鋼珠往左或往右撥
          const kk = rr(w.rng, -p.kick, p.kick);
          b.vx += -ny * kk; b.vy += nx * kk;
          p.spin = (p.spin || 0) + kk * 0.2;
        }
        if (-vn > 150) b.hit = -vn;
      }
    }
    const cw = g.gW[ci];
    for (let k = 0; k < cw.length; k++) {
      const s = bd.walls[cw[k]];
      hitSeg(b, s.x1, s.y1, s.x2, s.y2, PH.E_WALL, s.drag);
    }
  }
  for (let k = 0; k < bd.gates.length; k++) {
    const s = bd.gates[k];
    if (s.on) hitSeg(b, s.x1, s.y1, s.x2, s.y2, PH.E_WALL);
  }
  if (b.free) hitSeg(b, g.valve.x1, g.valve.y1, g.valve.x2, g.valve.y2, 0.2);
}

function stepStage(w, b) {
  const st = b.stage;
  const ph = (2 * Math.PI * (b.s - st.cx)) / st.L;
  b.sv += -st.k * Math.sin(ph) * PH.DT;
  b.sv *= 1 - st.damp * PH.DT;
  b.s += b.sv * PH.DT;
  if (b.s < st.x0) { b.s = st.x0; b.sv = Math.abs(b.sv) * 0.6; }
  if (b.s > st.x1) { b.s = st.x1; b.sv = -Math.abs(b.sv) * 0.6; }
  b.x = b.s;
  b.y = st.y - st.h * (1 - Math.cos(ph)) / 2 - PH.BALL_R;
  b.st += PH.DT;
  const k = Math.round((b.s - st.cx) / st.L);
  const off = Math.abs(b.s - (st.cx + k * st.L));
  if ((Math.abs(b.sv) < st.vmin && off < 1.5) || b.st > 9) {
    const r = w.logic.onStageExit(st, k, b);
    if (r === 'stay') { b.st = Math.min(b.st, 6); return; }
    if (r === 'take' || !r) { b.done = 'in'; return; }
    b.mode = 0; b.stage = null;
    b.x = r.x; b.y = r.y; b.vx = r.vx; b.vy = r.vy;
    b.ax = b.x; b.ay = b.y; b.at = b.t;
  }
}

/** 把鋼珠放上舞台。 */
export function toStage(b, st, s, v) {
  b.mode = 1; b.stage = st; b.s = s; b.sv = v; b.st = 0;
}

function stepBall(w, b) {
  if (b.mode === 1) { b.t += PH.DT; stepStage(w, b); return; }
  const bd = w.board;
  const sp = Math.hypot(b.vx, b.vy);
  const n = Math.max(1, Math.ceil((sp * PH.DT) / PH.SUB));
  const h = PH.DT / n;
  curH = h;
  for (let i = 0; i < n; i++) {
    b.vy += PH.G * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    collide(w, b);
    collide(w, b);
    // 感應區
    let inside = null;
    for (let k = 0; k < bd.sensors.length; k++) {
      const s = bd.sensors[k];
      if (s.on === false) continue;
      if (b.x >= s.x && b.x <= s.x + s.w && b.y >= s.y && b.y <= s.y + s.h) {
        inside = s;
        if (b.inS !== s.id) {
          b.inS = s.id;
          const r = w.logic.onSensor(s, b);
          if (r === 'take') { b.done = 'in'; return; }
          if (b.mode === 1) return;
        }
        break;
      }
    }
    if (!inside) b.inS = null;
    if (b.y > bd.outY && Math.abs(b.x - bd.cx) < 15) { b.done = 'out'; return; }
  }
  b.t += PH.DT;
  if (!b.free) {
    const dx = b.x - bd.cx, dy = b.y - bd.cy;
    let a = Math.atan2(dy, dx) / D2R;
    if (a < 0) a += 360;
    const rho = Math.hypot(dx, dy);
    if (a > PH.LANE_A1 + 4 || a < 90 || rho < bd.geom.ri - 8) b.free = true;
    else if (b.t > 0.15 && dx * b.vy - dy * b.vx < 0) { b.done = 'foul'; return; }
  }
  // 卡住：輕推一下
  if (Math.abs(b.x - b.ax) + Math.abs(b.y - b.ay) > 3) { b.ax = b.x; b.ay = b.y; b.at = b.t; }
  else if (b.t - b.at > 0.7) {
    b.vx += rr(w.rng, -90, 90); b.vy -= rr(w.rng, 40, 110);
    b.at = b.t; b.nudged = (b.nudged || 0) + 1;
  }
  if (b.t > PH.MAX_T || b.y > bd.cy + bd.R + 5) b.done = 'out';
}

/** 前進一個步長。結束的鋼珠放進 w.events：{ type: 'out' | 'in' | 'foul', ball }。 */
export function stepWorld(w) {
  w.time += PH.DT;
  w.logic.update(PH.DT);
  for (let i = w.balls.length - 1; i >= 0; i--) {
    const b = w.balls[i];
    stepBall(w, b);
    if (b.done) {
      w.balls.splice(i, 1);
      w.events.push({ type: b.done, ball: b });
    }
  }
}
