// 小鋼珠盤面的繪圖。座標單位和物理一樣（盤面 400×400 公釐），畫的時候縮放到畫布大小。
// 盤面畫在小遊戲自己的高解析度畫布上（不是 480×270 的像素畫布），細的釘子和螢幕文字才看得清楚。
import { PACHINKO as P } from '../../data/balance.js';

const PH = P.PH;

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

const THEMES = {
  sea: { face: ['#25b3c4', '#07264f'], ink: 'rgba(255,255,255,', art: 'bubbles', plate: '#0b3a66' },
  dragon: { face: ['#a3242b', '#170306'], ink: 'rgba(255,196,64,', art: 'rays', plate: '#3a0b0e' },
};
const GATE_STYLE = { den: ['#ff7fb0', 3.4], att: ['#f4f4f8', 4] };

function seeded(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

function drawArt(c, b, th) {
  const r = seeded(b.nails.length * 7 + 13);
  c.save();
  if (th.art === 'bubbles') {
    for (let i = 0; i < 46; i++) {
      const x = r() * 400, y = r() * 400, q = 3 + r() * 16;
      c.beginPath(); c.arc(x, y, q, 0, TAU);
      c.strokeStyle = `${th.ink}${0.08 + r() * 0.12})`; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.arc(x - q * 0.3, y - q * 0.3, q * 0.18, 0, TAU); c.fillStyle = `${th.ink}0.16)`; c.fill();
    }
    c.strokeStyle = `${th.ink}0.07)`; c.lineWidth = 6;
    for (let k = 0; k < 5; k++) {
      c.beginPath();
      for (let x = 0; x <= 400; x += 10) c.lineTo(x, 250 + k * 30 + Math.sin(x / 34 + k) * 9);
      c.stroke();
    }
  } else {
    c.translate(200, 150);
    for (let k = 0; k < 36; k++) {
      c.rotate(TAU / 36);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-9, 330); c.lineTo(9, 330); c.closePath();
      c.fillStyle = `${th.ink}${k % 2 ? 0.05 : 0.1})`; c.fill();
    }
  }
  c.restore();
}

function metal(c, x0, y0, x1, y1) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#f6f6fb'); g.addColorStop(0.45, '#9a9cab'); g.addColorStop(0.55, '#e9e9f2'); g.addColorStop(1, '#6d6f7d');
  return g;
}

function drawNail(c, x, y) {
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.arc(x + 1.1, y + 1.6, 1.9, 0, TAU); c.fill();
  c.fillStyle = '#c99a2e';
  c.beginPath(); c.arc(x, y, 1.9, 0, TAU); c.fill();
  c.fillStyle = '#fff3bf';
  c.beginPath(); c.arc(x - 0.5, y - 0.6, 0.8, 0, TAU); c.fill();
}

function pill(c, x, y, text, bg = 'rgba(12,14,24,0.86)', fg = '#fff') {
  c.font = '600 8.5px system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
  const w = c.measureText(text).width + 8;
  c.fillStyle = bg;
  c.beginPath(); c.roundRect(x - w / 2, y - 6.5, w, 13, 6.5); c.fill();
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x, y + 0.5);
}

/** 不會動的部分：盤面底圖、軌道、牆、釘子、入賞口。畫一次存起來。 */
export function buildStatic(b, px, showLabels) {
  const cv = Object.assign(document.createElement('canvas'), { width: px, height: px });
  const c = cv.getContext('2d');
  const th = THEMES[b.art.theme] || THEMES.sea;
  c.scale(px / 400, px / 400);
  // 機台外殼
  c.fillStyle = '#17110d'; c.fillRect(0, 0, 400, 400);
  const cg = c.createLinearGradient(0, 0, 400, 400);
  cg.addColorStop(0, th.plate); cg.addColorStop(1, '#0c0908');
  c.fillStyle = cg; c.fillRect(0, 0, 400, 400);
  // 盤面
  c.save();
  c.beginPath(); c.arc(b.cx, b.cy, b.R, 0, TAU); c.clip();
  const fg = c.createRadialGradient(b.cx, b.cy - 60, 20, b.cx, b.cy, b.R);
  fg.addColorStop(0, th.face[0]); fg.addColorStop(1, th.face[1]);
  c.fillStyle = fg; c.fillRect(0, 0, 400, 400);
  drawArt(c, b, th);
  // 發射軌道
  c.beginPath();
  c.arc(b.cx, b.cy, b.R - PH.LANE_W / 2, PH.LANE_A0 * D2R, PH.LANE_A1 * D2R);
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = PH.LANE_W; c.stroke();
  // 出口
  c.fillStyle = '#05060a';
  c.beginPath(); c.ellipse(b.cx, b.cy + b.R - 3, 17, 9, 0, 0, TAU); c.fill();
  c.restore();
  // 外軌
  c.beginPath(); c.arc(b.cx, b.cy, b.R + 1.5, 0, TAU);
  c.strokeStyle = metal(c, 0, 0, 400, 400); c.lineWidth = 4.5; c.stroke();
  c.beginPath(); c.arc(b.cx, b.cy, b.R + 4.5, 0, TAU);
  c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2; c.stroke();
  // 中央框（數位機）
  if (b.art.frame) {
    c.beginPath(); b.art.frame.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    const g = c.createLinearGradient(0, 80, 0, 225);
    g.addColorStop(0, '#3b3f55'); g.addColorStop(1, '#14151f');
    c.fillStyle = g; c.fill();
    c.strokeStyle = '#d9b24a'; c.lineWidth = 2.6; c.lineJoin = 'round'; c.stroke();
  }
  // 牆
  c.lineCap = 'round';
  for (const w of b.walls) {
    if (w.look === 'cup' || w.look === 'michi') continue;
    c.beginPath(); c.moveTo(w.x1, w.y1); c.lineTo(w.x2, w.y2);
    if (w.look === 'rail') { c.strokeStyle = metal(c, w.x1 - 3, w.y1, w.x1 + 3, w.y1 + 2); c.lineWidth = 2.6; }
    else if (w.look === 'frame') { c.strokeStyle = '#d9b24a'; c.lineWidth = 2.6; }
    else { c.strokeStyle = '#e6e8f2'; c.lineWidth = 2.4; }
    c.stroke();
  }
  // 入賞口
  for (const p of b.pockets) {
    const x = p.x - p.half - 1.6, w = p.half * 2 + 3.2;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.roundRect(x + 1.2, p.y + 1.8, w, p.depth + 2.5, [1, 1, 5, 5]); c.fill();
    c.fillStyle = p.color || '#888'; c.beginPath(); c.roundRect(x, p.y, w, p.depth + 2.5, [1, 1, 5, 5]); c.fill();
    c.fillStyle = '#07080d'; c.beginPath(); c.roundRect(p.x - p.half + 0.8, p.y, p.half * 2 - 1.6, p.depth - 2.5, [0, 0, 3, 3]); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x + 0.6, p.y + 0.4); c.lineTo(x + 0.6, p.y + p.depth); c.stroke();
    if (p.name) {
      c.font = '700 7px system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(p.name, p.x, p.y + p.depth - 4.6);
    }
  }
  for (const s of b.sensors) {
    if (s.kind === 'gate') {
      c.fillStyle = '#ffdd55'; c.fillRect(s.x - 3, s.y - 1, 3, s.h + 2); c.fillRect(s.x + s.w, s.y - 1, 3, s.h + 2);
      c.fillStyle = 'rgba(255,221,85,0.35)'; c.fillRect(s.x, s.y, s.w, s.h);
    } else if (s.kind === 'warp') {
      c.fillStyle = '#05060a'; c.beginPath(); c.roundRect(s.x + 2, s.y + 2, s.w + 3, s.h - 2, 3); c.fill();
      c.strokeStyle = '#7ef0ff'; c.lineWidth = 1.2; c.stroke();
    } else if (s.kind === 'denchu') {
      c.fillStyle = '#ff5f9b'; c.beginPath(); c.roundRect(s.x - 1.5, s.y - 4, s.w + 3, 13, [1, 1, 5, 5]); c.fill();
      c.fillStyle = '#07080d'; c.fillRect(s.x + 1, s.y - 4, s.w - 2, 8);
    } else if (s.kind === 'attacker') {
      c.fillStyle = '#b3272d'; c.beginPath(); c.roundRect(s.x - 2, s.y - 2, s.w + 4, 18, 3); c.fill();
      c.fillStyle = '#07080d'; c.beginPath(); c.roundRect(s.x + 1, s.y + 1, s.w - 2, 10, 2); c.fill();
    }
  }
  for (const n of b.deco) drawNail(c, n.x, n.y);
  for (const n of b.nails) drawNail(c, n.x, n.y);
  for (const p of b.bumpers) {
    if (p.kind !== 'rubber') continue;
    c.fillStyle = '#16171c'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
    c.strokeStyle = '#555a66'; c.lineWidth = 1; c.stroke();
  }
  if (showLabels) {
    for (const l of b.labels) {
      if (l.tx !== l.x || l.ty !== l.y) {
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(l.tx, l.ty); c.lineTo(l.x, l.y); c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(l.x, l.y, 1.6, 0, TAU); c.fill();
      }
    }
    for (const l of b.labels) pill(c, l.tx, l.ty, l.text);
  }
  return cv;
}

function digitColor(d) { return d === 7 || d === 3 ? '#ff4d4d' : d % 2 === 0 ? '#52b7ff' : '#63e08a'; }

function reelDigits(st, time) {
  const sp = st.spin;
  if (!sp) return { d: st.digits, moving: [false, false, false] };
  const t = sp.t;
  const stopL = Math.min(1.0, sp.dur * 0.4), stopR = Math.min(1.5, sp.dur * 0.65), stopC = sp.dur - 0.05;
  const roll = (k) => 1 + ((Math.floor(time * 16) + k * 3) % 9);
  const d = [t >= stopL ? sp.digits[0] : roll(0), 0, t >= stopR ? sp.digits[2] : roll(2)];
  if (t >= stopC) d[1] = sp.digits[1];
  else if (sp.reach && t >= stopR) {
    // 聽牌：中間的數字慢慢走到最後的數字
    const left = Math.ceil((stopC - t) * 2.4);
    d[1] = 1 + ((((sp.digits[1] - 1 - left) % 9) + 9) % 9);
  } else d[1] = roll(1);
  return { d, moving: [t < stopL, t < stopC && !(sp.reach && t >= stopR), t < stopR], reach: sp.reach && t >= stopR };
}

function drawLcd(c, b, st, time) {
  const q = b.art.lcd;
  c.save();
  c.beginPath(); c.roundRect(q.x, q.y, q.w, q.h, 6); c.clip();
  const { d, moving, reach } = reelDigits(st, time);
  const jp = st.phase === 'jp';
  const hot = st.mode === 'st';
  const g = c.createLinearGradient(0, q.y, 0, q.y + q.h);
  if (jp) { g.addColorStop(0, '#ffb300'); g.addColorStop(1, '#c2185b'); }
  else if (reach) { g.addColorStop(0, '#3a0d5c'); g.addColorStop(1, '#0d0520'); }
  else if (hot) { g.addColorStop(0, '#b71c1c'); g.addColorStop(1, '#3b0a0a'); }
  else if (b.art.theme === 'dragon') { g.addColorStop(0, '#31204f'); g.addColorStop(1, '#0c0716'); }
  else { g.addColorStop(0, '#1479c9'); g.addColorStop(1, '#062a5c'); }
  c.fillStyle = g; c.fillRect(q.x, q.y, q.w, q.h);
  const mx = q.x + q.w / 2, my = q.y + q.h / 2;
  if (jp || reach) {
    c.save(); c.translate(mx, my); c.rotate(time * 0.8);
    for (let k = 0; k < 12; k++) {
      c.rotate(TAU / 12);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-12, 130); c.lineTo(12, 130); c.closePath();
      c.fillStyle = jp ? 'rgba(255,255,255,0.22)' : 'rgba(190,120,255,0.18)'; c.fill();
    }
    c.restore();
  } else {
    c.fillStyle = 'rgba(255,255,255,0.1)';
    for (let k = 0; k < 7; k++) {
      const x = q.x + ((k * 37 + time * (8 + k * 2)) % (q.w + 20)) - 10;
      c.beginPath(); c.arc(x, q.y + 20 + ((k * 29) % (q.h - 30)), 3 + (k % 3) * 2, 0, TAU); c.fill();
    }
  }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const F = 'system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
  if (jp) {
    const j = st.jp;
    c.font = `900 26px ${F}`;
    c.lineWidth = 5; c.strokeStyle = '#5a0020'; c.strokeText('大　當', mx, q.y + 30);
    c.fillStyle = '#fff'; c.fillText('大　當', mx, q.y + 30);
    c.font = `800 15px ${F}`; c.fillStyle = '#fff';
    c.fillText(j.sub === 'intro' ? `${j.rounds} 回合` : `第 ${j.r}／${j.rounds} 回合`, mx, q.y + 58);
    c.font = `900 20px ${F}`; c.fillStyle = '#fff36b';
    c.strokeStyle = '#5a0020'; c.lineWidth = 4; c.strokeText(`+${st.chainGot}`, mx, q.y + 82); c.fillText(`+${st.chainGot}`, mx, q.y + 82);
  } else {
    for (let i = 0; i < 3; i++) {
      const x = q.x + q.w * (0.2 + 0.3 * i);
      const wob = moving[i] ? Math.sin(time * 40 + i) * 3 : 0;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.roundRect(x - 19, my - 28, 38, 54, 6); c.fill();
      c.font = `900 44px ${F}`;
      c.globalAlpha = moving[i] ? 0.6 : 1;
      c.lineWidth = 5; c.strokeStyle = '#fff'; c.strokeText(String(d[i]), x, my + wob);
      c.fillStyle = digitColor(d[i]); c.fillText(String(d[i]), x, my + wob);
      c.globalAlpha = 1;
    }
    c.font = `800 10px ${F}`; c.fillStyle = '#fff';
    c.textAlign = 'left';
    c.fillText(hot ? `確變 剩 ${st.stLeft} 回` : '普通', q.x + 7, q.y + 11);
    c.textAlign = 'right';
    c.fillText(`${st.since} 回`, q.x + q.w - 7, q.y + 11);
    c.textAlign = 'center';
    if (reach && Math.floor(time * 4) % 2 === 0) {
      c.font = `900 15px ${F}`; c.fillStyle = '#ffe14d'; c.strokeStyle = '#3a0d5c'; c.lineWidth = 4;
      c.strokeText('聽牌！', mx, q.y + 13); c.fillText('聽牌！', mx, q.y + 13);
    }
  }
  // 保留燈
  for (let i = 0; i < 4; i++) {
    c.beginPath(); c.arc(q.x + 12 + i * 10, q.y + q.h - 9, 3.6, 0, TAU);
    c.fillStyle = i < st.hold1 ? '#6fd3ff' : 'rgba(0,0,0,0.4)'; c.fill();
    c.beginPath(); c.arc(q.x + q.w - 12 - i * 10, q.y + q.h - 9, 3.6, 0, TAU);
    c.fillStyle = i < st.hold2 ? '#ff7fb0' : 'rgba(0,0,0,0.4)'; c.fill();
  }
  if (st.noticeT > 0 && Math.floor(time * 5) % 2 === 0) {
    c.font = `900 17px ${F}`;
    c.lineWidth = 5; c.strokeStyle = '#000'; c.strokeText(st.notice, mx, q.y + q.h - 12);
    c.fillStyle = '#fff36b'; c.fillText(st.notice, mx, q.y + q.h - 12);
  }
  c.restore();
  c.strokeStyle = '#0a0b12'; c.lineWidth = 2.2;
  c.beginPath(); c.roundRect(q.x, q.y, q.w, q.h, 6); c.stroke();
}

function drawStage(c, st, color) {
  c.beginPath();
  for (let x = st.x0 - 5; x <= st.x1 + 5; x += 1) {
    const ph = (TAU * (x - st.cx)) / st.L;
    c.lineTo(x, st.y - (st.h * (1 - Math.cos(ph))) / 2);
  }
  c.strokeStyle = color; c.lineWidth = 2.2; c.lineCap = 'round'; c.stroke();
}

function ballSprite() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 48;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(17, 15, 2, 24, 24, 24);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#d8dbe6'); g.addColorStop(0.8, '#7d8194'); g.addColorStop(1, '#3d4050');
  c.fillStyle = g; c.beginPath(); c.arc(24, 24, 23, 0, TAU); c.fill();
  return cv;
}
let BALL = null;

/** 畫一格。session 是 machine.js 的一局。view = { staticLayer, pops, time, rightHint } */
export function drawFrame(c, px, session, view) {
  const b = session.board, st = session.logic.state, time = view.time;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(view.staticLayer, 0, 0);
  c.setTransform(px / 400, 0, 0, px / 400, 0, 0);
  if (!BALL) BALL = ballSprite();
  // 螢幕、役物
  if (b.art.lcd) { drawLcd(c, b, st, time); drawStage(c, b.stages[0], '#8fe9ff'); }
  // 風車
  for (const p of b.bumpers) {
    if (p.kind !== 'mill') continue;
    p.ang += p.spin * 0.016; p.spin *= 0.97;
    c.save(); c.translate(p.x, p.y); c.rotate(p.ang);
    for (let k = 0; k < 3; k++) {
      c.rotate(TAU / 3);
      c.fillStyle = k === 0 ? '#ff5d5d' : k === 1 ? '#ffe14d' : '#5db7ff';
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(5, -3, 7.5, 0); c.quadraticCurveTo(5, 3, 0, 0); c.fill();
    }
    c.restore();
    c.fillStyle = '#f3f3f7'; c.beginPath(); c.arc(p.x, p.y, 2, 0, TAU); c.fill();
  }
  // 會動的牆：鬱金香花瓣、羽根、電チュー、アタッカー
  c.lineCap = 'round';
  for (const g of b.gates) {
    if (!g.on) continue;
    const key = g.id.split(':')[0];
    const stl = GATE_STYLE[key] || ['#ff4d5e', 4.4];
    c.beginPath(); c.moveTo(g.x1, g.y1); c.lineTo(g.x2, g.y2);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = stl[1] + 1.6; c.stroke();
    c.strokeStyle = stl[0]; c.lineWidth = stl[1]; c.stroke();
  }
  if (st.attOpen) {
    const s = b.sensors.find((q) => q.id === 'att');
    c.fillStyle = `rgba(255,240,120,${0.5 + 0.3 * Math.sin(time * 12)})`;
    c.beginPath(); c.roundRect(s.x + 1, s.y + 1, s.w - 2, 10, 2); c.fill();
  }
  // 鋼珠
  for (const ball of session.world.balls) {
    c.drawImage(BALL, ball.x - PH.BALL_R, ball.y - PH.BALL_R, PH.BALL_R * 2, PH.BALL_R * 2);
  }
  // 右打提示
  if (view.rightHint) {
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let k = 0; k < 5; k++) {
      const a = (-128 + k * 19 + ((time * 40) % 19)) * D2R;
      const x = b.cx + (b.R - 26) * Math.cos(a), y = b.cy + (b.R - 26) * Math.sin(a);
      c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2);
      c.beginPath(); c.moveTo(-5, -5); c.lineTo(2, 0); c.lineTo(-5, 5);
      c.strokeStyle = 'rgba(255,240,90,0.95)'; c.lineWidth = 3; c.stroke();
      c.restore();
    }
    c.restore();
    if (Math.floor(time * 3) % 2 === 0) pill(c, 332, 44, '右打 ▶▶', '#ffe14d', '#3a2300');
  }
  // 大當的閃光
  if (st.flash > 0) {
    c.beginPath(); c.arc(b.cx, b.cy, b.R - 2, 0, TAU);
    c.strokeStyle = `hsla(${(time * 400) % 360}, 100%, 65%, 0.85)`; c.lineWidth = 6; c.stroke();
  }
  // 賠球的數字
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const p of view.pops) {
    const k = p.t / 0.9;
    c.globalAlpha = Math.max(0, 1 - k * k);
    c.font = '900 11px system-ui, sans-serif';
    c.lineWidth = 3; c.strokeStyle = '#1a1200'; c.strokeText(p.text, p.x, p.y - 8 - k * 16);
    c.fillStyle = '#ffe14d'; c.fillText(p.text, p.x, p.y - 8 - k * 16);
  }
  c.globalAlpha = 1;
}
