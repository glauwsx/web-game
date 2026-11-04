// Three.js 場景：球場、籃架、籃網、觀眾、球員、球與轉播鏡頭。
import * as THREE from 'three';
import { COURT, BALL_R } from '../sim/constants.js';
import { PlayerModel } from './playerModel.js';
import {
  makeCourtTexture, makeBallTexture, makeBoardTexture, DigitTexture, makeRibbonTexture,
  makeBannerTexture, makeLabelTexture, FLOOR_EXTENT,
} from './textures.js';
import { RNG, clamp, lerp } from '../sim/util.js';

const HUMAN_COLORS = ['#3fa9ff', '#ff5a5a', '#ffd23f', '#6dff8a'];

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0e15');
    this.scene.fog = new THREE.Fog('#0b0e15', 30, 62);
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 200);
    this.camera.position.set(0, 8.5, 17);
    this.cam = { x: 0, z: 17, y: 8.5, look: new THREE.Vector3(0, 1, 0), mode: 'broadcast', shake: 0 };
    this.models = new Map();
    this.time = 0;
    this.excite = 0;
    this.frameTimes = [];
    this.buildStatic();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setQuality(level) {
    // level 0..2：自動畫質
    const pr = [0.75, 1, Math.min(window.devicePixelRatio || 1, 2)][level];
    if (Math.abs(pr - this.pixelRatio) > 0.01) {
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
      this.resize();
    }
  }

  buildStatic() {
    const s = this.scene;
    const hemi = new THREE.HemisphereLight('#dfe8ff', '#3b2a1c', 1.0);
    s.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4e3', 2.3);
    sun.position.set(3, 22, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -17; sc.right = 17; sc.top = 11; sc.bottom = -11; sc.near = 5; sc.far = 45;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    s.add(sun);
    this.sun = sun;
    const fill = new THREE.DirectionalLight('#9fb7ff', 0.5);
    fill.position.set(-8, 10, -12);
    s.add(fill);

    // 場外地面
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ color: '#141821', roughness: 0.9 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.01;
    outer.receiveShadow = true;
    s.add(outer);

    this.ballTex = makeBallTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: this.ballTex, roughness: 0.65 }));
    this.ball.castShadow = true;
    s.add(this.ball);

    this.hoops = [1, -1].map((side) => this.buildHoop(side));
    this.buildArena();

    // 玩家指示圈
    this.rings = HUMAN_COLORS.map((col, i) => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }));
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.015;
      r.visible = false;
      s.add(r);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(`${i + 1}P`, col), depthTest: false, transparent: true }));
      label.scale.set(0.8, 0.4, 1);
      label.visible = false;
      label.renderOrder = 10;
      s.add(label);
      return { ring: r, label };
    });
    // 持球者的淡色圈
    this.handlerRing = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.46, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
    this.handlerRing.rotation.x = -Math.PI / 2;
    this.handlerRing.position.y = 0.012;
    s.add(this.handlerRing);
  }

  buildHoop(side) {
    const s = this.scene;
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: '#2a2e36', roughness: 0.5, metalness: 0.6 });
    const pad = new THREE.MeshStandardMaterial({ color: '#1f2b44', roughness: 0.8 });
    // 底座與支架（在底線外）
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 1.3), pad);
    base.position.set(side * (COURT.halfLength + 1.6), 0.55, 0);
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 0.22), steel);
    pole.position.set(side * (COURT.halfLength + 1.6), 2.4, 0);
    pole.castShadow = true;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.16), steel);
    arm.position.set(side * (COURT.boardX + 1.35), 3.75, 0);
    arm.rotation.z = side * 0.18;
    arm.castShadow = true;
    g.add(arm);
    // 籃板
    const boardMat = new THREE.MeshStandardMaterial({ map: makeBoardTexture(), transparent: true, opacity: 0.95, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.05), boardMat);
    board.position.set(side * (COURT.boardX + 0.02), (COURT.boardBottom + COURT.boardTop) / 2, 0);
    board.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 1.86), new THREE.MeshStandardMaterial({ color: '#c9ced8', roughness: 0.4, metalness: 0.5, transparent: true, opacity: 0.25 }));
    frame.position.copy(board.position);
    frame.position.x += side * 0.03;
    g.add(frame);
    // 籃板上的進攻計時器
    const digits = new DigitTexture(128, 64, '#ff3b30');
    const clockBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.6), new THREE.MeshStandardMaterial({ color: '#111' }));
    clockBox.position.set(side * (COURT.boardX + 0.12), COURT.boardTop + 0.2, 0);
    g.add(clockBox);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.28), new THREE.MeshBasicMaterial({ map: digits.tex }));
    face.position.set(side * (COURT.boardX + 0.02), COURT.boardTop + 0.2, 0);
    face.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(face);
    // 籃框
    const rimMat = new THREE.MeshStandardMaterial({ color: '#ff5a1f', roughness: 0.35, metalness: 0.6, emissive: '#3a0d00' });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(COURT.rimR + 0.01, 0.011, 8, 32), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(side * COURT.hoopX, COURT.rimY, 0);
    rim.castShadow = true;
    g.add(rim);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.12), rimMat);
    bracket.position.set(side * (COURT.hoopX + COURT.rimR + 0.07), COURT.rimY, 0);
    g.add(bracket);
    // 籃網
    const net = this.buildNet(side);
    g.add(net.lines);
    s.add(g);
    return { group: g, digits, net, side, rim };
  }

  buildNet(side) {
    const strands = 12, rings = 6;
    const pts = [];
    for (let r = 0; r < rings; r++) {
      for (let k = 0; k < strands; k++) pts.push(new THREE.Vector3());
    }
    const idx = [];
    for (let r = 0; r < rings - 1; r++) {
      for (let k = 0; k < strands; k++) {
        const a = r * strands + k;
        const b1 = (r + 1) * strands + k;
        const b2 = (r + 1) * strands + ((k + 1) % strands);
        idx.push(a, b1, a, b2);
      }
    }
    for (let k = 0; k < strands; k++) idx.push((rings - 1) * strands + k, (rings - 1) * strands + ((k + 1) % strands));
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(pts.length * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setIndex(idx);
    const lines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.9 }));
    lines.frustumCulled = false;
    const net = { lines, geom, pos, strands, rings, side, swish: 0, sway: 0, push: { x: 0, z: 0 } };
    this.updateNet(net, 0);
    return net;
  }

  updateNet(net, dt) {
    net.swish = Math.max(0, net.swish - dt * 1.6);
    const cx = net.side * COURT.hoopX;
    const t = this.time;
    for (let r = 0; r < net.rings; r++) {
      const f = r / (net.rings - 1);
      const radius = lerp(COURT.rimR + 0.005, 0.13, f);
      const y = COURT.rimY - f * 0.44 * (1 - net.swish * 0.25);
      const bulge = net.swish > 0 ? Math.sin((1 - net.swish) * Math.PI * 3 - f * 2.5) * 0.05 * net.swish * f : 0;
      const swayX = Math.sin(t * 2.1 + net.side) * 0.006 * f + net.push.x * f * net.swish;
      const swayZ = Math.cos(t * 1.7) * 0.006 * f + net.push.z * f * net.swish;
      for (let k = 0; k < net.strands; k++) {
        const a = (k / net.strands) * Math.PI * 2 + (r % 2) * (Math.PI / net.strands);
        const i = (r * net.strands + k) * 3;
        net.pos[i] = cx + Math.cos(a) * (radius + bulge) + swayX;
        net.pos[i + 1] = y;
        net.pos[i + 2] = Math.sin(a) * (radius + bulge) + swayZ;
      }
    }
    net.geom.attributes.position.needsUpdate = true;
  }

  buildArena() {
    const s = this.scene;
    const rng = new RNG(11);
    const standMat = new THREE.MeshStandardMaterial({ color: '#1b2030', roughness: 0.95 });
    // 看台階梯：遠端（-z）與兩端
    const tiers = 9;
    const tierGroups = [];
    const addStand = (cx, cz, w, rot, startDist) => {
      const grp = new THREE.Group();
      for (let i = 0; i < tiers; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(w, 0.45 + i * 0.55, 0.9), standMat);
        step.position.set(0, (0.45 + i * 0.55) / 2, -(startDist + i * 0.9));
        step.receiveShadow = false;
        grp.add(step);
      }
      grp.position.set(cx, 0, cz);
      grp.rotation.y = rot;
      s.add(grp);
      tierGroups.push({ grp, w, startDist });
    };
    addStand(0, -COURT.halfWidth - 2.2, 36, 0, 0);
    addStand(-COURT.halfLength - 3.6, -1.5, 19, Math.PI / 2, 0);
    addStand(COURT.halfLength + 3.6, -1.5, 19, -Math.PI / 2, 0);

    // 觀眾：InstancedMesh
    const bodyGeo = new THREE.BoxGeometry(0.42, 0.55, 0.3);
    bodyGeo.translate(0, 0.28, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.13, 0);
    headGeo.translate(0, 0.7, 0);
    const seats = [];
    for (const tg of tierGroups) {
      for (let i = 1; i < tiers; i++) {
        const n = Math.floor(tg.w / 0.62);
        for (let k = 0; k < n; k++) {
          if (rng.chance(0.12)) continue;
          const lx = -tg.w / 2 + 0.31 + k * 0.62 + rng.range(-0.08, 0.08);
          const ly = 0.45 + i * 0.55;
          const lz = -(tg.startDist + i * 0.9) + 0.1;
          const v = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), tg.grp.rotation.y);
          seats.push({ x: tg.grp.position.x + v.x, y: ly, z: tg.grp.position.z + v.z, rot: tg.grp.rotation.y, phase: rng.range(0, 6.28), amp: rng.range(0.6, 1.2) });
        }
      }
    }
    const n = seats.length;
    const bodyMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const headMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
    const heads = new THREE.InstancedMesh(headGeo, headMat, n);
    const palette = ['#c0392b', '#2c3e50', '#ecf0f1', '#f39c12', '#16a085', '#8e44ad', '#2980b9', '#7f8c8d', '#d35400', '#27ae60'];
    const skins = ['#f1c9a5', '#e0ac85', '#c98e62', '#8a5a3a', '#5c3a24'];
    const col = new THREE.Color();
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const st = seats[i];
      m.makeRotationY(st.rot);
      m.setPosition(st.x, st.y, st.z);
      bodies.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      bodies.setColorAt(i, col.set(palette[rng.int(0, palette.length - 1)]).multiplyScalar(0.42));
      heads.setColorAt(i, col.set(skins[rng.int(0, skins.length - 1)]).multiplyScalar(0.5));
    }
    bodies.frustumCulled = false; heads.frustumCulled = false;
    s.add(bodies); s.add(heads);
    this.crowd = { bodies, heads, seats, m };

    // 場邊 LED 廣告帶與屋頂燈
    this.ribbonMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 0.1), this.ribbonMat);
    ribbon.position.set(0, 0.6, -COURT.halfWidth - 2.0);
    s.add(ribbon);
    this.ribbon = ribbon;
    const lamp = new THREE.MeshBasicMaterial({ color: '#fff6dc' });
    for (let i = -3; i <= 3; i++) {
      for (const z of [-5, 5]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.6), lamp);
        l.position.set(i * 4.5, 16, z);
        s.add(l);
      }
    }
    // 計分台
    const table = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 0.7), new THREE.MeshStandardMaterial({ color: '#141922', roughness: 0.6 }));
    table.position.set(0, 0.4, -COURT.halfWidth - 1.3);
    table.castShadow = true;
    s.add(table);
    this.table = table;
    // 球隊板凳
    const benchMat = new THREE.MeshStandardMaterial({ color: '#2a3142', roughness: 0.8 });
    for (const sx of [-1, 1]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.45, 0.5), benchMat);
      bench.position.set(sx * 8.5, 0.23, -COURT.halfWidth - 1.4);
      s.add(bench);
    }
    this.banners = [];
  }

  // 一場比賽開始：建立地板、球員模型
  setupMatch(game) {
    const s = this.scene;
    for (const m of this.models.values()) { s.remove(m.root); m.dispose(); }
    this.models.clear();
    if (this.floor) { s.remove(this.floor); this.floor.material.map.dispose(); }
    const home = game.teams[0].data, away = game.teams[1].data;
    const tex = makeCourtTexture(home, away);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_EXTENT.x * 2, FLOOR_EXTENT.z * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.floor = floor;
    if (this.ribbonMat.map) this.ribbonMat.map.dispose();
    this.ribbonMat.map = makeRibbonTexture(home, away);
    this.ribbonMat.needsUpdate = true;
    for (const b of this.banners) s.remove(b);
    this.banners = [];
    [home, away].forEach((team, i) => {
      const bm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4), new THREE.MeshBasicMaterial({ map: makeBannerTexture(team) }));
      bm.position.set((i === 0 ? -1 : 1) * 9, 9.6, -COURT.halfWidth - 9.8);
      s.add(bm);
      this.banners.push(bm);
    });
    for (const t of game.teams) {
      const kit = t.data[t.kit];
      for (const p of t.players) {
        const m = new PlayerModel(p, kit);
        this.models.set(p, m);
        s.add(m.root);
        m.root.visible = p.onCourt;
      }
    }
    this.cam.x = 0;
    this.lastShot = [null, null];
  }

  onEvents(events, game) {
    for (const e of events) {
      if (e.type === 'score') {
        const hoop = this.hoops.find((h) => h.side === e.side);
        if (hoop) {
          hoop.net.swish = 1;
          hoop.net.push = { x: game.ball.vel.x * 0.02, z: game.ball.vel.z * 0.02 };
        }
        this.excite = Math.min(1.5, this.excite + (e.points === 3 || e.kind === 'dunk' ? 1.3 : 0.8));
        if (e.kind === 'dunk') this.cam.shake = 0.35;
      } else if (e.type === 'block' || e.type === 'steal') {
        this.excite = Math.min(1.5, this.excite + 0.6);
      } else if (e.type === 'rim') {
        const hoop = this.hoops.find((h) => h.side === e.side);
        if (hoop) hoop.net.swish = Math.max(hoop.net.swish, 0.35);
      }
    }
  }

  update(dt, game, opts = {}) {
    this.time += dt;
    const b = game.ball;
    // 球員
    for (const [p, m] of this.models) {
      m.root.visible = p.onCourt;
      if (p.onCourt) m.update(dt, game);
    }
    // 球
    this.ball.position.set(b.pos.x, b.pos.y, b.pos.z);
    if (b.state === 'held' && b.holder) {
      const sp = Math.hypot(b.holder.vel.x, b.holder.vel.z);
      this.ball.rotation.z -= sp * dt * 6;
    } else {
      this.ball.rotation.x += b.spin.x * dt;
      this.ball.rotation.z += b.spin.z * dt;
      this.ball.rotation.y += b.spin.y * dt;
    }
    // 籃網與計時器
    const r = game.rules;
    const scText = r.shotClockOff || game.phase === 'gameOver' ? '' : String(Math.ceil(Math.max(0, r.shotClock) - 1e-6));
    for (const h of this.hoops) {
      this.updateNet(h.net, dt);
      h.digits.set(scText);
    }
    // 玩家指示
    for (let i = 0; i < this.rings.length; i++) {
      const hm = game.humans[i];
      const ri = this.rings[i];
      const p = hm && hm.player;
      const vis = !!(p && p.onCourt && game.phase !== 'gameOver');
      ri.ring.visible = vis;
      ri.label.visible = vis;
      if (vis) {
        const m = this.models.get(p);
        ri.ring.position.x = p.pos.x; ri.ring.position.z = p.pos.z;
        ri.ring.material.color.set(HUMAN_COLORS[hm.slot % HUMAN_COLORS.length]);
        ri.label.position.set(p.pos.x, p.y + p.height * 1.18 + 0.25, p.pos.z);
        void m;
      }
    }
    const hd = b.holder;
    this.handlerRing.visible = !!(hd && !hd.human && game.phase !== 'gameOver');
    if (hd) { this.handlerRing.position.x = hd.pos.x; this.handlerRing.position.z = hd.pos.z; }

    // 觀眾
    this.excite = Math.max(0, this.excite - dt * 0.35);
    const cr = this.crowd;
    if (this.excite > 0.02 || !cr.settled) {
      const n = cr.seats.length;
      const m = cr.m;
      for (let i = 0; i < n; i++) {
        const st = cr.seats[i];
        const jump = Math.max(0, Math.sin(this.time * 9 * st.amp + st.phase)) * 0.22 * Math.min(1, this.excite) * st.amp;
        m.makeRotationY(st.rot);
        m.setPosition(st.x, st.y + jump, st.z);
        cr.bodies.setMatrixAt(i, m);
        cr.heads.setMatrixAt(i, m);
      }
      cr.bodies.instanceMatrix.needsUpdate = true;
      cr.heads.instanceMatrix.needsUpdate = true;
      cr.settled = this.excite <= 0.02;
    }
    if (this.ribbonMat.map) this.ribbonMat.map.offset.x = (this.time * 0.03) % 1;

    this.updateCamera(dt, game, opts);
  }

  updateCamera(dt, game, opts) {
    const b = game.ball;
    const c = this.cam;
    let tx = b.pos.x * 0.86 + b.vel.x * 0.25;
    let tz = 17.4, ty = 8.5, lookY = 0.7, lookZ = -0.4;
    if (game.phase === 'freethrow') {
      const side = game.pd.side || 1;
      tx = side * 8.2; tz = 12.5; ty = 6.2; lookZ = -0.3;
    }
    if (opts.cameraMode === 'close') { tz = 15.0; ty = 7.2; }
    tx = clamp(tx, -8.2, 8.2);
    const k = 1 - Math.exp(-dt * 2.6);
    c.x += (tx - c.x) * k;
    c.z += (tz - c.z) * k;
    c.y += (ty - c.y) * k;
    c.shake = Math.max(0, c.shake - dt);
    const sh = c.shake > 0 ? (Math.random() - 0.5) * c.shake * 0.25 : 0;
    this.camera.position.set(c.x + sh, c.y + sh, c.z);
    c.look.set(c.x * 1.04, lookY, lookZ);
    this.camera.lookAt(c.look);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // 世界座標轉螢幕座標（給 HUD 用）
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 };
  }
}
