// 強敵與事件。純邏輯。
// 事件時間表在 state.events：[{ kind, at（一天裡的分鐘）, fired }]。
import * as B from '../data/balance.js';
import { STAFF } from '../data/characters.js';
import { rngInt } from '../core/rng.js';
import { getLayout } from './pathfind.js';
import { minuteOfDay, pushFeed, addPenalty } from './economy.js';
import { spawnParty, startLeaving } from './customers.js';
import { removeStaffFor } from './staff.js';
import { setThought } from './orders.js';

/**
 * 把關卡的事件表變成當天的時間表。時間有小幅隨機（用種子決定）。
 * defs = [{ kind, at, jitter }]
 */
export function scheduleEvents(defs, rng) {
  return (defs || []).map((e) => {
    const j = e.jitter || 0;
    return { ...e, at: e.at + (j ? rngInt(rng, -j, j) : 0), fired: false };
  }).sort((a, b) => a.at - b.at);
}

const SPAWNERS = {
  bucho(state) {
    const c = spawnParty(state, 'bucho', { look: 'bucho', boss: 'bucho' });
    c.seen = 0;
    pushFeed(state, 'feed.buchoComing', null);
    state.banner = { key: 'banner.bucho', until: state.tick + B.BANNER_MIN * B.TICKS_PER_MIN, kind: 'bucho' };
  },
};

/** 註冊新的事件種類（其他模組用，例如職業玩家、修馬哈、檸檬）。 */
export function registerEvent(kind, spawner) {
  SPAWNERS[kind] = spawner;
}

/** 每個遊戲分鐘呼叫一次：觸發到時間的事件。 */
export function fireEvents(state) {
  const now = minuteOfDay(state);
  for (const e of state.events) {
    if (e.fired || e.at > now) continue;
    e.fired = true;
    const fn = SPAWNERS[e.kind];
    if (fn) fn(state, e);
  }
}

/** 部長現在在不在店裡（已經進門、還沒離開）。 */
export function buchoInShop(state) {
  return state.customers.some((c) => c.boss === 'bucho' && ['toSeat', 'decide', 'wait', 'eat'].includes(c.st));
}

/** 部長已經出現（包含還在路上、排隊）。介面用來顯示「變裝」的提醒。 */
export function buchoAround(state) {
  return state.customers.some((c) => c.boss === 'bucho' && c.st !== 'leave' && c.st !== 'gone');
}

/**
 * 部長的規則（計劃書 10.3）：
 * 部長在店裡時，阿兩在板前檯而且沒有變裝，5 遊戲分鐘後被認出來。
 * 被認出來：罰款 ¥10,000，阿兩被拖走 60 遊戲分鐘。
 */
function stepBucho(state) {
  const ryo = state.staff.find((s) => STAFF[s.id].player);
  for (const c of state.customers) {
    if (c.boss !== 'bucho') continue;
    if (!['toSeat', 'decide', 'wait', 'eat'].includes(c.st)) continue;
    const exposed = ryo && ryo.role === 'chef' && !ryo.gone && !ryo.disguised;
    if (!exposed) { c.seen = 0; continue; }
    c.seen = (c.seen || 0) + 1;
    if (c.seen === Math.round(B.BUCHO_NOTICE_MIN * B.TICKS_PER_MIN / 2)) setThought(state, c, 'suspicious', 2);
    if (c.seen >= B.BUCHO_NOTICE_MIN * B.TICKS_PER_MIN) {
      addPenalty(state, B.BUCHO_FINE);
      removeStaffFor(state, ryo, B.BUCHO_DRAG_MIN);
      state.day.caught++;
      pushFeed(state, 'feed.buchoCaught', { fine: B.BUCHO_FINE });
      state.banner = { key: 'banner.buchoCaught', until: state.tick + B.BANNER_MIN * B.TICKS_PER_MIN, kind: 'caught' };
      setThought(state, c, 'baka', 4);
      startLeaving(state, getLayout(state.shop), c, false);
    }
  }
}

/** 每個 tick 呼叫一次。 */
export function stepBosses(state) {
  stepBucho(state);
  if (state.banner && state.banner.until <= state.tick) state.banner = null;
}

/** 變裝：阿兩變成「淺草一郎」。變裝期間捏製速度 −30%。 */
export function setDisguise(state, on) {
  const ryo = state.staff.find((s) => STAFF[s.id].player);
  if (!ryo) return { ok: false, reason: 'noRyo' };
  if (ryo.gone) return { ok: false, reason: 'gone' };
  ryo.disguised = !!on;
  return { ok: true };
}
