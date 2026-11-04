// 截圖：各個畫面各一張，存到 screenshots/。
// 用法：node tests/e2e/screens.mjs [資料夾] [倍率]
import { chromium } from '../pw.mjs';
import { startServer } from '../serve.mjs';

const outDir = process.argv[2] || 'screenshots';
const scale = +(process.argv[3] || 2);
const { server, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
await page.addInitScript(() => {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
  window.__pad = pad;
  navigator.getGamepads = () => [pad, null, null, null];
  window.__press = (i, ms = 220) => { pad.buttons[i] = { pressed: true, value: 1 }; setTimeout(() => { pad.buttons[i] = { pressed: false, value: 0 }; }, ms); };
});
const wait = (ms) => page.waitForTimeout(ms);
const render = async (on) => { await page.evaluate((v) => window.__hoops.setRender(v), on); await wait(on ? 1500 : 200); };
const shot = async (name) => { await page.screenshot({ path: `${outDir}/${name}.png` }); console.log('📸', name); };
const go = (n, o) => page.evaluate(([a, b]) => window.__app.go(a, b), [n, o || {}]);

await page.goto(`http://127.0.0.1:${port}/index.html`);
await wait(2500);
await shot('01-title');
await page.keyboard.press('Enter');
await wait(800);
await shot('02-menu');
await go('songs');
await wait(1200);
await shot('03-song-select');
await go('songlab', { back: 'menu' });
await wait(800);
// 點幾個片段
for (const key of ['c-drums-5', 'c-bass-5', 'c-lead-0', 'c-fx-1']) {
  await page.click(`[data-key="${key}"]`);
  await wait(250);
}
await page.click('[data-key="add"]');
await wait(1500);
await shot('04-song-lab');
await go('rhythm');
await wait(500);
await go('calib', { back: 'rhythm' });
await wait(1200);
for (let i = 0; i < 5; i++) { await page.keyboard.press('Space'); await wait(600); }
await shot('05-calibration');
await go('help', { back: 'menu' });
await wait(600);
await shot('06-help');

// 比賽：主隊用手把（1P），客隊電腦
await page.evaluate(() => {
  const app = window.__app;
  app.settings.homeSong = 'house120';
  app.settings.awaySong = 'chip170';
  window.__hoopbeat.startMatch({ quarterMinutes: 2, humans: [{ id: 'pad0', team: 0 }] });
});
await render(false);
await wait(9000);
// 換戰術：十字鍵 ↑（全速衝刺）
await page.evaluate(() => window.__press(12));
await wait(400);
// 跟著拍點按幾下 A／X
for (let i = 0; i < 6; i++) {
  const ms = await page.evaluate(() => { const br = window.__hoopbeat.bridge; const n = br.now(); return (br.grid.nextBeat(n + 0.05).time - n) * 1000; });
  await wait(Math.max(0, ms - 15));
  await page.evaluate((b) => window.__press(b, 150), i % 2 ? 0 : 2);
  await wait(250);
}
await render(true);
await page.evaluate(() => window.__press(2, 150));
await wait(700);
await shot('07-match');
await render(false);
await wait(6000);
await render(true);
await wait(500);
await shot('08-match-tactic');

// 電腦對電腦（觀賞模式）快轉到比賽結束，看節奏統計
await page.evaluate(() => window.__hoopbeat.startMatch({ quarterMinutes: 2, cpuOnly: true, humans: [] }));
await render(false);
await page.evaluate(() => window.__hoops.setTimeScale(40));
for (let i = 0; i < 120; i++) {
  await wait(1000);
  const sc = await page.evaluate(() => window.__hoops.screen());
  if (sc === 'break') await page.evaluate(() => window.__hoops.continueBreak());
  if (sc === 'results') break;
}
await page.evaluate(() => window.__hoops.setTimeScale(1));
await render(true);
await wait(800);
await shot('09-results');
console.log('errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log(' ', e.slice(0, 400));
await browser.close();
server.close();
