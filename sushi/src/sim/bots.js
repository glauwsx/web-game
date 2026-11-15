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
import { FURNITURE } from '../data/furniture.js';
import { RESEARCH } from '../data/events.js';
import { canPlace, rectDistance } from './pathfind.js';
import { applyEndless, endDay, researchStatus, buildable } from './endless.js';

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

// ---- 無限模式的自動玩家（60 天測試用） ----

const RESEARCH_ORDER = ['inari', 'anago', 'ikura', 'pachinko', 'chutoro', 'uni', 'otoro', 'raceCab', 'board2', 'track2', 'uniformSign', 'track3', 'disguise'];

/** 找一個可以擺的位置。near = true 時選離板前檯最近的。 */
function findPlace(s, type, near) {
  let best = null;
  let bestScore = Infinity;
  const stations = s.shop.furniture.filter((f) => f.type === 'chefStation');
  const def = FURNITURE[type];
  for (let y = 0; y < s.shop.h; y++) {
    for (let x = 0; x < s.shop.w; x++) {
      if (!canPlace(s.shop, type, x, y).ok) continue;
      let score;
      if (near) {
        score = Math.min(...stations.map((st) => rectDistance(st.x, st.y, 2, 1, x, y, def.w, def.h))) * 100 + y * 10 + x;
      } else {
        // 其他東西盡量靠右邊和後面，不要擋在入口附近
        score = Math.abs(x - s.shop.door.gx) < 2 ? 5000 + y : (s.shop.w - x) * 10 + y;
      }
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  return best;
}

/** 準備階段要做的一件事（研發、雇人、擺設、擴建）。沒有事做回傳空陣列。 */
export function endlessPrepActions(E) {
  const s = E.s;
  if (s.phase !== 'prep') return [];
  const acts = [];
  for (const id of RESEARCH_ORDER) {
    const item = RESEARCH.find((r) => r.id === id);
    const st = researchStatus(E, item);
    if (st === 'ok') return [{ type: 'research', id }];
    if (st !== 'done' && st !== 'needs') break;
  }
  const own = (type) => s.shop.furniture.filter((f) => f.type === type).length;
  const hired = (id) => s.staff.some((x) => x.id === id);
  const spare = s.money - B.BOT.ENDLESS_RESERVE;
  const build = (type, near) => {
    if (!buildable(E).includes(type) || FURNITURE[type].price > spare) return false;
    const p = findPlace(s, type, near);
    if (!p) return false;
    acts.push({ type: 'place', furniture: type, x: p.x, y: p.y });
    return true;
  };
  const steps = [
    () => own('counterSeat') < 8 && build('counterSeat', true),
    () => !hired('honda') && spare > 0 && acts.push({ type: 'hire', staff: 'honda' }),
    () => own('tableSet') < 1 && build('tableSet', false),
    () => own('chefStation') < 2 && build('chefStation', true),
    () => own('chefStation') >= 2 && !hired('terai') && spare > 0 && acts.push({ type: 'hire', staff: 'terai' }),
    () => own('counterSeat') < 10 && build('counterSeat', true),
    () => own('fridge') < 1 && build('fridge', false),
    () => own('pachinko') < 2 && build('pachinko', false),
    () => own('raceCab') < 1 && build('raceCab', false),
    () => own('lantern') < 2 && build('lantern', false),
  ];
  for (const step of steps) { if (step()) return acts; }
  const next = B.ENDLESS.SIZES[E.size + 1];
  if (next && s.reputation >= next.rep && s.money >= next.price + B.BOT.ENDLESS_RESERVE * 2) return [{ type: 'expand' }];
  return acts;
}

/** 用自動玩家跑完無限模式的一天。回傳當天的結算。 */
export function runEndlessDay(E) {
  for (let i = 0; i < 12; i++) {
    const acts = endlessPrepActions(E);
    if (!acts.length) break;
    let any = false;
    for (const a of acts) if (applyEndless(E, a).ok) any = true;
    if (!any) break;
  }
  for (let i = 0; i < 100000 && E.s.phase !== 'closed'; i++) botStep(E.s, 'good');
  return endDay(E);
}
