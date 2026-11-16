// 數位機（デジパチ）。現在日本店裡最多的機型。
// 鋼珠進「ヘソ」（啟動口）→ 螢幕的三個數字轉一次 → 三個一樣就是大當。
// 大當和確變時改成右打：鋼珠從上面繞到右邊，進電チュー和アタッカー。
import { mkBoard, nail, row, michi, wall, poly, gate, setGate, sensor, pocket, windmill, label, field, rails, keep } from './common.js';
import { toStage } from '../physics.js';
import { rr, chance } from '../rng.js';

export function makeDigi(cfg) {
  const C = cfg;

  function build() {
    const b = mkBoard();
    rails(b);
    // 中央框（螢幕）
    const frame = [[122, 214], [122, 128], [140, 100], [205, 84], [270, 100], [288, 128], [288, 214], [244, 222], [166, 222]];
    poly(b, frame, true, 'frame');
    // ワープ入口：框左邊的小平台。滾進去的鋼珠直接到螢幕下面的舞台
    wall(b, 122 - C.ledge, 181, 122, 175, 'ledge');
    sensor(b, { id: 'warp', kind: 'warp', x: 113.5, y: 158, w: 8.5, h: 14 });
    if (C.warpGuard) nail(b, 122 - C.warpGuard, 148, 'warp');
    keep(b, 110, 160, 15);
    b.stages.push({ id: 'stage', x0: 168, x1: 242, y: 220, cx: 205, L: 24, k: 900, damp: 1.1, h: 3, vmin: 14 });
    // ヘソ（啟動口）和命釘
    nail(b, 205 - C.life, 288, 'life'); nail(b, 205 + C.life, 288, 'life');
    pocket(b, { id: 'heso', kind: 'heso', x: 205, y: 297, pay: C.payHeso, name: '始', color: '#e7b53c' });
    // 風車、袴、道釘
    row(b, 82 - C.hakW, 238 - C.hakW * 1.25, 82, 238, Math.round(C.hakW * 1.6 / 11.6) + 1, 'hakama'); row(b, 114, 214, 102, 238, 3, 'hakama');
    windmill(b, 92, 252);
    michi(b, 106, 265, C.michiEnd, C.michiY, C.michiDrag);
    michi(b, 410 - C.michiEnd, C.michiY, 266, 277, C.michiDrag);
    // 左下的一般入賞口
    for (const [i, x, y] of [[0, 82, 284], [1, 100, 318], [2, 142, 340]]) {
      nail(b, x - 7.2, y - 8, 'life'); nail(b, x + 7.2, y - 8, 'life');
      pocket(b, { id: `p${i}`, x, y, pay: C.payPocket, name: '', color: '#6a6f8a' });
    }
    // 右打的路：漏斗 → スルーゲート → 電チュー → アタッカー
    wall(b, 288, 214, 288, 324, 'frame');
    row(b, 296, 140, 331, 182, 6, 'funnel'); row(b, 378, 150, 349, 182, 5, 'funnel');
    sensor(b, { id: 'gate', kind: 'gate', x: 332, y: 184, w: 16, h: 6 });
    keep(b, 340, 200, 16);
    // 電チュー：平常蓋著屋頂，開的時候張開
    wall(b, 332, 240, 332, 251, 'cup'); wall(b, 348, 240, 348, 251, 'cup'); wall(b, 332, 251, 348, 251, 'cup');
    sensor(b, { id: 'denchu', kind: 'denchu', pay: C.payDenchu, x: 332, y: 244, w: 16, h: 7 });
    gate(b, 'den:c', 326, 240, 340, 227, true); gate(b, 'den:c', 340, 227, 354, 240, true);
    gate(b, 'den:o', 332, 240, 312, 222, false); gate(b, 'den:o', 348, 240, 368, 222, false);
    // アタッカー（大入賞口）：平常是一塊斜的蓋子
    gate(b, 'att', 303, 307, 366, 297, true);
    wall(b, 303, 320, 368, 320, 'cup'); wall(b, 303, 307, 303, 320, 'cup');
    sensor(b, { id: 'att', kind: 'attacker', pay: C.payAtt, x: 304, y: 306, w: 62, h: 12, on: false });
    keep(b, 200, 384, 22);
    field(b, (x, y) => (x < 120 && y > 30 && y < 208) || (y > 28 && y < 80 && x < 300) || (x < 190 && y > 300 && y < 350 && x > 40),
      22.5, 19, 14, 36);

    label(b, 150, 44, '天釘', 96, 28);
    label(b, 205, 150, '螢幕', 205, 150);
    label(b, 117, 166, 'ワープ', 60, 150);
    label(b, 228, 221, '舞台', 262, 240);
    label(b, 92, 252, '風車', 44, 248);
    label(b, 140, 276, '道釘', 130, 300);
    label(b, 212, 288, '命釘', 240, 266);
    label(b, 205, 302, 'ヘソ', 232, 318);
    label(b, 340, 187, 'スルー', 316, 122);
    label(b, 340, 246, '電チュー', 350, 270);
    label(b, 334, 304, 'アタッカー', 250, 340);
    label(b, 200, 388, '出口', 150, 376);
    b.art = { theme: C.theme, frame, lcd: { x: 132, y: 104, w: 146, h: 104 } };
    return b;
  }

  function createLogic(env) {
    const b = env.board, rng = env.rng;
    const stage = b.stages[0];
    const att = b.sensors.find((s) => s.id === 'att');
    const st = {
      mode: 'normal', stLeft: 0, hold1: 0, hold2: 0, phase: 'idle', spin: null, digits: [3, 5, 8],
      jp: null, gateHold: 0, futsu: null, denchuT: 0, denchu: false, attOpen: false,
      spins: 0, since: 0, jackpots: 0, chain: 0, chainGot: 0, history: [], flash: 0, notice: '', noticeT: 0,
    };
    const setAtt = (open) => { st.attOpen = open; setGate(b, 'att', !open); att.on = open; env.sfx(open ? 'open' : 'close'); };
    const setDen = (open) => { if (st.denchu === open) return; st.denchu = open; setGate(b, 'den:c', !open); setGate(b, 'den:o', open); };
    const notice = (t, sec = 3) => { st.notice = t; st.noticeT = sec; };
    const rd = () => 1 + Math.floor(rng() * 9);

    function startSpin(kind) {
      if (kind === 2) st.hold2--; else st.hold1--;
      st.spins++; st.since++;
      const isSt = st.mode === 'st';
      const win = st.forceWin || chance(rng, isSt ? C.pHigh : C.pLow);
      st.forceWin = false;
      let digits, rounds = 0, reach = false, dur;
      const holds = st.hold1 + st.hold2;
      if (win) {
        const big = chance(rng, kind === 2 ? C.bigRate2 : C.bigRate1);
        const d = big ? (chance(rng, 0.5) ? 7 : 3) : [2, 4, 6, 8][Math.floor(rng() * 4)];
        digits = [d, d, d]; rounds = big ? C.roundsBig : C.roundsSmall; reach = true;
        dur = isSt ? 4.5 : 9.5;
      } else if (chance(rng, isSt ? 0.06 : C.reachRate)) {
        const a = rd();
        digits = [a, (a % 9) + 1, a]; reach = true;
        dur = isSt ? 3.2 : 7.5;
      } else {
        const a = rd(); let r = rd(); if (r === a) r = (a % 9) + 1;
        digits = [a, rd(), r];
        dur = isSt ? 1.0 : holds >= 3 ? 1.8 : holds >= 1 ? 2.8 : 4.0;
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
        st.history.unshift({ at: st.since, rounds: sp.rounds, st: st.mode === 'st' }); st.history.length = Math.min(st.history.length, 10);
        st.since = 0;
        st.jp = { rounds: sp.rounds, r: 0, count: 0, t: 3, sub: 'intro', got: 0 };
        st.phase = 'jp'; st.flash = 3;
        setDen(false); st.denchuT = 0; st.futsu = null;
        env.count('jackpot');
        env.sfx('jackpot');
        env.msg(`大當！${sp.rounds} 回合。請右打`);
        notice('右打！', 6);
        return;
      }
      st.phase = 'idle';
      if (st.mode === 'st' && --st.stLeft <= 0) {
        st.mode = 'normal';
        env.msg(`確變結束。連莊 ${st.chain} 次，共拿到 ${st.chainGot} 顆。請改回左打`);
        notice('改回左打', 6);
        st.chain = 0;
      }
    }

    return {
      state: st,
      spec: C,
      /** 測試用：下一次回轉一定大當。 */
      debugWin() { st.forceWin = true; if (st.hold1 < 1) st.hold1 = 1; },
      onSensor(s, ball) {
        switch (s.kind) {
          case 'heso':
            env.pay(s.pay, s); env.sfx('heso');
            if (st.hold1 < 4) st.hold1++;
            return 'take';
          case 'denchu':
            env.pay(s.pay, s); env.sfx('heso');
            if (st.hold2 < 4) st.hold2++;
            return 'take';
          case 'gate':
            if (st.gateHold < 4) st.gateHold++;
            return undefined;
          case 'attacker':
            env.pay(s.pay, s); env.sfx('catch');
            if (st.jp) { st.jp.count++; st.jp.got += s.pay; st.chainGot += s.pay; }
            return 'take';
          case 'warp':
            env.count('warp'); env.sfx('warp');
            toStage(ball, stage, stage.x0 + 2, rr(rng, 90, 240));
            return undefined;
          default:
            if (s.pay) { env.pay(s.pay, s); env.sfx('in'); return 'take'; }
            return undefined;
        }
      },
      onStageExit(stg, k) {
        if (k === 0) { env.count('stageC'); return { x: 205, y: 228.6, vx: rr(rng, -5, 5), vy: 30 }; }
        return { x: 205 + k * stg.L, y: 228.6, vx: k * rr(rng, 10, 70), vy: 30 };
      },
      update(dt) {
        if (st.flash > 0) st.flash -= dt;
        if (st.noticeT > 0) st.noticeT -= dt;
        const inJp = st.phase === 'jp';
        // 普通圖柄：鋼珠過スルーゲート → 抽電チュー開不開
        if (st.denchuT > 0) { st.denchuT -= dt; if (st.denchuT <= 0) setDen(false); }
        else if (st.futsu) {
          st.futsu.t -= dt;
          if (st.futsu.t <= 0) {
            if (st.futsu.win && !inJp) { setDen(true); st.denchuT = st.mode === 'st' ? C.denOpenST : 0.15; env.sfx('open'); }
            st.futsu = null;
          }
        } else if (st.gateHold > 0 && !inJp) {
          st.gateHold--;
          const hot = st.mode === 'st';
          st.futsu = { t: hot ? 0.3 : 2.5, win: chance(rng, hot ? 0.98 : 0.02) };
        }
        // 特別圖柄
        if (st.phase === 'idle') {
          if (st.hold2 > 0) startSpin(2); else if (st.hold1 > 0) startSpin(1);
        } else if (st.phase === 'spin') {
          const sp = st.spin;
          sp.t += dt;
          if (sp.reach && !sp.said && sp.t > 1.6) { sp.said = true; env.sfx('reach'); }
          if (sp.t >= sp.dur) resolve();
        } else if (inJp) {
          const jp = st.jp;
          jp.t -= dt;
          if (jp.sub === 'intro') { if (jp.t <= 0) { jp.sub = 'round'; jp.r = 1; jp.count = 0; jp.t = C.roundTime; setAtt(true); env.sfx('round'); } }
          else if (jp.sub === 'round') {
            if (jp.count >= C.count || jp.t <= 0) { setAtt(false); jp.sub = jp.r >= jp.rounds ? 'end' : 'gap'; jp.t = jp.sub === 'end' ? 2.5 : 1.0; }
          } else if (jp.sub === 'gap') {
            if (jp.t <= 0) { jp.r++; jp.count = 0; jp.sub = 'round'; jp.t = C.roundTime; setAtt(true); env.sfx('round'); }
          } else if (jp.t <= 0) {
            st.jp = null; st.phase = 'idle';
            st.mode = 'st'; st.stLeft = C.stSpins;
            env.msg(`確變 ${C.stSpins} 回：繼續右打，鋼珠會進電チュー`);
            notice('確變！繼續右打', 5);
          }
        }
      },
      wantRight: () => st.phase === 'jp' || st.mode === 'st',
      hud() {
        if (st.phase === 'jp') {
          const jp = st.jp;
          return { mode: '大當中', hot: true, right: true, big: jp.sub === 'intro' ? '大當！右打' : `第 ${jp.r}／${jp.rounds} 回合　${jp.count}／${C.count} 顆`, rows: [['連莊', st.chain], ['這輪拿到', st.chainGot]] };
        }
        if (st.mode === 'st') return { mode: '確變', hot: true, right: true, big: `確變 剩 ${st.stLeft} 回`, rows: [['連莊', st.chain], ['這輪拿到', st.chainGot]] };
        return { mode: '普通', big: `大當後已轉 ${st.since} 回`, rows: [['總回轉', st.spins], ['大當次數', st.jackpots]] };
      },
    };
  }

  return {
    id: C.id, name: C.name, type: C.type, tagline: C.tagline, cfg: C,
    spec: [
      ['大當機率', `1/${(1 / C.pLow).toFixed(1)}`], ['確變中', `1/${Math.round(1 / C.pHigh)}，${C.stSpins} 回`],
      ['大當', `${C.roundsSmall} 或 ${C.roundsBig} 回合`], ['一回合', `${C.count} 顆 × 賠 ${C.payAtt}`],
      ['ヘソ／電チュー', `賠 ${C.payHeso}／${C.payDenchu} 顆`],
    ],
    help: [
      '第 1 步（左打）：鋼珠從左邊下來，經過風車和道釘，進中間下面的「ヘソ」。',
      '捷徑：鋼珠滾進螢幕左邊的「ワープ」，會到螢幕下面的舞台。從舞台正中間掉下來幾乎一定進ヘソ。',
      '第 2 步：進ヘソ，螢幕的數字轉一次。最多保留 4 次。三個數字一樣就是大當。',
      `第 3 步（右打）：大當時力道轉到最大。鋼珠繞到右邊，掉進打開的アタッカー。7 或 3 是 ${C.roundsBig} 回合。`,
      `第 4 步：大當後是確變 ${C.stSpins} 回。繼續右打。鋼珠進電チュー，大當機率變成 1/${Math.round(1 / C.pHigh)}。`,
      '確變結束後改回左打。',
    ],
    defaultPower: 0.4, rightPower: 0.9, zones: { foul: 0.16, left: [0.24, 0.52], right: [0.66, 1] },
    build, createLogic,
  };
}

export const amadigi = makeDigi({
  id: 'ama', name: '海鳴物語 甘', type: '數位機・甘デジ（1/99）', theme: 'sea',
  tagline: '大當機率 1/99。最常中獎的數位機。',
  pLow: 1 / 99.9, pHigh: 1 / 40, stSpins: 30, roundsBig: 10, roundsSmall: 4, bigRate1: 0.25, bigRate2: 0.35,
  count: 9, payAtt: 10, payHeso: 3, payDenchu: 1, payPocket: 5, roundTime: 12, reachRate: 1 / 11, denOpenST: 2.4,
  life: 7.5, ledge: 8, michiDrag: 0.3, michiEnd: 180, michiY: 284, hakW: 30, warpGuard: 9,
});

export const middle = makeDigi({
  id: 'mid', name: '龍神傳 319', type: '數位機・ミドル（1/319）', theme: 'dragon',
  tagline: '大當機率 1/319。難中。但確變連莊率 65%，連莊每次 1300 顆。',
  pLow: 1 / 319.7, pHigh: 1 / 77, stSpins: 80, roundsBig: 10, roundsSmall: 4, bigRate1: 0.3, bigRate2: 1,
  count: 10, payAtt: 13, payHeso: 3, payDenchu: 1, payPocket: 5, roundTime: 12, reachRate: 1 / 14, denOpenST: 2.4,
  life: 7.5, ledge: 8, michiDrag: 0.3, michiEnd: 180, michiY: 284, hakW: 30, warpGuard: 9,
});
