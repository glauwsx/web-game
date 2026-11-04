// 球員實體：位置、速度、動作狀態、體力與數據。
import { GRAVITY, PLAYER_R } from './constants.js';
import { approachAngle, clamp, len2 } from './util.js';

export function emptyStats() {
  return {
    pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, sec: 0,
  };
}

let nextId = 1;

export class Player {
  constructor(data, team, rosterIndex) {
    this.id = nextId++;
    this.data = data;
    this.name = data.name;
    this.number = data.number;
    this.pos0 = data.pos; // 位置代號 PG/SG...
    this.r = data.ratings;
    this.height = data.height / 100;
    this.team = team;
    this.rosterIndex = rosterIndex;
    this.role = rosterIndex; // 場上角色 0..4（PG..C）
    this.onCourt = false;
    this.pos = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.y = 0;
    this.vy = 0;
    this.facing = 0;
    this.radius = PLAYER_R * clamp(this.height / 2.0, 0.92, 1.1);
    this.action = null;
    this.ctrl = { mx: 0, mz: 0, sprint: false, stance: false, face: null };
    this.human = null;      // 控制這位球員的玩家編號（1P/2P），null 表示電腦
    this.stamina = 1;
    this.stealCooldown = 0;
    this.jumpCooldown = 0;
    this.moveCooldown = 0;
    this.stats = emptyStats();
    this.anim = {
      runPhase: Math.random() * 6, speed: 0, dribblePhase: 0, dribbling: false,
      dribbleHand: 1, stance: 0, lean: 0, celebrate: 0, spin: 0,
    };
    this.ai = { think: 0, target: null, mode: null, hold: 0 };
    this.lastReceive = null; // { from, time }
    this.ratingMul = 1;
  }

  // 綜合運動能力 0..1
  get athletic() {
    return clamp((this.r.speed * 0.45 + this.r.rebound * 0.2 + this.r.block * 0.15 + this.r.inside * 0.2) / 100, 0, 1);
  }

  rating(key) {
    return clamp(this.r[key] * this.ratingMul, 1, 105);
  }

  get standingReach() {
    return this.height * 1.33;
  }

  get handReach() {
    return this.standingReach + this.y;
  }

  get airborne() {
    return this.y > 0.02 || this.vy > 0;
  }

  jumpVelocity(kind = 'block') {
    const base = kind === 'shot' ? 2.65 : 3.25;
    const bonus = kind === 'shot' ? 0.25 : 0.95;
    const skill = kind === 'rebound' ? this.r.rebound : kind === 'block' ? this.r.block : this.r.speed;
    return base + bonus * clamp((skill * 0.55 + this.r.speed * 0.45) / 100, 0, 1) * this.ratingMul;
  }

  maxSpeed(hasBall) {
    let v = 3.75 + 1.55 * (this.rating('speed') / 100);
    if (this.ctrl.sprint) v *= hasBall ? 1.24 : 1.33;
    if (hasBall) v *= 0.94 - 0.06 * (1 - this.rating('handle') / 100);
    if (this.ctrl.stance) v *= 0.8;
    v *= 0.8 + 0.2 * this.stamina;
    return v;
  }

  // 每一步更新移動與跳躍。locked：動作中不能自由移動（例如投籃）。
  integrate(dt, hasBall) {
    const a = this.action;
    let control = 1;
    if (a) {
      if (a.lockMove) control = 0;
      else if (a.slowMove) control = a.slowMove;
    }
    if (this.airborne) control = 0;

    const ms = this.maxSpeed(hasBall);
    let mx = this.ctrl.mx, mz = this.ctrl.mz;
    const ml = len2(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const dvx = mx * ms * control, dvz = mz * ms * control;
    const accel = (control > 0 ? 15 + 10 * (this.rating('speed') / 100) : 4) * (ml < 0.05 ? 1.35 : 1);
    if (!this.airborne) {
      let ex = dvx - this.vel.x, ez = dvz - this.vel.z;
      const el = len2(ex, ez);
      const maxDv = accel * dt;
      if (el > maxDv) { ex *= maxDv / el; ez *= maxDv / el; }
      this.vel.x += ex;
      this.vel.z += ez;
    }
    if (a && a.forceVel) {
      this.vel.x = a.forceVel.x;
      this.vel.z = a.forceVel.z;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // 垂直方向
    if (this.y > 0 || this.vy > 0) {
      if (!(a && a.hang > 0)) this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.landed = true;
      }
    }

    // 面向
    let face = this.ctrl.face;
    const sp = len2(this.vel.x, this.vel.z);
    if (face == null && sp > 0.6) face = Math.atan2(this.vel.z, this.vel.x);
    if (face != null && !(a && a.lockFace)) {
      this.facing = approachAngle(this.facing, face, (this.airborne ? 4 : 11) * dt);
    }

    // 動畫參數
    this.anim.speed = sp;
    this.anim.runPhase += dt * (sp * 2.1 + (sp > 0.2 ? 1.2 : 0));
    this.anim.stance += ((this.ctrl.stance ? 1 : 0) - this.anim.stance) * Math.min(1, dt * 8);
    const lean = clamp(sp / 7, 0, 1) * (this.ctrl.sprint ? 1 : 0.6);
    this.anim.lean += (lean - this.anim.lean) * Math.min(1, dt * 5);
    if (this.anim.celebrate > 0) this.anim.celebrate = Math.max(0, this.anim.celebrate - dt);

    // 體力
    if (this.ctrl.sprint && sp > 3) this.stamina -= dt * 0.009;
    else if (sp > 2.5) this.stamina -= dt * 0.0025;
    else this.stamina += dt * 0.004;
    this.stamina = clamp(this.stamina, 0.25, 1);

    this.stealCooldown = Math.max(0, this.stealCooldown - dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.moveCooldown = Math.max(0, this.moveCooldown - dt);
  }
}
