// 無限模式的資料：研發項目、隨機事件、夏春都的任務。純資料。

/** 研發項目。kind：'sushi'（解鎖壽司）、'furniture'（可以買的設施）、'feature'（賣法）、'option'（機台的選項）。cost 是靈感點。 */
export const RESEARCH = [
  { id: 'inari', kind: 'sushi', cost: 2 },
  { id: 'anago', kind: 'sushi', cost: 5 },
  { id: 'ikura', kind: 'sushi', cost: 5 },
  { id: 'chutoro', kind: 'sushi', cost: 5 },
  { id: 'uni', kind: 'sushi', cost: 10 },
  { id: 'otoro', kind: 'sushi', cost: 10 },
  { id: 'pachinko', kind: 'furniture', cost: 8 },
  { id: 'raceCab', kind: 'furniture', cost: 15 },
  { id: 'board2', kind: 'option', cost: 10, needs: 'pachinko' },
  { id: 'track2', kind: 'option', cost: 10, needs: 'raceCab' },
  { id: 'track3', kind: 'option', cost: 10, needs: 'track2' },
  { id: 'uniformSign', kind: 'furniture', cost: 5, feature: 'uniform' },
  { id: 'disguise', kind: 'feature', cost: 5, feature: 'disguise' },
];

/** 一開始就能買的家具。其他的要研發。 */
export const BUILD_BASE = ['chefStation', 'counterSeat', 'tableSet', 'fridge', 'lantern', 'fishTank', 'plant'];

/**
 * 隨機事件。每天開店前有機率發生一個。
 * arrival：當日來客倍率。price：進貨價倍率。mix：顧客類型的權重倍率。needRep：需要的評價。
 * guests：當天會來的客人 { type, count, at（分鐘）}。bucho：部長來幾次。
 */
export const RANDOM_EVENTS = [
  { id: 'tv', needRep: 70, arrival: 2 },
  { id: 'typhoon', arrival: 0.4 },
  { id: 'festival', arrival: 1.6, mix: { family: 3 } },
  { id: 'bigCatch', price: 0.7 },
  { id: 'nakagawa', guests: { type: 'gourmet', count: 8, at: 18 * 60 } },
  { id: 'tokkei', guests: { type: 'tokkei', count: 5, at: 12 * 60 + 30 } },
  { id: 'shiratori', guests: { type: 'shiratori', count: 1, at: 13 * 60 + 30 } },
  { id: 'buchoPatrol', bucho: 2 },
];

/**
 * 夏春都的任務。照順序出現，一次顯示 3 個。
 * kind 和 n 是條件；reward 是 { money } 或 { insp }。
 *   dayRevenue：單日營業額。dayServed：單日服務人數。own：擁有幾件某種家具（type）。
 *   reputation：評價。size：店面等級。staff：員工人數（含阿兩）。sushi：解鎖幾種壽司。
 *   counter：累計次數（key）。repStreak：連續幾天評價不下降。cleanDay：服務 n 人以上而且生氣離開的不超過 2 人。
 */
export const QUESTS = [
  { id: 'rev1', kind: 'dayRevenue', n: 50000, reward: { money: 20000 } },
  { id: 'served1', kind: 'dayServed', n: 50, reward: { insp: 3 } },
  { id: 'seats', kind: 'own', type: 'counterSeat', n: 8, reward: { money: 20000 } },
  { id: 'staff1', kind: 'staff', n: 2, reward: { insp: 3 } },
  { id: 'rep1', kind: 'reputation', n: 40, reward: { money: 30000 } },
  { id: 'sushi1', kind: 'sushi', n: 8, reward: { insp: 5 } },
  { id: 'size1', kind: 'size', n: 1, reward: { money: 50000 } },
  { id: 'kufu', kind: 'counter', key: 'kufuUses', n: 3, reward: { insp: 3 } },
  { id: 'clean', kind: 'cleanDay', n: 40, reward: { insp: 5 } },
  { id: 'rev2', kind: 'dayRevenue', n: 100000, reward: { money: 50000 } },
  { id: 'served2', kind: 'dayServed', n: 100, reward: { insp: 5 } },
  { id: 'streak', kind: 'repStreak', n: 7, reward: { insp: 8 } },
  { id: 'rep2', kind: 'reputation', n: 50, reward: { money: 50000 } },
  { id: 'pachinko1', kind: 'own', type: 'pachinko', n: 1, reward: { money: 30000 } },
  { id: 'pachinko3', kind: 'own', type: 'pachinko', n: 3, reward: { insp: 8 } },
  { id: 'beatPro', kind: 'counter', key: 'beatPro', n: 1, reward: { money: 50000 } },
  { id: 'race1', kind: 'own', type: 'raceCab', n: 1, reward: { money: 50000 } },
  { id: 'beatShumaha', kind: 'counter', key: 'beatShumaha', n: 1, reward: { money: 80000 } },
  { id: 'lemon3', kind: 'counter', key: 'lemonPassed', n: 3, reward: { insp: 10 } },
  { id: 'month', kind: 'counter', key: 'monthWins', n: 1, reward: { money: 100000 } },
  { id: 'sushi2', kind: 'sushi', n: 12, reward: { money: 100000 } },
  { id: 'rep3', kind: 'reputation', n: 70, reward: { money: 100000 } },
  { id: 'size3', kind: 'size', n: 3, reward: { insp: 10 } },
  { id: 'served3', kind: 'dayServed', n: 200, reward: { insp: 10 } },
  { id: 'rev3', kind: 'dayRevenue', n: 300000, reward: { money: 300000 } },
  { id: 'rep4', kind: 'reputation', n: 90, reward: { money: 300000 } },
  { id: 'size4', kind: 'size', n: 4, reward: { money: 500000 } },
];

export const QUESTS_SHOWN = 3;
