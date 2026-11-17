// 數位機（デジパチ）的盤面。純邏輯。座標單位是公釐，盤面 400×400。
// 盤面照日本現在最常見的數位機：
//   左打：天釘 → 左邊的釘林 → 風車 → 道釘 → 命釘 → ヘソ（啟動口）。
//         捷徑是螢幕左邊的ワープ：滾進去的鋼珠到螢幕下面的舞台，從正中間掉下來就進ヘソ。
//   右打：鋼珠沿外軌繞到右邊 → スルー（通過口）→ 電チュー → アタッカー（大入賞口）。
// 釘子設定只改「命釘」（ヘソ正上方兩根釘子）的間距。
import { PACHINKO as P } from '../../data/balance.js';

const PH = P.PH;
const D2R = Math.PI / 180;

function mkBoard() {
  return {
    W: 400, H: 400, cx: 200, cy: 200, R: 192, outY: 380,
    nails: [], walls: [], gates: [], bumpers: [], sensors: [], stages: [],
    pockets: [], labels: [], keep: [], deco: [], art: {},
  };
}

const nail = (b, x, y, tag) => b.nails.push({ x, y, tag });
function row(b, x1, y1, x2, y2, n, tag) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    nail(b, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, tag);
  }
}
const wall = (b, x1, y1, x2, y2, look) => b.walls.push({ x1, y1, x2, y2, look });
function poly(b, pts, closed, look) {
  for (let i = 0; i < pts.length - 1; i++) wall(b, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], look);
  if (closed) wall(b, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], look);
}
/** 道釘：一排很密的釘子，鋼珠在上面滾。物理上當成一條有阻力的斜線，畫面上畫成釘子。 */
function michi(b, x1, y1, x2, y2, drag) {
  b.walls.push({ x1, y1, x2, y2, look: 'michi', drag });
  const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 9.5) + 1);
  for (let i = 0; i < n; i++) b.deco.push({ x: x1 + ((x2 - x1) * i) / (n - 1), y: y1 + ((y2 - y1) * i) / (n - 1) });
}
const gate = (b, id, x1, y1, x2, y2, on) => b.gates.push({ id, x1, y1, x2, y2, on: !!on });
/** 打開或關上一組會動的牆（羽根、電チュー、アタッカー的蓋子）。 */
export function setGate(b, id, on) { for (const g of b.gates) if (g.id === id) g.on = on; }
function sensor(b, s) { b.sensors.push({ on: true, ...s }); return b.sensors[b.sensors.length - 1]; }
const keep = (b, x, y, r) => b.keep.push({ x, y, r });
/** 入賞口：上面開口的小杯子。(x, y) 是開口中心。 */
function pocket(b, o) {
  const half = o.half || 7.6, depth = o.depth || 11;
  const { x, y } = o;
  wall(b, x - half, y, x - half, y + depth, 'cup');
  wall(b, x + half, y, x + half, y + depth, 'cup');
  wall(b, x - half, y + depth, x + half, y + depth, 'cup');
  sensor(b, { id: o.id, kind: o.kind || 'pocket', pay: o.pay || 0, x: x - half, y: y + 4, w: half * 2, h: depth - 4 });
  b.pockets.push({ ...o, half, depth });
  keep(b, x, y + 4, half + 9);
}
function windmill(b, x, y) {
  b.bumpers.push({ x, y, r: 4.2, e: 0.45, kick: 110, spin: 0, ang: 0, kind: 'mill' });
  keep(b, x, y, 14);
}
const label = (b, x, y, text, tx, ty) => b.labels.push({ x, y, text, tx: tx ?? x, ty: ty ?? y });

function segDist(px, py, w) {
  const ex = w.x2 - w.x1, ey = w.y2 - w.y1;
  const len2 = ex * ex + ey * ey || 1;
  let t = ((px - w.x1) * ex + (py - w.y1) * ey) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (w.x1 + ex * t), py - (w.y1 + ey * t));
}
/** 這個位置能不能放一根釘林的釘子（離別的東西夠遠，鋼珠才過得去）。 */
function clearAt(b, x, y) {
  const dx = x - b.cx, dy = y - b.cy;
  const rho = Math.hypot(dx, dy);
  if (rho > b.R - 21) return false;
  let a = Math.atan2(dy, dx) / D2R;
  if (a < 0) a += 360;
  if (a > PH.LANE_A0 - 6 && a < PH.LANE_A1 + 3 && rho > b.R - PH.LANE_W - 14) return false;
  for (const n of b.nails) if (Math.hypot(n.x - x, n.y - y) < 15.6) return false;
  for (const w of b.walls) if (segDist(x, y, w) < 14.2) return false;
  for (const g of b.gates) if (segDist(x, y, g) < 14.2) return false;
  for (const p of b.bumpers) if (Math.hypot(p.x - x, p.y - y) < p.r + 13.5) return false;
  for (const k of b.keep) if (Math.hypot(k.x - x, k.y - y) < k.r) return false;
  return true;
}
function field(b, inside, sx, sy, x0, y0) {
  let r = 0;
  for (let y = y0; y < 390; y += sy, r++) {
    for (let x = x0 + (r % 2 ? sx / 2 : 0); x < 392; x += sx) {
      if (inside(x, y) && clearAt(b, x, y)) nail(b, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    }
  }
}
/** 內軌和發射軌道底部。 */
function rails(b) {
  const ri = b.R - PH.LANE_W;
  const pts = [];
  for (let a = PH.LANE_A0; a <= PH.LANE_A1 + 0.01; a += 3) pts.push([b.cx + ri * Math.cos(a * D2R), b.cy + ri * Math.sin(a * D2R)]);
  poly(b, pts, false, 'rail');
  const a0 = PH.LANE_A0 * D2R;
  wall(b, b.cx + ri * Math.cos(a0), b.cy + ri * Math.sin(a0), b.cx + b.R * Math.cos(a0), b.cy + b.R * Math.sin(a0), 'rail');
}

/**
 * 建立一台機台的盤面。C 是 data/pachinko-boards.js 的設定，setting 是釘子設定 1 到 5。
 * 回傳的盤面有可變的部分（gates 開關、stages），每一局要建新的。
 */
export function buildBoard(C, setting) {
  const si = Math.max(0, Math.min(4, Math.round(setting) - 1));
  const life = C.life[si];
  const b = mkBoard();
  b.id = C.id;
  b.setting = si + 1;
  rails(b);
  // 中央框（螢幕）
  const frame = [[122, 214], [122, 128], [140, 100], [205, 84], [270, 100], [288, 128], [288, 214], [244, 222], [166, 222]];
  poly(b, frame, true, 'frame');
  // ワープ入口：框左邊的小平台
  wall(b, 122 - C.ledge, 181, 122, 175, 'ledge');
  sensor(b, { id: 'warp', kind: 'warp', x: 113.5, y: 158, w: 8.5, h: 14 });
  nail(b, 122 - C.warpGuard, 148, 'warp');
  keep(b, 110, 160, 15);
  b.stages.push({ id: 'stage', x0: 168, x1: 242, y: 220, cx: 205, L: 24, k: 900, damp: 1.1, h: 3, vmin: 14 });
  // ヘソ（啟動口）和命釘
  nail(b, 205 - life, 288, 'life'); nail(b, 205 + life, 288, 'life');
  pocket(b, { id: 'heso', kind: 'heso', x: 205, y: 297, pay: C.payHeso, name: '始', color: '#e7b53c' });
  // 風車上面的袴、風車、道釘
  row(b, 82 - C.hakW, 238 - C.hakW * 1.25, 82, 238, Math.round((C.hakW * 1.6) / 11.6) + 1, 'hakama');
  row(b, 114, 214, 102, 238, 3, 'hakama');
  windmill(b, 92, 252);
  michi(b, 106, 265, C.michiEnd, C.michiY, C.michiDrag);
  michi(b, 410 - C.michiEnd, C.michiY, 266, 277, C.michiDrag);
  // 左下的一般入賞口
  for (const [i, x, y] of [[0, 82, 284], [1, 100, 318], [2, 142, 340]]) {
    nail(b, x - 7.2, y - 8, 'life'); nail(b, x + 7.2, y - 8, 'life');
    pocket(b, { id: `p${i}`, kind: 'pocket', x, y, pay: C.payPocket, name: '', color: '#6a6f8a' });
  }
  // 右打的路：漏斗 → スルー → 電チュー → アタッカー
  wall(b, 288, 214, 288, 324, 'frame');
  row(b, 296, 140, 331, 182, 6, 'funnel'); row(b, 378, 150, 349, 182, 5, 'funnel');
  sensor(b, { id: 'gate', kind: 'gate', x: 332, y: 184, w: 16, h: 6 });
  keep(b, 340, 200, 16);
  wall(b, 332, 240, 332, 251, 'cup'); wall(b, 348, 240, 348, 251, 'cup'); wall(b, 332, 251, 348, 251, 'cup');
  sensor(b, { id: 'denchu', kind: 'denchu', pay: C.payDenchu, x: 332, y: 244, w: 16, h: 7 });
  gate(b, 'den:c', 326, 240, 340, 227, true); gate(b, 'den:c', 340, 227, 354, 240, true);
  gate(b, 'den:o', 332, 240, 312, 222, false); gate(b, 'den:o', 348, 240, 368, 222, false);
  gate(b, 'att', 303, 307, 366, 297, true);
  wall(b, 303, 320, 368, 320, 'cup'); wall(b, 303, 307, 303, 320, 'cup');
  sensor(b, { id: 'att', kind: 'attacker', pay: C.payAtt, x: 304, y: 306, w: 62, h: 12, on: false });
  keep(b, 200, 384, 22);
  field(b, (x, y) => (x < 120 && y > 30 && y < 208) || (y > 28 && y < 80 && x < 300) || (x < 190 && y > 300 && y < 350 && x > 40), 22.5, 19, 14, 36);

  label(b, 150, 44, '天釘', 96, 28);
  label(b, 117, 166, 'ワープ', 60, 150);
  label(b, 228, 221, '舞台', 262, 240);
  label(b, 92, 252, '風車', 44, 248);
  label(b, 140, 276, '道釘', 130, 300);
  label(b, 212, 288, '命釘', 240, 266);
  label(b, 205, 302, 'ヘソ', 232, 318);
  label(b, 340, 187, 'スルー', 316, 122);
  label(b, 340, 246, '電チュー', 350, 270);
  label(b, 334, 304, 'アタッカー', 250, 340);
  label(b, 200, 388, '出口', 150, 376);
  b.art = { theme: C.theme, frame, lcd: { x: 132, y: 104, w: 146, h: 104 } };
  return b;
}
