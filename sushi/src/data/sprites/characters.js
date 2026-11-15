// 分層紙娃娃角色產生器。
// 輸入一組外觀參數（look），輸出該角色的全部畫格（像素圖資料）。
// 純邏輯，Node.js 可用。
//
// look = {
//   build: 'adult' | 'tall' | 'stocky' | 'short' | 'child',
//   skin: 調色盤字元,
//   hair: { style, color },
//   top: { style, color, color2, sleeve: 'long' | 'short' | 'rolled', obi, tie },
//   bottom: { style: 'pants' | 'skirt' | 'shorts' | 'kimono', color },
//   shoes: { style: 'shoes' | 'geta', color },
//   hat: { style, color } | null,
//   face: { eyes, brow, mustache, stubble, glasses, angryRed },
//   acc: ['apron', 'camera', 'scarf', ...]
// }
import { grid, set, get, rect, dots, outline, toSprite } from './pixgrid.js';

export const CHAR_W = 16;
export const CHAR_H = 24;
export const POSES = ['stand', 'walk1', 'walk2', 'sit', 'work', 'happy', 'angry'];

const BUILDS = {
  adult: { leg: 4, torso: 6, wide: 0 },
  tall: { leg: 5, torso: 6, wide: 0 },
  stocky: { leg: 4, torso: 6, wide: 1 },
  short: { leg: 2, torso: 5, wide: 0 },
  child: { leg: 2, torso: 4, wide: 0 },
};
const SHOE_Y = 22;
const HEAD_H = 8;

/** 算出各部位的列位置。 */
function layout(look, pose) {
  const b = BUILDS[look.build || 'adult'];
  const leg = pose === 'sit' ? Math.max(1, b.leg - 2) : b.leg;
  const legTop = SHOE_Y - leg;
  const torsoTop = legTop - b.torso;
  const headTop = torsoTop - HEAD_H;
  return { leg, legTop, torsoTop, headTop, torso: b.torso, x0: 4 - b.wide, x1: 11 + b.wide };
}

function drawLegs(g, look, L, pose, back) {
  const bt = look.bottom || { style: 'pants', color: 'K' };
  const skin = look.skin || 's';
  const shoes = look.shoes || { style: 'shoes', color: 'k' };
  const lift = pose === 'walk1' ? 'L' : pose === 'walk2' ? 'R' : '';
  if (bt.style === 'kimono') {
    // 和服下襬：一整片，沒有腿縫
    rect(g, 5, L.legTop, 6, L.leg, bt.color);
    const sy = SHOE_Y;
    rect(g, lift === 'L' ? 6 : 5, sy, 2, 1, shoes.color);
    rect(g, lift === 'R' ? 8 : 9, sy, 2, 1, shoes.color);
    return;
  }
  for (let i = 0; i < L.leg; i++) {
    const y = L.legTop + i;
    let c = bt.color;
    if (bt.style === 'skirt' && i >= 2) c = skin;
    if (bt.style === 'shorts' && i >= 1) c = skin;
    if (shoes.style === 'geta' && i === L.leg - 1 && L.leg > 1) c = skin;
    if (i === 0 || (bt.style === 'skirt' && i < 2)) {
      rect(g, L.x0 + 1, y, L.x1 - L.x0 - 1, 1, bt.style === 'skirt' || i === 0 ? bt.color : c);
      if (bt.style === 'skirt' && i === 1) { set(g, L.x0, y, bt.color); set(g, L.x1, y, bt.color); }
      continue;
    }
    const last = i === L.leg - 1;
    if (!(lift === 'L' && last)) rect(g, 5, y, 2, 1, c);
    if (!(lift === 'R' && last)) rect(g, 9, y, 2, 1, c);
  }
  // 鞋子。抬起的那隻腳往上一格。
  const ly = lift === 'L' && L.leg > 1 ? SHOE_Y - 1 : SHOE_Y;
  const ry = lift === 'R' && L.leg > 1 ? SHOE_Y - 1 : SHOE_Y;
  const sc = shoes.style === 'geta' ? 'b' : shoes.color;
  if (back) {
    rect(g, 5, ly, 2, 1, sc);
    rect(g, 9, ry, 2, 1, sc);
  } else {
    rect(g, 4, ly, 3, 1, sc);
    rect(g, 9, ry, 3, 1, sc);
  }
}

function sleeveColor(look, i, len) {
  const top = look.top || {};
  const skin = look.skin || 's';
  const sleeve = top.sleeve || 'long';
  if (i === len - 1) return skin; // 手
  if (sleeve === 'short' && i >= 2) return skin;
  if (sleeve === 'rolled' && i >= 3) return skin;
  return top.color || 'w';
}

function drawTorso(g, look, L, pose, back) {
  const top = look.top || { style: 'tshirt', color: 'w' };
  const C = top.color || 'w';
  const C2 = top.color2 || 'W';
  const { x0, x1, torsoTop: tT, torso } = L;
  const w = x1 - x0 + 1;
  const skin = look.skin || 's';
  rect(g, x0, tT, w, torso, C);
  const cx = back ? 7 : 7; // 胸口中線
  switch (top.style) {
    case 'uniform':
      if (!back) {
        dots(g, [[cx - 1, tT], [cx, tT], [cx + 1, tT]], 'w');
        dots(g, [[cx, tT + 1], [cx, tT + 2]], top.tie || 'u');
        set(g, x0 + 1, tT + 1, 'e'); // 徽章
      }
      rect(g, x0, tT + torso - 1, w, 1, 'k');
      if (!back) set(g, cx, tT + torso - 1, 'e');
      break;
    case 'chef':
      if (!back) {
        dots(g, [[x0 + 1, tT], [x0 + 2, tT + 1], [x0 + 3, tT + 2], [x0 + 4, tT + 3]], 'G');
        dots(g, [[x1 - 2, tT], [x1 - 3, tT + 1]], 'G');
      }
      rect(g, x0, tT + torso - 2, w, 1, 'G');
      break;
    case 'happi':
      if (!back) {
        rect(g, cx - 1, tT, 3, torso, 'K');
        rect(g, cx - 2, tT, 1, torso, C2);
        rect(g, cx + 2, tT, 1, torso, C2);
        rect(g, cx - 1, tT + torso - 2, 3, 1, C2);
      } else {
        rect(g, 7, tT + 1, 2, 2, C2); // 背後的紋
      }
      break;
    case 'kimono': {
      const obi = top.obi || 'r';
      if (!back) {
        dots(g, [[cx - 1, tT], [cx, tT + 1], [cx + 2, tT], [cx + 1, tT + 1]], C2);
        set(g, cx, tT, skin);
        set(g, cx + 1, tT, skin);
      }
      rect(g, x0, tT + torso - 3, w, 2, obi);
      if (back) rect(g, 6, tT + torso - 4, 4, 3, obi);
      break;
    }
    case 'suit':
      if (!back) {
        dots(g, [[cx - 1, tT], [cx, tT], [cx + 1, tT], [cx, tT + 3]], 'w');
        dots(g, [[cx, tT + 1], [cx, tT + 2]], top.tie || 'r');
      }
      break;
    case 'jacket':
      if (!back) rect(g, cx - 1, tT, 3, torso - 1, C2);
      rect(g, x0, tT + torso - 1, w, 1, 'k');
      break;
    case 'race':
      if (!back) {
        dots(g, [[cx - 1, tT], [cx, tT], [cx + 1, tT]], 'w');
        rect(g, x0 + 1, tT + 1, 2, 1, 'y');
        rect(g, cx + 1, tT + 2, 2, 1, 'w');
      } else {
        rect(g, 6, tT + 1, 4, 2, 'w');
      }
      rect(g, x0, tT + torso - 1, w, 1, 'w');
      break;
    case 'stripe':
      for (let y = tT + 1; y < tT + torso; y += 2) rect(g, x0, y, w, 1, C2);
      break;
    case 'aloha':
      dots(g, [[x0 + 1, tT + 1], [x0 + 4, tT + 2], [x0 + 6, tT + 1], [x0 + 2, tT + 4], [x0 + 5, tT + 4]], C2);
      if (!back) dots(g, [[cx, tT], [cx + 1, tT]], skin);
      break;
    default: // tshirt、dress
      if (!back && top.neck !== false) dots(g, [[cx, tT], [cx + 1, tT]], skin);
  }

  // 配件：圍裙
  const acc = look.acc || [];
  if (acc.includes('apron')) {
    if (!back) {
      rect(g, x0 + 1, tT + 1, w - 2, torso - 1, 'W');
      dots(g, [[x0 + 1, tT], [x1 - 1, tT]], 'W');
      rect(g, x0 + 1, tT + torso, w - 2, 1, 'W');
    } else {
      rect(g, x0, tT + 2, w, 1, 'W');
      dots(g, [[7, tT + 3], [8, tT + 3]], 'W');
    }
  }
  if (acc.includes('scarf') && !back) rect(g, x0 + 1, tT, w - 2, 1, top.scarf || 'r');
  if (acc.includes('camera') && !back) { rect(g, cx - 1, tT + 2, 3, 2, 'k'); set(g, cx, tT + 2, 'I'); }
  if (acc.includes('medal') && !back) { set(g, cx, tT + 2, 'e'); }

  // 手臂
  const armL = x0 - 1;
  const armR = x1 + 1;
  const len = torso - 1;
  if (pose === 'happy') {
    // 雙手舉高
    for (let i = 0; i < 4; i++) {
      const c = i === 3 ? skin : sleeveColor(look, i, len);
      set(g, armL, tT + 1 - i, c);
      set(g, armR, tT + 1 - i, c);
    }
    set(g, armL - 1, tT - 2, skin);
    set(g, armR + 1, tT - 2, skin);
  } else if (pose === 'work') {
    for (let i = 0; i < 2; i++) {
      set(g, armL, tT + i, sleeveColor(look, i, len));
      set(g, armR, tT + i, sleeveColor(look, i, len));
    }
    if (!back) {
      // 前臂往中間伸，手上捏著一貫壽司
      set(g, x0, tT + 2, sleeveColor(look, 2, len));
      set(g, x1, tT + 2, sleeveColor(look, 2, len));
      dots(g, [[x0 + 1, tT + 3], [x0 + 2, tT + 3], [x1 - 1, tT + 3], [x1 - 2, tT + 3]], skin);
      dots(g, [[7, tT + 3], [8, tT + 3]], 'w');
      dots(g, [[7, tT + 2], [8, tT + 2]], 'F');
    } else {
      set(g, armL, tT + 2, skin);
      set(g, armR, tT + 2, skin);
    }
  } else {
    const swingL = pose === 'walk1' ? 1 : 0;
    const swingR = pose === 'walk2' ? 1 : 0;
    for (let i = 0; i < len - swingL; i++) set(g, armL, tT + i, sleeveColor(look, i + swingL, len));
    for (let i = 0; i < len - swingR; i++) set(g, armR, tT + i, sleeveColor(look, i + swingR, len));
    if (pose === 'angry') {
      // 握拳舉起一隻手
      set(g, armR, tT + len - 1, '.');
      set(g, armR, tT + len - 2, '.');
      set(g, armR + 1, tT + 1, sleeveColor(look, 1, len));
      set(g, armR + 1, tT, skin);
      set(g, armR + 1, tT - 1, skin);
    }
  }
}

function drawHead(g, look, L, pose, back) {
  const f = look.face || {};
  let skin = look.skin || 's';
  if (pose === 'angry' && f.angryRed) skin = 'R';
  const hT = L.headTop;
  rect(g, 5, hT, 6, 1, skin);
  rect(g, 4, hT + 1, 8, 6, skin);
  rect(g, 5, hT + 7, 6, 1, skin);
  if (back) return;

  const e1 = 5;
  const e2 = 8;
  const eyeC = 'k';
  // 鬍渣（先畫，後面的嘴巴會蓋上去）
  if (f.stubble) {
    rect(g, 5, hT + 7, 6, 1, 't');
    dots(g, [[4, hT + 6], [9, hT + 6], [10, hT + 6], [11, hT + 6], [4, hT + 5], [11, hT + 5]], 't');
  }
  // 眉毛和眼睛
  const brow = pose === 'angry' && f.brow !== 'uni' ? 'thick' : f.brow;
  if (brow === 'uni') {
    rect(g, 4, hT + 3, 6, 1, 'k');
    dots(g, [[4, hT + 2], [9, hT + 2]], 'k'); // 兩端往上翹，像 M 字
    dots(g, [[e1, hT + 4], [e2, hT + 4]], eyeC);
  } else if (brow === 'thick') {
    dots(g, [[e1 - 1, hT + 2], [e1, hT + 3], [e2 + 1, hT + 2], [e2, hT + 3]], 'k');
    dots(g, [[e1, hT + 4], [e2, hT + 4]], eyeC);
  } else if (f.eyes === 'dot' || pose === 'happy') {
    dots(g, [[e1, hT + 4], [e2, hT + 4]], eyeC);
  } else if (f.eyes === 'closed') {
    dots(g, [[e1, hT + 4], [e1 + 1, hT + 4], [e2, hT + 4], [e2 + 1, hT + 4]], 't');
  } else {
    dots(g, [[e1, hT + 3], [e1, hT + 4], [e2, hT + 3], [e2, hT + 4]], eyeC);
  }
  // 嘴
  if (pose === 'happy') rect(g, 5, hT + 6, 3, 1, 'm');
  else if (pose === 'angry') rect(g, 6, hT + 6, 2, 1, 'k');
  else if (f.mouth !== false) set(g, 6, hT + 6, 't');
  // 鬍子
  if (f.mustache === 'hachi') {
    dots(g, [[4, hT + 6], [5, hT + 5], [7, hT + 5], [8, hT + 6]], f.mustacheColor || 'k');
    if (pose !== 'angry') set(g, 6, hT + 6, skin);
  } else if (f.mustache === 'fake') {
    rect(g, 4, hT + 5, 6, 1, 'k');
    dots(g, [[4, hT + 6], [9, hT + 6]], 'k');
  }
  // 眼鏡、墨鏡
  if (f.glasses === 'glasses') {
    dots(g, [[4, hT + 4], [6, hT + 4], [9, hT + 4]], 'I');
    dots(g, [[7, hT + 4]], 'k');
    rect(g, 4, hT + 3, 6, 1, 'k');
    dots(g, [[e1, hT + 4], [e2, hT + 4]], 'k');
    dots(g, [[10, hT + 3], [11, hT + 3]], 'k');
  } else if (f.glasses === 'shades') {
    rect(g, 4, hT + 3, 6, 2, 'k');
    dots(g, [[4, hT + 3], [8, hT + 3]], 'g');
    dots(g, [[10, hT + 3], [11, hT + 3]], 'k');
  }
  if (f.blush) dots(g, [[4, hT + 5], [9, hT + 5]], 'p');
}

function drawHair(g, look, L, back) {
  const hair = look.hair || { style: 'short', color: 'h' };
  const c = hair.color || 'h';
  const hT = L.headTop;
  const tT = L.torsoTop;
  const st = hair.style;
  if (st === 'none') return;
  if (back) {
    // 背面：頭髮蓋住大部分的頭
    switch (st) {
      case 'buzz':
        rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 3, c);
        break;
      case 'thin':
        rect(g, 4, hT + 2, 8, 3, c); dots(g, [[4, hT + 1], [11, hT + 1]], c);
        break;
      case 'long':
        rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 7, c);
        rect(g, 4, tT, 8, 3, c); dots(g, [[3, hT + 3], [12, hT + 3], [3, hT + 4], [12, hT + 4], [3, hT + 5], [12, hT + 5], [3, hT + 6], [12, hT + 6]], c);
        break;
      case 'bob':
        rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 6, c);
        break;
      case 'bun':
        rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 5, c);
        rect(g, 6, hT - 2, 4, 2, c);
        break;
      case 'ponytail':
        rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 5, c);
        rect(g, 7, hT + 4, 2, 6, c);
        break;
      default:
        rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 5, c);
        if (st === 'spiky') dots(g, [[5, hT - 1], [8, hT - 1], [10, hT - 1]], c);
    }
    return;
  }
  // 正面
  switch (st) {
    case 'buzz': // 平頭：頂部又平又方
      rect(g, 4, hT, 8, 2, c);
      dots(g, [[10, hT + 2], [11, hT + 2], [11, hT + 3]], c);
      break;
    case 'short':
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 1, c);
      dots(g, [[4, hT + 2], [9, hT + 2], [10, hT + 2], [11, hT + 2], [11, hT + 3], [11, hT + 4]], c);
      break;
    case 'sidepart': // 整齊旁分
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 1, c);
      rect(g, 4, hT + 2, 4, 1, c);
      dots(g, [[10, hT + 2], [11, hT + 2], [11, hT + 3], [11, hT + 4]], c);
      break;
    case 'bangs': // 長瀏海蓋住額頭
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 2, c);
      dots(g, [[4, hT + 3], [6, hT + 3], [7, hT + 3], [9, hT + 3], [10, hT + 3], [11, hT + 3], [11, hT + 4]], c);
      break;
    case 'long':
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 1, c);
      dots(g, [[4, hT + 2], [5, hT + 2], [9, hT + 2], [10, hT + 2], [11, hT + 2]], c);
      rect(g, 11, hT + 3, 1, 5, c);
      rect(g, 12, hT + 2, 1, 9, c);
      rect(g, 3, hT + 2, 1, 9, c);
      dots(g, [[11, tT], [11, tT + 1]], c);
      break;
    case 'bob': // 齊瀏海短髮
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 2, c);
      rect(g, 11, hT + 3, 1, 4, c);
      dots(g, [[10, hT + 3], [10, hT + 4]], c);
      dots(g, [[3, hT + 3], [3, hT + 4], [3, hT + 5], [12, hT + 3], [12, hT + 4], [12, hT + 5]], c);
      break;
    case 'bun': // 髮髻
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 1, c);
      dots(g, [[4, hT + 2], [10, hT + 2], [11, hT + 2], [11, hT + 3]], c);
      rect(g, 6, hT - 2, 4, 2, c);
      break;
    case 'tomboy': // 俐落短髮，兩側有鬢角
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 1, c);
      dots(g, [[4, hT + 2], [5, hT + 2], [6, hT + 2], [9, hT + 2], [10, hT + 2], [11, hT + 2]], c);
      rect(g, 11, hT + 3, 1, 3, c);
      dots(g, [[4, hT + 3], [10, hT + 3]], c);
      break;
    case 'thin': // 年長：只有兩側
      dots(g, [[4, hT + 1], [4, hT + 2], [11, hT + 1], [11, hT + 2], [11, hT + 3], [10, hT + 1]], c);
      break;
    case 'ponytail':
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 1, c);
      dots(g, [[4, hT + 2], [5, hT + 2], [10, hT + 2], [11, hT + 2], [11, hT + 3]], c);
      dots(g, [[12, hT + 1], [13, hT + 2], [13, hT + 3], [13, hT + 4]], c);
      break;
    case 'spiky':
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 1, c);
      dots(g, [[5, hT - 1], [8, hT - 1], [10, hT - 1], [4, hT + 2], [11, hT + 2], [11, hT + 3]], c);
      break;
    case 'curly':
      rect(g, 4, hT, 8, 2, c);
      dots(g, [[3, hT + 1], [12, hT + 1], [3, hT + 2], [12, hT + 2], [4, hT + 2], [11, hT + 2], [11, hT + 3], [5, hT - 1], [7, hT - 1], [9, hT - 1]], c);
      break;
    default:
      rect(g, 5, hT, 6, 1, c); rect(g, 4, hT + 1, 8, 1, c);
  }
}

function drawHat(g, look, L, back) {
  const hat = look.hat;
  if (!hat) return;
  const c = hat.color || 'w';
  const hT = L.headTop;
  switch (hat.style) {
    case 'chef': // 板前帽
      rect(g, 4, hT - 2, 8, 3, c);
      rect(g, 4, hT + 1, 8, 1, 'G');
      break;
    case 'police': // 警帽
      rect(g, 5, hT - 2, 6, 1, c);
      rect(g, 4, hT - 1, 8, 2, c);
      rect(g, 4, hT + 1, 8, 1, 'k');
      if (!back) {
        dots(g, [[6, hT - 1], [7, hT - 1], [6, hT]], 'e');
        rect(g, 3, hT + 2, 7, 1, 'k'); // 帽簷
      }
      break;
    case 'helmet': // 全罩安全帽
      rect(g, 5, hT - 1, 6, 1, c);
      rect(g, 4, hT, 8, 7, c);
      rect(g, 5, hT + 7, 6, 1, c);
      rect(g, 6, hT - 1, 2, 3, 'w');
      if (!back) {
        rect(g, 4, hT + 3, 7, 2, 'k');
        dots(g, [[5, hT + 3], [6, hT + 3]], 'I');
      } else {
        rect(g, 6, hT + 2, 2, 5, 'w');
      }
      break;
    case 'cap': // 棒球帽
      rect(g, 5, hT - 1, 6, 1, c);
      rect(g, 4, hT, 8, 2, c);
      if (!back) rect(g, 2, hT + 2, 7, 1, c);
      else set(g, 7, hT + 1, 'w');
      break;
    case 'beret':
      rect(g, 4, hT - 1, 7, 1, c);
      rect(g, 3, hT, 9, 2, c);
      set(g, 8, hT - 2, c);
      break;
    case 'sunhat':
      rect(g, 5, hT - 1, 6, 2, c);
      rect(g, 2, hT + 1, 12, 1, c);
      rect(g, 5, hT, 6, 1, hat.band || 'r');
      break;
    case 'headband': // 頭巾
      rect(g, 4, hT + 1, 8, 1, c);
      if (back) dots(g, [[8, hT + 2], [9, hT + 3]], c);
      break;
    default:
  }
}

/** 畫出一個角色的一個畫格。回傳像素格。 */
export function drawCharacter(look, pose = 'stand', back = false) {
  const g = grid(CHAR_W, CHAR_H);
  const L = layout(look, pose);
  drawLegs(g, look, L, pose, back);
  drawTorso(g, look, L, pose, back);
  drawHead(g, look, L, pose, back);
  drawHair(g, look, L, back);
  drawHat(g, look, L, back);
  outline(g, 'k');
  // 生氣記號（畫在輪廓之後，不加外框）
  if (pose === 'angry' && !back) dots(g, [[13, L.headTop - 2], [15, L.headTop - 2], [14, L.headTop - 1], [13, L.headTop], [15, L.headTop]], 'F');
  return g;
}

/**
 * 產生一個角色的全部畫格。
 * 回傳 { front: { 姿勢: 像素圖 }, back: { 姿勢: 像素圖 }, portrait: 像素圖 }。
 * 左右方向由繪圖時水平翻轉。
 */
export function buildCharacter(look) {
  const out = { front: {}, back: {} };
  for (const pose of POSES) {
    out.front[pose] = toSprite(drawCharacter(look, pose, false), { ax: 8, ay: 23 });
    out.back[pose] = toSprite(drawCharacter(look, pose, true), { ax: 8, ay: 23 });
  }
  out.portrait = buildPortrait(look, 'stand');
  out.portraitAngry = buildPortrait(look, 'angry');
  return out;
}

/** 大頭像：從正面畫格切出頭部（14×13）。顯示時放大 3 倍。 */
export function buildPortrait(look, pose = 'stand') {
  const src = drawCharacter(look, pose, false);
  const L = layout(look, pose);
  const w = 14;
  const h = 13;
  const g = grid(w, h);
  const y0 = L.headTop - 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(g, x, y, get(src, x + 1, y0 + y));
  return toSprite(g);
}
