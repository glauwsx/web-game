// 店鋪狀態的建立與每一步更新。純邏輯。
// 所有玩家操作都經過 applyAction(state, action)。UI、自動玩家、測試都走這條路。
import * as B from '../data/balance.js';
import { SUSHI, SUSHI_ORDER, MENU_MODES, gradeOfMode } from '../data/sushi.js';
import { FURNITURE } from '../data/furniture.js';
import { STAFF } from '../data/characters.js';
import { rngCreate } from '../core/rng.js';
import { getLayout } from './pathfind.js';
import {
  buy, suggestPurchases, processDeliveries, pushFeed, unitCost, minuteOfDay, addPenalty,
} from './economy.js';
import { spawnArrivals, stepCustomers, seatQueue, closeOutCustomers } from './customers.js';
import { stepStaff, setRole, placeStaff, freeStation, findStaff, kufuActive } from './staff.js';
import { createRival, rivalRevenue } from './rival.js';
import { scheduleEvents, fireEvents, stepBosses, setDisguise } from './bosses.js';
import {
  setNail, setFee, setRaceLevel, bossChoice, bossChallenge, bossChallengeResult,
} from './machines.js';

export const STATE_VERSION = 1;

function newDay() {
  return {
    revenue: 0, sales: 0, fees: 0, tips: 0, bonus: 0, penalties: 0,
    purchases: 0, wages: 0, prizeCost: 0,
    groups: 0, people: 0, served: 0, angry: 0, lost: 0, happy: 0,
    pieces: 0, wrong: 0, soldOut: 0, caught: 0, sold: {},
    prizePieces: 0, coupons: 0,
  };
}

/**
 * 建立店鋪狀態。
 * cfg = {
 *   seed, mode: 'level' | 'endless', levelId,
 *   shop: { w, h, floor, door: { gx }, wall, furniture: [{ type, x, y }] },
 *   staff: [{ id, role }],                 // role：'chef'、'floor'、'off'
 *   menu: [壽司 id],                        // 可以賣的品項
 *   money, reputation,
 *   stock: { 壽司id: { premium, cheap } },  // 起始庫存（可省略）
 *   hours: [開店小時, 打烊小時],
 *   baseArrival, mix: { 顧客類型: 權重 },
 *   goal: { kind: 'fixed' | 'rival', target },
 *   features: { cheap, disguise, uniform, sellPremium },
 *   lemonPenalty,                          // 檸檬吃出魚目混珠時，當日營業額扣掉的比例（第 9 關是 0.3）
 *   events: [...]                           // 事件時間表（階段 3 之後）
 * }
 */
export function createShopState(cfg) {
  const seed = (cfg.seed ?? 1) >>> 0;
  const hours = cfg.hours || [B.OPEN_HOUR, B.CLOSE_HOUR];
  const state = {
    version: STATE_VERSION,
    mode: cfg.mode || 'level',
    levelId: cfg.levelId ?? null,
    seed,
    rng: rngCreate(seed),
    phase: 'prep',
    tick: 0,
    openMin: hours[0] * 60,
    closeMin: hours[1] * 60,
    money: cfg.money ?? 0,
    reputation: cfg.reputation ?? 30,
    repStart: cfg.reputation ?? 30,
    kufu: 0,
    kufuUntil: 0,
    uniform: false,
    shop: {
      w: cfg.shop.w, h: cfg.shop.h, floor: cfg.shop.floor || 'wood', door: { gx: cfg.shop.door.gx }, wall: cfg.shop.wall || '',
      ver: 1, furniture: [],
    },
    menu: {},
    stock: {},
    deliveries: [],
    staff: [],
    customers: [],
    queue: [],
    orders: [],
    nextId: 1,
    baseArrival: cfg.baseArrival ?? 0.15,
    mix: { ...(cfg.mix || { normal: 1 }) },
    arrivalMult: 1,
    mixMult: null,
    priceFactor: null,
    priceMult: 1,
    features: { cheap: false, disguise: false, uniform: false, sellPremium: false, ...(cfg.features || {}) },
    goal: cfg.goal ? { ...cfg.goal } : { kind: 'fixed', target: 0 },
    lemonPenalty: cfg.lemonPenalty || 0,
    rival: null,
    day: newDay(),
    exposedCount: 0,
    feed: [],
    events: [],
    banner: null,
    flags: {},
    result: null,
  };
  for (const f of cfg.shop.furniture) addFurniture(state, f.type, f.x, f.y, f);
  for (const id of SUSHI_ORDER) {
    if (!cfg.menu.includes(id)) continue;
    state.menu[id] = { on: true, price: SUSHI[id].ref, mode: 'premium' };
    const st = (cfg.stock && cfg.stock[id]) || {};
    state.stock[id] = { premium: st.premium || 0, cheap: st.cheap || 0 };
  }
  for (const s of cfg.staff) addStaff(state, s.id);
  for (const s of cfg.staff) setRole(state, s.id, s.role || 'off');
  if (state.goal.kind === 'rival') state.rival = createRival(state.goal.target, state.rng, state.openMin, state.closeMin);
  state.events = scheduleEvents(cfg.events, state.rng);
  return state;
}

/** 加一位員工（先在休息）。 */
export function addStaff(state, id) {
  const st = {
    id, role: 'off', station: null,
    gx: -1, gy: -1, pgx: -1, pgy: -1, fx: 0, fy: 1, path: [],
    task: null, walk: null, ready: true, gone: 0, disguised: false,
  };
  state.staff.push(st);
  return st;
}

/**
 * 無限模式：把打烊的狀態整理成隔天的準備階段。店面、員工、菜單、庫存、資金、評價都留著。
 */
export function resetDay(state, seed) {
  for (const d of state.deliveries) state.stock[d.item][d.grade] += d.qty;
  state.seed = seed >>> 0;
  state.rng = rngCreate(state.seed);
  state.phase = 'prep';
  state.tick = 0;
  state.day = newDay();
  state.repStart = state.reputation;
  state.kufu = 0;
  state.kufuUntil = 0;
  state.deliveries = [];
  state.customers = [];
  state.queue = [];
  state.orders = [];
  state.exposedCount = 0;
  state.feed = [];
  state.events = [];
  state.banner = null;
  state.flags = {};
  state.result = null;
  for (const f of state.shop.furniture) {
    f.occ = f.occ.map(() => 0);
    if (f.income !== undefined) { f.income = 0; f.payout = 0; f.cost = 0; f.plays = 0; }
  }
  for (const s of state.staff) {
    s.gone = 0;
    s.disguised = false;
    if (s.role === 'chef' && !state.shop.furniture.some((f) => f.id === s.station)) { s.role = 'off'; s.station = null; }
    placeStaff(state, s);
  }
  state.shop.ver++;
}

/** 加一件家具（不檢查擺放規則；規則檢查在 pathfind.js 的 canPlace）。 */
export function addFurniture(state, type, x, y, extra = {}) {
  const def = FURNITURE[type];
  const f = { id: state.nextId++, type, x, y, occ: def.slots.map(() => 0) };
  if (def.machine === 'pachinko') {
    f.nail = extra.nail ?? 3;
    f.fee = extra.fee ?? 500;
    f.board = extra.board ?? 0;
    f.wom = [];
    f.income = 0;
    f.payout = 0;
  }
  if (def.machine === 'race') {
    f.level = extra.level ?? 3;
    f.fee = extra.fee ?? 800;
    f.track = extra.track ?? 0;
    f.wom = [];
    f.income = 0;
    f.payout = 0;
  }
  state.shop.furniture.push(f);
  state.shop.ver++;
  return f;
}

/** 一個營業日總共幾個 tick。 */
export function dayTicks(state) {
  return (state.closeMin - state.openMin) * B.TICKS_PER_MIN;
}

/** 前進一個 tick。只有營業中才會動。 */
export function stepShop(state) {
  if (state.phase !== 'open') return;
  if (state.tick % B.TICKS_PER_MIN === 0) {
    processDeliveries(state);
    spawnArrivals(state);
    fireEvents(state);
  }
  stepCustomers(state);
  stepStaff(state);
  stepBosses(state);
  seatQueue(state);
  state.tick++;
  if (state.tick >= dayTicks(state)) closeShop(state);
}

/** 打烊：還在店裡的顧客結帳，算薪水，算成績。 */
export function closeShop(state) {
  closeOutCustomers(state);
  // 檸檬吃出魚目混珠：當日營業額扣掉一部分（計劃書 11.2 第 9 關）
  if (state.flags.lemonResult === 'fail' && state.lemonPenalty > 0 && state.day.revenue > 0) {
    addPenalty(state, Math.round(state.day.revenue * state.lemonPenalty));
  }
  let wages = 0;
  for (const s of state.staff) if (s.role !== 'off') wages += STAFF[s.id].wage;
  state.day.wages = wages;
  state.money -= wages;
  state.phase = 'closed';
  state.result = evaluateDay(state);
  pushFeed(state, 'feed.closed', null);
}

/** 目標營業額。 */
export function targetRevenue(state) {
  return state.goal.target || 0;
}

/** 目前對手（或固定目標）的進度，給畫面下方的長條用。 */
export function rivalNow(state) {
  if (state.rival) return rivalRevenue(state);
  return targetRevenue(state);
}

/**
 * 算當日成績。
 * ★ 過關；★★ 營業額超過目標 15% 以上；★★★ 再加上評價不低於開場、沒被吃出魚目混珠。
 */
export function evaluateDay(state) {
  const revenue = state.day.revenue;
  const target = targetRevenue(state);
  const passed = revenue >= target;
  let starCount = 0;
  if (passed) {
    starCount = 1;
    if (revenue >= target * 1.15) {
      starCount = 2;
      if (state.reputation >= state.repStart && state.exposedCount === 0) starCount = 3;
    }
  }
  return {
    revenue, target, passed, stars: starCount,
    profit: revenue - state.day.purchases - state.day.wages,
    reputation: state.reputation, repStart: state.repStart, exposedCount: state.exposedCount,
  };
}

// ---- 玩家操作 ----
const fail = (reason) => ({ ok: false, reason });

/**
 * 套用一個玩家操作。回傳 { ok: true, ... } 或 { ok: false, reason }。
 * 操作一覽：
 *   { type: 'buy', item, grade, qty }
 *   { type: 'buySuggested' }
 *   { type: 'setMenu', item, on?, price?, mode? }
 *   { type: 'setRole', staff, role, station? }
 *   { type: 'open' }
 *   { type: 'kufu' }
 *   { type: 'setUniform', on }
 *   { type: 'sellPremium', item, qty }
 *   { type: 'disguise', on }
 *   { type: 'setNail', id, nail }          小鋼珠台的釘子設定 1–5
 *   { type: 'setFee', id, fee }            機台的入場費
 *   { type: 'setRaceLevel', id, level }    賽車機台的難度 1–5
 *   { type: 'bossChoice', id, choice }     強敵的對策：'allow'、'counter'
 *   { type: 'bossChallenge', id }          親自應戰：開始（回傳小遊戲的設定）
 *   { type: 'bossChallengeResult', id, win } 親自應戰：結果
 */
export function applyAction(state, action) {
  if (!action || typeof action !== 'object') return fail('bad');
  const handler = ACTIONS[action.type];
  if (!handler) return fail('unknown');
  return handler(state, action);
}

export const ACTIONS = {
  buy(state, a) {
    return buy(state, a.item, a.grade || 'premium', a.qty);
  },
  buySuggested(state) {
    if (state.phase !== 'prep') return fail('phase');
    let cost = 0;
    let qty = 0;
    for (const e of suggestPurchases(state)) {
      const r = buy(state, e.item, e.grade, e.qty);
      if (r.ok) { cost += r.cost; qty += r.qty; }
    }
    return { ok: true, cost, qty };
  },
  setMenu(state, a) {
    const m = state.menu[a.item];
    if (!m) return fail('locked');
    if (state.phase === 'closed') return fail('closed');
    if (a.mode !== undefined) {
      if (!MENU_MODES.includes(a.mode)) return fail('mode');
      if (a.mode !== 'premium' && !state.features.cheap) return fail('locked');
      if (a.mode === 'cheapDisguised' && !state.features.disguise) return fail('locked');
      m.mode = a.mode;
    }
    if (a.price !== undefined) {
      const p = Math.round(Number(a.price) / B.PRICE_STEP) * B.PRICE_STEP;
      if (!(p >= B.PRICE_MIN && p <= B.PRICE_MAX)) return fail('price');
      m.price = p;
    }
    if (a.on !== undefined) m.on = !!a.on;
    return { ok: true };
  },
  setRole(state, a) {
    if (state.phase === 'closed') return fail('closed');
    return setRole(state, a.staff, a.role, a.station || null);
  },
  open(state) {
    if (state.phase !== 'prep') return fail('phase');
    if (!state.staff.some((s) => s.role === 'chef')) return fail('noChef');
    for (const s of state.staff) placeStaff(state, s);
    state.phase = 'open';
    state.tick = 0;
    pushFeed(state, 'feed.opened', null);
    return { ok: true };
  },
  kufu(state) {
    if (state.phase !== 'open') return fail('phase');
    if (state.kufu < B.KUFU_MAX) return fail('notFull');
    if (kufuActive(state)) return fail('active');
    const ryo = state.staff.find((s) => STAFF[s.id].player);
    if (!ryo || ryo.gone || ryo.role !== 'chef') return fail('noRyo');
    state.kufu = 0;
    state.flags.kufuUses = (state.flags.kufuUses || 0) + 1;
    state.kufuUntil = state.tick + B.KUFU_MIN * B.TICKS_PER_MIN;
    pushFeed(state, 'feed.kufu', null);
    return { ok: true };
  },
  setUniform(state, a) {
    if (!state.features.uniform) return fail('locked');
    if (state.phase === 'closed') return fail('closed');
    if (!state.shop.furniture.some((f) => f.type === 'uniformSign')) return fail('noSign');
    state.uniform = !!a.on;
    return { ok: true };
  },
  disguise(state, a) {
    if (state.phase === 'closed') return fail('closed');
    return setDisguise(state, a.on);
  },
  setNail(state, a) {
    if (state.phase === 'closed') return fail('closed');
    return setNail(state, a.id, a.nail);
  },
  setFee(state, a) {
    if (state.phase === 'closed') return fail('closed');
    return setFee(state, a.id, a.fee);
  },
  setRaceLevel(state, a) {
    if (state.phase === 'closed') return fail('closed');
    return setRaceLevel(state, a.id, a.level);
  },
  bossChoice(state, a) {
    if (state.phase !== 'open') return fail('phase');
    return bossChoice(state, a.id, a.choice);
  },
  bossChallenge(state, a) {
    if (state.phase !== 'open') return fail('phase');
    return bossChallenge(state, a.id);
  },
  bossChallengeResult(state, a) {
    if (state.phase !== 'open') return fail('phase');
    return bossChallengeResult(state, a.id, a.win);
  },
  sellPremium(state, a) {
    if (!state.features.sellPremium) return fail('locked');
    if (state.phase === 'closed') return fail('closed');
    const st = state.stock[a.item];
    if (!st) return fail('locked');
    const qty = Math.min(st.premium, Math.floor(a.qty));
    if (!(qty > 0)) return fail('qty');
    const gain = Math.round(unitCost(state, a.item, 'premium') * qty * B.SELL_PREMIUM_RATE);
    st.premium -= qty;
    state.money += gain;
    state.day.purchases -= gain;
    return { ok: true, gain, qty };
  },
};

/** 給介面和測試用的摘要。 */
export function summary(state) {
  return {
    phase: state.phase,
    minute: minuteOfDay(state),
    money: state.money,
    reputation: state.reputation,
    revenue: state.day.revenue,
    rival: rivalNow(state),
    customers: state.customers.length,
    queue: state.queue.length,
    orders: state.orders.length,
    kufu: state.kufu,
  };
}

export { getLayout, freeStation, findStaff, gradeOfMode };
