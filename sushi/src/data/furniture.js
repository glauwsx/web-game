// 家具與設施。
// w、h：佔地（格）。price：價格。
// slots：使用位置。
//   role：'chef'（師傅站的位置）、'seat'（座位）、'play'（玩機台的位置）
//   px、py：相對於家具左上角的位置（格，可以有小數）。z：離地高度（像素）。
//   face：面向（'N' = −gy、'S' = +gy、'E' = +gx、'W' = −gx）。
//   access：可以走到這個位置的格子（相對於家具左上角），照優先順序。
// reserve：要保留不能擺家具的格子（師傅站的地方、賽道的遙控位置）。

const AROUND_1 = [[0, 1], [-1, 0], [1, 0], [0, -1]];

export const FURNITURE = {
  chefStation: {
    w: 2, h: 1, price: 50000,
    reserve: [[0, -1], [1, -1]],
    slots: [{ role: 'chef', px: 1.0, py: -0.42, z: 0, face: 'S', pose: 'work', access: [[0, -1], [1, -1]] }],
  },
  counterSeat: {
    w: 1, h: 1, price: 8000,
    slots: [{ role: 'seat', px: 0.5, py: 0.5, z: 6, face: 'N', pose: 'sit', access: AROUND_1 }],
  },
  tableSet: {
    w: 2, h: 2, price: 20000,
    slots: [
      { role: 'seat', px: 0.45, py: 0.45, z: 6, face: 'S', pose: 'sit', access: [[-1, 0], [0, -1], [1, -1], [-1, 1], [2, 0], [0, 2], [2, 1], [1, 2]] },
      { role: 'seat', px: 1.55, py: 0.45, z: 6, face: 'S', pose: 'sit', access: [[2, 0], [1, -1], [0, -1], [2, 1], [-1, 0], [1, 2], [-1, 1], [0, 2]] },
      { role: 'seat', px: 0.45, py: 1.55, z: 6, face: 'E', pose: 'sit', access: [[-1, 1], [0, 2], [-1, 0], [1, 2], [0, -1], [2, 1], [1, -1], [2, 0]] },
      { role: 'seat', px: 1.55, py: 1.55, z: 6, face: 'N', pose: 'sit', access: [[2, 1], [1, 2], [2, 0], [0, 2], [1, -1], [-1, 1], [0, -1], [-1, 0]] },
    ],
  },
  pachinko: {
    w: 1, h: 2, price: 80000, machine: 'pachinko',
    slots: [{ role: 'play', px: 0.5, py: 1.42, z: 7, face: 'N', pose: 'sit', access: [[0, 2], [-1, 1], [1, 1]] }],
  },
  // 賽車機台：一台坐一位顧客，跟小鋼珠台同樣的擺法
  raceCab: {
    w: 1, h: 2, price: 150000, machine: 'race',
    slots: [{ role: 'play', px: 0.5, py: 1.42, z: 7, face: 'N', pose: 'sit', access: [[0, 2], [-1, 1], [1, 1]] }],
  },
  fridge: { w: 1, h: 1, price: 30000, stock: 150, slots: [] },
  lantern: { w: 1, h: 1, price: 10000, attraction: 0.05, slots: [] },
  fishTank: { w: 2, h: 1, price: 40000, attraction: 0.10, slots: [] },
  plant: { w: 1, h: 1, price: 3000, attraction: 0.01, slots: [] },
  uniformSign: { w: 1, h: 1, price: 5000, slots: [] },
};

export const FURNITURE_ORDER = ['chefStation', 'counterSeat', 'tableSet', 'pachinko', 'raceCab', 'fridge', 'lantern', 'fishTank', 'plant', 'uniformSign'];
