// 側邊面板：菜單、進貨、員工、設施。
// 每個分頁建立一次 DOM，之後只更新會變的文字（updaters），避免按鈕在按到一半時被換掉。
import { h, clear } from './dom.js';
import { t } from '../data/strings.js';
import * as B from '../data/balance.js';
import { SUSHI, gradeOfMode } from '../data/sushi.js';
import { STAFF } from '../data/characters.js';
import { stockCap, totalStock, unitCost, suggestPurchases, sellPrice } from '../sim/economy.js';
import { getSprite, getPortrait, spriteDataURL } from '../iso/sprites.js';
import { yen } from './hud.js';

export function sushiIcon(item, scale = 2) {
  return h('img', { class: 'px-icon', src: spriteDataURL(getSprite(`sushi.${item}`), scale), alt: '', draggable: false });
}

export function portraitImg(charId, scale = 3, angry = false) {
  return h('img', { class: 'px-icon portrait', src: spriteDataURL(getPortrait(charId, angry), scale), alt: '', draggable: false });
}

/** 其他模組可以在「設施」分頁加區塊（小鋼珠、賽道）。fn(state, env, updaters) 回傳節點或 null。 */
export const facilitySections = [];

/**
 * 建立側邊面板。
 * env = { getState(), act(action) → 結果, extraTabs: [{ id, label, build(body, updaters) }] }
 */
export function createSidePanel(env) {
  let tab = 'menu';
  let updaters = [];
  let structKey = '';
  const buyQty = {}; // 進貨分頁填的數量：'item|grade' → 數量
  const body = h('div', { class: 'tab-body' });
  const tabs = [
    { id: 'menu', label: t('tab.menu'), build: buildMenu },
    { id: 'buy', label: t('tab.buy'), build: buildBuy },
    { id: 'staff', label: t('tab.staff'), build: buildStaff },
    { id: 'fac', label: t('tab.fac'), build: buildFac },
  ].concat(env.extraTabs || []);
  const tabBtns = tabs.map((tb) => h('button', {
    class: 'tab-btn', dataset: { tab: tb.id },
    onclick: () => { if (env.sfx) env.sfx('button'); setTab(tb.id); },
  }, tb.label));
  const root = h('div', { class: 'side solid' }, h('div', { class: 'tabs' }, tabBtns), body);

  function setTab(id) {
    tab = id;
    rebuild();
    if (env.onTab) env.onTab(id);
  }

  /** 結構鍵：會影響版面的東西變了就整個重建。 */
  function currentKey() {
    const s = env.getState();
    return [tab, s.phase === 'closed' ? 'c' : 'o', Object.keys(s.menu).join(','), s.staff.map((x) => x.id).join(','),
      s.features.cheap ? 1 : 0, s.features.disguise ? 1 : 0, s.features.uniform ? 1 : 0, s.features.sellPremium ? 1 : 0,
      s.shop.ver, env.structKey ? env.structKey() : ''].join('|');
  }

  function rebuild() {
    updaters = [];
    clear(body);
    for (const b of tabBtns) b.classList.toggle('active', b.dataset.tab === tab);
    const def = tabs.find((x) => x.id === tab) || tabs[0];
    def.build(body, updaters);
    structKey = currentKey();
    for (const u of updaters) u();
  }

  // ---- 菜單 ----
  function buildMenu(el, ups) {
    const s0 = env.getState();
    const note = h('div', { class: 'panel-note hidden' }, t('panel.menu.uniform'));
    el.appendChild(note);
    ups.push(() => note.classList.toggle('hidden', !env.getState().uniform));
    for (const item of Object.keys(s0.menu)) {
      const price = h('span', { class: 'price' }, '');
      const stock = h('span', { class: 'num' }, '');
      const sold = h('span', { class: 'num' }, '');
      const toggle = h('button', {
        class: 'btn plain mini toggle', dataset: { id: `on-${item}` },
        onclick: () => env.act({ type: 'setMenu', item, on: !env.getState().menu[item].on }),
      }, '');
      const minus = h('button', { class: 'btn plain mini', dataset: { id: `minus-${item}` }, onclick: () => env.act({ type: 'setMenu', item, price: env.getState().menu[item].price - B.PRICE_STEP }) }, '−');
      const plus = h('button', { class: 'btn plain mini', dataset: { id: `plus-${item}` }, onclick: () => env.act({ type: 'setMenu', item, price: env.getState().menu[item].price + B.PRICE_STEP }) }, '+');
      let modeSel = null;
      if (s0.features.cheap) {
        const modes = ['premium', 'cheapHonest'].concat(s0.features.disguise ? ['cheapDisguised'] : []);
        modeSel = h('select', { class: 'mode-sel', dataset: { id: `mode-${item}` }, onchange: (e) => env.act({ type: 'setMenu', item, mode: e.target.value }) },
          modes.map((m) => h('option', { value: m }, t(`panel.mode.${m}`))));
      }
      const row = h('div', { class: 'row menu-row', dataset: { item } },
        sushiIcon(item),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-name' }, t(`sushi.${item}`), h('small', null, ` ${t(`tier.${SUSHI[item].tier}`)}`)),
          h('div', { class: 'row-sub' }, t('panel.menu.ref', { p: SUSHI[item].ref }), ' · ', t('panel.menu.stock'), ' ', stock, ' · ', t('panel.menu.sold'), ' ', sold)),
        h('div', { class: 'row-ctl' }, modeSel, h('div', { class: 'stepper' }, minus, price, plus), toggle));
      el.appendChild(row);
      ups.push(() => {
        const s = env.getState();
        const m = s.menu[item];
        price.textContent = yen(sellPrice(s, item));
        price.classList.toggle('high', sellPrice(s, item) > SUSHI[item].ref * (m.mode === 'cheapHonest' ? B.CHEAP_HONEST_REF : 1));
        const n = s.stock[item][gradeOfMode(m.mode)];
        stock.textContent = String(n);
        stock.classList.toggle('zero', n === 0);
        sold.textContent = String(s.day.sold[item] || 0);
        toggle.textContent = m.on ? '✔' : '✖';
        toggle.classList.toggle('off', !m.on);
        row.classList.toggle('off', !m.on);
        if (modeSel && modeSel.value !== m.mode) modeSel.value = m.mode;
        minus.disabled = plus.disabled = s.uniform;
      });
    }
  }

  // ---- 進貨 ----
  function buildBuy(el, ups) {
    const s0 = env.getState();
    const cap = h('div', { class: 'panel-note' }, '');
    const emergency = h('div', { class: 'panel-note warn hidden' }, t('panel.buy.emergency'));
    el.appendChild(cap);
    el.appendChild(emergency);
    const grades = s0.features.cheap ? ['premium', 'cheap'] : ['premium'];
    const total = h('span', { class: 'buy-total' }, '');
    const refreshTotal = () => {
      const s = env.getState();
      let cost = 0;
      for (const [k, q] of Object.entries(buyQty)) {
        const [item, grade] = k.split('|');
        if (q > 0 && s.stock[item]) cost += unitCost(s, item, grade) * q * (s.phase === 'open' ? B.EMERGENCY_MARKUP : 1);
      }
      total.textContent = t('panel.buy.total', { cost: Math.round(cost).toLocaleString('en-US') });
      total.classList.toggle('over', cost > s.money);
    };
    for (const grade of grades) {
      if (grades.length > 1) el.appendChild(h('div', { class: 'panel-head' }, t(`panel.buy.grade.${grade}`)));
      for (const item of Object.keys(s0.menu)) {
        const k = `${item}|${grade}`;
        const have = h('span', { class: 'num' }, '');
        const unit = h('span', { class: 'num' }, '');
        const qty = h('span', { class: 'qty', dataset: { id: `qty-${item}-${grade}` } }, '0');
        const setQ = (v) => { buyQty[k] = Math.max(0, v); qty.textContent = String(buyQty[k]); refreshTotal(); };
        const sell = s0.features.sellPremium && grade === 'premium'
          ? h('button', { class: 'btn plain mini', dataset: { id: `sell-${item}` }, title: t('panel.buy.sell'), onclick: () => env.act({ type: 'sellPremium', item, qty: 10 }) }, '賣10')
          : null;
        el.appendChild(h('div', { class: 'row buy-row' },
          sushiIcon(item),
          h('div', { class: 'row-main' },
            h('div', { class: 'row-name' }, t(`sushi.${item}`)),
            h('div', { class: 'row-sub' }, t('panel.buy.unit'), ' ', unit, ' · ', t('panel.buy.have'), ' ', have)),
          h('div', { class: 'row-ctl' }, sell,
            h('div', { class: 'stepper' },
              h('button', { class: 'btn plain mini', onclick: () => setQ((buyQty[k] || 0) - 10) }, '−'),
              qty,
              h('button', { class: 'btn plain mini', dataset: { id: `add-${item}-${grade}` }, onclick: () => setQ((buyQty[k] || 0) + 10) }, '+')))));
        ups.push(() => {
          const s = env.getState();
          have.textContent = String(s.stock[item][grade]);
          unit.textContent = yen(Math.round(unitCost(s, item, grade) * (s.phase === 'open' ? B.EMERGENCY_MARKUP : 1)));
          if (qty.textContent !== String(buyQty[k] || 0)) qty.textContent = String(buyQty[k] || 0);
        });
      }
    }
    const foot = h('div', { class: 'panel-foot' },
      total,
      h('div', { class: 'foot-btns' },
        h('button', {
          class: 'btn plain', dataset: { id: 'suggest' },
          onclick: () => {
            for (const k of Object.keys(buyQty)) buyQty[k] = 0;
            for (const e of suggestPurchases(env.getState())) buyQty[`${e.item}|${e.grade}`] = e.qty;
            refreshTotal();
            for (const u of ups) u();
            if (env.onSuggest) env.onSuggest();
          },
        }, t('panel.buy.suggest')),
        h('button', {
          class: 'btn red', dataset: { id: 'buy' },
          onclick: () => {
            let cost = 0;
            let n = 0;
            for (const [k, q] of Object.entries(buyQty)) {
              if (!(q > 0)) continue;
              const [item, grade] = k.split('|');
              const r = env.act({ type: 'buy', item, grade, qty: q }, true);
              if (r.ok) { cost += r.cost; n += r.qty; buyQty[k] = 0; } else { env.fail(r.reason); break; }
            }
            if (n > 0 && env.onBought) env.onBought(n, cost);
            refreshTotal();
            for (const u of ups) u();
          },
        }, t('panel.buy.buy'))));
    el.appendChild(foot);
    ups.push(() => {
      const s = env.getState();
      const incoming = s.deliveries.reduce((a, d) => a + d.qty, 0);
      cap.textContent = t('panel.buy.cap', { n: totalStock(s), cap: stockCap(s) }) + (incoming ? `（${t('panel.buy.incoming', { n: incoming })}）` : '');
      emergency.classList.toggle('hidden', s.phase !== 'open');
      refreshTotal();
    });
  }

  // ---- 員工 ----
  function buildStaff(el, ups) {
    const s0 = env.getState();
    for (const st of s0.staff) {
      const def = STAFF[st.id];
      const roleBtns = ['chef', 'floor', 'off'].map((role) => h('button', {
        class: 'btn plain mini role-btn', dataset: { id: `role-${st.id}-${role}` },
        onclick: () => env.act({ type: 'setRole', staff: st.id, role }),
      }, t(`panel.staff.role.${role}`)));
      const status = h('div', { class: 'row-sub' }, '');
      const img = portraitImg(def.look, 3);
      el.appendChild(h('div', { class: 'row staff-row' },
        img,
        h('div', { class: 'row-main' },
          h('div', { class: 'row-name' }, t(`char.${st.id}`), def.lang ? h('small', null, ` ${t('panel.staff.lang')}`) : null),
          h('div', { class: 'row-sub' }, `${t('panel.staff.speed')} ${def.speed} · ${t('panel.staff.skill')} ${def.skill} · ${t('panel.staff.service')} ${def.service}`),
          status),
        h('div', { class: 'row-ctl roles' }, roleBtns)));
      ups.push(() => {
        const s = env.getState();
        const cur = s.staff.find((x) => x.id === st.id);
        if (!cur) return;
        roleBtns.forEach((b, i) => b.classList.toggle('active', ['chef', 'floor', 'off'][i] === cur.role));
        status.textContent = cur.gone ? t('panel.staff.gone') : t('panel.staff.wage', { w: def.wage.toLocaleString('en-US') });
        status.classList.toggle('warn', !!cur.gone);
      });
    }
  }

  // ---- 設施 ----
  function buildFac(el, ups) {
    const s0 = env.getState();
    let any = false;
    if (s0.features.uniform && s0.shop.furniture.some((f) => f.type === 'uniformSign')) {
      any = true;
      const btn = h('button', { class: 'btn plain', dataset: { id: 'uniform' }, onclick: () => env.act({ type: 'setUniform', on: !env.getState().uniform }) }, '');
      el.appendChild(h('div', { class: 'row' },
        h('div', { class: 'row-main' }, h('div', { class: 'row-name' }, t('panel.fac.uniform')), h('div', { class: 'row-sub' }, t('furn.desc.uniformSign'))),
        h('div', { class: 'row-ctl' }, btn)));
      ups.push(() => {
        const on = env.getState().uniform;
        btn.textContent = on ? t('panel.fac.uniform.off') : t('panel.fac.uniform.on');
        btn.classList.toggle('active', on);
      });
    }
    for (const fn of facilitySections) {
      const node = fn(s0, env, ups);
      if (node) { any = true; el.appendChild(node); }
    }
    if (!any) el.appendChild(h('div', { class: 'panel-note' }, t('panel.fac.none')));
  }

  rebuild();

  return {
    root,
    setTab,
    getTab: () => tab,
    /** 每秒呼叫幾次：更新數字；結構變了就重建。 */
    update() {
      if (currentKey() !== structKey) { rebuild(); return; }
      for (const u of updaters) u();
    },
    rebuild,
    buyFilled: () => Object.values(buyQty).some((q) => q > 0),
  };
}
