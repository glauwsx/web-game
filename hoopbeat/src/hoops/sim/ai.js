// 電腦 AI：進攻拉開空間、空手切入、擋拆、快攻；防守人盯人加協防、卡位搶籃板。
import { COURT, GRAVITY } from './constants.js';
import { clamp, dist2, segmentDistance, angleTo } from './util.js';
import { evaluateShot, hoopOf, nearestDefenderDist, dunkRange } from './shooting.js';

// 進攻站位（以籃框為原點：a 往中場方向的距離，b 往邊線方向）
const SPOTS = {
  top: [7.7, 0], rslot: [7.1, 3.3], lslot: [7.1, -3.3],
  rwing: [5.0, 5.5], lwing: [5.0, -5.5], rcorner: [0.85, 6.95], lcorner: [0.85, -6.95],
  rblock: [1.3, 2.75], lblock: [1.3, -2.75], hpost: [4.5, 0.3], relbow: [4.3, 2.4], lelbow: [4.3, -2.4],
};
const ALL_SPOTS = Object.keys(SPOTS);
const PREFS = [
  ['top', 'rslot', 'lslot'],
  ['rwing', 'rcorner', 'rslot', 'lwing'],
  ['lwing', 'lcorner', 'lslot', 'rwing'],
  ['rcorner', 'relbow', 'rblock', 'lcorner'],
  ['lblock', 'rblock', 'hpost', 'lelbow'],
];
const ROLE_ORDER = [4, 3, 1, 2, 0];

export class TeamAI {
  constructor(game, team) {
    this.g = game;
    this.team = team;
    this.assign = new Map();
    this.spotAssign = new Map();
    this.spotTimer = 0;
    this.mirror = 1;
    this.transition = 0;
    this.pnr = null;
    this.pnrTimer = 6;
    this.helper = null;
    this.helperTimer = 0;
    this.switchTimer = 0;
    this.cutter = null;
  }

  get side() { return this.g.attackSide(this.team); }
  get defSide() { return this.g.attackSide(1 - this.team); }

  spotWorld(name) {
    const s = this.side;
    const [a, b] = SPOTS[name];
    return { x: s * COURT.hoopX - s * a, z: b * this.mirror };
  }
  frame(a, b) {
    const s = this.side;
    return { x: s * COURT.hoopX - s * a, z: b };
  }

  onPossessionChange(gained) {
    const rng = this.g.rng;
    if (gained) {
      this.transition = 4.5;
      this.mirror = rng.chance(0.5) ? 1 : -1;
      this.endPnR();
      this.pnrTimer = rng.range(4, 8);
      this.spotTimer = 0;
      this.cutter = null;
      for (const p of this.g.onCourt(this.team)) {
        p.ai.mode = null; p.ai.hold = 0; p.ai.screenSet = false; p.ai.holdLimit = rng.range(1.8, 3.6);
      }
    } else {
      this.transition = 4.0;
      this.helper = null;
      this.endPnR();
      this.reassignDefense();
      for (const p of this.g.onCourt(this.team)) { p.ai.mode = null; p.ai.screenSet = false; }
    }
  }

  onSubstitution(out, sub) {
    if (this.assign.has(out)) { this.assign.set(sub, this.assign.get(out)); this.assign.delete(out); }
    for (const [k, v] of this.assign) if (v === out) this.assign.set(k, sub);
    if (this.spotAssign.has(out)) { this.spotAssign.set(sub, this.spotAssign.get(out)); this.spotAssign.delete(out); }
    if (this.helper === out) this.helper = null;
    if (this.cutter === out) this.cutter = null;
    if (this.pnr && (this.pnr.screener === out || this.pnr.handler === out)) this.endPnR();
    // 對手的盯人表也要更新
    const opp = this.g.teams[1 - this.team].ai;
    for (const [k, v] of opp.assign) if (v === out) opp.assign.set(k, sub);
  }

  think(p, dt, mul = 1) {
    p.ai.think -= dt;
    if (p.ai.think <= 0) {
      p.ai.think = this.g.diff.reaction * mul * this.g.rng.range(0.65, 1.3);
      return true;
    }
    return false;
  }

  steer(p, tx, tz, o = {}) {
    if (!o.allowOut) {
      tx = clamp(tx, -13.55, 13.55);
      tz = clamp(tz, -7.05, 7.05);
    }
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const d = Math.hypot(dx, dz);
    const stop = o.stop ?? 0.15;
    let m = 0;
    if (d > stop) m = clamp(d / (o.slowRadius ?? 1.1), 0.22, 1);
    p.ctrl.mx = d > 1e-4 ? (dx / d) * m : 0;
    p.ctrl.mz = d > 1e-4 ? (dz / d) * m : 0;
    p.ctrl.sprint = !!o.sprint && d > 1.2;
    p.ctrl.stance = !!o.stance;
    p.ctrl.face = o.face ?? null;
    p.ai.target = { x: tx, z: tz };
  }

  stop(p, face = null) {
    p.ctrl.mx = 0; p.ctrl.mz = 0; p.ctrl.sprint = false; p.ctrl.stance = false; p.ctrl.face = face;
  }

  update(dt) {
    const g = this.g;
    const ph = g.phase;
    if (ph === 'tipoff' || ph === 'freethrow' || ph === 'periodBreak' || ph === 'gameOver' || ph === 'pregame') return;
    this.transition = Math.max(0, this.transition - dt);
    if (ph === 'dead') {
      for (const p of g.onCourt(this.team)) if (!p.human) this.stop(p, p.ctrl.face);
      return;
    }
    const offense = g.offenseTeam() === this.team;
    if (offense) this.offense(dt);
    else this.defense(dt);
  }

  // ======================= 進攻 =======================
  ballIsLoose() {
    const b = this.g.ball;
    if (b.state === 'loose') return true;
    if (b.state === 'flight' && !b.pass) {
      const s = b.shot;
      return !s || s.resolved || s.rimTouched || s.boardTouched || s.blocked;
    }
    return false;
  }

  offense(dt) {
    const g = this.g;
    const b = g.ball;
    const players = g.onCourt(this.team);
    const holder = b.holder && b.holder.team === this.team ? b.holder : null;
    this.spotTimer -= dt;
    if (this.spotTimer <= 0) { this.assignSpots(holder); this.spotTimer = 0.9; }
    this.updatePnR(dt, holder);
    const loose = this.ballIsLoose();
    const shotInAir = !!(b.shot && !b.shot.resolved && b.state !== 'held') && !loose;
    for (const p of players) {
      if (p.ai.alley) { this.alleyReceiver(p); continue; }
      if (p.human) continue;
      if (g.phase === 'inbound' || g.phase === 'afterScore') { this.inboundOffense(p); continue; }
      if (p === holder) { this.handler(p, dt); continue; }
      if (b.pass && b.pass.receiver === p) { this.receive(p); continue; }
      if (shotInAir) { this.offenseCrash(p); continue; }
      if (loose) { this.chaseLoose(p, dt, true); continue; }
      this.offBall(p, dt, holder);
    }
  }

  assignSpots(holder) {
    const players = this.g.onCourt(this.team).filter((p) => p !== holder);
    const taken = new Set();
    const ordered = players.slice().sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
    for (const p of ordered) {
      const prev = this.spotAssign.get(p);
      const valid = (name) => {
        if (!name || taken.has(name)) return false;
        if (holder) {
          const w = this.spotWorld(name);
          if (dist2(w.x, w.z, holder.pos.x, holder.pos.z) < 3.3) return false;
        }
        return true;
      };
      let chosen = valid(prev) && PREFS[p.role].includes(prev) ? prev : null;
      if (!chosen) for (const n of PREFS[p.role]) if (valid(n)) { chosen = n; break; }
      if (!chosen) for (const n of ALL_SPOTS) if (valid(n)) { chosen = n; break; }
      if (!chosen) chosen = PREFS[p.role][0];
      taken.add(chosen);
      this.spotAssign.set(p, chosen);
    }
  }

  spotFor(p) {
    const name = this.spotAssign.get(p) || PREFS[p.role][0];
    const w = this.spotWorld(name);
    // 小幅游走，讓站位看起來比較自然
    const t = this.g.time * 0.35 + p.id * 1.7;
    w.x += Math.sin(t) * 0.45;
    w.z += Math.cos(t * 0.8) * 0.45;
    return w;
  }

  handler(p, dt) {
    const g = this.g;
    const ai = p.ai;
    ai.hold += dt;
    if (p.action) {
      if (p.action.type === 'move' && ai.target) this.steer(p, ai.target.x, ai.target.z, { sprint: true });
      return;
    }
    const dm = g.beat ? g.beat.aiDecision(this.team) : 1; // HOOPBEAT: 急躁 → 想得快、出手早
    if (this.think(p, dt, (ai.mode === 'drive' ? 0.6 : 1) * dm)) this.handlerDecide(p);
    if (p.action || g.ball.holder !== p) return;
    const t = ai.target || this.spotFor(p);
    this.steer(p, t.x, t.z, { sprint: ai.sprint, stop: 0.3 });
  }

  handlerDecide(p) {
    const g = this.g;
    const ai = p.ai;
    const side = this.side;
    const hoop = hoopOf(side);
    const r = g.rules;
    const sc = r.shotClockOff ? 99 : r.shotClock;
    const gc = r.gameClock;
    const dHoop = dist2(p.pos.x, p.pos.z, hoop.x, hoop.z);
    const inBack = side * p.pos.x < 0.8;
    const ev = evaluateShot(g, p);
    const iq = p.ratingMul < 1 ? g.diff.shotIQ : 0.95;
    const urgent = sc < 3.2 || gc < 3.2;
    const rng = g.rng;

    // 1. 籃下終結
    if ((ev.d < 2.3 && ev.contest < 0.95) || ev.d < 1.3) { g.startShot(p); return; }
    // 2. 時間快到
    if (urgent && !inBack) {
      if (ev.d < 9.5 || gc < 1.6) { g.startShot(p); return; }
    }
    // 3. 隊友要球
    const req = g.passRequest;
    if (req && req.player.team === this.team && req.player !== p && g.time - req.time < 1.0) {
      g.passRequest = null;
      const rq = req.player;
      const rd = dist2(rq.pos.x, rq.pos.z, hoop.x, hoop.z);
      const kind = req.alley && rd < 4.5 && dunkRange(rq) > 0 ? 'alley' : 'chest';
      g.passBall(p, rq, { kind });
      return;
    }
    const opt = this.bestPassOption(p);
    // 4. 好的出手機會
    const tend = (ev.points === 3 ? (p.r.three - 75) : (p.r.mid - 72)) * 0.006;
    let thr = (ev.points === 3 ? 1.07 : 0.9) - tend - (1 - iq) * 0.35;
    const dm = g.beat ? g.beat.aiDecision(this.team) : 1; // HOOPBEAT
    if (g.beat) thr += g.beat.aiShotThresholdAdj(this.team); // HOOPBEAT: 慢歌挑好球、快歌亂投
    // 接球就投：剛接到球且有空檔時更積極
    if (ai.hold < 0.6 && ev.contest < 0.45) thr -= 0.08;
    if (sc < 8) thr -= 0.15;
    if (sc < 5) thr -= 0.15;
    if (this.transition > 0 && ev.points === 3) thr += 0.12;
    const tooContested = ev.contest > (ev.points === 3 ? 0.5 : 0.62) * (0.8 + 0.4 * iq) && sc > 6;
    if (!inBack && !tooContested && ev.ev > thr && ev.d < 8.6 && (!opt || opt.value < ev.ev + 0.3)) { g.startShot(p); return; }
    // 5. 傳球
    const pm = g.beat ? g.beat.aiPassMargin(this.team) : 0.22; // HOOPBEAT: 慢歌多傳導
    if (opt && ai.hold > 0.55 * dm && opt.value > Math.max(ev.ev, 0.75) + pm) { g.passBall(p, opt.target, { kind: opt.kind }); return; }
    if (opt && ai.hold > (ai.holdLimit || 2.6) * dm && opt.value > 0.6 && !inBack && rng.chance(0.5)) { g.passBall(p, opt.target, { kind: opt.kind }); ai.holdLimit = rng.range(2.4, 4.5); return; }
    // 6. 運球突破
    const near = this.nearestOpponent(p);
    const nd = near ? dist2(near.pos.x, near.pos.z, p.pos.x, p.pos.z) : 99;
    const lane = this.driveLane(p, hoop);
    const driveSkill = (p.r.inside + p.r.speed + p.r.handle) / 300;
    if (!inBack && dHoop < 10 && lane.open && rng.chance(0.35 + 0.5 * driveSkill)) {
      ai.mode = 'drive';
    } else if (ai.mode === 'drive' && !lane.open && nd < 1.4 && dHoop > 2.6) {
      // 被擋住：踩煞車或過人
      ai.mode = rng.chance(0.5) ? null : 'drive';
      if (ai.mode === 'drive' && p.moveCooldown <= 0 && rng.chance(0.4 * driveSkill + 0.15)) {
        this.tryDribbleMove(p, near, hoop);
        return;
      }
    }
    // 7. 被緊逼時過人
    if (!inBack && near && nd < 1.35 && p.moveCooldown <= 0 && rng.chance(0.18 * (p.r.handle / 100) + 0.04)) {
      this.tryDribbleMove(p, near, hoop);
      ai.mode = 'drive';
      return;
    }
    // 8. 移動目標
    const pn = this.pnr;
    if (ai.mode === 'drive') {
      const ux = (hoop.x - p.pos.x) / (dHoop || 1), uz = (hoop.z - p.pos.z) / (dHoop || 1);
      ai.target = { x: hoop.x - side * 0.9 + ux * 0.0, z: clamp(p.pos.z * 0.4, -1.5, 1.5) };
      if (dHoop > 3) ai.target = { x: p.pos.x + ux * 3, z: p.pos.z + uz * 3 };
      ai.sprint = true;
      if (dHoop < 6 && !lane.open && rng.chance(0.35)) ai.mode = null;
    } else if (pn && pn.handler === p && pn.state === 'set' && pn.t2 > 0.25) {
      const s = pn.screener;
      const ux = (hoop.x - s.pos.x), uz = (hoop.z - s.pos.z);
      const ul = Math.hypot(ux, uz) || 1;
      ai.target = { x: s.pos.x + (-uz / ul) * pn.sideSign * 1.2 + (ux / ul) * 1.6, z: s.pos.z + (ux / ul) * pn.sideSign * 1.2 + (uz / ul) * 1.6 };
      ai.sprint = true;
      ai.mode = 'pnr';
    } else if (inBack || this.transition > 0) {
      const ahead = this.fastBreakAdvantage(p);
      if (this.transition > 0 && ahead >= 1 && !inBack) { ai.mode = 'drive'; ai.target = { x: hoop.x - side * 1.2, z: 0 }; }
      else ai.target = this.frame(7.2, clamp(p.pos.z * 0.5, -3, 3));
      ai.sprint = this.transition > 0 || sc < 15;
    } else {
      if (ai.mode === 'pnr' && (!pn || pn.state !== 'set')) ai.mode = null;
      // 外圍持球：在自己的位置附近遊走試探
      const base = this.spotFor(p);
      if (!ai.probe || g.time > ai.probe.until) {
        ai.probe = { x: rng.range(-1.6, 1.6), z: rng.range(-1.6, 1.6), until: g.time + rng.range(0.8, 1.8) };
      }
      const pt = { x: (p.role === 0 ? this.frame(7.6, 0).x : base.x) + ai.probe.x, z: (p.role === 0 ? 0 : base.z) + ai.probe.z };
      // 不要跑到底角或邊線附近卡住
      ai.target = pt;
      ai.sprint = false;
    }
  }

  tryDribbleMove(p, def, hoop) {
    const ux = hoop.x - p.pos.x, uz = hoop.z - p.pos.z;
    const ul = Math.hypot(ux, uz) || 1;
    const sideSign = def ? Math.sign((def.pos.x - p.pos.x) * (-uz) + (def.pos.z - p.pos.z) * ux) || 1 : 1;
    // 往防守者的另一側切
    const dx = ux / ul * 0.7 + (uz / ul) * sideSign * 0.7;
    const dz = uz / ul * 0.7 - (ux / ul) * sideSign * 0.7;
    if (this.g.rng.chance(0.2)) this.g.dribbleMove(p, -ux / ul, -uz / ul); // 轉身
    else this.g.dribbleMove(p, dx, dz);
    p.ai.target = { x: p.pos.x + dx * 3, z: p.pos.z + dz * 3 };
  }

  fastBreakAdvantage(p) {
    const hoop = hoopOf(this.side);
    const dp = dist2(p.pos.x, p.pos.z, hoop.x, hoop.z);
    let att = 0, def = 0;
    for (const m of this.g.onCourt(this.team)) if (dist2(m.pos.x, m.pos.z, hoop.x, hoop.z) < dp + 1) att++;
    for (const d of this.g.onCourt(1 - this.team)) if (dist2(d.pos.x, d.pos.z, hoop.x, hoop.z) < dp + 0.5) def++;
    return att - def;
  }

  nearestOpponent(p) {
    let best = null, bd = 1e9;
    for (const o of this.g.onCourt(1 - p.team)) {
      const d = dist2(o.pos.x, o.pos.z, p.pos.x, p.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  driveLane(p, hoop) {
    let blocked = 0;
    for (const d of this.g.onCourt(1 - p.team)) {
      if (d.action && d.action.type === 'stumble') continue;
      const sd = segmentDistance(d.pos.x, d.pos.z, p.pos.x, p.pos.z, hoop.x, hoop.z);
      if (sd.t > 0.04 && sd.t < 0.92 && sd.d < 0.95) blocked++;
    }
    return { open: blocked === 0, blocked };
  }

  bestPassOption(p, includeAll = false) {
    const g = this.g;
    const hoop = hoopOf(this.side);
    let best = null;
    const opps = g.onCourt(1 - this.team);
    for (const m of g.onCourt(this.team)) {
      if (m === p) continue;
      if (m.action && (m.action.type === 'stumble' || m.action.type === 'inbound')) continue;
      const d = dist2(p.pos.x, p.pos.z, m.pos.x, m.pos.z);
      if (d > 17 || d < 1.2) continue;
      let risk = 0;
      for (const o of opps) {
        const sd = segmentDistance(o.pos.x, o.pos.z, p.pos.x, p.pos.z, m.pos.x, m.pos.z);
        if (sd.t > 0.06 && sd.t < 0.97 && sd.d < 1.3) risk += (1.3 - sd.d) * (0.6 + o.r.defense / 100);
      }
      const ev = evaluateShot(g, m);
      const open = nearestDefenderDist(g, m.team, m.pos.x, m.pos.z);
      let value = ev.ev * 0.95 + clamp(open - 1.5, 0, 3) * 0.05 - d * 0.012;
      const dh = dist2(m.pos.x, m.pos.z, hoop.x, hoop.z);
      if ((m.ai.mode === 'cut' || m.ai.mode === 'roll') && dh < 3.2 && open > 1.1) value += 0.25;
      if (m.human) value += 0.1;
      let kind = 'chest';
      let v = value - risk * 1.4;
      if (risk > 0.35 && d < 13) {
        const vl = value - risk * 0.25 - 0.12;
        if (vl > v) { v = vl; kind = 'lob'; }
      }
      if ((m.ai.mode === 'cut' || m.ai.mode === 'roll') && dh < 3.6 && dunkRange(m) > 0 && open > 0.9 && side_toward(m, hoop)) {
        const va = 1.35 + (m.r.inside - 70) * 0.01 - risk * 0.2;
        if (va > v && g.rng.chance(0.6)) { v = va; kind = 'alley'; }
      }
      if (!best || v > best.value) best = { target: m, value: v, kind };
    }
    if (includeAll) return best ? best.target : null;
    return best;
  }

  // 給人類球員按傳球但沒推搖桿時用
  bestPassTarget(p) {
    const o = this.bestPassOption(p);
    return o ? o.target : null;
  }

  offBall(p, dt, holder) {
    const g = this.g;
    const ai = p.ai;
    const hoop = hoopOf(this.side);
    const pn = this.pnr;
    const faceBall = angleTo(p.pos.x, p.pos.z, g.ball.pos.x, g.ball.pos.z);
    if (pn && pn.screener === p) { this.screenerAI(p, pn, hoop); return; }
    if (ai.mode === 'roll') {
      ai.rollT = (ai.rollT || 0) + dt;
      const t = this.frame(1.2, clamp(p.pos.z * 0.3, -1.2, 1.2));
      this.steer(p, t.x, t.z, { sprint: true, face: faceBall });
      if (ai.rollT > 2.4) { ai.mode = null; ai.rollT = 0; }
      return;
    }
    if (ai.mode === 'cut') {
      ai.cutT += dt;
      const t = ai.cutTarget;
      this.steer(p, t.x, t.z, { sprint: true, face: faceBall });
      const dt2 = dist2(p.pos.x, p.pos.z, t.x, t.z);
      if (ai.cutT > 2.2 || (dt2 < 0.5 && ai.cutT > 1.3)) {
        ai.mode = null;
        if (this.cutter === p) this.cutter = null;
        // 換到另一側
        const cur = this.spotAssign.get(p);
        if (cur) {
          const mirrorName = cur.startsWith('r') ? 'l' + cur.slice(1) : cur.startsWith('l') ? 'r' + cur.slice(1) : cur;
          this.spotAssign.set(p, mirrorName);
        }
      }
      return;
    }
    // 快攻：搶跑道
    if (this.transition > 0 && holder && this.side * holder.pos.x < 4) {
      const lanes = [[6.5, 0], [2.2, 5.6], [2.2, -5.6], [5.5, 3.0], [5.5, -3.0]];
      const L = lanes[p.role];
      const t = this.frame(L[0], L[1] * this.mirror);
      this.steer(p, t.x, t.z, { sprint: true, face: faceBall });
      return;
    }
    if (this.think(p, dt, 1.6)) {
      const dHoop = dist2(p.pos.x, p.pos.z, hoop.x, hoop.z);
      if (holder && !this.cutter && dHoop > 4.2 && g.phase === 'live') {
        const myDef = this.defenderOf(p);
        let overplay = false;
        if (myDef) {
          const dd = dist2(myDef.pos.x, myDef.pos.z, p.pos.x, p.pos.z);
          const defHoop = dist2(myDef.pos.x, myDef.pos.z, hoop.x, hoop.z);
          overplay = defHoop > dHoop - 0.2 || dd > 2.6;
        }
        const paintBusy = g.onCourt(this.team).some((m) => m !== p && dist2(m.pos.x, m.pos.z, hoop.x, hoop.z) < 2.6);
        const chance = (overplay ? 0.22 : 0.025) * (0.6 + p.r.inside / 150);
        if (!paintBusy && g.rng.chance(chance)) {
          ai.mode = 'cut';
          ai.cutT = 0;
          ai.cutTarget = this.frame(1.0, (p.pos.z > 0 ? 0.7 : -0.7));
          this.cutter = p;
          return;
        }
      }
    }
    const s = this.spotFor(p);
    this.steer(p, s.x, s.z, { sprint: dist2(p.pos.x, p.pos.z, s.x, s.z) > 4, face: faceBall, stop: 0.3 });
  }

  defenderOf(p) {
    const opp = this.g.teams[1 - this.team].ai;
    for (const [d, m] of opp.assign) if (m === p && d.onCourt) return d;
    return null;
  }

  receive(p) {
    const b = this.g.ball;
    const t = p.ai.catchTarget || p.pos;
    const face = angleTo(p.pos.x, p.pos.z, b.pos.x, b.pos.z);
    this.steer(p, t.x, t.z, { sprint: dist2(p.pos.x, p.pos.z, t.x, t.z) > 1.5, face, stop: 0.1, slowRadius: 0.6 });
  }

  alleyReceiver(p) {
    const g = this.g;
    const b = g.ball;
    if (!b.pass || b.pass.receiver !== p || b.pass.kind !== 'alley') {
      if (!(p.action && p.action.type === 'alley')) p.ai.alley = null;
      return;
    }
    const ps = b.pass;
    const t = ps.target;
    const hoop = hoopOf(this.side);
    this.steer(p, t.x + (p.pos.x - hoop.x) * 0.2, t.z + (p.pos.z - hoop.z) * 0.2, { sprint: true, face: angleTo(p.pos.x, p.pos.z, hoop.x, hoop.z), stop: 0.05, slowRadius: 0.5 });
    const remain = ps.start + ps.T - g.time;
    const jv = 3.9 + 0.6 * p.athletic;
    if (!p.airborne && remain <= jv / GRAVITY * 0.95 && !(p.action && p.action.lockMove)) g.alleyJump(p);
  }

  screenerAI(p, pn, hoop) {
    const h = pn.handler;
    const def = this.defenderOf(h) || this.nearestOpponent(h);
    if (pn.state === 'approach') {
      if (!def) { this.endPnR(); return; }
      const ux = hoop.x - h.pos.x, uz = hoop.z - h.pos.z;
      const ul = Math.hypot(ux, uz) || 1;
      const px = -uz / ul, pz = ux / ul;
      const sx = def.pos.x + px * pn.sideSign * 0.72 - (ux / ul) * 0.1;
      const sz = def.pos.z + pz * pn.sideSign * 0.72 - (uz / ul) * 0.1;
      this.steer(p, sx, sz, { sprint: true, stop: 0.2, face: angleTo(p.pos.x, p.pos.z, h.pos.x, h.pos.z) });
      if (dist2(p.pos.x, p.pos.z, sx, sz) < 0.5) { pn.state = 'set'; pn.t2 = 0; p.ai.screenSet = true; }
      if (pn.t > 4) this.endPnR();
    } else if (pn.state === 'set') {
      this.stop(p, angleTo(p.pos.x, p.pos.z, h.pos.x, h.pos.z));
      p.vel.x *= 0.8; p.vel.z *= 0.8;
    }
  }

  updatePnR(dt, holder) {
    const g = this.g;
    if (!holder || g.phase !== 'live') { if (this.pnr) this.endPnR(); return; }
    const hoop = hoopOf(this.side);
    if (!this.pnr) {
      if (this.transition > 0) return;
      this.pnrTimer -= dt;
      const dH = dist2(holder.pos.x, holder.pos.z, hoop.x, hoop.z);
      if (this.pnrTimer <= 0 && dH > 5.8 && dH < 10.5 && this.side * holder.pos.x > 1) {
        const bigs = g.onCourt(this.team).filter((p) => p !== holder && !p.human && p.role >= 3);
        if (!bigs.length) { this.pnrTimer = 3; return; }
        const s = bigs.reduce((a, b) => (dist2(b.pos.x, b.pos.z, holder.pos.x, holder.pos.z) < dist2(a.pos.x, a.pos.z, holder.pos.x, holder.pos.z) ? b : a));
        const z = holder.pos.z;
        const sideSign = Math.abs(z) > 0.8 ? (z > 0 ? -1 : 1) * this.side : (g.rng.chance(0.5) ? 1 : -1);
        this.pnr = { screener: s, handler: holder, state: 'approach', t: 0, t2: 0, sideSign };
        s.ai.mode = 'screen';
        this.pnrTimer = g.rng.range(7, 12);
      }
      return;
    }
    const pn = this.pnr;
    pn.t += dt;
    pn.t2 += dt;
    if (pn.handler !== holder) { this.endPnR(); return; }
    if (pn.state === 'set') {
      const s = pn.screener;
      const dS = dist2(s.pos.x, s.pos.z, hoop.x, hoop.z);
      const dH = dist2(holder.pos.x, holder.pos.z, hoop.x, hoop.z);
      if (pn.t2 > 2.0 || dH < dS - 0.6) {
        s.ai.screenSet = false;
        s.ai.mode = 'roll';
        s.ai.rollT = 0;
        this.pnr = null;
      }
    }
    if (pn.t > 7) this.endPnR();
  }

  endPnR() {
    if (this.pnr) {
      const s = this.pnr.screener;
      s.ai.screenSet = false;
      if (s.ai.mode === 'screen') s.ai.mode = null;
    }
    this.pnr = null;
  }

  offenseCrash(p) {
    const g = this.g;
    const hoop = hoopOf(this.side);
    const dHoop = dist2(p.pos.x, p.pos.z, hoop.x, hoop.z);
    const face = angleTo(p.pos.x, p.pos.z, hoop.x, hoop.z);
    if (p.role >= 3 || dHoop < 3.8 || (p.role === 2 && dHoop < 6)) {
      const ux = (p.pos.x - hoop.x) / (dHoop || 1), uz = (p.pos.z - hoop.z) / (dHoop || 1);
      this.steer(p, hoop.x + ux * 1.7, hoop.z + uz * 1.7, { face });
    } else {
      // 後衛退防
      const t = this.frame(9.5, clamp(p.pos.z * 0.4, -3, 3));
      this.steer(p, t.x, t.z, { face: angleTo(p.pos.x, p.pos.z, g.ball.pos.x, g.ball.pos.z) });
    }
  }

  inboundOffense(p) {
    const g = this.g;
    const pd = g.pd;
    const spot = pd.spot;
    if (g.phase === 'afterScore' && p === pd.inbounder) {
      this.steer(p, spot.x, spot.z, { sprint: true, allowOut: true, stop: 0.1 });
      return;
    }
    if (p === pd.inbounder) return;
    const faceBall = angleTo(p.pos.x, p.pos.z, spot.x, spot.z);
    const toward = { x: -Math.sign(spot.x || 1) * 1, z: -Math.sign(spot.z || 1) };
    const fromScore = pd.fromScore || g.phase === 'afterScore';
    if (fromScore) {
      const recv = g.onCourt(this.team).filter((m) => m !== pd.inbounder).sort((a, b) => a.role - b.role)[0];
      if (p === recv) {
        const tx = spot.x - Math.sign(spot.x) * 3.2;
        const tz = clamp(spot.z * 0.5 + (spot.z > 0 ? 1.8 : -1.8), -5, 5);
        this.steer(p, tx, tz, { face: faceBall, sprint: true });
      } else {
        // 往前場推進
        const lanes = [[7, 0], [5, 5], [5, -5], [7.5, 2.5], [7.5, -2.5]];
        const L = lanes[p.role];
        const t = this.frame(L[0] + 3, L[1] * this.mirror);
        this.steer(p, t.x, t.z, { sprint: true, face: faceBall });
      }
      return;
    }
    // 邊線／底線發球：最近的兩個人來接應
    const others = g.onCourt(this.team).filter((m) => m !== pd.inbounder);
    others.sort((a, b) => dist2(a.pos.x, a.pos.z, spot.x, spot.z) - dist2(b.pos.x, b.pos.z, spot.x, spot.z));
    const idx = others.indexOf(p);
    if (idx < 2) {
      const ang = Math.atan2(-spot.z, -spot.x * 0.2) + (idx === 0 ? 0.6 : -0.6) + Math.sin(g.time * 1.3 + p.id) * 0.3;
      const r = 3.2 + idx * 0.8;
      this.steer(p, spot.x + Math.cos(ang) * r, spot.z + Math.sin(ang) * r, { face: faceBall });
    } else {
      const s = this.spotFor(p);
      this.steer(p, s.x, s.z, { face: faceBall });
    }
    void toward;
  }

  chooseInboundTarget(ib, force) {
    const g = this.g;
    const mates = g.onCourt(this.team).filter((m) => m !== ib);
    for (const h of g.teams[this.team].humans) {
      const hp = h.player;
      if (hp && hp !== ib && hp.onCourt) {
        const open = nearestDefenderDist(g, hp.team, hp.pos.x, hp.pos.z);
        const d = dist2(hp.pos.x, hp.pos.z, ib.pos.x, ib.pos.z);
        if ((open > 1.3 && d < 11) || force) return hp;
      }
    }
    let best = null, bs = -1e9;
    for (const m of mates) {
      const open = nearestDefenderDist(g, m.team, m.pos.x, m.pos.z);
      const d = dist2(m.pos.x, m.pos.z, ib.pos.x, ib.pos.z);
      if (d > 13 && !force) continue;
      const s = open * 1.0 - d * 0.1 + (m.role === 0 ? 0.6 : 0) + (m.role === 1 ? 0.3 : 0);
      if ((open > 1.2 || force) && s > bs) { bs = s; best = m; }
    }
    if (!best && force) best = mates.reduce((a, m) => (dist2(m.pos.x, m.pos.z, ib.pos.x, ib.pos.z) < dist2(a.pos.x, a.pos.z, ib.pos.x, ib.pos.z) ? m : a));
    return best;
  }

  // ======================= 搶球 =======================
  chaseLoose(p, dt, offense) {
    const g = this.g;
    const b = g.ball;
    const pred = b.predictAt(Math.max(1.2, Math.min(b.pos.y, p.standingReach + 0.2)), 1.5);
    const mine = g.onCourt(this.team);
    const ranked = mine.slice().sort((a, c) => dist2(a.pos.x, a.pos.z, pred.x, pred.z) - dist2(c.pos.x, c.pos.z, pred.x, pred.z));
    const rank = ranked.indexOf(p);
    const dp = dist2(p.pos.x, p.pos.z, pred.x, pred.z);
    const face = angleTo(p.pos.x, p.pos.z, b.pos.x, b.pos.z);
    if (rank < 2 || dp < 3.0) {
      this.steer(p, pred.x, pred.z, { sprint: dp > 1.0, face, stop: 0.05, slowRadius: 0.4, allowOut: dp < 2 });
      const hd = dist2(p.pos.x, p.pos.z, b.pos.x, b.pos.z);
      if (!p.airborne && p.jumpCooldown <= 0 && hd < 1.2 && b.pos.y > p.standingReach - 0.05 && b.pos.y < p.standingReach + 1.0 && b.vel.y < 1.2) {
        if (g.rng.chance(0.05 + 0.1 * (p.r.rebound / 100))) g.jumpPlayer(p, 'rebound');
      }
    } else if (offense) {
      const s = p.role <= 1 ? this.frame(9, clamp(p.pos.z * 0.4, -3, 3)) : this.spotFor(p);
      this.steer(p, s.x, s.z, { face });
    } else {
      const man = this.assign.get(p);
      const hoop = hoopOf(this.defSide);
      if (man) this.steer(p, man.pos.x + (hoop.x - man.pos.x) * 0.35, man.pos.z * 0.7, { face });
      else this.stop(p, face);
    }
  }

  // ======================= 防守 =======================
  reassignDefense() {
    const defs = this.g.onCourt(this.team);
    const atts = this.g.onCourt(1 - this.team);
    this.assign.clear();
    for (const d of defs) {
      const m = atts.find((a) => a.role === d.role) || atts[0];
      this.assign.set(d, m);
    }
  }

  ensureAssignments() {
    const defs = this.g.onCourt(this.team);
    const atts = this.g.onCourt(1 - this.team);
    const used = new Set();
    for (const d of defs) {
      const m = this.assign.get(d);
      if (!m || !m.onCourt || used.has(m)) this.assign.delete(d);
      else used.add(m);
    }
    for (const d of defs) {
      if (this.assign.has(d)) continue;
      let best = atts.find((a) => a.role === d.role && !used.has(a));
      if (!best) {
        let bd = 1e9;
        for (const a of atts) {
          if (used.has(a)) continue;
          const k = dist2(a.pos.x, a.pos.z, d.pos.x, d.pos.z);
          if (k < bd) { bd = k; best = a; }
        }
      }
      if (best) { this.assign.set(d, best); used.add(best); }
    }
  }

  defense(dt) {
    const g = this.g;
    const b = g.ball;
    this.ensureAssignments();
    const hoop = hoopOf(this.defSide);
    const holder = b.holder && b.holder.team !== this.team ? b.holder : null;
    const loose = this.ballIsLoose();
    const shotInAir = !!(b.shot && !b.shot.resolved && b.state !== 'held') && !loose;
    this.updateHelp(dt, holder, hoop);
    this.switchTimer -= dt;
    if (this.switchTimer <= 0) { this.checkSwitch(holder, hoop); this.switchTimer = 0.3; }
    for (const d of g.onCourt(this.team)) {
      if (d.human) continue;
      const man = this.assign.get(d);
      if (d.action && d.action.type === 'stumble') { this.stop(d); continue; }
      if (g.phase === 'inbound' || g.phase === 'afterScore') { this.guard(d, man, holder, hoop, dt); continue; }
      if (shotInAir) { this.boxOut(d, man, hoop); continue; }
      if (loose) { this.chaseLoose(d, dt, false); continue; }
      const shooter = holder && holder.action && holder.action.type === 'shot' ? holder : null;
      if (shooter) {
        const ds = dist2(d.pos.x, d.pos.z, shooter.pos.x, shooter.pos.z);
        if (ds < 3.3 && (man === shooter || ds < 2.1)) { this.contest(d, shooter, hoop); continue; }
      }
      if (d === this.helper && holder) {
        const hd = dist2(holder.pos.x, holder.pos.z, hoop.x, hoop.z) || 1;
        const ux = (hoop.x - holder.pos.x) / hd, uz = (hoop.z - holder.pos.z) / hd;
        this.steer(d, holder.pos.x + ux * 1.0, holder.pos.z + uz * 1.0, { sprint: true, stance: true, face: angleTo(d.pos.x, d.pos.z, holder.pos.x, holder.pos.z) });
        continue;
      }
      this.guard(d, man, holder, hoop, dt);
      if (man && man === holder && g.phase === 'live') this.maybeSteal(d, holder, dt);
    }
  }

  guard(d, man, holder, hoop, dt) {
    const g = this.g;
    const b = g.ball;
    if (!man) { const t = { x: hoop.x - this.defSide * 4, z: 0 }; this.steer(d, t.x, t.z, {}); return; }
    const ai = d.ai;
    if (!ai.track || ai.trackMan !== man) { ai.track = { x: man.pos.x, z: man.pos.z }; ai.trackMan = man; }
    const k = (2.6 + 6.0 * d.rating('defense') / 100) * (0.28 / Math.max(0.12, g.diff.reaction)) ** 0.5;
    const f = Math.min(1, k * dt);
    ai.track.x += (man.pos.x - ai.track.x) * f;
    ai.track.z += (man.pos.z - ai.track.z) * f;
    const mx = ai.track.x, mz = ai.track.z;
    const dmh = dist2(mx, mz, hoop.x, hoop.z) || 1;
    const ux = (hoop.x - mx) / dmh, uz = (hoop.z - mz) / dmh;
    let tx, tz, stance = false, face;
    if (man === holder) {
      let gap = 1.05 + (man.r.speed - d.r.speed) / 100 * 0.9 + (man.r.three < 62 ? 0.45 : 0) - (man.r.three > 84 ? 0.15 : 0);
      if (dmh > 8.6) gap += (dmh - 8.6) * 0.7;
      gap = clamp(gap, 0.8, 4.5);
      tx = mx + ux * gap; tz = mz + uz * gap;
      stance = dist2(d.pos.x, d.pos.z, man.pos.x, man.pos.z) < 3.2;
      face = angleTo(d.pos.x, d.pos.z, man.pos.x, man.pos.z);
    } else {
      const dBall = dist2(man.pos.x, man.pos.z, b.pos.x, b.pos.z);
      let t = clamp(0.1 + 0.032 * dBall, 0.1, 0.4);
      if (man.r.three > 78 && dmh > 6.3) t *= 0.7;
      if (dmh < 3.2) t = 0.12;
      if (g.phase === 'inbound' && g.pd.fromScore) t = Math.max(t, 0.35);
      tx = mx + (hoop.x - mx) * t; tz = mz + (hoop.z - mz) * t;
      const shift = clamp(0.06 + 0.02 * dBall, 0.06, 0.28);
      tx += (b.pos.x - tx) * shift; tz += (b.pos.z - tz) * shift;
      face = angleTo(d.pos.x, d.pos.z, b.pos.x, b.pos.z);
    }
    const far = dist2(d.pos.x, d.pos.z, tx, tz);
    this.steer(d, tx, tz, { sprint: far > 1.8, stance: stance && far < 1.2, face, stop: 0.12, slowRadius: 0.8 });
  }

  maybeSteal(d, holder) {
    const g = this.g;
    if (d.stealCooldown > 0 || d.action) return;
    const dd = dist2(d.pos.x, d.pos.z, holder.pos.x, holder.pos.z);
    if (dd > 1.3) return;
    d.ai.stealT = (d.ai.stealT || 0) - (1 / 60);
    if (d.ai.stealT > 0) return;
    d.ai.stealT = 0.25;
    const p = g.diff.stealRate * 0.0105 * (0.5 + d.r.defense / 100) * (1.45 - holder.r.handle / 100) * (holder.action && holder.action.type === 'pass' ? 2 : 1);
    const sm = g.beat ? g.beat.aiStealMul(d.team) : 1; // HOOPBEAT: 能量 → 抄截意願
    if (g.rng.chance(p * sm * (d.ratingMul < 1 || g.isHumanTeam(holder.team) ? 1 : 0.85))) g.attemptSteal(d);
  }

  contest(d, shooter, hoop) {
    const g = this.g;
    const a = shooter.action;
    const hd = dist2(shooter.pos.x, shooter.pos.z, hoop.x, hoop.z) || 1;
    const ux = (hoop.x - shooter.pos.x) / hd, uz = (hoop.z - shooter.pos.z) / hd;
    this.steer(d, shooter.pos.x + ux * 0.7, shooter.pos.z + uz * 0.7, { sprint: true, face: angleTo(d.pos.x, d.pos.z, shooter.pos.x, shooter.pos.z) });
    const ai = d.ai;
    if (!ai.blockTry || ai.blockTry.shot !== a) {
      ai.blockTry = { shot: a, at: g.time + g.diff.reaction * 0.55 + g.rng.range(0, 0.1), decided: false };
    }
    const bt = ai.blockTry;
    if (!bt.decided && g.time >= bt.at) {
      bt.decided = true;
      const dd = dist2(d.pos.x, d.pos.z, shooter.pos.x, shooter.pos.z);
      const base = a.kind === 'jump' ? 0.2 : 0.32;
      let pr = base * (0.35 + 0.8 * d.r.block / 100) * g.diff.blockRate * (dd < 1.7 ? 1 : 0.25);
      if (d.ratingMul === 1 && !g.isHumanTeam(shooter.team)) pr *= 0.9;
      if (g.beat) pr *= g.beat.aiBlockMul(d.team); // HOOPBEAT
      if (g.rng.chance(pr)) g.jumpPlayer(d, 'block');
    }
  }

  boxOut(d, man, hoop) {
    const face = angleTo(d.pos.x, d.pos.z, hoop.x, hoop.z);
    if (!man) { this.steer(d, hoop.x - this.defSide * 2.5, 0, { face }); return; }
    const dmh = dist2(man.pos.x, man.pos.z, hoop.x, hoop.z) || 1;
    const ux = (hoop.x - man.pos.x) / dmh, uz = (hoop.z - man.pos.z) / dmh;
    let tx, tz;
    if (dmh < 6.5) { tx = man.pos.x + ux * 0.7; tz = man.pos.z + uz * 0.7; }
    else { tx = hoop.x - ux * 4.0; tz = hoop.z - uz * 4.0; }
    this.steer(d, tx, tz, { face, stance: dmh < 6.5, stop: 0.1 });
  }

  updateHelp(dt, holder, hoop) {
    const g = this.g;
    this.helperTimer -= dt;
    if (!holder || g.phase !== 'live') { this.helper = null; return; }
    const hd = dist2(holder.pos.x, holder.pos.z, hoop.x, hoop.z);
    let onBall = null;
    for (const [d, m] of this.assign) if (m === holder) onBall = d;
    const beaten = !onBall
      || dist2(onBall.pos.x, onBall.pos.z, hoop.x, hoop.z) > hd + 0.3
      || dist2(onBall.pos.x, onBall.pos.z, holder.pos.x, holder.pos.z) > 2.2
      || (onBall.action && onBall.action.type === 'stumble');
    if (hd < 5.8 && beaten) {
      if (!this.helper && this.helperTimer <= 0) {
        this.helperTimer = 0.45;
        if (g.rng.chance(g.diff.helpRate * (this.teamHasHumanOpp() ? 1 : 0.9))) {
          const px = holder.pos.x + (hoop.x - holder.pos.x) / (hd || 1) * 1.2;
          const pz = holder.pos.z + (hoop.z - holder.pos.z) / (hd || 1) * 1.2;
          let best = null, bd = 1e9;
          for (const d of g.onCourt(this.team)) {
            if (d === onBall || d.human) continue;
            const m = this.assign.get(d);
            if (m && dist2(m.pos.x, m.pos.z, holder.pos.x, holder.pos.z) < 1.6) continue;
            const k = dist2(d.pos.x, d.pos.z, px, pz);
            if (k < bd) { bd = k; best = d; }
          }
          if (best && bd < 6) this.helper = best;
        }
      }
    } else if (this.helper && (hd > 6.8 || !beaten)) {
      this.helper = null;
    }
  }

  teamHasHumanOpp() {
    return this.g.isHumanTeam(1 - this.team);
  }

  checkSwitch(holder) {
    if (!holder) return;
    let onBall = null;
    for (const [d, m] of this.assign) if (m === holder) onBall = d;
    if (!onBall || onBall.human) return;
    const dOn = dist2(onBall.pos.x, onBall.pos.z, holder.pos.x, holder.pos.z);
    if (dOn < 2.4) return;
    let best = null, bd = 1e9;
    for (const d of this.g.onCourt(this.team)) {
      if (d === onBall || d.human || d === this.helper) continue;
      const k = dist2(d.pos.x, d.pos.z, holder.pos.x, holder.pos.z);
      if (k < bd) { bd = k; best = d; }
    }
    if (best && bd < 1.6 && bd < dOn - 1.0) {
      const other = this.assign.get(best);
      this.assign.set(best, holder);
      this.assign.set(onBall, other);
    }
  }
}

function side_toward(m, hoop) {
  const sp = Math.hypot(m.vel.x, m.vel.z);
  if (sp < 1) return dist2(m.pos.x, m.pos.z, hoop.x, hoop.z) < 2.5;
  return ((hoop.x - m.pos.x) * m.vel.x + (hoop.z - m.pos.z) * m.vel.z) > 0;
}
