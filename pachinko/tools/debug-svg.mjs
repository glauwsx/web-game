// 除錯用：把盤面和幾條彈道畫成 SVG，再轉成 PNG。
import { createRequire } from 'node:module';
// 用法：node tools/debug-svg.mjs <機台 id> <輸出.png> <力道,力道,...> [每個力道幾顆]
import fs from 'node:fs';
import { MACHINES } from '../src/machines/index.js';
import { createSession } from '../src/session.js';
import { PH } from '../src/physics.js';
const [id, out, plist, nn] = process.argv.slice(2);
const m = MACHINES.find((q) => q.id === id);
const powers = (plist || '0.5').split(',').map(Number);
const colors = ['#ff5a5a', '#5ab4ff', '#6fdc6f', '#ffc64a', '#d58bff', '#ffffff'];
let paths = '';
let board;
powers.forEach((p, pi) => {
  const s = createSession(m, { seed: 11 + pi });
  board = s.board;
  for (let i = 0; i < Number(nn || 6); i++) {
    const b = s.fire(p);
    let d = `M${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    let k = 0;
    while (!b.done && k++ < 4000) { s.step(); if (k % 2 === 0) d += `L${b.x.toFixed(1)} ${b.y.toFixed(1)}`; }
    paths += `<path d="${d}" fill="none" stroke="${colors[pi % colors.length]}" stroke-width="0.8" opacity="0.75"/>`;
  }
});
const b = board;
let g = `<circle cx="${b.cx}" cy="${b.cy}" r="${b.R}" fill="#123" stroke="#ccc" stroke-width="2"/>`;
for (const w of b.walls) g += `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="#9cf" stroke-width="1.5"/>`;
for (const w of b.gates) g += `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${w.on ? '#f66' : '#633'}" stroke-width="1.5" stroke-dasharray="${w.on ? '' : '2 2'}"/>`;
for (const s of b.sensors) g += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#0f04" stroke="#0f0" stroke-width="0.4"/>`;
for (const st of b.stages) g += `<line x1="${st.x0}" y1="${st.y}" x2="${st.x1}" y2="${st.y}" stroke="#fa0" stroke-width="2"/>`;
for (const p of b.bumpers) g += `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="#f80"/>`;
for (const n of b.nails) g += `<circle cx="${n.x}" cy="${n.y}" r="${PH.NAIL_R}" fill="#fd6"/>`;
g += `<circle cx="20" cy="20" r="${PH.BALL_R}" fill="#fff"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="1000" height="1000"><rect width="400" height="400" fill="#000"/>${g}${paths}</svg>`;
const { chromium } = createRequire(import.meta.url)('playwright');
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1000, height: 1000 } });
await pg.setContent(`<body style="margin:0">${svg}</body>`);
await pg.screenshot({ path: out });
await br.close();
