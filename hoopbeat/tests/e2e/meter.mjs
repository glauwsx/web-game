// 投籃條截圖：同一個人按住投籃，慢歌（80 BPM）和快歌（170 BPM）的投籃條各拍一張。
// 用法：node tests/e2e/meter.mjs [資料夾] [倍率]
import { chromium } from '../pw.mjs';
import { startServer } from '../serve.mjs';

const outDir = process.argv[2] || 'screenshots';
const scale = +(process.argv[3] || 2);
const { server, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForTimeout(1000);
await page.keyboard.press('Enter');
const results = [];
for (const [song, name] of [['lofi80', '10-shot-meter-80bpm'], ['chip170', '11-shot-meter-170bpm']]) {
  await page.evaluate((s) => {
    window.__hoops.setRender(false);
    window.__app.settings.homeSong = s;
    window.__app.settings.awaySong = s;
    window.__hoopbeat.startMatch({ quarterMinutes: 2, humans: [{ id: 'kb', team: 0 }] });
  }, song);
  // 等到比賽開始，把球給 1P，放到罰球線附近
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => window.__hoopbeat.game.phase === 'live')) break;
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => {
    const g = window.__hoopbeat.game;
    const p = g.humans[0].player;
    g.gainBall(p, 'loose');
    const side = g.attackSide(0);
    p.pos.x = side * 7.2; p.pos.z = 1.5; p.vel.x = 0; p.vel.z = 0;
    for (const d of g.onCourt(1)) { d.pos.x = -side * 9; d.pos.z = -4; }
  });
  // 等跳球的球員落地、站穩
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => { const g = window.__hoopbeat.game; const p = g.humans[0].player; return !p.airborne && !p.action && g.ball.holder === p; });
    if (ok) break;
    await page.evaluate(() => { const g = window.__hoopbeat.game; const p = g.humans[0].player; if (g.ball.holder !== p) g.gainBall(p, 'loose'); });
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.__hoops.setRender(true));
  await page.waitForTimeout(2600);
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(60);
  const info = await page.evaluate(() => {
    const br = window.__hoopbeat.bridge;
    const a = window.__hoopbeat.game.humans[0].player.action;
    return a && a.beatWin ? { kind: a.kind, perfectMs: Math.round(a.beatWin.perfect), greatMs: Math.round(a.beatWin.great), leadMs: Math.round((a.beatTarget - a.beatStart) * 1000), untilBeatMs: Math.round((a.beatTarget - br.now()) * 1000), bpm: br.deck(0).bpm } : null;
  });
  // 等到投籃條快到強拍（強拍前 0.22 秒）再拍
  if (info) await page.waitForTimeout(Math.max(0, info.untilBeatMs - 220));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  await page.keyboard.up('KeyJ');
  await page.waitForTimeout(600);
  results.push({ song, ...info });
  console.log('📸', name, JSON.stringify(info));
  await page.evaluate(() => window.__app.quitToMenu());
}
console.log('errors:', errors.length);
for (const e of errors.slice(0, 5)) console.log(' ', e.slice(0, 300));
await browser.close();
server.close();
