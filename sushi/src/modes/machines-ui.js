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
      : stepper(`level-${id}`, () => cur().level, (v) => env.act({ type: 'setRaceLevel', id, level: v }), 1, (v) => t('mach.level.v', { n: v }));
    const trial = h('button', {
      class: 'btn plain mini', dataset: { id: `trial-${id}` },
      onclick: () => { if (env.app) openTrial(env.app, cur()); },
    }, t('mach.trial'));
    wrap.appendChild(h('div', { class: 'row mach-row', dataset: { furn: id, kind } },
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
      if (who) st = t('mach.playing', { who: t(`ctype.${who.boss || who.type}`) });
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
furnitureInfo.raceCab = machineInfo;

// ---- 賽車機台的螢幕動畫 ----
// 有人在玩時，螢幕上的路面分隔線往下捲動，小黃瓜捲車左右晃。位置對齊 data/sprites/furniture.js 的 raceCab。
const SCREEN = { u0: 0.2, u1: 0.8, v: 0.62, z0: 16, z1: 24 };

furnitureDraw.raceCab = (ctx, x, y, f, state, time) => {
  const who = f.occ.find(Boolean);
  const c = who && state.customers.find((p) => p.id === who);
  if (!c || c.st !== 'play') return;
  // 路中間的分隔線：三段，往下捲
  const phase = (time / 120) % 1;
  for (let k = 0; k < 3; k++) {
    const z = SCREEN.z1 - ((k + phase) / 3) * (SCREEN.z1 - SCREEN.z0);
    const w = gridToWorld(0.5, SCREEN.v, z);
    ctx.fillStyle = '#f6ecd4';
    ctx.fillRect(Math.round(x + w.x), Math.round(y + w.y), 1, 1);
  }
  // 玩家的車
  const car = gridToWorld(0.5 + Math.sin(time / 260) * 0.08, SCREEN.v, SCREEN.z0 + 2);
  ctx.fillStyle = '#5d8c3c';
  ctx.fillRect(Math.round(x + car.x) - 1, Math.round(y + car.y) - 1, 3, 2);
  // 招牌燈閃
  if (Math.floor(time / 300) % 2) {
    const lamp = gridToWorld(0.5, 0.5, 37);
    ctx.fillStyle = '#fff3a0';
    ctx.fillRect(Math.round(x + lamp.x) - 2, Math.round(y + lamp.y), 4, 1);
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
