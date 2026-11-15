// 賽車小遊戲的像素圖：遙控壽司車（車後視角）、路邊的桌上物品。用程式畫。
import { grid, rect, set, dots, stamp, toSprite } from './pixgrid.js';

/**
 * 車頂的壽司（10×6，畫在 x 8 到 17、y 0 到 5）。每款看得出是哪一種：
 * 玉子黃色帶海苔、鮭魚橘色帶白紋、赤身紅色、鮭魚卵是海苔圍著橘紅顆粒、大腹粉紅帶油花、小黃瓜捲是海苔捲中間一點綠。
 */
const ROOFS = {
  tamago(g) {
    rect(g, 8, 0, 10, 3, 'y'); rect(g, 9, 0, 8, 1, 'Y');
    rect(g, 12, 0, 2, 6, 'j');
    rect(g, 8, 3, 4, 3, 'w'); rect(g, 14, 3, 4, 3, 'w');
  },
  sake(g) {
    rect(g, 8, 0, 10, 3, 'o'); rect(g, 9, 0, 8, 1, 'f');
    dots(g, [[10, 1], [11, 2], [14, 1], [15, 2]], 'x');
    rect(g, 8, 3, 10, 3, 'w');
  },
  maguro(g) {
    rect(g, 8, 0, 10, 3, 'F'); rect(g, 9, 0, 7, 1, 'R');
    rect(g, 8, 3, 10, 3, 'w');
  },
  ikura(g) {
    rect(g, 8, 1, 10, 5, 'j');
    rect(g, 9, 0, 8, 3, 'z');
    dots(g, [[9, 0], [11, 1], [13, 0], [15, 1], [10, 2], [14, 2], [16, 0]], 'F');
    dots(g, [[10, 0], [14, 0]], 'Y');
  },
  otoro(g) {
    rect(g, 8, 0, 10, 3, 'p'); rect(g, 9, 0, 8, 1, 'P');
    dots(g, [[9, 1], [10, 2], [13, 1], [14, 2], [16, 1]], 'w');
    rect(g, 8, 3, 10, 3, 'w');
  },
  kappa(g) {
    // 兩個海苔捲並排
    for (const x of [8, 13]) {
      rect(g, x, 0, 5, 6, 'j');
      rect(g, x + 1, 1, 3, 4, 'w');
      rect(g, x + 2, 2, 1, 2, 'l');
    }
  },
};

/** 遙控壽司車。body 是車身顏色，dark 是陰影色，roof 是車頂那一款壽司的 id。 */
function car(body, dark, roof, stripe) {
  const g = grid(26, 20);
  ROOFS[roof](g);
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
  // 車的名稱是車頂那一款壽司。玩家永遠開小黃瓜捲；修馬哈的車也載小黃瓜捲，但車身是紅色帶黃線
  'race.car.kappa': car('w', 'G', 'kappa', 'r'),
  'race.car.tamago': car('U', 'u', 'tamago', null),
  'race.car.sake': car('N', 'n', 'sake', null),
  'race.car.maguro': car('o', 'm', 'maguro', null),
  'race.car.ikura': car('V', 'v', 'ikura', null),
  'race.car.otoro': car('q', 'n', 'otoro', null),
  'race.car.shumaha': car('r', 'm', 'kappa', 'y'),
  'race.teacup': teacup(),
  'race.soyBottle': soyBottle(),
  'race.chopstickRest': chopstickRest(),
  'race.sushiPlate': sushiPlate(),
  'race.wasabiHill': wasabiHill(),
};
