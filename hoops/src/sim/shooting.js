// 投籃模型：出手類型、防守干擾、命中率、出手時機、拋物線目標點。
import { COURT, GRAVITY, BALL_R } from './constants.js';
import { pointsForShot } from './rules.js';
import { clamp, dist2 } from './util.js';

export function hoopOf(side) {
  return { x: side * COURT.hoopX, y: COURT.rimY, z: 0 };
}

// 灌籃能力 0..~1.3
export function dunkAbility(p) {
  return (p.r.inside * 0.55 + p.r.speed * 0.45) / 100 + (p.height - 1.88) * 1.6;
}

export function dunkRange(p) {
  const a = dunkAbility(p);
  if (a < 0.78) return 0;
  return clamp(1.6 + (a - 0.78) * 3.0, 1.6, 3.0);
}

// 防守干擾值（0 = 完全空檔，約 1 = 貼身干擾）。
export function contestAt(game, shooter, x, z) {
  const side = game.attackSide(shooter.team);
  const hoop = hoopOf(side);
  let ux = hoop.x - x, uz = hoop.z - z;
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul; uz /= ul;
  let best = 0, second = 0;
  for (const d of game.onCourt(1 - shooter.team)) {
    const dd = dist2(d.pos.x, d.pos.z, x, z);
    if (dd > 2.3) continue;
    const close = Math.pow(clamp((2.25 - dd) / 1.6, 0, 1), 1.5);
    const vx = (d.pos.x - x) / (dd || 1), vz = (d.pos.z - z) / (dd || 1);
    const front = ux * vx + uz * vz;
    const dir = 0.4 + 0.6 * clamp((front + 0.35) / 1.0, 0, 1);
    let hf = 1 + clamp((d.height - shooter.height) * 1.3, -0.3, 0.35);
    if (d.airborne) hf += 0.28;
    if (d.ctrl.stance) hf += 0.15;
    const df = 0.72 + 0.5 * (d.rating('defense') / 100);
    const c = close * dir * hf * df;
    if (c > best) { second = best; best = c; } else if (c > second) second = c;
  }
  return clamp(best + second * 0.3, 0, 1.25);
}

export function nearestDefenderDist(game, team, x, z) {
  let m = 99;
  for (const d of game.onCourt(1 - team)) m = Math.min(m, dist2(d.pos.x, d.pos.z, x, z));
  return m;
}

// 判斷這球是什麼出手類型。
export function chooseShotKind(game, p, { allowDunk = true } = {}) {
  const side = game.attackSide(p.team);
  const hoop = hoopOf(side);
  const d = dist2(p.pos.x, p.pos.z, hoop.x, hoop.z);
  const sp = Math.hypot(p.vel.x, p.vel.z);
  let toward = 0;
  if (sp > 0.5) toward = ((hoop.x - p.pos.x) * p.vel.x + (hoop.z - p.pos.z) * p.vel.z) / (d * sp || 1);
  const driving = sp > 2.2 && toward > 0.45;
  const dr = dunkRange(p);
  if (allowDunk && dr > 0 && d <= dr && (driving || d < 1.5)) {
    const contest = contestAt(game, p, p.pos.x, p.pos.z);
    if (contest < 0.85 || dunkAbility(p) > 1.05) return 'dunk';
  }
  if (d < 1.9 || (d < 3.1 && driving)) return 'layup';
  return 'jump';
}

// 基礎命中率（空檔、正常出手）。
export function baseMakeProb(p, kind, d, points) {
  const rin = p.rating('inside') / 100;
  const rmid = p.rating('mid') / 100;
  const r3 = p.rating('three') / 100;
  if (kind === 'dunk') return clamp(0.88 + 0.1 * rin, 0, 0.98);
  if (kind === 'layup') return clamp(0.56 + 0.34 * rin - 0.04 * Math.max(0, d - 1.2), 0.2, 0.92);
  if (kind === 'ft') {
    const ft = (rmid * 0.65 + r3 * 0.35);
    return clamp(0.4 + 0.52 * ft, 0.3, 0.95);
  }
  if (points === 3) {
    const p3 = 0.22 + 0.31 * r3 - 0.075 * Math.max(0, d - 7.4);
    return clamp(p3, 0.01, 0.6);
  }
  if (d < 4.0) {
    const r = rin * 0.55 + rmid * 0.45;
    return clamp(0.34 + 0.32 * r - 0.03 * (d - 2), 0.15, 0.72);
  }
  return clamp(0.27 + 0.33 * rmid - 0.018 * (d - 4), 0.1, 0.66);
}

export function contestPenalty(kind, contest) {
  const c = Math.min(contest, 1.2);
  if (kind === 'dunk') return 1 - 0.22 * c;
  if (kind === 'layup') return 1 - 0.38 * c;
  if (kind === 'ft') return 1;
  return 1 - 0.42 * c;
}

// 出手時機：delta = 實際出手時間 - 理想出手時間。回傳 { mul, grade }
export function timingResult(delta, rating01, windowMul = 1) {
  const perfect = 0.03 * (0.8 + 0.5 * rating01) * windowMul;
  const good = 0.085 * windowMul;
  const a = Math.abs(delta);
  if (a <= perfect) return { mul: 1.22, grade: 'perfect' };
  if (a <= good) return { mul: 1.0 - 0.22 * (a - perfect) / (good - perfect), grade: delta < 0 ? 'early' : 'late', mild: true };
  return { mul: Math.max(0.22, 0.72 - 3.0 * (a - good)), grade: delta < 0 ? 'early' : 'late', mild: false };
}

export function shotRating01(p, kind, points, d) {
  if (kind === 'ft') return (p.rating('mid') * 0.65 + p.rating('three') * 0.35) / 100;
  if (points === 3) return p.rating('three') / 100;
  if (d < 4) return (p.rating('inside') * 0.5 + p.rating('mid') * 0.5) / 100;
  return p.rating('mid') / 100;
}

// 給 AI 評估目前位置出手的期望值。
export function evaluateShot(game, p, x = p.pos.x, z = p.pos.z) {
  const side = game.attackSide(p.team);
  const hoop = hoopOf(side);
  const d = dist2(x, z, hoop.x, hoop.z);
  const points = pointsForShot(x, z, side);
  let kind = 'jump';
  const dr = dunkRange(p);
  if (dr > 0 && d < dr * 0.9) kind = 'dunk';
  else if (d < 2.4) kind = 'layup';
  const contest = contestAt(game, p, x, z);
  let prob = baseMakeProb(p, kind, d, points) * contestPenalty(kind, contest) * (0.88 + 0.12 * p.stamina);
  if (d > 9.5) prob *= 0.4;
  prob = clamp(prob, 0, 0.97);
  return { prob, points, ev: prob * points, d, kind, contest };
}

// 依結果決定目標點：進球瞄準籃框中心，沒進就瞄前框／後框／側框。
export function shotTarget(rng, hoop, from, made, badness = 0) {
  let ux = hoop.x - from.x, uz = hoop.z - from.z;
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul; uz /= ul;
  const px = -uz, pz = ux;
  let along = 0, lat = 0;
  if (made) {
    along = rng.range(-0.015, 0.03);
    lat = rng.range(-0.02, 0.02);
  } else {
    const r = rng.next();
    if (badness > 0.6 && rng.chance(0.35)) {
      // 大偏差：籃外空心或打板
      along = rng.chance(0.5) ? rng.range(-0.7, -0.4) : rng.range(0.38, 0.55);
      lat = rng.range(-0.35, 0.35);
    } else if (r < 0.42) {
      along = rng.range(-0.27, -0.19);
      lat = rng.range(-0.08, 0.08);
    } else if (r < 0.74) {
      along = rng.range(0.2, 0.33);
      lat = rng.range(-0.09, 0.09);
    } else {
      along = rng.range(-0.06, 0.08);
      lat = (rng.chance(0.5) ? 1 : -1) * rng.range(0.19, 0.27);
    }
  }
  return { x: hoop.x + ux * along + px * lat, y: COURT.rimY + 0.02, z: hoop.z + uz * along + pz * lat };
}

// 出手到籃框的飛行時間
export function flightTime(kind, d) {
  if (kind === 'layup') return 0.44 + 0.1 * d;
  if (kind === 'ft') return 0.95;
  return 0.78 + 0.072 * d;
}

export function releasePoint(p, kind) {
  const f = p.facing;
  const fwd = kind === 'layup' ? 0.35 : 0.18;
  return {
    x: p.pos.x + Math.cos(f) * fwd,
    y: kind === 'layup' ? p.height * 1.22 + p.y : p.height + 0.22 + p.y,
    z: p.pos.z + Math.sin(f) * fwd,
  };
}

export { GRAVITY, BALL_R };
