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
  check(m.result.won.length === 6 - m.result.place && m.result.prizes.length >= 1, `贏過 ${m.result.won.length} 台壽司車，拿到 ${m.result.prizes.join('、')}`);
  check((await page.locator('[data-id="race-prize"]').textContent()).length > 0, '結果畫面列出贏到的壽司');
  const icons = await page.evaluate(() => [...document.querySelectorAll('.won-icon')].map((e) => e.classList.contains('on')));
  check(icons.length === 5 && icons.filter(Boolean).length === m.result.won.length, `HUD 有 5 個壽司圖示，點亮 ${icons.filter(Boolean).length} 個（贏過 ${m.result.won.length} 台）`);
  check(/價值 ¥/.test(await page.locator('[data-id="race-value"]').textContent()), '結果畫面顯示獎品價值');
  check((await page.locator('.race-prize').count()) === m.result.prizes.length, '結果畫面用圖示列出每一貫獎品');
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

// 經營畫面：第 6 關的設施分頁和試玩、第 7 關的修馬哈對策選單和親自應戰
await runE2E('race-shop', async ({ open, check, shot }) => {
  const lv = await open(DESKTOP, '?debug=1&seed=2&scene=level:6&nointro=1&nohints=1&unlock=1');
  await waitScene(lv, 'level');
  await lv.click('[data-tab="fac"]');
  const id = await lv.evaluate(() => window.__sushi.state().shop.furniture.find((f) => f.type === 'raceCab').id);
  await lv.click(`[data-id="level-${id}-plus"]`);
  await lv.click(`[data-id="fee-${id}-minus"]`);
  const f = await lv.evaluate((fid) => window.__sushi.state().shop.furniture.find((x) => x.id === fid), id);
  check(f.level === 4 && f.fee === 700, `設施分頁可以調車速和入場費（等級 ${f.level}、¥${f.fee}）`);
  await lv.click(`[data-id="trial-${id}"]`);
  await waitScene(lv, 'race');
  check((await lv.evaluate(() => window.__sushi.mini().track)) === 'itamae', '試玩跑的是這條賽道');
  await lv.keyboard.press('Escape');
  await waitScene(lv, 'level');
  check(true, '試玩按 Esc 回到經營畫面');
  // 開店後賽道上會有比賽
  await lv.evaluate(() => { window.__sushi.act({ type: 'buySuggested' }); window.__sushi.act({ type: 'open' }); window.__sushi.step(8 * 120); });
  const races = await lv.evaluate(() => window.__sushi.state().shop.furniture.filter((x) => x.type === 'raceCab').reduce((a, x) => a + (x.races || 0), 0));
  check(races > 0, `開店 2 小時內賽車機台跑了 ${races} 場`);
  await shot(lv, 'p5-shop.png');

  const l7 = await open(DESKTOP, '?debug=1&seed=1&scene=level:7&nointro=1&nohints=1&unlock=1');
  await waitScene(l7, 'level');
  await l7.evaluate(() => { window.__sushi.act({ type: 'buySuggested' }); window.__sushi.act({ type: 'open' }); });
  await l7.evaluate(() => window.__sushi.step(8 * 200));
  await l7.waitForFunction(() => { if (window.__sushi.scene() === 'boss') return true; window.__sushi.step(16); return false; }, null, { timeout: 15000, polling: 50 });
  check(true, '修馬哈報名時跳出對策選單');
  await shot(l7, 'p5-shumaha.png');
  await l7.click('[data-id="boss-challenge"]');
  await waitScene(l7, 'race');
  check((await l7.evaluate(() => window.__sushi.state().cars.some((c) => c.kind === 'shumaha'))), '親自應戰：比賽裡有修馬哈的車');
  await l7.evaluate(() => { const d = window.__sushi.app.scenes.top().debug; d.auto(true); d.step(60 * 200); });
  await l7.waitForSelector('[data-id="race-verdict"]');
  const res = await l7.evaluate(() => window.__sushi.mini().result);
  check(res.shumahaPlace >= 1, `結果畫面顯示勝負（玩家第 ${res.place} 名，修馬哈第 ${res.shumahaPlace} 名）`);
  await l7.click('[data-id="race-done"]');
  await waitScene(l7, 'level');
  const c = await l7.evaluate(() => window.__sushi.state().customers.find((x) => x.boss === 'shumaha'));
  const ok = res.place < res.shumahaPlace ? (!c || c.st === 'leave') : (c && c.st === 'prize' && c.prizePending + c.prizeGot > 0);
  check(ok, '應戰的結果有回到經營畫面（贏了他離開，輸了他拿走雙倍壽司）');
});
