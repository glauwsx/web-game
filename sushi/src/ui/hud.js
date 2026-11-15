// 經營畫面的 HUD：上方資訊列、下方營業額長條、警告橫幅、想法氣泡。
import { h, clear } from './dom.js';
import { t } from '../data/strings.js';
import * as B from '../data/balance.js';
import { STAFF } from '../data/characters.js';
import { minuteOfDay } from '../sim/economy.js';
import { rivalNow, targetRevenue } from '../sim/shop.js';
import { kufuActive } from '../sim/staff.js';
import { buchoAround } from '../sim/bosses.js';

export const yen = (n) => `¥${Math.round(n).toLocaleString('en-US')}`;

export function clockText(minute) {
  const hh = Math.floor(minute / 60);
  const mm = minute % 60;
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

/** 把通知變成文字。 */
export function feedText(entry) {
  const p = { ...(entry.p || {}) };
  if (p.item) p.name = t(`sushi.${p.item}`);
  return t(entry.key, p);
}

/**
 * 建立 HUD。
 * env = { title, getState(), act(action), getSpeed(), setSpeed(n), onMenu(), onOpen() }
 * 回傳 { top, bottom, banner, update() }。
 */
export function createHud(env) {
  const el = {};
  const speedBtns = B.SPEEDS.map((sp) => h('button', {
    class: 'btn plain speed-btn', dataset: { speed: sp },
    title: sp === 0 ? t('hud.pause') : `${sp}x`,
    onclick: () => env.setSpeed(sp),
  }, sp === 0 ? 'II' : `${sp}x`));

  const top = h('div', { class: 'hud solid' },
    h('div', { class: 'hud-clock' },
      el.clock = h('span', { class: 'clock' }, ''),
      el.title = h('span', { class: 'hud-title' }, env.title || '')),
    h('div', { class: 'hud-money', title: t('hud.money') }, el.money = h('span', null, '')),
    h('div', { class: 'hud-rep', title: t('hud.rep') },
      el.stars = h('span', { class: 'stars' }, h('span', { class: 'stars-bg' }, '★★★★★'), el.starsFill = h('span', { class: 'stars-fill' }, '★★★★★')),
      el.rep = h('span', { class: 'rep-num' }, '')),
    h('div', { class: 'hud-kufu' },
      h('div', { class: 'kufu-gauge', title: t('hud.kufu') }, el.kufuFill = h('div', { class: 'kufu-fill' }), h('span', { class: 'kufu-label' }, t('hud.kufu'))),
      el.kufuBtn = h('button', { class: 'btn red kufu-btn', dataset: { id: 'kufu' }, onclick: () => env.act({ type: 'kufu' }) }, t('hud.kufu.go')),
      el.disguise = h('button', {
        class: 'btn indigo disguise-btn', dataset: { id: 'disguise' },
        onclick: () => {
          const ryo = env.getState().staff.find((s) => STAFF[s.id].player);
          env.act({ type: 'disguise', on: !(ryo && ryo.disguised) });
        },
      }, t('hud.disguise'))),
    h('div', { class: 'hud-speed' }, speedBtns),
    h('button', { class: 'btn plain hud-menu', dataset: { id: 'menu' }, onclick: () => env.onMenu() }, '☰'));

  const bottom = h('div', { class: 'bottom solid' },
    h('div', { class: 'bottom-bars' },
      h('div', { class: 'bar-row' },
        h('span', { class: 'bar-name' }, t('hud.revenue')),
        h('div', { class: 'bar' }, el.barMine = h('div', { class: 'bar-fill mine' })),
        el.numMine = h('span', { class: 'bar-num' }, '')),
      h('div', { class: 'bar-row' },
        el.rivalName = h('span', { class: 'bar-name' }, ''),
        h('div', { class: 'bar' }, el.barRival = h('div', { class: 'bar-fill rival' })),
        el.numRival = h('span', { class: 'bar-num' }, ''))),
    h('div', { class: 'bottom-info' },
      el.cust = h('div', null, ''),
      el.served = h('div', null, '')),
    el.feed = h('div', { class: 'bottom-feed' }, ''),
    el.open = h('button', { class: 'btn red open-btn', dataset: { id: 'open' }, onclick: () => env.onOpen() }, t('hud.open')));

  const banner = h('div', { class: 'banner hidden' }, '');
  let lastBanner = null;

  function update() {
    const s = env.getState();
    const minute = minuteOfDay(s);
    el.clock.textContent = s.phase === 'prep' ? t('hud.prep') : s.phase === 'closed' ? t('hud.closed') : clockText(minute);
    el.money.textContent = yen(s.money);
    el.money.classList.toggle('neg', s.money < 0);
    el.starsFill.style.width = `${Math.max(0, Math.min(100, s.reputation))}%`;
    el.rep.textContent = String(Math.round(s.reputation));
    el.kufuFill.style.width = `${(s.kufu / B.KUFU_MAX) * 100}%`;
    const active = kufuActive(s);
    el.kufuBtn.disabled = s.phase !== 'open' || s.kufu < B.KUFU_MAX || active;
    el.kufuBtn.classList.toggle('ready', !el.kufuBtn.disabled);
    el.kufuBtn.textContent = active ? t('hud.kufu.active') : t('hud.kufu.go');
    el.kufuFill.classList.toggle('active', active);
    const ryo = s.staff.find((x) => STAFF[x.id].player);
    const hasBucho = s.events.some((e) => e.kind === 'bucho') || (ryo && ryo.disguised);
    el.disguise.classList.toggle('hidden', !hasBucho);
    el.disguise.textContent = ryo && ryo.disguised ? t('hud.disguise.off') : t('hud.disguise');
    el.disguise.classList.toggle('alert', !!ryo && !ryo.disguised && buchoAround(s));
    el.disguise.classList.toggle('on', !!ryo && ryo.disguised);
    const speed = env.getSpeed();
    for (const b of speedBtns) b.classList.toggle('active', Number(b.dataset.speed) === speed);
    // 下方長條
    const mine = s.day.revenue;
    const target = targetRevenue(s);
    const rival = s.rival ? rivalNow(s) : target;
    const max = Math.max(target * 1.2, mine * 1.05, 1);
    el.barMine.style.width = `${Math.max(0, mine / max) * 100}%`;
    el.barRival.style.width = `${(rival / max) * 100}%`;
    el.numMine.textContent = yen(mine);
    el.numRival.textContent = yen(rival);
    el.rivalName.textContent = s.rival ? t('hud.rival') : t('hud.target');
    el.barMine.classList.toggle('ahead', mine >= rival);
    const inShop = s.customers.filter((c) => ['toSeat', 'decide', 'wait', 'eat', 'play', 'prize'].includes(c.st)).length;
    el.cust.textContent = t('hud.customers', { n: inShop, q: s.queue.length });
    el.served.textContent = ryo && ryo.gone ? t('hud.away', { m: Math.ceil(ryo.gone / B.TICKS_PER_MIN) }) : t('hud.served', { n: s.day.served });
    el.served.classList.toggle('warn', !!(ryo && ryo.gone));
    const f = s.feed[s.feed.length - 1];
    el.feed.textContent = f ? feedText(f) : '';
    el.open.classList.toggle('hidden', s.phase !== 'prep');
    el.feed.classList.toggle('hidden', s.phase === 'prep');
    // 橫幅
    const key = s.banner ? s.banner.key : null;
    if (key !== lastBanner) {
      lastBanner = key;
      banner.classList.toggle('hidden', !key);
      banner.className = `banner ${key ? '' : 'hidden'} ${s.banner ? `kind-${s.banner.kind}` : ''}`;
      banner.textContent = key ? t(key) : '';
      if (key && env.onBanner) env.onBanner(s.banner);
    }
  }

  return { top, bottom, banner, update };
}

/** 想法氣泡：固定數量的 DOM 節點重複使用。 */
export function createBubbles(max = 12) {
  const root = h('div', { class: 'bubbles' });
  const pool = [];
  for (let i = 0; i < max; i++) {
    const b = h('div', { class: 'bubble hidden' }, '');
    pool.push(b);
    root.appendChild(b);
  }
  return {
    root,
    /** list = [{ x, y, text, cls }]，座標是舞台上的 CSS 像素。 */
    show(list) {
      for (let i = 0; i < pool.length; i++) {
        const b = pool[i];
        const e = list[i];
        if (!e) { if (!b.classList.contains('hidden')) b.classList.add('hidden'); continue; }
        if (b.textContent !== e.text) b.textContent = e.text;
        b.className = `bubble ${e.cls || ''}`;
        b.style.transform = `translate(${Math.round(e.x)}px, ${Math.round(e.y)}px) translate(-50%, -100%)`;
      }
    },
  };
}

/** 資訊浮窗。 */
export function createInfoPop() {
  const root = h('div', { class: 'info-pop solid hidden' });
  let render = null;
  return {
    root,
    open(x, y, renderFn) {
      render = renderFn;
      root.classList.remove('hidden');
      root.style.left = `${Math.round(x)}px`;
      root.style.top = `${Math.round(y)}px`;
      this.update();
    },
    close() { render = null; root.classList.add('hidden'); },
    isOpen() { return !!render; },
    update() {
      if (!render) return;
      const content = render();
      if (!content) { this.close(); return; }
      clear(root);
      root.appendChild(content);
    },
  };
}
