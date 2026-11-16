// 金錢、進貨、庫存、評價。純邏輯。
import * as B from '../data/balance.js';
import { SUSHI, gradeOfMode } from '../data/sushi.js';
import { FURNITURE } from '../data/furniture.js';
import { STAFF, CUSTOMER_TYPES } from '../data/characters.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** 目前是一天裡的第幾分鐘（從 0:00 起算）。 */
export function minuteOfDay(state) {
  return state.openMin + Math.floor(state.tick / B.TICKS_PER_MIN);
}

export function hourOf(state) {
  return Math.floor(minuteOfDay(state) / 60);
}

/** 加一則通知（介面會顯示）。只留最近 40 則。 */
export function pushFeed(state, key, p) {
  state.feed.push({ t: state.tick, key, p: p || null });
  if (state.feed.length > 40) state.feed.shift();
}

// ---- 庫存 ----
export function stockCap(state) {
  let cap = B.STOCK_BASE;
  for (const f of state.shop.furniture) cap += FURNITURE[f.type].stock || 0;
  return cap;
}

export function totalStock(state) {
  let n = 0;
  for (const id of Object.keys(state.stock)) n += state.stock[id].premium + state.stock[id].cheap;
  for (const d of state.deliveries) n += d.qty;
  return n;
}

/** 食材單價（含每日魚價浮動和事件折扣）。 */
export function unitCost(state, item, grade) {
  const base = grade === 'premium' ? SUSHI[item].costP : SUSHI[item].costC;
  const f = (state.priceFactor && state.priceFactor[item]) || 1;
  return Math.max(1, Math.round(base * f * (state.priceMult || 1)));
}

/**
 * 進貨。準備階段立刻到貨。營業中是緊急補貨：價格加 50%，20 遊戲分鐘後到貨。
 * 回傳 { ok, reason, cost, qty }。
 */
export function buy(state, item, grade, qty) {
  if (!state.stock[item]) return { ok: false, reason: 'locked' };
  if (grade !== 'premium' && grade !== 'cheap') return { ok: false, reason: 'grade' };
  if (grade === 'cheap' && !state.features.cheap) return { ok: false, reason: 'locked' };
  qty = Math.floor(qty);
  if (!(qty > 0)) return { ok: false, reason: 'qty' };
  if (state.phase === 'closed') return { ok: false, reason: 'closed' };
  const room = stockCap(state) - totalStock(state);
  if (qty > room) return { ok: false, reason: 'full' };
  const open = state.phase === 'open';
  const cost = Math.round(unitCost(state, item, grade) * qty * (open ? B.EMERGENCY_MARKUP : 1));
  if (cost > state.money) return { ok: false, reason: 'money' };
  state.money -= cost;
  state.day.purchases += cost;
  if (open) {
    state.deliveries.push({ at: state.tick + B.EMERGENCY_DELAY_MIN * B.TICKS_PER_MIN, item, grade, qty });
  } else {
    state.stock[item][grade] += qty;
  }
  return { ok: true, cost, qty };
}

/** 處理到貨。 */
export function processDeliveries(state) {
  if (!state.deliveries.length) return;
  const rest = [];
  for (const d of state.deliveries) {
    if (d.at <= state.tick) {
      state.stock[d.item][d.grade] += d.qty;
      pushFeed(state, 'feed.delivered', { item: d.item, qty: d.qty });
    } else rest.push(d);
  }
  state.deliveries = rest;
}

// ---- 菜單與價格 ----
/** 目前的售價（均一價招牌掛上時一律 ¥300）。 */
export function sellPrice(state, item) {
  if (state.uniform) return B.UNIFORM_PRICE;
  return state.menu[item].price;
}

/** 顧客心中的參考售價。 */
export function customerRef(item, mode) {
  return SUSHI[item].ref * (mode === 'cheapHonest' ? B.CHEAP_HONEST_REF : 1);
}

/** 菜單項目現在有沒有貨。 */
export function inStock(state, item) {
  const m = state.menu[item];
  return state.stock[item][gradeOfMode(m.mode)] > 0;
}

// ---- 吸引力與來客 ----
export function attraction(state) {
  let a = 0;
  for (const f of state.shop.furniture) {
    const def = FURNITURE[f.type];
    a += def.attraction || 0;
    if (def.machine === 'pachinko') a += B.PACHINKO_ATTRACTION;
    if (def.machine === 'race') a += B.RACE_ATTRACTION;
  }
  for (const s of state.staff) {
    if (s.role === 'floor' && !s.gone) a += STAFF[s.id].floorAttraction || 0;
  }
  return a;
}

export function repFactor(rep) {
  return clamp(B.REP_FACTOR_BASE + rep / B.REP_FACTOR_DIV, B.REP_FACTOR_MIN, B.REP_FACTOR_MAX);
}

/** 這一分鐘的來客期望值（組）。 */
export function arrivalLambda(state, hour) {
  const curve = B.HOUR_CURVE[hour] || 0;
  let l = state.baseArrival * curve * repFactor(state.reputation) * (1 + attraction(state)) * (state.arrivalMult || 1);
  if (state.uniform) l *= B.UNIFORM_ARRIVAL_MULT;
  // 特殊刑事在場時，其他客人不太敢進來
  if (state.customers.some((c) => c.type === 'tokkei' && c.st !== 'leave' && c.st !== 'arrive')) l *= B.TOKKEI_ARRIVAL_MULT;
  return l;
}

/** 顧客類型的權重（午餐時段上班族變多）。回傳 { types, weights }。 */
export function mixWeights(state, hour) {
  const types = [];
  const weights = [];
  const hasPachinko = state.shop.furniture.some((f) => FURNITURE[f.type].machine === 'pachinko');
  const hasRace = state.shop.furniture.some((f) => FURNITURE[f.type].machine === 'race');
  for (const [type, w] of Object.entries(state.mix)) {
    let weight = w;
    if (type === 'salaryman' && B.LUNCH_HOURS.includes(hour)) weight *= B.LUNCH_SALARYMAN_MULT;
    if (type === 'pachinkoFan' && !hasPachinko) weight = 0;
    if (type === 'raceFan' && !hasRace) weight = 0;
    if (type === 'vip') weight *= state.shop.furniture.filter((f) => FURNITURE[f.type].vip).length;
    if (state.mixMult && state.mixMult[type]) weight *= state.mixMult[type];
    types.push(type);
    weights.push(weight);
  }
  return { types, weights };
}

/** 預估今天會賣出幾貫（給建議進貨量用）。考慮來客數和師傅的產能。 */
export function estimateDemand(state) {
  let groups = 0;
  let pieces = 0;
  for (let hr = Math.floor(state.openMin / 60); hr < Math.floor(state.closeMin / 60); hr++) {
    const l = arrivalLambda(state, hr) * 60;
    const { types, weights } = mixWeights(state, hr);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    types.forEach((type, i) => {
      const def = CUSTOMER_TYPES[type];
      const share = weights[i] / total;
      groups += l * share;
      pieces += l * share * def.party * (def.appetite[0] + def.appetite[1]) / 2;
    });
  }
  // 師傅產能
  const minutes = state.closeMin - state.openMin;
  let capacity = 0;
  const onMenu = Object.keys(state.menu).filter((id) => state.menu[id].on);
  const avgMake = onMenu.length ? onMenu.reduce((a, id) => a + SUSHI[id].make, 0) / onMenu.length : 1.2;
  for (const s of state.staff) {
    if (s.role !== 'chef') continue;
    capacity += minutes / (avgMake * 10 / (5 + STAFF[s.id].speed));
  }
  return { groups, pieces, capacity, sell: Math.min(pieces, capacity * 0.85) };
}

const TIER_WEIGHT = { 1: 1.0, 2: 1.0, 3: 0.7, 4: 0.5 };

/**
 * 建議進貨量。回傳 [{ item, grade, qty }]。
 * 照預估銷量分給菜單上的品項，扣掉現有庫存，再依庫存空間和資金等比例縮小。
 */
export function suggestPurchases(state) {
  const onMenu = Object.keys(state.menu).filter((id) => state.menu[id].on);
  if (!onMenu.length) return [];
  const { sell } = estimateDemand(state);
  const totalW = onMenu.reduce((a, id) => a + TIER_WEIGHT[SUSHI[id].tier], 0);
  let list = [];
  for (const id of onMenu) {
    const grade = gradeOfMode(state.menu[id].mode);
    const want = Math.ceil((sell * TIER_WEIGHT[SUSHI[id].tier] / totalW) * B.SUGGEST_MARGIN);
    const qty = want - state.stock[id][grade];
    if (qty > 0) list.push({ item: id, grade, qty });
  }
  const room = stockCap(state) - totalStock(state);
  const totalQty = list.reduce((a, e) => a + e.qty, 0);
  const totalCost = list.reduce((a, e) => a + e.qty * unitCost(state, e.item, e.grade), 0);
  const f = Math.min(1, totalQty ? room / totalQty : 1, totalCost ? state.money / totalCost : 1);
  if (f < 1) list = list.map((e) => ({ ...e, qty: Math.floor(e.qty * f) })).filter((e) => e.qty > 0);
  return list;
}

// ---- 收入與評價 ----
/** 加收入。kind：'sales'、'fees'、'tips'、'bonus'。 */
export function addRevenue(state, amount, kind) {
  if (!(amount > 0)) return;
  state.money += amount;
  state.day.revenue += amount;
  state.day[kind] += amount;
}

/** 罰款：從營業額和資金扣除。 */
export function addPenalty(state, amount) {
  state.money -= amount;
  state.day.revenue -= amount;
  state.day.penalties += amount;
}

export function addReputation(state, d) {
  state.reputation = clamp(state.reputation + d, 0, 100);
}

export function addKufu(state, d) {
  state.kufu = clamp(state.kufu + d, 0, B.KUFU_MAX);
}

/**
 * 顧客結帳離開時的結算。
 * angry = true：等到生氣離開。只付已經吃的，沒有小費，評價固定下降。
 */
export function settleCustomer(state, c, angry) {
  if (c.settled) return;
  c.settled = true;
  if (c.bill > 0) addRevenue(state, c.bill, 'sales');
  if (c.fees > 0) addRevenue(state, c.fees, 'fees');
  c.sat = clamp(c.sat, 0, 100);
  if (angry) {
    addReputation(state, c.furn ? B.REP_ANGRY_LEAVE : B.REP_QUEUE_LEAVE);
    state.day.angry++;
    return;
  }
  if (c.eaten > 0 || c.played > 0) state.day.served++;
  if (c.eaten === 0 && c.played === 0) return; // 沒消費就離開，不影響評價
  addReputation(state, (c.sat - B.REP_LEAVE_BASE) / B.REP_LEAVE_DIV);
  if (c.sat >= B.TIP_SAT && c.bill > 0) {
    const tip = Math.round(c.bill * B.TIP_RATE);
    addRevenue(state, tip, 'tips');
    c.tip = tip;
  }
  if (c.sat >= B.KUFU_SAT) {
    addKufu(state, B.KUFU_GAIN);
    state.day.happy++;
  }
}

/** 星數：評價每 20 分一顆星。 */
export function stars(rep) {
  return Math.floor(rep / 20);
}
