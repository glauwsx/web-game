// 截圖工具：node tools/shot.mjs <輸出資料夾>
import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2];
const { server, port } = await startServer(0);
const br = await chromium.launch();
const errors = [];
async function run(name, viewport, id, steps, power, opts = {}) {
  const pg = await br.newPage({ viewport, deviceScaleFactor: 1 });
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  pg.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await pg.goto(`http://127.0.0.1:${port}/`);
  await pg.waitForTimeout(400);
  if (!id) { await pg.screenshot({ path: `${out}/${name}.png` }); await pg.close(); return; }
  await pg.click(`#card-${id}`);
  if (opts.help) { await pg.waitForTimeout(300); await pg.screenshot({ path: `${out}/${name}.png` }); await pg.close(); return; }
  await pg.click('.modal button.primary');
  if (opts.labels) await pg.click('#btn-labels');
  await pg.evaluate(({ steps, power, force }) => {
    const d = window.__pachinko.debug;
    if (power != null) d.setPower(power);
    d.setFiring(true);
    if (force) { d.logic.debugWin(); d.step(force); }
    d.step(steps);
  }, { steps, power, force: opts.force });
  await pg.waitForTimeout(350);
  await pg.screenshot({ path: `${out}/${name}.png` });
  await pg.close();
}
await run('hall-desktop', { width: 1280, height: 800 });
await run('hall-phone', { width: 390, height: 844 });
await run('tulip-desktop', { width: 1280, height: 800 }, 'tulip', 3000);
await run('tulip-phone', { width: 390, height: 844 }, 'tulip', 3000);
await run('hane-desktop', { width: 1280, height: 800 }, 'hane', 6000);
await run('ama-desktop', { width: 1280, height: 800 }, 'ama', 6000);
await run('ama-labels', { width: 1000, height: 1000 }, 'ama', 600, null, { labels: true });
await run('ama-phone', { width: 390, height: 844 }, 'ama', 4000);
await run('ama-jackpot', { width: 1280, height: 800 }, 'ama', 1500, null, { force: 1700 });
await run('ama-st-phone', { width: 390, height: 844 }, 'ama', 12000, null, { force: 1700 });
await run('hane-jackpot', { width: 1280, height: 800 }, 'hane', 700, null, { force: 300 });
await run('mid-help', { width: 390, height: 844 }, 'mid', 0, null, { help: true });
await br.close(); server.close();
console.log(errors.length ? errors.join('\n') : 'no console errors');
