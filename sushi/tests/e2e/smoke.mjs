// 桌機和手機橫向：載入標題畫面、進主選單。
import { runE2E, waitScene, DESKTOP, PHONE } from '../e2e-util.mjs';

await runE2E('smoke', async ({ open, check, shot }) => {
  for (const [label, vp, opts] of [['desktop', DESKTOP, {}], ['phone', PHONE, { touch: true, mobile: true, dpr: 1 }]]) {
    const page = await open(vp, '?debug=1&seed=1', opts);
    await waitScene(page, 'title');
    check(await page.locator('.title-name').isVisible(), `${label}：看得到標題`);
    const box = await page.locator('#stage').boundingBox();
    check(Math.abs(box.width / box.height - 16 / 9) < 0.01, `${label}：舞台是 16:9（${box.width}×${box.height}）`);
    check(box.width <= vp.width + 1 && box.height <= vp.height + 1, `${label}：舞台沒有超出視窗`);
    await shot(page, `p0-title-${label}.png`);
    // 點畫布進主選單
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await waitScene(page, 'menu');
    for (const id of ['owner', 'customer', 'settings']) {
      const b = await page.locator(`button[data-id="${id}"]`).boundingBox();
      check(b && b.width >= 40 && b.height >= 40, `${label}：主選單按鈕 ${id} 夠大（${Math.round(b.width)}×${Math.round(b.height)}）`);
      check(b.y >= box.y && b.y + b.height <= box.y + box.height + 1, `${label}：按鈕 ${id} 在舞台內`);
    }
    await shot(page, `p0-menu-${label}.png`);
    await page.click('button[data-id="owner"]');
    await waitScene(page, 'owner-menu');
    check(await page.locator('button[data-id="levels"]').isVisible(), `${label}：店家選單有關卡模式`);
    await page.click('button[data-id="back"]');
    await waitScene(page, 'menu');
    // 佔位場景和返回
    await page.click('button[data-id="settings"]');
    await page.waitForFunction(() => window.__sushi.scenes().length >= 1 && window.__sushi.scene() !== 'menu');
    await page.keyboard.press('Escape');
    await waitScene(page, 'menu');
    check(true, `${label}：子畫面可以返回主選單`);
    await page.context().close();
  }
  // 沒有 debug 參數時不掛除錯介面
  const page = await open(DESKTOP, '');
  await page.waitForSelector('.title-name');
  check(await page.evaluate(() => typeof window.__sushi === 'undefined'), '沒有 ?debug=1 時 window.__sushi 不存在');
  // 鍵盤也能開始
  await page.keyboard.press('Enter');
  await page.waitForSelector('button[data-id="owner"]');
  check(true, '按鍵可以從標題進主選單');
});
