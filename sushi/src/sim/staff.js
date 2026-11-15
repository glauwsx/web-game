// 員工行為：師傅捏壽司、外場送餐。純邏輯。
import * as B from '../data/balance.js';
import { SUSHI } from '../data/sushi.js';
import { FURNITURE } from '../data/furniture.js';
import { STAFF } from '../data/characters.js';
import { getLayout, pathBetween, advance, cellOf } from './pathfind.js';
import {
  nextQueuedOrder, decideDelivery, servePiece, findCustomer, findFurniture, findOrder, removeOrder,
} from './orders.js';

export function findStaff(state, id) {
  return state.staff.find((s) => s.id === id) || null;
}

export function kufuActive(state) {
  return state.kufuUntil > state.tick;
}

/** 目前的捏製速度（含真工夫和變裝的影響）。 */
export function effSpeed(state, s) {
  let v = STAFF[s.id].speed;
  if (STAFF[s.id].player) {
    if (kufuActive(state)) v *= B.KUFU_SPEED_MULT;
    if (s.disguised) v *= B.DISGUISE_SPEED_MULT;
  }
  return v;
}

/** 目前的技術。 */
export function effSkill(state, s) {
  let v = STAFF[s.id].skill;
  if (STAFF[s.id].player && kufuActive(state)) v += B.KUFU_SKILL_ADD;
  return v;
}

/** 做一貫要幾個 tick：製作時間 × 10 / (5 + 捏製速度)。 */
export function makeTicks(state, s, item) {
  return SUSHI[item].make * 10 / (5 + effSpeed(state, s)) * B.TICKS_PER_MIN;
}

/** 板前檯的站位（師傅站的座標）。 */
export function stationPos(f) {
  const slot = FURNITURE[f.type].slots[0];
  return [f.x + slot.px, f.y + slot.py];
}

/** 找一座沒人用的板前檯。 */
export function freeStation(state, exceptStaffId = null) {
  for (const f of state.shop.furniture) {
    if (f.type !== 'chefStation') continue;
    if (!state.staff.some((s) => s.id !== exceptStaffId && s.role === 'chef' && s.station === f.id)) return f;
  }
  return null;
}

/** 外場員工待命的位置：離入口幾步遠、不擋到進出格的空格。 */
function idleSpot(state, layout, index) {
  const used = new Set(Object.values(layout.access).filter(Boolean).map(([x, y]) => `${x},${y}`));
  const cells = [];
  for (let y = 0; y < layout.h; y++) {
    for (let x = 0; x < layout.w; x++) {
      const d = layout.dist[y * layout.w + x];
      if (d >= 2 && !used.has(`${x},${y}`)) cells.push([d, x, y]);
    }
  }
  cells.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]));
  if (!cells.length) return [layout.door[0] + 0.5, layout.door[1] + 0.5];
  const pick = cells[Math.min(cells.length - 1, 1 + index * 2)];
  return [pick[1] + 0.5, pick[2] + 0.5];
}

/** 把員工直接放到他的工作位置（準備階段用）。 */
export function placeStaff(state, s) {
  const layout = getLayout(state.shop);
  s.path = [];
  s.task = null;
  s.walk = null;
  s.ready = true;
  if (s.role === 'chef') {
    const f = findFurniture(state, s.station);
    const p = stationPos(f);
    s.gx = p[0]; s.gy = p[1];
    s.fx = 0; s.fy = 1;
  } else if (s.role === 'floor') {
    const idx = state.staff.filter((o) => o.role === 'floor').indexOf(s);
    const p = idleSpot(state, layout, Math.max(0, idx));
    s.gx = p[0]; s.gy = p[1];
    s.fx = 0; s.fy = 1;
  } else {
    s.gx = -1; s.gy = -1;
  }
  s.pgx = s.gx; s.pgy = s.gy;
}

/**
 * 切換員工的工作位置。role：'chef'、'floor'、'off'。
 * 準備階段立刻就位。營業中要走過去，走到才開始工作。
 */
export function setRole(state, staffId, role, stationId = null) {
  const s = findStaff(state, staffId);
  if (!s) return { ok: false, reason: 'unknown' };
  if (!['chef', 'floor', 'off'].includes(role)) return { ok: false, reason: 'role' };
  if (s.gone) return { ok: false, reason: 'gone' };
  if (role === s.role && (role !== 'chef' || !stationId || stationId === s.station)) return { ok: true };
  let station = null;
  if (role === 'chef') {
    station = stationId ? findFurniture(state, stationId) : freeStation(state, staffId);
    if (!station || station.type !== 'chefStation') return { ok: false, reason: 'noStation' };
    if (state.staff.some((o) => o.id !== staffId && o.role === 'chef' && o.station === station.id)) return { ok: false, reason: 'noStation' };
  }
  // 手上的工作放掉：做到一半的訂單退回佇列
  releaseTask(state, s);
  const wasOff = s.role === 'off';
  s.role = role;
  s.station = station ? station.id : null;
  if (state.phase !== 'open' || role === 'off') {
    placeStaff(state, s);
    return { ok: true };
  }
  // 營業中：走過去
  const layout = getLayout(state.shop);
  if (wasOff) { s.gx = layout.door[0] + 0.5; s.gy = layout.door[1] + 0.5; s.pgx = s.gx; s.pgy = s.gy; }
  const from = cellOf(s.gx, s.gy, layout);
  if (role === 'chef') {
    const home = layout.access[`${station.id}:0`];
    const p = home && pathBetween(layout, from, home);
    if (!p) { placeStaff(state, s); return { ok: true }; }
    s.path = p.concat([stationPos(station)]);
  } else {
    const idx = state.staff.filter((o) => o.role === 'floor').indexOf(s);
    const spot = idleSpot(state, layout, Math.max(0, idx));
    const p = pathBetween(layout, from, [Math.floor(spot[0]), Math.floor(spot[1])]);
    if (!p) { placeStaff(state, s); return { ok: true }; }
    s.path = p;
  }
  s.ready = false;
  s.walk = { kind: 'toPost' };
  return { ok: true };
}

/** 放掉手上的工作。做到一半的退回佇列；拿在手上的變成沒人送的訂單。 */
export function releaseTask(state, s) {
  if (s.task) {
    const ids = s.task.kind === 'make' ? [s.task.order] : s.task.orders;
    for (const id of ids) {
      const o = findOrder(state, id);
      if (!o) continue;
      if (s.task.kind === 'make') { o.st = 'queued'; o.chef = null; }
      else { o.st = 'ready'; o.carrier = null; o.orphan = true; }
    }
  }
  s.task = null;
  s.walk = null;
  s.path = [];
}

function customerAccess(state, layout, c) {
  return layout.access[`${c.furn}:${c.slot}`];
}

/**
 * 外場員工到板前檯拿餐的位置：板前檯旁邊走得到的格子。
 * 有好幾格可以選時，選「走到板前檯再走到顧客」總路程最短的那一格。
 */
function pickupCell(layout, station, from, target) {
  let best = null;
  let bestLen = Infinity;
  for (const [dx, dy] of [[0, 1], [1, 1], [-1, 0], [2, 0], [0, -1], [1, -1]]) {
    const x = station.x + dx;
    const y = station.y + dy;
    if (x < 0 || y < 0 || x >= layout.w || y >= layout.h) continue;
    if (layout.dist[y * layout.w + x] < 0) continue;
    const p1 = pathBetween(layout, from, [x, y]);
    const p2 = target ? pathBetween(layout, [x, y], target) : [];
    if (!p1 || !p2) continue;
    const len = p1.length + p2.length;
    if (len < bestLen) { bestLen = len; best = [x, y]; }
  }
  return best;
}

/** 師傅做好一貫之後，決定怎麼送。 */
function finishMaking(state, s, order, layout) {
  order.skill = effSkill(state, s);
  order.st = 'ready';
  order.station = s.station;
  s.task = null;
  dispatch(state, s, order, layout);
}

/** 把一張訂單交給外場員工 f。成功回傳 true。 */
function giveToFloor(state, f, order, layout) {
  if (f.task && f.task.kind === 'carry') {
    f.task.orders.push(order.id);
  } else {
    const station = findFurniture(state, order.station);
    const c = findCustomer(state, order.cid);
    const from = cellOf(f.gx, f.gy, layout);
    const pickup = station && pickupCell(layout, station, from, c ? customerAccess(state, layout, c) : null);
    const p = pickup ? pathBetween(layout, from, pickup) : [];
    if (!p) return false;
    f.path = p.length ? p : [[f.gx, f.gy]];
    f.walk = null;
    f.task = { kind: 'carry', orders: [order.id], picked: false };
    f.home = pickup; // 送完之後回到這裡待命
  }
  order.st = 'carrying';
  order.carrier = f.id;
  order.orphan = false;
  return true;
}

/** 把做好的訂單送出去。chef 是做這張訂單的師傅。 */
function dispatch(state, chef, order, layout) {
  const c = findCustomer(state, order.cid);
  if (!c) { removeOrder(state, order); return; }
  const d = decideDelivery(state, order, chef);
  if (d.how === 'hand') {
    servePiece(state, c, order, chef);
    return;
  }
  if (d.how === 'floor') {
    if (d.staff && giveToFloor(state, d.staff, order, layout)) return;
    order.orphan = true; // 先放在檯面上，等外場員工有空來拿
    return;
  }
  // 師傅自己送
  const target = customerAccess(state, layout, c);
  const home = layout.access[`${chef.station}:0`];
  const p = home && target && pathBetween(layout, home, target);
  if (!p) { servePiece(state, c, order, chef); return; } // 走不到就直接遞（不該發生）
  chef.path = [[home[0] + 0.5, home[1] + 0.5]].concat(p);
  chef.task = { kind: 'carry', orders: [order.id], picked: true };
  chef.walk = { kind: 'deliver' };
  order.st = 'carrying';
  order.carrier = chef.id;
}

function stepChef(state, s, layout) {
  if (s.path.length) {
    const arrived = advance(s, B.STAFF_SPEED[STAFF[s.id].walk]);
    if (!arrived) return;
    if (s.walk && s.walk.kind === 'deliver') {
      const order = s.task && findOrder(state, s.task.orders[0]);
      const c = order && findCustomer(state, order.cid);
      if (order && c) servePiece(state, c, order, s);
      s.task = null;
      // 走回板前檯
      const home = layout.access[`${s.station}:0`];
      const station = findFurniture(state, s.station);
      const back = pathBetween(layout, cellOf(s.gx, s.gy, layout), home) || [];
      s.path = back.concat([stationPos(station)]);
      s.walk = { kind: 'return' };
      return;
    }
    // 回到板前檯或剛就位
    s.walk = null;
    s.ready = true;
    s.fx = 0; s.fy = 1;
    return;
  }
  if (!s.ready) { s.ready = true; }
  if (s.task && s.task.kind === 'make') {
    const order = findOrder(state, s.task.order);
    if (!order) { s.task = null; return; }
    order.left -= 1;
    if (order.left <= 0) finishMaking(state, s, order, layout);
    return;
  }
  const order = nextQueuedOrder(state);
  if (order) {
    order.st = 'making';
    order.chef = s.id;
    order.left = makeTicks(state, s, order.item);
    s.task = { kind: 'make', order: order.id };
  }
}

function stepFloor(state, s, layout) {
  if (s.path.length) {
    if (!advance(s, B.STAFF_SPEED[STAFF[s.id].walk])) return;
    s.walk = null;
    s.ready = true;
  }
  if (!s.ready) s.ready = true;
  const task = s.task;
  if (task && task.kind === 'carry') {
    if (!task.picked) {
      task.picked = true; // 到板前檯了，拿起托盤
    } else {
      const order = findOrder(state, task.orders[0]);
      const c = order && findCustomer(state, order.cid);
      if (order && c) servePiece(state, c, order, s);
      task.orders.shift();
    }
    // 下一位顧客
    while (task.orders.length) {
      const order = findOrder(state, task.orders[0]);
      const c = order && findCustomer(state, order.cid);
      const target = c && customerAccess(state, layout, c);
      if (!order || !c || !target) { task.orders.shift(); continue; }
      const p = pathBetween(layout, cellOf(s.gx, s.gy, layout), target);
      if (!p) { servePiece(state, c, order, s); task.orders.shift(); continue; }
      s.path = p.length ? p : [[s.gx, s.gy]];
      return;
    }
    s.task = null;
  }
  // 撿放在檯面上等人送的訂單，一趟最多拿 TRAY_SIZE 貫
  for (const o of state.orders) {
    if (o.st !== 'ready' || !o.orphan) continue;
    if (s.task && s.task.orders.length >= B.TRAY_SIZE) break;
    giveToFloor(state, s, o, layout);
  }
  // 沒事做：走回板前檯旁邊待命，下一趟才不用從遠處走過來
  if (!s.task && !s.path.length && s.home) {
    const here = cellOf(s.gx, s.gy, layout);
    if (here[0] !== s.home[0] || here[1] !== s.home[1]) {
      const p = pathBetween(layout, here, s.home);
      if (p && p.length) { s.path = p; s.walk = { kind: 'home' }; }
    }
  }
}

/** 所有員工前進一個 tick。 */
export function stepStaff(state) {
  const layout = getLayout(state.shop);
  for (const s of state.staff) {
    s.pgx = s.gx; s.pgy = s.gy;
    if (s.gone > 0) {
      s.gone--;
      if (s.gone === 0) placeStaff(state, s);
      continue;
    }
    if (s.role === 'chef') stepChef(state, s, layout);
    else if (s.role === 'floor') stepFloor(state, s, layout);
  }
}

/** 員工被帶走一段時間（部長事件用）。手上的工作會放掉。 */
export function removeStaffFor(state, s, minutes) {
  releaseTask(state, s);
  s.gone = Math.round(minutes * B.TICKS_PER_MIN);
  s.gx = -1; s.gy = -1; s.pgx = -1; s.pgy = -1;
}
