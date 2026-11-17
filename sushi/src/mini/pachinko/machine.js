// 數位機的規則和一局遊玩。純邏輯（Node.js 可測）。畫面（game.js）和統計表工具共用。
//
// 流程（和日本現在的數位機一樣）：
//   1. 左打。鋼珠進ヘソ：賠 payHeso 顆，螢幕的三個數字轉一次（最多保留 4 次）。
//   2. 三個數字一樣：大當。改成右打，鋼珠進打開的アタッカー。一回合進 count 顆就關。
//   3. 大當後是確變 stSpins 回：繼續右打，鋼珠過スルー，電チュー打開，鋼珠進電チュー讓數字轉。
//   4. 確變用完：回到普通，改回左打。
//
// 一局：借 BALLS 顆。左打用借來的鋼珠；右打先用贏到的鋼珠（出玉）。
// 借來的打完、而且機台回到普通，這一局就結束。出玉換成壽司。
import { PACHINKO as P } from '../../data/balance.js';
import { BOARDS } from '../../data/pachinko-boards.js';
import { rngCreate, rngFloat, rngChance, rngRange } from '../../core/rng.js';
import { buildBoard, setGate } from './board.js';
import { createWorld, launch, stepWorld, toStage, PH } from './physics.js';
import { exchange } from './ai.js';

/** 一台機台的規則。env = { board, rng, time(), pay(n, sensor), count(id), sfx(name), msg(text) } */
export function createLogic(C, setting, env) {
  const b = env.board, rng = env.rng;
  const pLow = C.jackpot[Math.max(0, Math.min(4, setting - 1))];
  const stage = b.stages[0];
  const att = b.sensors.find((s) => s.id === 'att');
  const st = {
    mode: 'normal', stLeft: 0, hold1: 0, hold2: 0, phase: 'idle', spin: null, digits: [3, 5, 8],
    jp: null, gateHold: 0, futsu: null, denchuT: 0, denchu: false, attOpen: false,
    spins: 0, since: 0, jackpots: 0, chain: 0, chainGot: 0, flash: 0, notice: '', noticeT: 0, forceWin: false,
  };
  const setAtt = (open) => { st.attOpen = open; setGate(b, 'att', !open); att.on = open; env.sfx(open ? 'pkOpen' : 'pkClose'); };
  const setDen = (open) => { if (st.denchu === open) return; st.denchu = open; setGate(b, 'den:c', !open); setGate(b, 'den:o', open); };
  const notice = (t, sec = 3) => { st.notice = t; st.noticeT = sec; };
  const rd = () => 1 + Math.floor(rngFloat(rng) * 9);

  function startSpin(kind) {
    if (kind === 2) st.hold2--; else st.hold1--;
    st.spins++; st.since++;
    const isSt = st.mode === 'st';
    const win = st.forceWin || rngChance(rng, isSt ? C.pHigh : pLow);
    st.forceWin = false;
    let digits, rounds = 0, reach = false, dur;
    const holds = st.hold1 + st.hold2;
    if (win) {
      const big = rngChance(rng, kind === 2 ? C.bigRate2 : C.bigRate1);
      const d = big ? (rngChance(rng, 0.5) ? 7 : 3) : [2, 4, 6, 8][Math.floor(rngFloat(rng) * 4)];
      digits = [d, d, d]; rounds = big ? C.roundsBig : C.roundsSmall; reach = true;
      dur = isSt ? 3.5 : 7.5;
    } else if (rngChance(rng, isSt ? 0.06 : C.reachRate)) {
      const a = rd();
      digits = [a, (a % 9) + 1, a]; reach = true;
      dur = isSt ? 3.0 : 6.5;
    } else {
      const a = rd(); let r = rd(); if (r === a) r = (a % 9) + 1;
      digits = [a, rd(), r];
      dur = isSt ? 1.0 : holds >= 3 ? 1.5 : holds >= 1 ? 2.4 : 3.4;
    }
    st.spin = { t: 0, dur, win, reach, digits, rounds, kind, said: false };
    st.phase = 'spin';
  }

  function resolve() {
    const sp = st.spin;
    st.digits = sp.digits; st.spin = null;
    if (sp.win) {
      st.jackpots++;
      st.chain = st.mode === 'st' ? st.chain + 1 : 1;
      if (st.chain === 1) st.chainGot = 0;
      st.since = 0;
      st.jp = { rounds: sp.rounds, r: 0, count: 0, t: 2.5, sub: 'intro', got: 0 };
      st.phase = 'jp'; st.flash = 3;
      setDen(false); st.denchuT = 0; st.futsu = null;
      env.count('jackpot');
      env.sfx('pkJackpot');
      env.msg(`大當！${sp.rounds} 回合。請右打`);
      notice('右打！', 6);
      return;
    }
    st.phase = 'idle';
    if (st.mode === 'st' && --st.stLeft <= 0) {
      st.mode = 'normal';
      env.msg(`確變結束。連莊 ${st.chain} 次，拿到 ${st.chainGot} 顆。請改回左打`);
      notice('改回左打', 6);
      st.chain = 0;
    }
  }

  return {
    state: st,
    spec: C,
    pLow,
    /** 測試用：下一次回轉一定大當。 */
    debugWin() { st.forceWin = true; if (st.hold1 + st.hold2 < 1) st.hold1 = 1; },
    onSensor(s, ball) {
      switch (s.kind) {
        case 'heso':
          env.pay(s.pay, s); env.sfx('pkIn');
          if (st.hold1 < 4) st.hold1++;
          return 'take';
        case 'denchu':
          env.pay(s.pay, s); env.sfx('pkIn');
          if (st.hold2 < 4) st.hold2++;
          return 'take';
        case 'gate':
          if (st.gateHold < 4) st.gateHold++;
          return undefined;
        case 'attacker':
          env.pay(s.pay, s); env.sfx('pkCatch');
          if (st.jp) { st.jp.count++; st.jp.got += s.pay; }
          st.chainGot += s.pay;
          return 'take';
        case 'warp':
          env.count('warp'); env.sfx('pkWarp');
          toStage(ball, stage, stage.x0 + 2, rngRange(rng, 90, 240));
          return undefined;
        default:
          if (s.pay) { env.pay(s.pay, s); env.sfx('pkIn'); return 'take'; }
          return undefined;
      }
    },
    onStageExit(stg, k) {
      if (k === 0) { env.count('stageC'); return { x: 205, y: 228.6, vx: rngRange(rng, -5, 5), vy: 30 }; }
      return { x: 205 + k * stg.L, y: 228.6, vx: k * rngRange(rng, 10, 70), vy: 30 };
    },
    update(dt) {
      if (st.flash > 0) st.flash -= dt;
      if (st.noticeT > 0) st.noticeT -= dt;
      const inJp = st.phase === 'jp';
      // 普通圖柄：鋼珠過スルー → 抽電チュー開不開。確變中幾乎一定開
      if (st.denchuT > 0) { st.denchuT -= dt; if (st.denchuT <= 0) setDen(false); }
      else if (st.futsu) {
        st.futsu.t -= dt;
        if (st.futsu.t <= 0) {
          if (st.futsu.win && !inJp) { setDen(true); st.denchuT = st.mode === 'st' ? C.denOpenST : 0.15; env.sfx('pkOpen'); }
          st.futsu = null;
        }
      } else if (st.gateHold > 0 && !inJp) {
        st.gateHold--;
        const hot = st.mode === 'st';
        st.futsu = { t: hot ? 0.3 : 2.5, win: rngChance(rng, hot ? 0.98 : 0.02) };
      }
      // 特別圖柄（螢幕的數字）。電チュー的保留先轉；確變中ヘソ的保留等確變結束再轉（和真機一樣）
      if (st.phase === 'idle') {
        if (st.hold2 > 0) startSpin(2); else if (st.hold1 > 0 && st.mode !== 'st') startSpin(1);
      } else if (st.phase === 'spin') {
        const sp = st.spin;
        sp.t += dt;
        if (sp.reach && !sp.said && sp.t > 1.6) { sp.said = true; env.sfx('pkReach'); }
        if (sp.t >= sp.dur) resolve();
      } else if (inJp) {
        const jp = st.jp;
        jp.t -= dt;
        if (jp.sub === 'intro') { if (jp.t <= 0) { jp.sub = 'round'; jp.r = 1; jp.count = 0; jp.t = C.roundTime; setAtt(true); env.sfx('pkRound'); } }
        else if (jp.sub === 'round') {
          if (jp.count >= C.count || jp.t <= 0) { setAtt(false); jp.sub = jp.r >= jp.rounds ? 'end' : 'gap'; jp.t = jp.sub === 'end' ? 2 : 1.0; }
        } else if (jp.sub === 'gap') {
          if (jp.t <= 0) { jp.r++; jp.count = 0; jp.sub = 'round'; jp.t = C.roundTime; setAtt(true); env.sfx('pkRound'); }
        } else if (jp.t <= 0) {
          st.jp = null; st.phase = 'idle';
          st.mode = 'st'; st.stLeft = C.stSpins;
          env.msg(`確變 ${C.stSpins} 回：繼續右打，鋼珠會進電チュー`);
          notice('確變！繼續右打', 5);
        }
      }
    },
    wantRight: () => st.phase === 'jp' || st.mode === 'st',
    /** 機台有沒有事還沒做完（轉數字、大當、確變）。 */
    busy: () => st.phase !== 'idle' || st.mode === 'st' || st.hold1 + st.hold2 > 0,
  };
}

/**
 * 一局。board 是機台 id，setting 是釘子設定。
 * opts = { seed, balls, sfx(name), msg(text), onPay(n, sensor), spec（覆寫機台規格，工具和測試用） }
 */
export function createSession(boardId, setting, opts = {}) {
  const C = { ...(BOARDS[boardId] || BOARDS.ryujin), ...(opts.spec || {}) };
  const rng = rngCreate(opts.seed ?? (Date.now() >>> 0));
  const board = buildBoard(C, setting);
  const stats = { fired: 0, paid: 0, fouls: 0, byId: {}, warp: 0 };
  const s = { boardId: C.id, setting: board.setting, C, board, stats, rng, lent: opts.balls ?? P.BALLS, won: 0, cooldown: 0, ended: false };
  const env = {
    board, rng,
    time: () => s.world.time,
    pay(n, sensor) {
      stats.paid += n; s.won += n;
      if (sensor) stats.byId[sensor.id] = (stats.byId[sensor.id] || 0) + 1;
      if (opts.onPay) opts.onPay(n, sensor);
    },
    count(id) { stats.byId[id] = (stats.byId[id] || 0) + 1; },
    sfx: opts.sfx || (() => {}),
    msg: opts.msg || (() => {}),
  };
  s.logic = createLogic(C, board.setting, env);
  s.world = createWorld(board, s.logic, rng);
  s.wantRight = () => s.logic.wantRight();
  /** 現在能不能發射：左打只能用借來的；右打先用出玉，沒有出玉再用借來的。 */
  s.canFire = () => !s.ended && (s.lent > 0 || (s.wantRight() && s.won > 0));
  s.fire = (power) => {
    if (!s.canFire()) return null;
    const src = s.wantRight() && s.won > 0 ? 'won' : 'lent';
    if (src === 'won') s.won--; else s.lent--;
    stats.fired++;
    const ball = launch(s.world, power);
    ball.src = src;
    return ball;
  };
  /** 這一局結束了沒有：借來的打完、場上沒有鋼珠、機台沒事。確變中沒有球可打也算結束（剩下的保留不轉）。 */
  s.isOver = () => {
    if (s.ended) return true;
    if (s.lent > 0 || s.world.balls.length) return false;
    if (!s.logic.busy()) return true;
    const st = s.logic.state;
    return st.mode === 'st' && st.phase === 'idle' && st.hold2 === 0 && s.won <= 0;
  };
  /** 前進一個步長（1/120 秒）。回傳這一步結束的鋼珠。 */
  s.step = () => {
    const w = s.world;
    w.events.length = 0;
    stepWorld(w);
    for (const e of w.events) {
      if (e.type === 'foul') {
        // 力道太弱：鋼珠掉回來，退回原來的地方
        stats.fouls++; stats.fired--;
        if (e.ball.src === 'won') s.won++; else s.lent++;
      }
    }
    return w.events;
  };
  /** 結束並換成壽司。 */
  s.result = () => { s.ended = true; return { ...exchange(s.won), stats }; };
  return s;
}

export { PH };
