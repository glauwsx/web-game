// 賽車的偽 3D 繪圖。
// 做法：從鏡頭所在的路段往前取一百多段，把每段投影到螢幕，畫出路面梯形、路肩、分隔線。
// 彎道用累加的水平偏移表現，上下坡用高度投影表現。景物和車子是會隨距離縮放的像素圖。
import { RACE as R } from '../../data/balance.js';
import { TRACKS, SCENERY_X } from '../../data/tracks.js';
import { getSprite } from '../../iso/sprites.js';
import { trackLength, playerCar } from './physics.js';

const ROAD_W = 2000;        // 路面半寬（世界單位）
const CAM_H = 1100;         // 鏡頭高度
const CAM_DEPTH = 0.84;     // 鏡頭到投影面的距離（視角大約 100 度）
const DRAW = 170;           // 往前畫幾段
const SPRITE_SCALE = 48;    // 像素圖 1 像素等於幾個世界單位
const PLAYER_Z = CAM_H * CAM_DEPTH;

// 顏色：路面深淺、路肩紅白、桌面木頭深淺
const COLORS = {
  light: { road: '#5b5262', grass: '#c9995f', rumble: '#f6ecd4', lane: '#f6ecd4' },
  dark: { road: '#544b5b', grass: '#b98552', rumble: '#b5402f', lane: null },
  start: { road: '#f6ecd4', grass: '#c9995f', rumble: '#f6ecd4', lane: null },
};

function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

/** 背景：壽司店的牆、遠方的架子、近處的吧台邊緣。轉彎時水平捲動。 */
function drawBackground(ctx, W, H, horizon, offset, sky) {
  const top = sky === 'hill' ? ['#3d5a80', '#5d7fa6', '#9cc6d8', '#dfe9d0'] : ['#3a2416', '#5a3920', '#8a5a34', '#c9995f'];
  const band = Math.ceil((horizon + 2) / top.length);
  for (let i = 0; i < top.length; i++) { ctx.fillStyle = top[i]; ctx.fillRect(0, i * band, W, band + 1); }
  // 遠景：一排巨大的店內物品剪影（燈籠、暖簾、酒瓶）
  const far = ((offset * 0.35) % 160 + 160) % 160;
  for (let x = -far - 160; x < W + 160; x += 160) {
    ctx.fillStyle = sky === 'hill' ? '#4f7a45' : '#2f4270';
    ctx.fillRect(Math.round(x + 10), horizon - 46, 60, 30); // 暖簾
    ctx.fillStyle = sky === 'hill' ? '#3f6b2f' : '#243359';
    for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(x + 12 + k * 15), horizon - 16, 12, 8);
    ctx.fillStyle = '#b5402f';
    ctx.fillRect(Math.round(x + 96), horizon - 40, 18, 26); // 燈籠
    ctx.fillStyle = '#ffd98a';
    ctx.fillRect(Math.round(x + 102), horizon - 34, 6, 14);
  }
  // 近景：吧台後面的架子
  const near = ((offset * 0.7) % 96 + 96) % 96;
  for (let x = -near - 96; x < W + 96; x += 96) {
    ctx.fillStyle = sky === 'hill' ? '#5d8c3c' : '#4a2f1c';
    ctx.fillRect(Math.round(x), horizon - 10, 70, 12);
    ctx.fillStyle = sky === 'hill' ? '#9cc65a' : '#7a4f2e';
    ctx.fillRect(Math.round(x + 4), horizon - 16, 20, 8);
    ctx.fillRect(Math.round(x + 40), horizon - 13, 14, 5);
  }
}

/**
 * 畫一個畫面。
 * race 是比賽狀態。view = { W, H, time }。回傳 nothing。
 */
export function drawRace(ctx, race, view) {
  const { W, H } = view;
  const track = TRACKS[race.track];
  const len = trackLength(track);
  const p = playerCar(race);
  const camZ = p.z; // 鏡頭在玩家後面 PLAYER_Z 的位置，這裡用玩家位置當基準
  const baseIndex = Math.floor(camZ / R.SEG_LEN) % track.n;
  const basePct = (camZ % R.SEG_LEN) / R.SEG_LEN;
  const segAt = (i) => track.segs[((i % track.n) + track.n) % track.n];
  // 玩家所在位置的高度（在兩段之間內插）
  const y0 = segAt(baseIndex - 1).y;
  const y1 = segAt(baseIndex).y;
  const playerY = y0 + (y1 - y0) * basePct;
  const camY = playerY + CAM_H;
  const camX = p.x * ROAD_W;

  // 背景跟著彎道捲動
  const horizon = Math.round(H * 0.42);
  view.bgOffset = (view.bgOffset || 0) + segAt(baseIndex).curve * (p.speed / R.MAX_SPEED) * 1.6;
  drawBackground(ctx, W, H, horizon, view.bgOffset, track.sky);
  // 地平線以下先鋪一層桌面的顏色
  ctx.fillStyle = COLORS.light.grass;
  ctx.fillRect(0, horizon, W, H - horizon);

  // 投影每一段的遠端
  const pts = view.pts || (view.pts = []);
  let x = 0;
  let dx = -segAt(baseIndex).curve * basePct;
  let maxY = H;
  const halfW = W / 2;
  const halfH = H / 2;
  for (let n = 0; n <= DRAW; n++) {
    const seg = segAt(baseIndex + n);
    const zNear = (n - basePct) * R.SEG_LEN + PLAYER_Z;
    const scale = CAM_DEPTH / Math.max(1, zNear);
    const yPrev = segAt(baseIndex + n - 1).y;
    const pt = pts[n] || (pts[n] = {});
    pt.scale = scale;
    pt.x = halfW + scale * (x - camX) * halfW;
    pt.y = halfH - scale * (yPrev - camY) * halfH;
    pt.w = scale * ROAD_W * halfW;
    pt.index = baseIndex + n;
    pt.clip = maxY;
    x += dx;
    dx += seg.curve;
    if (n > 0) maxY = Math.min(maxY, pt.y);
  }
  // 路面：由遠到近畫（近的蓋住遠的），每段往下多畫一點，不留接縫
  for (let n = DRAW; n > 0; n--) {
    const prev = pts[n - 1];
    const pt = pts[n];
    if ((n - 1 - basePct) * R.SEG_LEN + PLAYER_Z < PLAYER_Z * 0.5) continue;
    const idx = ((prev.index % track.n) + track.n) % track.n;
    const col = idx < 3 ? COLORS.start : (Math.floor(idx / 3) % 2 ? COLORS.dark : COLORS.light);
    if (prev.y <= pt.y) continue; // 下坡背面：看不到
    // 上下邊對齊到整數像素，並且各多畫 1 像素，蓋住相鄰兩段之間的接縫
    const by = Math.ceil(prev.y) + 1;
    const ty = Math.floor(pt.y) - 1;
    ctx.fillStyle = col.grass;
    ctx.fillRect(0, ty, W, by - ty);
    const r1 = prev.w * 1.14;
    const r2 = pt.w * 1.14;
    quad(ctx, prev.x - r1, by, prev.x + r1, by, pt.x + r2, ty, pt.x - r2, ty, col.rumble);
    quad(ctx, prev.x - prev.w, by, prev.x + prev.w, by, pt.x + pt.w, ty, pt.x - pt.w, ty, col.road);
    if (col.lane) {
      const l1 = prev.w * 0.03;
      const l2 = pt.w * 0.03;
      for (const k of [-0.33, 0.33]) {
        quad(ctx, prev.x + prev.w * k - l1, by, prev.x + prev.w * k + l1, by, pt.x + pt.w * k + l2, ty, pt.x + pt.w * k - l2, ty, col.lane);
      }
    }
    // 水灘和加速板：畫在路面上
    const item = track.itemAt[idx];
    if (item) {
      const iw1 = prev.w * R.ITEM_W;
      const iw2 = pt.w * R.ITEM_W;
      const cx1 = prev.x + prev.w * item.x;
      const cx2 = pt.x + pt.w * item.x;
      quad(ctx, cx1 - iw1, by, cx1 + iw1, by, cx2 + iw2, ty, cx2 - iw2, ty, item.kind === 'puddle' ? '#2b1d12' : '#9cc65a');
      if (item.kind === 'pad') quad(ctx, cx1 - iw1 * 0.5, by, cx1 + iw1 * 0.5, by, cx2 + iw2 * 0.1, ty, cx2 - iw2 * 0.1, ty, '#3f6b2f');
    }
  }

  // 像素圖：由遠到近畫，才會前後遮擋正確
  // 先把車子分到各段
  const carsAt = view.carsAt || (view.carsAt = {});
  for (const k of Object.keys(carsAt)) delete carsAt[k];
  for (const c of race.cars) {
    if (c.kind === 'player') continue;
    let ahead = c.z - p.z + (c.lap - p.lap) * len;
    // 落後一圈以上或領先很多的車：看最近的那個相對位置
    ahead = ((ahead % len) + len) % len;
    if (ahead > len / 2) ahead -= len;
    const n = Math.floor((ahead + basePct * R.SEG_LEN) / R.SEG_LEN);
    if (n < 1 || n >= DRAW) continue;
    (carsAt[n] || (carsAt[n] = [])).push({ c, pct: ((ahead + basePct * R.SEG_LEN) % R.SEG_LEN) / R.SEG_LEN });
  }
  const drawSprite = (name, pt, offsetX, clipY, flip) => {
    const sp = getSprite(name, flip);
    if (!sp) return;
    const s = pt.scale * halfW * SPRITE_SCALE;
    const w = sp.w * s;
    const h = sp.h * s;
    if (w < 1.5) return;
    const sx = pt.x + pt.w * offsetX - w / 2;
    const sy = pt.y - h;
    const visible = Math.min(h, clipY - sy);
    if (visible <= 0 || sx > W || sx + w < 0) return;
    ctx.drawImage(sp.canvas, 0, 0, sp.w, sp.h * (visible / h), Math.round(sx), Math.round(sy), Math.round(w), Math.round(visible));
  };
  for (let n = DRAW - 1; n > 0; n--) {
    const pt = pts[n];
    const idx = ((pt.index % track.n) + track.n) % track.n;
    const things = track.scenery[idx];
    if (things) for (const th of things) drawSprite(`race.${th.kind}`, pt, th.side * SCENERY_X, pt.clip, th.side < 0);
    const cars = carsAt[n];
    if (cars) {
      for (const e of cars) {
        // 在這一段的近端和遠端之間內插
        const far = pts[n + 1] || pt;
        const ip = { scale: pt.scale + (far.scale - pt.scale) * e.pct, x: pt.x + (far.x - pt.x) * e.pct, y: pt.y + (far.y - pt.y) * e.pct, w: pt.w + (far.w - pt.w) * e.pct };
        drawSprite(e.c.kind === 'shumaha' ? 'race.car.shumaha' : `race.car.${e.c.sushi}`, ip, e.c.x, pt.clip, false);
      }
    }
  }

  // 玩家的車：固定在畫面下方中間。速度越快抖動越明顯
  const sp = getSprite(`race.car.${p.sushi}`);
  const k = 2.4;
  const bounce = Math.round(Math.sin(view.time / 40) * (p.speed / R.MAX_SPEED) * 1.2);
  const lean = Math.round((view.steer || 0) * 3);
  const px = Math.round(halfW - (sp.w * k) / 2 + lean);
  const py = Math.round(H - sp.h * k - 6 + bounce);
  // 噴射的火焰
  if (p.boostT > 0) {
    ctx.fillStyle = Math.floor(view.time / 50) % 2 ? '#9cc65a' : '#f2c94c';
    ctx.fillRect(px + 14, py + sp.h * k - 6, 10, 10);
    ctx.fillRect(px + sp.w * k - 24, py + sp.h * k - 6, 10, 10);
  }
  ctx.drawImage(sp.canvas, px, py, Math.round(sp.w * k), Math.round(sp.h * k));
  // 速度線
  if (p.speed > R.MAX_SPEED * 0.85) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 6; i++) {
      const lx = (i * 97 + Math.floor(view.time / 30) * 53) % W;
      const ly = horizon + 20 + ((i * 61 + Math.floor(view.time / 30) * 29) % (H - horizon - 60));
      ctx.fillRect(lx, ly, 14, 1);
    }
  }
}
