// 經營畫面的場景：把模擬、等角繪圖、HUD、側邊面板接在一起。
// 關卡模式和無限模式共用。流程（對話、結算、存檔）由呼叫的模組處理。
import { h, toast } from '../ui/dom.js';
import { t } from '../data/strings.js';
import * as B from '../data/balance.js';
import { FURNITURE } from '../data/furniture.js';
import { STAFF } from '../data/characters.js';
import { createStepper } from '../core/loop.js';
import { createShopState, stepShop, applyAction, summary } from '../sim/shop.js';
import { botActions } from '../sim/bots.js';
import { kufuActive } from '../sim/staff.js';
import { totalStock } from '../sim/economy.js';
import { createCamera, setBounds, panCamera, zoomCamera, centerCamera, worldToScreen, screenToWorld } from '../iso/camera.js';
import { drawScene, cameraBounds, invalidateBackground } from '../iso/render.js';
import { facingFromDelta, facingFromName, gridToWorld, worldToGrid, furnitureDepth } from '../iso/iso.js';
import { createHud, createBubbles, createInfoPop, yen } from '../ui/hud.js';
import { createSidePanel, portraitImg } from '../ui/panels.js';
import { createHints } from '../ui/dialog.js';
import { createOverlayMenu } from '../ui/menus.js';

const SEATED = ['decide', 'wait', 'eat', 'play', 'prize'];

/** 其他模組可以替某種家具提供資訊浮窗的內容。fn(state, f, env) 回傳節點。 */
export const furnitureInfo = {};
/** 其他模組可以在家具上面加畫東西。fn(ctx, x, y, f, state, time)。 */
export const furnitureDraw = {};
/** 其他模組可以替某種顧客狀態決定畫法。fn(c, f, slot) 回傳要覆蓋的欄位。 */
export const customerPose = {};

/**
 * opts = {
 *   cfg 或 state,          // 用設定建立新狀態，或直接給狀態（無限模式）
 *   title,                 // HUD 上顯示的名稱
 *   tutorial, hints,       // 提示框步驟
 *   onClosed(state),       // 打烊時呼叫一次
 *   pauseItems(scene),     // 暫停選單的項目
 *   extraTabs, structKey,  // 額外的面板分頁
 *   onTick(state),         // 每個 tick 之後
 *   overlayDraw(ctx, scene), onPick(grid, scene) // 建造模式用
 * }
 */
export function createShopScene(app, opts) {
  let state = opts.state || createShopState(opts.cfg);
  const stepper = createStepper(B.TICK_MS);
  let speed = 1;
  let bot = null;
  let alpha = 0;
  let time = 0;
  let uiTimer = 0;
  let closedFired = false;
  let drag = null;
  let viewDirty = true;
  let lastItems = [];
  let hints = null;
  const cam = createCamera({ x: 0, y: 24, w: 331, h: 216 });
  const watch = { sales: 0, seated: 0, pieces: 0, angry: 0, feedLen: 0 };

  function fail(reason) {
    app.sfx('deny');
    const key = `err.${reason}`;
    toast(t(key).startsWith('⟦') ? t('err.unknown') : t(key), 2200);
  }

  /** 送出一個操作。quiet = true 時失敗不顯示提示（呼叫的人自己處理）。 */
  function act(action, quiet = false) {
    const r = applyAction(state, action);
    if (!r.ok && !quiet) fail(r.reason);
    if (r.ok) {
      if (action.type === 'kufu') kufuFx();
      else if (action.type === 'open') app.sfx('open');
      else app.sfx('button');
      if (opts.onAction) opts.onAction(action, r, scene);
    }
    panel.update();
    hud.update();
    return r;
  }

  const env = {
    title: opts.title,
    getState: () => state,
    act,
    fail,
    sfx: (n) => app.sfx(n),
    getSpeed: () => speed,
    setSpeed: (n) => { speed = n; app.sfx('button'); hud.update(); },
    onMenu: () => openPause(),
    onOpen: () => act({ type: 'open' }),
    onBanner: (b) => app.sfx(b.kind === 'caught' ? 'baka' : 'warning'),
    onTab: () => { tabSeen[panel ? panel.getTab() : 'menu'] = true; },
    onSuggest: () => { flags.filled = true; },
    onBought: (n, cost) => { app.sfx('cash'); toast(t('feed.bought', { qty: n, cost: cost.toLocaleString('en-US') }), 1800); },
    extraTabs: opts.extraTabs,
    structKey: opts.structKey,
  };
  const tabSeen = {};
  const flags = {};
  const hud = createHud(env);
  let panel = null;
  panel = createSidePanel(env);
  const bubbles = createBubbles(12);
  const info = createInfoPop();
  const fx = h('div', { class: 'kufu-fx hidden' }, t('hud.kufu.fx'));
  const drawerBtn = h('button', {
    class: 'btn plain drawer-btn', dataset: { id: 'drawer' },
    onclick: () => { root.classList.toggle('drawer-open'); viewDirty = true; },
  }, t('hud.drawer'));
  const hintLayer = h('div', { class: 'hint-layer' });
  const root = h('div', { class: 'scene shop-scene' },
    bubbles.root, hud.top, panel.root, hud.bottom, hud.banner, drawerBtn, info.root, fx, hintLayer);

  function kufuFx() {
    app.sfx('kufu');
    fx.classList.remove('hidden');
    fx.classList.remove('play');
    void fx.offsetWidth;
    fx.classList.add('play');
    setTimeout(() => fx.classList.add('hidden'), 1300);
  }

  function openPause() {
    const items = opts.pauseItems ? opts.pauseItems(scene) : [];
    app.scenes.push(createOverlayMenu(app, {
      name: 'pause', title: t('pause.title'),
      items: [{ id: 'resume', label: t('pause.resume'), cls: 'red', action: () => app.scenes.pop() }].concat(items),
      onEscape: () => app.scenes.pop(),
    }));
  }

  /** 依 DOM 的實際位置算出畫布上可以顯示店面的區域。 */
  function layoutView() {
    viewDirty = false;
    const stage = app.canvas.getBoundingClientRect();
    if (!stage.width) return;
    const k = app.W / stage.width;
    const top = hud.top.getBoundingClientRect();
    const bot = hud.bottom.getBoundingClientRect();
    const side = panel.root.getBoundingClientRect();
    const narrow = document.getElementById('stage').classList.contains('narrow');
    const y0 = (top.bottom - stage.top) * k;
    const y1 = (bot.top - stage.top) * k;
    const x1 = narrow ? app.W : (side.left - stage.left) * k;
    cam.view = { x: 0, y: Math.round(y0), w: Math.round(x1), h: Math.round(y1 - y0) };
    setBounds(cam, cameraBounds(state.shop));
  }
  const onResize = () => { viewDirty = true; };

  function centerOnShop() {
    const c = gridToWorld(state.shop.w / 2, state.shop.h / 2);
    centerCamera(cam, c.x, c.y - 14);
  }

  // ---- 把狀態變成要畫的清單 ----
  function buildItems() {
    const items = [];
    for (const f of state.shop.furniture) {
      const def = FURNITURE[f.type];
      const it = { kind: 'furn', type: f.type, x: f.x, y: f.y, w: def.w, h: def.h, ref: f };
      if (furnitureDraw[f.type]) it.draw = (ctx, x, y) => furnitureDraw[f.type](ctx, x, y, f, state, time);
      items.push(it);
    }
    const walkPose = Math.floor(time / 170) % 2 ? 'walk1' : 'walk2';
    const lerp = (a, b) => a + (b - a) * alpha;
    for (const s of state.staff) {
      if (s.role === 'off' || s.gone) continue;
      const def = STAFF[s.id];
      const gx = lerp(s.pgx, s.gx);
      const gy = lerp(s.pgy, s.gy);
      const moving = s.path.length > 0;
      const face = facingFromDelta(s.fx || 0, s.fy || 1);
      const charId = s.disguised && def.disguiseLook ? def.disguiseLook : def.look;
      const it = {
        kind: 'actor', charId, gx, gy, ref: s, isStaff: true,
        pose: moving ? walkPose : (s.task && s.task.kind === 'make' ? 'work' : 'stand'),
        back: moving ? face.back : false, flip: moving ? face.flip : false,
      };
      if (def.player && kufuActive(state)) {
        it.draw = (ctx, x, y) => {
          ctx.fillStyle = '#f2c94c';
          for (let i = 0; i < 5; i++) {
            const a = time / 120 + i * 1.3;
            ctx.fillRect(Math.round(x + Math.cos(a) * 9), Math.round(y - 12 + Math.sin(a * 1.3) * 9), 1, 2);
          }
        };
      }
      items.push(it);
    }
    for (const c of state.customers) {
      if (c.st === 'gone' || (c.st === 'arrive' && c.delay > 0)) continue;
      const gx = lerp(c.pgx, c.gx);
      const gy = lerp(c.pgy, c.gy);
      const it = { kind: 'actor', charId: c.look, gx, gy, ref: c };
      const f = c.furn ? state.shop.furniture.find((x) => x.id === c.furn) : null;
      if (SEATED.includes(c.st) && f) {
        const def = FURNITURE[f.type];
        const slot = def.slots[c.slot];
        const face = facingFromName(slot.face);
        it.pose = slot.pose === 'stand' ? 'stand' : 'sit';
        it.back = face.back; it.flip = face.flip;
        it.z = slot.z;
        it.depth = furnitureDepth(f.x, f.y, def.w, def.h) + 0.005 + c.slot * 0.0001;
        if (slot.pose === 'stand') it.depth = undefined;
        if (c.thought && c.thought.until > state.tick && (c.thought.key === 'yummy' || c.thought.key === 'win') && c.st === 'eat') it.pose = it.pose === 'sit' ? 'sit' : 'happy';
        if (customerPose[c.st]) Object.assign(it, customerPose[c.st](c, f, slot, time) || {});
      } else if (c.st === 'queue') {
        it.pose = 'stand'; it.back = false; it.flip = false;
      } else {
        const face = facingFromDelta(c.fx || 0, c.fy || 0);
        it.pose = walkPose; it.back = face.back; it.flip = face.flip;
      }
      items.push(it);
    }
    return items;
  }

  function showBubbles(sorted) {
    const list = [];
    const k = app.stageScale;
    for (const it of sorted) {
      const c = it.ref;
      if (it.kind !== 'actor' || !c || it.isStaff) continue;
      if (!c.thought || c.thought.until <= state.tick) continue;
      const p = worldToScreen(cam, it.sx, it.sy - 25);
      if (p.x < cam.view.x || p.x > cam.view.x + cam.view.w || p.y < cam.view.y + 6 || p.y > cam.view.y + cam.view.h) continue;
      const bad = ['slow', 'pricey', 'swordfish', 'fake', 'ugly', 'wrong', 'soldout', 'nothing', 'angry', 'baka', 'lose'].includes(c.thought.key);
      list.push({ x: p.x * k, y: p.y * k, text: t(`think.${c.thought.key}`), cls: bad ? 'bad' : 'good' });
      if (list.length >= 12) break;
    }
    bubbles.show(list);
  }

  // ---- 點選 ----
  function pick(x, y) {
    const w = screenToWorld(cam, x, y);
    for (let i = lastItems.length - 1; i >= 0; i--) {
      const it = lastItems[i];
      if (it.kind !== 'actor' || !it.ref) continue;
      if (Math.abs(w.x - it.sx) <= 7 && w.y >= it.sy - 23 && w.y <= it.sy + 2) return it;
    }
    const g = worldToGrid(w.x, w.y);
    const cx = Math.floor(g.gx);
    const cy = Math.floor(g.gy);
    for (const f of state.shop.furniture) {
      const def = FURNITURE[f.type];
      if (cx >= f.x && cx < f.x + def.w && cy >= f.y && cy < f.y + def.h) return { kind: 'furn', ref: f, type: f.type };
    }
    return null;
  }

  function infoContent(hit) {
    if (hit.kind === 'actor' && hit.isStaff) {
      const s = state.staff.find((x) => x.id === hit.ref.id);
      if (!s || s.role === 'off' || s.gone) return null;
      const def = STAFF[s.id];
      let doing = t('info.staff.idle');
      if (s.task && s.task.kind === 'make') {
        const o = state.orders.find((x) => x.id === s.task.order);
        doing = t('info.staff.make', { name: o ? t(`sushi.${o.item}`) : '' });
      } else if (s.task) doing = t('info.staff.carry');
      else if (s.path.length) doing = t('info.staff.walk');
      return h('div', { class: 'info-body' },
        portraitImg(s.disguised && def.disguiseLook ? def.disguiseLook : def.look, 3),
        h('div', null,
          h('div', { class: 'info-name' }, t(s.disguised ? 'char.ryoDisguise' : `char.${s.id}`), h('small', null, ` ${t(`panel.staff.role.${s.role}`)}`)),
          h('div', null, `${t('panel.staff.speed')} ${def.speed} · ${t('panel.staff.skill')} ${def.skill}`),
          h('div', null, doing)));
    }
    if (hit.kind === 'actor') {
      const c = state.customers.find((x) => x.id === hit.ref.id);
      if (!c || c.st === 'gone') return null;
      const thought = c.thought && c.thought.until > state.tick ? t(`think.${c.thought.key}`) : '';
      return h('div', { class: 'info-body' },
        portraitImg(c.look, 3),
        h('div', null,
          h('div', { class: 'info-name' }, t(`ctype.${c.boss || c.type}`), h('small', null, ` ${t(`info.state.${c.st}`)}`)),
          h('div', null, t('info.sat', { n: Math.round(Math.max(0, Math.min(100, c.sat))) }), ' · ', t('info.eaten', { n: c.eaten })),
          h('div', null, t('info.spent', { n: (c.bill + c.fees).toLocaleString('en-US') })),
          thought ? h('div', { class: 'info-think' }, `「${thought}」`) : null));
    }
    const f = state.shop.furniture.find((x) => x.id === hit.ref.id);
    if (!f) return null;
    if (furnitureInfo[f.type]) return furnitureInfo[f.type](state, f, env);
    const def = FURNITURE[f.type];
    const seats = def.slots.filter((s) => s.role === 'seat').length;
    return h('div', { class: 'info-body' },
      h('div', null,
        h('div', { class: 'info-name' }, t(`furn.${f.type}`)),
        h('div', null, t(`furn.desc.${f.type}`)),
        seats ? h('div', null, t('info.furn.seats', { used: f.occ.filter(Boolean).length, n: seats })) : null));
  }

  // ---- 一個 tick ----
  function tickOnce() {
    if (bot) for (const a of botActions(state, bot)) applyAction(state, a);
    stepShop(state);
    if (opts.onTick) opts.onTick(state, scene);
  }

  function soundFromState() {
    const d = state.day;
    const earned = d.sales + d.fees + d.tips + d.bonus;
    if (earned > watch.sales) app.sfx('cash', 250);
    watch.sales = earned;
    const seated = state.customers.filter((c) => c.st === 'toSeat').length;
    if (seated > watch.seated) app.sfx('door', 400);
    watch.seated = seated;
    if (d.pieces > watch.pieces) app.sfx('done', 300);
    watch.pieces = d.pieces;
    if (d.angry > watch.angry) app.sfx('angry', 500);
    watch.angry = d.angry;
  }

  const scene = {
    name: opts.name || 'shop',
    root,
    get state() { return state; },
    set state(s) { state = s; invalidateBackground(); viewDirty = true; closedFired = false; panel.rebuild(); },
    cam,
    env,
    panel,
    act,
    setSpeed: (n) => { speed = n; },
    setBot: (name) => { bot = name; },
    requestLayout: () => { viewDirty = true; },
    enter() {
      window.addEventListener('resize', onResize);
      if (opts.tutorial || opts.hints) {
        const conditions = {
          tabBuy: () => panel.getTab() === 'buy',
          filled: () => !!flags.filled || totalStock(state) >= 20,
          stocked: () => totalStock(state) >= 20,
          opened: () => state.phase !== 'prep',
        };
        hints = createHints(root, opts.tutorial || opts.hints, conditions);
      }
    },
    exit() { window.removeEventListener('resize', onResize); },
    resume() { viewDirty = true; },
    update(dt) {
      time += dt;
      if (viewDirty) { layoutView(); if (!scene.centered) { centerOnShop(); scene.centered = true; } }
      if (bot && state.phase === 'prep') for (const a of botActions(state, bot)) applyAction(state, a);
      if (state.phase === 'open' && speed > 0) {
        alpha = stepper.advance(dt * speed * (app.params.speed || 1), tickOnce);
        soundFromState();
      } else {
        alpha = 1;
      }
      uiTimer += dt;
      if (uiTimer >= 200) {
        uiTimer = 0;
        hud.update();
        panel.update();
        info.update();
        if (hints) hints.update();
      }
      if (state.phase === 'closed' && !closedFired) {
        closedFired = true;
        hud.update();
        panel.update();
        if (opts.onClosed) opts.onClosed(state, scene);
      }
    },
    render(ctx) {
      ctx.fillStyle = '#17110c';
      ctx.fillRect(0, 0, app.W, app.H);
      const items = buildItems();
      lastItems = drawScene(ctx, cam, state.shop, items, { overlay: opts.overlayDraw ? (c) => opts.overlayDraw(c, scene) : null });
      showBubbles(lastItems);
    },
    input(evt) {
      if (evt.type === 'pointerdown') {
        drag = { x: evt.x, y: evt.y, sx: evt.x, sy: evt.y, moved: false };
      } else if (evt.type === 'pointermove') {
        if (drag && evt.down) {
          if (Math.hypot(evt.x - drag.sx, evt.y - drag.sy) > 4) drag.moved = true;
          if (drag.moved) panCamera(cam, evt.x - drag.x, evt.y - drag.y);
          drag.x = evt.x; drag.y = evt.y;
        }
        if (opts.onHover) {
          const w = screenToWorld(cam, evt.x, evt.y);
          opts.onHover(worldToGrid(w.x, w.y), scene);
        }
      } else if (evt.type === 'pointerup') {
        const wasDrag = drag && drag.moved;
        drag = null;
        if (wasDrag) return true;
        if (opts.onPick) {
          const w = screenToWorld(cam, evt.x, evt.y);
          if (opts.onPick(worldToGrid(w.x, w.y), scene)) return true;
        }
        const hit = pick(evt.x, evt.y);
        if (hit) {
          const k = app.stageScale;
          const stageW = app.W * k;
          const px = Math.min(stageW - 190, Math.max(8, evt.x * k + 10));
          info.open(px, Math.max(8, evt.y * k - 70), () => infoContent(hit));
        } else info.close();
      } else if (evt.type === 'wheel') {
        zoomCamera(cam, evt.dy < 0 ? 2 : 1, evt.x, evt.y);
      } else if (evt.type === 'pinch') {
        zoomCamera(cam, evt.factor > 1 ? 2 : 1, evt.x, evt.y);
      } else if (evt.type === 'keydown' && !evt.repeat) {
        if (evt.code === 'Space') { speed = speed === 0 ? 1 : 0; hud.update(); return true; }
        if (evt.code === 'Digit1') { speed = 1; hud.update(); return true; }
        if (evt.code === 'Digit2') { speed = 2; hud.update(); return true; }
        if (evt.code === 'Digit3' || evt.code === 'Digit4') { speed = 4; hud.update(); return true; }
        if (evt.code === 'Escape') { if (info.isOpen()) info.close(); else openPause(); return true; }
      }
      return false;
    },
    debug: {
      state: () => JSON.parse(JSON.stringify(state)),
      summary: () => summary(state),
      step: (n = 1) => {
        for (let i = 0; i < n && state.phase === 'open'; i++) tickOnce();
        hud.update();
        panel.update();
        return summary(state);
      },
      act: (a) => applyAction(state, a),
      useBot: (name) => { bot = name; return true; },
      mini: () => null,
      hintIndex: () => (hints ? hints.index() : -1),
      view: () => ({ ...cam.view, zoom: cam.zoom, x0: cam.x, y0: cam.y }),
    },
  };
  hud.update();
  return scene;
}

export { yen };
