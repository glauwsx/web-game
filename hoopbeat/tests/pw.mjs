// 載入 Playwright：先找專案自己的，找不到就用系統預裝的（NODE_PATH 或全域）。
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function load() {
  const tries = ['playwright'];
  for (const dir of (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)) tries.push(path.join(dir, 'playwright'));
  tries.push('/opt/node-tools/node_modules/playwright');
  for (const t of tries) {
    try { return require(t); } catch (e) { /* 試下一個 */ }
  }
  throw new Error('找不到 Playwright。請先執行：npm i -D playwright && npx playwright install chromium');
}

export const { chromium } = load();
