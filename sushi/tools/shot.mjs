// 開發用：截一張圖。用法：node tools/shot.mjs <網址路徑> <輸出檔> [寬] [高] [整頁=1] [等待毫秒]
import { chromium } from '../tests/pw.mjs';
import { startServer } from '../tests/serve.mjs';

const [url = '', out = 'shot.png', w = '1366', h = '768', full = '0', wait = '300'] = process.argv.slice(2);
const { server, port } = await startServer(0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/${url}`);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, fullPage: full === '1' });
await browser.close();
server.close();
