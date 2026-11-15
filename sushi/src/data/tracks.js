// 賽道。賽道由一串路段組成，每段長度 200，有彎度和高度。
// sections：[進彎段數, 維持段數, 出彎段數, 彎度, 坡高]。彎度正數是右彎。
// items：賽道上的東西 { kind: 'puddle'（醬油水灘）| 'pad'（山葵加速板）, at: 路段比例 0–1, x }
// scenery：路邊景物 { kind, every: 每幾段放一個, side: -1 左 | 1 右 | 0 兩邊, from, to（路段比例）}

const easeIn = (a, b, t) => a + (b - a) * t * t;
const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);

/** 把 sections 展開成路段陣列：每段 { curve, y }。最後把高度拉回 0，讓賽道頭尾相接。 */
export function buildSegments(sections) {
  const segs = [];
  let y = 0;
  for (const [enter, hold, leave, curve, hill] of sections) {
    const startY = y;
    const endY = startY + (hill || 0);
    const total = enter + hold + leave;
    for (let i = 0; i < enter; i++) segs.push({ curve: easeIn(0, curve, (i + 1) / enter), y: easeInOut(startY, endY, (i + 1) / total) });
    for (let i = 0; i < hold; i++) segs.push({ curve, y: easeInOut(startY, endY, (enter + i + 1) / total) });
    for (let i = 0; i < leave; i++) segs.push({ curve: easeInOut(curve, 0, (i + 1) / leave), y: easeInOut(startY, endY, (enter + hold + i + 1) / total) });
    y = endY;
  }
  // 頭尾相接：把剩下的高度差平均攤掉
  const n = segs.length;
  for (let i = 0; i < n; i++) segs[i].y -= y * ((i + 1) / n);
  return segs;
}

const straight = (n) => [0, n, 0, 0, 0];
const curve = (n, c, hill = 0) => [Math.round(n / 4), Math.round(n / 2), Math.round(n / 4), c, hill];
const hill = (n, h) => [Math.round(n / 4), Math.round(n / 2), Math.round(n / 4), 0, h];

const TRACK_DEFS = {
  // 板前環道（簡單）：彎道平緩，沒有坡
  itamae: {
    difficulty: 1,
    sections: [
      straight(120), curve(160, 1.5), straight(90), curve(140, -1.2), straight(110),
      curve(180, 2), straight(80), curve(120, 1), straight(100), curve(130, -1.5),
    ],
    items: [{ kind: 'pad', at: 0.30, x: 0 }, { kind: 'puddle', at: 0.62, x: 0.4 }, { kind: 'pad', at: 0.86, x: -0.3 }],
    scenery: [
      { kind: 'teacup', every: 14, side: 1 }, { kind: 'chopstickRest', every: 22, side: -1 },
      { kind: 'sushiPlate', every: 60, side: -1 },
    ],
    sky: 'counter',
  },
  // 醬油彎道（中等）：連續 S 彎，水灘多
  shoyu: {
    difficulty: 2,
    sections: [
      straight(100), curve(140, 2.5), curve(120, -2.5), straight(70), curve(160, 3), straight(60),
      curve(110, -2), curve(110, 2), straight(120), curve(170, -3), straight(90),
    ],
    items: [
      { kind: 'puddle', at: 0.12, x: -0.4 }, { kind: 'pad', at: 0.25, x: 0.3 }, { kind: 'puddle', at: 0.40, x: 0.2 },
      { kind: 'puddle', at: 0.58, x: -0.2 }, { kind: 'pad', at: 0.70, x: 0 }, { kind: 'puddle', at: 0.88, x: 0.5 },
    ],
    scenery: [
      { kind: 'soyBottle', every: 12, side: 0 }, { kind: 'teacup', every: 30, side: 1 },
      { kind: 'sushiPlate', every: 55, side: 1 },
    ],
    sky: 'counter',
  },
  // 山葵山道（困難）：有坡，彎道急
  wasabi: {
    difficulty: 3,
    sections: [
      straight(90), hill(120, 9000), curve(150, 3.0, 6000), straight(60), curve(130, -3, -8000),
      hill(100, -7000), curve(160, 3.2), straight(70), curve(120, -3.0, 7000), curve(120, 3, -7000),
      straight(110), curve(140, -3.2),
    ],
    items: [
      { kind: 'pad', at: 0.08, x: 0.3 }, { kind: 'puddle', at: 0.22, x: 0 }, { kind: 'puddle', at: 0.37, x: -0.5 },
      { kind: 'pad', at: 0.50, x: -0.3 }, { kind: 'puddle', at: 0.66, x: 0.4 }, { kind: 'pad', at: 0.82, x: 0 }, { kind: 'puddle', at: 0.93, x: -0.3 },
    ],
    scenery: [
      { kind: 'wasabiHill', every: 10, side: 0 }, { kind: 'soyBottle', every: 26, side: -1 },
      { kind: 'teacup', every: 34, side: 1 },
    ],
    sky: 'hill',
  },
};

/** 路邊景物放在離路面中線多遠（路面邊緣是 1）。 */
export const SCENERY_X = 1.6;

function compile(id, def) {
  const segs = buildSegments(def.sections);
  const n = segs.length;
  const items = def.items.map((it) => ({ kind: it.kind, seg: Math.floor(it.at * n) % n, x: it.x }));
  const itemAt = {};
  for (const it of items) itemAt[it.seg] = it;
  const scenery = {};
  for (const sc of def.scenery) {
    const from = Math.floor((sc.from || 0) * n);
    const to = Math.floor((sc.to || 1) * n);
    for (let i = from + sc.every; i < to; i += sc.every) {
      const sides = sc.side === 0 ? [-1, 1] : [sc.side];
      for (const side of sides) {
        if (!scenery[i]) scenery[i] = [];
        scenery[i].push({ kind: sc.kind, side });
      }
    }
  }
  return { id, difficulty: def.difficulty, sky: def.sky, segs, n, items, itemAt, scenery };
}

export const TRACK_ORDER = ['itamae', 'shoyu', 'wasabi'];
export const TRACKS = {};
for (const id of TRACK_ORDER) TRACKS[id] = compile(id, TRACK_DEFS[id]);
