// 圖鑑頁和展示場景：能開、沒有錯誤、截圖存檔。
import path from 'node:path';
import { runE2E, waitScene, DESKTOP, PHONE, SHOTS } from '../e2e-util.mjs';

await runE2E('gallery', async ({ open, check, shot }) => {
  const page = await open({ width: 1500, height: 900 }, 'gallery.html');
  await page.waitForSelector('body[data-ready="1"]');
  const chars = await page.locator('.char').count();
  check(chars >= 14 + 12, `圖鑑列出所有角色（${chars} 個）`);
  check(await page.locator('.char[data-char="ryo"] canvas').count() === 17, '每個角色列出全部姿勢（正面 7、背面 7、翻轉、大頭像 2）');
  const cells = await page.locator('.row .cell').count();
  check(cells >= 40, `圖鑑列出家具、壽司、瓦片（${cells} 格）`);
  check((await page.content()).indexOf('⟦') < 0, '圖鑑頁沒有漏掉的字串');
  await page.screenshot({ path: path.join(SHOTS, 'gallery.png'), fullPage: true });

  // 展示場景
  const demo = await open(DESKTOP, '?debug=1&scene=demo', { dpr: 2 });
  await waitScene(demo, 'demo');
  await demo.waitForTimeout(400);
  await shot(demo, 'p1-demo.png');
  const before = await demo.evaluate(() => window.__sushi.state().cam);
  // 拖曳平移
  await demo.mouse.move(700, 400);
  await demo.mouse.down();
  await demo.mouse.move(600, 380, { steps: 4 });
  await demo.mouse.up();
  // 滾輪放大
  await demo.mouse.wheel(0, -200);
  await demo.waitForTimeout(100);
  const after = await demo.evaluate(() => window.__sushi.state().cam);
  check(after.zoom === 2, '滾輪可以放大到 2 倍');
  check(after.x !== before.x || after.y !== before.y, '拖曳可以平移');
  await shot(demo, 'p1-demo-zoom.png');
  await demo.keyboard.press('Escape');
  await waitScene(demo, 'menu');
  check(true, '展示場景可以返回');

  const phone = await open(PHONE, '?debug=1&scene=demo', { touch: true, mobile: true });
  await waitScene(phone, 'demo');
  await phone.waitForTimeout(300);
  check(await phone.locator('button[data-id="zoom"]').isVisible(), '手機橫向看得到展示場景');
});
