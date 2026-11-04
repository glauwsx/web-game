// 比賽主模擬：比賽階段、動作、球權、規則。不依賴畫面，可在 Node 中執行。
import { COURT, BALL_R, GRAVITY, DIFFICULTY, PLAYER_R } from './constants.js';
import { RNG, clamp, dist2, len2, isFiniteNum, angleTo, wrapAngle, segmentDistance } from './util.js';
import * as R from './rules.js';
import { Ball } from './ball.js';
import { Player } from './player.js';
import {
  hoopOf, chooseShotKind, contestAt, baseMakeProb, contestPenalty, timingResult,
  shotRating01, shotTarget, flightTime, releasePoint, dunkAbility,
} from './shooting.js';
import { TeamAI } from './ai.js';
import { applyHumanInput, emptyInput, autoAssignHumans } from './control.js';

export class Game {
  constructor(opts) {
    this.opts = Object.assign({
      quarterMinutes: 3, difficulty: 'normal', humans: [], seed: (Math.random() * 1e9) | 0,
      autoSub: true, autoContinue: false, periods: 4,
    }, opts);
    this.rng = new RNG(this.opts.seed);
    this.diff = DIFFICULTY[this.opts.difficulty] || DIFFICULTY.normal;
    this.rules = R.createRules({ quarterMinutes: this.opts.quarterMinutes, periods: this.opts.periods });
    this.ball = new Ball();
    this.time = 0;
    this.events = [];
    this.phase = 'pregame';
    this.phaseTime = 0;
    this.pd = {};
    this.passRequest = null;
    this.buzzerPending = false;
    this.lastTouchTime = 0;
    this.stats = { shotClockResets: 0, possessions: 0, steps: 0 };
    this.beat = null; // HOOPBEAT: 拍點橋接（BeatBridge.install 會填入）

    const kits = ['light', 'dark'];
    this.teams = [0, 1].map((i) => {
      const data = i === 0 ? this.opts.home : this.opts.away;
      const players = data.roster.map((pd, k) => new Player(pd, i, k));
      players.forEach((p, k) => { p.onCourt = k < 5; p.role = k < 5 ? k : -1; });
      return { index: i, data, kit: kits[i], players, lineup: players.slice(0, 5), ai: null, humans: [] };
    });
    this.allPlayers = [...this.teams[0].players, ...this.teams[1].players];

    this.humans = (this.opts.humans || []).map((h, i) => ({
      id: h.id, team: h.team, label: h.label || `${i + 1}P`, player: null, input: emptyInput(), slot: i,
    }));
    for (const h of this.humans) this.teams[h.team].humans.push(h);
    for (const t of this.teams) {
      const opp = this.teams[1 - t.index];
      const mul = t.humans.length === 0 && opp.humans.length > 0 ? this.diff.aiRating : 1;
      for (const p of t.players) p.ratingMul = mul;
      t.ai = new TeamAI(this, t.index);
    }
    autoAssignHumans(this, true);
  }

  // ---------- 查詢 ----------
  attackSide(team) { return this.rules.attackSide[team]; }
  attackHoop(team) { return hoopOf(this.attackSide(team)); }
  teamAttacking(side) { return this.rules.attackSide[0] === side ? 0 : 1; }
  onCourt(team) { return this.teams[team].lineup; }
  everyoneOnCourt() { return [...this.teams[0].lineup, ...this.teams[1].lineup]; }
  isHumanTeam(team) { return this.teams[team].humans.length > 0; }

  // 目前算是哪一隊在進攻（持球、傳球中或投籃中）
  offenseTeam() {
    const b = this.ball;
    if (b.holder) return b.holder.team;
    if (b.pass) return b.pass.passer.team;
    if (b.shot && !b.shot.resolved) return b.shot.team;
    return this.rules.possession;
  }

  emit(type, data = {}) {
    this.events.push(Object.assign({ type, t: this.time }, data));
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  message(text, kind = 'info', team = -1) {
    this.emit('message', { text, kind, team });
  }

  setHumanInput(id, input) {
    const h = this.humans.find((x) => x.id === id);
    if (h) h.input = input;
  }

  // ---------- 開始 ----------
  start() {
    this.setupTipoff();
  }

  // ---------- 主迴圈 ----------
  step(dt) {
    this.stats.steps++;
    if (this.phase === 'gameOver') return;
    if (this.phase === 'periodBreak') {
      this.phaseTime += dt;
      if (this.opts.autoContinue && this.phaseTime > 2.5) this.continueAfterBreak();
      return;
    }
    this.time += dt;
    this.phaseTime += dt;

    for (const h of this.humans) applyHumanInput(this, h, h.input, dt);
    for (const t of this.teams) t.ai.update(dt);

    const court = this.everyoneOnCourt();
    for (const p of court) this.updateAction(p, dt);
    for (const p of court) p.integrate(dt, this.ball.holder === p);
    this.resolveCollisions(court);
    this.updateBall(dt);
    this.updatePhase(dt);
    this.updateClocks(dt);

    for (const p of court) p.stats.sec += this.rules.clockRunning ? dt : 0;
    for (const t of this.teams) for (const p of t.players) if (!p.onCourt) p.stamina = Math.min(1, p.stamina + dt * 0.02);
  }

  // ---------- 時鐘 ----------
  updateClocks(dt) {
    const r = this.rules;
    if (this.phase === 'freethrow' || this.phase === 'dead' || this.phase === 'tipoff') return;
    const inFlight = !!(this.ball.shot && !this.ball.shot.resolved && this.ball.state !== 'held');
    const ev = R.tickClocks(r, dt, { shotInFlight: inFlight });
    for (const e of ev) {
      if (e === 'shotClockViolation') this.shotClockViolation();
      if (e === 'periodEnd') this.onPeriodClockEnd();
    }
  }

  shotClockViolation() {
    if (this.phase !== 'live') return;
    const team = this.rules.possession;
    const holder = this.ball.holder;
    if (holder) holder.stats.tov++;
    this.emit('whistle');
    this.emit('buzzer', { short: true });
    this.message('進攻時間違例', 'violation', team);
    const spot = this.sidelineSpot(this.ball.pos.x, this.ball.pos.z);
    this.deadBall(1.1, { kind: 'inbound', team: 1 - team, spot });
  }

  onPeriodClockEnd() {
    this.emit('buzzer');
    const s = this.ball.shot;
    if (s && !s.resolved && this.ball.state === 'flight') {
      this.buzzerPending = true;
      return;
    }
    this.deadBall(0.9, { kind: 'periodEnd' });
  }

  finishPeriod() {
    this.buzzerPending = false;
    const wasPeriod = this.rules.period;
    const res = R.endPeriod(this.rules);
    this.pd = { res, wasPeriod };
    this.phase = res.gameOver ? 'gameOver' : 'periodBreak';
    this.phaseTime = 0;
    this.ball.shot = null;
    this.emit('periodEnd', { period: wasPeriod, gameOver: res.gameOver, halftime: res.halftime, overtime: res.overtime });
    if (res.gameOver) this.emit('gameOver', { winner: R.winner(this.rules) });
    else this.autoSubstitute(true);
  }

  continueAfterBreak() {
    if (this.phase !== 'periodBreak') return;
    const res = this.pd.res;
    if (res.overtime || this.rules.period === 1) this.setupTipoff();
    else this.setupPeriodStart(res.possessionTeam >= 0 ? res.possessionTeam : 0);
  }

  // ---------- 階段 ----------
  setPhase(phase, pd = {}) {
    this.phase = phase;
    this.phaseTime = 0;
    this.pd = pd;
  }

  deadBall(duration, next) {
    this.rules.clockRunning = false;
    for (const p of this.everyoneOnCourt()) {
      if (p.action && p.action.type !== 'shot') p.action = null;
    }
    this.setPhase('dead', { duration, next });
  }

  updatePhase(dt) {
    const pd = this.pd;
    switch (this.phase) {
      case 'dead':
        if (this.phaseTime >= pd.duration) this.runNext(pd.next);
        break;
      case 'afterScore':
        this.updateAfterScore(dt);
        break;
      case 'inbound':
        this.updateInbound(dt);
        break;
      case 'freethrow':
        this.updateFreeThrow(dt);
        break;
      case 'tipoff':
        this.updateTipoff(dt);
        break;
      case 'live':
        this.checkHeldOutOfBounds();
        if (this.phase === 'live' && this.rules.gameClock <= 0) {
          const s = this.ball.shot;
          if ((!s || s.resolved) && !this.pendingFoul) this.deadBall(0.6, { kind: 'periodEnd' });
        }
        break;
      default:
        break;
    }
  }

  runNext(next) {
    if (!next) { this.setPhase('live'); return; }
    switch (next.kind) {
      case 'inbound':
        this.autoSubstitute(false);
        this.setupInbound(next.team, next.spot, next);
        break;
      case 'ft':
        this.setupFreeThrows(next.shooter, next.total, next);
        break;
      case 'ftNext':
        this.nextFreeThrow();
        break;
      case 'periodEnd':
        if (this.rules.gameClock > 0 && !this.buzzerPending) {
          this.setPhase('live');
        } else this.finishPeriod();
        break;
      default:
        this.setPhase('live');
    }
  }

  // ---------- 跳球 ----------
  setupTipoff() {
    const r = this.rules;
    this.ball.shot = null;
    this.ball.pass = null;
    const jumpers = [0, 1].map((t) => this.onCourt(t).reduce((a, b) => (b.height > a.height ? b : a)));
    for (const t of [0, 1]) {
      const s = this.attackSide(t);
      const others = this.onCourt(t).filter((p) => p !== jumpers[t]);
      const spots = [[2.2, 2.6], [2.2, -2.6], [5.6, 1.5], [4.4, -5.2]];
      others.forEach((p, i) => this.placePlayer(p, -s * spots[i][0], spots[i][1] * (t === 0 ? 1 : -1), s > 0 ? 0 : Math.PI));
      this.placePlayer(jumpers[t], -s * 0.48, 0, s > 0 ? 0 : Math.PI);
    }
    this.ball.release('flight');
    this.ball.pos = { x: 0, y: 1.8, z: 0.0 };
    this.ball.vel = { x: 0, y: 0, z: 0 };
    this.ball.lastTouch = null;
    this.ball.lastTouchTeam = -1;
    r.clockRunning = false;
    r.possession = -1;
    R.resetShotClock(r, R.SHOT_CLOCK_FULL);
    this.setPhase('tipoff', { jumpers, tossed: false, tossAt: 1.4, touched: false, jumped: [false, false] });
    autoAssignHumans(this, false, { tipoff: true });
    this.emit('fade');
    this.message(`${R.periodLabel(r)} 跳球`, 'period');
  }

  updateTipoff(dt) {
    const pd = this.pd;
    const b = this.ball;
    for (const p of this.everyoneOnCourt()) {
      p.ctrl.mx = 0; p.ctrl.mz = 0; p.ctrl.sprint = false;
      p.vel.x *= 0.5; p.vel.z *= 0.5;
      p.ctrl.face = pd.jumpers.includes(p) ? (p.pos.x < 0 ? 0 : Math.PI) : angleTo(p.pos.x, p.pos.z, 0, 0);
    }
    if (!pd.tossed) {
      b.pos = { x: 0, y: 1.8, z: 0 };
      b.vel = { x: 0, y: 0, z: 0 };
      if (this.phaseTime >= pd.tossAt) {
        pd.tossed = true;
        pd.tossTime = this.time;
        b.vel.y = 7.0;
        this.emit('whistle', { soft: true });
        pd.aiJumpAt = [0, 1].map((t) => {
          const j = pd.jumpers[t];
          const jv = j.jumpVelocity('rebound');
          const rm = j.standingReach + (jv * jv) / (2 * GRAVITY);
          const disc = Math.max(0, 49 - 4 * 4.905 * (rm - 1.8));
          const tBall = (7 + Math.sqrt(disc)) / (2 * 4.905);
          const ideal = tBall - jv / GRAVITY;
          pd.idealJump = pd.idealJump || [];
          pd.idealJump[t] = ideal;
          return ideal + (j.human ? 0.3 : this.rng.gauss(0, 0.07));
        });
      }
      return;
    }
    const tt = this.time - pd.tossTime;
    pd.jumpers.forEach((j, t) => {
      if (pd.jumped[t]) return;
      const auto = tt > pd.aiJumpAt[t];
      if (auto) this.jumpPlayer(j, 'rebound');
    });
    pd.jumpers.forEach((j, t) => { if (j.airborne) pd.jumped[t] = true; });
    // 碰球判定
    const cands = pd.jumpers.filter((j) => j.airborne && j.handReach + 0.15 >= b.pos.y && dist2(j.pos.x, j.pos.z, b.pos.x, b.pos.z) < 0.95);
    if (cands.length && b.vel.y < 2.5) {
      let w = cands[0];
      if (cands.length > 1) {
        const score = (j) => j.handReach - b.pos.y + j.rating('rebound') * 0.004 + this.rng.next() * 0.25;
        w = score(cands[0]) >= score(cands[1]) ? cands[0] : cands[1];
      }
      const mates = this.onCourt(w.team).filter((p) => p !== w);
      const target = mates.reduce((a, p) => (p.role === 0 ? p : a), mates[0]);
      const dx = target.pos.x - b.pos.x, dz = target.pos.z - b.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      b.vel = { x: dx / L * 4.2, y: 0.8, z: dz / L * 4.2 };
      b.state = 'loose';
      b.lastTouch = w;
      b.lastTouchTeam = w.team;
      b.noGrab = 0.25;
      b.noGrabPlayer = w;
      this.pd.tipTeam = w.team;
      this.tipPending = true;
      this.setPhase('live');
      this.rules.clockRunning = true;
      this.emit('tip', { player: w });
      return;
    }
    if (b.pos.y < 1.3 && b.vel.y < 0) {
      b.state = 'loose';
      this.tipPending = true;
      this.setPhase('live');
      this.rules.clockRunning = true;
    }
  }

  // ---------- 節開始（非跳球） ----------
  setupPeriodStart(team) {
    const spot = { x: 0, z: -(COURT.halfWidth + 0.45) };
    this.formation(team);
    this.message(R.periodLabel(this.rules) + ' 開始', 'period');
    this.setupInbound(team, spot, { teleport: true, changePossession: true });
  }

  // 把雙方放到半場陣型（進攻方在前場）
  formation(offTeam) {
    const off = this.onCourt(offTeam);
    const def = this.onCourt(1 - offTeam);
    const s = this.attackSide(offTeam);
    const spots = [[8.6, 0.5], [6.5, 4.6], [6.5, -4.6], [3.5, 5.6], [3.0, -3.2]];
    off.forEach((p, i) => {
      const sp = spots[p.role] || spots[i];
      this.placePlayer(p, s * (COURT.hoopX - sp[0]) * 0.5 + s * 1.0, sp[1], s > 0 ? 0 : Math.PI);
    });
    def.forEach((p, i) => {
      const m = off[i];
      const hx = s * COURT.hoopX;
      const x = m.pos.x + (hx - m.pos.x) * 0.3;
      const z = m.pos.z * 0.75;
      this.placePlayer(p, x, z, angleTo(x, z, m.pos.x, m.pos.z));
    });
    this.emit('fade');
  }

  placePlayer(p, x, z, facing = 0) {
    p.pos.x = x; p.pos.z = z;
    p.vel.x = 0; p.vel.z = 0;
    p.y = 0; p.vy = 0;
    p.facing = facing;
    p.action = null;
    p.ai.target = null;
    p.ai.mode = null;
  }

  // ---------- 發球 ----------
  sidelineSpot(x, z) {
    const out = 0.45;
    if (Math.abs(x) > COURT.halfLength - 0.3) {
      return { x: Math.sign(x) * (COURT.halfLength + out), z: clamp(z, -6.2, 6.2) };
    }
    return { x: clamp(x, -12.5, 12.5), z: Math.sign(z || -1) * (COURT.halfWidth + out) };
  }

  baselineSpot(side) {
    return { x: side * (COURT.halfLength + 0.45), z: this.rng.chance(0.5) ? 1.6 : -1.6 };
  }

  setupInbound(team, spot, opts = {}) {
    const r = this.rules;
    const b = this.ball;
    const fromScore = !!opts.fromScore;
    let inbounder = opts.inbounder;
    if (!inbounder) {
      const cands = this.onCourt(team);
      inbounder = cands.reduce((a, p) => {
        const da = dist2(a.pos.x, a.pos.z, spot.x, spot.z) - (a.role >= 3 ? 1.5 : 0);
        const dp = dist2(p.pos.x, p.pos.z, spot.x, spot.z) - (p.role >= 3 ? 1.5 : 0);
        return dp < da ? p : a;
      });
    }
    if (!fromScore || opts.teleport || dist2(inbounder.pos.x, inbounder.pos.z, spot.x, spot.z) > 0.8) {
      if (!fromScore && !opts.teleport) this.emit('fade', { quick: true });
      this.placePlayer(inbounder, spot.x, spot.z, angleTo(spot.x, spot.z, 0, 0));
    }
    // 其他人不要站在發球點上
    for (const p of this.everyoneOnCourt()) {
      if (p === inbounder) continue;
      if (dist2(p.pos.x, p.pos.z, spot.x, spot.z) < 1.6) {
        const a = angleTo(spot.x, spot.z, 0, 0);
        p.pos.x = spot.x + Math.cos(a) * 2.0 + this.rng.range(-0.5, 0.5);
        p.pos.z = spot.z + Math.sin(a) * 2.0 + this.rng.range(-0.5, 0.5);
      }
      if (!R.isInBounds(p.pos.x, p.pos.z, 0.3)) {
        p.pos.x = clamp(p.pos.x, -13.6, 13.6);
        p.pos.z = clamp(p.pos.z, -7.1, 7.1);
      }
    }
    b.setHeld(inbounder);
    b.shot = null;
    b.pass = null;
    inbounder.action = { type: 'inbound', t: 0, lockMove: true };
    inbounder.facing = angleTo(spot.x, spot.z, 0, spot.z * 0.2);
    const changed = r.possession !== team;
    if (changed) {
      r.possession = team;
      R.resetShotClock(r, R.SHOT_CLOCK_FULL);
      this.onPossessionChange(team, 'inbound');
    } else if (opts.resetShotClock) {
      R.resetShotClock(r, opts.resetShotClock);
    }
    r.shotClockRunning = false;
    if (!fromScore) r.clockRunning = false;
    this.setPhase('inbound', {
      team, spot, inbounder, fromScore, passAt: 0.9 + this.rng.next() * 0.8,
    });
    autoAssignHumans(this, false, { inbound: true });
  }

  updateInbound() {
    const pd = this.pd;
    const ib = pd.inbounder;
    if (this.ball.holder !== ib) { this.setPhase('live'); return; }
    ib.ctrl.mx = 0; ib.ctrl.mz = 0;
    ib.pos.x = pd.spot.x; ib.pos.z = pd.spot.z;
    ib.vel.x = 0; ib.vel.z = 0;
    const req = this.passRequest;
    let target = null;
    if (req && req.player.team === pd.team && this.time - req.time < 0.6 && this.phaseTime > 0.35) target = req.player;
    else if (this.phaseTime >= pd.passAt) target = this.teams[pd.team].ai.chooseInboundTarget(ib, this.phaseTime > 4.5);
    if (target) {
      this.passRequest = null;
      ib.action = null;
      this.passBall(ib, target, { kind: 'chest', inbound: true });
      this.setPhase('live', { inboundPass: true });
    }
  }

  // ---------- 投進之後 ----------
  updateAfterScore() {
    const pd = this.pd;
    const ib = pd.inbounder;
    const d = dist2(ib.pos.x, ib.pos.z, pd.spot.x, pd.spot.z);
    if ((this.phaseTime > 0.9 && d < 0.6) || this.phaseTime > 2.2) {
      this.setupInbound(pd.team, pd.spot, { fromScore: true, inbounder: ib });
    }
  }

  // ---------- 罰球 ----------
  setupFreeThrows(shooter, total, opts = {}) {
    const team = shooter.team;
    const side = this.attackSide(team);
    const hx = side * COURT.hoopX;
    const ftX = hx - side * COURT.ftDist;
    this.rules.clockRunning = false;
    // 罰球線站位
    const lane = [
      { a: 1.1, z: 2.9, d: true }, { a: 1.1, z: -2.9, d: true },
      { a: 2.0, z: 2.9, d: false }, { a: 2.0, z: -2.9, d: false },
      { a: 2.9, z: 2.9, d: true }, { a: 2.9, z: -2.9, d: false },
    ];
    const offOthers = this.onCourt(team).filter((p) => p !== shooter).sort((a, b) => b.role - a.role);
    const defs = this.onCourt(1 - team).slice().sort((a, b) => b.r.rebound - a.r.rebound);
    const dSpots = lane.filter((l) => l.d);
    const oSpots = lane.filter((l) => !l.d);
    defs.forEach((p, i) => {
      if (i < dSpots.length) this.placePlayer(p, hx - side * dSpots[i].a, dSpots[i].z, angleTo(0, dSpots[i].z, 0, 0) + 0);
      else this.placePlayer(p, hx - side * 7.6, i % 2 ? 3.4 : -3.4, side > 0 ? 0 : Math.PI);
    });
    offOthers.forEach((p, i) => {
      if (i < oSpots.length) this.placePlayer(p, hx - side * oSpots[i].a, oSpots[i].z, 0);
      else this.placePlayer(p, hx - side * 7.9, i % 2 ? -2.6 : 2.6, side > 0 ? 0 : Math.PI);
    });
    for (const p of this.everyoneOnCourt()) p.facing = angleTo(p.pos.x, p.pos.z, hx, 0);
    this.placePlayer(shooter, ftX, 0, side > 0 ? 0 : Math.PI);
    this.ball.setHeld(shooter);
    this.ball.shot = null;
    this.setPhase('freethrow', { shooter, team, total, index: opts.index || 0, state: 'ready', side, made: 0 });
    this.ftState = { shooter, total, index: opts.index || 0 };
    autoAssignHumans(this, false, { freethrow: shooter });
    this.emit('fade');
    this.emit('ftSetup', { shooter, total, index: this.pd.index });
  }

  updateFreeThrow() {
    const pd = this.pd;
    const sh = pd.shooter;
    for (const p of this.everyoneOnCourt()) {
      p.ctrl.mx = 0; p.ctrl.mz = 0; p.ctrl.sprint = false;
      p.vel.x = 0; p.vel.z = 0;
      p.ctrl.face = angleTo(p.pos.x, p.pos.z, pd.side * COURT.hoopX, 0);
    }
    if (pd.state === 'ready' && this.ball.holder === sh && !sh.action) {
      const delay = sh.human ? 8 : 1.1;
      if (this.phaseTime > delay) this.startShot(sh, { kind: 'ft', hold: false });
    }
  }

  nextFreeThrow() {
    const fs = this.ftState;
    this.setupFreeThrows(fs.shooter, fs.total, { index: fs.index + 1 });
  }

  // ---------- 動作 ----------
  updateAction(p, dt) {
    const a = p.action;
    if (!a) return;
    a.t += dt;
    switch (a.type) {
      case 'shot':
        this.updateShotAction(p, a, dt);
        break;
      case 'pass':
      case 'land':
      case 'stumble':
      case 'move':
        if (a.type === 'move' && a.t > a.dur * 0.6) a.forceVel = null;
        if (a.t >= a.dur) p.action = null;
        break;
      case 'steal':
        if (!a.resolved && a.t >= 0.12) { a.resolved = true; this.resolveSteal(p); }
        if (a.t >= a.dur) p.action = null;
        break;
      case 'jump':
        if (a.t > 0.1 && !p.airborne) p.action = { type: 'land', t: 0, dur: 0.12, slowMove: 0.4 };
        break;
      case 'alley':
        this.updateAlley(p, a);
        break;
      case 'inbound':
        break;
      default:
        if (a.dur && a.t >= a.dur) p.action = null;
    }
  }

  startShot(p, opts = {}) {
    const b = this.ball;
    if (b.holder !== p || (p.action && p.action.type === 'shot') || p.airborne) return false;
    if (this.phase !== 'live' && !(this.phase === 'freethrow' && opts.kind === 'ft')) return false;
    let kind = opts.kind || chooseShotKind(this, p, { allowDunk: opts.allowDunk !== false });
    const side = this.attackSide(p.team);
    const hoop = hoopOf(side);
    const d = dist2(p.pos.x, p.pos.z, hoop.x, hoop.z);
    const points = kind === 'ft' ? 1 : R.pointsForShot(p.pos.x, p.pos.z, side);
    const faceHoop = angleTo(p.pos.x, p.pos.z, hoop.x, hoop.z);
    const a = {
      type: 'shot', kind, t: 0, released: false, points, d, side,
      startSpeed: len2(p.vel.x, p.vel.z), lockMove: true, humanHold: !!p.human && opts.hold !== false,
      contest0: kind === 'ft' ? 0 : contestAt(this, p, p.pos.x, p.pos.z),
    };
    p.ctrl.face = faceHoop;
    if (kind === 'jump' || kind === 'ft') {
      a.gather = kind === 'ft' ? 0.22 : 0.13;
      a.jumpV = kind === 'ft' ? 0 : p.jumpVelocity('shot');
      a.ideal = kind === 'ft' ? 0.55 : a.gather + 0.92 * a.jumpV / GRAVITY;
      const r01h = shotRating01(p, kind, points, d);
      a.perfectWin = 0.03 * (0.8 + 0.5 * r01h) * (p.human ? this.diff.humanWindow : 1);
      if (!a.humanHold) {
        const r01 = r01h;
        const sigma = (p.human ? 0.04 : this.diff.timingSigma) * (1.25 - 0.5 * r01);
        a.releaseAt = Math.max(a.gather * 0.5, a.ideal + this.rng.gauss(0, sigma));
        // HOOPBEAT: 電腦把出手時間對齊強拍
        if (this.beat) { const ra = this.beat.aiReleaseAt(p, a); if (ra != null) a.releaseAt = ra; }
      }
      p.vel.x *= 0.25; p.vel.z *= 0.25;
      p.facing = faceHoop;
    } else if (kind === 'layup') {
      a.gather = 0.2;
      a.releaseAt = a.gather + 0.22;
      const sp = clamp(a.startSpeed, 2.6, 4.6);
      const ux = (hoop.x - p.pos.x) / (d || 1), uz = (hoop.z - p.pos.z) / (d || 1);
      // 上籃往籃框前約 0.9 公尺處移動
      const travel = Math.max(0, d - 0.9);
      const v = Math.min(sp, travel / 0.5 + 0.5);
      a.forceVel = { x: ux * v, z: uz * v };
      p.facing = faceHoop;
    } else if (kind === 'dunk') {
      a.gather = 0.16;
      a.jumpV = 3.9 + 0.6 * clamp(dunkAbility(p) - 0.8, 0, 0.5);
      const tApex = a.jumpV / GRAVITY;
      a.slamAt = a.gather + tApex * 0.95;
      const ux = (hoop.x - p.pos.x) / (d || 1), uz = (hoop.z - p.pos.z) / (d || 1);
      const reach = Math.max(0, d - 0.62);
      const v = reach / (a.gather + tApex * 0.95);
      a.forceVel = { x: ux * v, z: uz * v };
      a.lockFace = true;
      p.facing = faceHoop;
    }
    p.action = a;
    this.emit('shotStart', { player: p, kind });
    return true;
  }

  updateShotAction(p, a) {
    const g = GRAVITY;
    if (a.kind === 'jump') {
      if (!a.jumped && a.t >= a.gather) { p.vy = a.jumpV; a.jumped = true; a.lockFace = true; }
      if (!a.released) {
        let rel = false;
        if (a.humanHold) rel = a.humanReleased;
        else rel = a.t >= a.releaseAt;
        if (a.jumped && a.t > a.gather + 0.06 && !p.airborne) rel = true;
        if (rel) this.releaseShot(p);
      } else if (a.t > a.gather + 0.1 && !p.airborne) {
        p.action = { type: 'land', t: 0, dur: 0.16, lockMove: true };
      }
    } else if (a.kind === 'ft') {
      if (!a.released) {
        const rel = a.humanHold ? a.humanReleased || a.t > 1.6 : a.t >= a.releaseAt;
        if (rel) this.releaseShot(p);
      } else if (a.t > (a.releaseT || 0) + 0.6) p.action = null;
    } else if (a.kind === 'layup') {
      if (!a.jumped && a.t >= a.gather) {
        a.jumped = true;
        p.vy = 3.1 + 0.6 * p.athletic;
        a.lockFace = true;
        a.forceVel = { x: a.forceVel.x * 0.6, z: a.forceVel.z * 0.6 };
      }
      if (!a.released && a.t >= a.releaseAt) this.releaseShot(p);
      if (a.released && a.t > a.releaseAt + 0.05 && !p.airborne) {
        p.action = { type: 'land', t: 0, dur: 0.18, lockMove: true };
      }
    } else if (a.kind === 'dunk') {
      if (!a.jumped && a.t >= a.gather) { a.jumped = true; p.vy = a.jumpV; }
      if (!a.released && a.t >= a.slamAt) {
        this.releaseDunk(p, a);
        a.hang = 0.32;
        a.forceVel = { x: 0, z: 0 };
        p.vy = 0;
      }
      if (a.released) {
        if (a.hang > 0) {
          a.hang -= 1 / 60;
          p.vy = 0;
          if (a.hang <= 0) { a.hang = 0; p.vy = -0.5; a.forceVel = null; }
        } else if (!p.airborne) {
          p.action = { type: 'land', t: 0, dur: 0.22, lockMove: true };
        }
      }
    }
    void g;
  }

  computeShotFoul(p, kind, contest) {
    let nearest = null, nd = 99;
    for (const d of this.onCourt(1 - p.team)) {
      const dd = dist2(d.pos.x, d.pos.z, p.pos.x, p.pos.z);
      if (dd < nd) { nd = dd; nearest = d; }
    }
    if (!nearest || nd > 1.25) return null;
    let pf = kind === 'jump' ? 0.035 : kind === 'layup' ? 0.1 : 0.08;
    if (contest > 0.75) pf *= 1.5;
    if (nearest.airborne && nd < 0.95) pf += kind === 'jump' ? 0.09 : 0.06;
    pf *= 1.15 - 0.35 * (nearest.rating('defense') / 100);
    if (this.beat) pf *= this.beat.foulMul(nearest.team); // HOOPBEAT: 急躁容易犯規
    return this.rng.chance(pf) ? nearest : null;
  }

  releaseShot(p) {
    const a = p.action;
    const b = this.ball;
    if (!a || a.released || b.holder !== p) return;
    a.released = true;
    a.releaseT = a.t;
    const kind = a.kind;
    const side = a.side;
    const hoop = hoopOf(side);
    const rp = releasePoint(p, kind);
    const d = dist2(p.pos.x, p.pos.z, hoop.x, hoop.z);
    if (kind === 'layup') {
      // 上籃出手點不能在籃框正下方，否則球會從下面撞框
      let ux = p.pos.x - hoop.x, uz = p.pos.z - hoop.z;
      let ul = Math.hypot(ux, uz);
      if (ul < 0.05) { ux = -Math.cos(p.facing); uz = -Math.sin(p.facing); ul = 1; }
      ux /= ul; uz /= ul;
      const rd = clamp(d - 0.35, 0.62, 2.6);
      rp.x = hoop.x + ux * rd;
      rp.z = hoop.z + uz * rd;
    }
    const points = a.points;
    const r01 = shotRating01(p, kind, points, d);
    let timing = { mul: 1, grade: 'auto' };
    if (this.beat) timing = this.beat.shotTiming(p, a); // HOOPBEAT: 出手時機改成拍點判定
    else if (kind === 'jump' || kind === 'ft') {
      const delta = a.t - a.ideal;
      timing = timingResult(delta, r01, p.human ? this.diff.humanWindow : 1);
    }
    // 干擾值＝起手時與出手時的平均（補防來不及時效果較小）
    const contest = kind === 'ft' ? 0 : 0.5 * (a.contest0 || 0) + 0.5 * contestAt(this, p, p.pos.x, p.pos.z);
    let prob = baseMakeProb(p, kind, d, points) * contestPenalty(kind, contest) * timing.mul;
    prob *= 0.88 + 0.12 * p.stamina;
    if (kind === 'jump' && a.startSpeed > 3.2) prob *= 0.9;
    if (d > 9.5 && kind === 'jump') prob *= 0.45;
    // HOOPBEAT: 音樂修正（急躁、手感、助攻加成……）
    if (this.beat && kind !== 'ft') {
      const assisted = !!(p.lastReceive && this.time - p.lastReceive.time < 2.5 && p.lastReceive.from.team === p.team);
      prob += this.beat.shotBonus(p, assisted);
    }
    prob = clamp(prob, 0.004, kind === 'ft' ? 0.97 : 0.93);
    const made = this.rng.chance(prob);
    if (this.beat && !made && kind !== 'ft') this.beat.onShotMissed(p); // HOOPBEAT
    const foul = kind === 'ft' ? null : this.computeShotFoul(p, kind, contest);
    const target = shotTarget(this.rng, hoop, p.pos, made, 1 - prob);
    const T = flightTime(kind, Math.hypot(hoop.x - rp.x, hoop.z - rp.z));
    const vel = Ball.solveVelocity(rp, target, T);
    b.pos = { x: rp.x, y: rp.y, z: rp.z };
    b.vel = vel;
    b.release('flight');
    b.lastTouch = p;
    b.lastTouchTeam = p.team;
    b.noGrab = 0.25;
    b.noGrabPlayer = p;
    const fwd = Math.hypot(vel.x, vel.z) || 1;
    b.spin = { x: (-vel.z / fwd) * -9, y: 0, z: (vel.x / fwd) * -9 };
    let assister = null;
    if (kind !== 'ft' && p.lastReceive && this.time - p.lastReceive.time < 4.5 && p.lastReceive.from.team === p.team) assister = p.lastReceive.from;
    b.shot = {
      shooter: p, team: p.team, side, points, kind, made, prob, contest, timing: timing.grade,
      releaseTime: this.time, rimTouched: false, boardTouched: false, foul, blockChecked: new Set(),
      assister, resolved: false, scored: false, T, ftIndex: kind === 'ft' ? this.pd.index : -1,
      ftLast: kind === 'ft' ? this.pd.index >= this.pd.total - 1 : false,
    };
    if (kind === 'ft') p.stats.fta++;
    else {
      p.stats.fga++;
      if (points === 3) p.stats.tpa++;
    }
    if (foul) {
      this.pendingFoul = { fouler: foul, shooter: p, points };
      foul.stats.pf++;
      this.emit('whistle');
      this.message(`${foul.name} 投籃犯規`, 'foul', foul.team);
    }
    this.emit('shot', { player: p, kind, points, timing: timing.grade, prob, human: p.human });
    if (kind === 'ft') {
      this.pd.state = 'flight';
      if (b.shot.ftLast) {
        // 最後一罰出手後恢復比賽，搶籃板
        this.setPhase('live', { fromFT: true });
      }
    }
  }

  releaseDunk(p, a) {
    const b = this.ball;
    a.released = true;
    const side = a.side;
    const hoop = hoopOf(side);
    const contest = contestAt(this, p, p.pos.x, p.pos.z);
    let prob = baseMakeProb(p, 'dunk', 0.5, 2) * contestPenalty('dunk', contest);
    if (this.beat) prob *= this.beat.shotTiming(p, a).mul; // HOOPBEAT
    prob = clamp(prob, 0.3, 0.98);
    // 防守者在框邊起跳可以封阻灌籃
    let blocker = null;
    for (const d of this.onCourt(1 - p.team)) {
      if (!d.airborne) continue;
      const dd = dist2(d.pos.x, d.pos.z, hoop.x, hoop.z);
      if (dd < 1.4 && d.handReach > COURT.rimY + 0.15) {
        const pb = clamp(0.12 + 0.38 * d.rating('block') / 100 - 0.25 * (p.rating('inside') / 100 - 0.5) + (d.height - p.height) * 0.6, 0.03, 0.45) * this.diff.blockRate;
        if (this.rng.chance(pb)) { blocker = d; break; }
      }
    }
    const made = !blocker && this.rng.chance(prob);
    const foul = this.computeShotFoul(p, 'dunk', contest);
    let ux = hoop.x - p.pos.x, uz = hoop.z - p.pos.z;
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    if (made) {
      b.pos = { x: hoop.x - ux * 0.06, y: COURT.rimY + 0.26, z: hoop.z - uz * 0.06 };
      b.vel = { x: ux * 0.2, y: -4.2, z: uz * 0.2 };
    } else {
      b.pos = { x: hoop.x - ux * 0.3, y: COURT.rimY + 0.2, z: hoop.z - uz * 0.3 + this.rng.range(-0.1, 0.1) };
      b.vel = { x: -ux * 2.2 + this.rng.range(-1, 1), y: 2.4, z: -uz * 2.2 + this.rng.range(-1, 1) };
    }
    b.release('flight');
    b.lastTouch = p;
    b.lastTouchTeam = p.team;
    b.noGrab = 0.35;
    b.noGrabPlayer = p;
    let assister = null;
    if (p.lastReceive && this.time - p.lastReceive.time < 4.5 && p.lastReceive.from.team === p.team) assister = p.lastReceive.from;
    b.shot = {
      shooter: p, team: p.team, side, points: 2, kind: 'dunk', made, prob, contest, timing: 'auto',
      releaseTime: this.time, rimTouched: false, boardTouched: false, foul, blockChecked: new Set(),
      assister, resolved: false, scored: false, T: 0.2, blocked: !!blocker,
    };
    p.stats.fga++;
    if (blocker) {
      blocker.stats.blk++;
      b.shot.blocked = true;
      b.vel = { x: -ux * 3.5 + this.rng.range(-1.5, 1.5), y: 1.0, z: -uz * 3.5 + this.rng.range(-1.5, 1.5) };
      b.pos.y = COURT.rimY + 0.1;
      b.state = 'loose';
      b.lastTouch = blocker; b.lastTouchTeam = blocker.team;
      this.emit('block', { player: blocker, victim: p });
      this.message(`${blocker.name} 火鍋！`, 'block', blocker.team);
    }
    if (foul && !blocker) {
      this.pendingFoul = { fouler: foul, shooter: p, points: 2 };
      foul.stats.pf++;
      this.emit('whistle');
      this.message(`${foul.name} 投籃犯規`, 'foul', foul.team);
    }
    this.emit('dunk', { player: p, made });
  }

  // 空中接力：接到球後直接灌
  updateAlley(p, a) {
    const b = this.ball;
    if (a.caught) {
      if (!a.done && a.t > a.caughtAt + 0.12) {
        a.done = true;
        const side = this.attackSide(p.team);
        p.action = { type: 'shot', kind: 'dunk', t: 0, released: false, side, lockMove: true, lockFace: true, forceVel: { x: 0, z: 0 }, jumped: true, slamAt: 0 };
        this.releaseDunk(p, p.action);
        b.shot.alley = true;
        if (b.shot.made) b.shot.prob = Math.min(b.shot.prob, a.prob);
        // 空中接力成功率另外擲骰
        if (b.shot.made && !this.rng.chance(a.prob)) {
          const hoop = hoopOf(side);
          b.pos = { x: hoop.x + (p.pos.x - hoop.x) * 0.3, y: COURT.rimY + 0.2, z: hoop.z + (p.pos.z - hoop.z) * 0.3 };
          b.vel = { x: (p.pos.x - hoop.x) * 1.5, y: 2.6, z: (p.pos.z - hoop.z) * 1.5 + this.rng.range(-1, 1) };
          b.shot.made = false;
        }
        p.action.hang = 0.25;
        p.action.released = true;
      }
      return;
    }
    if (!p.airborne && a.t > 0.15 && !a.caught) p.action = null;
  }

  // ---------- 傳球 ----------
  passBall(passer, receiver, opts = {}) {
    const b = this.ball;
    if (b.holder !== passer || !receiver || receiver === passer) return false;
    const kind = opts.kind || 'chest';
    const hp = {
      x: passer.pos.x + Math.cos(passer.facing) * 0.35,
      y: passer.height * 0.68 + passer.y,
      z: passer.pos.z + Math.sin(passer.facing) * 0.35,
    };
    const d0 = dist2(hp.x, hp.z, receiver.pos.x, receiver.pos.z);
    let T, ty;
    if (kind === 'lob') { T = 0.45 + d0 / 9.5; ty = receiver.height * 0.95; }
    else if (kind === 'alley') { T = 0.55 + d0 / 10; ty = COURT.rimY + 0.35; }
    else { T = Math.max(0.14, 0.05 + d0 / (12.5 + passer.rating('handle') * 0.03)); ty = receiver.height * 0.62; }
    let tx, tz;
    if (kind === 'alley') {
      const hoop = this.attackHoop(receiver.team);
      let ux = receiver.pos.x - hoop.x, uz = receiver.pos.z - hoop.z;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul; uz /= ul;
      tx = hoop.x + ux * 0.55; tz = hoop.z + uz * 0.55;
    } else {
      const lead = opts.inbound ? 0.2 : 0.55;
      tx = receiver.pos.x + receiver.vel.x * T * lead;
      tz = receiver.pos.z + receiver.vel.z * T * lead;
      if (!opts.inbound) {
        tx = clamp(tx, -13.7, 13.7);
        tz = clamp(tz, -7.2, 7.2);
      }
    }
    // 準度：控球差的人傳球會偏
    const err = (1 - passer.rating('handle') / 100) * 0.35 * (kind === 'chest' ? d0 / 10 : 0.6);
    // HOOPBEAT: 拍點判定 + 音樂 → 傳球準度；急躁時容易傳歪
    const po = this.beat && !opts.inbound ? this.beat.passOutcome(passer) : { errMul: 1, bad: false, speedMul: 1 };
    tx += this.rng.gauss(0, err * po.errMul);
    tz += this.rng.gauss(0, err * po.errMul);
    if (po.bad) {
      const ang = this.rng.range(0, Math.PI * 2), dd = this.rng.range(1.7, 3.2);
      tx += Math.cos(ang) * dd; tz += Math.sin(ang) * dd;
      this.message(`${passer.name} 傳球太急，傳歪了`, 'turnover', passer.team);
    }
    const target = { x: tx, y: ty, z: tz };
    // 球從遠處傳時重新計算時間，讓速度合理
    const d1 = dist2(hp.x, hp.z, tx, tz);
    if (kind === 'chest') T = Math.max(0.14, 0.05 + d1 / (12.5 + passer.rating('handle') * 0.03)) * po.speedMul;
    b.pos = hp;
    b.vel = Ball.solveVelocity(hp, target, T);
    b.release('flight');
    b.lastTouch = passer;
    b.lastTouchTeam = passer.team;
    b.noGrab = 0.2;
    b.noGrabPlayer = passer;
    b.spin = { x: 0, y: 6, z: 0 };
    b.pass = { passer, receiver, kind, T, target, start: this.time, checked: new Set(), inbound: !!opts.inbound };
    b.shot = null;
    passer.action = { type: 'pass', t: 0, dur: 0.28, slowMove: 0.5 };
    passer.ai.hold = 0;
    receiver.ai.catchTarget = { x: tx, z: tz };
    if (kind === 'alley') {
      receiver.ai.alley = { time: this.time, T };
    }
    this.emit('pass', { player: passer, receiver, kind });
    return true;
  }

  // 依搖桿方向挑選傳球對象
  pickPassTarget(p, dx, dz, opts = {}) {
    const mates = this.onCourt(p.team).filter((m) => m !== p);
    const dl = Math.hypot(dx, dz);
    let ux, uz;
    if (dl > 0.3) { ux = dx / dl; uz = dz / dl; } else {
      if (opts.noDirFallback === 'best') return this.teams[p.team].ai.bestPassTarget(p, true);
      ux = Math.cos(p.facing); uz = Math.sin(p.facing);
    }
    let best = null, bs = -1e9;
    for (const m of mates) {
      const vx = m.pos.x - p.pos.x, vz = m.pos.z - p.pos.z;
      const d = Math.hypot(vx, vz) || 1;
      const cos = (vx * ux + vz * uz) / d;
      const s = cos * 3 - d * 0.12 + (cos > 0.6 ? 1 : 0);
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }

  // ---------- 抄截 ----------
  attemptSteal(p) {
    if (p.stealCooldown > 0 || p.action || p.airborne) return false;
    p.action = { type: 'steal', t: 0, dur: 0.34, slowMove: 0.5 };
    p.stealCooldown = 0.95;
    this.emit('stealTry', { player: p });
    return true;
  }

  resolveSteal(p) {
    const b = this.ball;
    const h = b.holder;
    if (!h || h.team === p.team || this.phase !== 'live') return;
    // 球的位置（運球手側）
    const bd = dist2(p.pos.x, p.pos.z, b.pos.x, b.pos.z);
    const hd = dist2(p.pos.x, p.pos.z, h.pos.x, h.pos.z);
    if (bd > 1.15 && hd > 1.25) return;
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    const toH = ((h.pos.x - p.pos.x) * fx + (h.pos.z - p.pos.z) * fz) / (hd || 1);
    // 是否從背後抄
    const hfx = Math.cos(h.facing), hfz = Math.sin(h.facing);
    const behind = ((p.pos.x - h.pos.x) * hfx + (p.pos.z - h.pos.z) * hfz) / (hd || 1) < -0.35;
    let ps = 0.1 + 0.3 * (p.rating('defense') / 100) - 0.24 * (h.rating('handle') / 100) + 0.08;
    if (bd < 0.7) ps += 0.08;
    if (h.action && (h.action.type === 'pass' || (h.action.type === 'shot' && !h.action.jumped))) ps += 0.12;
    if (h.action && h.action.type === 'move') ps -= 0.06;
    if (toH < 0.2) ps *= 0.4;
    if (!p.human) ps *= this.diff.stealRate * 0.9 + 0.1;
    if (this.beat) ps += this.beat.stealBonus(p); // HOOPBEAT: 抄截踩拍點
    ps = clamp(ps, 0.02, this.beat ? 0.6 : 0.45);
    if (this.rng.chance(ps)) {
      if (this.rng.chance(0.55)) {
        p.stats.stl++;
        h.stats.tov++;
        this.emit('steal', { player: p, victim: h });
        this.message(`${p.name} 抄截！`, 'steal', p.team);
        this.gainBall(p, 'steal');
      } else {
        // 撥掉
        b.release('loose');
        b.pos = { x: b.pos.x, y: Math.max(0.6, b.pos.y), z: b.pos.z };
        const ang = p.facing + this.rng.range(-0.8, 0.8);
        b.vel = { x: Math.cos(ang) * 3.2, y: 1.2, z: Math.sin(ang) * 3.2 };
        b.lastTouch = p;
        b.lastTouchTeam = p.team;
        b.deflect = { by: p, from: h };
        b.noGrab = 0.15;
        b.noGrabPlayer = h;
        this.emit('deflect', { player: p });
      }
      return;
    }
    // 失敗：有機率犯規
    let pf = 0.09 + (behind ? 0.22 : 0) + (bd > 0.9 ? 0.06 : 0);
    pf *= 1.2 - 0.4 * (p.rating('defense') / 100);
    if (this.beat) pf *= this.beat.foulMul(p.team); // HOOPBEAT
    if (this.rng.chance(pf)) this.callFoul(p, h, { shooting: false });
  }

  callFoul(fouler, victim, { shooting = false } = {}) {
    fouler.stats.pf++;
    const res = R.registerFoul(this.rules, fouler.team, { shooting });
    this.emit('whistle');
    this.message(`${fouler.name} 犯規`, 'foul', fouler.team);
    if (res.freeThrows > 0) {
      this.message(`加罰狀態：罰球 ${res.freeThrows} 次`, 'info', victim.team);
      this.deadBall(1.3, { kind: 'ft', shooter: victim, total: res.freeThrows });
    } else {
      const spot = this.sidelineSpot(victim.pos.x, victim.pos.z);
      this.deadBall(1.1, { kind: 'inbound', team: victim.team, spot });
    }
  }

  // ---------- 跳起（蓋火鍋／搶籃板） ----------
  jumpPlayer(p, kind = 'block') {
    if (p.airborne || p.jumpCooldown > 0) return false;
    if (p.action && p.action.lockMove) return false;
    p.vy = p.jumpVelocity(kind);
    p.jumpCooldown = 0.45;
    p.action = { type: 'jump', t: 0, kind };
    // 起跳時保留一點水平速度
    p.vel.x *= 0.6; p.vel.z *= 0.6;
    this.emit('jump', { player: p });
    return true;
  }

  // 空中接力的接球者起跳
  alleyJump(p) {
    if (p.airborne) return;
    p.vy = 3.9 + 0.6 * p.athletic;
    p.action = { type: 'alley', t: 0, caught: false };
  }

  // ---------- 運球過人 ----------
  dribbleMove(p, dx, dz) {
    if (p.moveCooldown > 0 || p.action || this.ball.holder !== p || p.airborne) return false;
    const dl = Math.hypot(dx, dz);
    let ux, uz;
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    if (dl > 0.3) { ux = dx / dl; uz = dz / dl; } else { ux = -fz * p.anim.dribbleHand; uz = fx * p.anim.dribbleHand; }
    const rel = Math.abs(wrapAngle(Math.atan2(uz, ux) - p.facing));
    const kind = rel > 2.0 ? 'spin' : 'cross';
    const sp = p.maxSpeed(true) * (kind === 'spin' ? 1.05 : 1.18);
    p.action = {
      type: 'move', kind, t: 0, dur: kind === 'spin' ? 0.44 : 0.32,
      forceVel: { x: ux * sp, z: uz * sp }, lockFace: kind === 'spin',
    };
    p.moveCooldown = 0.85;
    if (kind === 'cross') p.anim.dribbleHand *= -1;
    else p.anim.spin = 1;
    // 對防守者的影響
    let def = null, dd = 99;
    for (const d of this.onCourt(1 - p.team)) {
      const k = dist2(d.pos.x, d.pos.z, p.pos.x, p.pos.z);
      if (k < dd) { dd = k; def = d; }
    }
    if (def && dd < 1.9 && !def.airborne) {
      let pb = 0.2 + 0.45 * (p.rating('handle') / 100) - 0.36 * (def.rating('defense') / 100);
      if (def.ctrl.stance) pb -= 0.06;
      if (!def.human && def.ratingMul !== 1) pb /= this.diff.stealRate * 0.3 + 0.7;
      const dob = this.beat ? this.beat.dribbleOutcome(p) : { bonus: 0, fumble: 0 }; // HOOPBEAT: 過人踩拍點 + 律動
      pb += dob.bonus;
      pb = clamp(pb, 0.05, this.beat ? 0.8 : 0.6);
      const roll = this.rng.next();
      if (roll < pb) {
        const ankle = roll < pb * 0.3;
        def.action = { type: 'stumble', t: 0, dur: ankle ? 0.95 : 0.5, lockMove: true, fall: ankle };
        def.vel.x *= 0.2; def.vel.z *= 0.2;
        if (ankle) this.message(`${p.name} 晃倒防守者！`, 'ankle', p.team);
      } else if (this.rng.chance(0.05 * (1.2 - p.rating('handle') / 100) + dob.fumble)) {
        // 運球失誤
        const b = this.ball;
        b.release('loose');
        b.pos.y = 0.5;
        b.vel = { x: ux * 2.5 + this.rng.range(-1, 1), y: 1.5, z: uz * 2.5 + this.rng.range(-1, 1) };
        b.lastTouch = p; b.lastTouchTeam = p.team;
        b.noGrab = 0.25; b.noGrabPlayer = p;
        b.fumble = p;
        this.message(`${p.name} 運球失誤`, 'turnover', p.team);
      }
    }
    this.emit('dribbleMove', { player: p, kind });
    return true;
  }

  // ---------- 持球位置（運球動畫） ----------
  heldBallPosition(p, dt) {
    const b = this.ball;
    const a = p.action;
    const f = p.facing;
    const fx = Math.cos(f), fz = Math.sin(f);
    const sx = -fz, sz = fx;
    if (a && a.type === 'alley') {
      b.pos.x = p.pos.x + fx * 0.25;
      b.pos.z = p.pos.z + fz * 0.25;
      b.pos.y = p.y + p.height * 1.25;
      return;
    }
    if (a && a.type === 'shot') {
      if (a.kind === 'jump' || a.kind === 'ft') {
        const k = clamp(a.t / Math.max(0.05, a.gather + 0.08), 0, 1);
        b.pos.x = p.pos.x + fx * (0.3 - 0.12 * k);
        b.pos.z = p.pos.z + fz * (0.3 - 0.12 * k);
        b.pos.y = p.y + p.height * (0.62 + 0.42 * k);
      } else {
        const k = clamp(a.t / 0.3, 0, 1);
        b.pos.x = p.pos.x + fx * 0.35;
        b.pos.z = p.pos.z + fz * 0.35;
        b.pos.y = p.y + p.height * (0.7 + 0.5 * k);
      }
      return;
    }
    if ((a && a.type === 'inbound') || this.phase === 'freethrow' || this.phase === 'inbound') {
      b.pos.x = p.pos.x + fx * 0.32;
      b.pos.z = p.pos.z + fz * 0.32;
      b.pos.y = p.y + p.height * 0.62;
      return;
    }
    const sp = len2(p.vel.x, p.vel.z);
    if (sp > 0.25) p.anim.dribbling = true;
    if (!p.anim.dribbling) {
      b.pos.x = p.pos.x + fx * 0.32;
      b.pos.z = p.pos.z + fz * 0.32;
      b.pos.y = p.y + p.height * 0.6;
      return;
    }
    const prev = p.anim.dribblePhase;
    const freq = 1.75 + 0.18 * sp;
    p.anim.dribblePhase = (prev + dt * freq) % 1;
    if (prev < 0.5 && p.anim.dribblePhase >= 0.5) this.emit('bounce', { x: b.pos.x, z: b.pos.z, dribble: true, player: p });
    const hand = p.anim.dribbleHand;
    let side = 0.3 * hand, fwd = 0.3 + Math.min(0.14, sp * 0.03);
    if (a && a.type === 'move') {
      const k = clamp(a.t / (a.dur * 0.7), 0, 1);
      side = a.kind === 'cross' ? -0.3 * hand * (1 - 2 * k) : 0.3 * hand * Math.cos(k * Math.PI * 2);
      fwd = 0.2;
    }
    const handY = p.y + p.height * 0.47;
    const ph = p.anim.dribblePhase;
    const hgt = BALL_R + (handY - BALL_R) * Math.abs(Math.cos(Math.PI * ph));
    b.pos.x = p.pos.x + fx * fwd + sx * side + p.vel.x * 0.02;
    b.pos.z = p.pos.z + fz * fwd + sz * side + p.vel.z * 0.02;
    b.pos.y = hgt;
  }

  // ---------- 球的更新 ----------
  updateBall(dt) {
    const b = this.ball;
    b.noGrab = Math.max(0, b.noGrab - dt);
    if (this.phase === 'tipoff' && !this.pd.tossed) return;
    if (b.state === 'held') {
      b.untouchedTime = 0;
      if (b.holder) this.heldBallPosition(b.holder, dt);
      return;
    }
    b.untouchedTime += dt;
    const self = this;
    b.integrate(dt, {
      onRim(side, sp) {
        if (b.shot) b.shot.rimTouched = true;
        if (self.time - b.lastRimSound > 0.06) { self.emit('rim', { side, speed: sp }); b.lastRimSound = self.time; }
        if (b.pass) { b.pass = null; b.state = 'loose'; }
      },
      onBoard(side, sp) {
        if (b.shot) b.shot.boardTouched = true;
        if (self.time - b.lastBoardSound > 0.08) { self.emit('board', { side, speed: sp }); b.lastBoardSound = self.time; }
      },
      onFloor(sp) {
        self.emit('bounce', { x: b.pos.x, z: b.pos.z, speed: sp });
      },
      onScore(side) { self.onScore(side); },
      onSubstep() { return self.ballContacts(); },
    });
    if (!isFiniteNum(b.pos.x) || !isFiniteNum(b.pos.y) || !isFiniteNum(b.pos.z)) {
      // 保險：數值異常時重置到中場
      b.pos = { x: 0, y: 1, z: 0 }; b.vel = { x: 0, y: 0, z: 0 };
    }
    if (b.state !== 'held') this.looseBallPickup();
    this.checkShotResolution();
    this.checkBallOutOfBounds();
  }

  // 每個子步驟檢查接球、抄截、火鍋、撿球。回傳 true 表示球被拿到。
  ballContacts() {
    const b = this.ball;
    if (b.state === 'held') return true;
    if (this.phase === 'tipoff' || this.phase === 'dead' || this.phase === 'gameOver' || this.phase === 'periodBreak') return false;
    if (this.phase === 'freethrow' || this.phase === 'afterScore') return false;
    const court = this.everyoneOnCourt();
    // 火鍋
    if (b.shot && !b.shot.resolved && !b.shot.blocked && b.shot.kind !== 'ft' && b.shot.kind !== 'dunk' && this.time - b.shot.releaseTime < 0.42 && b.vel.y > -1.0) {
      for (const d of this.onCourt(1 - b.shot.team)) {
        if (b.shot.blockChecked.has(d) || !d.airborne) continue;
        const hd = dist2(d.pos.x, d.pos.z, b.pos.x, b.pos.z);
        const reach = d.handReach + 0.1;
        if (hd < 0.95 && b.pos.y < reach && b.pos.y > reach - 0.75) {
          b.shot.blockChecked.add(d);
          const sh = b.shot.shooter;
          let pb = 0.08 + 0.32 * (d.rating('block') / 100) + (d.height - sh.height) * 0.6 - (b.shot.kind === 'jump' ? 0.1 : 0);
          if (!d.human) pb *= this.diff.blockRate;
          if (this.beat) pb += this.beat.blockBonus(d); // HOOPBEAT: 蓋火鍋踩拍點
          pb = clamp(pb, 0.03, 0.65);
          if (this.rng.chance(pb)) {
            b.shot.blocked = true;
            b.shot.made = false;
            d.stats.blk++;
            const ang = Math.atan2(b.pos.z - d.pos.z, b.pos.x - d.pos.x) + this.rng.range(-0.7, 0.7);
            const sp = this.rng.range(3, 6);
            b.vel = { x: Math.cos(ang) * sp, y: this.rng.range(-1.5, 1.5), z: Math.sin(ang) * sp };
            b.state = 'loose';
            b.lastTouch = d; b.lastTouchTeam = d.team;
            b.noGrab = 0.2; b.noGrabPlayer = d;
            this.emit('block', { player: d, victim: sh });
            this.message(`${d.name} 火鍋！`, 'block', d.team);
            break;
          }
        }
      }
    }
    // 傳球：接球與抄截
    if (b.pass && b.state === 'flight') {
      const ps = b.pass;
      const rc = ps.receiver;
      for (const p of court) {
        if (p === ps.passer && b.noGrab > 0) continue;
        if (p.team !== ps.passer.team && !ps.checked.has(p)) {
          const hd = dist2(p.pos.x, p.pos.z, b.pos.x, b.pos.z);
          const reach = p.handReach + 0.15;
          if (hd < 0.62 && b.pos.y < reach && b.pos.y > 0.3) {
            ps.checked.add(p);
            let pi = (0.03 + 0.2 * (p.rating('defense') / 100)) * (ps.kind === 'chest' ? 1 : 0.55);
            if (!p.human) pi *= this.diff.interceptMul;
            if (p.airborne) pi += 0.15;
            if (ps.inbound) pi *= 0.6;
            if (this.beat) pi *= this.beat.interceptMul(ps.passer.team, p.team); // HOOPBEAT: 傳球準度 vs 抄截意願
            if (this.rng.chance(clamp(pi, 0.03, 0.75))) {
              if (this.rng.chance(0.6)) {
                p.stats.stl++;
                ps.passer.stats.tov++;
                this.message(`${p.name} 抄截！`, 'steal', p.team);
                this.emit('steal', { player: p, victim: ps.passer });
                this.gainBall(p, 'intercept');
                return true;
              }
              b.pass = null;
              b.state = 'loose';
              const sp = Math.hypot(b.vel.x, b.vel.z);
              b.vel.x = -b.vel.x * 0.3 + this.rng.range(-2, 2);
              b.vel.z = -b.vel.z * 0.3 + this.rng.range(-2, 2);
              b.vel.y = 1.0 + sp * 0.05;
              b.lastTouch = p; b.lastTouchTeam = p.team;
              b.deflect = { by: p, from: ps.passer };
              this.emit('deflect', { player: p });
              return false;
            }
          }
        }
      }
      if (rc.onCourt) {
        const cy = rc.y + rc.height * 0.62;
        const d3 = Math.hypot(rc.pos.x - b.pos.x, (rc.ai.alley ? rc.handReach - 0.2 : cy) - b.pos.y, rc.pos.z - b.pos.z);
        const hd = dist2(rc.pos.x, rc.pos.z, b.pos.x, b.pos.z);
        if (rc.action && rc.action.type === 'alley' && hd < 0.9 && b.pos.y < rc.handReach + 0.3 && b.pos.y > rc.handReach - 0.9) {
          // 空中接到
          this.catchAlley(rc);
          return true;
        }
        if (d3 < 0.7 || (hd < 0.55 && b.pos.y < rc.handReach + 0.2 && b.pos.y > 0.3)) {
          if (!rc.ai.alley || !rc.airborne) {
            this.gainBall(rc, 'pass');
            return true;
          }
        }
      }
      if (this.time - ps.start > ps.T + 0.5) { b.looseFromPass = ps.passer; b.pass = null; b.state = 'loose'; }
    }
    return false;
  }

  // 每一步檢查一次撿球／搶籃板
  looseBallPickup() {
    const b = this.ball;
    if (b.state === 'held' || this.phase !== 'live') return false;
    const court = this.everyoneOnCourt();
    // 鬆球／籃板
    if (b.state === 'loose' || (b.state === 'flight' && !b.pass && (!b.shot || b.shot.resolved || b.shot.rimTouched || b.shot.boardTouched || b.shot.blocked))) {
      if (b.noGrab > 0 && !b.noGrabPlayer) return false;
      const cands = [];
      for (const p of court) {
        if (b.noGrab > 0 && p === b.noGrabPlayer) continue;
        if (p.action && p.action.type === 'shot') continue;
        if (p.action && p.action.type === 'stumble' && p.action.fall) continue;
        const hd = dist2(p.pos.x, p.pos.z, b.pos.x, b.pos.z);
        const gr = 0.5 + 0.12 * (p.rating('rebound') / 100);
        if (hd > gr) continue;
        if (b.pos.y > p.handReach + 0.12) continue;
        // 球還在籃框上方附近時不能撈（避免干擾球）
        if (b.shot && !b.shot.resolved && b.pos.y > COURT.rimY - 0.1 && Math.hypot(b.pos.x - b.shot.side * COURT.hoopX, b.pos.z) < 0.6) continue;
        cands.push(p);
      }
      if (cands.length) {
        const hoop = b.shot ? hoopOf(b.shot.side) : null;
        const w = (p) => {
          let s = 0.45 + p.rating('rebound') / 100 + (p.height - 1.95) * 1.4;
          if (p.airborne) s *= 1.35;
          if (b.pos.y < 1.3) s = 1;
          if (this.beat) s *= this.beat.reboundMul(p.team); // HOOPBEAT: 貝斯 → 籃板
          if (hoop) {
            const myD = dist2(p.pos.x, p.pos.z, hoop.x, hoop.z);
            for (const o of cands) if (o.team !== p.team && dist2(o.pos.x, o.pos.z, hoop.x, hoop.z) > myD + 0.2) s *= 1.25;
          }
          return s;
        };
        const grabP = b.pos.y < 1.3 ? 0.5 : 0.22;
        if (this.rng.chance(grabP + 0.12 * cands.length)) {
          const pick = this.rng.weighted(cands, w);
          this.gainBall(pick, 'loose');
          return true;
        }
      }
    }
    return false;
  }

  catchAlley(rc) {
    const b = this.ball;
    const ps = b.pass;
    b.setHeld(rc);
    b.pass = null;
    rc.lastReceive = { from: ps.passer, time: this.time };
    const side = this.attackSide(rc.team);
    const hoop = hoopOf(side);
    const hd = dist2(rc.pos.x, rc.pos.z, hoop.x, hoop.z);
    let prob = 0.55 + 0.25 * (rc.rating('inside') / 100) + 0.15 * clamp(dunkAbility(rc) - 0.7, 0, 0.6) + 0.1 * (ps.passer.rating('handle') / 100);
    prob -= 0.3 * Math.min(1, contestAt(this, rc, rc.pos.x, rc.pos.z));
    prob -= Math.max(0, hd - 1.2) * 0.25;
    if (this.rules.possession !== rc.team) R.gainPossession(this.rules, rc.team);
    rc.action.caught = true;
    rc.action.caughtAt = rc.action.t;
    rc.action.prob = clamp(prob, 0.15, 0.92);
    rc.ai.alley = null;
    if (!this.rules.clockRunning && this.rules.gameClock > 0) this.rules.clockRunning = true;
    this.emit('alleyCatch', { player: rc });
  }

  // 球員拿到球
  gainBall(p, how) {
    const b = this.ball;
    const r = this.rules;
    const shot = b.shot;
    const rimTouched = !!(shot && (shot.rimTouched || shot.boardTouched) && shot.team === p.team);
    if (shot && !shot.resolved) this.resolveShot(false);
    if (this.phase !== 'live') return;
    if (shot && how === 'loose') {
      if (shot.team === p.team) p.stats.oreb++; else p.stats.dreb++;
      p.stats.reb++;
      this.emit('rebound', { player: p, offensive: shot.team === p.team });
    }
    if (b.deflect && how === 'loose') {
      if (b.deflect.by.team === p.team && b.deflect.from.team !== p.team) {
        b.deflect.by.stats.stl++;
        b.deflect.from.stats.tov++;
        this.message(`${b.deflect.by.name} 抄截！`, 'steal', p.team);
        this.emit('steal', { player: b.deflect.by, victim: b.deflect.from });
      }
    }
    if (b.fumble && b.fumble.team !== p.team && how === 'loose') b.fumble.stats.tov++;
    if (how === 'loose' && !shot && !b.deflect && !b.fumble && b.looseFromPass && b.looseFromPass.team !== p.team) {
      b.looseFromPass.stats.tov++;
    }
    b.looseFromPass = null;
    if (how === 'pass' && b.pass) {
      p.lastReceive = { from: b.pass.passer, time: this.time };
    }
    const wasPass = b.pass;
    b.deflect = null;
    b.fumble = null;
    b.setHeld(p);
    b.shot = null;
    p.anim.dribbling = false;
    p.ai.hold = 0;
    p.ai.catchTarget = null;
    p.ai.alley = null;
    if (p.action && (p.action.type === 'jump' || p.action.type === 'steal' || p.action.type === 'alley')) p.action = null;
    this.lastTouchTime = this.time;
    if (this.tipPending) {
      this.tipPending = false;
      if (r.period === 1) r.tipWinner = p.team;
    }
    const res = R.gainPossession(r, p.team, { rimTouched });
    if (rimTouched || res.changed) this.stats.shotClockResets++;
    if (!r.clockRunning && r.gameClock > 0 && !this.buzzerPending) r.clockRunning = true;
    if (!r.shotClockRunning) r.shotClockRunning = true;
    if (res.changed) this.onPossessionChange(p.team, how);
    autoAssignHumans(this, false, { gained: p, passer: wasPass ? wasPass.passer : null, changed: res.changed });
    if (res.violation) this.shotClockViolation();
  }

  onPossessionChange(team, how) {
    this.stats.possessions++;
    for (const t of this.teams) t.ai.onPossessionChange(team === t.index, how);
    this.emit('possession', { team, how });
  }

  resolveShot(scored) {
    const s = this.ball.shot;
    if (!s || s.resolved) return;
    s.resolved = true;
    s.scored = scored;
    if (this.pendingFoul && this.pendingFoul.shooter === s.shooter) {
      const pf = this.pendingFoul;
      this.pendingFoul = null;
      const res = R.registerFoul(this.rules, pf.fouler.team, { shooting: true, shotPoints: pf.points, made: scored });
      if (scored) this.message('進球加罰！', 'andone', s.team);
      this.deadBall(scored ? 1.6 : 1.2, { kind: 'ft', shooter: s.shooter, total: res.freeThrows });
      return;
    }
    if (s.kind === 'ft' && this.phase === 'freethrow' && !s.ftLast) {
      if (scored) { s.shooter.stats.ftm++; }
      this.deadBall(0.9, { kind: 'ftNext' });
    }
  }

  checkShotResolution() {
    const b = this.ball;
    const s = b.shot;
    if (!s || s.resolved) return;
    if (b.pos.y < COURT.rimY - 0.55 && b.vel.y < 0 && b.flightTime > 0.25) this.resolveShot(false);
    else if (b.floorTouched) this.resolveShot(false);
    else if (this.time - s.releaseTime > s.T + 2.5) this.resolveShot(false);
  }

  onScore(side) {
    const b = this.ball;
    if (this.phase === 'afterScore' || this.phase === 'dead') return;
    const team = this.teamAttacking(side);
    const s = b.shot;
    if (s && s.scored) return;
    let pts = 2;
    let scorer = null;
    if (s && s.side === side && s.team === team) {
      pts = s.points;
      scorer = s.shooter;
    } else if (b.lastTouch && b.lastTouch.team === team) {
      scorer = b.lastTouch;
      scorer.stats.fga++;
    }
    if (s) s.scored = true;
    // 比賽時間結束後才出手的球不算
    const late = s && s.kind !== 'ft' && this.rules.gameClock <= 0 && !this.buzzerPending;
    if (late) return;
    R.scoreBasket(this.rules, team, pts);
    if (scorer) {
      scorer.stats.pts += pts;
      if (s && s.kind === 'ft') { /* ftm 在下面處理 */ } else {
        scorer.stats.fgm++;
        if (pts === 3) scorer.stats.tpm++;
      }
      scorer.anim.celebrate = 1.2;
    }
    if (s && s.assister && s.kind !== 'ft') s.assister.stats.ast++;
    this.emit('score', { team, points: pts, player: scorer, kind: s ? s.kind : 'tip', side, assister: s ? s.assister : null });
    if (s && s.kind !== 'ft') {
      if (pts === 3) this.message(`${scorer ? scorer.name : ''} 三分命中！`, 'three', team);
      else if (s.kind === 'dunk') this.message(s.alley ? '空中接力灌籃！' : `${scorer.name} 灌籃！`, 'dunk', team);
    }
    // 判斷接下來的流程
    if (s && s.kind === 'ft') {
      s.shooter.stats.ftm++;
      s.resolved = true;
      if (!s.ftLast) {
        this.deadBall(0.9, { kind: 'ftNext' });
        return;
      }
    } else if (s) {
      this.resolveShot(true);
      if (this.phase === 'dead') return; // 進算加罰
    }
    if (this.buzzerPending || this.rules.gameClock <= 0) {
      this.deadBall(1.0, { kind: 'periodEnd' });
      return;
    }
    // 底線發球
    const r = this.rules;
    if (r.period >= r.periods && r.gameClock <= 120) r.clockRunning = false;
    const other = 1 - team;
    const spot = this.baselineSpot(side);
    const allMates = this.onCourt(other);
    const mates = allMates.filter((p) => !p.human).length ? allMates.filter((p) => !p.human) : allMates;
    const inbounder = mates.reduce((a, p) => (dist2(p.pos.x, p.pos.z, spot.x, spot.z) - (p.role >= 3 ? 2 : 0) < dist2(a.pos.x, a.pos.z, spot.x, spot.z) - (a.role >= 3 ? 2 : 0) ? p : a));
    for (const p of this.everyoneOnCourt()) if (p.action && p.action.type !== 'shot' && p.action.type !== 'land') p.action = null;
    this.setPhase('afterScore', { team: other, spot, inbounder, side });
    r.possession = other;
    R.resetShotClock(r, R.SHOT_CLOCK_FULL);
    r.shotClockRunning = false;
    this.onPossessionChange(other, 'score');
  }

  checkBallOutOfBounds() {
    const b = this.ball;
    if (this.phase !== 'live') return;
    if (b.state === 'held') return;
    const out = !R.isInBounds(b.pos.x, b.pos.z);
    const touchingFloor = b.pos.y <= BALL_R + 0.03;
    const far = Math.abs(b.pos.x) > 16 || Math.abs(b.pos.z) > 9.5;
    if ((out && touchingFloor) || far) {
      if (b.pass && b.pass.inbound && !far && b.flightTime < 0.3) return;
      const s = b.shot;
      if (s && !s.resolved) this.resolveShot(false);
      if (this.phase !== 'live') return;
      const lastTeam = b.lastTouchTeam >= 0 ? b.lastTouchTeam : this.rules.possession;
      const team = 1 - lastTeam;
      if (b.pass && b.lastTouch) b.lastTouch.stats.tov++;
      this.emit('whistle');
      this.message('出界', 'oob', lastTeam);
      const spot = this.sidelineSpot(b.pos.x, b.pos.z);
      b.pass = null;
      this.deadBall(1.0, { kind: 'inbound', team, spot });
    }
  }

  checkHeldOutOfBounds() {
    const b = this.ball;
    const h = b.holder;
    if (!h || (h.action && h.action.type === 'inbound')) return;
    if (this.pd.inboundPass && this.time - this.lastTouchTime < 0.1) return;
    if (!R.isInBounds(h.pos.x, h.pos.z, -0.06)) {
      h.stats.tov++;
      this.emit('whistle');
      this.message(`${h.name} 踩線出界`, 'oob', h.team);
      const spot = this.sidelineSpot(h.pos.x, h.pos.z);
      this.deadBall(1.0, { kind: 'inbound', team: 1 - h.team, spot });
    }
  }

  // ---------- 碰撞 ----------
  resolveCollisions(court) {
    const n = court.length;
    for (let i = 0; i < n; i++) {
      const a = court[i];
      for (let j = i + 1; j < n; j++) {
        const c = court[j];
        const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z;
        const minD = a.radius + c.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD) continue;
        if (Math.abs(a.y - c.y) > 0.9) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, nz = dz / d;
        const pen = minD - d;
        const ma = this.mass(a), mc = this.mass(c);
        const ta = mc / (ma + mc), tc = ma / (ma + mc);
        a.pos.x -= nx * pen * ta; a.pos.z -= nz * pen * ta;
        c.pos.x += nx * pen * tc; c.pos.z += nz * pen * tc;
        // 互相衝撞時減速
        const rv = (c.vel.x - a.vel.x) * nx + (c.vel.z - a.vel.z) * nz;
        if (rv < 0) {
          a.vel.x += nx * rv * ta * 0.8; a.vel.z += nz * rv * ta * 0.8;
          c.vel.x -= nx * rv * tc * 0.8; c.vel.z -= nz * rv * tc * 0.8;
        }
      }
    }
    const holder = this.ball.holder;
    for (const p of court) {
      if (p.action && p.action.type === 'inbound') continue;
      p.pos.x = clamp(p.pos.x, -15.3, 15.3);
      p.pos.z = clamp(p.pos.z, -8.6, 8.6);
      // 電腦持球者不會自己踩出界（人類玩家要自己注意）
      if (p === holder && !p.human && this.phase === 'live') {
        p.pos.x = clamp(p.pos.x, -13.85, 13.85);
        p.pos.z = clamp(p.pos.z, -7.32, 7.32);
      }
      if (!isFiniteNum(p.pos.x) || !isFiniteNum(p.pos.z)) { p.pos.x = 0; p.pos.z = 0; p.vel.x = 0; p.vel.z = 0; }
      if (!isFiniteNum(p.y)) { p.y = 0; p.vy = 0; }
    }
  }

  mass(p) {
    let m = 1 + (p.height - 1.95) * 2.5;
    if (p.ctrl.stance) m += 0.6;
    if (p.ai.screenSet) m += 3;
    if (p.action && p.action.type === 'inbound') m += 50;
    if (this.phase === 'freethrow') m += 50;
    return Math.max(0.4, m);
  }

  // ---------- 換人 ----------
  autoSubstitute(force = false) {
    if (!this.opts.autoSub) return;
    for (const t of this.teams) {
      for (let role = 0; role < 5; role++) {
        const cur = t.lineup[role];
        if (cur.human && !force) continue;
        if (cur.stamina > 0.72) continue;
        const bench = t.players.filter((p) => !p.onCourt && p.stamina > 0.86);
        if (!bench.length) continue;
        const want = ['PG', 'SG', 'SF', 'PF', 'C'][role];
        const compat = (p) => {
          const order = ['PG', 'SG', 'SF', 'PF', 'C'];
          return Math.abs(order.indexOf(p.pos0) - order.indexOf(want));
        };
        bench.sort((a, b) => compat(a) - compat(b) || b.stamina - a.stamina);
        const sub = bench[0];
        if (compat(sub) > 1) continue;
        this.substitute(t.index, role, sub);
      }
    }
  }

  substitute(team, role, sub) {
    const t = this.teams[team];
    const out = t.lineup[role];
    if (out === sub) return;
    sub.pos.x = out.pos.x; sub.pos.z = out.pos.z;
    sub.facing = out.facing;
    sub.vel.x = 0; sub.vel.z = 0; sub.y = 0; sub.vy = 0;
    sub.action = null;
    sub.role = role;
    sub.onCourt = true;
    out.onCourt = false;
    out.role = -1;
    out.action = null;
    t.lineup[role] = sub;
    if (out.human) {
      const h = this.humans.find((x) => x.label === out.human);
      out.human = null;
      if (h) { h.player = sub; sub.human = h.label; }
    }
    if (this.ball.holder === out) this.ball.setHeld(sub);
    if (this.pd && this.pd.inbounder === out) this.pd.inbounder = sub;
    if (this.pd && this.pd.shooter === out) this.pd.shooter = sub;
    t.ai.onSubstitution(out, sub);
    this.emit('sub', { team, out, sub });
  }

  // ---------- 給畫面與測試用的快照 ----------
  snapshot() {
    const r = this.rules;
    return {
      phase: this.phase,
      period: r.period,
      gameClock: r.gameClock,
      shotClock: r.shotClock,
      score: [...r.score],
      possession: r.possession,
      ball: { ...this.ball.pos, state: this.ball.state, holder: this.ball.holder ? this.ball.holder.name : null },
      players: this.everyoneOnCourt().map((p) => ({ name: p.name, team: p.team, x: p.pos.x, z: p.pos.z, y: p.y, action: p.action ? p.action.type : null, human: p.human })),
    };
  }
}

export { PLAYER_R };
