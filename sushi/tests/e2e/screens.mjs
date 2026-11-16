// 每個主要畫面截一張圖存到 screenshots/screens/（給人看的，2 倍像素密度）。
// 桌機（1366×768）和手機橫向（844×390，觸控）各一套。
// 手機那一套順便檢查觸控：畫面上每個看得到的按鈕都至少 40×40，而且在舞台裡面。
import fs from 'node:fs';
import path from 'node:path';
import { runE2E, waitScene, DESKTOP, PHONE, SHOTS } from '../e2e-util.mjs';

const DIR = path.join(SHOTS, 'screens');
fs.mkdirSync(DIR, { recursive: true });

/** 每個畫面：名稱、怎麼到那裡（在 page 上執行）。 */
/** 手機上面板是抽屜：要先打開才點得到分頁。 */
async function tab(p, id) {
  if (await p.locator('[data-id="drawer"]').isVisible()) await p.click('[data-id="drawer"]');
  await p.click(`[data-tab="${id}"]`);
}

const SCREENS = [
  ['01-title', '?debug=1&seed=1', null],
  ['02-menu', '?debug=1&seed=1&scene=menu', null],
  ['03-levels', '?debug=1&seed=1&scene=levels&unlock=1', null],
  ['04-settings', '?debug=1&seed=1&scene=settings', null],
  ['05-dialog', '?debug=1&seed=1&scene=level:4&unlock=1&nohints=1', null],
  ['06-prep-menu', '?debug=1&seed=1&scene=level:4&unlock=1&nointro=1&nohints=1', null],
  ['07-prep-buy', '?debug=1&seed=1&scene=level:4&unlock=1&nointro=1&nohints=1', async (p) => tab(p, 'buy')],
  ['08-prep-staff', '?debug=1&seed=1&scene=level:4&unlock=1&nointro=1&nohints=1', async (p) => tab(p, 'staff')],
  ['09-prep-fac', '?debug=1&seed=1&scene=level:7&unlock=1&nointro=1&nohints=1', async (p) => tab(p, 'fac')],
  ['10-open', '?debug=1&seed=1&scene=level:7&unlock=1&nointro=1&nohints=1', async (p) => {
    await p.evaluate(() => { window.__sushi.act({ type: 'buySuggested' }); window.__sushi.act({ type: 'open' }); window.__sushi.step(8 * 90); });
  }],
  ['11-boss', '?debug=1&seed=1&scene=level:5&unlock=1&nointro=1&nohints=1', async (p) => {
    await p.evaluate(() => { window.__sushi.act({ type: 'buySuggested' }); window.__sushi.act({ type: 'open' }); window.__sushi.step(8 * 150); });
    await p.waitForFunction(() => window.__sushi.scene() === 'boss', null, { timeout: 5000 });
  }],
  ['12-pause', '?debug=1&seed=1&scene=level:1&nointro=1&nohints=1', async (p) => p.click('[data-id="menu"]')],
  ['13-results', '?debug=1&seed=1&scene=level:1&nointro=1&nohints=1', async (p) => {
    await p.evaluate(() => { window.__sushi.act({ type: 'buySuggested' }); window.__sushi.act({ type: 'open' }); window.__sushi.step(8 * 300); });
    await p.waitForFunction(() => window.__sushi.scene() === 'dialog', null, { timeout: 5000 });
    for (let i = 0; i < 10 && (await p.evaluate(() => window.__sushi.scene())) === 'dialog'; i++) await p.click('[data-id="dlg-skip"], [data-id="dlg-next"]');
    await waitScene(p, 'results');
  }],
  ['14-pachinko', '?debug=1&seed=1&scene=pachinko', async (p) => {
    await p.evaluate(() => { const d = window.__sushi.app.scenes.top().debug; d.setPower(0.5); d.hold(true); d.step(120 * 3); d.hold(false); });
  }],
  ['15-race', '?debug=1&seed=1&scene=race:shoyu', async (p) => {
    await p.evaluate(() => { const d = window.__sushi.app.scenes.top().debug; d.auto(true); d.step(60 * 20); });
  }],
  ['16-endless-build', '?debug=1&seed=1&scene=endless:new', async (p) => tab(p, 'build')],
  ['17-endless-manage', '?debug=1&seed=1&scene=endless:new', async (p) => tab(p, 'manage')],
  ['18-customer-select', '?debug=1&seed=1&scene=customer', null],
  ['19-customer-free', '?debug=1&seed=1&scene=customer', async (p) => { await p.click('[data-id="char-matoi"]'); await p.click('[data-id="free"]'); }],
  ['20-customer-zukan', '?debug=1&seed=1&scene=customer', async (p) => { await p.click('[data-id="char-matoi"]'); await p.click('[data-id="zukan"]'); }],
  ['21-gallery', 'gallery.html', null],
];

/** 看得到、而且沒被停用的按鈕裡，太小或跑出舞台的。 */
function badButtons(page) {
  return page.evaluate(() => {
    const stage = document.getElementById('stage');
    const sr = stage ? stage.getBoundingClientRect() : null;
    const out = [];
    for (const b of document.querySelectorAll('#ui button, #ui select')) {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height || b.disabled) continue;
      const st = getComputedStyle(b);
      if (st.visibility === 'hidden' || st.display === 'none') continue;
      // 被捲動的面板裁掉的不算（面板可以捲）
      const box = b.closest('.side, .tab-body, .cust-panel, .menu-panel, .pk-left');
      if (box) {
        const br = box.getBoundingClientRect();
        if (r.bottom < br.top || r.top > br.bottom) continue;
      }
      const id = b.dataset.id || b.dataset.tab || b.dataset.key || b.textContent.trim().slice(0, 8);
      if (r.width < 39.5 || r.height < 39.5) out.push(`${id} ${Math.round(r.width)}×${Math.round(r.height)}`);
      else if (sr && (r.left < sr.left - 1 || r.right > sr.right + 1 || r.top < sr.top - 1 || r.bottom > sr.bottom + 1)) out.push(`${id} 超出舞台`);
    }
    return out;
  });
}

await runE2E('screens', async ({ open, check }) => {
  for (const [vp, label, opts] of [[DESKTOP, 'desktop', { dpr: 2 }], [PHONE, 'phone', { dpr: 2, touch: true, mobile: true }]]) {
    for (const [name, url, go] of SCREENS) {
      const page = await open(vp, url, opts);
      await page.waitForTimeout(400);
      if (go) await go(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(DIR, `${label}-${name}.png`) });
      if (label === 'phone' && name !== '21-gallery') {
        const bad = await badButtons(page);
        check(bad.length === 0, `手機 ${name}：按鈕都夠大${bad.length ? `（太小：${bad.join('、')}）` : ''}`);
      } else check(true, `${label} ${name}`);
      await page.context().close();
    }
  }
});
