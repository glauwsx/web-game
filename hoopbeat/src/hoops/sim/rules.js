// 純規則邏輯：計分、比賽時鐘、24 秒進攻時限、球權、犯規與罰球。
// 這個模組不依賴畫面或物理，方便寫單元測試。
import { COURT } from './constants.js';

export const SHOT_CLOCK_FULL = 24;
export const SHOT_CLOCK_OREB = 14;
export const BONUS_FOULS = 5; // 單節團隊第 5 次犯規起罰球

export function createRules({ quarterMinutes = 3, periods = 4 } = {}) {
  const periodLength = Math.round(quarterMinutes * 60);
  return {
    period: 1,
    periods,
    periodLength,
    otLength: Math.max(60, Math.round(periodLength / 2)),
    gameClock: periodLength,
    shotClock: SHOT_CLOCK_FULL,
    shotClockOff: false,
    clockRunning: false,
    shotClockRunning: true,
    score: [0, 0],
    periodScores: [[0], [0]],
    possession: -1,
    teamFouls: [0, 0],
    attackSide: [1, -1], // 上半場主隊進攻 +x 方向的籃框
    tipWinner: -1,
    finished: false,
    lastPeriodEndReason: null,
  };
}

export function isOvertime(r) {
  return r.period > r.periods;
}

export function periodLabel(r, period = r.period) {
  if (period <= r.periods) return `第${['一', '二', '三', '四', '五', '六'][period - 1] || period}節`;
  const n = period - r.periods;
  return n === 1 ? '延長賽' : `延長賽 ${n}`;
}

export function periodShort(r, period = r.period) {
  if (period <= r.periods) return `Q${period}`;
  const n = period - r.periods;
  return n === 1 ? 'OT' : `OT${n}`;
}

// 球在 (x,z) 出手，朝 side（+1 或 -1）方向的籃框進攻，算幾分。
export function isBeyondArc(x, z, side) {
  const hx = side * COURT.hoopX;
  const toward = side * (hx - x); // 從籃框往中場方向的距離（正值往中場）
  if (Math.abs(z) > COURT.threeCornerZ) {
    // 底角區：只要在底線之內、且在三分直線外側就是三分
    return true;
  }
  if (toward <= COURT.threeCornerDx) return false;
  const d = Math.hypot(x - hx, z);
  return d > COURT.threeR;
}

export function pointsForShot(x, z, side) {
  return isBeyondArc(x, z, side) ? 3 : 2;
}

export function isInBounds(x, z, margin = 0) {
  return Math.abs(x) <= COURT.halfLength - margin && Math.abs(z) <= COURT.halfWidth - margin;
}

export function hoopPosition(side) {
  return { x: side * COURT.hoopX, z: 0 };
}

// 時鐘前進。回傳事件陣列：'periodEnd'、'shotClockViolation'。
export function tickClocks(r, dt, { shotInFlight = false } = {}) {
  const events = [];
  if (r.finished || !r.clockRunning) return events;
  const before = r.gameClock;
  r.gameClock = Math.max(0, r.gameClock - dt);
  if (!r.shotClockOff && r.shotClockRunning && !shotInFlight) {
    const sBefore = r.shotClock;
    r.shotClock = Math.max(0, r.shotClock - dt);
    if (sBefore > 0 && r.shotClock <= 0 && r.gameClock > 0) events.push('shotClockViolation');
  }
  if (before > 0 && r.gameClock <= 0) {
    r.clockRunning = false;
    events.push('periodEnd');
  }
  return events;
}

export function resetShotClock(r, value = SHOT_CLOCK_FULL) {
  r.shotClock = value;
  r.shotClockRunning = true;
  // 比賽時間少於進攻時限時，關掉進攻計時器
  r.shotClockOff = r.gameClock < value;
}

// 某隊取得球權。ctx.rimTouched：這次球權是不是出手碰框後的籃板。
// 回傳 { changed, violation }。
export function gainPossession(r, team, { rimTouched = false } = {}) {
  if (team !== r.possession) {
    r.possession = team;
    resetShotClock(r, SHOT_CLOCK_FULL);
    return { changed: true, violation: false };
  }
  if (rimTouched) {
    if (r.shotClock < SHOT_CLOCK_OREB) resetShotClock(r, SHOT_CLOCK_OREB);
    else r.shotClockRunning = true;
    return { changed: false, violation: false };
  }
  // 同隊重新拿回球（例如被撥到但沒出手碰框）
  const violation = !r.shotClockOff && r.shotClock <= 0;
  return { changed: false, violation };
}

export function scoreBasket(r, team, points) {
  r.score[team] += points;
  const idx = r.period - 1;
  while (r.periodScores[team].length <= idx) r.periodScores[team].push(0);
  r.periodScores[team][idx] += points;
}

// 犯規處理。回傳 { freeThrows, inbound, shotClock }。
// shooting：是否為投籃犯規；shotPoints：那球價值；made：那球是否進了。
export function registerFoul(r, foulingTeam, { shooting = false, shotPoints = 2, made = false } = {}) {
  r.teamFouls[foulingTeam] += 1;
  if (shooting) {
    return { freeThrows: made ? 1 : shotPoints, inbound: false };
  }
  if (r.teamFouls[foulingTeam] >= BONUS_FOULS) {
    return { freeThrows: 2, inbound: false };
  }
  // 一般犯規：進攻方邊線發球，進攻時限不足 14 秒補到 14 秒
  if (r.shotClock < SHOT_CLOCK_OREB) resetShotClock(r, SHOT_CLOCK_OREB);
  return { freeThrows: 0, inbound: true };
}

export function inBonus(r, team) {
  return r.teamFouls[team] >= BONUS_FOULS - 1;
}

// 一節結束。回傳 { gameOver, overtime, halftime, possessionTeam }。
export function endPeriod(r) {
  r.clockRunning = false;
  const regulationDone = r.period >= r.periods;
  if (regulationDone && r.score[0] !== r.score[1]) {
    r.finished = true;
    return { gameOver: true, overtime: false, halftime: false, possessionTeam: -1 };
  }
  const wasPeriod = r.period;
  r.period += 1;
  r.teamFouls = [0, 0];
  for (const t of [0, 1]) while (r.periodScores[t].length < r.period) r.periodScores[t].push(0);
  const halftime = wasPeriod === Math.floor(r.periods / 2);
  if (halftime) r.attackSide = [r.attackSide[1], r.attackSide[0]];
  const overtime = r.period > r.periods;
  r.gameClock = overtime ? r.otLength : r.periodLength;
  r.shotClock = SHOT_CLOCK_FULL;
  r.shotClockOff = r.gameClock < SHOT_CLOCK_FULL;
  r.shotClockRunning = true;
  let possessionTeam = -1;
  if (!overtime && r.tipWinner >= 0) {
    // 交替球權：第二、三節給跳球輸的一方，第四節給跳球贏的一方
    const loser = 1 - r.tipWinner;
    possessionTeam = r.period === r.periods ? r.tipWinner : loser;
  }
  return { gameOver: false, overtime, halftime, possessionTeam };
}

export function winner(r) {
  if (!r.finished) return -1;
  return r.score[0] > r.score[1] ? 0 : 1;
}

export function formatClock(sec) {
  if (sec >= 60) {
    const s = Math.ceil(sec - 1e-6);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }
  return sec.toFixed(1);
}
