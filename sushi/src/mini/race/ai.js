// 賽車的 AI。純邏輯。
// 1. AI 顧客的名次：不即時跑賽車，用公式決定（計劃書 9.6）。
// 2. 自動駕駛：測試用，也是除錯用的「幫我開」。以固定速度比例行駛，走理想路線。
import { RACE as R } from '../../data/balance.js';
import { TRACKS } from '../../data/tracks.js';
import { rngNormal, rngRange } from '../../core/rng.js';
import { segmentAt, totalDist, createRace, stepRace, playerCar, placeOf } from './physics.js';

/** AI 顧客的駕駛技術。type：'normal'、'raceFan'、'shumaha'。 */
export function aiSkill(type, rng) {
  const [a, b] = R.AI_SKILL[type] || R.AI_SKILL.normal;
  return a === b ? a : rngRange(rng, a, b);
}

/**
 * AI 顧客的名次。level 是壽司車等級 1 到 5。回傳 1、2、3，或 4（第 4 名以後）。
 * 分數 = 駕駛技術 + 常態分布(0, 0.07) − θ
 */
export function aiPlace(skill, level, rng) {
  const score = skill + rngNormal(rng, 0, R.AI_NOISE) - R.THETA[level - 1];
  if (score > 0.10) return 1;
  if (score > 0) return 2;
  if (score > -0.10) return 3;
  return 4;
}

/** 名次對應的獎品。 */
export function prizeForPlace(place) {
  if (place === 1) return 'set_tokujo';
  if (place === 2) return 'set_jo';
  if (place === 3) return 'set_nami';
  return 'tier1';
}

/**
 * 自動駕駛的操作。f 是速度比例（相對於最高速度）。
 * 理想路線：進彎前先靠到彎道內側；前面有慢車就繞過去。
 */
export function autopilotInput(race, car, f) {
  const track = TRACKS[race.track];
  const si = segmentAt(track, car.z);
  // 往前看一小段，算平均彎度
  let c = 0;
  const look = 30;
  for (let i = 0; i < look; i++) c += track.segs[(si + i) % track.n].curve * (1 - i / look);
  c /= look / 2;
  // 彎度正數是右彎：內側在右邊（x 為正）
  const ideal = Math.max(-0.75, Math.min(0.75, c * 0.5));
  // 收集前方要閃開的東西：慢車和醬油水灘。每個是 { x, half }
  const blocks = [];
  for (const o of race.cars) {
    if (o === car || o.finished) continue;
    const gap = totalDist(race, o) - totalDist(race, car);
    if (gap > -R.CAR_LEN && gap < R.SEG_LEN * 10 && o.speed < car.speed + 300) blocks.push({ x: o.x, half: R.CAR_W * 1.25 });
  }
  for (let i = 0; i < 45; i++) {
    const it = track.itemAt[(si + i) % track.n];
    if (it && it.kind === 'puddle') blocks.push({ x: it.x, half: R.ITEM_W + R.CAR_W * 0.8 });
  }
  // 在幾條候選路線裡，選一條不會撞到東西、又最接近理想路線的
  let target = ideal;
  if (blocks.length) {
    let best = null;
    let bestScore = -Infinity;
    for (const x of [ideal, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]) {
      let clear = Infinity;
      for (const bl of blocks) clear = Math.min(clear, Math.abs(x - bl.x) - bl.half);
      // 沒被擋住的路線比離理想路線的距離；被擋住的比誰空隙大
      const score = clear >= 0 ? 10 - Math.abs(x - ideal) - Math.abs(x - car.x) * 0.3 : clear;
      if (score > bestScore) { bestScore = score; best = x; }
    }
    target = best;
  }
  const err = target - car.x;
  const steer = Math.max(-1, Math.min(1, err * 8));
  const want = R.MAX_SPEED * f;
  return { steer, accel: car.speed < want, brake: car.speed > want * 1.03, boost: false };
}

/**
 * 用自動駕駛跑完一場。回傳 { place, time, integrity, race }。
 * opts 跟 createRace 相同，另外有 f（速度比例）和 avoidPads（不踩加速板，測試固定速度用）。
 */
export function runAutopilot(opts) {
  // 測試用：f 超過 1 時，讓這台車的最高速度跟著提高（真的玩家要靠噴射）
  const race = createRace({ ...opts, stats: { ...(opts.stats || {}), top: Math.max(1, opts.f) } });
  const p = playerCar(race);
  const maxSteps = 60 * 600;
  for (let i = 0; i < maxSteps && !race.over; i++) stepRace(race, autopilotInput(race, p, opts.f));
  return { place: placeOf(race, p), time: p.finishT, integrity: p.integrity, race };
}
