// 冒煙測試：開頁面 → console 沒有錯誤 → 用模擬手把進行比賽 → 截圖。
// 用法：node tests/e2e/smoke.mjs [輸出資料夾]
import { chromium } from '../pw.mjs';
import { startServer } from '../serve.mjs';

const outDir = process.argv[2] || 'screenshots';
const { server, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/_title.png` });
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/_menu.png` });
await page.evaluate(() => window.__hoopbeat.startMatch({ quarterMinutes: 2 }));
await page.waitForTimeout(6000);
await page.screenshot({ path: `${outDir}/_match.png` });
const st = await page.evaluate(() => window.__hoopbeat.state());
console.log(JSON.stringify(st));
console.log('errors:', errors.length);
for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 400));
await browser.close();
server.close();
