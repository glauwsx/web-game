// 所有數值常數。調整平衡只改這個檔案（和 data/levels.js）。

// ---- 時間 ----
export const TICK_MS = 50;            // 1 倍速時，一個 tick 的真實時間
export const TICKS_PER_MIN = 8;       // 遊戲內 1 分鐘 = 8 tick
export const OPEN_HOUR = 11;
export const CLOSE_HOUR = 21;
export const SPEEDS = [0, 1, 2, 4];   // 暫停、1 倍、2 倍、4 倍

// ---- 來客 ----
// 每小時的來客倍率（11 時到 20 時）
export const HOUR_CURVE = { 11: 0.6, 12: 1.4, 13: 1.0, 14: 0.5, 15: 0.4, 16: 0.5, 17: 0.9, 18: 1.4, 19: 1.5, 20: 0.9 };
export const REP_FACTOR_BASE = 0.4;
export const REP_FACTOR_DIV = 60;
export const REP_FACTOR_MIN = 0.4;
export const REP_FACTOR_MAX = 2.0;
export const UNIFORM_ARRIVAL_MULT = 1.4;   // 均一價招牌的來客倍率
export const UNIFORM_PRICE = 300;
export const QUEUE_MAX = 5;                // 排隊上限（組）
export const LUNCH_HOURS = [11, 12, 13];
export const LUNCH_SALARYMAN_MULT = 2.5;   // 午餐時段上班族的比例倍率
export const PARTY_SPAWN_GAP = 6;          // 同一組的成員間隔幾個 tick 出現

// ---- 顧客行為 ----
export const CUSTOMER_SPEED = 0.15;        // 每 tick 走幾格
export const DECIDE_TICKS = 4;             // 看菜單的時間
export const EAT_MIN = 3;                  // 吃一貫的時間（分）
export const ORDER_THRESHOLD = 0;          // 效用低於這個值就不點
export const ORDER_NOISE = 0.12;           // 點餐效用的隨機擾動
export const PREF_MIN = 0.6;
export const PREF_MAX = 1.4;
export const QUALITY_COEF = { premium: 1.15, cheap: 0.95 };
export const PRICEY_RATIO = 1.5;           // 售價超過參考售價幾倍會覺得「太貴了」

// ---- 滿意度與評價 ----
export const SAT_START = 70;
export const SAT_WAIT_FREE_MIN = 3;        // 等餐超過幾分鐘開始扣
export const SAT_WAIT_PER_MIN = -1;
export const SAT_QUEUE_PER_MIN = -0.5;
export const SAT_QUALITY = { 3: 2, 1: 0 };
export const SAT_SKILL_BASE = 5;
export const SAT_SKILL_PER = 0.3;
export const SAT_UGLY_SKILL = 4;           // 技術低於這個值，壽司很醜
export const SAT_UGLY = -2;
export const SAT_WRONG = -15;
export const SAT_SOLD_OUT = -5;
export const SAT_PRICE_OVER_PER_10 = -2;
export const SAT_PRICE_UNDER_PER_10 = 1;
export const SAT_PRICE_UNDER_CAP = 10;
export const SAT_MACHINE_WIN = 10;
export const SAT_MACHINE_NOTHING = -5;
export const SAT_EXPOSED = -40;
export const REP_EXPOSED = -3;
export const REP_LEAVE_BASE = 60;          // 評價變化 = (滿意度 − 60) / 200
export const REP_LEAVE_DIV = 200;
export const REP_ANGRY_LEAVE = -0.3;       // 等餐等到生氣離開
export const REP_QUEUE_LEAVE = -0.2;       // 排隊排到生氣離開
export const REP_COUPON = -1;              // 獎品發不出來，只能給招待券
export const TIP_SAT = 85;
export const TIP_RATE = 0.05;
export const WRONG_ORDER_CHANCE = 0.3;     // 不會外語的員工服務觀光客，送錯的機率

// ---- 真工夫 ----
export const KUFU_MAX = 100;
export const KUFU_GAIN = 5;
export const KUFU_SAT = 75;
export const KUFU_MIN = 30;                // 持續幾遊戲分鐘
export const KUFU_SPEED_MULT = 2;
export const KUFU_SKILL_ADD = 2;

// ---- 員工 ----
export const STAFF_SPEED = { slow: 0.12, normal: 0.18, fast: 0.28 };
export const HANDOVER_DIST = 2;            // 座位離板前檯多近可以直接遞
export const DISGUISE_SPEED_MULT = 0.7;
export const TRAY_SIZE = 8;                // 外場員工一趟最多送幾貫
export const FLOOR_BACKLOG = 12;            // 每位外場員工最多累積幾貫待送；超過就由師傅自己送

// ---- 進貨與庫存 ----
export const STOCK_BASE = 200;
export const EMERGENCY_MARKUP = 1.5;
export const EMERGENCY_DELAY_MIN = 20;
export const SUGGEST_MARGIN = 1.15;        // 建議進貨量多抓一點
export const SELL_PREMIUM_RATE = 0.8;      // 第 8 關賣掉高級食材的折價
export const CHEAP_HONEST_REF = 0.6;       // 平價標示時，顧客心中的參考售價倍率
export const PRICE_STEP = 10;
export const PRICE_MIN = 50;
export const PRICE_MAX = 3000;

// ---- 魚目混珠 ----
export const DETECT_CHANCE = { normal: 0.02, salaryman: 0.02, family: 0.02, tourist: 0.02, pachinkoFan: 0.02, raceFan: 0.02, bucho: 0.10, gourmet: 0.40, lemon: 1.0, pro: 0.02, shumaha: 0.02 };

// ---- 憂鬱的店 ----
export const RIVAL_NOISE = 0.03;

// ---- 機台的吸引力 ----
export const PACHINKO_ATTRACTION = 0.04;
export const RACE_ATTRACTION = 0.12;     // 每台賽車機台（舊的賽道是 4 人一座；改成一台一人後，3 台加起來是 0.36，階段 6 要重看）

// ---- 機台的顧客 ----
// 一般客進門時有這個機率考慮去玩機台（再乘上「玩的機率」）。計劃書沒有寫比例，自己定的。
export const MACHINE_CURIOUS = { normal: 0.15, tourist: 0.1 };
// 玩的機率 = clamp(1.2 − 入場費 / 除數, 0.1, 1) × (0.5 + 口碑)
export const PLAY_CHANCE_BASE = 1.2;
export const PLAY_CHANCE_MIN = 0.1;
export const PLAY_CHANCE_WOM = 0.5;
export const PLAY_CHANCE_DIV = { pachinko: 1000, race: 2000 };
export const FEE_STEP = 100;                // 入場費一次調多少

// ---- 職業玩家（小鋼珠） ----
export const PRO = {
  PLAYS: 12,              // 連續玩幾次
  TIGHTEN_PLAYS: 2,       // 調緊之後再玩幾次就離開
  TIGHTEN_WOM: 4,         // 調緊時口碑記錄塞進幾筆 0（口碑下降）
  WIN_PAY: 5000,          // 親自應戰贏了，職業玩家付的錢
  WIN_REP: 2,
  LOSE_MULT: 2,           // 親自應戰輸了，職業玩家拿走幾倍獎品
};

// ---- 修馬哈（賽車） ----
export const SHUMAHA = {
  RACES: 8,
  RAISE_RACES: 2,         // 調高壽司車等級之後再跑幾場就離開
  WIN_PAY: 10000,
  WIN_REP: 3,
  LOSE_MULT: 2,           // 親自應戰輸了，全部壽司車那幾款各拿走幾貫
};

// ---- 檸檬（計劃書 10.4） ----
export const LEMON = {
  TASTES: 3,              // 試吃幾個品項
  NOTICE_MIN: 30,         // 來店前幾分鐘預告
  FAIL_SAT: -20,          // 被吃出來：店內所有顧客的滿意度
  FAIL_REP: -10,
  PASS_REP: 5,
};

// ---- 部長 ----
export const BUCHO_NOTICE_MIN = 5;         // 沒變裝幾分鐘後被認出來
export const BUCHO_FINE = 10000;
export const BUCHO_DRAG_MIN = 60;          // 阿兩被拖走幾分鐘
export const BANNER_MIN = 6;               // 警告橫幅顯示幾遊戲分鐘

// ---- 小鋼珠 ----
export const PACHINKO = {
  DT: 1 / 120,            // 物理步長（秒）
  GRAVITY: 900,
  BALL_R: 3,
  NAIL_R: 1.5,
  E_NAIL: 0.5,            // 釘子彈性係數
  E_WALL: 0.4,            // 牆壁彈性係數
  MAX_SPEED: 700,
  SUBSTEP_PX: 2,          // 一個子步最多移動幾像素（避免穿過釘子）
  MAX_T: 20,              // 每顆彈珠最多模擬幾秒
  STUCK_T: 0.6,           // 幾秒沒移動算卡住
  STUCK_DIST: 3,
  JITTER_SD: 0.005,       // 機台抖動（力道的標準差。計劃書起始值 0.008，為了滿足回饋率表調小）
  DRIFT_MAX: 0.03,        // 漂移範圍
  DRIFT_STEP: 0.004,      // 每顆彈珠漂移最多變化多少
  BALLS: 30,              // 一次遊玩幾顆彈珠
  FIRE_INTERVAL: 0.6,     // 按住發射鍵時，幾秒射一顆
  BIN: 0.01,              // 統計表的力道區間寬度
  TABLE_BALLS: 400,       // 統計表每個區間跑幾顆
  JACKPOT: [1 / 145, 1 / 82, 1 / 49, 1 / 36, 1 / 26], // 釘子設定 1 到 5 的大獎機率（計劃書起始值 1/40 到 1/12，為了滿足回饋率表調整）
  HAND_SD: { normal: 0.06, pachinkoFan: 0.035, pro: 0 }, // 手感誤差
  FEE: 500,
  FEE_MIN: 300,
  FEE_MAX: 1000,
  PLAY_MIN: 5,            // 一次遊玩佔用機台幾遊戲分鐘
  PRIZE_EAT_MIN: 2,       // 吃一貫獎品幾分鐘
  PRIZE_EAT_MAX_MIN: 10,  // 最多吃幾分鐘，吃不完打包
  WOM_N: 20,              // 口碑看最近幾次遊玩
  WOM_INIT: 0.6,
  WOM_MAX: 1.2,
};

// ---- 賽車 ----
export const RACE = {
  DT: 1 / 60,               // 物理步長（秒）
  SEG_LEN: 200,             // 一個路段的長度
  MAX_SPEED: 12000,         // 最高速度 = 路段長度 / 步長
  ACCEL: 12000 / 5,
  BRAKE: -12000,
  DECEL: -12000 / 5,        // 自然減速
  OFFROAD_DECEL: -12000 / 2,
  OFFROAD_LIMIT: 12000 / 4, // 出界時的速度上限
  STEER: 2,                 // 轉向：dx = dt × 2 × (速度 / 最高速度)
  CENTRIFUGAL: 0.3,
  X_MAX: 2,                 // 橫向位置的極限（±1 是路面邊緣）
  LAPS: 3,
  CARS: 6,
  CAR_W: 0.3,               // 車寬（路面半寬 = 1）
  CAR_LEN: 260,             // 車長
  HIT_SLOW: 0.8,            // 撞到前車：速度降到前車的 0.8 倍
  OBJECT_SPEED: 12000 / 5,  // 撞到路邊景物後的速度
  BOOSTS: 3,
  BOOST_T: 2,
  BOOST_MULT: 1.25,
  PAD_T: 1,                 // 山葵加速板的免費噴射時間
  PUDDLE_T: 0.8,            // 醬油水灘的打滑時間
  ITEM_W: 0.28,             // 水灘和加速板的半寬
  INTEGRITY_HIT: 10,
  INTEGRITY_OFFROAD: 5,     // 出界每秒扣多少
  // 對手的壽司車，由慢到快。玩家開小黃瓜捲。過終點時贏過哪一台，就得到那一款壽司
  LINEUP: ['tamago', 'sake', 'maguro', 'ikura', 'otoro'],
  PLAYER_SUSHI: 'kappa',    // 玩家的車。也是安慰獎：一台都沒贏過，還是吃得到自己的小黃瓜捲
  TOP_RATIO: [0.88, 0.91, 0.94, 0.97, 1.00], // 難度 1 到 5：最快那台（LINEUP 最後一個）的最高速度比例
  RATIO_STEP: 0.05,         // 相鄰兩台壽司車的速度比例差
  CURVE_SLOW: 0.02,         // 對手車過彎最多減速多少
  SHUMAHA_RATIO: 1.0,
  GRID_GAP: 300,            // 起跑時前後車的間隔
  FEE: 800,
  FEE_MIN: 500,
  FEE_MAX: 1500,
  // AI 顧客的公式：駕駛技術 = 整場的平均速度比例。技術 + 雜訊 > 某台壽司車的速度比例，就贏過那一台
  AI_NOISE: 0.02,
  AI_SKILL: { normal: [0.72, 0.94], raceFan: [0.80, 0.96], shumaha: [1.04, 1.04] },
  RACE_MIN: 4,              // 一場比賽佔用機台幾遊戲分鐘
};

// ---- 自動玩家 good 的策略（計劃書 11.5） ----
export const BOT = {
  PRICE_LOW: 1.0,         // T1、T2 的售價 ÷ 參考售價
  PRICE_HIGH: 1.1,        // T3、T4
  NAIL: 3,
  RACE_LEVEL: 4,
  RESTOCK_BELOW: 12,      // 庫存低於幾單位就補貨
  RESTOCK_QTY: 20,
  ENDLESS_RESERVE: 80000, // 無限模式：手上至少留這麼多錢才蓋東西
  ENDLESS_FLOORS: 4,      // 無限模式：自動玩家最多蓋到幾層
};

// ---- 無限模式（計劃書第 12 節） ----
export const TOKKEI_ARRIVAL_MULT = 0.7;    // 特殊刑事在場時的來客倍率
export const SHIRATORI_FAIL_REP = -5;      // 白鳥麗次沒吃滿 20 貫
export const ENDLESS = {
  START_MONEY: 300000,
  START_REP: 30,
  START_MENU: ['tamago', 'kappa', 'ika', 'sake', 'ebi', 'maguro'],
  // 店面大小：價格、需要的評價、baseArrival
  SIZES: [
    { w: 8, h: 8, price: 0, rep: 0, arrival: 0.08 },
    { w: 10, h: 10, price: 100000, rep: 30, arrival: 0.10 },
    { w: 12, h: 12, price: 250000, rep: 45, arrival: 0.12 },
    { w: 16, h: 12, price: 600000, rep: 60, arrival: 0.15 },
    { w: 20, h: 16, price: 1500000, rep: 75, arrival: 0.18 },
  ],
  MIX: { normal: 5, salaryman: 3, family: 1, tourist: 1, pachinkoFan: 2, raceFan: 2 },
  GOURMET_REP: 50,          // 評價到這裡之後美食家才出現
  GOURMET_WEIGHT: 1.5,
  RENT_BASE: 5000,
  RENT_PER_CELL: 50,
  WEEKEND_MULT: 1.3,
  SPOIL: 0.5,               // 打烊時剩下的食材損失多少（無條件捨去）
  PRICE_SWING: 0.2,         // 每日魚價浮動
  EVENT_CHANCE: 0.25,
  SELL_REFUND: 0.5,
  INSP_PER: 30,             // 幾位滿意的顧客換 1 點靈感（計劃書起始值 10，研發太快，調慢）
  LOAN_MAX: 500000,
  LOAN_STEP: 50000,
  LOAN_INTEREST: 0.05,      // 每週
  BANKRUPT_MONEY: -100000,
  BANKRUPT_DAYS: 3,
  BAILOUT_MONEY: 100000,
  BAILOUT_REP: -20,
  RIVAL_MONTH: 3000000,     // 計劃書起始值 800,000。兩位師傅的店一個月大約 4,000,000，所以調高
  RIVAL_GROWTH: 1.08,
  RIVAL_BONUS: 0.05,
  RIVAL_REP: 3,
  HIRE_REP: { honda: 0, terai: 0, matoi: 50, reiko: 60, nakagawa: 80 },
  BOSS_AFTER_DAYS: 7,       // 擁有機台幾天後強敵開始出現
  BOSS_CHANCE: { bucho: 0.12, pro: 0.2, shumaha: 0.15, lemon: 0.1 },
  LEMON_REP: 40,
};

// ---- 樓層、包廂、員工訓練（無限模式） ----
export const LIFT_MIN = 2;                 // 送餐軌道：送到另一層樓或包廂要幾遊戲分鐘
export const VIP = {
  PRICE_MULT: 1.3,        // 包廂價：售價乘上這個倍率（包廂客心裡的價位也一樣高，所以不會嫌貴）
  MIX_PER_BOOTH: 0.1,     // 每一間包廂讓包廂客的來客權重加多少
};
export const FLOORS = {
  PRICE: 1500000,         // 二樓的價格
  PRICE_GROWTH: 1.8,      // 每往上一層貴多少倍
  VIP_MULT: 1.5,          // 包廂樓層的價格倍率（含全部包廂）
  REP: 50,                // 二樓需要的評價
  REP_STEP: 5,            // 每往上一層多需要多少評價
  REP_MAX: 90,
  ARRIVAL_BONUS: 0.3,     // 每多一層樓，來客多多少
};
export const TRAIN = {
  MAX: 5,
  COST: [3, 5, 8, 12, 16], // 升到第 1 到 5 級各要幾點靈感
  SPEED: 1,               // 每級捏製速度 +1
  SKILL_EVERY: 2,         // 每 2 級技術 +1
  WALK: 0.1,              // 每級走路速度 +10%
};
