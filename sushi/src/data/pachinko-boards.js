// 小鋼珠台的機種。兩台都是數位機（デジパチ），盤面一樣，規格不一樣。
// 釘子設定 1 到 5（1 最緊、5 最鬆）改兩件事：
//   life：命釘的半距（公釐）。越寬鋼珠越容易進ヘソ，數字轉得越多。
//   jackpot：普通狀態下，數字轉一次的大當機率。
// 調整這些數字要重跑 tools/gen-pachinko-table.mjs，並確認計劃書 8.7 的回饋率表。

const GEOM = { ledge: 8, warpGuard: 9, michiEnd: 180, michiY: 284, michiDrag: 0.3, hakW: 30 };

export const BOARDS = {
  // 龍神傳：第 1 台。大當比較少，但每次比較多，確變還會連莊
  ryujin: {
    id: 'ryujin', theme: 'dragon', ...GEOM,
    life: [7.1, 7.3, 7.5, 7.7, 7.9],
    jackpot: [1 / 88, 1 / 65, 1 / 44, 1 / 33, 1 / 27],
    pHigh: 1 / 7, stSpins: 3,            // 確變：機率和回數
    roundsBig: 6, roundsSmall: 2,        // 大當的回合數
    bigRate1: 0.25, bigRate2: 0.5,       // ヘソ、電チュー大當時是大的回合數的機率
    count: 8, payAtt: 10,                // 一回合進幾顆就關；アタッカー一顆賠幾顆
    payHeso: 1, payDenchu: 1, payPocket: 3,
    roundTime: 12, denOpenST: 2.4, reachRate: 1 / 12,
  },
  // 海鳴物語：第 2 台（無限模式研發後解鎖）。甘デジ：大當多，每次少
  umi: {
    id: 'umi', theme: 'sea', ...GEOM,
    life: [7.1, 7.3, 7.5, 7.7, 7.9],
    jackpot: [1 / 50, 1 / 36, 1 / 25, 1 / 19, 1 / 16],
    pHigh: 1 / 5, stSpins: 2,
    roundsBig: 4, roundsSmall: 2,
    bigRate1: 0.3, bigRate2: 0.3,
    count: 6, payAtt: 10,
    payHeso: 1, payDenchu: 1, payPocket: 3,
    roundTime: 12, denOpenST: 2.4, reachRate: 1 / 10,
  },
};
export const BOARD_ORDER = ['ryujin', 'umi'];
