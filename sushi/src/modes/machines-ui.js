// 機台的經營畫面介面：設施分頁的區塊、家具浮窗、賽道上的小車、試玩、強敵的對策選單、親自應戰。
// 用 shop-scene.js 和 panels.js 的擴充點接進來。import 這個檔就會註冊。
import { h, toast } from '../ui/dom.js';
import { t } from '../data/strings.js';
import * as B from '../data/balance.js';
import { gridToWorld } from '../iso/iso.js';
import { facilitySections, portraitImg } from '../ui/panels.js';
import { createOverlayMenu } from '../ui/menus.js';
import { yen } from '../ui/hud.js';
import { furnitureInfo, furnitureDraw, shopWatchers } from './shop-scene.js';
import { machineOf, machineSummary, boardIdOf, trackIdOf, bossesNeedingChoice } from '../sim/machines.js';
import { createPachinkoScene } from '../mini/pachinko/game.js';
import { createRaceScene } from '../mini/race/game.js';

/** 開試玩：小遊戲蓋在經營畫面上，經營模擬自動暫停。試玩不收錢，也不影響店裡。 */
function openTrial(app, f) {
  app.sfx('button');
  if (machineOf(f) === 'pachinko') {
    app.scenes.push(createPachinkoScene(app, { board: boardIdOf(f), setting: f.nail, fee: f.fee }));
  } else {
    app.scenes.push(createRaceScene(app, { track: trackIdOf(f), level: f.level }));
  }
}

function machineName(state, f) {
  const same = state.shop.furniture.filter((x) => x.type === f.type);
  const n = same.indexOf(f) + 1;
  return same.length > 1 ? t(`mach.name.${f.type}`, { n }) : t(`furn.${f.type}`);
}

/** 一個數字的 −／＋ 調整器。get() 取目前值，set(v) 送出操作。 */
function stepper(id, get, set, step, fmt) {
  const val = h('span', { class: 'price', dataset: { id: `${id}-val` } }, '');
  const minus = h('button', { class: 'btn plain mini', dataset: { id: `${id}-minus` }, onclick: () => set(get() - step) }, '−');
  const plus = h('button', { class: 'btn plain mini', dataset: { id: `${id}-plus` }, onclick: () => set(get() + step) }, '+');
  return { node: h('div', { class: 'stepper' }, minus, val, plus), update: () => { val.textContent = fmt(get()); } };
}

/** 設施分頁：每台機台一個區塊。 */
facilitySections.push((s0, env, ups) => {
  const list = s0.shop.furniture.filter((f) => machineOf(f));
  if (!list.length) return null;
  const wrap = h('div', { class: 'mach-list' });
  for (const f0 of list) {
    const id = f0.id;
    const kind = machineOf(f0);
    const cur = () => env.getState().shop.furniture.find((x) => x.id === id);
    const sub = h('div', { class: 'row-sub' }, '');
    const status = h('div', { class: 'row-sub mach-status' }, '');
    const fee = stepper(`fee-${id}`, () => cur().fee, (v) => env.act({ type: 'setFee', id, fee: v }), B.FEE_STEP, yen);
    const knob = kind === 'pachinko'
      ? stepper(`nail-${id}`, () => cur().nail, (v) => env.act({ type: 'setNail', id, nail: v }), 1, (v) => t('mach.nail.v', { n: v }))
      : stepper(`level-${id}`, () => cur().level, (v) => env.act({ type: 'setCarLevel', id, level: v }), 1, (v) => t('mach.level.v', { n: v }));
    const trial = h('button', {
      class: 'btn plain mini', dataset: { id: `trial-${id}` },
      onclick: () => { if (env.app) openTrial(env.app, cur()); },
    }, t('mach.trial'));
    wrap.appendChild(h('div', { class: 'row mach-row', dataset: { furn: id } },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-name' }, machineName(s0, f0),
          h('small', null, ` ${kind === 'pachinko' ? t(`pk.board.${boardIdOf(f0)}`) : t(`track.${trackIdOf(f0)}`)}`)),
        sub, status,
        h('div', { class: 'mach-ctl' },
          h('span', { class: 'mach-label' }, t(kind === 'pachinko' ? 'mach.nail' : 'mach.level')), knob.node,
          h('span', { class: 'mach-label' }, t('mach.fee')), fee.node,
          trial))));
    ups.push(() => {
      const s = env.getState();
      const f = cur();
      if (!f) return;
      const m = machineSummary(s, f);
      knob.update();
      fee.update();
      sub.textContent = t('mach.sub', { wom: m.wom.toFixed(2), chance: Math.round(Math.min(1, m.chance) * 100), income: m.income.toLocaleString('en-US'), payout: m.payout.toLocaleString('en-US') });
      const who = m.player ? s.customers.find((c) => c.id === m.player) : null;
      let st = t('mach.idle');
      if (kind === 'race' && m.race) st = m.race.st === 'run' ? t('mach.race.run', { n: m.race.n }) : t('mach.race.signup', { n: m.race.n });
      else if (who) st = t('mach.playing', { who: t(`ctype.${who.boss || who.type}`) });
      status.textContent = st;
      status.classList.toggle('warn', !!(who && who.boss) || s.customers.some((c) => c.boss && c.furn === id && c.st === 'play'));
    });
  }
  return wrap;
});

/** 家具浮窗：機台的設定和今日收支。 */
function machineInfo(state, f, env) {
  const m = machineSummary(state, f);
  return h('div', { class: 'info-body' },
    h('div', null,
      h('div', { class: 'info-name' }, machineName(state, f)),
      h('div', null, m.kind === 'pachinko' ? t('mach.nail.v', { n: m.nail }) : t('mach.level.v', { n: m.level }), ' · ', t('mach.fee'), ' ', yen(m.fee)),
      h('div', null, t('mach.sub', { wom: m.wom.toFixed(2), chance: Math.round(Math.min(1, m.chance) * 100), income: m.income.toLocaleString('en-US'), payout: m.payout.toLocaleString('en-US') })),
      h('button', { class: 'btn plain mini', dataset: { id: `info-trial-${f.id}` }, onclick: () => { if (env.app) openTrial(env.app, f); } }, t('mach.trial'))));
}
furnitureInfo.pachinko = machineInfo;
furnitureInfo.raceTrack = machineInfo;

// ---- 賽道上的小車 ----
// 賽道是 4×3 的檯子，跑道是中間那一圈（相對於家具左上角 0.6 到 3.4、0.6 到 2.4），高度 12.6 像素。
const LOOP = { u0: 0.6, u1: 3.4, v0: 0.6, v1: 2.4, z: 12.6 };
const LOOP_LEN = 2 * (LOOP.u1 - LOOP.u0) + 2 * (LOOP.v1 - LOOP.v0);
const CAR_COLORS = ['#f6ecd4', '#5d8c3c', '#2f4270', '#e2a93b', '#c86fd0', '#b5402f'];

/** 跑道上的位置（p 是 0 到 1 的一圈）。從起跑線（前緣中間）開始逆時針。 */
function loopPoint(p) {
  let d = (((p % 1) + 1) % 1) * LOOP_LEN;
  const w = LOOP.u1 - LOOP.u0;
  const hh = LOOP.v1 - LOOP.v0;
  const start = w / 2;
  d = (d + start) % LOOP_LEN;
  if (d < w) return [LOOP.u1 - d, LOOP.v1];
  d -= w;
  if (d < hh) return [LOOP.u0, LOOP.v1 - d];
  d -= hh;
  if (d < w) return [LOOP.u0 + d, LOOP.v0];
  d -= w;
  return [LOOP.u1, LOOP.v0 + d];
}

furnitureDraw.raceTrack = (ctx, x, y, f, state, time) => {
  const race = f.race;
  const total = B.RACE.RACE_MIN * B.TICKS_PER_MIN;
  const e = race && race.st === 'run' ? 1 - race.t / total : 0;
  // 6 台車。參賽顧客照名次決定速度，其他是店家的壽司車
  const ids = race ? race.entrants : [];
  for (let i = 0; i < 6; i++) {
    const place = ids[i] && race.places ? race.places[ids[i]] || 4 : 2 + (i % 4);
    const speed = 1 - (place - 1) * 0.035;
    const wobble = race && race.st === 'run' ? Math.sin(time / 300 + i) * 0.01 : 0;
    const p = e * B.RACE.LAPS * speed + wobble - i * 0.025;
    const [u, v] = loopPoint(p);
    const w = gridToWorld(u, v, LOOP.z);
    const lane = (i % 2) * 1;
    ctx.fillStyle = '#17110c';
    ctx.fillRect(Math.round(x + w.x) - 1, Math.round(y + w.y) - 1 + lane, 4, 3);
    ctx.fillStyle = ids[i] ? '#ff6a50' : CAR_COLORS[i];
    ctx.fillRect(Math.round(x + w.x), Math.round(y + w.y) - 1 + lane, 2, 2);
  }
};

// ---- 強敵的對策 ----

/** 跳出對策選單。 */
function askBoss(scene, app, c) {
  const pro = c.boss === 'pro';
  const choose = (choice) => {
    app.scenes.pop();
    const r = scene.act({ type: 'bossChoice', id: c.id, choice });
    if (r.ok) toast(t(`boss.${c.boss}.${choice}.done`), 2600);
  };
  const challenge = () => {
    app.scenes.pop();
    const r = scene.act({ type: 'bossChallenge', id: c.id });
    if (!r.ok) return;
    let reported = false;
    const report = (win) => {
      if (reported) return;
      reported = true;
      scene.act({ type: 'bossChallengeResult', id: c.id, win });
      toast(t(`boss.${c.boss}.${win ? 'win' : 'lose'}`), 3500);
    };
    if (r.kind === 'pachinko') {
      app.scenes.push(createPachinkoScene(app, { board: r.board, setting: r.nail, fee: r.fee, target: r.target, onDone: (res) => report(res.win) }));
    } else {
      app.scenes.push(createRaceScene(app, {
        track: r.track, level: r.level, shumaha: true,
        onDone: (res) => report(res.shumahaPlace > 0 && res.place < res.shumahaPlace),
        onExit: () => report(false),
      }));
    }
  };
  const body = h('div', { class: 'boss-body' },
    portraitImg(pro ? 'pro' : 'shumaha', 4),
    h('div', null,
      h('p', null, t(`boss.${c.boss}.desc`)),
      h('ul', { class: 'boss-opts' },
        h('li', null, h('b', null, t(`boss.${c.boss}.allow`)), ' ', t(`boss.${c.boss}.allow.desc`)),
        h('li', null, h('b', null, t(`boss.${c.boss}.counter`)), ' ', t(`boss.${c.boss}.counter.desc`)),
        h('li', null, h('b', null, t(`boss.${c.boss}.challenge`)), ' ', t(`boss.${c.boss}.challenge.desc`)))));
  app.scenes.push(createOverlayMenu(app, {
    name: 'boss',
    title: t(`boss.${c.boss}.title`),
    body,
    items: [
      { id: 'boss-allow', label: t(`boss.${c.boss}.allow`), action: () => choose('allow') },
      { id: 'boss-counter', label: t(`boss.${c.boss}.counter`), cls: 'indigo', action: () => choose('counter') },
      { id: 'boss-challenge', label: t(`boss.${c.boss}.challenge`), cls: 'red', action: challenge },
    ],
    onEscape: () => choose('allow'),
  }));
}

// 強敵坐上機台時，暫停並跳出對策選單（每位強敵一次）
shopWatchers.push((scene, app) => {
  if (app.scenes.top() !== scene) return;
  const s = scene.state;
  if (s.phase !== 'open') return;
  const c = bossesNeedingChoice(s)[0];
  if (c) askBoss(scene, app, c);
});
