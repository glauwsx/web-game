// 在 Node.js 裡用種子跑完一個營業日，印出營業額、來客數、評價。
// 用法：node tools/sim-day.mjs [種子] [自動玩家]
import { runDay } from '../src/sim/bots.js';
import { sampleConfig } from '../tests/unit/helpers.js';

const seed = Number(process.argv[2] || 1);
const bot = process.argv[3] || 'naive';
const t0 = Date.now();
const state = runDay(sampleConfig({ seed }), bot);
const d = state.day;
console.log(`種子 ${seed}　自動玩家 ${bot}　（${Date.now() - t0} ms）`);
console.log(`營業額 ¥${d.revenue}（餐點 ${d.sales}、入場費 ${d.fees}、小費 ${d.tips}）　目標 ¥${state.result.target}　${state.result.passed ? '過關' : '沒過'} ${'★'.repeat(state.result.stars)}`);
console.log(`進貨 ¥${d.purchases}　薪水 ¥${d.wages}　利潤 ¥${state.result.profit}`);
console.log(`來客 ${d.groups} 組 ${d.people} 人　服務 ${d.served} 人　生氣離開 ${d.angry}　隊伍滿了沒進來 ${d.lost}`);
console.log(`賣出 ${d.pieces} 貫　滿意的顧客 ${d.happy}　評價 ${state.repStart} → ${state.reputation.toFixed(1)}`);
console.log(`賣出明細 ${JSON.stringify(d.sold)}`);
console.log(`剩餘庫存 ${JSON.stringify(Object.fromEntries(Object.entries(state.stock).map(([k, v]) => [k, v.premium + v.cheap])))}`);
