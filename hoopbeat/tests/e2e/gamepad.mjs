// 手把模擬測試：注入假的 Xbox 手把，從標題畫面一路用手把操作到開賽，
// 比賽中跟著拍點按鍵、用十字鍵換戰術配樂，最後檢查判定與 console。
// 用法：node tests/e2e/gamepad.mjs [截圖資料夾]
import { chromium } from '../pw.mjs';
import { startServer } from '../serve.mjs';

const outDir = process.argv[2] || 'screenshots';
const { server, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e.stack || e)));

await page.addInitScript(() => {
  const pad = {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0],
  };
  window.__pad = pad;
  navigator.getGamepads = () => [pad, null, null, null];
  window.__press = (i, ms = 200) => {
    pad.buttons[i] = { pressed: true, value: 1 };
    setTimeout(() => { pad.buttons[i] = { pressed: false, value: 0 }; }, ms);
  };
  window.__hold = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  window.__stick = (x, y) => { pad.axes[0] = x; pad.axes[1] = y; };
});

const press = async (i, wait = 380, ms = 200) => { await page.evaluate(([b, m]) => window.__press(b, m), [i, ms]); await page.waitForTimeout(Math.max(wait, ms + 120)); };
const screen = () => page.evaluate(() => window.__hoops.screen());
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForTimeout(1200);
// 無頭瀏覽器用軟體算繪 3D 很慢（約 5 FPS），操作時先關掉算繪，截圖時再打開
const render = async (on) => { await page.evaluate((v) => window.__hoops.setRender(v), on); await page.waitForTimeout(on ? 900 : 200); };
await render(false);
const log = [];
await press(A, 500);
log.push(`標題 → ${await screen()}`); console.log(log[log.length - 1]);
await press(A, 500); // 開始比賽
log.push(`主選單 → ${await screen()}`); console.log(log[log.length - 1]);
// 選隊：主隊、客隊各確定一次
for (let i = 0; i < 4 && (await screen()) === 'teams'; i++) await press(A, 500);
log.push(`選隊 → ${await screen()}`); console.log(log[log.length - 1]);
// 手把分配：把手把移到主隊（往左）
await press(LEFT, 300);
await render(true);
await page.screenshot({ path: `${outDir}/_controllers.png` });
await render(false);
await press(A, 600);
log.push(`手把分配 → ${await screen()}`); console.log(log[log.length - 1]);
await press(A, 800); // 比賽設定：跳球開賽 → 選歌
log.push(`比賽設定 → ${await screen()}`); console.log(log[log.length - 1]);
// 選歌：往上兩格到「客隊配樂」，往右換一首
for (let i = 0; i < 4; i++) await press(UP, 200);
await press(RIGHT, 400);
await render(true);
await page.screenshot({ path: `${outDir}/_songs.png` });
await render(false);
for (let i = 0; i < 4; i++) await press(DOWN, 200);
await press(A, 1500); // 跳球開賽
log.push(`選歌 → ${await screen() || '比賽中'}`); console.log(log[log.length - 1]);
const humans = await page.evaluate(() => window.__hoopbeat.game.humans.map((h) => `${h.id}:${h.team}`));
log.push(`玩家：${humans.join(',')}`); console.log(log[log.length - 1]);
console.log('fps', await page.evaluate(() => window.__hoops.perf.fps.toFixed(1)));

// 比賽：跳球時按 Y
await press(Y, 1500);
// 跑 20 秒：往籃框移動，跟著拍點按傳球／投籃／抄截
const t0 = Date.now();
let tactics = 0;
while (Date.now() - t0 < 22000) {
  const info = await page.evaluate(() => {
    const br = window.__hoopbeat.bridge;
    const g = window.__hoopbeat.game;
    const h = g.humans[0];
    const p = h && h.player;
    const now = br.now();
    const nb = br.grid.nextBeat(now + 0.05);
    const ns = br.grid.nextBeat(now + 0.25, { strongOnly: true });
    return { wait: (nb.time - now) * 1000, waitStrong: (ns.time - now) * 1000, hasBall: !!(p && g.ball.holder === p), side: g.attackSide(0), phase: g.phase, px: p ? p.pos.x : 0 };
  });
  const dir = info.side;
  await page.evaluate((d) => window.__stick(d * 0.8, 0.15 * Math.sin(Date.now() / 900)), dir);
  const r = Math.random();
  if (info.hasBall && Math.abs(info.px) > 5 && r < 0.45) {
    // 投籃：按住起跳，讓「放開」落在強拍上
    if (info.waitStrong > 200 && info.waitStrong < 1600) await page.waitForTimeout(info.waitStrong - 200);
    await press(X, 260, 200);
  } else {
    if (info.wait > 0 && info.wait < 900) await page.waitForTimeout(info.wait - 10);
    if (info.hasBall) {
      if (r < 0.75) await press(A, 200, 120); // 傳球
      else await press(B, 200, 120); // 過人
    } else if (r < 0.5) await press(X, 200, 120); // 抄截
  }
  if (tactics < 3 && Date.now() - t0 > 6000 * (tactics + 1)) {
    await press([UP, LEFT, DOWN][tactics], 200, 120);
    tactics += 1;
  }
  await page.waitForTimeout(40);
}
await render(true);
await page.screenshot({ path: `${outDir}/_play.png` });
const st = await page.evaluate(() => window.__hoopbeat.state());
const humanJudged = await page.evaluate(() => window.__hoopbeat.bridge.judgments.filter((j) => j.human).length);
const score = await page.evaluate(() => window.__hoopbeat.game.rules.score);
console.log(log.join('\n'));
console.log('state', JSON.stringify(st));
console.log('真人判定次數（最近 40 筆中）', humanJudged, '比分', JSON.stringify(score));
console.log('errors:', errors.length);
for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 500));
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
