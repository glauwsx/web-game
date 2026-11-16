// 羽根物（ハネモノ）。鋼珠進「落とし」→ 中央役物的羽根張開 → 被羽根接住的鋼珠進役物 →
// 掉進正中間的 V 區就是大當。大當時羽根連續開合。
import { mkBoard, nail, row, michi, pair, wall, gate, setGate, sensor, pocket, windmill, rubber, label, field, rails, keep } from './common.js';
import { toStage } from '../physics.js';
import { rr, pick } from '../rng.js';

export const HANE = {
  PAY_CHUCKER: 3, PAY_YAKU: 10, PAY_SLEEVE: 5, LIFE: 6.9,
  OPEN_DELAY: 0.3, OPEN_T: 0.4, OPEN_GAP: 0.4,
  ROUNDS: [2, 5, 10], ROUND_W: [50, 35, 15],
  FLAPS: 18, COUNT: 8, FLAP_OPEN: 0.9, FLAP_CLOSED: 0.45,
  V_PERIOD: 2.4, V_DUTY: 0.35,   // V 區閘門的週期（秒）和開著的比例
};

function build() {
  const b = mkBoard();
  rails(b);
  nail(b, 170, 42, 'ten'); nail(b, 190, 38, 'ten'); nail(b, 210, 38, 'ten'); nail(b, 230, 42, 'ten');
  rubber(b, 356, 96, 6);
  // 中央役物：箱子 + 羽根
  wall(b, 150, 128, 150, 238, 'frame'); wall(b, 250, 128, 250, 238, 'frame'); wall(b, 150, 238, 250, 238, 'frame');
  wall(b, 150, 128, 162, 131, 'frame'); wall(b, 250, 128, 238, 131, 'frame');
  gate(b, 'wing:c', 150, 128, 200, 106, true); gate(b, 'wing:c', 200, 106, 250, 128, true);
  gate(b, 'wing:o', 162, 131, 122, 104, false); gate(b, 'wing:o', 238, 131, 278, 104, false);
  sensor(b, { id: 'yaku', kind: 'yaku', x: 152, y: 132, w: 96, h: 16, on: true });
  b.stages.push({ id: 'yaku', x0: 160, x1: 240, y: 226, cx: 200, L: 16, k: 1100, damp: 1.3, h: 3.5, vmin: 14 });
  keep(b, 135, 112, 20); keep(b, 265, 112, 20); keep(b, 200, 100, 30);
  // 落とし 1（左右）：羽根開一次
  for (const s of [-1, 1]) {
    const x = 200 + s * 96;
    nail(b, x - HANE.LIFE, 286, 'life'); nail(b, x + HANE.LIFE, 286, 'life');
    pocket(b, { id: s < 0 ? 'c1l' : 'c1r', kind: 'chucker', n: 1, x, y: 294, pay: HANE.PAY_CHUCKER, name: '1', color: '#3d8fd0' });
  }
  // 落とし 2（中間）：羽根開兩次。兩邊有道釘把鋼珠送過來
  pair(b, HANE.LIFE, 296, 'life');
  michi(b, 138, 276, 174, 294); michi(b, 262, 276, 226, 294);
  pocket(b, { id: 'c2', kind: 'chucker', n: 2, x: 200, y: 304, pay: HANE.PAY_CHUCKER, name: '2', color: '#e7b53c' });
  windmill(b, 124, 240); windmill(b, 276, 240);
  // 袖
  for (const s of [-1, 1]) {
    const x = 200 + s * 138;
    nail(b, x - 7.3, 200, 'life'); nail(b, x + 7.3, 200, 'life');
    pocket(b, { id: s < 0 ? 'sl' : 'sr', x, y: 208, pay: HANE.PAY_SLEEVE, name: '袖', color: '#6a6f8a' });
  }
  keep(b, 200, 384, 22);
  field(b, (x, y) => y > 30 && y < 350 && !(x > 138 && x < 262 && y > 96 && y < 250), 23, 19.5, 12, 34);

  label(b, 200, 40, '天釘', 250, 22);
  label(b, 135, 112, '羽根', 84, 92);
  label(b, 200, 180, '役物', 300, 150);
  label(b, 200, 228, 'V 區', 300, 196);
  label(b, 104, 296, '落とし 1', 56, 330);
  label(b, 200, 308, '落とし 2', 250, 340);
  label(b, 150, 284, '道釘', 150, 330);
  label(b, 124, 240, '風車', 84, 236);
  b.art = { theme: 'hane', box: { x: 150, y: 128, w: 100, h: 110 } };
  return b;
}

function createLogic(env) {
  const b = env.board, rng = env.rng;
  const yaku = b.sensors.find((s) => s.id === 'yaku');
  const st = {
    phase: 'normal', wing: false, ws: 'closed', wt: 0, queue: 0,
    round: 0, rounds: 0, count: 0, flaps: 0, pt: 0, sub: '',
    jackpots: 0, opens: 0, catches: 0, vHits: 0, got: 0, last: [], vOpen: false, flash: 0,
  };
  const setWing = (open) => {
    if (st.wing === open) return;
    st.wing = open;
    setGate(b, 'wing:c', !open); setGate(b, 'wing:o', open);
    env.sfx(open ? 'open' : 'close');
  };
  const startJackpot = () => {
    st.phase = 'jackpot'; st.sub = 'intro'; st.pt = 2.2;
    st.rounds = HANE.ROUNDS[pick(rng, HANE.ROUND_W)];
    st.round = 0; st.queue = 0; st.got = 0; st.jackpots++; st.vHits++; st.flash = 2.2;
    st.ws = 'closed'; setWing(false);
    env.count('V');
    env.sfx('jackpot');
    env.msg(`V 入賞！大當 ${st.rounds} 回合`);
  };
  const startRound = () => { st.round++; st.count = 0; st.flaps = 0; st.sub = 'round'; st.pt = 0; setWing(true); st.flaps = 1; env.sfx('round'); };
  return {
    state: st,
    /** 測試用：直接大當。 */
    debugWin() { if (st.phase === 'normal') startJackpot(); },
    onSensor(s, ball) {
      if (s.kind === 'chucker') {
        env.pay(s.pay, s); env.sfx('in');
        if (st.phase === 'normal') { st.queue = Math.min(4, st.queue + s.n); env.msg(s.n === 2 ? '落とし 2：羽根開 2 次' : '落とし 1：羽根開 1 次'); }
        return 'take';
      }
      if (s.kind === 'yaku') {
        env.pay(HANE.PAY_YAKU, s); env.sfx('catch');
        st.catches++;
        if (st.phase === 'normal') env.count('yakuN');
        if (st.phase === 'jackpot') { st.count++; st.got += HANE.PAY_YAKU; }
        toStage(ball, b.stages[0], Math.max(164, Math.min(236, ball.x)), (ball.x < 200 ? 1 : -1) * rr(rng, 60, 260));
        return undefined;
      }
      if (s.pay) { env.pay(s.pay, s); env.sfx('in'); return 'take'; }
      return undefined;
    },
    onStageExit(stage, k, ball) {
      if (k === 0 && st.phase === 'normal') {
        if (st.vOpen) { startJackpot(); return 'take'; }
        ball.sv = (rng() < 0.5 ? -1 : 1) * rr(rng, 150, 230);   // 閘門關著：被彈開
        return 'stay';
      }
      if (k === 0) env.sfx('in');
      return 'take';
    },
    update(dt) {
      st.vOpen = (env.time() % HANE.V_PERIOD) < HANE.V_PERIOD * HANE.V_DUTY;
      if (st.flash > 0) st.flash -= dt;
      if (st.phase === 'normal') {
        st.wt -= dt;
        if (st.ws === 'closed' && st.queue > 0) { st.ws = 'delay'; st.wt = HANE.OPEN_DELAY; }
        else if (st.ws === 'delay' && st.wt <= 0) { st.queue--; st.opens++; st.ws = 'open'; st.wt = HANE.OPEN_T; setWing(true); }
        else if (st.ws === 'open' && st.wt <= 0) { st.ws = 'gap'; st.wt = HANE.OPEN_GAP; setWing(false); }
        else if (st.ws === 'gap' && st.wt <= 0) st.ws = 'closed';
        return;
      }
      st.pt -= dt;
      if (st.sub === 'intro') { if (st.pt <= 0) startRound(); return; }
      if (st.sub === 'gap') {
        if (st.pt <= 0) {
          if (st.round >= st.rounds) {
            st.phase = 'normal'; st.sub = ''; st.ws = 'closed';
            st.last.unshift({ rounds: st.rounds, got: st.got }); st.last.length = Math.min(st.last.length, 8);
            env.msg(`大當結束。這次拿到 ${st.got} 顆`);
          } else startRound();
        }
        return;
      }
      // 回合中：羽根一開一合
      st.pt += dt * 2;   // 抵銷上面的遞減，pt 在這裡當正向計時
      const endRound = st.count >= HANE.COUNT || (st.flaps >= HANE.FLAPS && !st.wing && st.pt >= HANE.FLAP_CLOSED);
      if (endRound) { setWing(false); st.sub = 'gap'; st.pt = 1.3; return; }
      if (st.wing && st.pt >= HANE.FLAP_OPEN) { setWing(false); st.pt = 0; }
      else if (!st.wing && st.pt >= HANE.FLAP_CLOSED) { setWing(true); st.pt = 0; st.flaps++; }
    },
    wantRight: () => false,
    hud() {
      if (st.phase === 'jackpot') {
        return { mode: '大當中', hot: true, big: `第 ${Math.max(1, st.round)}／${st.rounds} 回合　${st.count}／${HANE.COUNT} 顆`, rows: [['這次拿到', st.got], ['大當次數', st.jackpots]] };
      }
      return { mode: '普通', big: st.queue || st.wing ? '羽根張開！' : '瞄準落とし', rows: [['羽根開了', st.opens], ['進役物', st.catches], ['大當次數', st.jackpots]] };
    },
  };
}

export default {
  id: 'hane',
  name: '飛燕羽根',
  type: '羽根物（ハネモノ）',
  tagline: '進落とし，羽根張開。鋼珠掉進 V 區就大當。',
  spec: [['落とし', '賠 3 顆'], ['進役物', '賠 10 顆'], ['大當', '2／5／10 回合'], ['一回合', '羽根開 18 次或進 8 顆']],
  help: [
    '第 1 步：鋼珠進下面的「落とし」。落とし 1 讓羽根開 1 次，落とし 2 開 2 次。',
    '第 2 步：羽根張開時，上面掉下來的鋼珠被接進中央役物。所以要一直連發。',
    '第 3 步：役物裡的鋼珠停在正中間的 V 區，而且 V 區閘門開著，就是大當。',
    '大當：羽根連續開合。一回合最多開 18 次或進 8 顆。每進 1 顆賠 10 顆。',
    '力道讓鋼珠撞到天釘再散到中間。這樣落とし和羽根都吃得到。',
  ],
  defaultPower: 0.5, zones: { foul: 0.16, left: [0.39, 0.55] },
  build, createLogic,
};
