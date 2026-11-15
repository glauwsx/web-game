// 小鋼珠的繪圖。檯面 200×300 縮小到 0.88 倍，放在 480×270 畫布的中間。
// 文字（獎品表、剩餘彈珠、滾輪）用 DOM 顯示，這裡只畫檯面、彈珠、力道刻度。

export const K = 0.88;            // 檯面縮放
export const OX = 152;            // 檯面左上角在畫布上的位置
export const OY = 3;
export const GATE_X = 95;         // 天釘正中間（落點回饋用）
export const GATE_Y = 62;
export const RAIL_X = 190;        // 發射軌道（純動畫）

const POCKET_COLOR = { A: '#e2a93b', B: '#b5402f', C: '#2f4270', D: '#5d8c3c', S: '#c86fd0' };

const boardCache = new Map();

/** 把檯面的靜態部分（外框、釘子、牆、入賞口）先畫在一張畫布上。依釘子設定快取。 */
function boardCanvas(geom, key) {
  let c = boardCache.get(key);
  if (c && c.geom === geom) return c.canvas;
  const W = Math.round(geom.w * K);
  const H = Math.round(geom.h * K);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // 外框：木頭
  ctx.fillStyle = '#4a2f1c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7a4f2e';
  ctx.fillRect(2, 2, W - 4, H - 4);
  // 盤面：淺藍色的玻璃後面
  const x0 = Math.round(8 * K);
  const x1 = Math.round(182 * K);
  ctx.fillStyle = '#20345a';
  ctx.fillRect(x0, x0, x1 - x0, H - 2 * x0);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(120, 170, 220, 0.28)');
  grad.addColorStop(1, 'rgba(40, 70, 120, 0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(x0, x0, x1 - x0, H - 2 * x0);
  // 中央通道的底色
  ctx.fillStyle = 'rgba(226, 169, 59, 0.12)';
  ctx.fillRect(Math.round(81 * K), Math.round(70 * K), Math.round(28 * K), Math.round(136 * K));
  // 發射軌道
  ctx.fillStyle = '#2b1d12';
  ctx.fillRect(Math.round(184 * K), Math.round(10 * K), Math.round(12 * K), H - Math.round(14 * K));
  ctx.fillStyle = '#9a9aa8';
  ctx.fillRect(Math.round(RAIL_X * K) - 1, Math.round(12 * K), 1, H - Math.round(18 * K));
  ctx.fillRect(Math.round(RAIL_X * K) + 3, Math.round(12 * K), 1, H - Math.round(18 * K));
  // 入賞口：杯子
  for (const pk of geom.pockets) {
    const px = pk.x * K;
    const py = pk.y * K;
    const hw = pk.half * K;
    ctx.fillStyle = POCKET_COLOR[pk.kind];
    ctx.fillRect(Math.round(px - hw), Math.round(py), Math.round(hw * 2), Math.round(pk.depth * K));
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(Math.round(px - hw), Math.round(py), Math.round(hw * 2), 1);
    ctx.fillStyle = '#fff3d6';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'S' ? '★' : pk.kind, Math.round(px), Math.round(py + pk.depth * K - 1));
  }
  // 牆
  ctx.strokeStyle = '#d8c69a';
  ctx.lineWidth = 1;
  const wl = geom.walls;
  for (let i = 0; i < wl.length; i += 4) {
    ctx.beginPath();
    ctx.moveTo(wl[i] * K + 0.5, wl[i + 1] * K + 0.5);
    ctx.lineTo(wl[i + 2] * K + 0.5, wl[i + 3] * K + 0.5);
    ctx.stroke();
  }
  // 釘子：金色的點
  const n = geom.nails;
  for (let i = 0; i < n.length; i += 2) {
    const x = Math.round(n[i] * K) - 1;
    const y = Math.round(n[i + 1] * K) - 1;
    ctx.fillStyle = '#7a5a1c';
    ctx.fillRect(x, y + 1, 2, 1);
    ctx.fillStyle = '#ffd98a';
    ctx.fillRect(x, y, 2, 1);
  }
  // 天釘正中間的記號
  ctx.fillStyle = 'rgba(255, 243, 160, 0.6)';
  ctx.fillRect(Math.round(GATE_X * K), Math.round(50 * K), 1, 4);
  c = { geom, canvas };
  boardCache.set(key, c);
  return canvas;
}

/** 畫一顆彈珠（銀色）。x、y 是檯面座標。 */
function ball(ctx, x, y) {
  const sx = Math.round(OX + x * K);
  const sy = Math.round(OY + y * K);
  ctx.fillStyle = '#5c6070';
  ctx.fillRect(sx - 2, sy - 1, 5, 3);
  ctx.fillRect(sx - 1, sy - 2, 3, 5);
  ctx.fillStyle = '#d9dde8';
  ctx.fillRect(sx - 1, sy - 1, 3, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx - 1, sy - 1, 1, 1);
}

/**
 * 畫力道刻度。rect 是畫布上的區域 { x, y, w, h }。
 * power 是旋鈕值。上半是整體刻度（0.40 到 0.62），下半是放大刻度（旋鈕值 ±0.03，每格 0.005）。
 * 刻度只顯示旋鈕值，不顯示漂移：玩家要看落點自己修正。
 */
function gauge(ctx, rect, power) {
  const { x, y, w, h } = rect;
  if (!(w > 20 && h > 20)) return;
  ctx.fillStyle = 'rgba(23, 17, 12, 0.85)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#b98552';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const pad = 6;
  // 整體刻度
  const lo = 0.40;
  const hi = 0.62;
  const by = y + Math.round(h * 0.28);
  const bx0 = x + pad;
  const bw = w - pad * 2;
  const px = (v) => bx0 + ((v - lo) / (hi - lo)) * bw;
  ctx.fillStyle = '#4a2f1c';
  ctx.fillRect(bx0, by - 2, bw, 4);
  // 太弱、太強的區域
  ctx.fillStyle = '#5c6070';
  ctx.fillRect(bx0, by - 2, Math.max(0, px(0.42) - bx0), 4);
  ctx.fillRect(px(0.59), by - 2, bx0 + bw - px(0.59), 4);
  const kx = Math.round(Math.max(bx0, Math.min(bx0 + bw, px(power))));
  ctx.fillStyle = '#fff3a0';
  ctx.fillRect(kx - 1, by - 5, 3, 10);
  // 放大刻度
  const zy = y + Math.round(h * 0.72);
  const span = 0.03;
  const zx = (v) => x + w / 2 + ((v - power) / span) * (w / 2 - pad);
  ctx.fillStyle = '#2b1d12';
  ctx.fillRect(x + pad, zy - 1, w - pad * 2, 2);
  const first = Math.ceil((power - span) / 0.005) * 0.005;
  for (let v = first; v <= power + span + 1e-9; v += 0.005) {
    const tx = Math.round(zx(v));
    const major = Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
    ctx.fillStyle = major ? '#f6ecd4' : '#b98552';
    ctx.fillRect(tx, zy - (major ? 6 : 3), 1, major ? 12 : 6);
  }
  // 旋鈕：正中間的紅線
  ctx.fillStyle = '#ff6a50';
  ctx.fillRect(Math.round(x + w / 2), zy - 8, 1, 16);
}

/**
 * 畫一個畫面。
 * g = { geom, boardId, setting, balls: [彈珠], rail: [{ y }], land: [{ x, age }], power, gaugeRect, flash }
 */
export function drawPachinko(ctx, W, H, g, time) {
  // 背景：店裡的牆
  ctx.fillStyle = '#2b1d12';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a2416';
  for (let x = 0; x < W; x += 24) ctx.fillRect(x, 0, 12, H);
  ctx.drawImage(boardCanvas(g.geom, `${g.geom.w}|${g.setting}|${g.boardId}`), OX, OY);
  // 落點回饋：最近幾顆在天釘高度的水平位置
  for (const l of g.land) {
    const a = Math.max(0, 1 - l.age / 4);
    if (a <= 0) continue;
    ctx.fillStyle = `rgba(127, 211, 255, ${a.toFixed(2)})`;
    const lx = Math.round(OX + l.x * K);
    ctx.fillRect(lx - 1, Math.round(OY + (GATE_Y - 16) * K), 3, 3);
  }
  // 發射軌道上的彈珠
  for (const r of g.rail) ball(ctx, RAIL_X, r.y);
  for (const b of g.balls) ball(ctx, b.x, b.y);
  // 大獎的閃光
  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255, 230, 120, ${(0.35 * Math.abs(Math.sin(time / 90)) * Math.min(1, g.flash)).toFixed(2)})`;
    ctx.fillRect(OX, OY, Math.round(200 * K), Math.round(300 * K));
  }
  if (g.gaugeRect) gauge(ctx, g.gaugeRect, g.power);
}
