// 端對端測試的共用工具。
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';
import { startServer } from './serve.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHOTS = path.join(ROOT, 'screenshots');
export const DESKTOP = { width: 1366, height: 768 };
export const PHONE = { width: 844, height: 390 };
export const PHONE_PORTRAIT = { width: 390, height: 844 };

/**
 * 跑一個端對端測試。
 * fn 會拿到 { browser, base, open, check }。
 * open(viewport, url, opts) 開新分頁，自動收集 console 錯誤。
 */
export async function runE2E(name, fn) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, port } = await startServer(0);
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${port}/`;
  const errors = [];
  const checks = [];
  const pages = [];
  async function open(viewport, url = '', opts = {}) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: opts.dpr || 1,
      hasTouch: !!opts.touch,
      isMobile: !!opts.mobile,
    });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });
    await page.goto(base + url);
    pages.push(page);
    return page;
  }
  function check(cond, label) {
    checks.push({ ok: !!cond, label });
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  }
  let crashed = null;
  console.log(`▶ ${name}`);
  try {
    await fn({ browser, base, open, check, shot: (page, file) => page.screenshot({ path: path.join(SHOTS, file) }) });
  } catch (e) {
    crashed = e;
  }
  await browser.close();
  server.close();
  check(errors.length === 0, `沒有 console 錯誤${errors.length ? `：\n    ${errors.join('\n    ')}` : ''}`);
  const failed = checks.filter((c) => !c.ok);
  if (crashed) console.error(crashed);
  if (crashed || failed.length) {
    console.log(`✗ ${name} 失敗（${failed.length} 項不通過）`);
    process.exit(1);
  }
  console.log(`✓ ${name} 通過（${checks.length} 項）`);
}

/** 等到 window.__sushi.scene() 變成指定名稱。 */
export function waitScene(page, name, timeout = 5000) {
  return page.waitForFunction((n) => window.__sushi && window.__sushi.scene() === n, name, { timeout });
}
