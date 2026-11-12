// 人類玩家操控：把手把／鍵盤輸入轉成球員動作，以及自動切換控制的球員。
import { dist2, angleTo } from './util.js';
import { dunkRange, hoopOf } from './shooting.js';

export function emptyInput() {
  return {
    mx: 0, my: 0, sprint: false, stance: false,
    shoot: false, shootDown: false, pass: false, passDown: false,
    move: false, moveDown: false, lob: false, lobDown: false,
    rs: null, // HOOPBEAT
  };
}

function setControl(game, h, p) {
  if (!p || h.player === p) return;
  if (p.human && p.human !== h.label) {
    // 對方（同隊的另一位玩家）正在控制，交換
    const other = game.humans.find((x) => x.label === p.human);
    if (other) {
      other.player = h.player;
      if (h.player) h.player.human = other.label;
    }
  } else if (h.player) {
    h.player.human = null;
  }
  h.player = p;
  p.human = h.label;
  p.ai.mode = null;
  p.ai.target = null;
  game.emit('switch', { human: h.label, player: p });
}

function nearestTo(list, x, z, exclude = []) {
  let best = null, bd = 1e9;
  for (const p of list) {
    if (exclude.includes(p)) continue;
    const d = dist2(p.pos.x, p.pos.z, x, z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// 依情境決定每位玩家控制誰。
export function autoAssignHumans(game, initial, ctx = {}) {
  const b = game.ball;
  for (const t of game.teams) {
    const humans = t.humans;
    if (!humans.length) continue;
    const lineup = t.lineup;
    if (initial) {
      humans.forEach((h, i) => setControl(game, h, lineup[Math.min(i, 4)]));
      continue;
    }
    if (ctx.tipoff) {
      const jumper = lineup.reduce((a, p) => (p.height > a.height ? p : a));
      setControl(game, humans[0], jumper);
      if (humans[1]) setControl(game, humans[1], lineup.find((p) => p.role === 0 && p !== jumper) || lineup[0]);
      continue;
    }
    if (ctx.freethrow) {
      const sh = ctx.freethrow;
      if (sh.team === t.index && !sh.human) setControl(game, humans[0], sh);
      continue;
    }
    if (ctx.inbound) {
      const pd = game.pd;
      for (const h of humans) {
        if (h.player === pd.inbounder) {
          const others = lineup.filter((p) => p !== pd.inbounder && !p.human);
          const pick = others.find((p) => p.role === 0) || others[0];
          if (pick) setControl(game, h, pick);
        }
      }
      // 防守方：控制最靠近球的人
      if (pd.team !== t.index && pd.inbounder) {
        const used = [];
        for (const h of humans) {
          const pick = nearestTo(lineup, pd.spot.x, pd.spot.z, used.concat(humans.filter((x) => x !== h).map((x) => x.player)));
          if (pick && !h.player) setControl(game, h, pick);
          if (h.player) used.push(h.player);
        }
      }
      continue;
    }
    if (ctx.gained) {
      const p = ctx.gained;
      if (p.team === t.index) {
        if (p.human) continue;
        let h = null;
        if (ctx.passer && ctx.passer.human) h = humans.find((x) => x.label === ctx.passer.human);
        if (!h) {
          // 交給離球最近的玩家
          h = humans.reduce((a, x) => {
            if (!a) return x;
            const da = a.player ? dist2(a.player.pos.x, a.player.pos.z, p.pos.x, p.pos.z) : 1e9;
            const dx = x.player ? dist2(x.player.pos.x, x.player.pos.z, p.pos.x, p.pos.z) : 1e9;
            return dx < da ? x : a;
          }, null);
        }
        if (h) setControl(game, h, p);
      } else if (ctx.changed) {
        const used = [];
        for (const h of humans) {
          const pick = nearestTo(lineup, b.pos.x, b.pos.z, used);
          if (pick) { setControl(game, h, pick); used.push(pick); }
        }
      }
    }
  }
}

export function switchToNearest(game, h) {
  const t = game.teams[h.team];
  const b = game.ball;
  const exclude = t.humans.map((x) => x.player).filter(Boolean);
  let pick = nearestTo(t.lineup, b.pos.x, b.pos.z, exclude);
  if (!pick) return;
  setControl(game, h, pick);
}

export function applyHumanInput(game, h, input, dt) {
  const p = h.player;
  if (!p || !p.onCourt) return;
  const b = game.ball;
  const phase = game.phase;
  void dt;
  p.ctrl.mx = input.mx;
  p.ctrl.mz = input.my;
  p.ctrl.sprint = !!input.sprint;
  p.ctrl.face = null;
  const myBall = b.holder === p;
  const offense = game.offenseTeam() === p.team;
  p.ctrl.stance = !offense && !!input.stance;

  // 跳投：放開按鈕出手
  const a = p.action;
  if (a && a.type === 'shot' && a.humanHold && !a.released && !input.shoot && a.t > 0.02) a.humanReleased = true;

  if (phase === 'freethrow') {
    p.ctrl.mx = 0; p.ctrl.mz = 0;
    if (myBall && input.shootDown && !p.action && game.pd.state === 'ready') game.startShot(p, { kind: 'ft' });
    return;
  }
  if (phase === 'tipoff') {
    p.ctrl.mx = 0; p.ctrl.mz = 0;
    if ((input.lobDown || input.shootDown) && game.pd.jumpers.includes(p) && game.pd.tossed) game.jumpPlayer(p, 'rebound');
    return;
  }
  if (phase === 'dead' || phase === 'periodBreak' || phase === 'gameOver' || phase === 'pregame') {
    p.ctrl.mx = 0; p.ctrl.mz = 0;
    return;
  }
  if (p.ai.alley) return; // 空中接力時由系統自動跑位與起跳
  if (phase === 'inbound' || phase === 'afterScore') {
    if (phase === 'inbound' && offense && (input.passDown || input.lobDown)) game.passRequest = { player: p, time: game.time, alley: false };
    if (!offense && input.passDown) switchToNearest(game, h);
    return;
  }

  const loose = b.state === 'loose' || (b.state === 'flight' && b.shot && !b.pass);
  if (myBall) {
    if (input.shootDown) game.startShot(p);
    else if (input.passDown) {
      const t = game.pickPassTarget(p, input.mx, input.my);
      if (t) game.passBall(p, t, { kind: 'chest' });
    } else if (input.lobDown) {
      const t = game.pickPassTarget(p, input.mx, input.my);
      if (t) {
        const hoop = hoopOf(game.attackSide(p.team));
        const dh = dist2(t.pos.x, t.pos.z, hoop.x, hoop.z);
        const toward = (hoop.x - t.pos.x) * t.vel.x + (hoop.z - t.pos.z) * t.vel.z > 0;
        const alley = dunkRange(t) > 0 && (dh < 3.0 || (dh < 6.5 && toward && Math.hypot(t.vel.x, t.vel.z) > 2.5));
        game.passBall(p, t, { kind: alley ? 'alley' : 'lob' });
      }
    } else if (input.rs) game.dribbleMove(p, input.rs.x, input.rs.y, { stick: true, sprint: !!input.sprint }); // HOOPBEAT: 右搖桿運球
    else if (input.moveDown) game.dribbleMove(p, input.mx, input.my);
  } else if (loose) {
    if (input.lobDown || input.shootDown) game.jumpPlayer(p, 'rebound');
    if (input.passDown && !offense) switchToNearest(game, h);
  } else if (offense) {
    if (input.passDown) game.passRequest = { player: p, time: game.time, alley: false };
    if (input.lobDown) game.passRequest = { player: p, time: game.time, alley: true };
  } else {
    if (input.shootDown) game.attemptSteal(p);
    if (input.lobDown) game.jumpPlayer(p, 'block');
    if (input.passDown) switchToNearest(game, h);
    const hd = b.holder;
    if (hd && hd.team !== p.team && dist2(hd.pos.x, hd.pos.z, p.pos.x, p.pos.z) < 4) {
      p.ctrl.face = angleTo(p.pos.x, p.pos.z, hd.pos.x, hd.pos.z);
    }
  }
}
