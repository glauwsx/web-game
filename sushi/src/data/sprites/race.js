// 賽車小遊戲的像素圖：遙控壽司車（車後視角）、路邊的桌上物品。用程式畫。
import { grid, rect, set, dots, stamp, toSprite } from './pixgrid.js';

/** 遙控壽司車。body 是車身顏色，dark 是陰影色，top 是車頂壽司的配料顏色。 */
function car(body, dark, top, stripe) {
  const g = grid(26, 20);
  // 車頂的壽司：醋飯加配料
  rect(g, 8, 0, 10, 3, top);
  rect(g, 9, 0, 8, 1, stripe || top);
  rect(g, 8, 3, 10, 3, 'w');
  rect(g, 8, 5, 10, 1, 'G');
  // 車身
  rect(g, 5, 6, 16, 4, body);
  rect(g, 7, 7, 12, 2, 'I'); // 後車窗
  rect(g, 2, 10, 22, 6, body);
  rect(g, 2, 14, 22, 2, dark);
  // 尾燈和車牌
  rect(g, 3, 11, 3, 2, 'R');
  rect(g, 20, 11, 3, 2, 'R');
  rect(g, 10, 12, 6, 2, 'W');
  // 輪胎
  rect(g, 1, 14, 5, 6, 'k');
  rect(g, 20, 14, 5, 6, 'k');
  rect(g, 2, 15, 3, 4, 'K');
  rect(g, 21, 15, 3, 4, 'K');
  // 底盤
  rect(g, 6, 16, 14, 2, 'k');
  if (stripe) rect(g, 12, 6, 2, 8, stripe);
  return toSprite(g, { ax: 13, ay: 20 });
}

function teacup() {
  const g = grid(22, 24);
  rect(g, 3, 4, 16, 18, 'q');
  rect(g, 4, 3, 14, 1, 'q');
  rect(g, 4, 22, 14, 1, 'n');
  rect(g, 3, 4, 3, 18, 'I');
  rect(g, 4, 5, 14, 2, 'n'); // 茶
  rect(g, 6, 12, 10, 1, 'W');
  rect(g, 6, 15, 10, 1, 'W');
  // 熱氣
  dots(g, [[8, 1], [9, 0], [13, 2], [14, 1]], 'w');
  return toSprite(g, { ax: 11, ay: 24 });
}

function soyBottle() {
  const g = grid(16, 34);
  rect(g, 5, 0, 6, 4, 'r');
  rect(g, 6, 4, 4, 4, 'K');
  rect(g, 3, 8, 10, 4, 'K');
  rect(g, 1, 12, 14, 21, 'a');
  rect(g, 2, 13, 3, 19, 'b');
  rect(g, 4, 18, 9, 9, 'W');
  rect(g, 6, 20, 5, 1, 'r');
  rect(g, 6, 22, 5, 1, 'k');
  rect(g, 6, 24, 5, 1, 'k');
  rect(g, 1, 33, 14, 1, 'k');
  return toSprite(g, { ax: 8, ay: 34 });
}

function chopstickRest() {
  const g = grid(26, 12);
  rect(g, 2, 6, 22, 5, 'i');
  rect(g, 4, 5, 18, 1, 'I');
  rect(g, 2, 11, 22, 1, 'u');
  // 筷子
  rect(g, 0, 3, 26, 2, 'm');
  rect(g, 0, 1, 26, 1, 'r');
  return toSprite(g, { ax: 13, ay: 12 });
}

function sushiPlate() {
  const g = grid(40, 20);
  rect(g, 2, 14, 36, 4, 'a');
  rect(g, 0, 12, 40, 3, 'b');
  rect(g, 4, 18, 4, 2, 'a');
  rect(g, 32, 18, 4, 2, 'a');
  // 三貫壽司
  for (const [x, c, c2] of [[4, 'F', 'R'], [15, 'f', 'x'], [26, 'y', 'Y']]) {
    rect(g, x, 3, 10, 4, c);
    rect(g, x + 2, 4, 3, 1, c2);
    rect(g, x + 6, 5, 3, 1, c2);
    rect(g, x, 7, 10, 5, 'w');
    rect(g, x, 11, 10, 1, 'G');
  }
  return toSprite(g, { ax: 20, ay: 20 });
}

function wasabiHill() {
  const g = grid(30, 22);
  stamp(g, 0, 0, [
    '.............ll...............',
    '...........llllll.............',
    '..........llNllllll...........',
    '.........llNNlllllll..........',
    '........llNNllllNllll.........',
    '.......lllNlllllNNllll........',
    '......llllllllllNNNllll.......',
    '.....lllNlllllllllNNllll......',
    '....lllNNllllllllllNllllN.....',
    '...llllNNllllNlllllllllNNN....',
    '..lllllNlllllNNlllllllllNNN...',
    '..llllllllllNNNllllllllllNNN..',
    '.lllNllllllllNNlllllNlllllNNN.',
    '.llNNlllllllllllllllNNllllNNN.',
    'lllNNNllllllllllllllNNNllllNNN',
    'llllNNlllllNllllllllllNllllNNN',
    'lllllllllllNNlllllllllllllNNNN',
    'NlllllllllNNNllllllllllllNNNNN',
    'NNllllllllllllllllllllllNNNNNN',
    'nNNNlllllllllllllllllNNNNNNNNn',
    'nnNNNNNNNNNNNNNNNNNNNNNNNNNNnn',
    '.nnnnnnnnnnnnnnnnnnnnnnnnnnnn.',
  ]);
  return toSprite(g, { ax: 15, ay: 22 });
}

export const RACE_SPRITES = {
  'race.car.player': car('w', 'G', 'F', 'r'),
  'race.car.shop0': car('U', 'u', 'y', null),
  'race.car.shop1': car('N', 'n', 'f', null),
  'race.car.shop2': car('o', 'm', 'x', null),
  'race.car.shop3': car('V', 'v', 'z', null),
  'race.car.shop4': car('q', 'n', 'w', null),
  'race.car.shumaha': car('r', 'm', 'F', 'y'),
  'race.teacup': teacup(),
  'race.soyBottle': soyBottle(),
  'race.chopstickRest': chopstickRest(),
  'race.sushiPlate': sushiPlate(),
  'race.wasabiHill': wasabiHill(),
};
