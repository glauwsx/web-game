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
export const REP_ANGRY_LEAVE = -0.5;       // 等餐等到生氣離開
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
export const TRAY_SIZE = 4;                // 外場員工一趟最多送幾貫
export const FLOOR_BACKLOG = 6;            // 每位外場員工最多累積幾貫待送；超過就由師傅自己送

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
export const RACE_ATTRACTION = 0.12;

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
