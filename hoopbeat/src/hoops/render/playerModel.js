// 風格化低多邊形球員：所有動作（跑、運球、投籃、跳、防守姿勢）都用程式計算。
import * as THREE from 'three';
import { makeNumberTexture } from './textures.js';
import { hashString, clamp, lerp } from '../sim/util.js';

const REF_H = 2.0; // 模型以 2 公尺為基準，再依身高縮放
const L = {
  hipY: 1.02, thigh: 0.5, shin: 0.47, shoe: 0.06,
  torso: 0.62, shoulderY: 0.56, shoulderZ: 0.27, hipZ: 0.115,
  upper: 0.33, fore: 0.31, headY: 0.8,
};

const SKIN = ['#f1c9a5', '#e0ac85', '#c98e62', '#a8714b', '#8a5a3a', '#6b4329', '#4e301e'];
const HAIR = ['#1b1410', '#2b1d14', '#4a3020', '#0e0e0e', '#6b4a2b', '#151515'];

// HOOPBEAT: 球員外型改成 2000 年前後籃球遊戲的感覺：
// 低面數但平滑打光、寬肩窄腰的背心球衣、過膝的寬鬆短褲、貼圖畫出來的臉、連指手套一樣的手、厚底高筒鞋。
// 骨架（pelvis／torso／head／arms／legs）和原本一樣，所以動作程式不用改。
const geo = {};
function g() {
  if (geo.ready) return geo;
  const cyl = (rt, rb, h, y, open = false) => {
    const c = new THREE.CylinderGeometry(rt, rb, h, 8, 1, open);
    c.translate(0, y, 0);
    return c;
  };
  // 軀幹：腰 → 胸變寬，胸 → 肩再收一點
  geo.torsoLow = cyl(0.25, 0.2, 0.44, 0.22);
  geo.torsoUp = cyl(0.215, 0.25, 0.18, 0.53);
  geo.traps = cyl(0.062, 0.2, 0.075, 0.655);
  geo.collar = cyl(0.218, 0.218, 0.035, 0.61, true);
  geo.hem = cyl(0.204, 0.202, 0.035, 0.02, true);
  geo.shoulder = new THREE.SphereGeometry(0.088, 8, 6);
  geo.neck = cyl(0.058, 0.066, 0.13, 0);
  // 頭：UV 球，臉畫在貼圖上（u = 0.5 是正前方）
  geo.head = new THREE.SphereGeometry(0.125, 12, 9);
  geo.head.scale(1.0, 1.2, 0.88);
  geo.ear = new THREE.BoxGeometry(0.035, 0.05, 0.02);
  geo.flatTop = new THREE.CylinderGeometry(0.108, 0.112, 0.075, 8);
  geo.flatTop.scale(1, 1, 0.9);
  geo.afro = new THREE.SphereGeometry(0.158, 8, 6);
  // 手臂
  geo.upper = cyl(0.074, 0.056, L.upper, -L.upper / 2);
  geo.elbow = new THREE.SphereGeometry(0.056, 6, 5);
  geo.fore = cyl(0.057, 0.043, L.fore, -L.fore / 2);
  geo.band = cyl(0.05, 0.048, 0.06, -L.fore + 0.05);
  geo.hand = new THREE.BoxGeometry(0.075, 0.115, 0.05);
  geo.hand.translate(0.008, -L.fore - 0.045, 0);
  // 短褲：骨盆一段 + 兩條跟著大腿動的褲管，長度到膝蓋上面
  geo.shortsTop = cyl(0.212, 0.238, 0.22, -0.07);
  geo.waist = cyl(0.214, 0.214, 0.035, 0.035, true);
  geo.shortLeg = cyl(0.118, 0.134, 0.43, -0.165);
  geo.shortHem = cyl(0.136, 0.136, 0.03, -0.37, true);
  geo.stripe = new THREE.BoxGeometry(0.035, 0.34, 0.02);
  // 腿
  geo.thigh = cyl(0.098, 0.072, L.thigh, -L.thigh / 2);
  geo.knee = new THREE.SphereGeometry(0.07, 6, 5);
  geo.shin = cyl(0.074, 0.05, L.shin, -L.shin / 2);
  geo.sock = cyl(0.062, 0.054, 0.2, -L.shin + 0.1);
  // 鞋（原點在腳踝）
  geo.shoe = new THREE.BoxGeometry(0.3, 0.095, 0.13);
  geo.shoe.translate(0.06, -0.012, 0);
  geo.sole = new THREE.BoxGeometry(0.315, 0.03, 0.138);
  geo.sole.translate(0.06, -0.068, 0);
  geo.ankleCuff = cyl(0.062, 0.066, 0.07, 0.045);
  geo.number = new THREE.PlaneGeometry(0.25, 0.25);
  geo.ready = true;
  return geo;
}

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial(Object.assign({ color }, opts)));
  return matCache.get(key);
}

function shade(hex, k) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return `#${c.getHexString()}`;
}

// 臉的貼圖（128×64，故意做小，放大後有那個年代的糊糊質感）。回傳 { tex, style }
function makeFaceTexture(h, skinHex, hairHex, bandHex) {
  const W = 128, H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = skinHex;
  x.fillRect(0, 0, W, H);
  // 下巴、臉頰的陰影
  const sh = x.createLinearGradient(0, 30, 0, H);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.28)');
  x.fillStyle = sh;
  x.fillRect(0, 30, W, H - 30);
  const style = (h >>> 12) % 5; // 0 平頭 1 光頭 2 平頂 3 爆炸頭 4 旁分短髮
  const dark = shade(skinHex, 0.45);
  if (style !== 1) {
    x.fillStyle = hairHex;
    x.fillRect(0, 0, W, 15); // 頭頂
    x.fillRect(0, 0, 30, 37); // 後腦（u 的兩端）
    x.fillRect(98, 0, 30, 37);
    x.fillRect(30, 15, 5, 12); // 鬢角
    x.fillRect(93, 15, 5, 12);
    if (style === 4) { x.beginPath(); x.moveTo(35, 15); x.lineTo(70, 15); x.lineTo(40, 21); x.fill(); }
    else { x.beginPath(); x.moveTo(35, 15); x.lineTo(46, 15); x.lineTo(35, 20); x.fill(); x.beginPath(); x.moveTo(93, 15); x.lineTo(82, 15); x.lineTo(93, 20); x.fill(); }
  } else {
    x.fillStyle = 'rgba(255,255,255,0.10)';
    x.fillRect(40, 2, 48, 10); // 光頭的反光
  }
  // 眉毛、眼睛
  for (const s of [-1, 1]) {
    const ex = 64 + s * 9;
    x.fillStyle = style === 1 ? dark : hairHex;
    x.fillRect(ex - 5, 25, 10, 2);
    x.fillStyle = 'rgba(0,0,0,0.3)';
    x.fillRect(ex - 4, 28, 8, 1); // 上眼線
    x.fillStyle = '#e9e2d6';
    x.beginPath(); x.ellipse(ex, 30.5, 3.6, 1.7, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1a120c';
    x.beginPath(); x.arc(ex - s * 0.5, 30.5, 1.6, 0, Math.PI * 2); x.fill();
  }
  // 鼻子、嘴
  x.fillStyle = 'rgba(0,0,0,0.22)';
  x.fillRect(62, 31, 1, 9);
  x.fillRect(60, 40, 8, 2);
  x.fillStyle = 'rgba(255,255,255,0.12)';
  x.fillRect(63, 31, 2, 9);
  x.fillStyle = shade(skinHex, 0.55);
  x.fillRect(58, 46, 12, 2);
  x.fillStyle = 'rgba(0,0,0,0.15)';
  x.fillRect(59, 49, 10, 1);
  // 鬍子
  const beard = (h >>> 20) % 4;
  x.fillStyle = hairHex;
  if (beard === 1) { x.fillRect(57, 43, 14, 2); x.fillRect(57, 45, 2, 6); x.fillRect(69, 45, 2, 6); x.fillRect(57, 50, 14, 5); }
  else if (beard === 2) x.fillRect(58, 43, 12, 2);
  // 頭帶
  if (((h >>> 16) % 3) === 0) {
    x.fillStyle = bandHex;
    x.fillRect(0, 16, W, 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { tex, style };
}

export class PlayerModel {
  constructor(player, kit) {
    const G = g();
    this.player = player;
    const h = hashString(player.name);
    const skinHex = SKIN[h % SKIN.length];
    const hairHex = HAIR[(h >>> 4) % HAIR.length];
    const skin = mat(skinHex);
    const hairCol = mat(hairHex);
    const jersey = mat(kit.jersey);
    const trim = mat(kit.trim);
    const shorts = mat(kit.shorts || kit.jersey);
    const shoeCol = mat(((h >>> 8) & 1) ? '#f4f4f4' : '#1c1c22');
    const shoeAccent = mat(kit.trim);
    const sockCol = mat('#f6f6f6');

    const root = new THREE.Group();
    this.root = root;
    const body = new THREE.Group();
    root.add(body);
    this.body = body;
    this.scale = player.height / REF_H;
    // 體型：中鋒、大前鋒比較壯
    const build = { PG: 0.97, SG: 1.0, SF: 1.04, PF: 1.1, C: 1.14 }[player.pos0] || 1;
    body.scale.set(this.scale * build, this.scale, this.scale * build);

    const pelvis = new THREE.Group();
    pelvis.position.y = L.hipY;
    body.add(pelvis);
    this.pelvis = pelvis;

    const add = (parent, geom, material, cast = true) => {
      const m = new THREE.Mesh(geom, material);
      m.castShadow = cast;
      m.receiveShadow = false;
      parent.add(m);
      return m;
    };
    const DEPTH = 0.62; // 身體前後比左右薄

    // 軀幹（背心球衣，露出肩膀和斜方肌）
    const torso = new THREE.Group();
    pelvis.add(torso);
    this.torso = torso;
    for (const [geom, m, cast] of [[G.torsoLow, jersey, true], [G.torsoUp, jersey, true], [G.traps, skin, false], [G.collar, trim, false], [G.hem, trim, false]]) {
      add(torso, geom, m, cast).scale.set(DEPTH, 1, 1);
    }
    // 號碼（前後）
    const numFront = new THREE.MeshLambertMaterial({ map: makeNumberTexture(player.number, kit.number, kit.trim), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    const numBack = new THREE.MeshLambertMaterial({ map: makeNumberTexture(player.number, kit.number, kit.trim, player.name), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    this.numberMats = [numFront, numBack];
    const nf = new THREE.Mesh(G.number, numFront);
    nf.position.set(0.158, 0.36, 0);
    nf.rotation.y = Math.PI / 2;
    torso.add(nf);
    const nb = new THREE.Mesh(G.number, numBack);
    nb.position.set(-0.158, 0.37, 0);
    nb.rotation.y = -Math.PI / 2;
    nb.scale.setScalar(1.12);
    torso.add(nb);

    // 頭
    const neck = add(torso, G.neck, skin, false);
    neck.position.y = L.torso + 0.075;
    const head = new THREE.Group();
    head.position.y = L.headY + 0.03;
    torso.add(head);
    this.head = head;
    const face = makeFaceTexture(h, skinHex, hairHex, kit.trim);
    this.faceMat = new THREE.MeshLambertMaterial({ map: face.tex });
    add(head, G.head, this.faceMat);
    for (const side of [-1, 1]) add(head, G.ear, skin, false).position.set(-0.005, -0.005, side * 0.112);
    if (face.style === 2) add(head, G.flatTop, hairCol).position.set(-0.005, 0.135, 0);
    else if (face.style === 3) add(head, G.afro, hairCol).position.set(-0.03, 0.055, 0);

    // 手臂
    const bandArm = (h >>> 9) % 3; // 0 沒有護腕 1 左手 2 兩手
    this.arms = [-1, 1].map((side) => {
      const sh = new THREE.Group();
      sh.position.set(0, L.shoulderY, side * L.shoulderZ);
      torso.add(sh);
      add(sh, G.shoulder, skin);
      add(sh, G.upper, skin);
      const el = new THREE.Group();
      el.position.y = -L.upper;
      sh.add(el);
      add(el, G.elbow, skin, false);
      add(el, G.fore, skin);
      if (bandArm === 2 || (bandArm === 1 && side < 0)) add(el, G.band, sockCol, false);
      add(el, G.hand, skin);
      return { sh, el, side };
    });

    // 短褲
    add(pelvis, G.shortsTop, shorts).scale.set(0.7, 1, 1);
    add(pelvis, G.waist, trim, false).scale.set(0.7, 1, 1);

    // 腿
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(0, -0.02, side * L.hipZ);
      pelvis.add(hip);
      add(hip, G.shortLeg, shorts);
      add(hip, G.shortHem, trim, false);
      add(hip, G.stripe, trim, false).position.set(0, -0.19, side * 0.131);
      add(hip, G.thigh, skin);
      const knee = new THREE.Group();
      knee.position.y = -L.thigh;
      hip.add(knee);
      add(knee, G.knee, skin, false);
      add(knee, G.shin, skin);
      add(knee, G.sock, sockCol);
      const ankle = new THREE.Group();
      ankle.position.y = -L.shin;
      knee.add(ankle);
      add(ankle, G.shoe, shoeCol);
      add(ankle, G.sole, shoeAccent, false);
      add(ankle, G.ankleCuff, shoeCol, false);
      return { hip, knee, ankle, side };
    });

    this.spinAngle = 0;
    this.blend = { shoot: 0, arms: 0 };
  }

  dispose() {
    for (const m of this.numberMats) { m.map.dispose(); m.dispose(); }
    this.faceMat.map.dispose(); this.faceMat.dispose(); // HOOPBEAT
  }

  // 依模擬狀態擺姿勢
  update(dt, game) {
    const p = this.player;
    const a = p.action;
    const an = p.anim;
    const b = game.ball;
    const hasBall = b.holder === p;
    this.root.position.set(p.pos.x, p.y, p.pos.z);

    // 轉身過人：整個人轉一圈
    if (a && a.type === 'move' && a.kind === 'spin') {
      this.spinAngle = -Math.PI * 2 * clamp(a.t / a.dur, 0, 1) * (an.dribbleHand || 1);
    } else this.spinAngle *= 0.7;
    this.root.rotation.y = -p.facing + this.spinAngle;

    const sp = an.speed;
    const run = clamp(sp / 6, 0, 1);
    const ph = an.runPhase;
    const s = Math.sin(ph), c = Math.cos(ph);
    const stance = an.stance;

    // 預設：跑步循環
    const amp = 0.58 * run;
    let hipL = s * amp + 0.08 * run, hipR = -s * amp + 0.08 * run;
    let kneeL = -(0.12 + 1.05 * Math.max(0, -c)) * run - 0.06;
    let kneeR = -(0.12 + 1.05 * Math.max(0, c)) * run - 0.06;
    let lean = an.lean * 0.3 + run * 0.08;
    let shL = -s * amp * 0.9, shR = s * amp * 0.9;
    let elL = 0.35 + run * 1.0, elR = 0.35 + run * 1.0;
    let abL = 0.08, abR = 0.08;
    let headTilt = 0;
    let bob = Math.abs(Math.sin(ph)) * 0.05 * run;

    // 防守姿勢
    if (stance > 0.01) {
      const k = stance;
      hipL = lerp(hipL, 0.48 + s * 0.12 * run, k);
      hipR = lerp(hipR, 0.48 - s * 0.12 * run, k);
      kneeL = lerp(kneeL, -0.9, k); kneeR = lerp(kneeR, -0.9, k);
      lean = lerp(lean, 0.32, k);
      shL = lerp(shL, 0.7, k); shR = lerp(shR, 0.7, k);
      abL = lerp(abL, 0.55, k); abR = lerp(abR, 0.55, k);
      elL = lerp(elL, 0.75, k); elR = lerp(elR, 0.75, k);
    }

    // 持球運球
    if (hasBall && !a && game.phase !== 'freethrow') {
      const hand = an.dribbleHand || 1;
      const dp = an.dribblePhase;
      const push = an.dribbling ? Math.cos(dp * Math.PI * 2) : 0;
      if (an.dribbling) {
        const sh = 0.55 + push * 0.25, el = 0.55 - push * 0.35;
        if (hand > 0) { shR = sh; elR = el; abR = 0.25; } else { shL = sh; elL = el; abL = 0.25; }
        lean += 0.12;
      } else {
        shL = shR = 0.9; elL = elR = 1.25; abL = abR = 0.05;
      }
    }

    if (a) {
      const t = a.t;
      switch (a.type) {
        case 'shot': {
          if (a.kind === 'jump' || a.kind === 'ft') {
            const g0 = a.gather || 0.15;
            const up = clamp(t / (g0 + 0.1), 0, 1);
            const rel = a.released ? clamp((t - (a.releaseT || t)) / 0.12, 0, 1) : 0;
            shR = lerp(1.0, 2.75, up); shL = lerp(1.0, 2.45, up);
            elR = lerp(1.3, 1.6, up) * (1 - rel) + 0.15 * rel;
            elL = lerp(1.3, 1.4, up) * (1 - rel * 0.5);
            abL = 0.25; abR = 0.05;
            const crouch = t < g0 ? Math.sin((t / g0) * Math.PI) : 0;
            hipL = hipR = 0.35 * crouch + (p.airborne ? 0.15 : 0);
            kneeL = kneeR = -0.7 * crouch - (p.airborne ? 0.2 : 0);
            lean = -0.05;
            headTilt = -0.15;
          } else if (a.kind === 'layup') {
            const k = clamp(t / 0.3, 0, 1);
            shR = lerp(1.0, 2.9, k); elR = lerp(1.2, 0.2, k); abR = 0.1;
            shL = lerp(1.0, 1.6, k); elL = 0.9; abL = 0.3;
            hipL = 1.25 * k; kneeL = -1.5 * k;
            hipR = -0.15 * k; kneeR = -0.15;
            lean = 0.05;
          } else if (a.kind === 'dunk') {
            const k = clamp(t / 0.25, 0, 1);
            shR = shL = lerp(1.2, 3.0, k);
            elR = elL = lerp(1.2, 0.35, k);
            abL = abR = 0.15;
            hipL = 0.6 * k; kneeL = -1.1 * k; hipR = 0.2; kneeR = -0.5 * k;
            if (a.released && a.hang > 0) { shR = shL = 3.05; elR = elL = 0.1; hipL = hipR = 0.25; kneeL = kneeR = -0.6; }
            lean = 0.1;
          }
          break;
        }
        case 'pass': {
          const k = Math.sin(clamp(t / a.dur, 0, 1) * Math.PI);
          shL = shR = lerp(0.9, 1.55, k); elL = elR = lerp(1.2, 0.1, k); abL = abR = 0.1;
          break;
        }
        case 'steal': {
          const k = Math.sin(clamp(t / a.dur, 0, 1) * Math.PI);
          shR = lerp(shR, 1.25, k); elR = lerp(elR, 0.1, k); abR = 0.15;
          lean = lerp(lean, 0.6, k);
          break;
        }
        case 'jump':
        case 'alley': {
          shL = shR = 3.0; elL = elR = 0.12; abL = abR = 0.22;
          hipL = hipR = 0.25; kneeL = kneeR = -0.45;
          lean = 0.0;
          if (a.type === 'alley' && a.caught) { shL = shR = 3.1; }
          break;
        }
        case 'move': {
          const k = clamp(t / a.dur, 0, 1);
          lean = 0.35;
          // HOOPBEAT: 右搖桿運球的三種新動作
          if (a.kind === 'stepback') { lean = -0.1; hipL = 0.5 * Math.sin(k * Math.PI); kneeL = -0.7 * Math.sin(k * Math.PI); hipR = -0.35 * Math.sin(k * Math.PI); }
          else if (a.kind === 'hesi') { lean = k < 0.4 ? -0.02 : 0.42; if (k < 0.4) { hipL = hipR = 0.25; kneeL = kneeR = -0.5; } }
          else if (a.kind === 'inout') {
            const hand = an.dribbleHand || 1;
            const sw = Math.sin(k * Math.PI);
            if (hand > 0) { shR = 0.55; elR = 0.6; abR = 0.25 - sw * 0.5; } else { shL = 0.55; elL = 0.6; abL = 0.25 - sw * 0.5; }
          }
          if (a.kind === 'cross') {
            const hand = an.dribbleHand || 1;
            const sw = Math.sin(k * Math.PI);
            if (hand > 0) { shR = 0.5; elR = 0.7 - sw * 0.4; abR = 0.25 + sw * 0.5; } else { shL = 0.5; elL = 0.7 - sw * 0.4; abL = 0.25 + sw * 0.5; }
          }
          break;
        }
        case 'stumble': {
          const k = Math.sin(clamp(t / a.dur, 0, 1) * Math.PI);
          lean = -0.45 * k - (a.fall ? 0.25 * k : 0);
          abL = abR = 1.3 * k;
          shL = shR = 0.6;
          hipL = 0.4 * k; kneeL = -0.9 * k; hipR = -0.25 * k; kneeR = -0.3;
          bob -= a.fall ? 0.25 * k : 0.08 * k;
          break;
        }
        case 'land': {
          const k = Math.sin(clamp(t / a.dur, 0, 1) * Math.PI);
          hipL = hipR = 0.5 * k; kneeL = kneeR = -0.9 * k;
          break;
        }
        case 'inbound': {
          shL = shR = 2.2; elL = elR = 1.0; abL = abR = 0.1;
          break;
        }
        default:
          break;
      }
    } else if (p.airborne) {
      shL = shR = 2.9; elL = elR = 0.2; abL = abR = 0.2; hipL = hipR = 0.2; kneeL = kneeR = -0.5;
    }
    if (!a && hasBall && (game.phase === 'freethrow' || game.phase === 'inbound')) {
      shL = shR = 0.95; elL = elR = 1.3; abL = abR = 0.05;
    }
    if (an.celebrate > 0 && !hasBall && !a) {
      const k = Math.min(1, an.celebrate * 2);
      shR = lerp(shR, 2.9, k); elR = lerp(elR, 1.3, k); abR = lerp(abR, 0.4, k);
    }

    // 套用
    const [la, ra] = this.arms; // la: 左（-z），ra: 右（+z）
    la.sh.rotation.set(abL, 0, shL);
    la.el.rotation.set(0, 0, elL);
    ra.sh.rotation.set(-abR, 0, shR);
    ra.el.rotation.set(0, 0, elR);
    const [ll, rl] = this.legs;
    ll.hip.rotation.set(0.04, 0, hipL);
    ll.knee.rotation.set(0, 0, kneeL);
    ll.ankle.rotation.set(0, 0, -(hipL + kneeL) * 0.6);
    rl.hip.rotation.set(-0.04, 0, hipR);
    rl.knee.rotation.set(0, 0, kneeR);
    rl.ankle.rotation.set(0, 0, -(hipR + kneeR) * 0.6);
    this.torso.rotation.set(0, 0, -lean);
    this.head.rotation.set(0, 0, headTilt + lean * 0.5);

    // 骨盆高度：讓比較低的那隻腳踩在地上
    const legH = (hip, knee) => L.thigh * Math.cos(hip) + L.shin * Math.cos(hip + knee);
    const support = Math.max(legH(hipL, kneeL), legH(hipR, kneeR));
    this.pelvis.position.y = support + L.shoe + 0.02 + bob * (p.airborne ? 0 : 1);
  }
}
