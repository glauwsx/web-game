// 賽車的 AI。純邏輯。
// 1. AI 顧客的結果：不即時跑賽車，用公式決定贏過哪幾款壽司（計劃書 9.6）。
// 2. 自動駕駛：測試用，也是除錯用的「幫我開」。以固定速度比例行駛，走理想路線。
import { RACE as R } from '../../data/balance.js';
import { TRACKS } from '../../data/tracks.js';
import { rngNormal, rngRange } from '../../core/rng.js';
import { SUSHI } from '../../data/sushi.js';
import { segmentAt, totalDist, createRace, stepRace, playerCar, placeOf, rivalRatio, wonSushi } from './physics.js';

/** AI 顧客的駕駛技術（整場的平均速度比例）。type：'normal'、'raceFan'、'shumaha'。 */
export function aiSkill(type, rng) {
  const [a, b] = R.AI_SKILL[type] || R.AI_SKILL.normal;
  return a === b ? a : rngRange(rng, a, b);
}

/**
 * AI 顧客跑一場，贏過哪幾款壽司。level 是難度 1 到 5。回傳壽司 id 的陣列（照 LINEUP 的順序，可能是空的）。
 * 這一場的表現 = 駕駛技術 + 常態分布(0, AI_NOISE)。表現比某台壽司車的速度比例高，就贏過那一台。
 */
export function aiWon(skill, level, rng) {
  const perf = skill + rngNormal(rng, 0, R.AI_NOISE);
  return R.LINEUP.filter((_, i) => perf > rivalRatio(level, i));
}

/** 一場的獎品：贏過的每一款各一貫。一台都沒贏過，安慰獎是自己的小黃瓜捲一貫。 */
export function prizesFor(won) {
  return won.length ? won.slice() : [R.PLAYER_SUSHI];
}

/** 獎品的價值（參考售價合計）。 */
export function prizeValue(prizes) {
  return prizes.reduce((sum, id) => sum + SUSHI[id].ref, 0);
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
 * 用自動駕駛跑完一場。回傳 { place, time, integrity, won, race }。
 * opts 跟 createRace 相同，另外有 f（速度比例）和 avoidPads（不踩加速板，測試固定速度用）。
 */
export function runAutopilot(opts) {
  // 測試用：f 超過 1 時，讓這台車的最高速度跟著提高（真的玩家要靠噴射）
  const race = createRace({ ...opts, stats: { ...(opts.stats || {}), top: Math.max(1, opts.f) } });
  const p = playerCar(race);
  const maxSteps = 60 * 600;
  for (let i = 0; i < maxSteps && !race.over; i++) stepRace(race, autopilotInput(race, p, opts.f));
  return { place: placeOf(race, p), time: p.finishT, integrity: p.integrity, won: wonSushi(race), race };
}
