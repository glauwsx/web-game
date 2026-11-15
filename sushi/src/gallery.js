// 像素圖圖鑑頁：列出所有像素圖，放大 4 倍，標上名稱。
import { STATIC_SPRITES, POSES, allLooks, characterFrames } from './data/sprites/index.js';
import { PALETTE, PALETTE_SIZE } from './data/sprites/palette.js';
import { spriteToCanvas } from './iso/sprites.js';
import { t } from './data/strings.js';
import { h } from './ui/dom.js';

const SCALE = 4;
const out = document.getElementById('out');

function scaled(sprite, flip = false, scale = SCALE) {
  const src = spriteToCanvas(sprite, flip);
  const c = document.createElement('canvas');
  c.width = sprite.w * scale;
  c.height = sprite.h * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function cell(sprite, label, cls = '') {
  return h('div', { class: `cell ${cls}` }, scaled(sprite), label);
}

function section(title, nodes) {
  out.appendChild(h('h2', null, title));
  out.appendChild(h('div', { class: 'row' }, nodes));
}

// ---- 角色 ----
out.appendChild(h('h2', null, t('gallery.characters')));
const looks = allLooks();
for (const id of Object.keys(looks)) {
  const frames = characterFrames(id);
  const nameKey = `gallery.char.${id.replace(/\.\d+$/, '')}`;
  const frameCells = [];
  for (const pose of POSES) frameCells.push(cell(frames.front[pose], t(`gallery.pose.${pose}`)));
  for (const pose of POSES) frameCells.push(cell(frames.back[pose], `${t('gallery.back')}${t(`gallery.pose.${pose}`)}`));
  frameCells.push(h('div', { class: 'cell' }, scaled(frames.front.stand, true), t('gallery.flip')));
  frameCells.push(h('div', { class: 'cell' }, scaled(frames.portrait, false, 6), t('gallery.portrait')));
  frameCells.push(h('div', { class: 'cell' }, scaled(frames.portraitAngry, false, 6), t('gallery.portraitAngry')));
  out.appendChild(h('div', { class: 'char', dataset: { char: id } },
    h('div', { class: 'char-name' }, t(nameKey), h('small', null, id)),
    h('div', { class: 'frames' }, frameCells)));
}

// ---- 其他 ----
const groups = [
  ['gallery.furniture', (k) => k.startsWith('furn.')],
  ['gallery.sushi', (k) => k.startsWith('sushi.') || k.startsWith('set.')],
  ['gallery.tiles', (k) => k.startsWith('tile.') || k.startsWith('wall.') || k === 'shadow'],
  ['gallery.scenery', (k) => k.startsWith('scene.')],
  ['gallery.mini', (k) => k.startsWith('pk.') || k.startsWith('race.')],
];
for (const [titleKey, match] of groups) {
  const names = Object.keys(STATIC_SPRITES).filter(match);
  if (!names.length) continue;
  section(t(titleKey), names.map((k) => cell(STATIC_SPRITES[k], t(`sprite.${k}`), k.startsWith('sushi.') || k.startsWith('set.') ? 'dark' : '')));
}

// ---- 調色盤 ----
out.appendChild(h('h2', null, t('gallery.palette', { n: PALETTE_SIZE })));
out.appendChild(h('div', { class: 'row' }, Object.entries(PALETTE).filter(([, v]) => v).map(([k, v]) => h('div', { class: 'cell' },
  h('div', { style: { width: '40px', height: '28px', background: v, border: '1px solid #2b1d12', margin: '0 auto 4px' } }), `${k} ${v}`))));

document.body.dataset.ready = '1';
