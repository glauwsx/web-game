// 籃球物理：重力、籃框鐵條、籃板、地板反彈，以及進球判定。
import { COURT, BALL_R, GRAVITY } from './constants.js';

const RIM_E = 0.55;      // 籃框反彈係數
const BOARD_E = 0.62;    // 籃板反彈係數
const FLOOR_E = 0.74;    // 地板反彈係數
const SUBSTEPS = 5;

export class Ball {
  constructor() {
    this.pos = { x: 0, y: 1.5, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.state = 'held'; // held | flight | loose
    this.holder = null;
    this.lastTouch = null;
    this.lastTouchTeam = -1;
    this.shot = null;   // 目前這球的投籃資訊（出手到球權確定前）
    this.pass = null;   // 傳球資訊
    this.spin = { x: 0, y: 0, z: 0 };
    this.rot = { x: 0, y: 0, z: 0 };
    this.flightTime = 0;
    this.noGrab = 0;     // 短時間內不能被撿起
    this.noGrabPlayer = null;
    this.floorTouched = false;
    this.lastRimSound = 0;
    this.lastBoardSound = 0;
    this.untouchedTime = 0; // 沒有人持球的累計時間（測試用）
  }

  setHeld(player) {
    this.state = 'held';
    this.holder = player;
    this.lastTouch = player;
    this.lastTouchTeam = player.team;
    this.pass = null;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.flightTime = 0;
    this.untouchedTime = 0;
  }

  release(state) {
    this.state = state;
    this.holder = null;
    this.flightTime = 0;
    this.floorTouched = false;
  }

  // 從 p0 在 T 秒內到 target 的初速度（無空氣阻力的拋物線）。
  static solveVelocity(p0, target, T) {
    return {
      x: (target.x - p0.x) / T,
      z: (target.z - p0.z) / T,
      y: (target.y - p0.y) / T + 0.5 * GRAVITY * T,
    };
  }

  // 粗略預測球落到 y=h 的水平位置（忽略碰撞），給 AI 搶籃板用。
  predictAt(h = 1.5, maxT = 2.0) {
    const p = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    const v = { x: this.vel.x, y: this.vel.y, z: this.vel.z };
    const dt = 1 / 30;
    for (let t = 0; t < maxT; t += dt) {
      v.y -= GRAVITY * dt;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      if (v.y < 0 && p.y <= h) break;
      if (p.y < BALL_R) { p.y = BALL_R; break; }
    }
    return p;
  }

  // 物理積分。cb：{ onRim(side, speed), onBoard(side, speed), onFloor(speed), onScore(side), onSubstep() }
  integrate(dt, cb) {
    const h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      const prevY = this.pos.y;
      this.vel.y -= GRAVITY * h;
      this.pos.x += this.vel.x * h;
      this.pos.y += this.vel.y * h;
      this.pos.z += this.vel.z * h;

      for (const side of [1, -1]) {
        this.collideRim(side, cb);
        this.collideBoard(side, cb);
        // 進球：由上往下穿過籃框平面，且在籃框內
        const hx = side * COURT.hoopX;
        if (prevY > COURT.rimY && this.pos.y <= COURT.rimY && this.vel.y < 0) {
          const d = Math.hypot(this.pos.x - hx, this.pos.z);
          if (d < COURT.rimR - 0.035) cb.onScore && cb.onScore(side);
        }
        this.collideStanchion(side);
      }

      // 地板
      if (this.pos.y < BALL_R) {
        this.pos.y = BALL_R;
        if (this.vel.y < 0) {
          const sp = -this.vel.y;
          this.vel.y = sp * FLOOR_E;
          this.vel.x *= 0.86;
          this.vel.z *= 0.86;
          if (this.vel.y < 0.45) this.vel.y = 0;
          this.floorTouched = true;
          if (sp > 0.6 && cb.onFloor) cb.onFloor(sp);
        }
        // 滾動摩擦
        if (this.vel.y === 0) {
          const f = Math.max(0, 1 - 0.9 * h);
          this.vel.x *= f;
          this.vel.z *= f;
        }
      }
      if (cb.onSubstep && cb.onSubstep()) break;
    }
    // 視覺旋轉
    this.rot.x += this.spin.x * dt;
    this.rot.y += this.spin.y * dt;
    this.rot.z += this.spin.z * dt;
    this.flightTime += dt;
  }

  collideRim(side, cb) {
    const hx = side * COURT.hoopX;
    const dx = this.pos.x - hx;
    const dz = this.pos.z;
    const dy = this.pos.y - COURT.rimY;
    if (Math.abs(dy) > 0.4 || Math.abs(dx) > 0.6 || Math.abs(dz) > 0.6) return;
    let L = Math.hypot(dx, dz);
    let ux, uz;
    if (L < 1e-6) { ux = 1; uz = 0; L = 0; } else { ux = dx / L; uz = dz / L; }
    // 籃框上最近的一點
    const qx = hx + ux * COURT.rimR;
    const qz = uz * COURT.rimR;
    const nx0 = this.pos.x - qx, ny0 = dy, nz0 = this.pos.z - qz;
    const d = Math.hypot(nx0, ny0, nz0);
    const minD = BALL_R + COURT.rimTube;
    if (d < minD && d > 1e-6) {
      const nx = nx0 / d, ny = ny0 / d, nz = nz0 / d;
      const pen = minD - d;
      this.pos.x += nx * pen;
      this.pos.y += ny * pen;
      this.pos.z += nz * pen;
      const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
      if (vn < 0) {
        this.vel.x -= (1 + RIM_E) * vn * nx;
        this.vel.y -= (1 + RIM_E) * vn * ny;
        this.vel.z -= (1 + RIM_E) * vn * nz;
        // 切線方向摩擦
        this.vel.x *= 0.92; this.vel.z *= 0.92;
        if (cb.onRim) cb.onRim(side, -vn);
      }
    }
  }

  collideBoard(side, cb) {
    const face = side * COURT.boardX; // 籃板正面
    const sx = side * this.pos.x;      // 以進攻方向為正的座標
    if (Math.abs(this.pos.z) > COURT.boardHalfW + BALL_R * 0.6) return;
    if (this.pos.y < COURT.boardBottom - BALL_R * 0.6 || this.pos.y > COURT.boardTop + BALL_R * 0.6) return;
    const front = COURT.boardX - BALL_R;
    if (sx > front && sx < COURT.boardX + 0.05) {
      this.pos.x = side * front;
      const vxs = side * this.vel.x;
      if (vxs > 0) {
        this.vel.x = -side * vxs * BOARD_E;
        this.vel.y *= 0.92; this.vel.z *= 0.92;
        if (cb.onBoard) cb.onBoard(side, vxs);
      }
    } else if (sx >= COURT.boardX + 0.05 && sx < COURT.boardX + 0.05 + BALL_R) {
      // 從後面打到籃板背面
      this.pos.x = side * (COURT.boardX + 0.05 + BALL_R);
      if (side * this.vel.x < 0) this.vel.x *= -0.5;
    }
    void face;
  }

  // 籃架底座（在底線外）：避免球穿過去
  collideStanchion(side) {
    const sx = side * this.pos.x;
    if (sx > 14.9 && sx < 16.2 && Math.abs(this.pos.z) < 0.8 && this.pos.y < 1.6) {
      if (side * this.vel.x > 0) this.vel.x *= -0.4;
      this.pos.x = side * 14.9;
    }
  }
}
