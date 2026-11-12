// 右搖桿運球 + 手把接手鍵盤的測試。
//  1. 一開始只有鍵盤（預設在主隊）。接上手把之後，手把接手主隊、鍵盤退到「不下場」，開賽只有一位玩家。
//  2. 右搖桿往四個方向撥：換手（cross）、內外（inout）、急停再啟動（hesi）、後撤步（stepback）、衝刺＋往後＝轉身（spin）。
//  3. 鍵盤單打時中途接上手把：那位玩家直接換成手把。
// 用法：node tests/e2e/rightstick.mjs [截圖資料夾]
import { chromium } from '../pw.mjs';
import { startServer } from '../serve.mjs';

const outDir = process.argv[2] || null;
const { server, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: outDir ? 2 : 1 });
const errors = [];
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e.stack || e)));

await page.addInitScript(() => {
  const pad = {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0],
  };
  window.__pad = pad;
  window.__plugged = false;
  navigator.getGamepads = () => (window.__plugged ? [pad, null, null, null] : [null, null, null, null]);
  window.__hold = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
});
const sleep = (ms) => page.waitForTimeout(ms);
const assign = () => page.evaluate(() => Object.fromEntries(window.__app.assign));
const humans = () => page.evaluate(() => window.__hoopbeat.game.humans.map((h) => `${h.id}:${h.team}`).join(','));

await page.goto(`http://127.0.0.1:${port}/index.html`);
await sleep(1000);
await page.evaluate(() => window.__hoops.setRender(false));
await page.keyboard.press('Enter');
await sleep(300);

// ── 1. 手把接手鍵盤 ──
let a = await assign();
check(a.kb === -1, `只有鍵盤：鍵盤在主隊（${JSON.stringify(a)}）`);
await page.evaluate(() => { window.__plugged = true; });
await sleep(300);
a = await assign();
check(a.pad0 === -1 && a.kb === 0, `接上手把：手把接手主隊、鍵盤不下場（${JSON.stringify(a)}）`);
await page.evaluate(() => { window.__app.mode = 'play'; window.__app.startMatch({ skipSongs: true, quarterMinutes: 2 }); });
await sleep(300);
check((await humans()) === 'pad0:0', `開賽只有手把一位玩家（${await humans()}）`);

// ── 2. 右搖桿運球 ──
const setup = () => page.evaluate(() => {
  const g = window.__hoopbeat.game;
  window.__hoops.giveBallToHuman('1P');
  const p = g.humans[0].player;
  const side = g.attackSide(0);
  p.pos.x = side * 4; p.pos.z = 0; p.vel.x = 0; p.vel.z = 0; p.action = null; p.moveCooldown = 0; p.y = 0; p.vy = 0;
  p.facing = side > 0 ? 0 : Math.PI;
  p.anim.dribbleHand = 1;
  for (const d of g.onCourt(1)) { d.pos.x = -side * 9; d.pos.z = -4; }
  window.__moves = window.__moves || [];
  return side;
});
await page.evaluate(() => {
  window.__moves = [];
  window.__hoops.addStepHook((g) => { for (const e of g.events) if (e.type === 'dribbleMove') window.__moves.push(e.kind); });
});
for (let i = 0; i < 40; i++) { if (await page.evaluate(() => window.__hoopbeat.game.phase === 'live')) break; await sleep(300); }
// 面向進攻方向（side）、右手持球。世界座標：+z 是持球手那一側
const flick = async (fx, fy, sprint = false) => {
  const side = await setup();
  await sleep(120);
  await page.evaluate(([x, y, s, sp]) => { window.__hold(7, sp); window.__pad.axes[2] = x * s; window.__pad.axes[3] = y; }, [fx, fy, side, sprint]);
  await sleep(150);
  await page.evaluate(() => { window.__pad.axes[2] = 0; window.__pad.axes[3] = 0; window.__hold(7, false); });
  await sleep(500);
  return page.evaluate(() => window.__moves[window.__moves.length - 1]);
};
const side0 = await setup();
const hs = side0; // 面向 +x 時持球手在 +z；面向 −x 時在 −z
const first = await flick(0, hs);
check(first === 'inout', `往持球手那一側撥 → 內外運球（${first}，side ${side0}）`);
check((await flick(0, -hs)) === 'cross', '往另一側撥 → 換手運球');
check((await flick(1, 0)) === 'hesi', '往前撥 → 急停再啟動');
check((await flick(-1, 0)) === 'stepback', '往後撥 → 後撤步');
check((await flick(-1, 0, true)) === 'spin', '衝刺 + 往後撥 → 轉身');
const n = await page.evaluate(() => window.__moves.length);
check(n === 5, `每撥一次只算一次（共 ${n} 次）`);
// 推著不放不會連續觸發
await setup();
await page.evaluate(() => { window.__pad.axes[3] = 1; });
await sleep(1500);
await page.evaluate(() => { window.__pad.axes[3] = 0; });
check((await page.evaluate(() => window.__moves.length)) === 6, '推著不放只算一次');

if (outDir) {
  await setup();
  await page.evaluate(() => { const g = window.__hoopbeat.game; const p = g.humans[0].player; const d = g.onCourt(1)[0]; d.pos.x = p.pos.x + Math.cos(p.facing) * 1.6; d.pos.z = 0.4; });
  await page.evaluate(() => window.__hoops.setRender(true));
  await sleep(2500);
  await page.screenshot({ path: `${outDir}/12-player-models.png` });
  await page.evaluate(() => window.__hoops.setRender(false));
}

// ── 3. 鍵盤單打，中途接上手把 ──
await page.evaluate(() => { window.__plugged = false; });
await sleep(400);
await page.evaluate(() => window.__app.quitToMenu());
await sleep(300);
a = await assign();
check(a.kb === -1, `拔掉手把：位置還給鍵盤（${JSON.stringify(a)}）`);
await page.evaluate(() => { window.__app.mode = 'play'; window.__app.startMatch({ skipSongs: true, quarterMinutes: 2 }); });
await sleep(300);
check((await humans()) === 'kb:0', `只有鍵盤開賽（${await humans()}）`);
await page.evaluate(() => { window.__plugged = true; });
await sleep(400);
check((await humans()) === 'pad0:0', `比賽中接上手把：玩家換成手把（${await humans()}）`);

console.log('errors:', errors.length);
for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 500));
await browser.close();
server.close();
process.exit(errors.length || fails.length ? 1 : 0);
