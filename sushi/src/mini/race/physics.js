// 賽車物理。純邏輯。步長 1/60 秒。
// 比賽狀態是純 JSON：
//   race = { track, laps, t, started, over, cars: [...] }
//   car  = { id, kind: 'player' | 'shop' | 'shumaha', z（這一圈跑了多遠）, lap, x, speed, ratio,
//            boosts, boostT, slideT, integrity, hitT, finished, finishT, place, lane, stats }
import { RACE as R } from '../../data/balance.js';
import { TRACKS, SCENERY_X } from '../../data/tracks.js';

export function trackLength(track) {
  return track.n * R.SEG_LEN;
}

export function segmentAt(track, z) {
  const len = trackLength(track);
  const zz = ((z % len) + len) % len;
  return Math.floor(zz / R.SEG_LEN) % track.n;
}

/** 一台車總共跑了多遠（用來排名次）。 */
export function totalDist(race, car) {
  return car.lap * trackLength(TRACKS[race.track]) + car.z;
}

/**
 * 建立一場比賽。
 * opts = { track, level（壽司車等級 1–5）, shumaha（對手裡有沒有修馬哈）, laps,
 *          stats: { accel, top, handling }（玩家角色的倍率，預設都是 1）, rivals（對手幾台，預設 5）}
 */
export function createRace(opts) {
  const track = TRACKS[opts.track];
  const level = opts.level || 3;
  const n = opts.rivals ?? R.CARS - 1;
  const cars = [];
  for (let i = 0; i < n; i++) {
    const isShumaha = !!opts.shumaha && i === n - 1;
    // 同一場的壽司車速度有一點點差異，排在前面的稍快
    const ratio = isShumaha ? R.SHUMAHA_RATIO : R.SHOP_RATIO[level - 1] + R.SHOP_SPREAD * ((i / Math.max(1, n - 1)) * 2 - 1);
    const lane = [-0.55, 0.55, -0.2, 0.2, 0][i % 5];
    cars.push({
      id: i + 1, kind: isShumaha ? 'shumaha' : 'shop', z: (i + 1) * R.GRID_GAP, lap: 0, x: lane, lane,
      speed: 0, ratio, boosts: isShumaha ? R.BOOSTS : 0, boostT: 0, slideT: 0, integrity: 100, hitT: 0,
      finished: false, finishT: 0, place: 0,
    });
  }
  cars.push({
    id: 0, kind: 'player', z: 0, lap: 0, x: 0, lane: 0, speed: 0, ratio: 1,
    boosts: R.BOOSTS, boostT: 0, slideT: 0, integrity: 100, hitT: 0, offT: 0,
    finished: false, finishT: 0, place: 0,
    stats: { accel: 1, top: 1, handling: 1, ...(opts.stats || {}) },
  });
  return { track: track.id, laps: opts.laps || R.LAPS, level, t: 0, over: false, cars, events: [] };
}

export function playerCar(race) {
  return race.cars[race.cars.length - 1];
}

/** 前進並處理過終點線。 */
function advance(race, car, track, dt) {
  const len = trackLength(track);
  car.z += car.speed * dt;
  while (car.z >= len) {
    car.z -= len;
    car.lap++;
    if (car.lap >= race.laps && !car.finished) {
      car.finished = true;
      // 過線的精確時間：扣掉超出去的距離
      car.finishT = race.t + dt - (car.z / Math.max(1, car.speed));
    }
  }
}

function stepRival(race, car, track, dt) {
  const seg = track.segs[segmentAt(track, car.z)];
  let limit = R.MAX_SPEED * car.ratio;
  if (car.kind === 'shop') limit *= 1 - R.CURVE_SLOW * Math.min(1, Math.abs(seg.curve) / 4);
  if (car.boostT > 0) { car.boostT -= dt; limit *= R.BOOST_MULT; }
  // 修馬哈：每一圈的直線上用一次噴射
  if (car.kind === 'shumaha' && car.boosts > 0 && car.boostT <= 0 && Math.abs(seg.curve) < 0.2 && car.lap === R.BOOSTS - car.boosts && car.z > 2000) {
    car.boosts--;
    car.boostT = R.BOOST_T;
  }
  if (car.speed < limit) car.speed = Math.min(limit, car.speed + R.ACCEL * dt);
  else car.speed = Math.max(limit, car.speed + R.DECEL * dt);
  // 避開前方的慢車：換到旁邊的車道
  let target = car.lane;
  for (const o of race.cars) {
    if (o === car || o.finished) continue;
    const gap = totalDist(race, o) - totalDist(race, car);
    if (gap > 0 && gap < R.SEG_LEN * 4 && o.speed < car.speed && Math.abs(o.x - car.x) < R.CAR_W * 1.6) {
      target = o.x > 0 ? o.x - 0.7 : o.x + 0.7;
    }
  }
  const dx = dt * 1.2;
  if (Math.abs(target - car.x) <= dx) car.x = target; else car.x += Math.sign(target - car.x) * dx;
  advance(race, car, track, dt);
}

/**
 * 玩家的車前進一步。
 * input = { steer: −1 到 1, accel: 布林, brake: 布林, boost: 布林（這一步按下噴射）}
 */
function stepPlayer(race, car, track, input, dt) {
  const st = car.stats;
  const segIndex = segmentAt(track, car.z);
  const seg = track.segs[segIndex];
  const maxSpeed = R.MAX_SPEED * st.top;
  // 噴射
  if (input.boost && car.boosts > 0 && car.boostT <= 0) {
    car.boosts--;
    car.boostT = R.BOOST_T;
    race.events.push({ t: race.t, kind: 'boost' });
  }
  let limit = maxSpeed;
  if (car.boostT > 0) { car.boostT -= dt; limit *= R.BOOST_MULT; }
  const ratio = car.speed / R.MAX_SPEED;
  // 轉向和離心力
  const dx = dt * R.STEER * ratio;
  if (car.slideT > 0) car.slideT -= dt;
  else car.x += dx * Math.max(-1, Math.min(1, input.steer || 0)) * st.handling;
  car.x -= dx * ratio * seg.curve * R.CENTRIFUGAL;
  car.x = Math.max(-R.X_MAX, Math.min(R.X_MAX, car.x));
  // 加速、煞車、自然減速
  const before = car.speed;
  if (input.brake) car.speed += R.BRAKE * dt;
  else if (input.accel) car.speed += R.ACCEL * st.accel * (car.boostT > 0 ? 2 : 1) * dt;
  else car.speed += R.DECEL * dt;
  // 出界
  const off = Math.abs(car.x) > 1;
  if (off) {
    if (car.speed > R.OFFROAD_LIMIT) car.speed = Math.max(R.OFFROAD_LIMIT, car.speed + R.OFFROAD_DECEL * dt);
    car.integrity -= R.INTEGRITY_OFFROAD * dt;
    // 撞到路邊景物
    const things = track.scenery[segIndex];
    if (things && car.hitT <= 0) {
      for (const th of things) {
        if (Math.sign(car.x) === th.side && Math.abs(Math.abs(car.x) - SCENERY_X) < 0.35 && car.speed > R.OBJECT_SPEED) {
          car.speed = R.OBJECT_SPEED;
          car.integrity -= R.INTEGRITY_HIT;
          car.hitT = 0.5;
          race.events.push({ t: race.t, kind: 'crash' });
        }
      }
    }
  }
  // 不超過上限。原本就超過上限（例如噴射剛結束）：慢慢降回來
  if (car.speed > limit) car.speed = before > limit ? Math.max(limit, before + R.DECEL * dt) : limit;
  car.speed = Math.max(0, car.speed);
  // 水灘和加速板
  const item = track.itemAt[segIndex];
  if (item && Math.abs(car.x - item.x) < R.ITEM_W + R.CAR_W / 2 && car.itemSeg !== segIndex + car.lap * track.n) {
    car.itemSeg = segIndex + car.lap * track.n;
    if (item.kind === 'puddle') { car.slideT = R.PUDDLE_T; race.events.push({ t: race.t, kind: 'puddle' }); }
    else { car.boostT = Math.max(car.boostT, R.PAD_T); race.events.push({ t: race.t, kind: 'pad' }); }
  }
  // 撞到前車
  if (car.hitT > 0) car.hitT -= dt;
  for (const o of race.cars) {
    if (o === car || o.finished) continue;
    const gap = totalDist(race, o) - totalDist(race, car);
    if (gap > 0 && gap < R.CAR_LEN && car.speed > o.speed && Math.abs(o.x - car.x) < R.CAR_W) {
      car.speed = o.speed * R.HIT_SLOW;
      if (car.hitT <= 0) {
        car.integrity -= R.INTEGRITY_HIT;
        car.hitT = 0.5;
        race.events.push({ t: race.t, kind: 'bump' });
      }
    }
  }
  car.integrity = Math.max(0, car.integrity);
  advance(race, car, track, dt);
}

/** 目前的名次（1 開始）。已經過線的照過線時間排，還沒過線的照跑的距離排。 */
export function standings(race) {
  const list = race.cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishT - b.finishT;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return totalDist(race, b) - totalDist(race, a);
  });
  return list;
}

export function placeOf(race, car) {
  return standings(race).indexOf(car) + 1;
}

/** 比賽前進一步（1/60 秒）。input 是玩家的操作。玩家過線後比賽結束。 */
export function stepRace(race, input) {
  if (race.over) return;
  const track = TRACKS[race.track];
  const dt = R.DT;
  if (race.events.length > 20) race.events.splice(0, race.events.length - 20);
  for (const car of race.cars) {
    if (car.finished) { car.speed = Math.max(0, car.speed + R.DECEL * dt); advance(race, car, track, dt); continue; }
    if (car.kind === 'player') stepPlayer(race, car, track, input || {}, dt);
    else stepRival(race, car, track, dt);
  }
  race.t += dt;
  const p = playerCar(race);
  if (p.finished) {
    race.over = true;
    const order = standings(race);
    order.forEach((c, i) => { c.place = i + 1; });
  }
}
