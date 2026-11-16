// 效能（計劃書 17.4）：20×16 的店、60 位顧客、4 倍速，平均每個畫面的更新加繪圖低於 10 毫秒。也量多層樓的店。
// 另外量首次載入時間（本機不超過 2 秒）和原始碼大小（低於 1.5 MB）。
import fs from 'node:fs';
import path from 'node:path';
import { runE2E, waitScene, DESKTOP, ROOT } from '../e2e-util.mjs';

function srcSize(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? srcSize(p) : fs.statSync(p).size;
  }
  return n;
}

await runE2E('perf', async ({ open, check }) => {
  const size = srcSize(path.join(ROOT, 'src')) + fs.statSync(path.join(ROOT, 'index.html')).size;
  check(size < 1.5 * 1024 * 1024, `原始碼總大小 ${(size / 1024).toFixed(0)} KB（要低於 1.5 MB）`);

  const page = await open(DESKTOP, '?debug=1&seed=1&scene=menu');
  const load = await page.evaluate(() => performance.getEntriesByType('navigation')[0].loadEventEnd);
  check(load < 2000, `首次載入 ${Math.round(load)} 毫秒（要低於 2 秒）`);

  for (const floors of [1, 3]) {
    // 用無限模式建一間 20×16 的店，擺滿桌位和板前檯
    await page.evaluate(async (nFloors) => {
      const N = await import('./src/sim/endless.js');
      const { startEndless } = await import('./src/modes/owner-endless.js');
      const { FLOOR_STRIDE } = await import('./src/sim/pathfind.js');
      const E = N.createEndless(7);
      const s = E.s;
      const rich = () => { s.money = 1e9; s.reputation = 100; };
      rich();
      for (let i = 0; i < 4; i++) { rich(); N.applyEndless(E, { type: 'expand' }); }
      for (let k = 1; k < nFloors; k++) { rich(); N.applyEndless(E, { type: 'addFloor', kind: 'normal' }); }
      for (const id of ['honda', 'terai', 'matoi', 'reiko', 'nakagawa']) N.applyEndless(E, { type: 'hire', staff: id });
      for (let k = 0; k < nFloors; k++) {
        const x0 = k * FLOOR_STRIDE;
        for (let x = 1; x < 19; x += 4) { rich(); N.applyEndless(E, { type: 'place', furniture: 'chefStation', x: x0 + x, y: 1 }); }
        for (let y = 4; y < 15; y += 3) for (let x = 1; x < 19; x += 3) { rich(); N.applyEndless(E, { type: 'place', furniture: 'tableSet', x: x0 + x, y }); }
      }
      s.staff.forEach((st, i) => N.applyEndless(E, { type: 'setRole', staff: st.id, role: i < 4 ? 'chef' : 'floor' }));
      for (const id of Object.keys(s.stock)) s.stock[id].premium = 500;
      window.__sushi.app.scenes.reset({ name: 'blank' });
      startEndless(window.__sushi.app, E);
    }, floors);
    await waitScene(page, 'endless');
    const n = await page.evaluate(() => {
      const s = window.__sushi.app.scenes.top().state;
      s.baseArrival = 3;
      window.__sushi.act({ type: 'open' });
      for (let i = 0; i < 8 * 120 && s.customers.length < 60; i++) window.__sushi.step(1);
      s.baseArrival = 0.6;
      window.__sushi.app.scenes.top().setSpeed(4);
      return { n: s.customers.length, w: s.shop.w, h: s.shop.h, seats: s.shop.furniture.filter((f) => f.type === 'tableSet').length * 4 };
    });
    check(n.w === 20 && n.h === 16, `${floors} 層樓：店面是 ${n.w}×${n.h}（${n.seats} 個桌位座位）`);
    check(n.n >= 60, `${floors} 層樓：店裡有 ${n.n} 位顧客`);
    await page.waitForTimeout(500);
    await page.evaluate(() => { const f = window.__sushi.app.frameStats; f.n = 0; f.ms = 0; f.max = 0; });
    await page.waitForTimeout(3000);
    const f = await page.evaluate(() => ({ ...window.__sushi.app.frameStats, customers: window.__sushi.app.scenes.top().state.customers.length }));
    const avg = f.ms / Math.max(1, f.n);
    check(avg < 10, `${floors} 層樓、4 倍速：平均每個畫面 ${avg.toFixed(2)} 毫秒（最慢 ${f.max.toFixed(1)}，${f.n} 個畫面，顧客 ${f.customers} 位，要低於 10）`);
  }
});
