// 標題畫面、主選單、佔位場景。
import { h, toast } from './dom.js';
import { SAVE_KEYS } from '../core/save.js';
import { t } from '../data/strings.js';

/** 標題和選單共用的背景：黃昏的壽司店門口。用色塊畫，之後的階段會換成像素圖。 */
export function drawBackdrop(ctx, W, H, time) {
  // 天空（由上到下的色帶）
  const sky = ['#2a2748', '#3d3158', '#5b3d60', '#864a5c', '#b8604f', '#dc8a4c'];
  const band = Math.ceil(110 / sky.length);
  for (let i = 0; i < sky.length; i++) {
    ctx.fillStyle = sky[i];
    ctx.fillRect(0, i * band, W, band + 1);
  }
  // 遠方的街區
  ctx.fillStyle = '#2b2233';
  ctx.fillRect(0, 110, W, 100);
  ctx.fillStyle = '#f2c86a';
  for (const [wx, wy] of [[14, 136], [30, 136], [72, 150], [418, 140], [450, 156], [356, 150]]) ctx.fillRect(wx, wy, 6, 8);
  // 遠方屋頂剪影
  ctx.fillStyle = '#241c2e';
  const roofs = [[0, 96, 70, 30], [60, 88, 50, 40], [104, 100, 64, 30], [330, 92, 60, 36], [384, 84, 56, 44], [434, 98, 50, 30]];
  for (const [x, y, w, hh] of roofs) {
    ctx.fillRect(x, y, w, hh);
    ctx.fillRect(x - 3, y, w + 6, 4);
  }
  // 店面
  ctx.fillStyle = '#3a2416';
  ctx.fillRect(110, 60, 260, 150);
  // 屋簷
  ctx.fillStyle = '#23303f';
  ctx.fillRect(98, 52, 284, 14);
  ctx.fillStyle = '#2f4256';
  for (let x = 98; x < 382; x += 8) ctx.fillRect(x, 54, 4, 10);
  // 招牌
  ctx.fillStyle = '#6b4526';
  ctx.fillRect(196, 70, 88, 20);
  ctx.fillStyle = '#e9d6a8';
  ctx.fillRect(199, 73, 82, 14);
  // 牆面木格
  ctx.fillStyle = '#5a3920';
  ctx.fillRect(118, 98, 244, 112);
  ctx.fillStyle = '#6f4a2a';
  for (let x = 122; x < 360; x += 12) ctx.fillRect(x, 100, 6, 108);
  // 門口的光
  ctx.fillStyle = '#f2c86a';
  ctx.fillRect(176, 112, 128, 98);
  ctx.fillStyle = '#ffe3a0';
  ctx.fillRect(184, 150, 112, 60);
  // 暖簾（輕輕飄）
  const cols = 5;
  for (let i = 0; i < cols; i++) {
    const sway = Math.round(Math.sin(time / 600 + i * 0.9) * 1.5);
    const x = 176 + i * 26;
    ctx.fillStyle = '#2f4270';
    ctx.fillRect(x, 108, 24, 40 + sway);
    ctx.fillStyle = '#243359';
    ctx.fillRect(x + 22, 108, 2, 40 + sway);
    ctx.fillStyle = '#f6ecd4';
    ctx.fillRect(x + 8, 120, 8, 2);
    ctx.fillRect(x + 11, 116, 2, 14);
    ctx.fillRect(x + 7, 132, 10, 2);
  }
  ctx.fillStyle = '#1d2946';
  ctx.fillRect(172, 104, 136, 5);
  // 燈籠
  for (const lx of [146, 322]) {
    const glow = 0.5 + 0.5 * Math.sin(time / 400 + lx);
    ctx.fillStyle = '#2b1d12';
    ctx.fillRect(lx + 5, 96, 2, 8);
    ctx.fillStyle = glow > 0.5 ? '#e0483a' : '#cf3f33';
    ctx.fillRect(lx, 104, 12, 22);
    ctx.fillRect(lx - 2, 108, 16, 14);
    ctx.fillStyle = '#2b1d12';
    ctx.fillRect(lx, 102, 12, 3);
    ctx.fillRect(lx, 125, 12, 3);
    ctx.fillStyle = '#ffd98a';
    ctx.fillRect(lx + 4, 110, 4, 10);
  }
  // 地面
  ctx.fillStyle = '#4b4350';
  ctx.fillRect(0, 210, W, 60);
  ctx.fillStyle = '#5b5262';
  for (let y = 214; y < H; y += 14) {
    const off = ((y - 214) / 14) % 2 ? 0 : 20;
    for (let x = -20 + off; x < W; x += 40) ctx.fillRect(x, y, 36, 10);
  }
  // 門口灑出的光
  ctx.fillStyle = 'rgba(255, 214, 130, 0.25)';
  ctx.fillRect(160, 210, 160, 60);
  ctx.fillStyle = 'rgba(255, 214, 130, 0.2)';
  ctx.fillRect(180, 210, 120, 60);
}

/** 讓背景變暗（選單疊在上面時用）。 */
function dim(ctx, W, H, alpha) {
  ctx.fillStyle = `rgba(20, 12, 8, ${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

export function createTitleScene(app) {
  let time = 0;
  const go = () => app.scenes.replace(createMainMenuScene(app));
  const root = h('div', { class: 'scene title-scene' },
    h('div', { class: 'title-box' },
      h('div', { class: 'title-name' }, t('title.name')),
      h('div', { class: 'title-sub' }, t('title.sub')),
      h('div', { class: 'title-start' }, t('title.start'))),
    h('div', { class: 'title-note' }, t('title.note')));
  return {
    name: 'title',
    root,
    update(dt) { time += dt; },
    render(ctx) {
      drawBackdrop(ctx, app.W, app.H, time);
      dim(ctx, app.W, app.H, 0.35);
    },
    input(evt) {
      if (evt.type === 'pointerup' || (evt.type === 'keydown' && !evt.repeat)) { go(); return true; }
      return false;
    },
  };
}

/**
 * 通用選單場景。
 * items: [{ label, desc, cls, action }]
 * back: 按「返回」或 Esc 時要做的事（沒有就不顯示返回鈕）。
 */
export function createMenuScene(app, { name, title, items, back, body }) {
  let time = 0;
  const root = h('div', { class: 'scene menu-scene' },
    h('div', { class: 'panel menu-panel solid' },
      h('h1', { class: 'menu-title' }, title),
      body ? h('div', { class: 'menu-body' }, body) : null,
      h('div', { class: 'menu-list' },
        items.map((it) => h('button', {
          class: `btn menu-item ${it.cls || ''}`,
          dataset: it.id ? { id: it.id } : undefined,
          onclick: () => { app.sfx('button'); it.action(); },
        }, it.label, it.desc ? h('small', null, it.desc) : null))),
      back ? h('div', { class: 'menu-foot' },
        h('button', { class: 'btn plain', dataset: { id: 'back' }, onclick: () => { app.sfx('button'); back(); } }, t('menu.back'))) : null));
  return {
    name,
    root,
    update(dt) { time += dt; },
    render(ctx) {
      drawBackdrop(ctx, app.W, app.H, time);
      dim(ctx, app.W, app.H, 0.55);
    },
    input(evt) {
      if (evt.type === 'keydown' && evt.code === 'Escape' && back) { back(); return true; }
      return false;
    },
  };
}

export function createMainMenuScene(app) {
  return createMenuScene(app, {
    name: 'menu',
    title: `${t('title.name')}　${t('title.sub')}`,
    items: [
      { id: 'owner', label: t('menu.owner'), desc: t('menu.owner.desc'), cls: 'red', action: () => app.go('owner') },
      { id: 'customer', label: t('menu.customer'), desc: t('menu.customer.desc'), cls: 'indigo', action: () => app.go('customer') },
      { id: 'settings', label: t('menu.settings'), cls: 'plain', action: () => app.go('settings') },
    ],
  });
}

export function createOwnerMenuScene(app) {
  return createMenuScene(app, {
    name: 'owner-menu',
    title: t('owner.title'),
    items: [
      { id: 'levels', label: t('owner.levels'), desc: t('owner.levels.desc'), cls: 'red', action: () => app.go('levels') },
      { id: 'endless', label: t('owner.endless'), desc: t('owner.endless.desc'), cls: 'indigo', action: () => app.go('endless') },
    ],
    back: () => app.go('menu'),
  });
}

/** 還沒做好的功能先用這個場景頂著。 */
export function createPlaceholderScene(app, label) {
  return createMenuScene(app, {
    name: `placeholder:${label}`,
    title: t('placeholder.title'),
    body: t('placeholder.body', { name: label }),
    items: [],
    back: () => app.scenes.reset(createMainMenuScene(app)),
  });
}

/**
 * 蓋在目前畫面上的選單（暫停選單、確認框）。下層畫面照樣顯示，但不更新。
 * items: [{ id, label, cls, action }]。onEscape：按 Esc 時要做的事。
 */
export function createOverlayMenu(app, { name, title, body, items, onEscape }) {
  const root = h('div', { class: 'scene menu-scene overlay-scene' },
    h('div', { class: 'dlg-shade solid' }),
    h('div', { class: 'panel menu-panel solid' },
      h('h1', { class: 'menu-title' }, title),
      body ? h('div', { class: 'menu-body' }, body) : null,
      h('div', { class: 'menu-list' },
        items.map((it) => h('button', {
          class: `btn menu-item ${it.cls || 'plain'}`, dataset: { id: it.id },
          onclick: () => { app.sfx('button'); it.action(); },
        }, it.label)))));
  return {
    name,
    overlay: true,
    root,
    input(evt) {
      if (evt.type === 'keydown' && evt.code === 'Escape' && onEscape) onEscape();
      return true;
    },
  };
}

/** 設定畫面。 */
export function createSettingsScene(app) {
  const s = app.settings;
  const save = () => { app.saveSettings(); app.audio.applyVolumes(); };
  const slider = (key, label) => h('label', { class: 'set-row' },
    h('span', null, label),
    h('input', { type: 'range', min: 0, max: 100, value: Math.round((s[key] ?? 0.5) * 100), dataset: { id: `set-${key}` },
      oninput: (e) => { s[key] = Number(e.target.value) / 100; save(); if (key === 'sfx') app.sfx('button'); } }));
  const autoBtn = h('button', { class: 'btn plain', dataset: { id: 'set-auto' }, onclick: () => { s.autoAccel = !s.autoAccel; autoBtn.textContent = t(s.autoAccel ? 'settings.on' : 'settings.off'); save(); } }, t(s.autoAccel ? 'settings.on' : 'settings.off'));
  const confirmReset = (key, id) => h('button', {
    class: 'btn plain', dataset: { id },
    onclick: () => {
      app.scenes.push(createOverlayMenu(app, {
        name: 'confirm', title: t('settings.confirm'),
        items: [
          { id: 'yes', label: t('common.ok'), cls: 'red', action: () => { app.store.remove(key); app.scenes.pop(); toast(t('settings.done'), 1800); } },
          { id: 'no', label: t('common.cancel'), action: () => app.scenes.pop() },
        ],
        onEscape: () => app.scenes.pop(),
      }));
    },
  }, t(id === 'reset-levels' ? 'settings.resetLevels' : 'settings.resetEndless'));
  const extra = h('div', { class: 'set-extra' });
  if (app.settingsExtra) for (const fn of app.settingsExtra) extra.appendChild(fn(app));
  const back = () => app.scenes.pop();
  const root = h('div', { class: 'scene menu-scene' },
    h('div', { class: 'panel menu-panel settings-panel solid' },
      h('h1', { class: 'menu-title' }, t('settings.title')),
      slider('music', t('settings.music')),
      slider('sfx', t('settings.sfx')),
      h('div', { class: 'set-row' }, h('span', null, t('settings.autoAccel')), autoBtn),
      h('div', { class: 'set-btns' }, confirmReset(SAVE_KEYS.levels, 'reset-levels'), confirmReset(SAVE_KEYS.endless, 'reset-endless')),
      extra,
      h('div', { class: 'menu-foot' }, h('button', { class: 'btn plain', dataset: { id: 'back' }, onclick: () => { app.sfx('button'); back(); } }, t('menu.back')))));
  let time = 0;
  return {
    name: 'settings',
    root,
    update(dt) { time += dt; },
    render(ctx) { drawBackdrop(ctx, app.W, app.H, time); dim(ctx, app.W, app.H, 0.55); },
    input(evt) { if (evt.type === 'keydown' && evt.code === 'Escape') { back(); return true; } return false; },
  };
}
