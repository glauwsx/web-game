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

const geo = {};
function g() {
  if (geo.ready) return geo;
  geo.torso = new THREE.CylinderGeometry(0.235, 0.185, L.torso, 6, 1);
  geo.torso.translate(0, L.torso / 2, 0);
  geo.trim = new THREE.CylinderGeometry(0.235, 0.235, 0.05, 6, 1, true);
  geo.shorts = new THREE.CylinderGeometry(0.205, 0.235, 0.32, 6, 1);
  geo.shorts.translate(0, -0.08, 0);
  geo.stripe = new THREE.BoxGeometry(0.03, 0.29, 0.03);
  geo.head = new THREE.IcosahedronGeometry(0.13, 1);
  geo.hairCap = new THREE.SphereGeometry(0.132, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
  geo.hairAfro = new THREE.IcosahedronGeometry(0.155, 0);
  geo.neck = new THREE.CylinderGeometry(0.06, 0.065, 0.12, 6);
  geo.upper = new THREE.CylinderGeometry(0.072, 0.06, L.upper, 6);
  geo.upper.translate(0, -L.upper / 2, 0);
  geo.fore = new THREE.CylinderGeometry(0.058, 0.048, L.fore, 6);
  geo.fore.translate(0, -L.fore / 2, 0);
  geo.hand = new THREE.IcosahedronGeometry(0.058, 0);
  geo.thigh = new THREE.CylinderGeometry(0.1, 0.075, L.thigh, 6);
  geo.thigh.translate(0, -L.thigh / 2, 0);
  geo.shin = new THREE.CylinderGeometry(0.072, 0.054, L.shin, 6);
  geo.shin.translate(0, -L.shin / 2, 0);
  geo.sock = new THREE.CylinderGeometry(0.058, 0.056, 0.16, 6);
  geo.sock.translate(0, -L.shin + 0.1, 0);
  geo.shoe = new THREE.BoxGeometry(0.29, 0.085, 0.13);
  geo.shoe.translate(0.05, -L.shin - L.shoe / 2 + 0.01, 0);
  geo.number = new THREE.PlaneGeometry(0.25, 0.25);
  geo.ready = true;
  return geo;
}

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.72, metalness: 0.02, flatShading: true }, opts)));
  }
  return matCache.get(key);
}

export class PlayerModel {
  constructor(player, kit) {
    const G = g();
    this.player = player;
    const h = hashString(player.name);
    const skin = mat(SKIN[h % SKIN.length]);
    const hairCol = mat(HAIR[(h >>> 4) % HAIR.length]);
    const jersey = mat(kit.jersey, { roughness: 0.62 });
    const trim = mat(kit.trim);
    const shorts = mat(kit.shorts || kit.jersey, { roughness: 0.62 });
    const shoeCol = mat(((h >>> 8) & 1) ? '#f4f4f4' : kit.trim, { roughness: 0.5 });
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

    // 軀幹
    const torso = new THREE.Group();
    pelvis.add(torso);
    this.torso = torso;
    const tMesh = add(torso, G.torso, jersey);
    tMesh.scale.set(0.72, 1, 1);
    const neckTrim = add(torso, G.trim, trim, false);
    neckTrim.position.y = L.torso - 0.02;
    neckTrim.scale.set(0.76, 1, 1.02);
    // 號碼（前後）
    const numFront = new THREE.MeshStandardMaterial({ map: makeNumberTexture(player.number, kit.number, kit.trim), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const numBack = new THREE.MeshStandardMaterial({ map: makeNumberTexture(player.number, kit.number, kit.trim, player.name), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    this.numberMats = [numFront, numBack];
    const nf = new THREE.Mesh(G.number, numFront);
    nf.position.set(0.155, 0.36, 0);
    nf.rotation.y = Math.PI / 2;
    torso.add(nf);
    const nb = new THREE.Mesh(G.number, numBack);
    nb.position.set(-0.155, 0.37, 0);
    nb.rotation.y = -Math.PI / 2;
    nb.scale.setScalar(1.12);
    torso.add(nb);

    // 頭
    const neck = add(torso, G.neck, skin);
    neck.position.y = L.torso + 0.04;
    const head = new THREE.Group();
    head.position.y = L.headY + 0.02;
    torso.add(head);
    this.head = head;
    add(head, G.head, skin);
    const style = (h >>> 12) % 4;
    if (style === 0 || style === 1) {
      const cap = add(head, G.hairCap, hairCol);
      cap.position.y = 0.015;
      cap.rotation.z = -0.15;
    } else if (style === 2) {
      const af = add(head, G.hairAfro, hairCol);
      af.position.set(-0.02, 0.05, 0);
    }
    if (((h >>> 16) % 3) === 0) {
      // 頭帶
      const band = add(head, G.trim, trim, false);
      band.scale.set(0.66, 0.6, 0.66);
      band.position.y = 0.04;
    }

    // 手臂
    this.arms = [-1, 1].map((side) => {
      const sh = new THREE.Group();
      sh.position.set(0, L.shoulderY, side * L.shoulderZ);
      torso.add(sh);
      add(sh, G.upper, skin);
      const el = new THREE.Group();
      el.position.y = -L.upper;
      sh.add(el);
      add(el, G.fore, skin);
      const hand = add(el, G.hand, skin);
      hand.position.y = -L.fore - 0.03;
      return { sh, el, side };
    });

    // 短褲
    const sm = add(pelvis, G.shorts, shorts);
    sm.scale.set(0.78, 1, 1);
    for (const side of [-1, 1]) {
      const st = add(pelvis, G.stripe, trim, false);
      st.position.set(0, -0.08, side * 0.225);
    }

    // 腿
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(0, -0.02, side * L.hipZ);
      pelvis.add(hip);
      add(hip, G.thigh, skin);
      const knee = new THREE.Group();
      knee.position.y = -L.thigh;
      hip.add(knee);
      add(knee, G.shin, skin);
      add(knee, G.sock, sockCol);
      const ankle = new THREE.Group();
      knee.add(ankle);
      add(ankle, G.shoe, shoeCol);
      return { hip, knee, ankle, side };
    });

    this.spinAngle = 0;
    this.blend = { shoot: 0, arms: 0 };
  }

  dispose() {
    for (const m of this.numberMats) { m.map.dispose(); m.dispose(); }
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
