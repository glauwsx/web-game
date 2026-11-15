// 展示場景（階段 1）：一間有家具的店，幾個角色沿固定路線走。可以平移、縮放。
// 進入方式：?scene=demo
import { h } from '../ui/dom.js';
import { t } from '../data/strings.js';
import { createCamera, setBounds, panCamera, zoomCamera, centerCamera } from '../iso/camera.js';
import { drawScene, cameraBounds } from '../iso/render.js';
import { facingFromDelta, gridToWorld } from '../iso/iso.js';

const SHOP = { w: 10, h: 8, floor: 'wood', door: { gx: 4 } };

const FURNITURE = [
  { type: 'chefStation', x: 2, y: 1, w: 2, h: 1 },
  { type: 'chefStation', x: 4, y: 1, w: 2, h: 1 },
  { type: 'counterSeat', x: 2, y: 2, w: 1, h: 1 },
  { type: 'counterSeat', x: 3, y: 2, w: 1, h: 1 },
  { type: 'counterSeat', x: 4, y: 2, w: 1, h: 1 },
  { type: 'counterSeat', x: 5, y: 2, w: 1, h: 1 },
  { type: 'tableSet', x: 1, y: 5, w: 2, h: 2 },
  { type: 'pachinko', x: 8, y: 1, w: 1, h: 2 },
  { type: 'pachinko', x: 9, y: 1, w: 1, h: 2 },
  { type: 'fridge', x: 0, y: 0, w: 1, h: 1 },
  { type: 'fishTank', x: 6, y: 0, w: 2, h: 1 },
  { type: 'plant', x: 9, y: 7, w: 1, h: 1 },
  { type: 'lantern', x: 0, y: 7, w: 1, h: 1 },
  { type: 'uniformSign', x: 6, y: 7, w: 1, h: 1 },
];

// 走固定路線的角色：路線是格子座標的折線，走到底再折返或繞圈。
const WALKERS = [
  { charId: 'honda_apron', path: [[4.5, 3.5], [7.5, 3.5], [7.5, 6.5], [4.5, 6.5]], speed: 0.05 },
  { charId: 'reiko', path: [[0.5, 3.5], [3.5, 3.5], [3.5, 4.5], [0.5, 4.5]], speed: 0.035 },
  { charId: 'bucho', path: [[4.5, 12.5], [4.5, 7.5], [4.5, 4.5], [4.5, 7.5]], speed: 0.03 },
  { charId: 'lemon', path: [[6.5, 5.5], [8.5, 5.5], [8.5, 3.5], [6.5, 3.5]], speed: 0.04 },
  { charId: 'tourist.0', path: [[-4, 9.2], [13, 9.2]], speed: 0.04 },
  { charId: 'salaryman.0', path: [[13, 8.6], [-4, 8.6]], speed: 0.05 },
  { charId: 'family.2', path: [[9.5, 4.5], [5.5, 4.5], [5.5, 6.5], [9.5, 6.5]], speed: 0.06 },
];

// 不動的角色
const STATIC = [
  { charId: 'ryo', gx: 3.0, gy: 0.6, pose: 'work' },
  { charId: 'matoi', gx: 5.0, gy: 0.6, pose: 'work' },
  { charId: 'normal.0', gx: 2.5, gy: 2.5, pose: 'sit', back: true, flip: true, z: 6, depth: 2 + 3 + 0.995 },
  { charId: 'gourmet.0', gx: 4.5, gy: 2.5, pose: 'sit', back: true, flip: true, z: 6, depth: 4 + 3 + 0.995 },
  { charId: 'pro', gx: 8.5, gy: 2.45, pose: 'sit', back: true, flip: true, z: 5, depth: 8 + 3 + 0.995 },
  { charId: 'nakagawa', gx: 7.5, gy: 7.3, pose: 'happy' },
  { charId: 'geparuto', gx: 1.5, gy: 7.4, pose: 'stand' },
  { charId: 'yuutsu', gx: 8.5, gy: 7.4, pose: 'angry' },
  { charId: 'shumaha', gx: 11.5, gy: 6.5, pose: 'stand' },
];

export function createDemoScene(app) {
  const cam = createCamera({ x: 0, y: 0, w: app.W, h: app.H });
  setBounds(cam, cameraBounds(SHOP));
  const c = gridToWorld(SHOP.w / 2, SHOP.h / 2);
  centerCamera(cam, c.x, c.y - 10);
  let time = 0;
  let drag = null;
  const walkers = WALKERS.map((w) => ({ ...w, seg: 0, t: 0 }));

  const root = h('div', { class: 'scene' },
    h('div', { class: 'demo-bar solid' },
      h('span', null, t('demo.hint')),
      h('button', { class: 'btn plain', dataset: { id: 'zoom' }, onclick: () => zoomCamera(cam, cam.zoom === 1 ? 2 : 1) }, t('demo.zoom')),
      h('button', { class: 'btn plain', dataset: { id: 'back' }, onclick: () => app.scenes.pop() }, t('menu.back'))));

  function actors() {
    const out = [];
    for (const w of walkers) {
      const a = w.path[w.seg];
      const b = w.path[(w.seg + 1) % w.path.length];
      const gx = a[0] + (b[0] - a[0]) * w.t;
      const gy = a[1] + (b[1] - a[1]) * w.t;
      const f = facingFromDelta(b[0] - a[0], b[1] - a[1]);
      out.push({ kind: 'actor', charId: w.charId, gx, gy, pose: Math.floor(time / 180) % 2 ? 'walk1' : 'walk2', back: f.back, flip: f.flip });
    }
    for (const s of STATIC) out.push({ kind: 'actor', ...s });
    return out;
  }

  return {
    name: 'demo',
    root,
    update(dt) {
      time += dt;
      for (const w of walkers) {
        const a = w.path[w.seg];
        const b = w.path[(w.seg + 1) % w.path.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        w.t += (w.speed * dt / 16.7) / len;
        if (w.t >= 1) {
          w.t = 0;
          w.seg = (w.seg + 1) % w.path.length;
          // 兩點路線：走到底就跳回起點（路人）
          if (w.path.length === 2 && w.seg === 1) w.seg = 0;
        }
      }
    },
    render(ctx) {
      const items = FURNITURE.map((f) => ({ kind: 'furn', ...f })).concat(actors());
      drawScene(ctx, cam, SHOP, items);
    },
    input(evt) {
      if (evt.type === 'pointerdown') drag = { x: evt.x, y: evt.y };
      else if (evt.type === 'pointermove' && drag && evt.down) {
        panCamera(cam, evt.x - drag.x, evt.y - drag.y);
        drag = { x: evt.x, y: evt.y };
      } else if (evt.type === 'pointerup') drag = null;
      else if (evt.type === 'wheel') zoomCamera(cam, evt.dy < 0 ? 2 : 1, evt.x, evt.y);
      else if (evt.type === 'pinch') zoomCamera(cam, evt.factor > 1 ? 2 : 1, evt.x, evt.y);
      else if (evt.type === 'keydown' && evt.code === 'Escape') { app.scenes.pop(); return true; }
      return false;
    },
    debug: {
      state: () => ({ cam: { x: cam.x, y: cam.y, zoom: cam.zoom } }),
    },
  };
}
