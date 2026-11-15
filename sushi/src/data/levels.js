// 關卡資料。一關是一個營業日。店面擺設固定。
// 對話的文字在 strings.js：鍵是 `lv.關卡.段落.編號`。這裡只記說話的角色。
// 目標和來客數是起始值，階段 6 會用平衡測試調整。

const BASE_MENU = ['tamago', 'kappa', 'ika', 'sake', 'ebi', 'maguro'];

const MENU_10 = BASE_MENU.concat(['inari', 'anago', 'ikura', 'uni']);
const MENU_ALL = ['tamago', 'kappa', 'inari', 'ika', 'sake', 'ebi', 'maguro', 'anago', 'ikura', 'chutoro', 'uni', 'otoro'];
// 第 4 關起多一位寺井。預設在休息，要玩家自己排班
const STAFF_3 = [{ id: 'ryo', role: 'chef' }, { id: 'honda', role: 'floor' }, { id: 'terai', role: 'off' }];
const MIX_LATE = { normal: 5, salaryman: 3, family: 1, tourist: 2, gourmet: 2 };
const GIFT_STOCK = {
  anago: { premium: 10 }, ikura: { premium: 10 }, chutoro: { premium: 30 }, uni: { premium: 20 }, otoro: { premium: 30 },
};

// 兩座板前檯並排，四周是吧台座
const COUNTER = [
  { type: 'chefStation', x: 2, y: 1 },
  { type: 'chefStation', x: 4, y: 1 },
  { type: 'counterSeat', x: 1, y: 1 },
  { type: 'counterSeat', x: 6, y: 1 },
  { type: 'counterSeat', x: 1, y: 2 },
  { type: 'counterSeat', x: 2, y: 2 },
  { type: 'counterSeat', x: 3, y: 2 },
  { type: 'counterSeat', x: 4, y: 2 },
  { type: 'counterSeat', x: 5, y: 2 },
  { type: 'counterSeat', x: 6, y: 2 },
];

/** 第 4、5 關：小鋼珠 3 台。 */
function shopA() {
  return {
    w: 12, h: 9, floor: 'wood', door: { gx: 5 },
    furniture: COUNTER.concat([
      { type: 'pachinko', x: 9, y: 0 },
      { type: 'pachinko', x: 10, y: 0 },
      { type: 'pachinko', x: 11, y: 0 },
      { type: 'tableSet', x: 1, y: 5 },
      { type: 'plant', x: 0, y: 0 },
      { type: 'lantern', x: 11, y: 8 },
    ]),
  };
}

/** 第 6、7 關：再加一座賽車機台。 */
function shopB(track) {
  return {
    w: 13, h: 10, floor: 'wood', door: { gx: 5 },
    furniture: COUNTER.concat([
      { type: 'pachinko', x: 10, y: 0 },
      { type: 'pachinko', x: 11, y: 0 },
      { type: 'pachinko', x: 12, y: 0 },
      { type: 'raceTrack', x: 8, y: 4, track },
      { type: 'tableSet', x: 1, y: 5 },
      { type: 'plant', x: 0, y: 0 },
      { type: 'lantern', x: 12, y: 9 },
    ]),
  };
}

/** 第 8、9 關：收掉機台，回到賣壽司。冰箱 2 台、均一價招牌。 */
function shopC() {
  return {
    w: 12, h: 9, floor: 'wood', door: { gx: 5 },
    furniture: COUNTER.concat([
      { type: 'fridge', x: 10, y: 0 },
      { type: 'fridge', x: 11, y: 0 },
      { type: 'tableSet', x: 1, y: 5 },
      { type: 'fishTank', x: 8, y: 0 },
      { type: 'uniformSign', x: 0, y: 8 },
      { type: 'plant', x: 0, y: 0 },
      { type: 'lantern', x: 11, y: 8 },
    ]),
  };
}

/** 第 10 關：全部要素。 */
function shopD() {
  return {
    w: 16, h: 10, floor: 'wood', door: { gx: 5 },
    furniture: COUNTER.concat([
      { type: 'fridge', x: 8, y: 0 },
      { type: 'fridge', x: 9, y: 0 },
      { type: 'pachinko', x: 13, y: 0 },
      { type: 'pachinko', x: 14, y: 0 },
      { type: 'pachinko', x: 15, y: 0 },
      { type: 'raceTrack', x: 11, y: 4, track: 2 },
      { type: 'tableSet', x: 1, y: 5 },
      { type: 'uniformSign', x: 0, y: 9 },
      { type: 'plant', x: 0, y: 0 },
      { type: 'lantern', x: 15, y: 9 },
    ]),
  };
}

/** 產生對話清單。who 是角色 id 的陣列；angry 是要用生氣大頭像的行數。 */
function talk(level, part, who, angry = []) {
  return who.map((w, i) => ({ who: w, key: `lv.${level}.${part}.${i + 1}`, angry: angry.includes(i + 1) }));
}

export const LEVELS = [
  {
    id: 1,
    hours: [11, 15],
    shop: {
      w: 8, h: 7, floor: 'wood', door: { gx: 3 },
      furniture: [
        { type: 'chefStation', x: 2, y: 1 },
        { type: 'counterSeat', x: 1, y: 2 },
        { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 },
        { type: 'counterSeat', x: 4, y: 2 },
        { type: 'plant', x: 7, y: 0 },
        { type: 'lantern', x: 0, y: 6 },
      ],
    },
    staff: [{ id: 'ryo', role: 'chef' }],
    menu: BASE_MENU,
    money: 20000,
    reputation: 30,
    baseArrival: 0.18,
    mix: { normal: 5, salaryman: 3 },
    goal: { kind: 'fixed', target: 12000 },
    intro: talk(1, 'intro', ['geparuto', 'ryo', 'matoi', 'geparuto']),
    pass: talk(1, 'pass', ['geparuto', 'ryo', 'matoi']),
    fail: talk(1, 'fail', ['geparuto', 'ryo'], [1]),
    tutorial: [
      { target: '[data-tab="buy"]', key: 'tut.1.buyTab', until: 'tabBuy' },
      { target: '[data-id="suggest"]', key: 'tut.1.suggest', until: 'filled' },
      { target: '[data-id="buy"]', key: 'tut.1.buy', until: 'stocked' },
      { target: '[data-tab="menu"]', key: 'tut.1.menu' },
      { target: '[data-id="open"]', key: 'tut.1.open', until: 'opened' },
      { target: '.hud-speed', key: 'tut.1.speed' },
      { target: '.bottom-bars', key: 'tut.1.goal' },
    ],
  },
  {
    id: 2,
    hours: [11, 21],
    shop: {
      w: 8, h: 7, floor: 'wood', door: { gx: 3 },
      furniture: [
        { type: 'chefStation', x: 2, y: 1 },
        { type: 'counterSeat', x: 1, y: 1 },
        { type: 'counterSeat', x: 4, y: 1 },
        { type: 'counterSeat', x: 1, y: 2 },
        { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 },
        { type: 'counterSeat', x: 4, y: 2 },
        { type: 'plant', x: 7, y: 0 },
        { type: 'lantern', x: 0, y: 6 },
      ],
    },
    staff: [{ id: 'ryo', role: 'chef' }],
    menu: BASE_MENU.concat(['inari']),
    money: 40000,
    reputation: 30,
    baseArrival: 0.16,
    mix: { normal: 5, salaryman: 3 },
    goal: { kind: 'rival', target: 45000 },
    intro: talk(2, 'intro', ['matoi', 'yuutsu', 'geparuto', 'ryo', 'matoi'], [4]),
    pass: talk(2, 'pass', ['yuutsu', 'ryo', 'geparuto']),
    fail: talk(2, 'fail', ['yuutsu', 'ryo'], [2]),
    hints: [
      { target: '.bottom-bars', key: 'hint.2.bars' },
      { target: '[data-tab="menu"]', key: 'hint.2.price' },
    ],
  },
  {
    id: 3,
    hours: [11, 21],
    shop: {
      w: 10, h: 8, floor: 'wood', door: { gx: 4 },
      furniture: [
        { type: 'chefStation', x: 3, y: 1 },
        { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 },
        { type: 'counterSeat', x: 4, y: 2 },
        { type: 'counterSeat', x: 5, y: 2 },
        { type: 'tableSet', x: 7, y: 4 },
        { type: 'plant', x: 9, y: 0 },
        { type: 'plant', x: 0, y: 0 },
        { type: 'lantern', x: 9, y: 7 },
      ],
    },
    staff: [{ id: 'ryo', role: 'chef' }, { id: 'honda', role: 'off' }],
    menu: BASE_MENU.concat(['inari']),
    money: 50000,
    reputation: 35,
    baseArrival: 0.155,
    mix: { normal: 5, salaryman: 3, family: 1, tourist: 2 },
    goal: { kind: 'rival', target: 50000 },
    events: [{ kind: 'bucho', at: 13 * 60 + 20, jitter: 40 }],
    intro: talk(3, 'intro', ['ryo', 'honda', 'matoi', 'ryo', 'matoi']),
    pass: talk(3, 'pass', ['honda', 'ryo']),
    fail: talk(3, 'fail', ['ryo', 'honda'], [1]),
    hints: [
      { target: '[data-tab="staff"]', key: 'hint.3.staff' },
      { target: '[data-tab="buy"]', key: 'hint.3.restock' },
      { target: '.hud-kufu', key: 'hint.3.bucho' },
    ],
  },
  {
    id: 4,
    hours: [11, 21],
    shop: shopA(),
    staff: STAFF_3,
    menu: MENU_10,
    money: 60000,
    reputation: 40,
    baseArrival: 0.155,
    mix: { normal: 5, salaryman: 3, family: 1, tourist: 2, pachinkoFan: 2 },
    goal: { kind: 'rival', target: 80000 },
    intro: talk(4, 'intro', ['ryo', 'nakagawa', 'ryo', 'reiko', 'ryo']),
    pass: talk(4, 'pass', ['ryo', 'reiko', 'yuutsu']),
    fail: talk(4, 'fail', ['yuutsu', 'ryo'], [2]),
    hints: [
      { target: '[data-tab="staff"]', key: 'hint.4.terai' },
      { target: '[data-tab="fac"]', key: 'hint.4.fac', until: 'tabFac' },
      { target: '.mach-row .stepper', key: 'hint.4.nail' },
      { target: '[data-id^="trial-"]', key: 'hint.4.trial' },
    ],
  },
  {
    id: 5,
    hours: [11, 21],
    shop: shopA(),
    staff: STAFF_3,
    menu: MENU_10,
    money: 70000,
    reputation: 45,
    baseArrival: 0.165,
    mix: { normal: 5, salaryman: 3, family: 1, tourist: 2, pachinkoFan: 2 },
    goal: { kind: 'rival', target: 85000 },
    // 職業玩家 3 人，分 2 波
    events: [
      { kind: 'pro', at: 12 * 60 + 30, jitter: 30, count: 1 },
      { kind: 'pro', at: 17 * 60 + 30, jitter: 30, count: 2 },
    ],
    intro: talk(5, 'intro', ['reiko', 'ryo', 'pro', 'ryo', 'reiko']),
    pass: talk(5, 'pass', ['pro', 'ryo', 'reiko']),
    fail: talk(5, 'fail', ['pro', 'ryo'], [2]),
    hints: [
      { target: '.bottom-feed', key: 'hint.5.pro' },
      { target: '[data-tab="buy"]', key: 'hint.5.stock' },
    ],
  },
  {
    id: 6,
    hours: [11, 21],
    shop: shopB(0),
    staff: STAFF_3,
    menu: MENU_10,
    money: 90000,
    reputation: 45,
    baseArrival: 0.165,
    mix: { normal: 5, salaryman: 3, family: 1, tourist: 2, pachinkoFan: 1, raceFan: 2 },
    goal: { kind: 'rival', target: 100000 },
    intro: talk(6, 'intro', ['ryo', 'honda', 'ryo', 'reiko', 'ryo']),
    pass: talk(6, 'pass', ['honda', 'ryo', 'yuutsu']),
    fail: talk(6, 'fail', ['yuutsu', 'ryo'], [2]),
    hints: [
      { target: '[data-tab="fac"]', key: 'hint.6.fac', until: 'tabFac' },
      { target: '.mach-row[data-kind="race"] .stepper', key: 'hint.6.level' },
      { target: '.mach-row[data-kind="race"] [data-id^="trial-"]', key: 'hint.6.trial' },
    ],
  },
  {
    id: 7,
    hours: [11, 21],
    shop: shopB(1),
    staff: STAFF_3,
    menu: MENU_10,
    money: 100000,
    reputation: 50,
    baseArrival: 0.17,
    mix: { normal: 5, salaryman: 3, family: 1, tourist: 2, pachinkoFan: 1, raceFan: 2 },
    goal: { kind: 'rival', target: 105000 },
    events: [
      { kind: 'shumaha', at: 14 * 60, jitter: 40 },
      { kind: 'bucho', at: 18 * 60 + 30, jitter: 40 },
    ],
    intro: talk(7, 'intro', ['reiko', 'ryo', 'shumaha', 'ryo', 'reiko']),
    pass: talk(7, 'pass', ['shumaha', 'ryo', 'reiko']),
    fail: talk(7, 'fail', ['shumaha', 'ryo'], [2]),
    hints: [
      { target: '.bottom-feed', key: 'hint.7.shumaha' },
      { target: '.hud-kufu', key: 'hint.3.bucho' },
    ],
  },
  {
    id: 8,
    hours: [11, 21],
    shop: shopC(),
    staff: STAFF_3,
    menu: MENU_ALL,
    money: 10000,
    reputation: 50,
    // 中川水產送的高級食材
    stock: GIFT_STOCK,
    baseArrival: 0.17,
    mix: MIX_LATE,
    goal: { kind: 'rival', target: 130000 },
    features: { cheap: true, disguise: true, uniform: true, sellPremium: true },
    intro: talk(8, 'intro', ['nakagawa', 'ryo', 'nakagawa', 'ryo', 'honda', 'ryo']),
    pass: talk(8, 'pass', ['ryo', 'nakagawa', 'matoi']),
    fail: talk(8, 'fail', ['yuutsu', 'ryo'], [2]),
    hints: [
      { target: '[data-tab="menu"]', key: 'hint.8.modes' },
      { target: '[data-tab="buy"]', key: 'hint.8.sell' },
      { target: '[data-tab="fac"]', key: 'hint.8.uniform' },
    ],
  },
  {
    id: 9,
    hours: [11, 21],
    shop: shopC(),
    staff: STAFF_3,
    menu: MENU_ALL,
    money: 60000,
    reputation: 50,
    baseArrival: 0.18,
    mix: MIX_LATE,
    goal: { kind: 'rival', target: 140000 },
    features: { cheap: true, disguise: true, uniform: true },
    // 被檸檬吃出來：當日營業額 −30%
    lemonPenalty: 0.3,
    events: [{ kind: 'lemon', at: 15 * 60, jitter: 60 }],
    intro: talk(9, 'intro', ['matoi', 'ryo', 'lemon', 'ryo', 'matoi']),
    pass: talk(9, 'pass', ['lemon', 'ryo', 'geparuto']),
    fail: talk(9, 'fail', ['lemon', 'ryo']),
    hints: [
      { target: '.bottom-feed', key: 'hint.9.lemon' },
      { target: '[data-tab="menu"]', key: 'hint.9.modes' },
    ],
  },
  {
    id: 10,
    hours: [11, 21],
    shop: shopD(),
    staff: STAFF_3,
    menu: MENU_ALL,
    money: 150000,
    reputation: 55,
    baseArrival: 0.18,
    mix: { ...MIX_LATE, pachinkoFan: 1, raceFan: 2 },
    goal: { kind: 'rival', target: 145000 },
    features: { cheap: true, disguise: true, uniform: true },
    events: [
      { kind: 'pro', at: 12 * 60 + 20, jitter: 20, count: 2 },
      { kind: 'bucho', at: 13 * 60 + 40, jitter: 20 },
      { kind: 'shumaha', at: 15 * 60 + 10, jitter: 30 },
      { kind: 'lemon', at: 17 * 60 + 40, jitter: 30 },
    ],
    intro: talk(10, 'intro', ['geparuto', 'yuutsu', 'ryo', 'matoi', 'ryo', 'geparuto']),
    pass: talk(10, 'pass', ['geparuto', 'ryo', 'matoi']),
    fail: talk(10, 'fail', ['yuutsu', 'bucho', 'ryo'], [2]),
    tie: talk(10, 'tie', ['lemon', 'ryo', 'geparuto', 'yuutsu', 'matoi', 'ryo'], [6]),
    perfect: talk(10, 'perfect', ['geparuto', 'ryo', 'yuutsu', 'matoi', 'ryo'], [5]),
    // 三種結局（計劃書 11.4）。過關、沒作弊、但沒拿到三星時用 pass
    endings(state, result) {
      if (!result.passed) return this.fail;
      if (result.exposedCount > 0) return this.tie;
      if (result.stars >= 3) return this.perfect;
      return this.pass;
    },
    hints: [
      { target: '.bottom-feed', key: 'hint.10.all' },
    ],
  },
];

export const LEVEL_COUNT = 10;

export function getLevel(id) {
  return LEVELS.find((l) => l.id === Number(id)) || null;
}

/** 把關卡資料變成 createShopState 用的設定。 */
export function levelConfig(id, seed) {
  const lv = getLevel(id);
  if (!lv) return null;
  return {
    seed,
    mode: 'level',
    levelId: lv.id,
    shop: lv.shop,
    staff: lv.staff,
    menu: lv.menu,
    money: lv.money,
    reputation: lv.reputation,
    stock: lv.stock,
    hours: lv.hours,
    baseArrival: lv.baseArrival,
    mix: lv.mix,
    goal: lv.goal,
    features: lv.features,
    lemonPenalty: lv.lemonPenalty,
    events: lv.events,
  };
}
