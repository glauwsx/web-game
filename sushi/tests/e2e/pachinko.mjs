// 小鋼珠：用鍵盤調力道並發射 30 顆，看到結算。也測經營畫面的試玩、設施分頁、職業玩家的對策選單。
import { runE2E, waitScene, DESKTOP, PHONE } from '../e2e-util.mjs';

await runE2E('pachinko', async ({ open, check, shot }) => {
  // 1. 自由遊玩：鍵盤操作
  const page = await open(DESKTOP, '?debug=1&seed=1&scene=pachinko&speed=4');
  await waitScene(page, 'pachinko');
  check(await page.locator('.pk-left').isVisible(), '看得到獎品表');
  const p0 = (await page.evaluate(() => window.__sushi.mini())).power;
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  const p1 = (await page.evaluate(() => window.__sushi.mini())).power;
  check(Math.abs(p1 - p0 - 0.041) < 1e-6, `→ 一次 0.005、Shift+→ 一次 0.001（${p0.toFixed(3)} → ${p1.toFixed(3)}）`);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__sushi.mini().left === 0, null, { timeout: 20000 });
  await page.keyboard.up('Space');
  check(true, '按住空白鍵把 30 顆射完');
  await page.waitForSelector('.pk-result:not(.hidden)', { timeout: 20000 });
  const m = await page.evaluate(() => window.__sushi.mini());
  const n = Object.values(m.counts).reduce((a, b) => a + b, 0);
  check(m.over && m.result, `看到結算（贏到 ¥${m.value}，入賞和滾輪 ${n} 次）`);
  check(n > 5, '力道調在甜蜜點附近時，有不少彈珠進洞');
  await shot(page, 'p4-pachinko.png');
  await page.click('[data-id="pk-done"]');
  await waitScene(page, 'menu');
  check(true, '結束後可以離開');

  // 2. 第 4 關：設施分頁、試玩
  const lv = await open(DESKTOP, '?debug=1&seed=1&scene=level:4&nointro=1&nohints=1&unlock=1');
  await waitScene(lv, 'level');
  await lv.click('[data-tab="fac"]');
  const id = await lv.evaluate(() => window.__sushi.state().shop.furniture.find((f) => f.type === 'pachinko').id);
  await lv.click(`[data-id="nail-${id}-plus"]`);
  await lv.click(`[data-id="fee-${id}-plus"]`);
  const f = await lv.evaluate((fid) => window.__sushi.state().shop.furniture.find((x) => x.id === fid), id);
  check(f.nail === 4 && f.fee === 600, `設施分頁可以調釘子和入場費（設定 ${f.nail}、¥${f.fee}）`);
  await shot(lv, 'p4-facility.png');
  await lv.click(`[data-id="trial-${id}"]`);
  await waitScene(lv, 'pachinko');
  check((await lv.evaluate(() => window.__sushi.mini().setting)) === 4, '試玩用的是這台的釘子設定');
  await lv.keyboard.press('Escape');
  await waitScene(lv, 'level');
  check(true, '試玩按 Esc 回到經營畫面');

  // 3. 第 5 關：職業玩家坐上機台時跳出對策選單
  const l5 = await open(DESKTOP, '?debug=1&seed=1&scene=level:5&nointro=1&nohints=1&unlock=1');
  await waitScene(l5, 'level');
  await l5.evaluate(() => { window.__sushi.act({ type: 'buySuggested' }); window.__sushi.act({ type: 'open' }); });
  await l5.evaluate(() => window.__sushi.step(8 * 150));
  await l5.waitForFunction(() => window.__sushi.scene() === 'boss', null, { timeout: 5000 });
  check(true, '職業玩家坐上機台，跳出對策選單');
  await shot(l5, 'p4-pro.png');
  await l5.click('[data-id="boss-counter"]');
  await waitScene(l5, 'level');
  const pro = await l5.evaluate(() => {
    const s = window.__sushi.state();
    const c = s.customers.find((x) => x.boss === 'pro' && x.choice);
    return { choice: c.choice, nail: s.shop.furniture.find((x) => x.id === c.furn).nail, plays: c.plays, played: c.played };
  });
  check(pro.choice === 'counter' && pro.nail === 1 && pro.plays === pro.played + 2, `調緊釘子：那一台變成設定 ${pro.nail}，再玩 ${pro.plays - pro.played} 次`);

  // 4. 手機橫向：觸控按鈕夠大
  const phone = await open(PHONE, '?debug=1&scene=pachinko', { touch: true, mobile: true });
  await waitScene(phone, 'pachinko');
  for (const k of ['minus', 'plus', 'fire']) {
    const b = await phone.locator(`[data-id="pk-${k}"]`).boundingBox();
    check(b && b.width >= 40 && b.height >= 40, `手機上 ${k} 鈕夠大（${Math.round(b.width)}×${Math.round(b.height)}）`);
  }
  const fire = await phone.locator('[data-id="pk-fire"]').boundingBox();
  await phone.mouse.move(fire.x + fire.width / 2, fire.y + fire.height / 2);
  await phone.mouse.down();
  await phone.waitForTimeout(1500);
  await phone.mouse.up();
  check((await phone.evaluate(() => window.__sushi.mini().left)) < 30, '按住發射鈕會發射');
  await shot(phone, 'p4-pachinko-phone.png');
});
