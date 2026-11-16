// 把整個遊戲打包成一個 HTML 檔（不需要伺服器，雙擊就能開）。
// 用法：node tools/build-single.mjs [輸出路徑] [--fragment]
//   --fragment：只輸出頁面內容（沒有 <html>、<head>、<body>），給會自己包外框的平台用。
// 需要 esbuild：npm i --no-save esbuild。裝在別的資料夾時用環境變數 ESBUILD_DIR 指過去。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = resolve(root, args.find((a) => !a.startsWith('--')) || 'dist/pachinko.html');

let esbuild;
try {
  esbuild = createRequire(resolve(process.env.ESBUILD_DIR || root, 'x.js'))('esbuild');
} catch {
  console.error('找不到 esbuild。先執行：npm i --no-save esbuild');
  process.exit(1);
}
const js = await esbuild.build({
  entryPoints: [resolve(root, 'src/main.js')], bundle: true, format: 'iife', minify: true,
  target: 'es2020', charset: 'utf8', write: false, legalComments: 'none',
});
const code = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const style = readFileSync(resolve(root, 'style.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
const head = `<title>鋼珠會館</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@500;700;800&display=swap">
<style>${style}</style>`;
const body = `<div id="app"></div>\n<script>${code}</script>`;
const html = fragment
  ? `${head}\n${body}\n`
  : `<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out}（${Math.round(html.length / 1024)} KB）`);
