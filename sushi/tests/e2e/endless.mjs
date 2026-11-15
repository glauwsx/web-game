// 無限模式：新遊戲、擺一個吧台座、雇人、開店、跑完一天、結算、確認存檔存在、重新載入後能繼續。
import { runE2E, waitScene, DESKTOP, PHONE } from '../e2e-util.mjs';

const E = (page) => page.evaluate(() => window.__sushi.app.scenes.top().debug.endless());
const S = (page) => page.evaluate(() => window.__sushi.state());

await runE2E('endless', async ({ open, check, shot }) => {
  const page = await open(DESKTOP, '?debug=1&seed=4&scene=owner');
  await waitScene(page, 'owner-menu');
  await page.click('button[data-id="endless"]');
  await waitScene(page, 'endless-menu');
  check(await page.locator('button[data-id="endless-continue"]').count() === 0, '沒有存檔時只有「新遊戲」');
  await page.click('button[data-id="endless-new"]');
  await waitScene(page, 'endless');
  let s = await S(page);
  check(s.money === 300000 && s.shop.w === 8 && s.shop.furniture.length === 5, '新遊戲：資金 ¥300,000、8×8 的店、1 座板前檯和 4 個吧台座');
  check(/第 1 年 1 月 第 1 週 星期一/.test(await page.locator('.hud-title').textContent()), 'HUD 顯示日期');

  // 建造：擺一個吧台座
  await page.click('[data-tab="build"]');
  await page.click('[data-id="build-pick-counterSeat"]');
  check(/擺放「吧台座」/.test(await page.locator('[data-id="build-note"]').textContent()), '選了家具之後有操作說明');
  const at = (gx, gy) => page.evaluate(([x, y]) => window.__sushi.app.scenes.top().debug.cellScreen(x, y), [gx, gy]);
  let p = await at(5, 2);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(150);
  await shot(page, 'p7-build.png');
  await page.mouse.click(p.x, p.y);
  s = await S(page);
  check(s.shop.furniture.length === 6 && s.money === 292000, `點地板擺了一個吧台座（資金 ¥${s.money}）`);
  // 重疊的位置擺不上去
  p = await at(2, 2);
  await page.mouse.click(p.x, p.y);
  check((await S(page)).shop.furniture.length === 6, '已經有東西的格子擺不上去');
  // 移動、賣出
  await page.click('[data-id="build-move"]');
  p = await at(5, 2); await page.mouse.click(p.x, p.y);
  p = await at(5, 5); await page.mouse.click(p.x, p.y);
  s = await S(page);
  const moved = s.shop.furniture[5];
  check(moved.x === 5 && moved.y === 5 && s.money === 292000, '移動家具（免費）');
  await page.click('[data-id="build-sell"]');
  p = await at(5, 5); await page.mouse.click(p.x, p.y);
  s = await S(page);
  check(s.shop.furniture.length === 5 && s.money === 296000, '賣出家具，退回一半');
  await page.click('[data-id="build-pick-counterSeat"]');
  p = await at(5, 2); await page.mouse.click(p.x, p.y);
  await page.click('[data-id="build-cancel"]');
  check((await S(page)).shop.furniture.length === 6, '再擺回去');

  // 經營：雇本田、借款、還款
  await page.click('[data-tab="manage"]');
  check(await page.locator('.quest-row').count() === 3, '任務一次顯示 3 個');
  await page.click('[data-id="hire-honda"]');
  check((await S(page)).staff.length === 2, '雇用本田');
  await page.click('[data-id="loan-borrow"]');
  check((await E(page)).loan === 50000, '向中川借 ¥50,000');
  await page.click('[data-id="loan-repay"]');
  check((await E(page)).loan === 0, '還款');
  await shot(page, 'p7-manage.png');
  await page.click('[data-tab="staff"]');
  await page.click('[data-id="role-honda-floor"]');

  // 進貨、開店、跑完一天
  await page.click('[data-tab="buy"]');
  await page.click('button[data-id="suggest"]');
  await page.click('button[data-id="buy"]');
  await page.click('button[data-id="open"]');
  check((await S(page)).phase === 'open', '開店');
  check(await page.evaluate(() => !!localStorage.getItem('sushi.v1.endless')), '開店時自動存檔');
  await page.click('[data-tab="build"]');
  check(await page.locator('[data-id="build-pick-counterSeat"]').isDisabled(), '營業中不能擺設');
  await page.evaluate(() => { for (let i = 0; i < 40 && window.__sushi.state().phase === 'open'; i++) window.__sushi.step(200); });
  await waitScene(page, 'results');
  await shot(page, 'p7-results.png');
  check(/打烊結算/.test(await page.locator('.results-panel .menu-title').textContent()), '打烊後看到結算畫面');
  check(/租金/.test(await page.locator('.results-panel').textContent()), '結算有租金');
  check(/靈感點/.test(await page.locator('[data-id="endless-extra"]').textContent()), '結算有靈感點');
  await page.click('button[data-id="next-day"]');
  await waitScene(page, 'endless');
  const e1 = await E(page);
  s = await S(page);
  check(e1.day === 1 && s.phase === 'prep', '進到第 2 天的準備階段');
  await page.waitForTimeout(400);
  check(/星期二/.test(await page.locator('.hud-title').textContent()), '日期往前一天');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sushi.v1.endless')));
  check(saved && saved.day === 1 && saved.s.shop.furniture.length === 6, '結算後自動存檔');
  const money = s.money;

  // 重新載入後能繼續
  await page.reload();
  await page.goto(page.url().replace('scene=owner', 'scene=endless'));
  await waitScene(page, 'endless-menu');
  check(await page.locator('button[data-id="endless-continue"]').count() === 1, '重新載入後有「繼續經營」');
  await page.click('button[data-id="endless-continue"]');
  await waitScene(page, 'endless');
  s = await S(page);
  check(s.money === money && s.shop.furniture.length === 6 && s.staff.length === 2 && (await E(page)).day === 1, '繼續經營：資金、家具、員工、日期都在');
  // 研發（測試用：直接給靈感點）、擴建
  await page.evaluate(() => { const E0 = window.__sushi.app.scenes.top().debug.full(); E0.insp = 30; });
  await page.click('[data-tab="manage"]');
  await page.click('[data-id="research-pachinko"]');
  await page.click('[data-tab="build"]');
  check(await page.locator('[data-id="build-pick-pachinko"]').count() === 1, '研發小鋼珠台之後可以買');
  await page.click('[data-id="build-expand"]');
  s = await S(page);
  check(s.shop.w === 10 && s.shop.h === 10, '擴建到 10×10');
  await page.waitForTimeout(300);
  await shot(page, 'p7-expanded.png');
  // 暫停選單：存檔並回主選單
  await page.keyboard.press('Escape');
  await waitScene(page, 'pause');
  await page.click('button[data-id="quit"]');
  await waitScene(page, 'owner-menu');
  check(true, '存檔並回主選單');

  // 設定畫面有匯出、匯入
  const set = await open(DESKTOP, '?debug=1&scene=settings');
  await waitScene(set, 'settings');
  check(await set.locator('[data-id="export-endless"]').count() === 1 && await set.locator('[data-id="import-endless"]').count() === 1, '設定畫面有匯出、匯入無限模式存檔');
  await set.setInputFiles('[data-id="import-file"]', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1}') });
  await set.waitForTimeout(300);
  check(await set.evaluate(() => !localStorage.getItem('sushi.v1.endless')), '匯入不是存檔的檔案：不會寫入');
  await set.setInputFiles('[data-id="import-file"]', { name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await set.waitForTimeout(300);
  check(await set.evaluate(() => JSON.parse(localStorage.getItem('sushi.v1.endless')).day) === 1, '匯入存檔');

  // 手機橫向
  const phone = await open(PHONE, '?debug=1&seed=2&scene=endless:new', { touch: true, mobile: true });
  await waitScene(phone, 'endless');
  await phone.click('button[data-id="drawer"]');
  await phone.click('[data-tab="build"]');
  const b = await phone.locator('[data-id="build-pick-counterSeat"]').boundingBox();
  check(b && b.height >= 40 && b.width >= 40, `手機上建造按鈕夠大（${Math.round(b.width)}×${Math.round(b.height)}）`);
  await phone.waitForTimeout(300);
  await shot(phone, 'p7-phone-build.png');
});
