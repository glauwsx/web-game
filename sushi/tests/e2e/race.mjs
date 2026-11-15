// 賽車：用鍵盤開一小段，再用除錯用的自動駕駛跑完一場，看到名次。也量繪圖時間。
import { runE2E, waitScene, DESKTOP, PHONE } from '../e2e-util.mjs';

await runE2E('race', async ({ open, check, shot }) => {
  const page = await open(DESKTOP, '?debug=1&seed=1&scene=race:shoyu');
  await waitScene(page, 'race');
  check(await page.locator('.race-hud').isVisible(), '看得到賽車的 HUD');
  // 倒數結束後用鍵盤開
  await page.waitForFunction(() => window.__sushi.mini().t > 0, null, { timeout: 8000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  const a = await page.evaluate(() => window.__sushi.mini());
  check(a.speed > 2000, `按住 ↑ 會加速（速度 ${Math.round(a.speed)}）`);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  check((await page.evaluate(() => window.__sushi.mini().boosts)) === 2, '空白鍵用掉一次噴射');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  const st = await page.evaluate(() => window.__sushi.state().cars.at(-1));
  check(st.x < 0, `按 ← 會往左（x = ${st.x.toFixed(2)}）`);
  await shot(page, 'p5-race.png');
  // 繪圖效能：平均每個畫面的繪圖時間低於 8 毫秒
  const ms = await page.evaluate(() => window.__sushi.mini().renderMs);
  check(ms < 8, `平均繪圖時間 ${ms.toFixed(2)} 毫秒（要低於 8）`);
  // 交給自動駕駛，快轉到終點
  await page.evaluate(() => { const d = window.__sushi.app.scenes.top().debug; d.auto(true); d.step(60 * 200); });
  await page.waitForSelector('.race-result:not(.hidden)');
  const m = await page.evaluate(() => window.__sushi.mini());
  check(m.over && m.result && m.result.place >= 1 && m.result.place <= 6, `跑完一場，看到名次（第 ${m.result.place} 名，${m.result.time.toFixed(1)} 秒）`);
  check(/第 \d 名/.test(await page.locator('[data-id="race-place"]').textContent()), '結果畫面顯示名次');
  await shot(page, 'p5-race-result.png');
  await page.click('button[data-id="race-done"]');
  await waitScene(page, 'menu');
  check(true, '結束後可以離開');

  // 山葵山道（有坡）
  const hill = await open(DESKTOP, '?debug=1&scene=race:wasabi');
  await waitScene(hill, 'race');
  await hill.evaluate(() => { const d = window.__sushi.app.scenes.top().debug; d.auto(true); d.step(1500); });
  await hill.waitForTimeout(300);
  await shot(hill, 'p5-race-hill.png');
  check((await hill.evaluate(() => window.__sushi.mini().renderMs)) < 8, '有坡的賽道繪圖時間也低於 8 毫秒');

  // 手機橫向：有觸控按鈕
  const phone = await open(PHONE, '?debug=1&scene=race', { touch: true, mobile: true });
  await waitScene(phone, 'race');
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']) {
    const b = await phone.locator(`button[data-key="${key}"]`).boundingBox();
    check(b && b.width >= 40 && b.height >= 40, `手機上有 ${key} 的觸控按鈕（${Math.round(b.width)}×${Math.round(b.height)}）`);
  }
  await phone.waitForFunction(() => window.__sushi.mini().t > 0 || true);
  await phone.evaluate(() => window.__sushi.app.scenes.top().debug.step(1));
  const gas = await phone.locator('button[data-key="ArrowUp"]').boundingBox();
  await phone.mouse.move(gas.x + gas.width / 2, gas.y + gas.height / 2);
  await phone.mouse.down();
  await phone.waitForTimeout(1000);
  await phone.mouse.up();
  check((await phone.evaluate(() => window.__sushi.mini().speed)) > 1000, '按住油門鈕會加速');
  await shot(phone, 'p5-race-phone.png');
});
