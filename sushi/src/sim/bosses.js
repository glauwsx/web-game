// 強敵與事件。純邏輯。
// 事件時間表在 state.events：[{ kind, at（一天裡的分鐘）, fired }]。
import * as B from '../data/balance.js';
import { STAFF, CUSTOMER_TYPES } from '../data/characters.js';
import { rngInt } from '../core/rng.js';
import { getLayout } from './pathfind.js';
import { minuteOfDay, pushFeed, addPenalty, addReputation, addKufu } from './economy.js';
import { spawnParty, startLeaving } from './customers.js';
import { removeStaffFor } from './staff.js';
import { setThought } from './orders.js';

/**
 * 把關卡的事件表變成當天的時間表。時間有小幅隨機（用種子決定）。
 * defs = [{ kind, at, jitter }]
 */
export function scheduleEvents(defs, rng) {
  const out = [];
  for (const e of defs || []) {
    const j = e.jitter || 0;
    const at = e.at + (j ? rngInt(rng, -j, j) : 0);
    out.push({ ...e, at, fired: false });
    // 檸檬來店前有預告
    if (e.kind === 'lemon') out.push({ kind: 'lemonNotice', at: at - B.LEMON.NOTICE_MIN, fired: false });
  }
  return out.sort((a, b) => a.at - b.at);
}

const SPAWNERS = {
  bucho(state) {
    const c = spawnParty(state, 'bucho', { look: 'bucho', boss: 'bucho' });
    c.seen = 0;
    pushFeed(state, 'feed.buchoComing', null);
    state.banner = { key: 'banner.bucho', until: state.tick + B.BANNER_MIN * B.TICKS_PER_MIN, kind: 'bucho' };
  },
};

const banner = (state, key, kind) => { state.banner = { key, until: state.tick + B.BANNER_MIN * B.TICKS_PER_MIN, kind }; };

// 檸檬（計劃書 10.4）：預告 → 來店試吃 3 個品項 → 通過或被吃出來
SPAWNERS.lemonNotice = (state) => {
  state.flags.lemonComing = true;
  pushFeed(state, 'feed.lemonNotice', null);
  banner(state, 'banner.lemonNotice', 'lemon');
};
SPAWNERS.lemon = (state) => {
  const c = spawnParty(state, 'lemon', { look: 'lemon', boss: 'lemon' });
  c.tasted = [];
  state.flags.lemonComing = true;
  pushFeed(state, 'feed.lemonComing', null);
  banner(state, 'banner.lemon', 'lemon');
};

/** 檸檬的試吃結果。 */
function stepLemon(state) {
  for (const c of state.customers) {
    if (c.boss !== 'lemon' || c.lemonDone) continue;
    if (c.exposedNow) {
      // 被吃出來：當場公開。店內所有顧客滿意度下降，評價下降
      c.lemonDone = true;
      for (const o of state.customers) {
        if (o !== c && ['toSeat', 'decide', 'wait', 'eat', 'play', 'prize'].includes(o.st)) o.sat += B.LEMON.FAIL_SAT;
      }
      addReputation(state, B.LEMON.FAIL_REP);
      state.flags.lemonComing = false;
      state.flags.lemonResult = 'fail';
      state.flags.lemonTests = (state.flags.lemonTests || 0) + 1;
      pushFeed(state, 'feed.lemonFail', null);
      banner(state, 'banner.lemonFail', 'caught');
      if (c.st !== 'leave') startLeaving(state, getLayout(state.shop), c, false);
    } else if (c.eaten >= B.LEMON.TASTES || c.st === 'leave') {
      c.lemonDone = true;
      state.flags.lemonComing = false;
      if (c.eaten === 0) continue; // 什麼都沒吃到就走了：不算
      if (state.flags.lemonResult !== 'fail') state.flags.lemonResult = 'pass';
      state.flags.lemonTests = (state.flags.lemonTests || 0) + 1;
      state.flags.lemonPassed = (state.flags.lemonPassed || 0) + 1;
      addReputation(state, B.LEMON.PASS_REP);
      addKufu(state, B.KUFU_MAX);
      pushFeed(state, 'feed.lemonPass', null);
      banner(state, 'banner.lemonPass', 'good');
      setThought(state, c, 'yummy', 4);
    }
  }
}

// 無限模式的事件客人
SPAWNERS.group = (state, e) => {
  for (let i = 0; i < (e.count || 1); i++) spawnParty(state, e.type, { party: 1, delay: i * B.PARTY_SPAWN_GAP * 2 });
  if (e.feed) pushFeed(state, e.feed, null);
};

/** 白鳥麗次：點 20 貫最貴的。庫存不夠（沒吃滿就走）評價下降。 */
function stepGuests(state) {
  for (const c of state.customers) {
    if (c.type !== 'shiratori' || c.judged || c.st !== 'leave') continue;
    c.judged = true;
    if (c.eaten < CUSTOMER_TYPES.shiratori.appetite[0]) {
      addReputation(state, B.SHIRATORI_FAIL_REP);
      pushFeed(state, 'feed.shiratoriFail', null);
    } else pushFeed(state, 'feed.shiratoriPass', null);
  }
}

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

/** 檸檬快來了或正在店裡（預告之後、離開之前）。 */
export function lemonExpected(state) {
  return !!state.flags.lemonComing;
}

/** 每個 tick 呼叫一次。 */
export function stepBosses(state) {
  stepBucho(state);
  stepLemon(state);
  stepGuests(state);
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
