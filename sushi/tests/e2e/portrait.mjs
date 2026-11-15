// 手機直向：顯示「請把手機轉橫」。
import { runE2E, PHONE, PHONE_PORTRAIT } from '../e2e-util.mjs';

await runE2E('portrait', async ({ open, check, shot }) => {
  const page = await open(PHONE_PORTRAIT, '?debug=1', { touch: true, mobile: true });
  await page.waitForSelector('#rotate-msg');
  check(await page.locator('#rotate').isVisible(), '直向時看得到轉橫提示');
  check((await page.locator('#rotate-msg').textContent()) === '請把手機轉橫', '提示文字正確');
  check(!(await page.locator('#stage').isVisible()), '直向時遊戲畫面隱藏');
  await shot(page, 'p0-portrait.png');
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(100);
  check(!(await page.locator('#rotate').isVisible()), '轉成橫向後提示消失');
  check(await page.locator('#stage').isVisible(), '轉成橫向後遊戲畫面出現');
});
