// 無限模式：日曆、租金、擺設、擴建、雇用、研發、任務、月排名、隨機事件、借款、破產。純邏輯。
// 狀態 E 是純 JSON，整個存檔就是 JSON.stringify(E)。E.s 是當天的店鋪狀態（sim/shop.js）。
// 操作一律走 applyEndless(E, action)：無限模式專用的操作在這裡處理，其他的轉給 applyAction(E.s, action)。
import * as B from '../data/balance.js';
import { SUSHI } from '../data/sushi.js';
import { FURNITURE } from '../data/furniture.js';
import { STAFF } from '../data/characters.js';
import { BOARD_ORDER } from '../data/pachinko-boards.js';
import { TRACK_ORDER } from '../data/tracks.js';
import { RESEARCH, BUILD_BASE, RANDOM_EVENTS, QUESTS, QUESTS_SHOWN } from '../data/events.js';
import { rngCreate, rngChance, rngRange, rngInt } from '../core/rng.js';
import { createShopState, applyAction, addFurniture, addStaff, resetDay } from './shop.js';
import { canPlace, floorCount, floorOfX, stairCell, FLOOR_STRIDE } from './pathfind.js';
import { setRole } from './staff.js';
import { addReputation } from './economy.js';
import { scheduleEvents } from './bosses.js';
import { machineOf } from './machines.js';

const N = B.ENDLESS;
export const ENDLESS_VERSION = 1;
const fail = (reason) => ({ ok: false, reason });

/** 第 day 天（從 0 開始）的日期。一週 7 天、一月 4 週、一年 12 月。 */
export function calendar(day) {
  return {
    year: Math.floor(day / 336) + 1,
    month: (Math.floor(day / 28) % 12) + 1,
    week: (Math.floor(day / 7) % 4) + 1,
    weekday: (day % 7) + 1, // 1 = 星期一，6、7 是週末
    weekend: day % 7 >= 5,
    monthEnd: day % 28 === 27,
    weekEnd: day % 7 === 6,
  };
}

/** 每日租金：照全部樓層的總面積算。 */
export function rentOf(shop) {
  return N.RENT_BASE + shop.w * shop.h * floorCount(shop) * N.RENT_PER_CELL;
}

/** 來客的基本值：店面越大、樓層越多，來客越多。 */
export function arrivalOf(E) {
  return N.SIZES[E.size].arrival * (1 + B.FLOORS.ARRIVAL_BONUS * (floorCount(E.s.shop) - 1));
}

// ---- 樓層 ----

/** 蓋下一層樓的條件。kind：'normal'（自由擺設）或 'vip'（包廂樓層）。 */
export function floorOffer(E, kind = 'normal') {
  const n = floorCount(E.s.shop); // 現有幾層，新的一層是第 n + 1 層
  const price = Math.round(B.FLOORS.PRICE * B.FLOORS.PRICE_GROWTH ** (n - 1) * (kind === 'vip' ? B.FLOORS.VIP_MULT : 1) / 10000) * 10000;
  return { floor: n + 1, price, rep: Math.min(B.FLOORS.REP_MAX, B.FLOORS.REP + B.FLOORS.REP_STEP * (n - 1)) };
}

export function floorKind(shop, k) {
  return shop.floors && shop.floors[k] ? shop.floors[k].kind : 'normal';
}

/** 包廂樓層的包廂位置（樓層內的座標）。每 3 格一間，留走道，最前面兩排留給樓梯。 */
export function boothSpots(shop) {
  const out = [];
  for (let y = 1; y + 2 <= shop.h - 2; y += 3) {
    for (let x = 1; x + 2 <= shop.w; x += 3) out.push([x, y]);
  }
  return out;
}

function fillBooths(s, k) {
  s.shop.furniture = s.shop.furniture.filter((f) => !(f.type === 'booth' && floorOfX(f.x) === k));
  for (const [x, y] of boothSpots(s.shop)) addFurniture(s, 'booth', k * FLOOR_STRIDE + x, y);
}

/** 把每層樓的樓梯放到左前角（擴建之後位置會變）。 */
function placeStairs(s) {
  s.shop.furniture = s.shop.furniture.filter((f) => f.type !== 'stairs');
  if (floorCount(s.shop) < 2) return;
  for (let k = 0; k < floorCount(s.shop); k++) addFurniture(s, 'stairs', k * FLOOR_STRIDE, s.shop.h - 1);
}

/** 樓梯要用的兩格現在是不是空的。 */
function stairsFree(shop, k) {
  const cells = [stairCell(shop, k, true), stairCell(shop, k, false)];
  return !shop.furniture.some((f) => {
    if (f.type === 'stairs') return false;
    const d = FURNITURE[f.type];
    return cells.some(([x, y]) => x >= f.x && x < f.x + d.w && y >= f.y && y < f.y + d.h);
  });
}

function daySeed(E) {
  return (E.seed + (E.day + 1) * 7919) >>> 0;
}

/** 建立新的無限模式。 */
export function createEndless(seed = 1) {
  const size = N.SIZES[0];
  const s = createShopState({
    seed, mode: 'endless',
    shop: {
      w: size.w, h: size.h, floor: 'wood', door: { gx: 3 },
      furniture: [
        { type: 'chefStation', x: 2, y: 1 },
        { type: 'counterSeat', x: 1, y: 2 }, { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 }, { type: 'counterSeat', x: 4, y: 2 },
      ],
    },
    staff: [{ id: 'ryo', role: 'chef' }],
    menu: N.START_MENU,
    money: N.START_MONEY,
    reputation: N.START_REP,
    baseArrival: size.arrival,
    mix: N.MIX,
    goal: { kind: 'fixed', target: 0 },
    features: { cheap: true },
  });
  const E = {
    version: ENDLESS_VERSION,
    seed: seed >>> 0,
    rng: rngCreate((seed ^ 0x5eed) >>> 0),
    day: 0,
    s,
    size: 0,
    research: [],
    insp: 0,
    happyAcc: 0,
    loan: 0,
    debtDays: 0,
    bankruptcies: 0,
    gameOver: false,
    repStreak: 0,
    firstOwned: {},
    counters: {},
    questsDone: [],
    month: { revenue: 0, rival: N.RIVAL_MONTH, wins: 0, played: 0 },
    stats: { days: 0, revenue: 0, served: 0, bestDay: 0 },
    today: null,
    last: null,
  };
  rollDay(E);
  return E;
}

// ---- 每天開始：魚價、隨機事件、強敵 ----

function ownedDays(E, kind) {
  return E.firstOwned[kind] === undefined ? -1 : E.day - E.firstOwned[kind];
}

/** 決定今天的魚價、事件、會來的強敵，寫進 E.today 和 E.s。準備階段一開始就呼叫，玩家看得到。 */
export function rollDay(E) {
  const s = E.s;
  const rng = E.rng;
  const cal = calendar(E.day);
  const prices = {};
  for (const id of Object.keys(SUSHI)) prices[id] = Math.round((1 + rngRange(rng, -N.PRICE_SWING, N.PRICE_SWING)) * 100) / 100;
  let event = null;
  if (rngChance(rng, N.EVENT_CHANCE)) {
    const ok = RANDOM_EVENTS.filter((e) => !e.needRep || s.reputation >= e.needRep);
    event = ok[rngInt(rng, 0, ok.length - 1)];
  }
  const list = [];
  const at = (h0, h1) => rngInt(rng, h0 * 60, h1 * 60);
  let bucho = rngChance(rng, N.BOSS_CHANCE.bucho) ? 1 : 0;
  if (event && event.bucho) bucho = event.bucho;
  for (let i = 0; i < bucho; i++) list.push({ kind: 'bucho', at: i === 0 ? at(12, 14) : at(17, 19) });
  if (ownedDays(E, 'pachinko') >= N.BOSS_AFTER_DAYS && rngChance(rng, N.BOSS_CHANCE.pro)) list.push({ kind: 'pro', at: at(12, 17), count: 1 });
  if (ownedDays(E, 'race') >= N.BOSS_AFTER_DAYS && rngChance(rng, N.BOSS_CHANCE.shumaha)) list.push({ kind: 'shumaha', at: at(13, 17) });
  if (s.reputation >= N.LEMON_REP && rngChance(rng, N.BOSS_CHANCE.lemon)) list.push({ kind: 'lemon', at: at(14, 18) });
  if (event && event.guests) list.push({ kind: 'group', type: event.guests.type, count: event.guests.count, at: event.guests.at, feed: `feed.event.${event.id}` });
  E.today = { event: event ? event.id : null, weekend: cal.weekend, prices };
  s.priceFactor = prices;
  s.priceMult = event && event.price ? event.price : 1;
  s.arrivalMult = (cal.weekend ? N.WEEKEND_MULT : 1) * (event && event.arrival ? event.arrival : 1);
  s.mixMult = event && event.mix ? { ...event.mix } : null;
  s.baseArrival = arrivalOf(E);
  s.mix = { ...N.MIX, gourmet: s.reputation >= N.GOURMET_REP ? N.GOURMET_WEIGHT : 0, vip: B.VIP.MIX_PER_BOOTH };
  s.events = scheduleEvents(list, s.rng);
}

// ---- 研發與可以買的東西 ----

export function researched(E, id) {
  return E.research.includes(id);
}

/** 這個研發項目現在的狀態：'done'、'ok'（可以研發）、'needs'（缺前置）、'poor'（靈感點不夠）。 */
export function researchStatus(E, item) {
  if (researched(E, item.id)) return 'done';
  if (item.needs && !researched(E, item.needs)) return 'needs';
  return E.insp >= item.cost ? 'ok' : 'poor';
}

/** 現在可以買的家具種類。 */
export function buildable(E) {
  return BUILD_BASE.concat(RESEARCH.filter((r) => r.kind === 'furniture' && researched(E, r.id)).map((r) => r.id));
}

export function boardsUnlocked(E) {
  return researched(E, 'board2') ? Math.min(2, BOARD_ORDER.length) : 1;
}

export function tracksUnlocked(E) {
  return Math.min(TRACK_ORDER.length, 1 + (researched(E, 'track2') ? 1 : 0) + (researched(E, 'track3') ? 1 : 0));
}

/** 這位員工現在能不能雇：'hired'、'ok'、'rep'（評價不夠）。 */
export function hireStatus(E, id) {
  if (E.s.staff.some((x) => x.id === id)) return 'hired';
  return E.s.reputation >= (N.HIRE_REP[id] ?? 0) ? 'ok' : 'rep';
}

// ---- 任務 ----

function countOwned(s, type) {
  return s.shop.furniture.filter((f) => f.type === type).length;
}

/** 任務目前的進度值。 */
export function questValue(E, q) {
  const s = E.s;
  const d = E.last ? E.last.day : null;
  switch (q.kind) {
    case 'dayRevenue': return d ? d.revenue : 0;
    case 'dayServed': return d ? d.served : 0;
    case 'cleanDay': return d && d.angry <= 2 ? d.served : 0;
    case 'own': return countOwned(s, q.type);
    case 'reputation': return Math.floor(s.reputation);
    case 'size': return E.size;
    case 'floors': return floorCount(s.shop);
    case 'staff': return s.staff.length;
    case 'sushi': return Object.keys(s.menu).length;
    case 'counter': return E.counters[q.key] || 0;
    case 'repStreak': return E.repStreak;
    default: return 0;
  }
}

/** 目前顯示的任務（照順序取還沒完成的前 3 個）。 */
export function activeQuests(E) {
  return QUESTS.filter((q) => !E.questsDone.includes(q.id)).slice(0, QUESTS_SHOWN);
}

function checkQuests(E) {
  const done = [];
  // 完成一個就補一個新的；新補上的如果已經達成，也一起完成
  for (let guard = 0; guard < QUESTS.length; guard++) {
    const hit = activeQuests(E).filter((q) => questValue(E, q) >= q.n);
    if (!hit.length) break;
    for (const q of hit) {
      E.questsDone.push(q.id);
      if (q.reward.money) E.s.money += q.reward.money;
      if (q.reward.insp) E.insp += q.reward.insp;
      done.push(q.id);
    }
  }
  return done;
}

// ---- 操作 ----

const HANDLERS = {
  /** 擺一件新家具。 */
  place(E, a) {
    const s = E.s;
    const def = FURNITURE[a.furniture];
    if (!def || !buildable(E).includes(a.furniture)) return fail('locked');
    if (floorKind(s.shop, floorOfX(a.x)) === 'vip') return fail('vipFloor');
    if (def.price > s.money) return fail('money');
    const r = canPlace(s.shop, a.furniture, a.x, a.y);
    if (!r.ok) return fail(r.reason);
    s.money -= def.price;
    s.day.purchases += 0;
    const f = addFurniture(s, a.furniture, a.x, a.y);
    const kind = machineOf(f);
    if (kind && E.firstOwned[kind] === undefined) E.firstOwned[kind] = E.day;
    E.spentBuild = (E.spentBuild || 0) + def.price;
    return { ok: true, id: f.id, cost: def.price };
  },
  /** 移動家具（免費）。 */
  move(E, a) {
    const s = E.s;
    const f = s.shop.furniture.find((x) => x.id === a.id);
    if (!f) return fail('bad');
    if (FURNITURE[f.type].fixed) return fail('fixed');
    if (floorKind(s.shop, floorOfX(a.x)) === 'vip') return fail('vipFloor');
    const r = canPlace(s.shop, f.type, a.x, a.y, f.id);
    if (!r.ok) return fail(r.reason);
    f.x = a.x; f.y = a.y;
    s.shop.ver++;
    for (const st of s.staff) setRoleQuiet(s, st);
    return { ok: true };
  },
  /** 賣掉家具（退一半）。 */
  sell(E, a) {
    const s = E.s;
    const i = s.shop.furniture.findIndex((x) => x.id === a.id);
    if (i < 0) return fail('bad');
    const f = s.shop.furniture[i];
    if (FURNITURE[f.type].fixed) return fail('fixed');
    if (f.type === 'chefStation' && countOwned(s, 'chefStation') <= 1) return fail('lastStation');
    for (const st of s.staff) if (st.role === 'chef' && st.station === f.id) setRole(s, st.id, 'off');
    s.shop.furniture.splice(i, 1);
    s.shop.ver++;
    if (f.type === 'uniformSign' && !countOwned(s, 'uniformSign')) s.uniform = false;
    const gain = Math.floor(FURNITURE[f.type].price * N.SELL_REFUND);
    s.money += gain;
    for (const st of s.staff) setRoleQuiet(s, st);
    return { ok: true, gain };
  },
  /** 擴建到下一個大小。 */
  expand(E) {
    const s = E.s;
    const next = N.SIZES[E.size + 1];
    if (!next) return fail('maxSize');
    if (s.reputation < next.rep) return fail('rep');
    if (s.money < next.price) return fail('money');
    s.money -= next.price;
    E.size++;
    s.shop.w = next.w; s.shop.h = next.h;
    // 樓梯跟著前緣走；包廂樓層重新排滿
    placeStairs(s);
    for (let k = 0; k < floorCount(s.shop); k++) if (floorKind(s.shop, k) === 'vip') fillBooths(s, k);
    s.shop.ver++;
    s.baseArrival = arrivalOf(E);
    for (const st of s.staff) setRoleQuiet(s, st);
    return { ok: true, cost: next.price };
  },
  /** 往上加蓋一層樓。kind：'normal' 或 'vip'。樓層數沒有上限，越高越貴。 */
  addFloor(E, a) {
    const s = E.s;
    const kind = a.kind === 'vip' ? 'vip' : 'normal';
    const offer = floorOffer(E, kind);
    if (s.reputation < offer.rep) return fail('rep');
    if (s.money < offer.price) return fail('money');
    const n = floorCount(s.shop);
    // 現在最上面那一層要留出樓梯的位置
    if (!stairsFree(s.shop, n - 1)) return fail('stairBlocked');
    s.money -= offer.price;
    if (!s.shop.floors) s.shop.floors = [{ kind: 'normal' }];
    s.shop.floors.push({ kind });
    placeStairs(s);
    if (kind === 'vip') fillBooths(s, n);
    s.shop.ver++;
    s.baseArrival = arrivalOf(E);
    E.spentBuild = (E.spentBuild || 0) + offer.price;
    for (const st of s.staff) setRoleQuiet(s, st);
    return { ok: true, floor: n, cost: offer.price };
  },
  /** 訓練員工：花靈感點升一級。 */
  train(E, a) {
    const st = E.s.staff.find((x) => x.id === a.staff);
    if (!st) return fail('bad');
    const lv = st.lv || 0;
    if (lv >= B.TRAIN.MAX) return fail('maxLevel');
    if (E.insp < B.TRAIN.COST[lv]) return fail('insp');
    E.insp -= B.TRAIN.COST[lv];
    st.lv = lv + 1;
    return { ok: true, lv: st.lv };
  },
  hire(E, a) {
    if (!STAFF[a.staff] || STAFF[a.staff].player) return fail('bad');
    const st = hireStatus(E, a.staff);
    if (st === 'hired') return fail('hired');
    if (st !== 'ok') return fail('rep');
    addStaff(E.s, a.staff);
    return { ok: true };
  },
  fire(E, a) {
    const s = E.s;
    const i = s.staff.findIndex((x) => x.id === a.staff);
    if (i < 0 || STAFF[a.staff].player) return fail('bad');
    setRole(s, a.staff, 'off');
    s.staff.splice(i, 1);
    return { ok: true };
  },
  research(E, a) {
    const item = RESEARCH.find((r) => r.id === a.id);
    if (!item) return fail('bad');
    const st = researchStatus(E, item);
    if (st === 'done') return fail('done');
    if (st === 'needs') return fail('needs');
    if (st === 'poor') return fail('insp');
    E.insp -= item.cost;
    E.research.push(item.id);
    const s = E.s;
    if (item.kind === 'sushi') {
      s.menu[item.id] = { on: true, price: SUSHI[item.id].ref, mode: 'premium' };
      s.stock[item.id] = { premium: 0, cheap: 0 };
    }
    if (item.feature) s.features[item.feature] = true;
    return { ok: true };
  },
  borrow(E, a) {
    const amount = Math.round(Number(a.amount) / N.LOAN_STEP) * N.LOAN_STEP;
    if (!(amount > 0)) return fail('qty');
    if (E.loan + amount > N.LOAN_MAX) return fail('loanMax');
    E.loan += amount;
    E.s.money += amount;
    return { ok: true, amount };
  },
  repay(E, a) {
    const amount = Math.min(Math.floor(Number(a.amount)), E.loan, Math.max(0, E.s.money));
    if (!(amount > 0)) return fail('qty');
    E.loan -= amount;
    E.s.money -= amount;
    return { ok: true, amount };
  },
  /** 換小鋼珠檯面。 */
  setBoard(E, a) {
    const f = E.s.shop.furniture.find((x) => x.id === a.id);
    if (!f || machineOf(f) !== 'pachinko') return fail('bad');
    if (!(a.board >= 0 && a.board < boardsUnlocked(E))) return fail('locked');
    f.board = a.board;
    f.wom = [];
    return { ok: true };
  },
  /** 換賽道。 */
  setTrack(E, a) {
    const f = E.s.shop.furniture.find((x) => x.id === a.id);
    if (!f || machineOf(f) !== 'race') return fail('bad');
    if (!(a.track >= 0 && a.track < tracksUnlocked(E))) return fail('locked');
    f.track = a.track;
    return { ok: true };
  },
};

/** 店面變了之後，把員工重新放到位置上。 */
function setRoleQuiet(s, st) {
  if (st.role === 'chef' && !s.shop.furniture.some((f) => f.id === st.station)) { st.role = 'off'; st.station = null; }
  // 位置跟著家具走
  const role = st.role;
  if (role !== 'off') { st.role = 'off'; setRole(s, st.id, role, st.station); }
}

/** 只有準備階段才能做的操作。 */
const PREP_ONLY = ['place', 'move', 'sell', 'expand', 'addFloor', 'train', 'hire', 'fire', 'research', 'setBoard', 'setTrack'];

/** 套用一個操作。無限模式專用的在這裡處理，其他的轉給店鋪。 */
export function applyEndless(E, action) {
  if (!action || typeof action !== 'object') return fail('bad');
  if (E.gameOver) return fail('gameOver');
  const h = HANDLERS[action.type];
  if (!h) return applyAction(E.s, action);
  if (PREP_ONLY.includes(action.type) && E.s.phase !== 'prep') return fail('prepOnly');
  return h(E, action);
}

// ---- 打烊結算，進到隔天 ----

/**
 * 打烊後呼叫：收租金和利息、食材損耗、靈感點、任務、月排名、破產判定，然後準備隔天。
 * 回傳當天的結算（也存在 E.last）。
 */
export function endDay(E) {
  const s = E.s;
  if (s.phase !== 'closed') return null;
  const cal = calendar(E.day);
  const d = s.day;
  const rent = rentOf(s.shop);
  s.money -= rent;
  let interest = 0;
  if (cal.weekEnd && E.loan > 0) {
    interest = Math.round(E.loan * N.LOAN_INTEREST);
    s.money -= interest;
  }
  // 靈感點
  E.happyAcc += d.happy;
  const insp = Math.floor(E.happyAcc / N.INSP_PER);
  E.happyAcc -= insp * N.INSP_PER;
  E.insp += insp;
  // 累計
  for (const k of ['kufuUses', 'beatPro', 'beatShumaha', 'lemonPassed']) {
    if (s.flags[k]) E.counters[k] = (E.counters[k] || 0) + s.flags[k];
  }
  E.repStreak = s.reputation >= s.repStart ? E.repStreak + 1 : 0;
  E.stats.days++;
  E.stats.revenue += d.revenue;
  E.stats.served += d.served;
  E.stats.bestDay = Math.max(E.stats.bestDay, d.revenue);
  E.month.revenue += d.revenue;
  // 月排名
  let month = null;
  if (cal.monthEnd) {
    const win = E.month.revenue > E.month.rival;
    const bonus = win ? Math.round(E.month.rival * N.RIVAL_BONUS) : 0;
    if (win) {
      s.money += bonus;
      addReputation(s, N.RIVAL_REP);
      E.month.wins++;
      E.counters.monthWins = (E.counters.monthWins || 0) + 1;
    }
    month = { mine: E.month.revenue, rival: E.month.rival, win, bonus };
    E.month.played++;
    E.month.rival = Math.round(E.month.rival * N.RIVAL_GROWTH);
    E.month.revenue = 0;
  }
  // 食材損耗
  let spoiled = 0;
  for (const d2 of s.deliveries) s.stock[d2.item][d2.grade] += d2.qty;
  s.deliveries = [];
  for (const id of Object.keys(s.stock)) {
    for (const g of ['premium', 'cheap']) {
      const lost = Math.floor(s.stock[id][g] * N.SPOIL);
      s.stock[id][g] -= lost;
      spoiled += lost;
    }
  }
  E.last = {
    date: E.day,
    day: { ...d, sold: { ...d.sold } },
    rent, interest, insp, spoiled, month,
    profit: d.revenue - d.purchases - d.wages - rent - interest,
    repStart: s.repStart, reputation: s.reputation,
    quests: [], bankrupt: null, event: E.today ? E.today.event : null,
  };
  E.last.quests = checkQuests(E);
  // 破產
  E.debtDays = s.money < N.BANKRUPT_MONEY ? E.debtDays + 1 : 0;
  if (E.debtDays >= N.BANKRUPT_DAYS) {
    E.bankruptcies++;
    E.debtDays = 0;
    if (E.bankruptcies >= 2) {
      E.gameOver = true;
      E.last.bankrupt = 'over';
    } else {
      s.money = N.BAILOUT_MONEY;
      addReputation(s, N.BAILOUT_REP);
      E.last.bankrupt = 'bailout';
    }
  }
  E.last.money = s.money;
  E.day++;
  if (!E.gameOver) {
    resetDay(s, daySeed(E));
    rollDay(E);
  }
  return E.last;
}

/** 存檔用：檢查讀回來的資料長得像不像無限模式的狀態。 */
export function validEndless(E) {
  return !!E && E.version === ENDLESS_VERSION && typeof E.day === 'number' && !!E.s && !!E.s.shop
    && Array.isArray(E.s.shop.furniture) && Array.isArray(E.s.staff) && !!E.s.menu && Array.isArray(E.research);
}
