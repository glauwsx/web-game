// 關卡資料。一關是一個營業日。店面擺設固定。
// 對話的文字在 strings.js：鍵是 `lv.關卡.段落.編號`。這裡只記說話的角色。
// 目標和來客數是起始值，階段 6 會用平衡測試調整。

const BASE_MENU = ['tamago', 'kappa', 'ika', 'sake', 'ebi', 'maguro'];

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
    baseArrival: 0.13,
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
    goal: { kind: 'rival', target: 35000 },
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
    baseArrival: 0.17,
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
    shop: {
      w: 10, h: 8, floor: 'wood', door: { gx: 4 },
      furniture: [
        { type: 'chefStation', x: 3, y: 1 },
        { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 },
        { type: 'counterSeat', x: 4, y: 2 },
        { type: 'counterSeat', x: 5, y: 2 },
        { type: 'pachinko', x: 6, y: 0 },
        { type: 'pachinko', x: 7, y: 0 },
        { type: 'pachinko', x: 8, y: 0 },
        { type: 'tableSet', x: 7, y: 4 },
        { type: 'plant', x: 0, y: 0 },
        { type: 'lantern', x: 9, y: 7 },
      ],
    },
    staff: [{ id: 'ryo', role: 'chef' }, { id: 'honda', role: 'floor' }],
    menu: BASE_MENU.concat(['inari', 'anago', 'ikura', 'uni']),
    money: 60000,
    reputation: 40,
    baseArrival: 0.17,
    mix: { normal: 5, salaryman: 3, family: 1, tourist: 2, pachinkoFan: 2 },
    goal: { kind: 'rival', target: 70000 },
    intro: talk(4, 'intro', ['ryo', 'nakagawa', 'ryo', 'reiko', 'ryo']),
    pass: talk(4, 'pass', ['ryo', 'reiko', 'yuutsu']),
    fail: talk(4, 'fail', ['yuutsu', 'ryo'], [2]),
    hints: [
      { target: '[data-tab="fac"]', key: 'hint.4.fac', until: 'tabFac' },
      { target: '.mach-row .stepper', key: 'hint.4.nail' },
      { target: '[data-id^="trial-"]', key: 'hint.4.trial' },
    ],
  },
  {
    id: 5,
    hours: [11, 21],
    shop: {
      w: 10, h: 8, floor: 'wood', door: { gx: 4 },
      furniture: [
        { type: 'chefStation', x: 3, y: 1 },
        { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 },
        { type: 'counterSeat', x: 4, y: 2 },
        { type: 'counterSeat', x: 5, y: 2 },
        { type: 'pachinko', x: 6, y: 0 },
        { type: 'pachinko', x: 7, y: 0 },
        { type: 'pachinko', x: 8, y: 0 },
        { type: 'tableSet', x: 7, y: 4 },
        { type: 'plant', x: 0, y: 0 },
        { type: 'lantern', x: 9, y: 7 },
      ],
    },
    staff: [{ id: 'ryo', role: 'chef' }, { id: 'honda', role: 'floor' }],
    menu: BASE_MENU.concat(['inari', 'anago', 'ikura', 'uni']),
    money: 70000,
    reputation: 45,
    baseArrival: 0.18,
    mix: { normal: 5, salaryman: 3, family: 1, tourist: 2, pachinkoFan: 2 },
    goal: { kind: 'rival', target: 80000 },
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
    shop: {
      w: 12, h: 9, floor: 'wood', door: { gx: 4 },
      furniture: [
        { type: 'chefStation', x: 3, y: 1 },
        { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 },
        { type: 'counterSeat', x: 4, y: 2 },
        { type: 'counterSeat', x: 5, y: 2 },
        { type: 'pachinko', x: 9, y: 0 },
        { type: 'pachinko', x: 10, y: 0 },
        { type: 'pachinko', x: 11, y: 0 },
        { type: 'raceTrack', x: 6, y: 3, track: 0 },
        { type: 'tableSet', x: 1, y: 5 },
        { type: 'plant', x: 0, y: 0 },
        { type: 'lantern', x: 11, y: 8 },
      ],
    },
    staff: [{ id: 'ryo', role: 'chef' }, { id: 'honda', role: 'floor' }],
    menu: BASE_MENU.concat(['inari', 'anago', 'ikura', 'uni']),
    money: 90000,
    reputation: 45,
    baseArrival: 0.18,
    mix: { normal: 5, salaryman: 3, family: 1, tourist: 2, pachinkoFan: 1, raceFan: 2 },
    goal: { kind: 'rival', target: 95000 },
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
    shop: {
      w: 12, h: 9, floor: 'wood', door: { gx: 4 },
      furniture: [
        { type: 'chefStation', x: 3, y: 1 },
        { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 },
        { type: 'counterSeat', x: 4, y: 2 },
        { type: 'counterSeat', x: 5, y: 2 },
        { type: 'pachinko', x: 9, y: 0 },
        { type: 'pachinko', x: 10, y: 0 },
        { type: 'pachinko', x: 11, y: 0 },
        { type: 'raceTrack', x: 6, y: 3, track: 1 },
        { type: 'tableSet', x: 1, y: 5 },
        { type: 'plant', x: 0, y: 0 },
        { type: 'lantern', x: 11, y: 8 },
      ],
    },
    staff: [{ id: 'ryo', role: 'chef' }, { id: 'honda', role: 'floor' }],
    menu: BASE_MENU.concat(['inari', 'anago', 'ikura', 'uni']),
    money: 100000,
    reputation: 50,
    baseArrival: 0.19,
    mix: { normal: 5, salaryman: 3, family: 1, tourist: 2, pachinkoFan: 1, raceFan: 2 },
    goal: { kind: 'rival', target: 110000 },
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
    events: lv.events,
  };
}
