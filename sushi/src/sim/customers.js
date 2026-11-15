// 顧客行為。純邏輯。
// 顧客狀態 st：
//   'arrive' 從街上走到入口    'queue' 排隊            'toSeat' 走到座位
//   'decide' 看菜單            'wait' 等餐             'eat' 吃
//   'leave' 離開
import * as B from '../data/balance.js';
import { SUSHI } from '../data/sushi.js';
import { FURNITURE } from '../data/furniture.js';
import { CUSTOMER_TYPES, CUSTOMER_LOOKS } from '../data/characters.js';
import { rngInt, rngRange, rngPoisson, rngWeighted, rngChance } from '../core/rng.js';
import { getLayout, pathBetween, advance } from './pathfind.js';
import {
  arrivalLambda, mixWeights, sellPrice, customerRef, inStock, settleCustomer, hourOf, pushFeed,
} from './economy.js';
import { createOrder, cancelOrdersOf, setThought, findCustomer, findFurniture } from './orders.js';

const STREET_Y = 1.0;   // 人行道離店面前緣幾格
const SPAWN_DIST = 9;   // 從入口左右幾格遠的地方出現

function doorX(state) { return state.shop.door.gx + 0.5; }

/** 建立一位顧客（還沒放進 state.customers）。 */
export function createCustomer(state, type, opts = {}) {
  const def = CUSTOMER_TYPES[type] || CUSTOMER_TYPES.normal;
  const rng = state.rng;
  const looks = CUSTOMER_LOOKS[type];
  const look = opts.look || `${type}.${rngInt(rng, 0, looks.length - 1)}`;
  const prefs = {};
  for (const id of Object.keys(state.menu)) {
    prefs[id] = rngRange(rng, B.PREF_MIN, B.PREF_MAX) * def.tierPref[SUSHI[id].tier - 1];
  }
  const side = opts.side ?? (rngChance(rng, 0.5) ? 1 : -1);
  const patience = (opts.patience ?? def.patience) * B.TICKS_PER_MIN;
  const c = {
    id: state.nextId++, type, look,
    st: 'arrive', delay: opts.delay || 0,
    gx: doorX(state) + side * SPAWN_DIST, gy: state.shop.h + STREET_Y,
    pgx: 0, pgy: 0, fx: -side, fy: 0, path: [],
    side,
    leader: opts.leader || 0, members: [],
    appetite: opts.appetite ?? rngInt(rng, def.appetite[0], def.appetite[1]),
    budget: opts.budget ?? rngInt(rng, def.budget[0] / 100, def.budget[1] / 100) * 100,
    sens: def.sens,
    patience, patienceMax: patience,
    prefs,
    sat: B.SAT_START, bill: 0, fees: 0, eaten: 0, played: 0, priceBonus: 0, tip: 0,
    furn: 0, slot: -1, order: 0, timer: 0, waited: 0, queued: 0,
    thought: null, settled: false,
    goal: opts.goal || 'eat', plays: opts.plays || 0, prizes: [], boss: opts.boss || null,
  };
  c.pgx = c.gx; c.pgy = c.gy;
  c.path = [[doorX(state), state.shop.h + STREET_Y], [doorX(state), state.shop.h + 0.45]];
  return c;
}

/** 產生一組顧客（家庭客是 3 人一組）。回傳組長。 */
export function spawnParty(state, type, opts = {}) {
  const def = CUSTOMER_TYPES[type] || CUSTOMER_TYPES.normal;
  const n = opts.party || def.party || 1;
  const leader = createCustomer(state, type, opts.look ? opts : { ...opts, look: type === 'family' ? `family.${rngInt(state.rng, 0, 1)}` : undefined });
  state.customers.push(leader);
  for (let i = 1; i < n; i++) {
    // 家庭客：第二位是另一個大人或小孩，第三位是小孩
    let look;
    if (type === 'family') look = i === 1 ? `family.${rngInt(state.rng, 1, 2)}` : `family.${rngInt(state.rng, 2, 3)}`;
    const m = createCustomer(state, type, { ...opts, look, side: leader.side, leader: leader.id, delay: i * B.PARTY_SPAWN_GAP });
    state.customers.push(m);
    leader.members.push(m.id);
  }
  state.day.groups++;
  state.day.people += n;
  return leader;
}

/** 每個遊戲分鐘呼叫一次：用卜瓦松分布抽這一分鐘的來客。 */
export function spawnArrivals(state) {
  const hour = hourOf(state);
  const n = rngPoisson(state.rng, arrivalLambda(state, hour));
  for (let i = 0; i < n; i++) {
    const { types, weights } = mixWeights(state, hour);
    const idx = rngWeighted(state.rng, weights);
    if (idx < 0) return;
    spawnParty(state, types[idx]);
  }
}

// ---- 座位 ----
function freeSeatSlots(state, layout, f) {
  const def = FURNITURE[f.type];
  const out = [];
  def.slots.forEach((slot, i) => {
    if (slot.role !== 'seat') return;
    if (f.occ[i]) return;
    if (!layout.access[`${f.id}:${i}`]) return;
    out.push(i);
  });
  return out;
}

/** 幫一組 n 個人找座位。回傳 [{ furn, slot }]，找不到回傳 null。 */
export function findSeats(state, layout, n, prefersTable) {
  const counters = [];
  const tables = [];
  for (const f of state.shop.furniture) {
    if (f.type === 'counterSeat') { const s = freeSeatSlots(state, layout, f); if (s.length) counters.push({ f, s }); }
    else if (f.type === 'tableSet') { const s = freeSeatSlots(state, layout, f); if (s.length) tables.push({ f, s }); }
  }
  if (n === 1 && !prefersTable) {
    if (counters.length) return [{ furn: counters[0].f.id, slot: counters[0].s[0] }];
    if (tables.length) return [{ furn: tables[0].f.id, slot: tables[0].s[0] }];
    return null;
  }
  // 多人：先找整張空桌，再找夠位子的桌子，最後才坐吧台
  const full = tables.find((t) => t.s.length >= n && t.s.length === FURNITURE[t.f.type].slots.length);
  const some = full || tables.find((t) => t.s.length >= n);
  if (some) return some.s.slice(0, n).map((slot) => ({ furn: some.f.id, slot }));
  if (counters.length >= n) return counters.slice(0, n).map((e) => ({ furn: e.f.id, slot: e.s[0] }));
  return null;
}

function slotPos(f, i) {
  const slot = FURNITURE[f.type].slots[i];
  return [f.x + slot.px, f.y + slot.py];
}

function assignSeat(state, layout, c, seat) {
  const f = findFurniture(state, seat.furn);
  f.occ[seat.slot] = c.id;
  c.furn = seat.furn;
  c.slot = seat.slot;
  c.assigned = true;
}

/** 讓已經有座位的顧客從入口走進去。 */
function walkToSeat(state, layout, c) {
  const f = findFurniture(state, c.furn);
  const access = layout.access[`${c.furn}:${c.slot}`];
  const inside = [layout.door[0] + 0.5, layout.door[1] + 0.5];
  const p = pathBetween(layout, layout.door, access) || [];
  c.path = [inside].concat(p, [slotPos(f, c.slot)]);
  c.st = 'toSeat';
}

function partyOf(state, leader) {
  return [leader].concat(leader.members.map((id) => findCustomer(state, id)).filter(Boolean));
}

/** 組長到了入口：找座位。找不到就排隊，隊伍滿了就離開。 */
function onLeaderAtDoor(state, layout, c) {
  const def = CUSTOMER_TYPES[c.type] || {};
  const party = partyOf(state, c);
  const seats = findSeats(state, layout, party.length, !!def.prefersTable);
  if (seats) {
    party.forEach((m, i) => assignSeat(state, layout, m, seats[i]));
    walkToSeat(state, layout, c);
    return;
  }
  if (state.queue.length >= B.QUEUE_MAX) {
    state.day.lost++;
    for (const m of party) startLeaving(state, layout, m, false);
    return;
  }
  state.queue.push(c.id);
  c.st = 'queue';
}

function queuePos(state, index, memberIndex) {
  return [doorX(state) + 1.1 + index * 0.75 + memberIndex * 0.22, state.shop.h + 0.55 + memberIndex * 0.38];
}

/** 排隊的人依序找座位。 */
export function seatQueue(state) {
  if (!state.queue.length) return;
  const layout = getLayout(state.shop);
  const rest = [];
  for (const id of state.queue) {
    const c = findCustomer(state, id);
    if (!c || c.st !== 'queue') continue;
    const def = CUSTOMER_TYPES[c.type] || {};
    const party = partyOf(state, c);
    const seats = findSeats(state, layout, party.length, !!def.prefersTable);
    if (!seats) { rest.push(id); continue; }
    party.forEach((m, i) => {
      assignSeat(state, layout, m, seats[i]);
      if (m.st === 'queue') {
        // 從排隊的位置走回入口再進去
        m.path = [[doorX(state), state.shop.h + 0.45]];
        m.st = 'arrive';
      }
    });
  }
  state.queue = rest;
}

// ---- 點餐 ----
/**
 * 顧客選一貫。回傳 { item, price }，不點回傳 null。
 * 效用 = 偏好 × 品質係數 − 價格敏感度 × (售價 / 顧客心中的參考售價) + 隨機擾動
 */
export function chooseOrder(state, c) {
  let best = null;      // 不管有沒有庫存
  let bestIn = null;    // 有庫存的
  for (const item of Object.keys(state.menu)) {
    const m = state.menu[item];
    if (!m.on) continue;
    const price = sellPrice(state, item);
    if (price > c.budget) continue;
    const coef = m.mode === 'cheapHonest' ? B.QUALITY_COEF.cheap : B.QUALITY_COEF.premium;
    const u = c.prefs[item] * coef - c.sens * (price / customerRef(item, m.mode)) + rngRange(state.rng, -B.ORDER_NOISE, B.ORDER_NOISE);
    if (!best || u > best.u) best = { item, price, u };
    if (inStock(state, item) && (!bestIn || u > bestIn.u)) bestIn = { item, price, u };
  }
  if (!best || best.u < B.ORDER_THRESHOLD) return null;
  if (!inStock(state, best.item)) {
    c.sat += B.SAT_SOLD_OUT;
    setThought(state, c, 'soldout');
    state.day.soldOut++;
  }
  if (!bestIn || bestIn.u < B.ORDER_THRESHOLD) return null;
  return bestIn;
}

/** 最便宜的在售品項價格（用來判斷預算夠不夠再點）。 */
function cheapestPrice(state) {
  let min = Infinity;
  for (const item of Object.keys(state.menu)) {
    if (!state.menu[item].on || !inStock(state, item)) continue;
    min = Math.min(min, sellPrice(state, item));
  }
  return min;
}

// ---- 離開 ----
/** 讓顧客開始離開。angry：生氣離開。 */
export function startLeaving(state, layout, c, angry) {
  cancelOrdersOf(state, c.id);
  settleCustomer(state, c, angry);
  if (c.tip > 0) setThought(state, c, 'tip');
  else if (angry) setThought(state, c, 'angry');
  // 讓出座位
  if (c.furn) {
    const f = findFurniture(state, c.furn);
    if (f && f.occ[c.slot] === c.id) f.occ[c.slot] = 0;
  }
  const out = [doorX(state), state.shop.h + STREET_Y];
  const away = [doorX(state) + (c.side || 1) * -SPAWN_DIST, state.shop.h + STREET_Y];
  let path = [];
  const seated = ['decide', 'wait', 'eat', 'toSeat', 'play', 'prize'].includes(c.st);
  if (seated && c.furn) {
    const access = layout.access[`${c.furn}:${c.slot}`];
    if (access && c.st !== 'toSeat') {
      const p = pathBetween(layout, access, layout.door) || [];
      path = [[access[0] + 0.5, access[1] + 0.5]].concat(p);
    } else {
      path = [[layout.door[0] + 0.5, layout.door[1] + 0.5]];
    }
  }
  c.path = path.concat([out, away]);
  c.furn = 0;
  c.slot = -1;
  c.st = 'leave';
  const qi = state.queue.indexOf(c.id);
  if (qi >= 0) state.queue.splice(qi, 1);
}

function stepOne(state, layout, c) {
  c.pgx = c.gx; c.pgy = c.gy;
  switch (c.st) {
    case 'arrive': {
      if (c.delay > 0) { c.delay--; return; }
      if (!advance(c, B.CUSTOMER_SPEED)) return;
      if (c.assigned) { walkToSeat(state, layout, c); return; }
      if (c.leader) {
        const leader = findCustomer(state, c.leader);
        if (!leader || leader.st === 'leave') { startLeaving(state, layout, c, false); return; }
        c.st = 'queue'; // 等組長找到座位
        return;
      }
      onLeaderAtDoor(state, layout, c);
      return;
    }
    case 'queue': {
      // 站到隊伍裡的位置
      const leaderId = c.leader || c.id;
      const idx = state.queue.indexOf(leaderId);
      if (idx >= 0) {
        const leader = c.leader ? findCustomer(state, c.leader) : c;
        const mi = c.leader && leader ? leader.members.indexOf(c.id) + 1 : 0;
        c.path = [queuePos(state, idx, mi)];
        advance(c, B.CUSTOMER_SPEED);
        c.path = [];
        c.fx = -1; c.fy = 0;
      }
      if (c.leader) return; // 耐心由組長倒數
      c.queued++;
      c.patience--;
      if (c.queued % B.TICKS_PER_MIN === 0) {
        for (const m of partyOf(state, c)) m.sat += B.SAT_QUEUE_PER_MIN;
      }
      if (c.patience <= 0) {
        // 整組一起走。評價只扣一次（算在組長身上）。
        for (const m of partyOf(state, c)) {
          startLeaving(state, layout, m, m === c);
          if (m !== c) setThought(state, m, 'angry');
        }
        pushFeed(state, 'feed.queueLeft', null);
      }
      return;
    }
    case 'toSeat': {
      if (!advance(c, B.CUSTOMER_SPEED)) return;
      c.st = 'decide';
      c.timer = B.DECIDE_TICKS;
      return;
    }
    case 'decide': {
      if (--c.timer > 0) return;
      if (c.appetite <= 0 || c.budget < cheapestPrice(state)) {
        if (c.eaten === 0) setThought(state, c, 'nothing');
        startLeaving(state, layout, c, false);
        return;
      }
      const pick = chooseOrder(state, c);
      if (!pick) {
        if (c.eaten === 0) setThought(state, c, 'nothing');
        startLeaving(state, layout, c, false);
        return;
      }
      const order = createOrder(state, c, pick.item, { price: pick.price });
      c.order = order.id;
      c.st = 'wait';
      c.waited = 0;
      c.patience = c.patienceMax; // 每次等餐重新倒數
      return;
    }
    case 'wait': {
      c.waited++;
      c.patience--;
      const freeTicks = B.SAT_WAIT_FREE_MIN * B.TICKS_PER_MIN;
      if (c.waited > freeTicks && (c.waited - freeTicks) % B.TICKS_PER_MIN === 0) {
        c.sat += B.SAT_WAIT_PER_MIN;
        setThought(state, c, 'slow');
      }
      if (c.patience <= 0) startLeaving(state, layout, c, true);
      return;
    }
    case 'eat': {
      if (--c.timer > 0) return;
      c.st = 'decide';
      c.timer = 1;
      return;
    }
    case 'leave': {
      if (advance(c, B.CUSTOMER_SPEED)) c.st = 'gone';
      return;
    }
    default:
  }
}

/** 所有顧客前進一個 tick。 */
export function stepCustomers(state) {
  const layout = getLayout(state.shop);
  // 用索引走訪：過程中不會新增顧客，只會改狀態
  for (let i = 0; i < state.customers.length; i++) {
    const c = state.customers[i];
    if (c.st === 'gone') continue;
    stepOne(state, layout, c);
  }
  if (state.customers.some((c) => c.st === 'gone')) state.customers = state.customers.filter((c) => c.st !== 'gone');
}

/** 打烊：還在店裡的顧客就地結帳。 */
export function closeOutCustomers(state) {
  for (const c of state.customers) {
    cancelOrdersOf(state, c.id);
    if (c.st !== 'leave') settleCustomer(state, c, false);
  }
}
