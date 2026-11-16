// 把整個遊戲打包成一個 HTML 檔（不需要伺服器，雙擊就能開）。
// 用法：node tools/build-single.mjs [輸出路徑]
// 需要 esbuild：npm i --no-save esbuild（或放在上層 node_modules）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] || 'dist/sushi.html');

let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  console.error('找不到 esbuild。先執行：npm i --no-save esbuild');
  process.exit(1);
}

const js = await esbuild.build({
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  charset: 'utf8',
  write: false,
  legalComments: 'none',
});
const css = await esbuild.build({
  entryPoints: [resolve(root, 'src/ui/ui.css')],
  bundle: true,
  minify: true,
  charset: 'utf8',
  write: false,
});

const code = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const style = css.outputFiles[0].text.replace(/<\/style/gi, '<\\/style');

let html = readFileSync(resolve(root, 'index.html'), 'utf8');
const cssTag = '<link rel="stylesheet" href="src/ui/ui.css">';
const jsTag = '<script type="module" src="src/main.js"></script>';
if (!html.includes(cssTag) || !html.includes(jsTag)) {
  console.error('index.html 的 <link> 或 <script> 跟預期不同，請更新本工具。');
  process.exit(1);
}
// 用函式取代，避免程式碼裡的 $& 之類被當成特殊字元。
html = html.replace(cssTag, () => `<style>${style}</style>`);
html = html.replace(jsTag, () => `<script>${code}</script>`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`輸出：${out}（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB）`);
