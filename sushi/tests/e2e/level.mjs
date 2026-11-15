// 第 1 關：用 UI 完成進貨和開店，用 step 快轉到打烊，看到結算畫面和星數。
import { runE2E, waitScene, DESKTOP, PHONE } from '../e2e-util.mjs';

await runE2E('level', async ({ open, check, shot }) => {
  const page = await open(DESKTOP, '?debug=1&seed=1&scene=level:1');
  await waitScene(page, 'dialog');
  check(await page.locator('.dlg-text').isVisible(), '開場對話出現');
  check((await page.locator('.dlg-name').textContent()) === '夏春都', '第一句是夏春都說的');
  await shot(page, 'p3-dialog.png');
  // 講完 4 句
  for (let i = 0; i < 4; i++) await page.click('button[data-id="dlg-next"]');
  await waitScene(page, 'level');
  check(await page.locator('.hint').isVisible(), '教學提示框出現');
  check(await page.evaluate(() => window.__sushi.state().phase) === 'prep', '一開始是準備階段');
  await shot(page, 'p3-prep.png');

  // 照教學走：進貨分頁 → 建議量 → 進貨
  await page.click('[data-tab="buy"]');
  await page.waitForFunction(() => window.__sushi.app.scenes.top().debug.hintIndex() === 1);
  await page.click('button[data-id="suggest"]');
  await page.waitForFunction(() => window.__sushi.app.scenes.top().debug.hintIndex() === 2);
  const total = await page.locator('.buy-total').textContent();
  check(/¥[1-9]/.test(total), `建議量填好了（${total}）`);
  await shot(page, 'p3-buy.png');
  await page.click('button[data-id="buy"]');
  await page.waitForFunction(() => window.__sushi.app.scenes.top().debug.hintIndex() === 3);
  const st = await page.evaluate(() => window.__sushi.state());
  const stock = Object.values(st.stock).reduce((a, v) => a + v.premium, 0);
  check(stock > 50, `進貨成功（庫存 ${stock}）`);
  check(st.money < 20000, `有扣錢（剩 ¥${st.money}）`);

  // 菜單分頁：調一下售價
  await page.click('button[data-id="hint-next"]');
  await page.click('[data-tab="menu"]');
  await page.click('button[data-id="plus-maguro"]');
  check(await page.evaluate(() => window.__sushi.state().menu.maguro.price) === 310, '售價 + 鈕一次加 ¥10');
  await page.click('button[data-id="minus-maguro"]');

  // 開店
  await page.click('button[data-id="open"]');
  await page.waitForFunction(() => window.__sushi.state().phase === 'open');
  check(true, '按「開店」後開始營業');
  await page.click('button[data-id="hint-skip"]');
  check(!(await page.locator('.hint').isVisible()), '教學可以跳過');

  // 調速度
  await page.click('button[data-speed="4"]');
  await page.waitForTimeout(1500);
  const mid = await page.evaluate(() => window.__sushi.state());
  check(mid.tick > 60, `4 倍速下時間有在走（tick ${mid.tick}）`);
  await page.click('button[data-speed="0"]');
  const t1 = await page.evaluate(() => window.__sushi.state().tick);
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.__sushi.state().tick) === t1, '暫停時時間不動');

  // 快轉到中午，看畫面
  await page.evaluate(() => window.__sushi.step(700));
  await page.click('button[data-speed="1"]');
  await page.waitForTimeout(600);
  const noon = await page.evaluate(() => window.__sushi.state());
  check(noon.customers.length > 0, `中午有客人（${noon.customers.length} 人）`);
  check(noon.day.revenue > 0 || noon.day.pieces > 0, '已經賣出壽司');
  await shot(page, 'p3-open.png');

  // 點一位坐著的客人，看資訊浮窗
  const pos = await page.evaluate(() => {
    const sc = window.__sushi.app.scenes.top();
    const c = sc.state.customers.find((x) => ['wait', 'eat', 'decide'].includes(x.st));
    if (!c) return null;
    const v = sc.debug.view();
    const wx = (c.gx - c.gy) * 16;
    const wy = (c.gx + c.gy) * 8 - 6 - 10;
    const lx = v.x + v.w / 2 + (wx - v.x0) * v.zoom;
    const ly = v.y + v.h / 2 + (wy - v.y0) * v.zoom;
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: r.left + (lx / 480) * r.width, y: r.top + (ly / 270) * r.height };
  });
  if (pos) {
    await page.click('button[data-speed="0"]');
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(300);
    check(await page.locator('.info-pop').isVisible(), '點客人會開資訊浮窗');
    check(/滿意度/.test(await page.locator('.info-pop').textContent()), '浮窗顯示滿意度');
    await shot(page, 'p3-info.png');
  } else check(false, '找不到坐著的客人');

  // 暫停選單
  await page.click('button[data-id="menu"]');
  await waitScene(page, 'pause');
  await page.click('button[data-id="resume"]');
  await waitScene(page, 'level');

  // 快轉到打烊
  await page.evaluate(() => window.__sushi.step(5000));
  await waitScene(page, 'dialog');
  check(true, '打烊後出現結算對話');
  await page.click('button[data-id="dlg-skip"]');
  await waitScene(page, 'results');
  const stars = Number(await page.locator('.res-stars').getAttribute('data-stars'));
  const result = await page.evaluate(() => window.__sushi.app.scenes.names());
  check(result.includes('level'), '結算畫面蓋在經營畫面上');
  check(stars >= 1 && stars <= 3, `看到星數（${stars} 顆）`);
  check(/過關/.test(await page.locator('.results-panel .menu-title').textContent()), '結算畫面顯示過關');
  await shot(page, 'p3-results.png');
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('sushi.v1.levels')));
  check(save && save.cleared['1'] && save.cleared['1'].stars === stars, '過關紀錄有存檔');

  // 回關卡選擇：第 2 關解鎖
  await page.click('.results-panel button[data-id="back"]');
  await waitScene(page, 'levels');
  check(!(await page.locator('button[data-level="2"]').isDisabled()), '第 2 關解鎖了');
  check(await page.locator('button[data-level="3"]').isDisabled(), '第 3 關還鎖著');
  await shot(page, 'p3-levels.png');

  // 手機橫向：面板是抽屜
  const phone = await open(PHONE, '?debug=1&seed=2&scene=level:2&nointro=1&nohints=1', { touch: true, mobile: true });
  await waitScene(phone, 'level');
  await phone.waitForTimeout(300);
  check(!(await phone.locator('.side').isVisible()) || (await phone.locator('.side').boundingBox()).x >= 690, '手機上面板預設收起來');
  await phone.click('button[data-id="drawer"]');
  await phone.waitForTimeout(300);
  await phone.click('[data-tab="buy"]');
  await phone.click('button[data-id="suggest"]');
  await phone.click('button[data-id="buy"]');
  for (const id of ['suggest', 'buy', 'drawer']) {
    const b = await phone.locator(`button[data-id="${id}"]`).boundingBox();
    check(b.width >= 40 && b.height >= 40, `手機上按鈕 ${id} 夠大（${Math.round(b.width)}×${Math.round(b.height)}）`);
  }
  await shot(phone, 'p3-phone-drawer.png');
  await phone.click('button[data-id="drawer"]');
  await phone.click('button[data-id="open"]');
  await phone.evaluate(() => window.__sushi.step(900));
  await phone.waitForTimeout(400);
  await shot(phone, 'p3-phone-open.png');
  check(await phone.evaluate(() => window.__sushi.state().phase) === 'open', '手機上可以開店');
});
