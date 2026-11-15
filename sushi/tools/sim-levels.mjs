// 平衡報告：每一關用 naive 和 good 兩個自動玩家各跑 N 個種子，檢查計劃書 11.5 的條件。
// 用法：node tools/sim-levels.mjs [--levels 1,2,3] [--seeds 20] [--bot good] [--detail]
// 不滿足條件時以非零狀態結束。
import { LEVELS, levelConfig } from '../src/data/levels.js';
import { runDay } from '../src/sim/bots.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const seeds = Number(opt('seeds', 20));
const only = opt('levels', '') ? opt('levels', '').split(',').map(Number) : LEVELS.map((l) => l.id);
const bots = opt('bot', '') ? [opt('bot', '')] : ['naive', 'good'];
const detail = args.includes('--detail');

/** 11.5 的條件。回傳不滿足的原因，滿足回傳 ''。 */
function check(bot, id, r) {
  if (bot === 'naive' && id === 1 && r.pass < 0.8) return 'naive 第 1 關過關率要 ≥ 80%';
  if (bot === 'naive' && id >= 3 && r.pass > 0.3) return 'naive 第 3 到 10 關過關率要 ≤ 30%';
  if (bot === 'good' && r.pass < 0.9) return 'good 過關率要 ≥ 90%';
  if (bot === 'good' && r.two < 0.5) return 'good 拿到 ★★ 的比例要 ≥ 50%';
  return '';
}

export function simLevel(id, bot, n = seeds) {
  let pass = 0; let two = 0; let three = 0; let rev = 0; let angry = 0; let rep = 0; let profit = 0; let min = Infinity; let max = 0;
  let target = 0;
  const days = [];
  for (let seed = 1; seed <= n; seed++) {
    const s = runDay(levelConfig(id, seed), bot);
    const r = s.result;
    target = r.target;
    if (r.passed) pass++;
    if (r.stars >= 2) two++;
    if (r.stars >= 3) three++;
    rev += r.revenue; angry += s.day.angry; rep += r.reputation - r.repStart; profit += r.profit;
    min = Math.min(min, r.revenue); max = Math.max(max, r.revenue);
    days.push(s.day);
  }
  return { pass: pass / n, two: two / n, three: three / n, rev: rev / n, min, max, target, angry: angry / n, rep: rep / n, profit: profit / n, days };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
  const yen = (x) => Math.round(x).toLocaleString('en-US').padStart(8);
  console.log(`每關 ${seeds} 個種子`);
  console.log('關  玩家   過關   ★★  ★★★   平均營業額     最低     最高     目標   利潤   生氣  評價');
  for (const id of only) {
    for (const bot of bots) {
      const r = simLevel(id, bot);
      const why = check(bot, id, r);
      if (why) bad++;
      console.log(`${String(id).padStart(2)}  ${bot.padEnd(5)}  ${pct(r.pass)}  ${pct(r.two)}  ${pct(r.three)}  ${yen(r.rev)}  ${yen(r.min)} ${yen(r.max)} ${yen(r.target)} ${yen(r.profit)}  ${r.angry.toFixed(0).padStart(3)}  ${r.rep >= 0 ? '+' : ''}${r.rep.toFixed(1)}${why ? `   ✗ ${why}` : ''}`);
      if (detail) {
        const avg = (k) => Math.round(r.days.reduce((a, d) => a + (d[k] || 0), 0) / r.days.length);
        console.log(`      餐點 ${avg('sales')}、入場費 ${avg('fees')}、小費 ${avg('tips')}、獎金 ${avg('bonus')}、罰款 ${avg('penalties')}、進貨 ${avg('purchases')}、獎品成本 ${avg('prizeCost')}、來客 ${avg('people')}、服務 ${avg('served')}、流失 ${avg('lost')}、招待券 ${avg('coupons')}`);
      }
    }
  }
  if (bad) { console.log(`\n${bad} 項不滿足計劃書 11.5`); process.exit(1); }
  console.log('\n全部滿足計劃書 11.5');
}
