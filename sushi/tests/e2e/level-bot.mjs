// 第 5、7、10 關用 good 自動玩家跑完：事件有出現、結算畫面正確。第 8、9 關看新介面。
import { runE2E, waitScene, DESKTOP } from '../e2e-util.mjs';

const EVENTS = {
  5: ['feed.proComing'],
  7: ['feed.shumahaComing', 'feed.buchoComing'],
  10: ['feed.proComing', 'feed.buchoComing', 'feed.shumahaComing', 'feed.lemonNotice', 'feed.lemonComing', 'feed.lemonPass'],
};

await runE2E('level-bot', async ({ open, check, shot }) => {
  for (const id of [5, 7, 10]) {
    const page = await open(DESKTOP, `?debug=1&seed=3&scene=level:${id}&nointro=1&nohints=1&unlock=1`);
    await waitScene(page, 'level');
    await page.evaluate(() => window.__sushi.useBot('good'));
    await page.waitForFunction(() => window.__sushi.state().phase === 'open', null, { timeout: 5000 });
    // 分段快轉，記下出現過的通知和橫幅
    const seen = await page.evaluate(() => {
      const keys = new Set();
      const banners = new Set();
      for (let i = 0; i < 400 && window.__sushi.scene() === 'level' && window.__sushi.state().phase === 'open'; i++) {
        window.__sushi.step(16);
        const s = window.__sushi.state();
        for (const e of s.feed) keys.add(e.key);
        if (s.banner) banners.add(s.banner.key);
      }
      return { keys: [...keys], banners: [...banners], phase: window.__sushi.state().phase };
    });
    check(seen.phase === 'closed', `第 ${id} 關：自動玩家跑到打烊`);
    for (const k of EVENTS[id]) check(seen.keys.includes(k), `第 ${id} 關：出現事件 ${k}`);
    check(seen.banners.length >= EVENTS[id].length > 0, `第 ${id} 關：有警告橫幅（${seen.banners.join('、')}）`);
    await waitScene(page, 'dialog');
    if (id === 10) await shot(page, 'p6-ending.png');
    await page.click('button[data-id="dlg-skip"]');
    await waitScene(page, 'results');
    const stars = Number(await page.locator('.res-stars').getAttribute('data-stars'));
    const r = await page.evaluate(() => window.__sushi.app.scenes.names());
    check(r.includes('level'), `第 ${id} 關：看到結算畫面`);
    check(stars >= 1, `第 ${id} 關：good 過關（${stars} 顆星）`);
    check(/過關/.test(await page.locator('.results-panel .menu-title').textContent()), `第 ${id} 關：結算畫面顯示過關`);
    if (id === 10) await shot(page, 'p6-results-10.png');
    await page.close();
  }

  // 第 8 關：三種賣法、賣掉高級食材、均一價招牌
  const p8 = await open(DESKTOP, '?debug=1&seed=1&scene=level:8&nointro=1&nohints=1&unlock=1');
  await waitScene(p8, 'level');
  await p8.selectOption('[data-id="mode-otoro"]', 'cheapDisguised');
  check((await p8.evaluate(() => window.__sushi.state().menu.otoro.mode)) === 'cheapDisguised', '第 8 關：菜單可以選魚目混珠');
  await shot(p8, 'p6-menu-modes.png');
  await p8.click('[data-tab="buy"]');
  const before = await p8.evaluate(() => window.__sushi.state());
  await p8.click('[data-id="sell-otoro"]');
  const after = await p8.evaluate(() => window.__sushi.state());
  check(after.stock.otoro.premium === before.stock.otoro.premium - 10 && after.money > before.money, `第 8 關：賣掉 10 單位高級大腹，換回 ¥${after.money - before.money}`);
  check(await p8.locator('[data-id="add-otoro-cheap"]').count() === 1, '第 8 關：進貨分頁有便宜食材');
  await p8.click('[data-tab="fac"]');
  await p8.click('[data-id="uniform"]');
  check((await p8.evaluate(() => window.__sushi.state().uniform)) === true, '第 8 關：掛上均一價招牌');
  await shot(p8, 'p6-level8.png');

  // 第 9 關：全部魚目混珠，檸檬會吃出來
  const p9 = await open(DESKTOP, '?debug=1&seed=1&scene=level:9&nointro=1&nohints=1&unlock=1');
  await waitScene(p9, 'level');
  const out = await p9.evaluate(() => {
    const S = window.__sushi;
    for (const id of Object.keys(S.state().menu)) { S.act({ type: 'buy', item: id, grade: 'cheap', qty: 30 }); S.act({ type: 'setMenu', item: id, mode: 'cheapDisguised' }); }
    S.act({ type: 'open' });
    for (let i = 0; i < 600 && !S.state().flags.lemonResult; i++) S.step(8);
    const s = S.state();
    return { result: s.flags.lemonResult, banner: s.banner && s.banner.key, exposed: s.exposedCount };
  });
  check(out.result === 'fail' && out.exposed >= 1, '第 9 關：檸檬吃出魚目混珠');
  check(out.banner === 'banner.lemonFail', '第 9 關：出現被吃出來的橫幅');
  await p9.waitForTimeout(300);
  await shot(p9, 'p6-lemon.png');
});
