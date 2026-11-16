// 一台機台的一次遊玩：盤面 + 物理世界 + 機台邏輯 + 統計。畫面和模擬工具共用。
import { createWorld, launch, stepWorld, PH } from './physics.js';
import { rngCreate } from './rng.js';

export function createSession(machine, opts = {}) {
  const rng = rngCreate(opts.seed ?? (Date.now() >>> 0));
  const board = machine.build();
  const stats = { fired: 0, paid: 0, fouls: 0, outs: 0, ins: 0, byId: {} };
  const s = { machine, board, stats, rng, payQueue: 0 };
  const env = {
    board, rng,
    time: () => s.world.time,
    pay(n, sensor) {
      stats.paid += n;
      if (sensor) stats.byId[sensor.id] = (stats.byId[sensor.id] || 0) + 1;
      if (opts.onPay) opts.onPay(n, sensor);
    },
    count(id) { stats.byId[id] = (stats.byId[id] || 0) + 1; },
    sfx: opts.sfx || (() => {}),
    msg: opts.msg || (() => {}),
  };
  s.logic = machine.createLogic(env);
  s.world = createWorld(board, s.logic, rng);
  s.fire = (power) => { stats.fired++; return launch(s.world, power); };
  /** 前進一個步長（1/120 秒）。回傳這一步結束的鋼珠事件。 */
  s.step = () => {
    const w = s.world;
    w.events.length = 0;
    stepWorld(w);
    for (const e of w.events) {
      if (e.type === 'foul') { stats.fouls++; stats.fired--; }
      else if (e.type === 'out') stats.outs++;
      else stats.ins++;
    }
    return w.events;
  };
  return s;
}

export const FIRE_INTERVAL = 0.6;   // 真機上限：一分鐘 100 顆
export const STEPS_PER_BALL = Math.round(FIRE_INTERVAL / PH.DT);
