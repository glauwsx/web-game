// 顧客版本（計劃書 13）：選角色 → 阿兩的店（靜態等角店面當背景）→ 自由遊玩、零用錢挑戰、壽司圖鑑、排行榜。
// 一個場景，右邊的面板依目前的頁面重建。小遊戲疊在上面，結束後回到這裡。
import { h, toast } from '../ui/dom.js';
import { t } from '../data/strings.js';
import { CUSTOMER as C } from '../data/balance.js';
import { SUSHI_ORDER } from '../data/sushi.js';
import { CUSTOMER_CAST, CUSTOMER_RACE_STATS } from '../data/characters.js';
import { BOARD_ORDER } from '../data/pachinko-boards.js';
import { TRACK_ORDER } from '../data/tracks.js';
import { SAVE_KEYS } from '../core/save.js';
import { rngCreate } from '../core/rng.js';
import { raceStats, scoreOf, zukanGains, addToBoard } from './customer-rules.js';
import { createCamera, setBounds, centerCamera } from '../iso/camera.js';
import { drawScene, cameraBounds } from '../iso/render.js';
import { gridToWorld } from '../iso/iso.js';
import { getSprite, spriteDataURL } from '../iso/sprites.js';
import { portraitImg } from '../ui/panels.js';
import { yen } from '../ui/hud.js';
import { createPachinkoScene } from '../mini/pachinko/game.js';
import { createRaceScene } from '../mini/race/game.js';
import { prizeValue } from '../mini/race/ai.js';

// ---- 存檔 ----
export const CUSTOMER_SAVE = {
  version: 1,
  defaults: () => ({ version: 1, char: null, best: {}, zukan: {}, board: [] }),
  validate: (d) => d.best && typeof d.best === 'object' && d.zukan && typeof d.zukan === 'object' && Array.isArray(d.board),
};

export function loadCustomer(app) {
  const r = app.store.load(SAVE_KEYS.customer, CUSTOMER_SAVE);
  if (r.status === 'corrupt') app.reportCorrupt('customer');
  return r.data;
}

function saveCustomer(app, data) {
  app.store.save(SAVE_KEYS.customer, data);
}

const SETS = [['set_nami', 'set.nami'], ['set_jo', 'set.jo'], ['set_tokujo', 'set.tokujo']];
const ZUKAN = SUSHI_ORDER.map((id) => [id, `sushi.${id}`]).concat(SETS);

// ---- 背景：阿兩的店 ----
const SHOP = { w: 10, h: 8, floor: 'wood', door: { gx: 4 } };
const FURNITURE = [
  { type: 'chefStation', x: 3, y: 1, w: 2, h: 1 },
  { type: 'counterSeat', x: 2, y: 2, w: 1, h: 1 },
  { type: 'counterSeat', x: 3, y: 2, w: 1, h: 1 },
  { type: 'counterSeat', x: 4, y: 2, w: 1, h: 1 },
  { type: 'counterSeat', x: 5, y: 2, w: 1, h: 1 },
  { type: 'pachinko', x: 7, y: 0, w: 1, h: 2 },
  { type: 'pachinko', x: 8, y: 0, w: 1, h: 2 },
  { type: 'raceCab', x: 7, y: 4, w: 1, h: 2 },
  { type: 'raceCab', x: 8, y: 4, w: 1, h: 2 },
  { type: 'tableSet', x: 1, y: 5, w: 2, h: 2 },
  { type: 'fishTank', x: 0, y: 0, w: 2, h: 1 },
  { type: 'lantern', x: 9, y: 7, w: 1, h: 1 },
  { type: 'plant', x: 9, y: 0, w: 1, h: 1 },
];

export function createCustomerScene(app) {
  let save = loadCustomer(app);
  let page = save.char ? 'menu' : 'select';
  let time = 0;
  const rng = rngCreate((app.params.seed ?? Date.now()) >>> 0);
  // 自由遊玩的選擇
  const free = { board: BOARD_ORDER[0], nail: 'normal', track: TRACK_ORDER[0], level: 3 };
  // 零用錢挑戰（只放記憶體，中途離開就不算）
  let run = null;
  let lastRank = 0;

  const cam = createCamera({ x: 0, y: 0, w: app.W, h: app.H });
  setBounds(cam, cameraBounds(SHOP));
  const center = gridToWorld(SHOP.w / 2, SHOP.h / 2);
  centerCamera(cam, center.x + 110, center.y - 6); // 店面放在畫面左半邊，右半邊是面板

  const body = h('div', { class: 'cust-body' });
  const panel = h('div', { class: 'panel cust-panel solid' }, body);
  const root = h('div', { class: 'scene cust-scene' }, panel);

  function persist() { saveCustomer(app, save); }

  function go(p) { app.sfx('button'); page = p; rebuild(); }

  const btn = (id, label, cls, onclick, disabled = false) => h('button', { class: `btn ${cls || 'plain'}`, dataset: { id }, disabled, onclick }, label);
  const choice = (id, label, active, onclick) => h('button', { class: `btn plain mini cust-choice ${active ? 'active' : ''}`, dataset: { id }, onclick }, label);
  const statWord = (v) => t(`cust.stat.${v}`);

  // ---- 頁面 ----

  function pageSelect() {
    const grid = h('div', { class: 'cust-cast' });
    for (const id of CUSTOMER_CAST) {
      const st = CUSTOMER_RACE_STATS[id];
      grid.appendChild(h('button', {
        class: `btn plain cust-char ${save.char === id ? 'active' : ''}`, dataset: { id: `char-${id}` },
        onclick: () => { save.char = id; persist(); go('menu'); },
      },
      portraitImg(id, 3),
      h('div', { class: 'cust-char-name' }, t(`char.${id}`)),
      h('div', { class: 'cust-char-stats' },
        `${t('cust.stat.accel')} ${statWord(st.accel)}`, h('br'),
        `${t('cust.stat.top')} ${statWord(st.top)}`, h('br'),
        `${t('cust.stat.handling')} ${statWord(st.handling)}`)));
    }
    return [h('h1', { class: 'menu-title' }, t('cust.select')), h('div', { class: 'cust-note' }, t('cust.select.note')), grid,
      h('div', { class: 'menu-foot' }, btn('back', t('menu.back'), 'plain', () => (save.char ? go('menu') : leave())))];
  }

  function pageMenu() {
    const items = [
      ['free', t('cust.free'), t('cust.free.desc'), 'red'],
      ['allowance', t('cust.allowance'), t('cust.allowance.desc', { n: C.ALLOWANCE.toLocaleString('en-US') }), 'indigo'],
      ['zukan', t('cust.zukan'), t('cust.zukan.desc', { n: Object.keys(save.zukan).length, total: ZUKAN.length }), ''],
      ['board', t('cust.board'), t('cust.board.desc'), ''],
    ];
    return [
      h('h1', { class: 'menu-title' }, t('cust.shop')),
      h('div', { class: 'cust-me' }, portraitImg(save.char, 2), t('cust.me', { name: t(`char.${save.char}`) }),
        btn('change-char', t('cust.change'), 'plain mini', () => go('select'))),
      h('div', { class: 'menu-list' }, items.map(([id, label, desc, cls]) => h('button', {
        class: `btn menu-item ${cls}`, dataset: { id },
        onclick: () => { if (id === 'allowance') startAllowance(); else go(id); },
      }, label, h('small', null, desc)))),
      h('div', { class: 'menu-foot' }, btn('back', t('menu.back'), 'plain', leave)),
    ];
  }

  function pageFree() {
    const pkKey = `pk:${free.board}:${C.NAIL_CHOICES[free.nail]}`;
    const rcKey = `race:${free.track}:${free.level}`;
    const pkBest = save.best[pkKey];
    const rcBest = save.best[rcKey];
    return [
      h('h1', { class: 'menu-title' }, t('cust.free')),
      h('div', { class: 'cust-sec' },
        h('div', { class: 'cust-sec-title' }, t('cust.pachinko')),
        h('div', { class: 'cust-row' }, h('span', { class: 'cust-label' }, t('cust.boardSel')),
          BOARD_ORDER.map((b) => choice(`board-${b}`, t(`pk.board.${b}`), free.board === b, () => { free.board = b; go('free'); }))),
        h('div', { class: 'cust-row' }, h('span', { class: 'cust-label' }, t('cust.nail')),
          Object.keys(C.NAIL_CHOICES).map((k) => choice(`nail-${k}`, t(`cust.nail.${k}`), free.nail === k, () => { free.nail = k; go('free'); }))),
        h('div', { class: 'cust-row' },
          h('span', { class: 'cust-best', dataset: { id: 'pk-best' } }, pkBest ? t('cust.best.pk', { v: yen(pkBest.value) }) : t('cust.best.none')),
          btn('play-pachinko', t('cust.play'), 'red', () => playFree('pachinko')))),
      h('div', { class: 'cust-sec' },
        h('div', { class: 'cust-sec-title' }, t('cust.race')),
        h('div', { class: 'cust-row' }, h('span', { class: 'cust-label' }, t('cust.track')),
          TRACK_ORDER.map((tr) => choice(`track-${tr}`, t(`track.${tr}`), free.track === tr, () => { free.track = tr; go('free'); }))),
        h('div', { class: 'cust-row' }, h('span', { class: 'cust-label' }, t('cust.rival')),
          [1, 2, 3, 4, 5].map((n) => choice(`level-${n}`, String(n), free.level === n, () => { free.level = n; go('free'); })),
          choice('level-shumaha', t('char.shumaha'), free.level === 'shumaha', () => { free.level = 'shumaha'; go('free'); })),
        h('div', { class: 'cust-row' },
          h('span', { class: 'cust-best', dataset: { id: 'race-best' } }, rcBest ? t('cust.best.race', { v: yen(rcBest.value), s: rcBest.time.toFixed(1) }) : t('cust.best.none')),
          btn('play-race', t('cust.play'), 'red', () => playFree('race')))),
      h('div', { class: 'menu-foot' }, btn('back', t('menu.back'), 'plain', () => go('menu'))),
    ];
  }

  function pageAllowance() {
    const out = [h('h1', { class: 'menu-title' }, t('cust.allowance'))];
    const r = run;
    out.push(h('div', { class: 'cust-money' },
      h('div', null, t('cust.money'), ' ', h('b', { dataset: { id: 'cust-money' } }, yen(r.money))),
      h('div', null, t('cust.score'), ' ', h('b', { dataset: { id: 'cust-score' } }, yen(r.score))),
      h('div', null, t('cust.plays', { n: r.plays }))));
    if (r.over) {
      out.push(h('div', { class: 'cust-final', dataset: { id: 'cust-final' } },
        t('cust.final', { v: yen(r.score) }), h('br'),
        lastRank ? t('cust.rank', { n: lastRank }) : t('cust.norank')));
      out.push(h('div', { class: 'menu-foot' },
        btn('again', t('cust.again'), 'red', startAllowance),
        btn('to-board', t('cust.board'), 'plain', () => go('board')),
        btn('back', t('menu.back'), 'plain', () => { run = null; go('menu'); })));
      return out;
    }
    out.push(h('div', { class: 'cust-log' }, r.log.slice(-4).map((l) => h('div', null, l))));
    out.push(h('div', { class: 'cust-row' }, h('span', { class: 'cust-label' }, t('cust.track')),
      TRACK_ORDER.map((tr) => choice(`track-${tr}`, t(`track.${tr}`), free.track === tr, () => { free.track = tr; rebuild(); }))));
    out.push(h('div', { class: 'menu-list cust-games' },
      btn('play-pachinko', t('cust.allow.pk', { fee: yen(C.PACHINKO_FEE) }), 'red', () => playAllowance('pachinko'), r.money < C.PACHINKO_FEE),
      btn('play-race', t('cust.allow.race', { fee: yen(C.RACE_FEE) }), 'indigo', () => playAllowance('race'), r.money < C.RACE_FEE)));
    out.push(h('div', { class: 'cust-note' }, t('cust.allow.note')));
    out.push(h('div', { class: 'menu-foot' }, btn('finish', t('cust.finish'), 'plain', finishAllowance)));
    return out;
  }

  function pageZukan() {
    const grid = h('div', { class: 'cust-zukan' });
    for (const [id, sprite] of ZUKAN) {
      const n = save.zukan[id] || 0;
      const name = id.startsWith('set_') ? t(`set.${id}`) : t(`sushi.${id}`);
      grid.appendChild(h('div', { class: `zk-cell ${n ? 'on' : ''}`, dataset: { id: `zk-${id}` } },
        h('img', { class: 'px-icon', src: spriteDataURL(getSprite(sprite), 3), alt: '' }),
        h('div', { class: 'zk-name' }, n ? name : t('cust.zukan.unknown')),
        h('div', { class: 'zk-n' }, n ? t('cust.zukan.n', { n }) : '')));
    }
    return [h('h1', { class: 'menu-title' }, t('cust.zukan')),
      h('div', { class: 'cust-note' }, t('cust.zukan.count', { n: Object.keys(save.zukan).length, total: ZUKAN.length })), grid,
      h('div', { class: 'menu-foot' }, btn('back', t('menu.back'), 'plain', () => go('menu')))];
  }

  function pageBoard() {
    const rows = save.board.map((e, i) => h('div', { class: `cust-rank ${i + 1 === lastRank ? 'new' : ''}`, dataset: { rank: i + 1 } },
      h('span', { class: 'cust-rank-n' }, `${i + 1}`),
      portraitImg(e.char, 2),
      h('span', { class: 'cust-rank-name' }, t(`char.${e.char}`)),
      h('span', { class: 'cust-rank-score' }, yen(e.score)),
      h('span', { class: 'cust-rank-sub' }, t('cust.plays', { n: e.plays })),
      h('span', { class: 'cust-rank-sub' }, e.date || '')));
    return [h('h1', { class: 'menu-title' }, t('cust.board')),
      rows.length ? h('div', { class: 'cust-board' }, rows) : h('div', { class: 'cust-note' }, t('cust.board.empty')),
      h('div', { class: 'menu-foot' }, btn('back', t('menu.back'), 'plain', () => go('menu')))];
  }

  const PAGES = { select: pageSelect, menu: pageMenu, free: pageFree, allowance: pageAllowance, zukan: pageZukan, board: pageBoard };

  function rebuild() {
    body.replaceChildren(...PAGES[page]().filter(Boolean));
    panel.classList.toggle('wide', page === 'select' || page === 'zukan' || page === 'board');
  }

  // ---- 玩 ----

  function addZukan(kind, result) {
    const gains = zukanGains(kind, result, rng);
    const fresh = [];
    for (const [id, n] of Object.entries(gains)) {
      if (!save.zukan[id]) fresh.push(id.startsWith('set_') ? t(`set.${id}`) : t(`sushi.${id}`));
      save.zukan[id] = (save.zukan[id] || 0) + n;
    }
    if (fresh.length) toast(t('cust.zukan.new', { names: fresh.join('、') }), 3000);
  }

  /** 開一局小遊戲。done(result) 在小遊戲結束、回到這個場景之後呼叫；中途離開賽車是 null。 */
  function launch(kind, opts, done) {
    app.sfx('button');
    const onDone = (res) => { done(res); rebuild(); };
    if (kind === 'pachinko') app.scenes.push(createPachinkoScene(app, { ...opts, onDone }));
    else app.scenes.push(createRaceScene(app, { ...opts, stats: raceStats(save.char), onDone, onExit: () => onDone(null) }));
  }

  function playFree(kind) {
    if (kind === 'pachinko') {
      const setting = C.NAIL_CHOICES[free.nail];
      launch('pachinko', { board: free.board, setting, fee: C.PACHINKO_FEE }, (res) => {
        if (!res) return;
        const key = `pk:${free.board}:${setting}`;
        const prev = save.best[key];
        if (!prev || res.value > prev.value) save.best[key] = { value: res.value };
        addZukan('pachinko', res);
        persist();
      });
      return;
    }
    const shumaha = free.level === 'shumaha';
    launch('race', { track: free.track, level: shumaha ? 5 : free.level, shumaha }, (res) => {
      if (!res) return;
      const key = `race:${free.track}:${free.level}`;
      const value = prizeValue(res.prizes);
      const prev = save.best[key];
      save.best[key] = { value: Math.max(prev ? prev.value : 0, value), time: Math.min(prev ? prev.time : Infinity, res.time) };
      addZukan('race', res);
      persist();
    });
  }

  function startAllowance() {
    run = { money: C.ALLOWANCE, score: 0, plays: 0, log: [], over: false };
    lastRank = 0;
    go('allowance');
  }

  function playAllowance(kind) {
    const fee = kind === 'pachinko' ? C.PACHINKO_FEE : C.RACE_FEE;
    if (!run || run.over || run.money < fee) return;
    run.money -= fee;
    run.plays++;
    const opts = kind === 'pachinko'
      ? { board: BOARD_ORDER[0], setting: C.NAIL, fee }
      : { track: free.track, level: C.RACE_LEVEL };
    launch(kind, opts, (res) => {
      const pts = res ? scoreOf(kind, res) : 0;
      run.score += pts;
      run.log.push(t(kind === 'pachinko' ? 'cust.log.pk' : 'cust.log.race', { n: run.plays, v: yen(pts) }));
      if (res) addZukan(kind, res);
      persist();
      // 錢不夠再玩任何一種就結束
      if (run.money < Math.min(C.PACHINKO_FEE, C.RACE_FEE)) finishAllowance();
    });
  }

  function finishAllowance() {
    if (!run || run.over) return;
    run.over = true;
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    lastRank = run.plays > 0 ? addToBoard(save.board, { score: run.score, char: save.char, plays: run.plays, date, at: Date.now() }) : 0;
    persist();
    app.sfx(lastRank ? 'win' : 'lose');
    page = 'allowance';
    rebuild();
  }

  function leave() {
    app.sfx('button');
    app.go('menu');
  }

  // ---- 背景 ----
  function items() {
    const out = FURNITURE.map((f) => ({ kind: 'furn', ...f }));
    out.push({ kind: 'actor', charId: 'ryo', gx: 4.0, gy: 0.6, pose: Math.floor(time / 400) % 2 ? 'work' : 'stand' });
    if (save.char) out.push({ kind: 'actor', charId: save.char, gx: 4.5, gy: 4.2, pose: 'happy' });
    // 小鋼珠台前坐著一位客人（深度要在機台後面，見 shop-scene.js 的坐姿）
    out.push({ kind: 'actor', charId: 'normal.1', gx: 7.5, gy: 1.42, pose: 'sit', back: true, z: 7, depth: 7 + 1 + 0 + 2 - 0.01 + 0.005 });
    return out;
  }

  rebuild();

  return {
    name: 'customer',
    root,
    resume() { rebuild(); },
    update(dt) { time += dt; },
    render(ctx) {
      ctx.fillStyle = '#17110c';
      ctx.fillRect(0, 0, app.W, app.H);
      drawScene(ctx, cam, SHOP, items());
    },
    input(evt) {
      if (evt.type === 'keydown' && evt.code === 'Escape' && !evt.repeat) {
        if (page === 'menu' || (page === 'select' && !save.char)) leave();
        else if (page === 'allowance' && run && !run.over) finishAllowance();
        else go('menu');
        return true;
      }
      return false;
    },
    debug: {
      state: () => ({ page, save: JSON.parse(JSON.stringify(save)), run: run ? { ...run } : null, free: { ...free }, lastRank }),
      page: () => page,
    },
  };
}

