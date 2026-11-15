// 點餐、製作、送餐。純邏輯。
import * as B from '../data/balance.js';
import { SUSHI, QUALITY, gradeOfMode } from '../data/sushi.js';
import { FURNITURE } from '../data/furniture.js';
import { STAFF, CUSTOMER_TYPES } from '../data/characters.js';
import { rngChance } from '../core/rng.js';
import { rectDistance } from './pathfind.js';
import { addReputation, pushFeed, customerRef } from './economy.js';

export function findOrder(state, id) {
  return state.orders.find((o) => o.id === id) || null;
}

export function findCustomer(state, id) {
  return state.customers.find((c) => c.id === id) || null;
}

export function findFurniture(state, id) {
  return state.shop.furniture.find((f) => f.id === id) || null;
}

/**
 * 建立一張訂單並扣庫存。
 * opts.prize = true 是機台獎品（不收錢）。
 */
export function createOrder(state, c, item, opts = {}) {
  const m = state.menu[item];
  const mode = opts.mode || m.mode;
  const grade = gradeOfMode(mode);
  state.stock[item][grade]--;
  const order = {
    id: state.nextId++, cid: c.id, item, mode, grade,
    price: opts.prize ? 0 : opts.price,
    prize: !!opts.prize,
    st: 'queued', chef: null, carrier: null, left: 0, skill: 5,
  };
  state.orders.push(order);
  return order;
}

/**
 * 取消某位顧客的所有訂單。還沒開始做的退回庫存。
 * 機台獎品例外：顧客打包帶走，食材不退回。
 */
export function cancelOrdersOf(state, cid) {
  const keep = [];
  for (const o of state.orders) {
    if (o.cid !== cid) { keep.push(o); continue; }
    if (o.st === 'queued' && !o.prize) state.stock[o.item][o.grade]++;
    o.st = 'cancelled';
  }
  state.orders = keep;
}

export function removeOrder(state, order) {
  const i = state.orders.indexOf(order);
  if (i >= 0) state.orders.splice(i, 1);
}

/** 佇列裡最早的一張還沒人做的訂單。 */
export function nextQueuedOrder(state) {
  for (const o of state.orders) if (o.st === 'queued') return o;
  return null;
}

/**
 * 找一位現在就能接這一貫的外場員工：手上沒事，或正要去板前檯拿餐而且托盤還有空位。
 */
export function availableFloorStaff(state) {
  const ok = (s) => s.role === 'floor' && s.ready && !s.gone;
  const loading = state.staff.find((s) => ok(s) && s.task && s.task.kind === 'carry' && !s.task.picked && s.task.orders.length < B.TRAY_SIZE);
  if (loading) return loading;
  return state.staff.find((s) => ok(s) && !s.task && (!s.path.length || (s.walk && s.walk.kind === 'home'))) || null;
}

/** 外場員工還接得下新的訂單嗎？（有人在班，而且待送的量沒有超過上限） */
export function floorHasRoom(state) {
  const onDuty = state.staff.filter((s) => s.role === 'floor' && !s.gone).length;
  if (!onDuty) return false;
  let load = 0;
  for (const o of state.orders) {
    if (o.st === 'ready' && o.orphan) load++;
    else if (o.st === 'carrying' && o.carrier) {
      const carrier = state.staff.find((s) => s.id === o.carrier);
      if (carrier && carrier.role === 'floor') load++;
    }
  }
  return load < onDuty * B.FLOOR_BACKLOG;
}

/**
 * 送餐規則（計劃書 7.9）。師傅做好壽司時決定怎麼送：
 * 1. 座位離板前檯的曼哈頓距離 ≤ 2：回傳 'hand'（直接遞）。
 * 2. 外場員工接得下：回傳 'floor'。staff 是現在就能接的人；沒有的話 staff 是 null，壽司先放在檯面上等。
 * 3. 沒有外場員工，或外場員工忙不過來：回傳 'chef'（師傅自己送）。
 */
export function decideDelivery(state, order, chef) {
  const c = findCustomer(state, order.cid);
  const station = findFurniture(state, chef.station);
  const seat = c && findFurniture(state, c.furn);
  if (!c || !station || !seat) return { how: 'none' };
  const sd = FURNITURE[station.type];
  const fd = FURNITURE[seat.type];
  const dist = rectDistance(station.x, station.y, sd.w, sd.h, seat.x, seat.y, fd.w, fd.h);
  if (dist <= B.HANDOVER_DIST) return { how: 'hand' };
  if (floorHasRoom(state)) return { how: 'floor', staff: availableFloorStaff(state) };
  return { how: 'chef' };
}

/**
 * 顧客拿到一貫壽司：計算滿意度、判定送錯和魚目混珠，然後開始吃。
 * server 是把壽司交到顧客手上的員工。
 */
export function servePiece(state, c, order, server) {
  const type = CUSTOMER_TYPES[c.type] || {};
  const item = order.item;
  const def = SUSHI[item];
  // 送錯
  if (type.foreign && server && !STAFF[server.id].lang && rngChance(state.rng, B.WRONG_ORDER_CHANCE)) {
    c.sat += B.SAT_WRONG;
    setThought(state, c, 'wrong');
    state.day.wrong++;
  }
  // 品質
  c.sat += B.SAT_QUALITY[QUALITY[order.grade]] || 0;
  // 師傅技術
  if (order.skill > B.SAT_SKILL_BASE) c.sat += (order.skill - B.SAT_SKILL_BASE) * B.SAT_SKILL_PER;
  if (order.skill < B.SAT_UGLY_SKILL) {
    c.sat += B.SAT_UGLY;
    setThought(state, c, 'ugly');
  }
  // 價格
  if (!order.prize) {
    const ratio = order.price / customerRef(item, order.mode);
    if (ratio > 1) {
      c.sat += Math.floor((ratio - 1) * 10 + 1e-9) * B.SAT_PRICE_OVER_PER_10;
      if (ratio > B.PRICEY_RATIO) setThought(state, c, 'pricey');
    } else if (ratio < 1) {
      const bonus = Math.min(B.SAT_PRICE_UNDER_CAP - c.priceBonus, Math.floor((1 - ratio) * 10 + 1e-9) * B.SAT_PRICE_UNDER_PER_10);
      if (bonus > 0) { c.sat += bonus; c.priceBonus += bonus; }
    }
    c.bill += order.price;
    c.budget -= order.price;
  }
  // 魚目混珠
  if (order.mode === 'cheapDisguised') {
    const chance = B.DETECT_CHANCE[c.type] ?? 0.02;
    if (rngChance(state.rng, chance)) {
      c.sat += B.SAT_EXPOSED;
      addReputation(state, B.REP_EXPOSED);
      state.exposedCount++;
      setThought(state, c, def.swordfish ? 'swordfish' : 'fake');
      pushFeed(state, 'feed.exposed', { item });
    }
  }
  if (!c.thought || c.thought.until < state.tick) {
    if (QUALITY[order.grade] === 3 && order.skill >= B.SAT_SKILL_BASE) setThought(state, c, 'yummy');
  }
  c.eaten++;
  state.day.pieces++;
  if (order.prize) {
    // 機台獎品：顧客留在機台前吃（狀態由 sim/machines.js 處理）
    c.prizeGot++;
    c.prizePending = Math.max(0, c.prizePending - 1);
    state.day.prizePieces = (state.day.prizePieces || 0) + 1;
    removeOrder(state, order);
    return;
  }
  c.appetite--;
  c.st = 'eat';
  c.timer = Math.round(B.EAT_MIN * B.TICKS_PER_MIN);
  c.order = 0;
  state.day.sold[item] = (state.day.sold[item] || 0) + 1;
  removeOrder(state, order);
}

/** 設定顧客頭上的想法氣泡。 */
export function setThought(state, c, key, minutes = 3) {
  c.thought = { key, until: state.tick + minutes * B.TICKS_PER_MIN };
}
