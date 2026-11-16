// 無限模式流程：繼續或新遊戲 → 準備 → 營業 → 打烊結算 → 自動存檔 → 隔天的準備。
import { h, toast } from '../ui/dom.js';
import { t } from '../data/strings.js';
import * as B from '../data/balance.js';
import { SUSHI } from '../data/sushi.js';
import { STAFF, STAFF_ORDER } from '../data/characters.js';
import { RESEARCH, QUESTS } from '../data/events.js';
import { BOARD_ORDER } from '../data/pachinko-boards.js';
import { TRACK_ORDER } from '../data/tracks.js';
import { SAVE_KEYS } from '../core/save.js';
import {
  createEndless, applyEndless, endDay, calendar, rentOf, activeQuests, questValue, researchStatus, hireStatus,
  validEndless, boardsUnlocked, tracksUnlocked, ENDLESS_VERSION,
} from '../sim/endless.js';
import { machineOf } from '../sim/machines.js';
import { floorCount } from '../sim/pathfind.js';
import { createShopScene } from './shop-scene.js';
import './machines-ui.js';
import { createBuilder } from '../ui/build.js';
import { createResultsScene } from '../ui/results.js';
import { createMenuScene, createOverlayMenu } from '../ui/menus.js';
import { portraitImg } from '../ui/panels.js';
import { yen } from '../ui/hud.js';

const N = B.ENDLESS;
const num = (n) => Math.round(n).toLocaleString('en-US');

const ENDLESS_SAVE = {
  version: ENDLESS_VERSION,
  defaults: () => ({ version: ENDLESS_VERSION, empty: true }),
  validate: (d) => d.empty === true || validEndless(d),
};

export function dateText(day) {
  const c = calendar(day);
  return t('endless.date', { y: c.year, m: c.month, w: c.week, d: t(`endless.weekday.${c.weekday}`) });
}

/** 讀存檔。沒有存檔回傳 null。 */
export function loadEndless(app) {
  const r = app.store.load(SAVE_KEYS.endless, ENDLESS_SAVE);
  if (r.status === 'corrupt') { app.reportCorrupt('endless'); return null; }
  return r.status === 'ok' && !r.data.empty ? r.data : null;
}

function saveEndless(app, E) {
  app.store.save(SAVE_KEYS.endless, E);
}

function rewardText(q) {
  return q.reward.money ? t('manage.reward.money', { n: num(q.reward.money) }) : t('manage.reward.insp', { n: q.reward.insp });
}

/** 「經營」分頁：今天的狀況、魚價、任務、研發、雇用、借款、機台選項。 */
function manageTab(ctx) {
  return {
    id: 'manage',
    label: t('tab.manage'),
    build(el, ups) {
      const E = ctx.E();
      const s = E.s;
      const prep = s.phase === 'prep';
      const head = (text) => h('div', { class: 'panel-head' }, text);
      // 今天
      const ev = E.today && E.today.event;
      const month = h('div', { class: 'row-sub' }, '');
      const debt = h('div', { class: 'panel-note warn hidden' }, '');
      el.appendChild(head(t('manage.today')));
      el.appendChild(h('div', { class: 'row' }, h('div', { class: 'row-main' },
        h('div', { class: 'row-name', dataset: { id: 'today-event' } }, ev ? t(`event.${ev}`) : t('manage.noEvent')),
        h('div', { class: 'row-sub' }, [ev ? t(`event.${ev}.desc`) : null, E.today && E.today.weekend ? t('endless.weekend') : null].filter(Boolean).join('　')),
        h('div', { class: 'row-sub' }, t('manage.rent', { rent: num(rentOf(s.shop)) })),
        month)));
      el.appendChild(debt);
      ups.push(() => {
        const cur = ctx.E();
        const left = 28 - (cur.day % 28);
        month.textContent = t('manage.month', { mine: num(cur.month.revenue + cur.s.day.revenue), rival: num(cur.month.rival), days: left });
        debt.classList.toggle('hidden', cur.debtDays === 0);
        debt.textContent = t('endless.debt', { n: cur.debtDays });
      });
      if (prep) {
        el.appendChild(h('div', { class: 'foot-btns manage-save' },
          h('button', { class: 'btn plain', dataset: { id: 'endless-save' }, onclick: () => { ctx.save(); toast(t('endless.saved'), 1500); } }, t('endless.save'))));
      }
      // 魚價
      el.appendChild(head(t('manage.prices')));
      el.appendChild(h('div', { class: 'manage-prices' }, Object.keys(s.menu).map((id) => {
        const f = ((E.today && E.today.prices[id]) || 1) * (s.priceMult || 1);
        const pct = Math.round((f - 1) * 100);
        return h('span', { class: pct > 0 ? 'up' : pct < 0 ? 'down' : '' }, `${t(`sushi.${id}`)} ${pct > 0 ? '+' : ''}${pct}%`);
      })));
      // 任務
      el.appendChild(head(t('manage.quests')));
      const quests = activeQuests(E);
      if (!quests.length) el.appendChild(h('div', { class: 'panel-note' }, t('manage.quest.allDone')));
      for (const q of quests) {
        const prog = h('span', { class: 'num' }, '');
        el.appendChild(h('div', { class: 'row quest-row', dataset: { quest: q.id } },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-name' }, t(`quest.${q.id}`)),
            h('div', { class: 'row-sub' }, prog, '　', rewardText(q)))));
        ups.push(() => { prog.textContent = t('manage.quest.progress', { v: num(Math.min(q.n, questValue(ctx.E(), q))), n: num(q.n) }); });
      }
      // 研發
      const inspHead = head('');
      el.appendChild(inspHead);
      ups.push(() => { inspHead.textContent = t('manage.research', { n: ctx.E().insp }); });
      el.appendChild(h('div', { class: 'panel-note' }, t('manage.insp.hint', { n: N.INSP_PER })));
      for (const item of RESEARCH) {
        const st0 = researchStatus(E, item);
        if (st0 === 'done') continue;
        const btn = h('button', { class: 'btn plain mini', dataset: { id: `research-${item.id}` }, onclick: () => ctx.act({ type: 'research', id: item.id }) }, t('manage.research.go'));
        el.appendChild(h('div', { class: 'row' },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-name' }, t(`research.${item.id}`)),
            h('div', { class: 'row-sub' }, t('manage.research.cost', { n: item.cost }), st0 === 'needs' ? `　${t('manage.research.needs', { name: t(`research.${item.needs}`) })}` : '')),
          h('div', { class: 'row-ctl' }, btn)));
        ups.push(() => { btn.disabled = !prep || researchStatus(ctx.E(), item) !== 'ok'; });
      }
      // 雇用
      el.appendChild(head(t('manage.hire')));
      el.appendChild(h('div', { class: 'panel-note' }, t('manage.train.note')));
      // 打工仔很多位：已經雇用的都列出來，還沒雇的只列下一位
      let nextBaito = true;
      for (const id of STAFF_ORDER) {
        const def = STAFF[id];
        const st0 = def.player ? 'hired' : hireStatus(E, id);
        const hired = st0 === 'hired';
        if (def.baito && !hired) { if (!nextBaito) continue; nextBaito = false; }
        const train = h('button', { class: 'btn plain mini', dataset: { id: `train-${id}` }, onclick: () => ctx.act({ type: 'train', staff: id }) }, '');
        if (hired) {
          ups.push(() => {
            const cur = ctx.E().s.staff.find((x) => x.id === id);
            const lv = cur ? cur.lv || 0 : 0;
            const max = lv >= B.TRAIN.MAX;
            train.textContent = max ? t('manage.train.max', { lv }) : t('manage.train', { lv, next: lv + 1, n: B.TRAIN.COST[lv] });
            train.disabled = !prep || max || ctx.E().insp < B.TRAIN.COST[lv];
          });
        }
        if (def.player) {
          el.appendChild(h('div', { class: 'row staff-row' }, portraitImg(def.look, 2),
            h('div', { class: 'row-main' }, h('div', { class: 'row-name' }, t(`char.${id}`))), h('div', { class: 'row-ctl' }, train)));
          continue;
        }
        const btn = h('button', {
          class: 'btn plain mini', dataset: { id: `${hired ? 'fire' : 'hire'}-${id}` },
          onclick: () => ctx.act({ type: hired ? 'fire' : 'hire', staff: id }),
        }, t(hired ? 'manage.hire.fire' : 'manage.hire.go'));
        el.appendChild(h('div', { class: 'row staff-row' },
          portraitImg(def.look, 2),
          h('div', { class: 'row-main' },
            h('div', { class: 'row-name' }, t(`char.${id}`), def.lang ? h('small', null, ` ${t('panel.staff.lang')}`) : null),
            h('div', { class: 'row-sub' }, `${t('panel.staff.speed')} ${def.speed} · ${t('panel.staff.skill')} ${def.skill} · ${t('panel.staff.service')} ${def.service}`),
            h('div', { class: 'row-sub' }, t('manage.hire.wage', { w: num(def.wage) }), N.HIRE_REP[id] ? `　${t('manage.hire.rep', { n: N.HIRE_REP[id] })}` : '')),
          h('div', { class: 'row-ctl roles' }, hired ? train : null, btn)));
        ups.push(() => { btn.disabled = !prep || (!hired && hireStatus(ctx.E(), id) !== 'ok'); });
      }
      // 機台選項（解鎖第 2 個檯面或賽道之後）
      const machines = s.shop.furniture.filter((f) => (machineOf(f) === 'pachinko' && boardsUnlocked(E) > 1) || (machineOf(f) === 'race' && tracksUnlocked(E) > 1));
      if (machines.length) {
        el.appendChild(head(t('manage.options')));
        machines.forEach((f, i) => {
          const kind = machineOf(f);
          const name = h('span', null, '');
          const btn = h('button', {
            class: 'btn plain mini', dataset: { id: `option-${f.id}` },
            onclick: () => {
              const cur = ctx.E().s.shop.furniture.find((x) => x.id === f.id);
              if (kind === 'pachinko') ctx.act({ type: 'setBoard', id: f.id, board: (cur.board + 1) % boardsUnlocked(ctx.E()) });
              else ctx.act({ type: 'setTrack', id: f.id, track: (cur.track + 1) % tracksUnlocked(ctx.E()) });
            },
          }, '⇄');
          el.appendChild(h('div', { class: 'row' },
            h('div', { class: 'row-main' }, h('div', { class: 'row-name' }, t(`mach.name.${f.type}`, { n: i + 1 })), h('div', { class: 'row-sub' }, name)),
            h('div', { class: 'row-ctl' }, btn)));
          ups.push(() => {
            const cur = ctx.E().s.shop.furniture.find((x) => x.id === f.id);
            if (!cur) return;
            name.textContent = kind === 'pachinko' ? t(`pk.board.${BOARD_ORDER[cur.board] || BOARD_ORDER[0]}`) : t(`track.${TRACK_ORDER[cur.track] || TRACK_ORDER[0]}`);
            btn.disabled = !prep;
          });
        });
      }
      // 借款
      el.appendChild(head(t('manage.loan')));
      const loan = h('div', { class: 'row-sub' }, '');
      const borrow = h('button', { class: 'btn plain mini', dataset: { id: 'loan-borrow' }, onclick: () => ctx.act({ type: 'borrow', amount: N.LOAN_STEP }) }, t('manage.loan.borrow'));
      const repay = h('button', { class: 'btn plain mini', dataset: { id: 'loan-repay' }, onclick: () => ctx.act({ type: 'repay', amount: N.LOAN_STEP }) }, t('manage.loan.repay'));
      el.appendChild(h('div', { class: 'row' }, h('div', { class: 'row-main' }, loan), h('div', { class: 'row-ctl roles' }, borrow, repay)));
      ups.push(() => {
        const cur = ctx.E();
        loan.textContent = t('manage.loan.now', { n: num(cur.loan) });
        borrow.disabled = cur.loan + N.LOAN_STEP > N.LOAN_MAX;
        repay.disabled = cur.loan <= 0 || cur.s.money <= 0;
      });
    },
  };
}

/** 結算畫面下方的額外資訊。 */
function resultExtra(E, last) {
  const lines = [];
  lines.push(t('endless.result.insp', { n: last.insp, total: E.insp }));
  if (last.spoiled) lines.push(t('endless.result.spoiled', { n: last.spoiled }));
  for (const id of last.quests) {
    const q = QUESTS.find((x) => x.id === id);
    lines.push(t('endless.result.quest', { name: t(`quest.${id}`), reward: rewardText(q) }));
  }
  if (last.month) {
    lines.push(t(last.month.win ? 'endless.result.monthWin' : 'endless.result.monthLose', { mine: num(last.month.mine), rival: num(last.month.rival), bonus: num(last.month.bonus) }));
  }
  if (last.bankrupt) lines.push(t(last.bankrupt === 'over' ? 'endless.result.over' : 'endless.result.bailout'));
  return h('div', { class: 'res-extra', dataset: { id: 'endless-extra' } }, lines.map((x, i) => h('div', { class: last.bankrupt && i === lines.length - 1 ? 'warn' : '' }, x)));
}

/** 開始經營。E 是無限模式的狀態。 */
export function startEndless(app, E) {
  let scene = null;
  const ctx = {
    E: () => E,
    act: (a, quiet) => scene.act(a, quiet),
    save: () => saveEndless(app, E),
    notify: (text) => toast(text, 1600),
    onShopChanged: () => { scene.state = E.s; },
    setFloor: (k) => scene.setFloor(k),
    viewFloor: () => scene.getFloor(),
  };
  const builder = createBuilder(ctx);
  const leave = () => app.go('owner');

  function gameOver() {
    app.store.remove(SAVE_KEYS.endless);
    app.scenes.push(createOverlayMenu(app, {
      name: 'endless-over',
      title: t('endless.over.title'),
      body: t('endless.over.stats', { days: E.stats.days, revenue: num(E.stats.revenue), served: num(E.stats.served), best: num(E.stats.bestDay) }),
      items: [
        { id: 'over-new', label: t('endless.over.new'), cls: 'red', action: () => { app.scenes.reset(createEndlessMenuScene(app)); startEndless(app, createEndless(newSeed(app))); } },
        { id: 'over-menu', label: t('endless.over.menu'), action: leave },
      ],
    }));
  }

  scene = createShopScene(app, {
    name: 'endless',
    state: E.s,
    title: () => dateText(E.day),
    apply(action) {
      // 開店前先存檔：營業中離開的話，回來從今天的準備階段開始
      if (action.type === 'open' && E.s.phase === 'prep') { builder.cancel(); saveEndless(app, E); }
      const r = applyEndless(E, action);
      if (r.ok && ['place', 'move', 'sell', 'hire', 'fire', 'research', 'borrow', 'repay', 'setBoard', 'setTrack', 'addFloor', 'train', 'expand'].includes(action.type)) saveEndless(app, E);
      return r;
    },
    bars: () => ({ rival: Math.round(E.month.rival / 28), name: t('hud.rivalDaily') }),
    extraTabs: [builder.tab, manageTab(ctx)],
    structKey: () => [E.day, floorCount(E.s.shop), E.research.length, E.questsDone.length, E.s.staff.length, E.size, builder.key(), E.s.shop.furniture.length, boardsUnlocked(E), tracksUnlocked(E)].join('.'),
    overlayDraw: (c) => builder.overlayDraw(c),
    onPick: (grid) => builder.onPick(grid),
    onHover: (grid) => builder.onHover(grid),
    pauseItems: () => [
      E.s.phase === 'prep'
        ? { id: 'quit', label: t('endless.quit'), action: () => { saveEndless(app, E); leave(); } }
        : { id: 'quit', label: t('endless.quit.open'), action: leave },
    ],
    onClosed(state) {
      const day = state.day;
      const date = dateText(E.day);
      const last = endDay(E);
      if (!E.gameOver) saveEndless(app, E);
      const result = {
        revenue: day.revenue, target: 0, passed: !last.bankrupt, stars: 0, profit: last.profit,
        repStart: last.repStart, reputation: last.reputation,
      };
      app.scenes.push(createResultsScene(app, {
        state: { day: last.day, rival: null }, result,
        title: t('endless.result.title', { date }),
        showStars: false, showTarget: false,
        extraCosts: [{ label: t('endless.result.rent'), value: last.rent }].concat(last.interest ? [{ label: t('endless.result.interest'), value: last.interest }] : []),
        profit: last.profit,
        extra: resultExtra(E, last),
        buttons: [{
          id: 'next-day', label: t('endless.result.next'), cls: 'red',
          action: () => {
            app.scenes.pop();
            if (E.gameOver) { gameOver(); return; }
            scene.state = E.s;
            scene.setSpeed(1);
          },
        }],
      }));
    },
  });
  scene.debug.endless = () => JSON.parse(JSON.stringify({ ...E, s: undefined }));
  scene.debug.full = () => E;
  app.scenes.push(scene);
  return scene;
}

function newSeed(app) {
  return app.params.seed ?? ((Date.now() ^ 0x51f15) >>> 0);
}

/** 無限模式的入口選單：繼續或新遊戲。 */
export function createEndlessMenuScene(app) {
  const saved = loadEndless(app);
  const fresh = () => {
    app.store.remove(SAVE_KEYS.endless);
    startEndless(app, createEndless(newSeed(app)));
  };
  const items = [];
  if (saved) {
    items.push({
      id: 'endless-continue', label: t('endless.continue'), cls: 'red',
      desc: t('endless.continue.desc', { date: dateText(saved.day), money: num(saved.s.money) }),
      action: () => startEndless(app, saved),
    });
  }
  items.push({
    id: 'endless-new', label: t('endless.new'), desc: t('endless.new.desc'), cls: saved ? 'plain' : 'red',
    action: () => {
      if (!saved) { fresh(); return; }
      app.scenes.push(createOverlayMenu(app, {
        name: 'confirm', title: t('endless.new.confirm'),
        items: [
          { id: 'yes', label: t('common.ok'), cls: 'red', action: () => { app.scenes.pop(); fresh(); } },
          { id: 'no', label: t('common.cancel'), action: () => app.scenes.pop() },
        ],
        onEscape: () => app.scenes.pop(),
      }));
    },
  });
  return createMenuScene(app, { name: 'endless-menu', title: t('endless.title'), items, back: () => app.go('owner') });
}

/** 設定畫面的「匯出、匯入無限模式存檔」。 */
export function endlessSettings(app) {
  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden', dataset: { id: 'import-file' } });
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data = null;
      try { data = JSON.parse(String(reader.result)); } catch (e) { data = null; }
      if (validEndless(data)) { saveEndless(app, data); toast(t('settings.import.ok'), 2000); } else toast(t('settings.import.bad'), 2500);
      file.value = '';
    };
    reader.readAsText(f);
  });
  const exportBtn = h('button', {
    class: 'btn plain', dataset: { id: 'export-endless' },
    onclick: () => {
      const raw = loadEndless(app) ? app.store.raw(SAVE_KEYS.endless) : null;
      if (!raw) { toast(t('settings.export.none'), 2000); return; }
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = h('a', { href: url, download: 'sushi-endless.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  }, t('settings.export'));
  const importBtn = h('button', { class: 'btn plain', dataset: { id: 'import-endless' }, onclick: () => file.click() }, t('settings.import'));
  return h('div', { class: 'set-btns' }, exportBtn, importBtn, file);
}

export { yen, SUSHI };
