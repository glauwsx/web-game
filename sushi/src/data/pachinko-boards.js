// 小鋼珠檯面。檯面邏輯尺寸 200×300。
// nails：釘子 { x, y, adj }。adj 是「可調整」釘子在釘子設定 1 到 5 的水平位移。
// walls：牆 { x1, y1, x2, y2 }。pockets：入賞口 { kind, x, y, w }，(x, y) 是開口中心。
// launch：彈珠進入檯面的位置和速度。水平速度 = vx0 + vx1 × 力道（往左）。
//         低於 vxMin 代表力道太弱，射不上去。
//
// 檯面的想法：彈珠從右上角進來，力道決定落點。
// 落點正中間有一個「天釘」開口，進去之後是中央通道：先經過啟動口，再往下到 A 入賞口。
// 沒進中央通道的彈珠掉到兩側的釘林，靠運氣進 B、C、D。

const CX = 95; // 檯面中線

/** 產生左右對稱的一對釘子。adj 是往外的位移（正數 = 離中線更遠）。 */
function pair(dx, y, adj) {
  return [
    { x: CX - dx, y, adj: adj ? adj.map((v) => -v) : undefined },
    { x: CX + dx, y, adj: adj || undefined },
  ];
}

/** 產生一片交錯排列的釘林。keep(x, y) 回傳 false 的位置不放釘子。 */
function field(x0, x1, y0, y1, sx, sy, keep) {
  const out = [];
  let row = 0;
  for (let y = y0; y <= y1; y += sy, row++) {
    const off = row % 2 ? sx / 2 : 0;
    for (let x = x0 + off; x <= x1; x += sx) {
      if (!keep || keep(x, y)) out.push({ x: Math.round(x * 10) / 10, y });
    }
  }
  return out;
}

// 板前檯面的參數。調整這些數字來滿足回饋率表（計劃書 8.7）。
// 陣列是釘子設定 1 到 5 的值。
export const ITAMAE_PARAMS = {
  slope: 3000,                           // 力道對水平速度的斜率
  aim: 0.5015,                           // 落在天釘正中間的力道（讓峰值落在統計表區間 0.50–0.51 的正中間）
  lane: 14,                              // 中央通道的半寬
  gate: [9.1, 9.1, 9.1, 9.1, 9.1],       // 天釘的半距
  split: 76,                             // 通道入口下方分流釘的高度
  sGuard: [8, 8.25, 8.5, 8.75, 9],       // 命釘（啟動口上方兩根釘子）的半距
  plateUp: 8,                            // 屋簷板比開口高幾像素
  aPlate: [5, 5, 5, 5, 5],               // 各入賞口屋簷板的半寬。越窄越容易進
  bPlate: [12, 12, 12, 12, 12],
  cPlate: [5, 4.5, 4, 3.5, 3],
  dPlate: [3, 2.75, 2.5, 2.25, 2],
};

export function buildItamae(o = {}) {
  const q = { ...ITAMAE_PARAMS, ...o };
  const LANE = q.lane;
  const nails = [];
  const walls = [
    // 外框
    { x1: 8, y1: 8, x2: 182, y2: 8 },
    { x1: 8, y1: 8, x2: 8, y2: 292 },
    { x1: 182, y1: 8, x2: 182, y2: 292 },
    // 左上角的斜面：力道太強的彈珠會被彈下來
    { x1: 8, y1: 40, x2: 40, y2: 8 },
    // 中央通道的兩道牆
    { x1: CX - LANE, y1: 70, x2: CX - LANE, y2: 206 },
    { x1: CX + LANE, y1: 70, x2: CX + LANE, y2: 206 },
  ];
  // 天釘：中央通道的入口
  nails.push({ x: CX - q.gate[2], y: 62, adj: q.gate.map((g) => q.gate[2] - g) });
  nails.push({ x: CX + q.gate[2], y: 62, adj: q.gate.map((g) => g - q.gate[2]) });
  nails.push(...pair(LANE, 68));
  // 通道入口下方的分流釘
  nails.push({ x: CX, y: q.split });
  // 命釘：啟動口上方的兩根釘子
  nails.push({ x: CX - q.sGuard[2], y: 100, adj: q.sGuard.map((g) => q.sGuard[2] - g) });
  nails.push({ x: CX + q.sGuard[2], y: 100, adj: q.sGuard.map((g) => g - q.sGuard[2]) });
  // 通道裡的釘子：把彈珠打散
  nails.push(...pair(7.5, 128));
  nails.push({ x: CX, y: 144 });
  nails.push(...pair(7.5, 160));
  // 通道出口下方的分流釘
  nails.push({ x: CX, y: 214 });
  // 兩側的釘林
  const inLane = (x) => Math.abs(x - CX) < LANE + 5;
  nails.push(...field(15, 177, 84, 216, 14, 12, (x) => !inLane(x) && x > 12 && x < 178));
  const plates = { A: q.aPlate, B: q.bPlate, C: q.cPlate, D: q.dPlate };
  const pockets = [
    { kind: 'S', x: CX, y: 106, w: 9.5, depth: 8 },
    { kind: 'A', x: CX, y: 190, w: 9.5, depth: 8 },
    { kind: 'B', x: CX - 20.5, y: 234, w: 9.5 },
    { kind: 'B', x: CX + 20.5, y: 234, w: 9.5 },
    { kind: 'C', x: CX - 46, y: 250, w: 9.5 },
    { kind: 'C', x: CX + 46, y: 250, w: 9.5 },
    { kind: 'D', x: CX - 72, y: 264, w: 9.5 },
    { kind: 'D', x: CX + 72, y: 264, w: 9.5 },
  ];
  // 入賞口上方的屋簷板。彈珠不能從正上方直接掉進去
  for (const pk of pockets) if (plates[pk.kind]) pk.plate = { up: q.plateUp, half: plates[pk.kind] };
  return {
    id: 'itamae',
    w: 200, h: 300, outY: 292,
    // 落在天釘正中間時水平速度是 253.4。slope 越大，力道差一點落點就差越多
    launch: { x: 176, y: 16, vx0: 253.4 - q.slope * q.aim, vx1: q.slope, vxMin: 15 },
    nails, walls, pockets,
  };
}

export const BOARDS = {
  itamae: buildItamae(),
};

export const BOARD_ORDER = ['itamae'];
