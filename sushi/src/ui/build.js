// 無限模式的「建造」分頁：選家具、在地板上擺放、移動、賣出、擴建。
// 點地板的處理（onPick）和預覽框（overlayDraw）由經營畫面呼叫。
import { h } from './dom.js';
import { t } from '../data/strings.js';
import * as B from '../data/balance.js';
import { FURNITURE } from '../data/furniture.js';
import { canPlace } from '../sim/pathfind.js';
import { buildable, rentOf } from '../sim/endless.js';
import { getSprite, spriteDataURL } from '../iso/sprites.js';
import { strokeCell, fillCell } from '../iso/render.js';
import { yen } from './hud.js';

const OK_FILL = 'rgba(120, 220, 110, 0.45)';
const BAD_FILL = 'rgba(230, 70, 60, 0.45)';

/**
 * env = { E()（無限模式狀態）, act(action)（失敗會自己顯示原因）, notify(text), onShopChanged() }
 * 回傳 { tab, overlayDraw, onPick, onHover, key(), cancel() }
 */
export function createBuilder(env) {
  let mode = null;   // null、{ kind: 'place', type }、{ kind: 'move', id }、{ kind: 'sell' }
  let hover = null;  // 滑鼠所在的格子

  const shop = () => env.E().s.shop;
  const furnitureAt = (x, y) => shop().furniture.find((f) => {
    const d = FURNITURE[f.type];
    return x >= f.x && x < f.x + d.w && y >= f.y && y < f.y + d.h;
  }) || null;
  const prep = () => env.E().s.phase === 'prep';

  function noteText() {
    if (!prep()) return t('build.note.open');
    if (!mode) return t('build.note.idle');
    if (mode.kind === 'place') return t('build.note.place', { name: t(`furn.${mode.type}`) });
    if (mode.kind === 'sell') return t('build.note.sell');
    const f = mode.id ? shop().furniture.find((x) => x.id === mode.id) : null;
    return f ? t('build.note.move2', { name: t(`furn.${f.type}`) }) : t('build.note.move');
  }

  function buildTab(el, ups) {
    const E = env.E();
    const note = h('div', { class: 'panel-note build-note', dataset: { id: 'build-note' } }, '');
    el.appendChild(note);
    const tool = (kind, label) => h('button', {
      class: 'btn plain mini', dataset: { id: `build-${kind}` },
      onclick: () => { mode = kind === 'cancel' || (mode && mode.kind === kind) ? null : { kind }; refresh(); },
    }, label);
    const tools = { move: tool('move', t('build.move')), sell: tool('sell', t('build.sell')), cancel: tool('cancel', t('build.cancel')) };
    el.appendChild(h('div', { class: 'build-tools' }, tools.move, tools.sell, tools.cancel));
    const rows = [];
    for (const type of buildable(E)) {
      const def = FURNITURE[type];
      const btn = h('button', {
        class: 'btn plain mini', dataset: { id: `build-pick-${type}` },
        onclick: () => { mode = mode && mode.kind === 'place' && mode.type === type ? null : { kind: 'place', type }; refresh(); },
      }, t('build.buy'));
      const price = h('span', { class: 'price' }, t('build.price', { n: def.price.toLocaleString('en-US') }));
      const row = h('div', { class: 'row build-row', dataset: { type } },
        h('img', { class: 'px-icon build-icon', src: spriteDataURL(getSprite(`furn.${type}`), 1), alt: '', draggable: false }),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-name' }, t(`furn.${type}`), h('small', null, ` ${def.w}×${def.h}`)),
          h('div', { class: 'row-sub' }, t(`furn.desc.${type}`))),
        h('div', { class: 'row-ctl' }, price, btn));
      el.appendChild(row);
      rows.push({ type, row, btn, price, def });
    }
    // 擴建
    el.appendChild(h('div', { class: 'panel-head' }, t('build.expand')));
    const next = B.ENDLESS.SIZES[E.size + 1];
    const expBtn = h('button', {
      class: 'btn red', dataset: { id: 'build-expand' },
      onclick: () => { const r = env.act({ type: 'expand' }); if (r.ok) { env.notify(t('build.expanded')); env.onShopChanged(); } },
    }, t('build.expand'));
    const cur = h('div', { class: 'row-sub' }, '');
    el.appendChild(h('div', { class: 'row' },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-name' }, next ? t('build.expand.next', { w: next.w, h: next.h }) : t('build.expand.max')),
        next ? h('div', { class: 'row-sub' }, t('build.expand.need', { price: next.price.toLocaleString('en-US'), rep: next.rep })) : null,
        cur),
      next ? h('div', { class: 'row-ctl' }, expBtn) : null));

    function refresh() {
      const s = env.E().s;
      const open = !prep();
      if (open) mode = null;
      note.textContent = noteText();
      for (const r of rows) {
        const on = !!mode && mode.kind === 'place' && mode.type === r.type;
        r.row.classList.toggle('active', on);
        r.btn.classList.toggle('active', on);
        r.btn.disabled = open;
        r.price.classList.toggle('high', r.def.price > s.money);
      }
      tools.move.classList.toggle('active', !!mode && mode.kind === 'move');
      tools.sell.classList.toggle('active', !!mode && mode.kind === 'sell');
      tools.move.disabled = tools.sell.disabled = open;
      tools.cancel.disabled = !mode;
      cur.textContent = t('build.expand.rent', { w: s.shop.w, h: s.shop.h, rent: rentOf(s.shop).toLocaleString('en-US') });
      if (next) expBtn.disabled = open || s.money < next.price || s.reputation < next.rep;
    }
    ups.push(refresh);
  }

  return {
    tab: { id: 'build', label: t('tab.build'), build: buildTab },
    key: () => `${prep() ? 'p' : 'o'}${buildable(env.E()).length}`,
    cancel() { mode = null; },
    active: () => !!mode,
    onHover(grid) { hover = { x: Math.floor(grid.gx), y: Math.floor(grid.gy) }; },
    /** 點了地板。有處理就回傳 true。 */
    onPick(grid) {
      if (!mode || !prep()) return false;
      const x = Math.floor(grid.gx);
      const y = Math.floor(grid.gy);
      hover = { x, y };
      if (mode.kind === 'place') {
        const r = env.act({ type: 'place', furniture: mode.type, x, y });
        if (r.ok) env.notify(t('build.placed', { name: t(`furn.${mode.type}`), n: r.cost.toLocaleString('en-US') }));
        return true;
      }
      if (mode.kind === 'sell') {
        const f = furnitureAt(x, y);
        if (!f) return true;
        const r = env.act({ type: 'sell', id: f.id });
        if (r.ok) env.notify(t('build.sold', { name: t(`furn.${f.type}`), n: r.gain.toLocaleString('en-US') }));
        return true;
      }
      if (!mode.id) {
        const f = furnitureAt(x, y);
        if (f) mode.id = f.id;
        return true;
      }
      const r = env.act({ type: 'move', id: mode.id, x, y });
      if (r.ok) mode.id = 0;
      return true;
    },
    /** 預覽框。在 drawScene 的 overlay 裡呼叫（世界座標）。 */
    overlayDraw(ctx) {
      if (!mode || !prep()) return;
      const s = shop();
      strokeCell(ctx, 0, 0, s.w, s.h, 'rgba(255, 244, 220, 0.5)');
      const moving = mode.kind === 'move' && mode.id ? s.furniture.find((f) => f.id === mode.id) : null;
      if (moving) { const d = FURNITURE[moving.type]; strokeCell(ctx, moving.x, moving.y, d.w, d.h, '#f2c94c'); }
      if (!hover) return;
      if (mode.kind === 'place' || moving) {
        const type = moving ? moving.type : mode.type;
        const d = FURNITURE[type];
        const ok = canPlace(s, type, hover.x, hover.y, moving ? moving.id : null).ok;
        fillCell(ctx, hover.x, hover.y, d.w, d.h, ok ? OK_FILL : BAD_FILL);
        strokeCell(ctx, hover.x, hover.y, d.w, d.h, ok ? '#2f7d2a' : '#a02a20');
        for (const [rx, ry] of d.reserve || []) fillCell(ctx, hover.x + rx, hover.y + ry, 1, 1, 'rgba(255, 244, 220, 0.3)');
      } else {
        const f = furnitureAt(hover.x, hover.y);
        if (f) { const d = FURNITURE[f.type]; fillCell(ctx, f.x, f.y, d.w, d.h, mode.kind === 'sell' ? BAD_FILL : 'rgba(242, 201, 76, 0.4)'); }
      }
    },
  };
}

export { yen };
