// 鍵盤測試：在拍點上送出按鍵事件，確認判定用的是按鍵事件的精確時間（應該是 Perfect／Great）。
// 用法：node tests/e2e/keyboard.mjs
import { chromium } from '../pw.mjs';
import { startServer } from '../serve.mjs';

const { server, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForTimeout(1000);
await page.keyboard.press('Enter');
await page.evaluate(() => { window.__hoops.setRender(false); window.__hoopbeat.startMatch({ quarterMinutes: 2, humans: [{ id: 'kb', team: 0 }] }); });
await page.waitForTimeout(8000);
const results = [];
for (let i = 0; i < 8; i++) {
  // 在頁面裡排一個剛好落在下一拍的按鍵（抄截或傳球都用這兩顆）
  const r = await page.evaluate(() => new Promise((resolve) => {
    const br = window.__hoopbeat.bridge;
    const g = window.__hoopbeat.game;
    const p = g.humans[0].player;
    const mine = g.ball.holder === p;
    const code = mine ? 'KeyK' : 'KeyJ';
    const now = br.now();
    const nb = br.grid.nextBeat(now + 0.25);
    const before = br.judgments.length;
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.slice(3).toLowerCase() }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code.slice(3).toLowerCase() })), 60);
      setTimeout(() => {
        const j = br.judgments.slice(before).find((x) => x.human);
        resolve(j ? { grade: j.grade, offsetMs: Math.round(j.offsetMs), kind: j.kind } : null);
      }, 300);
    }, (nb.time - now) * 1000);
  }));
  if (r) results.push(r);
  await page.waitForTimeout(500);
}
console.log(JSON.stringify(results));
const good = results.filter((r) => r.grade === 'perfect' || r.grade === 'great').length;
console.log(`判定 ${results.length} 次，Perfect／Great ${good} 次；errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log(' ', e.slice(0, 300));
await browser.close();
server.close();
process.exit(errors.length || !results.length || good < results.length * 0.6 ? 1 : 0);
