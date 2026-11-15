// 依序跑 tests/e2e/ 底下的所有端對端測試。用法：node tests/run-e2e.mjs [名稱過濾]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'e2e');
const filter = process.argv[2] || '';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && f.includes(filter)).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} 個端對端測試失敗` : `\n全部 ${files.length} 個端對端測試通過`);
process.exit(failed ? 1 : 0);
