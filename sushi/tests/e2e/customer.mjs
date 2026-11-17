// 顧客版本：選角色、進零用錢挑戰、玩一次小鋼珠、分數有記錄。也走過自由遊玩、圖鑑、排行榜。
import { runE2E, waitScene, DESKTOP, PHONE } from '../e2e-util.mjs';

await runE2E('customer', async ({ open, check, shot }) => {
  const page = await open(DESKTOP, '?debug=1&seed=1');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.click('[data-id="customer"]');
  await waitScene(page, 'customer');
  check((await page.locator('.cust-char').count()) === 6, '第一次進來先選角色（6 位）');
  await shot(page, 'p8-select.png');
  await page.click('[data-id="char-honda"]');
  check(await page.locator('[data-id="allowance"]').isVisible(), '選完角色看到玩法選單');

  // 零用錢挑戰：玩一次小鋼珠
  await page.click('[data-id="allowance"]');
  check((await page.locator('[data-id="cust-money"]').textContent()) === '¥5,000', '起始零用錢 ¥5,000');
  await page.click('[data-id="play-pachinko"]');
  await waitScene(page, 'pachinko');
  check((await page.evaluate(() => window.__sushi.mini().setting)) === 3, '零用錢挑戰的釘子設定固定是 3');
  await page.evaluate(() => { const d = window.__sushi.app.scenes.top().debug; d.setPower(0.4); d.hold(true); d.step(120 * 600); });
  await page.waitForSelector('.pk-result:not(.hidden)');
  const value = await page.evaluate(() => window.__sushi.mini().value);
  await page.click('[data-id="pk-done"]');
  await waitScene(page, 'customer');
  const run = await page.evaluate(() => window.__sushi.state().run);
  check(run.money === 4500 && run.plays === 1 && run.score === value, `扣了入場費 ¥500，分數 ¥${run.score} 等於獎品價值`);
  // 賽車：用自動駕駛跑完，分數 = 價值 × 完整度
  await page.click('[data-id="play-race"]');
  await waitScene(page, 'race');
  check((await page.evaluate(() => window.__sushi.state().cars.at(-1).stats.top)) > 1, '本田的最高速度比較高');
  await page.evaluate(() => { const d = window.__sushi.app.scenes.top().debug; d.auto(true); d.step(60 * 200); });
  await page.waitForSelector('.race-result:not(.hidden)');
  await page.click('[data-id="race-done"]');
  await waitScene(page, 'customer');
  const run2 = await page.evaluate(() => window.__sushi.state().run);
  check(run2.money === 3700 && run2.score > run.score, `賽車扣了 ¥800，分數變成 ¥${run2.score}`);
  await page.click('[data-id="finish"]');
  await page.waitForSelector('[data-id="cust-final"]');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sushi.v1.customer')));
  check(saved.board.length === 1 && saved.board[0].score === run2.score && saved.board[0].char === 'honda', '成績存進排行榜');
  check(Object.keys(saved.zukan).length > 0, `圖鑑點亮了 ${Object.keys(saved.zukan).length} 種`);
  await shot(page, 'p8-allowance.png');

  // 排行榜、圖鑑
  await page.click('[data-id="to-board"]');
  check((await page.locator('.cust-rank').count()) === 1, '排行榜看得到這一筆');
  await shot(page, 'p8-board.png');
  await page.click('[data-id="back"]');
  await page.click('[data-id="zukan"]');
  check((await page.locator('.zk-cell').count()) === 15, '圖鑑有 12 種壽司加 3 種套餐');
  check((await page.locator('.zk-cell.on').count()) === Object.keys(saved.zukan).length, '贏過的點亮');
  await shot(page, 'p8-zukan.png');
  await page.click('[data-id="back"]');

  // 自由遊玩：不花錢，記錄最佳成績
  await page.click('[data-id="free"]');
  await page.click('[data-id="nail-loose"]');
  await page.click('[data-id="play-pachinko"]');
  await waitScene(page, 'pachinko');
  check((await page.evaluate(() => window.__sushi.mini().setting)) === 5, '自由遊玩選「鬆」是釘子設定 5');
  await page.evaluate(() => { const d = window.__sushi.app.scenes.top().debug; d.setPower(0.4); d.hold(true); d.step(120 * 600); });
  await page.waitForSelector('.pk-result:not(.hidden)');
  await page.click('[data-id="pk-done"]');
  await waitScene(page, 'customer');
  const best = await page.evaluate(() => window.__sushi.state().save.best);
  check(best['pk:ryujin:5'] !== undefined, `自由遊玩記錄最佳成績（¥${best['pk:ryujin:5'].value}）`);
  await page.click('[data-id="level-shumaha"]');
  await page.click('[data-id="play-race"]');
  await waitScene(page, 'race');
  check(await page.evaluate(() => window.__sushi.state().cars.some((c) => c.kind === 'shumaha')), '可以選修馬哈當對手');
  await page.keyboard.press('Escape');
  await waitScene(page, 'customer');
  await shot(page, 'p8-free.png');

  // 重新載入：角色和紀錄都還在
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__sushi.app.go('customer'));
  await waitScene(page, 'customer');
  check((await page.evaluate(() => window.__sushi.app.scenes.top().debug.page())) === 'menu', '重新載入後直接進玩法選單（記得角色）');

  // 手機橫向
  const phone = await open(PHONE, '?debug=1&scene=customer', { touch: true, mobile: true });
  await waitScene(phone, 'customer');
  const b = await phone.locator('[data-id="char-reiko"]').boundingBox();
  check(b && b.height >= 40, '手機上角色按鈕夠大');
  await phone.click('[data-id="char-reiko"]');
  await phone.click('[data-id="free"]');
  const c = await phone.locator('[data-id="level-3"]').boundingBox();
  check(c && c.width >= 40 && c.height >= 40, `手機上選項按鈕夠大（${Math.round(c.width)}×${Math.round(c.height)}）`);
  await shot(phone, 'p8-phone.png');
});
