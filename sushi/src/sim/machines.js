// 機台（小鋼珠台、賽車機台）和經營模擬的整合。純邏輯。
// 顧客的 goal 是 'pachinko' 或 'race' 時，由這裡接手：找機台、付入場費、玩、拿獎品、吃獎品、離開。
// AI 顧客不即時跑小遊戲：小鋼珠從統計表抽樣（計劃書 8.5），賽車用公式決定贏過哪幾款壽司（計劃書 9.6）。
import * as B from '../data/balance.js';
import { SUSHI, SUSHI_ORDER, SETS, gradeOfMode } from '../data/sushi.js';
import { FURNITURE } from '../data/furniture.js';
import { CUSTOMER_TYPES } from '../data/characters.js';
import { BOARD_ORDER } from '../data/pachinko-boards.js';
import { PACHINKO_TABLE } from '../data/pachinko-table.js';
import { TRACK_ORDER } from '../data/tracks.js';
import { rngInt, rngChance, rngRange } from '../core/rng.js';
import { tableFor, simulatePlay, PRIZE_VALUE } from '../mini/pachinko/ai.js';
import { aiWon, prizesFor, prizeValue } from '../mini/race/ai.js';
import { machineHooks, startLeaving, spawnParty } from './customers.js';
import { createOrder, setThought, findCustomer, findFurniture } from './orders.js';
import { addReputation, addRevenue, pushFeed, unitCost } from './economy.js';
import { registerEvent } from './bosses.js';
import { getLayout } from './pathfind.js';

const P = B.PACHINKO;
const R = B.RACE;
const TPM = B.TICKS_PER_MIN;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** 家具是哪一種機台：'pachinko'、'race' 或 null。 */
export function machineOf(f) {
  return FURNITURE[f.type].machine || null;
}

export function boardIdOf(f) {
  return BOARD_ORDER[f.board] || BOARD_ORDER[0];
}

export function trackIdOf(f) {
  return TRACK_ORDER[f.track] || TRACK_ORDER[0];
}

/** 口碑 = 最近 20 次遊玩的「獎品價值 / 入場費」平均，限制在 0 到 1.2，沒有紀錄時是 0.6。 */
export function wordOfMouth(f) {
  if (!f.wom || !f.wom.length) return P.WOM_INIT;
  const sum = f.wom.reduce((a, b) => a + b, 0);
  return clamp(sum / f.wom.length, 0, P.WOM_MAX);
}

function pushWom(f, v) {
  f.wom.push(Math.round(v * 1000) / 1000);
  if (f.wom.length > P.WOM_N) f.wom.shift();
}

/** 顧客玩這一台的機率（計劃書 8.5、9.6）。 */
export function playChance(f) {
  const kind = machineOf(f);
  const base = clamp(B.PLAY_CHANCE_BASE - f.fee / B.PLAY_CHANCE_DIV[kind], B.PLAY_CHANCE_MIN, 1);
  return base * (B.PLAY_CHANCE_WOM + wordOfMouth(f));
}

function machinesOf(state, kind) {
  return state.shop.furniture.filter((f) => machineOf(f) === kind);
}

// ---- 獎品 ----

/** 從菜單上找一個有庫存的某等級品項。沒有就降一級。全部沒有回傳 null。 */
function pickPrizeItem(state, tier) {
  for (let t = tier; t >= 1; t--) {
    const list = [];
    for (const id of SUSHI_ORDER) {
      const m = state.menu[id];
      if (!m || SUSHI[id].tier !== t) continue;
      if (state.stock[id][gradeOfMode(m.mode)] > 0) list.push(id);
    }
    if (list.length) return list[rngInt(state.rng, 0, list.length - 1)];
  }
  return null;
}

/**
 * 發獎品：每一貫排進師傅的工作佇列（扣庫存、不收錢）。
 * tiers 是要發的等級清單。有發不出來的貫數時，給一張招待券，評價下降一次
 * （一次遊玩最多一張。計劃書沒寫是每貫還是每次，每貫扣的話一次大獎就扣 8，太重）。
 */
export function awardPieces(state, c, f, tiers) {
  let missing = 0;
  for (const tier of tiers) {
    const item = pickPrizeItem(state, tier);
    if (!item) { missing++; continue; }
    createOrder(state, c, item, { prize: true });
    c.prizePending++;
    const grade = gradeOfMode(state.menu[item].mode);
    const cost = unitCost(state, item, grade);
    state.day.prizeCost += cost;
    if (f) f.cost = (f.cost || 0) + cost;
  }
  if (missing) {
    addReputation(state, B.REP_COUPON);
    state.day.coupons = (state.day.coupons || 0) + 1;
    pushFeed(state, 'feed.coupon', { n: missing });
  }
  return missing;
}

/** 套餐或名次獎品換成等級清單。 */
export function prizeTiers(prize) {
  if (prize === 'tier1') return [1];
  const out = [];
  for (const [tier, n] of Object.entries(SETS[prize].tiers)) for (let i = 0; i < n; i++) out.push(Number(tier));
  return out.sort((a, b) => b - a);
}

/** 小鋼珠一次遊玩的結果（{ A, B, C, D, J } 的顆數）換成等級清單。 */
export function pachinkoTiers(counts, mult = 1) {
  const out = [];
  for (let m = 0; m < mult; m++) {
    for (let i = 0; i < counts.J; i++) out.push(...prizeTiers('set_tokujo'));
    for (let i = 0; i < counts.A; i++) out.push(4);
    for (let i = 0; i < counts.B; i++) out.push(3);
    for (let i = 0; i < counts.C; i++) out.push(2);
    for (let i = 0; i < counts.D; i++) out.push(1);
  }
  return out;
}

/**
 * 賽車的獎品：指定的壽司各一貫。那一款不在菜單上或沒庫存，就換成同等級的其他款，再沒有就降級（awardPieces 的規則）。
 */
export function awardSushi(state, c, f, ids) {
  let missing = 0;
  for (const id of ids) {
    const m = state.menu[id];
    const item = m && state.stock[id][gradeOfMode(m.mode)] > 0 ? id : pickPrizeItem(state, SUSHI[id].tier);
    if (!item) { missing++; continue; }
    createOrder(state, c, item, { prize: true });
    c.prizePending++;
    const cost = unitCost(state, item, gradeOfMode(state.menu[item].mode));
    state.day.prizeCost += cost;
    if (f) f.cost = (f.cost || 0) + cost;
  }
  if (missing) {
    addReputation(state, B.REP_COUPON);
    state.day.coupons = (state.day.coupons || 0) + 1;
    pushFeed(state, 'feed.coupon', { n: missing });
  }
  return missing;
}

// ---- 顧客決定要不要玩 ----

function chooseGoal(state, c) {
  const def = CUSTOMER_TYPES[c.type] || {};
  if (c.boss) return;
  if (def.machine) {
    if (!machinesOf(state, def.machine).length) return;
    c.goal = def.machine;
    c.plays = rngInt(state.rng, def.plays[0], def.plays[1]);
    return;
  }
  const curious = B.MACHINE_CURIOUS[c.type];
  if (!curious) return;
  for (const kind of ['race', 'pachinko']) {
    const list = machinesOf(state, kind);
    if (!list.length) continue;
    const best = Math.max(...list.map(playChance));
    if (rngChance(state.rng, curious * Math.min(1, best))) {
      c.goal = kind;
      c.plays = 1;
      return;
    }
  }
}

/** 一台機台可以用的位置（沒人、走得到）。 */
function freeSlots(layout, f) {
  const out = [];
  FURNITURE[f.type].slots.forEach((slot, i) => {
    if (slot.role !== 'play' || f.occ[i]) return;
    if (!layout.access[`${f.id}:${i}`]) return;
    out.push(i);
  });
  return out;
}

function findSpot(state, layout, c) {
  let best = null;
  let bestScore = -Infinity;
  for (const f of machinesOf(state, c.goal)) {
    const slots = freeSlots(layout, f);
    if (!slots.length) continue;
    // 職業玩家挑最鬆的台；修馬哈挑難度最低的機台；其他人挑最想玩的
    let score = playChance(f);
    if (c.boss === 'pro') score = f.nail;
    if (c.boss === 'shumaha') score = -f.level;
    if (score > bestScore) { bestScore = score; best = { furn: f.id, slot: slots[0] }; }
  }
  return best;
}

/** 找不到機台時：愛好者和強敵排隊等，一般客改成吃飯。 */
function canWait(c) {
  return !!c.boss || !!(CUSTOMER_TYPES[c.type] || {}).machine;
}

// ---- 小鋼珠 ----

function payFee(state, c, f) {
  c.fees += f.fee;
  c.budget -= f.fee;
  f.income = (f.income || 0) + f.fee;
  f.plays = (f.plays || 0) + 1;
}

function startPachinko(state, c, f) {
  payFee(state, c, f);
  c.st = 'play';
  c.timer = P.PLAY_MIN * TPM;
}

/** 手感誤差的類型。 */
function handType(c) {
  if (c.boss === 'pro') return 'pro';
  if (c.type === 'pachinkoFan') return 'pachinkoFan';
  return 'normal';
}

/** AI 顧客玩一次小鋼珠的結果。 */
export function pachinkoPlay(state, f, type) {
  const tb = tableFor(PACHINKO_TABLE, boardIdOf(f), f.nail);
  return simulatePlay(tb, P.HAND_SD[type], state.rng);
}

/** 一次遊玩結束：發獎品、更新口碑和滿意度。 */
function resolvePachinko(state, c, f) {
  const r = pachinkoPlay(state, f, handType(c));
  c.played++;
  const tiers = pachinkoTiers(r.counts);
  awardPieces(state, c, f, tiers);
  f.payout = (f.payout || 0) + Math.round(r.value);
  pushWom(f, r.value / f.fee);
  c.won = (c.won || 0) + Math.round(r.value);
  if (r.value >= f.fee) { c.sat += B.SAT_MACHINE_WIN; setThought(state, c, 'win'); } else if (!tiers.length) { c.sat += B.SAT_MACHINE_NOTHING; setThought(state, c, 'lose'); }
  if (r.counts.J) pushFeed(state, 'feed.jackpot', null);
  return r;
}

/** 還要不要再玩一次。 */
function wantsMore(state, c, f) {
  if (c.played >= c.plays) return false;
  if (c.budget < f.fee) return false;
  if (c.boss) return true;
  return rngChance(state.rng, Math.min(1, playChance(f)));
}

function toPrize(c) {
  c.st = 'prize';
  c.mtimer = 0;
}

// ---- 賽車 ----
// 賽車機台一台一位顧客。一坐下就開始，佔用 RACE_MIN 分鐘，流程跟小鋼珠一樣（計劃書 9.6）。

function startRace(state, c, f) {
  payFee(state, c, f);
  c.st = 'play';
  c.timer = R.RACE_MIN * TPM;
  if (c.skill === undefined) {
    const type = c.boss === 'shumaha' ? 'shumaha' : c.type === 'raceFan' ? 'raceFan' : 'normal';
    const [a, b] = R.AI_SKILL[type];
    c.skill = a === b ? a : rngRange(state.rng, a, b);
  }
}

/** AI 顧客跑一場：贏過哪幾款壽司（計劃書 9.6）。 */
export function racePlay(state, f, c) {
  return aiWon(c.skill, f.level, state.rng);
}

/** 一場結束：發獎品（贏過的每一款各一貫，沒有就是小黃瓜捲）、更新口碑和滿意度。 */
function resolveRace(state, c, f) {
  const won = racePlay(state, f, c);
  const prizes = prizesFor(won);
  c.played++;
  c.lastWon = won;
  f.races = (f.races || 0) + 1;
  awardSushi(state, c, f, prizes);
  const value = prizeValue(prizes);
  f.payout = (f.payout || 0) + Math.round(value);
  pushWom(f, value / f.fee);
  c.won = (c.won || 0) + Math.round(value);
  if (value >= f.fee) { c.sat += B.SAT_MACHINE_WIN; setThought(state, c, 'win'); } else { setThought(state, c, 'lose'); }
}

// ---- 顧客狀態 ----

function arrive(state, layout, c) {
  const f = findFurniture(state, c.furn);
  if (!f || c.budget < f.fee) {
    setThought(state, c, 'pricey');
    startLeaving(state, layout, c, false);
    return;
  }
  if (c.goal === 'pachinko') startPachinko(state, c, f);
  else startRace(state, c, f);
  if (c.boss && !c.choice) {
    c.needChoice = true;
    pushFeed(state, c.boss === 'pro' ? 'feed.proSeated' : 'feed.shumahaSeated', null);
  }
}

function step(state, layout, c) {
  const f = findFurniture(state, c.furn);
  if (c.st === 'play') {
    if (!f) { toPrize(c); return; }
    if (--c.timer > 0) return;
    const start = c.goal === 'pachinko' ? startPachinko : startRace;
    if (c.goal === 'pachinko') resolvePachinko(state, c, f);
    else resolveRace(state, c, f);
    if (wantsMore(state, c, f)) start(state, c, f);
    else toPrize(c);
    return;
  }
  // 'prize'：每貫吃 2 分鐘，最多 10 分鐘，吃不完打包
  c.mtimer++;
  const eatTicks = c.prizeGot * P.PRIZE_EAT_MIN * TPM;
  const done = c.prizePending === 0 && c.mtimer >= eatTicks;
  if (done || c.mtimer >= P.PRIZE_EAT_MAX_MIN * TPM) {
    if (!c.prizeGot && !c.prizePending && !(c.thought && c.thought.until > state.tick)) setThought(state, c, 'lose');
    startLeaving(state, layout, c, false);
  }
}

machineHooks.chooseGoal = chooseGoal;
machineHooks.findSpot = findSpot;
machineHooks.canWait = canWait;
machineHooks.arrive = arrive;
machineHooks.step = step;

// ---- 店家的操作 ----

/** 設定小鋼珠台的釘子（1 到 5）。 */
export function setNail(state, id, nail) {
  const f = findFurniture(state, id);
  if (!f || machineOf(f) !== 'pachinko') return { ok: false, reason: 'bad' };
  const n = Math.round(Number(nail));
  if (!(n >= 1 && n <= 5)) return { ok: false, reason: 'range' };
  f.nail = n;
  return { ok: true };
}

/** 設定入場費。小鋼珠 ¥300 到 ¥1,000，賽車機台 ¥500 到 ¥1,500，一次 ¥100。 */
export function setFee(state, id, fee) {
  const f = findFurniture(state, id);
  const kind = f && machineOf(f);
  if (!kind) return { ok: false, reason: 'bad' };
  const C = kind === 'pachinko' ? P : R;
  const v = Math.round(Number(fee) / B.FEE_STEP) * B.FEE_STEP;
  if (!(v >= C.FEE_MIN && v <= C.FEE_MAX)) return { ok: false, reason: 'range' };
  f.fee = v;
  return { ok: true };
}

/** 設定賽車機台的難度（1 到 5）。正在玩的那一場在結束時用新的難度算。 */
export function setRaceLevel(state, id, level) {
  const f = findFurniture(state, id);
  if (!f || machineOf(f) !== 'race') return { ok: false, reason: 'bad' };
  const n = Math.round(Number(level));
  if (!(n >= 1 && n <= 5)) return { ok: false, reason: 'range' };
  f.level = n;
  return { ok: true };
}

/** 給介面用：機台的今日收支。 */
export function machineSummary(state, f) {
  return {
    kind: machineOf(f),
    fee: f.fee, nail: f.nail, level: f.level,
    wom: wordOfMouth(f), chance: playChance(f),
    income: f.income || 0, payout: f.payout || 0, cost: f.cost || 0, plays: f.plays || 0,
    player: f.occ.find(Boolean) || 0,
  };
}

// ---- 強敵：職業玩家（計劃書 10.1）、修馬哈（計劃書 10.2） ----

const BOSS = {
  pro: { goal: 'pachinko', look: 'pro', plays: () => B.PRO.PLAYS, banner: 'banner.pro', feed: 'feed.proComing' },
  shumaha: { goal: 'race', look: 'shumaha', plays: () => B.SHUMAHA.RACES, banner: 'banner.shumaha', feed: 'feed.shumahaComing' },
};

function spawnBoss(state, kind, n) {
  const d = BOSS[kind];
  for (let i = 0; i < n; i++) {
    spawnParty(state, kind, { look: d.look, boss: kind, goal: d.goal, plays: d.plays(), delay: i * B.PARTY_SPAWN_GAP * 3 });
  }
  pushFeed(state, d.feed, { n });
  state.banner = { key: d.banner, until: state.tick + B.BANNER_MIN * TPM, kind };
}

registerEvent('pro', (state, e) => spawnBoss(state, 'pro', e.count || 1));
registerEvent('shumaha', (state, e) => spawnBoss(state, 'shumaha', e.count || 1));

/** 正在等店家決定對策的強敵。 */
export function bossesNeedingChoice(state) {
  return state.customers.filter((c) => c.boss && c.needChoice && c.st === 'play');
}

/** 店裡（含還在路上）的職業玩家和修馬哈。 */
export function machineBosses(state) {
  return state.customers.filter((c) => (c.boss === 'pro' || c.boss === 'shumaha') && c.st !== 'leave' && c.st !== 'gone');
}

function bossOf(state, id) {
  const c = findCustomer(state, id);
  if (!c || (c.boss !== 'pro' && c.boss !== 'shumaha')) return null;
  return c;
}

/**
 * 店家對強敵的對策。choice：
 *   'allow'   放任
 *   'counter' 職業玩家：調緊釘子（那一台變成設定 1，再玩 2 次就走，口碑下降）
 *             修馬哈：調高壽司車等級（賽道變成等級 5，再跑 2 場就走）
 * 親自應戰用 bossChallenge 和 bossChallengeResult。
 */
export function bossChoice(state, id, choice) {
  const c = bossOf(state, id);
  if (!c) return { ok: false, reason: 'gone' };
  if (c.choice) return { ok: false, reason: 'chosen' };
  const f = findFurniture(state, c.furn);
  if (choice === 'allow') {
    c.choice = 'allow';
  } else if (choice === 'counter') {
    if (!f) return { ok: false, reason: 'gone' };
    c.choice = 'counter';
    if (c.boss === 'pro') {
      f.nail = 1;
      c.plays = c.played + B.PRO.TIGHTEN_PLAYS;
      for (let i = 0; i < B.PRO.TIGHTEN_WOM; i++) pushWom(f, 0);
    } else {
      f.level = 5;
      c.plays = c.played + B.SHUMAHA.RAISE_RACES;
    }
  } else return { ok: false, reason: 'bad' };
  c.needChoice = false;
  return { ok: true };
}

/**
 * 親自應戰：準備一局。回傳小遊戲要用的設定。
 * 職業玩家的目標成績用種子預先算好（手感誤差 0）。
 */
export function bossChallenge(state, id) {
  const c = bossOf(state, id);
  if (!c) return { ok: false, reason: 'gone' };
  if (c.choice) return { ok: false, reason: 'chosen' };
  const f = findFurniture(state, c.furn);
  if (!f) return { ok: false, reason: 'gone' };
  c.choice = 'challenge';
  c.needChoice = false;
  if (c.boss === 'pro') {
    const r = pachinkoPlay(state, f, 'pro');
    c.challenge = { counts: r.counts, target: Math.round(r.value) };
    return { ok: true, kind: 'pachinko', board: boardIdOf(f), nail: f.nail, target: c.challenge.target, fee: f.fee };
  }
  c.challenge = {};
  return { ok: true, kind: 'race', track: trackIdOf(f), level: f.level };
}

/**
 * 親自應戰的結果。win 是玩家有沒有贏。
 * 贏：強敵付錢、評價上升、離開。輸：強敵拿走雙倍獎品（修馬哈是全部 5 款壽司各 2 貫）。
 */
export function bossChallengeResult(state, id, win) {
  const c = bossOf(state, id);
  if (!c || c.choice !== 'challenge' || !c.challenge || c.challenge.done) return { ok: false, reason: 'bad' };
  c.challenge.done = true;
  c.challenge.win = !!win;
  const f = findFurniture(state, c.furn);
  const layout = getLayout(state.shop);
  const pro = c.boss === 'pro';
  if (win) {
    addRevenue(state, pro ? B.PRO.WIN_PAY : B.SHUMAHA.WIN_PAY, 'bonus');
    const flag = pro ? 'beatPro' : 'beatShumaha';
    state.flags[flag] = (state.flags[flag] || 0) + 1;
    addReputation(state, pro ? B.PRO.WIN_REP : B.SHUMAHA.WIN_REP);
    pushFeed(state, pro ? 'feed.proBeaten' : 'feed.shumahaBeaten', null);
    setThought(state, c, 'lose', 4);
    startLeaving(state, layout, c, false);
    return { ok: true, win: true };
  }
  if (pro) {
    awardPieces(state, c, f, pachinkoTiers(c.challenge.counts, B.PRO.LOSE_MULT));
    if (f) f.payout = (f.payout || 0) + Math.round(c.challenge.target * B.PRO.LOSE_MULT);
  } else {
    // 修馬哈：全部壽司車那幾款，各拿 LOSE_MULT 貫
    const ids = [];
    for (let i = 0; i < B.SHUMAHA.LOSE_MULT; i++) ids.push(...R.LINEUP);
    awardSushi(state, c, f, ids);
    if (f) f.payout = (f.payout || 0) + prizeValue(ids);
  }
  pushFeed(state, pro ? 'feed.proWon' : 'feed.shumahaWon', null);
  setThought(state, c, 'win', 4);
  toPrize(c);
  return { ok: true, win: false };
}

export { PRIZE_VALUE };
