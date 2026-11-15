// 自動玩家（給平衡測試和除錯用）。純邏輯。
// botActions(state, name) 回傳這個 tick 要送出的操作清單。
import * as B from '../data/balance.js';
import { SUSHI, gradeOfMode } from '../data/sushi.js';
import { STAFF } from '../data/characters.js';
import { applyAction, stepShop, createShopState } from './shop.js';
import { freeStation } from './staff.js';
import { stockCap, totalStock, unitCost, suggestPurchases } from './economy.js';
import { buchoAround, lemonExpected } from './bosses.js';
import { machineOf, bossesNeedingChoice } from './machines.js';

/** good：準備階段的設定。 */
function goodPrep(state) {
  const acts = [];
  // 把不會捏的員工排到外場（技術低於 4 的壽司很醜）；其他人有空的板前檯就當師傅
  for (const s of state.staff) {
    const def = STAFF[s.id];
    if (def.player) continue;
    if (s.role !== 'off') continue;
    const canChef = def.skill >= B.SAT_UGLY_SKILL && freeStation(state, s.id);
    acts.push({ type: 'setRole', staff: s.id, role: canChef ? 'chef' : 'floor' });
  }
  // 售價：參考售價的 100% 到 110%（T3 以上的客人比較不在意價格）
  for (const id of Object.keys(state.menu)) {
    const rate = SUSHI[id].tier >= 3 ? B.BOT.PRICE_HIGH : B.BOT.PRICE_LOW;
    const price = Math.floor(SUSHI[id].ref * rate / B.PRICE_STEP) * B.PRICE_STEP;
    if (state.menu[id].price !== price) acts.push({ type: 'setMenu', item: id, price });
  }
  // 機台：小鋼珠設定 2 到 3、賽車難度 3 到 4
  for (const f of state.shop.furniture) {
    const kind = machineOf(f);
    if (kind === 'pachinko' && f.nail !== B.BOT.NAIL) acts.push({ type: 'setNail', id: f.id, nail: B.BOT.NAIL });
    if (kind === 'race' && f.level !== B.BOT.RACE_LEVEL) acts.push({ type: 'setRaceLevel', id: f.id, level: B.BOT.RACE_LEVEL });
  }
  return acts;
}

/** good：營業中補貨。庫存（加上在路上的）低於門檻就補一批。 */
function goodRestock(state) {
  const acts = [];
  let room = stockCap(state) - totalStock(state);
  let money = state.money;
  const ids = Object.keys(state.menu).filter((id) => state.menu[id].on);
  // 賣得好的先補
  ids.sort((a, b) => (state.day.sold[b] || 0) - (state.day.sold[a] || 0));
  for (const id of ids) {
    const grade = gradeOfMode(state.menu[id].mode);
    const coming = state.deliveries.reduce((n, d) => n + (d.item === id && d.grade === grade ? d.qty : 0), 0);
    if (state.stock[id][grade] + coming >= B.BOT.RESTOCK_BELOW) continue;
    const qty = Math.min(B.BOT.RESTOCK_QTY, room);
    const cost = unitCost(state, id, grade) * qty * B.EMERGENCY_MARKUP;
    if (qty < 5 || cost > money) continue;
    acts.push({ type: 'buy', item: id, grade, qty });
    room -= qty;
    money -= cost;
  }
  return acts;
}

export const BOTS = {
  // naive：照系統建議量進貨，全部用預設設定，營業中不做任何操作，不回應事件。
  naive(state) {
    if (state.phase === 'prep') return [{ type: 'buySuggested' }, { type: 'open' }];
    return [];
  },
  // good：一套寫死的合理策略（計劃書 11.5）。不使用「親自應戰」。
  good(state) {
    if (state.phase === 'prep') {
      if (state.flags.botPrep) {
        const list = suggestPurchases(state).map((e) => ({ type: 'buy', ...e }));
        return list.concat([{ type: 'open' }]);
      }
      state.flags.botPrep = true;
      return goodPrep(state);
    }
    if (state.phase !== 'open') return [];
    const acts = [];
    // 強敵：調緊釘子、調高難度
    for (const c of bossesNeedingChoice(state)) acts.push({ type: 'bossChoice', id: c.id, choice: 'counter' });
    // 部長：出現就變裝，離開就解除
    const ryo = state.staff.find((s) => STAFF[s.id].player);
    if (ryo && !ryo.gone) {
      const want = buchoAround(state);
      if (ryo.disguised !== want) acts.push({ type: 'disguise', on: want });
    }
    // 檸檬：預告之後到她離開之前，魚目混珠的品項改回誠實賣法
    if (lemonExpected(state)) {
      for (const id of Object.keys(state.menu)) {
        if (state.menu[id].mode !== 'cheapDisguised') continue;
        acts.push({ type: 'setMenu', item: id, mode: state.stock[id].premium > 0 ? 'premium' : 'cheapHonest' });
      }
    }
    if (state.kufu >= B.KUFU_MAX) acts.push({ type: 'kufu' });
    if (state.tick % (B.TICKS_PER_MIN * 5) === 0) acts.push(...goodRestock(state));
    return acts;
  },
};

export function botActions(state, name) {
  const bot = BOTS[name];
  return bot ? bot(state) : [];
}

/** 讓自動玩家對目前狀態下一步棋，然後前進一個 tick。 */
export function botStep(state, name) {
  for (const a of botActions(state, name)) applyAction(state, a);
  stepShop(state);
}

/** 用自動玩家跑完一個營業日。回傳最終狀態。 */
export function runDay(cfg, name = 'naive', maxTicks = 100000) {
  const state = createShopState(cfg);
  for (let i = 0; i < maxTicks && state.phase !== 'closed'; i++) botStep(state, name);
  return state;
}
