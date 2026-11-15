// 開發用：把檯面形狀和幾條彈道輸出成 JSON（給外部工具畫圖檢查）。
// 用法：node tools/pachinko-debug.mjs <檯面> <設定> <輸出.json> [力道,力道,...]
import fs from 'node:fs';
import { BOARDS } from '../src/data/pachinko-boards.js';
import { compileBoard, createBall, stepBall, jitterPower } from '../src/mini/pachinko/physics.js';
import { rngCreate } from '../src/core/rng.js';

const [boardId = 'itamae', setting = '3', out = 'pk.json', powers = '0.40,0.45,0.50,0.50,0.50,0.55,0.60,0.80'] = process.argv.slice(2);
const geom = compileBoard(BOARDS[boardId], Number(setting));
const rng = rngCreate(7);
const paths = [];
for (const p of powers.split(',').map(Number)) {
  const b = createBall(geom, jitterPower(p, rng));
  const pts = [];
  while (!b.done) { stepBall(geom, b, rng); pts.push([Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10]); }
  paths.push({ power: p, result: b.done, pts });
}
fs.writeFileSync(out, JSON.stringify({ nails: geom.nails, walls: geom.walls, pockets: geom.pockets, paths, w: geom.w, h: geom.h }));
console.log(paths.map((p) => `${p.power}→${p.result}`).join(' '));
