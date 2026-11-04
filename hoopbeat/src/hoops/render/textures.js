// Canvas 產生的貼圖：球場地板、球衣號碼、籃球、籃板、進攻計時器、廣告看板。
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';
import { drawLogo, drawLeagueLogo } from './logos.js';
import { RNG } from '../sim/util.js';

const FONT = '"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif';

export function canvasTexture(canvas, { srgb = true, aniso = 8, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export const FLOOR_EXTENT = { x: 15.6, z: 9.0 }; // 地板貼圖涵蓋範圍（半長、半寬）

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c * k))));
  return `rgb(${r},${g},${b})`;
}

// 球場地板：主隊配色、木紋、所有線條
export function makeCourtTexture(homeTeam, awayTeam) {
  const W = 4096, H = Math.round(4096 * FLOOR_EXTENT.z / FLOOR_EXTENT.x);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const sx = W / (FLOOR_EXTENT.x * 2), sz = H / (FLOOR_EXTENT.z * 2);
  const X = (x) => (x + FLOOR_EXTENT.x) * sx;
  const Z = (z) => (z + FLOOR_EXTENT.z) * sz;
  const rng = new RNG(77);

  // 場外區域
  ctx.fillStyle = shade(homeTeam.court, 0.55);
  ctx.fillRect(0, 0, W, H);

  // 木地板（含界外 1 公尺緩衝區）
  const fx0 = X(-COURT.halfLength - 1.2), fx1 = X(COURT.halfLength + 1.2);
  const fz0 = Z(-COURT.halfWidth - 1.0), fz1 = Z(COURT.halfWidth + 1.0);
  ctx.fillStyle = '#d6a468';
  ctx.fillRect(fx0, fz0, fx1 - fx0, fz1 - fz0);
  const plankW = 0.09 * sz;
  for (let z = fz0; z < fz1; z += plankW) {
    let x = fx0 - rng.range(0, 300);
    while (x < fx1) {
      const len = rng.range(260, 620);
      const tone = rng.range(-14, 14);
      ctx.fillStyle = `rgba(${200 + tone},${150 + tone * 0.8},${92 + tone * 0.5},0.55)`;
      ctx.fillRect(Math.max(fx0, x), z, Math.min(len, fx1 - x), plankW - 1);
      ctx.fillStyle = 'rgba(90,55,25,0.18)';
      ctx.fillRect(x, z, 2, plankW);
      x += len;
    }
    ctx.fillStyle = 'rgba(90,55,25,0.12)';
    ctx.fillRect(fx0, z, fx1 - fx0, 1);
  }
  // 細紋
  for (let i = 0; i < 9000; i++) {
    const x = rng.range(fx0, fx1), z = rng.range(fz0, fz1);
    ctx.fillStyle = `rgba(120,70,30,${rng.range(0.03, 0.08)})`;
    ctx.fillRect(x, z, rng.range(10, 60), 1);
  }

  // 界外緩衝區上色
  ctx.fillStyle = rgba(homeTeam.court, 0.92);
  ctx.fillRect(fx0, fz0, fx1 - fx0, Z(-COURT.halfWidth) - fz0);
  ctx.fillRect(fx0, Z(COURT.halfWidth), fx1 - fx0, fz1 - Z(COURT.halfWidth));
  ctx.fillRect(fx0, fz0, X(-COURT.halfLength) - fx0, fz1 - fz0);
  ctx.fillRect(X(COURT.halfLength), fz0, fx1 - X(COURT.halfLength), fz1 - fz0);

  // 禁區上色
  for (const side of [-1, 1]) {
    const bx = side * COURT.halfLength;
    const kx = side * (COURT.halfLength - COURT.keyLength);
    ctx.fillStyle = rgba(homeTeam.court, 0.88);
    ctx.fillRect(Math.min(X(bx), X(kx)), Z(-COURT.keyHalfW), Math.abs(X(bx) - X(kx)), Z(COURT.keyHalfW) - Z(-COURT.keyHalfW));
    // 三分線內淡色
    ctx.save();
    ctx.beginPath();
    const hx = side * COURT.hoopX;
    ctx.moveTo(X(bx), Z(-COURT.threeCornerZ));
    ctx.lineTo(X(hx - side * COURT.threeCornerDx), Z(-COURT.threeCornerZ));
    const a0 = Math.asin(COURT.threeCornerZ / COURT.threeR);
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const a = -a0 + (2 * a0 * i) / steps;
      ctx.lineTo(X(hx - side * Math.cos(a) * COURT.threeR), Z(Math.sin(a) * COURT.threeR));
    }
    ctx.lineTo(X(bx), Z(COURT.threeCornerZ));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,240,215,0.10)';
    ctx.fill();
    ctx.restore();
  }

  // 中圈 logo
  ctx.save();
  ctx.fillStyle = rgba(homeTeam.court, 0.85);
  ctx.beginPath(); ctx.ellipse(X(0), Z(0), COURT.centerCircleR * sx, COURT.centerCircleR * sz, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(X(0), Z(0));
  ctx.scale(1, sz / sx);
  drawLeagueLogo(ctx, 0, 0, COURT.centerCircleR * sx * 0.72, { color: '#ffffff', accent: homeTeam.dark.trim });
  ctx.restore();

  // 線條
  const lw = 0.05 * sx;
  ctx.strokeStyle = '#fbfaf5';
  ctx.lineWidth = lw;
  ctx.strokeRect(X(-COURT.halfLength), Z(-COURT.halfWidth), X(COURT.halfLength) - X(-COURT.halfLength), Z(COURT.halfWidth) - Z(-COURT.halfWidth));
  ctx.beginPath(); ctx.moveTo(X(0), Z(-COURT.halfWidth)); ctx.lineTo(X(0), Z(COURT.halfWidth)); ctx.stroke();
  const ellipse = (x, z, r, a0 = 0, a1 = Math.PI * 2, dashed = false) => {
    ctx.save();
    if (dashed) ctx.setLineDash([0.3 * sx, 0.25 * sx]);
    ctx.beginPath();
    ctx.ellipse(X(x), Z(z), r * sx, r * sz, 0, a0, a1);
    ctx.stroke();
    ctx.restore();
  };
  ellipse(0, 0, COURT.centerCircleR);
  ellipse(0, 0, 0.6);
  for (const side of [-1, 1]) {
    const bx = side * COURT.halfLength;
    const hx = side * COURT.hoopX;
    const kx = side * (COURT.halfLength - COURT.keyLength);
    // 禁區
    ctx.strokeRect(Math.min(X(bx), X(kx)), Z(-COURT.keyHalfW), Math.abs(X(bx) - X(kx)), Z(COURT.keyHalfW) - Z(-COURT.keyHalfW));
    // 罰球圈
    const inward = side > 0 ? Math.PI : 0;
    ellipse(kx, 0, COURT.centerCircleR, inward - Math.PI / 2, inward + Math.PI / 2);
    ellipse(kx, 0, COURT.centerCircleR, inward + Math.PI / 2, inward + Math.PI * 1.5, true);
    // 三分線
    ctx.beginPath();
    ctx.moveTo(X(bx), Z(-COURT.threeCornerZ));
    ctx.lineTo(X(hx - side * COURT.threeCornerDx), Z(-COURT.threeCornerZ));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(bx), Z(COURT.threeCornerZ));
    ctx.lineTo(X(hx - side * COURT.threeCornerDx), Z(COURT.threeCornerZ));
    ctx.stroke();
    const a0 = Math.asin(COURT.threeCornerZ / COURT.threeR);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = -a0 + (2 * a0 * i) / 60;
      const px = X(hx - side * Math.cos(a) * COURT.threeR), pz = Z(Math.sin(a) * COURT.threeR);
      if (i === 0) ctx.moveTo(px, pz); else ctx.lineTo(px, pz);
    }
    ctx.stroke();
    // 合理衝撞區
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 30;
      const px = X(hx - side * Math.cos(a) * COURT.restrictedR), pz = Z(Math.sin(a) * COURT.restrictedR);
      if (i === 0) ctx.moveTo(px, pz); else ctx.lineTo(px, pz);
    }
    ctx.stroke();
    // 籃板下方投影短線
    ctx.beginPath(); ctx.moveTo(X(side * COURT.boardX), Z(-0.9)); ctx.lineTo(X(side * COURT.boardX), Z(0.9)); ctx.stroke();
    // 罰球站位標記
    for (const a of [1.75, 2.6, 3.45]) {
      for (const zz of [-1, 1]) {
        const xx = bx - side * a;
        ctx.beginPath(); ctx.moveTo(X(xx), Z(zz * COURT.keyHalfW)); ctx.lineTo(X(xx), Z(zz * (COURT.keyHalfW + 0.12))); ctx.stroke();
      }
    }
  }

  // 底線外的球隊名
  const txt = (s, x, z, rot, size, color) => {
    ctx.save();
    ctx.translate(X(x), Z(z));
    ctx.rotate(rot);
    ctx.scale(1, 1);
    ctx.fillStyle = color;
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, 0, 0);
    ctx.restore();
  };
  txt(`${homeTeam.city}${homeTeam.name}`, -COURT.halfLength - 0.62, 0, -Math.PI / 2, Math.round(0.7 * sz), rgba(homeTeam.light.jersey, 0.85));
  txt(`${homeTeam.city}${homeTeam.name}`, COURT.halfLength + 0.62, 0, Math.PI / 2, Math.round(0.7 * sz), rgba(homeTeam.light.jersey, 0.85));
  txt('鋼框聯盟  STEELRIM LEAGUE', 0, -COURT.halfWidth - 0.55, 0, Math.round(0.5 * sz), 'rgba(255,255,255,0.75)');
  txt('鋼框聯盟  STEELRIM LEAGUE', 0, COURT.halfWidth + 0.55, 0, Math.round(0.5 * sz), 'rgba(255,255,255,0.75)');
  // 兩側罰球區附近隊徽
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(X(side * 6.0), Z(-COURT.halfWidth - 0.55));
    ctx.scale(1, sz / sx);
    drawLogo(ctx, side < 0 ? homeTeam : awayTeam, 0, 0, 0.36 * sx);
    ctx.restore();
  }

  const tex = canvasTexture(c, { aniso: 16 });
  return tex;
}

// 球衣號碼（含背後的姓名）
export function makeNumberTexture(number, color, outline, name = null) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (name) {
    ctx.font = `800 40px ${FONT}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = outline;
    ctx.strokeText(name, 128, 38);
    ctx.fillStyle = color;
    ctx.fillText(name, 128, 38);
  }
  ctx.font = `900 ${name ? 150 : 170}px "Arial Black","Helvetica Neue",Arial,sans-serif`;
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outline;
  const y = name ? 160 : 138;
  ctx.strokeText(String(number), 128, y);
  ctx.fillStyle = color;
  ctx.fillText(String(number), 128, y);
  return canvasTexture(c, { aniso: 4 });
}

export function makeBallTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#d9662a');
  g.addColorStop(0.5, '#e8782f');
  g.addColorStop(1, '#c95a22');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  const rng = new RNG(5);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(80,30,10,${rng.range(0.05, 0.18)})`;
    ctx.fillRect(rng.range(0, 512), rng.range(0, 256), 2, 2);
  }
  ctx.strokeStyle = '#1d120c';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(512, 128); ctx.stroke();
  for (const u of [128, 384]) { ctx.beginPath(); ctx.moveTo(u, 0); ctx.lineTo(u, 256); ctx.stroke(); }
  for (const u0 of [0, 256]) {
    ctx.beginPath();
    for (let v = 0; v <= 256; v += 4) {
      const u = u0 + 64 + Math.sin((v / 256) * Math.PI) * 60 * (u0 ? -1 : 1) + (u0 ? 128 : 0);
      if (v === 0) ctx.moveTo(u, v); else ctx.lineTo(u, v);
    }
    ctx.stroke();
  }
  return canvasTexture(c, { aniso: 4 });
}

export function makeBoardTexture() {
  const c = document.createElement('canvas');
  c.width = 360; c.height = 210;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(220,235,255,0.16)';
  ctx.fillRect(0, 0, 360, 210);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 350, 200);
  ctx.lineWidth = 9;
  ctx.strokeRect(120, 90, 120, 90);
  return canvasTexture(c, { aniso: 4 });
}

export class DigitTexture {
  constructor(w = 128, h = 64, color = '#ff3b30') {
    this.c = document.createElement('canvas');
    this.c.width = w; this.c.height = h;
    this.ctx = this.c.getContext('2d');
    this.color = color;
    this.tex = canvasTexture(this.c, { aniso: 2 });
    this.value = null;
    this.set('');
  }
  set(text) {
    if (text === this.value) return;
    this.value = text;
    const { ctx, c } = this;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = this.color;
    ctx.font = `700 ${Math.round(c.height * 0.82)}px "Courier New",monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height * 0.54);
    this.tex.needsUpdate = true;
  }
}

// 看台前的 LED 廣告帶（可捲動）
export function makeRibbonTexture(home, away) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, 2048, 64);
  const items = [
    { t: '鋼框聯盟 STEELRIM', col: '#ff8a2a' },
    { t: `${home.city}${home.name}`, col: home.dark.trim },
    { t: 'VS', col: '#ffffff' },
    { t: `${away.city}${away.name}`, col: away.dark.trim },
    { t: '全場五對五', col: '#7fd3ff' },
  ];
  let x = 40;
  ctx.textBaseline = 'middle';
  ctx.font = `900 40px ${FONT}`;
  while (x < 2048) {
    for (const it of items) {
      ctx.fillStyle = it.col;
      ctx.fillText(it.t, x, 34);
      x += ctx.measureText(it.t).width + 80;
      if (x > 2048) break;
    }
  }
  const t = canvasTexture(c, { repeat: true });
  return t;
}

export function makeBannerTexture(team) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = team.dark.jersey;
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = team.dark.trim;
  ctx.fillRect(0, 0, 256, 16);
  ctx.fillRect(0, 470, 256, 42);
  drawLogo(ctx, team, 128, 170, 92);
  ctx.fillStyle = team.light.jersey;
  ctx.font = `900 54px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(team.city, 128, 330);
  ctx.fillText(team.name, 128, 395);
  return canvasTexture(c);
}

export function makeLabelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(12, 4); ctx.lineTo(116, 4); ctx.quadraticCurveTo(124, 4, 124, 12);
  ctx.lineTo(124, 40); ctx.quadraticCurveTo(124, 48, 116, 48);
  ctx.lineTo(74, 48); ctx.lineTo(64, 60); ctx.lineTo(54, 48);
  ctx.lineTo(12, 48); ctx.quadraticCurveTo(4, 48, 4, 40); ctx.lineTo(4, 12); ctx.quadraticCurveTo(4, 4, 12, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 34px "Arial Black",Arial,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 27);
  return canvasTexture(c);
}
