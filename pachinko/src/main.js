// 鋼珠會館：大廳（選機台）和遊玩畫面。
import { h } from './dom.js';
import { MACHINES } from './machines/index.js';
import { createSession, FIRE_INTERVAL } from './session.js';
import { PH } from './physics.js';
import { buildStatic, drawFrame } from './render.js';
import { createAudio } from './audio.js';
import { loadStore, saveStore, machineRec, START_BALLS, BORROW } from './store.js';

const app = document.getElementById('app');
const store = loadStore();
const audio = createAudio();
audio.setMuted(store.muted);
let current = null;      // 目前的遊玩畫面（有 destroy）

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const net = () => store.balls - START_BALLS - store.borrowed;

function modal(...kids) {
  const m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'sheet' }, kids));
  document.body.append(m);
  const b = m.querySelector('button.primary') || m.querySelector('button');
  if (b) b.focus();
  return () => m.remove();
}

function helpSheet(machine, onClose) {
  const close = modal(
    h('h3', null, machine.name),
    h('div', { class: 'type' }, machine.type),
    h('ol', null, machine.help.map((t) => h('li', null, t))),
    h('h4', null, '操作'),
    h('ol', null,
      h('li', null, '拖曳「力道」決定鋼珠飛多遠。綠色區是建議的左打力道。'),
      h('li', null, '按「發射」開始連發，一分鐘 100 顆。再按一次停止。'),
      h('li', null, '鍵盤：← → 調力道（Shift 微調），空白鍵發射／停止。')),
    h('div', { class: 'acts' }, h('button', { class: 'primary', onclick: () => { close(); if (onClose) onClose(); } }, '開始玩')));
}

// ---------------- 大廳 ----------------
function showHall() {
  if (current) { current.destroy(); current = null; }
  const n = net();
  const cards = MACHINES.map((m) => {
    const cv = h('canvas', { width: 240, height: 240, 'aria-hidden': 'true' });
    const rec = store.m[m.id];
    const card = h('button', { class: 'card', id: `card-${m.id}`, onclick: () => { audio.unlock(); audio.play('ui'); showPlay(m); } },
      cv,
      h('div', null,
        h('h2', null, m.name),
        h('div', { class: 'type' }, m.type),
        h('p', null, m.tagline),
        h('dl', null, m.spec.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
        rec && rec.fired ? h('div', { class: 'rec' }, `你的紀錄：發射 ${fmt(rec.fired)}，回收率 ${Math.round((rec.paid / rec.fired) * 100)}%${rec.jackpots ? `，大當 ${rec.jackpots} 次` : ''}`) : null));
    requestAnimationFrame(() => {
      const s = createSession(m, { seed: 1 });
      const layer = buildStatic(s.board, 240, false);
      drawFrame(cv.getContext('2d'), 240, s, { staticLayer: layer, pops: [], time: 0, rightHint: false });
    });
    return card;
  });
  app.replaceChildren(h('main', { class: 'hall' },
    h('div', { class: 'hall-head' },
      h('h1', null, h('small', null, 'PACHINKO HALL'), '鋼珠會館'),
      h('div', { class: 'wallet' },
        h('div', null, h('span', null, '持球 '), h('b', null, fmt(store.balls))),
        h('div', { class: `net ${n > 0 ? 'up' : n < 0 ? 'down' : ''}` }, h('span', null, '淨賺 '), h('span', { class: 'num' }, `${n > 0 ? '+' : ''}${fmt(n)}`)))),
    h('p', { class: 'intro' }, '照日本真機的盤面做的小鋼珠。選一台坐下來。第一次玩建議從「昭和鬱金香」開始。'),
    h('div', { class: 'cards' }, cards),
    h('div', { class: 'hall-foot' },
      h('button', { id: 'btn-reset', onclick: () => {
        const close = modal(h('h3', null, '重新開始？'), h('p', null, `持球回到 ${START_BALLS} 顆，所有紀錄清掉。`),
          h('div', { class: 'acts' }, h('button', { onclick: () => close() }, '取消'),
            h('button', { class: 'primary', onclick: () => { close(); store.balls = START_BALLS; store.borrowed = 0; store.m = {}; store.seen = {}; saveStore(store); showHall(); } }, '重新開始')));
      } }, '重新開始')),
    h('p', { class: 'note' }, '純遊戲，鋼珠不能換錢。機率和賠球數寫在每台機台的規格裡。')));
}

// ---------------- 遊玩 ----------------
function showPlay(machine) {
  const rec = machineRec(store, machine.id);
  const hasRight = !!machine.rightPower;
  let power = rec.power ?? machine.defaultPower;
  let firing = false, cooldown = 0, acc = 0, last = 0, raf = 0, time = 0, alive = true;
  let hudT = 0, saveT = 0, toastT = 0, staticLayer = null, px = 0, lastFoulToast = -9;
  const pops = [];
  const base = { fired: rec.fired, paid: rec.paid, jackpots: rec.jackpots };
  const el = {};

  const toast = (t) => { el.toast.textContent = t; el.toast.classList.remove('hide'); toastT = 3.2; };
  const session = createSession(machine, {
    sfx: (n) => audio.play(n),
    msg: toast,
    onPay(n, s) {
      store.balls += n;
      if (s) pops.push({ x: s.x + s.w / 2, y: s.y, text: `+${n}`, t: 0 });
    },
  });
  const logic = session.logic;
  const wantRight = () => hasRight && logic.wantRight();
  const livePower = () => (wantRight() && store.autoRight ? machine.rightPower : power);

  // ---- 畫面 ----
  const cv = h('canvas', { id: 'board', 'aria-label': `${machine.name} 的盤面` });
  const ctx = cv.getContext('2d');
  const zones = machine.zones || {};
  const zoneEl = (cls, a, b, text) => h('div', { class: `zone ${cls}`, style: `left:${a * 100}%;width:${(b - a) * 100}%` }, text);
  el.zoneRight = zones.right ? zoneEl('right', zones.right[0], zones.right[1], '右打') : null;
  el.track = h('div', { class: 'track', id: 'power', tabindex: '0', role: 'slider', 'aria-label': '力道', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    zones.foul ? zoneEl('foul', 0, zones.foul, '太弱') : null,
    zones.left ? zoneEl('left', zones.left[0], zones.left[1], '左打') : null,
    el.zoneRight,
    el.thumb = h('div', { class: 'thumb' }));
  const setPower = (v, user = true) => {
    power = Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
    if (user && !(wantRight() && store.autoRight)) rec.power = power;
    refreshPower();
  };
  function refreshPower() {
    const p = livePower();
    el.thumb.style.left = `${p * 100}%`;
    el.powerNum.textContent = (p * 100).toFixed(1);
    el.track.setAttribute('aria-valuenow', (p * 100).toFixed(1));
  }
  const fromPointer = (e) => { const r = el.track.getBoundingClientRect(); setPower((e.clientX - r.left) / r.width); };
  el.track.addEventListener('pointerdown', (e) => { el.track.setPointerCapture(e.pointerId); fromPointer(e); });
  el.track.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') { if (el.track.hasPointerCapture(e.pointerId)) fromPointer(e); } });

  const setFiring = (on) => {
    if (on && store.balls <= 0) { askBorrow(); on = false; }
    firing = on;
    el.fire.classList.toggle('on', firing);
    el.fire.replaceChildren(firing ? '停止' : '發射', h('small', null, firing ? '連發中' : '空白鍵'));
    if (on) audio.unlock();
  };
  function askBorrow() {
    const close = modal(h('h3', null, '鋼珠用完了'), h('p', null, `向櫃台借 ${BORROW} 顆繼續玩。借的球會記在「淨賺」裡。`),
      h('div', { class: 'acts' }, h('button', { onclick: () => close() }, '先不要'),
        h('button', { class: 'primary', id: 'btn-borrow', onclick: () => { close(); store.balls += BORROW; store.borrowed += BORROW; setFiring(true); } }, `借 ${BORROW} 顆`)));
  }
  function leave() {
    const busy = logic.wantRight() || (logic.state.phase && logic.state.phase !== 'normal' && logic.state.phase !== 'idle');
    if (!busy) { showHall(); return; }
    const close = modal(h('h3', null, '現在離開？'), h('p', null, '大當或確變還沒結束。離開就放棄剩下的部分。'),
      h('div', { class: 'acts' }, h('button', { class: 'primary', onclick: () => close() }, '繼續玩'), h('button', { onclick: () => { close(); showHall(); } }, '離開')));
  }
  const speedBtns = [1, 2, 4].map((v) => h('button', { id: `spd-${v}`, class: store.speed === v ? 'on' : '', onclick: () => { store.speed = v; speedBtns.forEach((b, i) => b.classList.toggle('on', [1, 2, 4][i] === v)); } }, `×${v}`));
  el.labels = h('button', { id: 'btn-labels', class: store.labels ? 'on' : '', onclick: () => { store.labels = !store.labels; el.labels.classList.toggle('on', store.labels); staticLayer = null; } }, '名稱');
  el.mute = h('button', { id: 'btn-mute', onclick: () => { store.muted = !store.muted; audio.setMuted(store.muted); el.mute.textContent = store.muted ? '靜音' : '有聲'; } }, store.muted ? '靜音' : '有聲');
  el.auto = hasRight ? h('button', { id: 'btn-auto', class: store.autoRight ? 'on' : '', onclick: () => { store.autoRight = !store.autoRight; el.auto.classList.toggle('on', store.autoRight); refreshPower(); } }, '自動右打') : null;
  const root = h('div', { class: 'play' },
    h('div', { class: 'bar' },
      h('button', { id: 'btn-back', onclick: leave }, '← 大廳'),
      h('h2', null, machine.name),
      h('div', { class: 'seg', role: 'group', 'aria-label': '速度' }, speedBtns),
      el.labels, el.mute,
      h('button', { id: 'btn-help', onclick: () => helpSheet(machine) }, '玩法')),
    el.stage = h('div', { class: 'stage' }, cv, el.toast = h('div', { class: 'toast hide', role: 'status' })),
    h('div', { class: 'hud' },
      el.badge = h('span', { class: 'badge' }, ''),
      el.big = h('span', { class: 'big' }, ''),
      h('div', { class: 'balls' }, el.balls = h('b', { id: 'balls' }, ''), h('span', null, '持球')),
      el.rows = h('div', { class: 'rows' })),
    h('div', { class: 'ctl' },
      h('div', { class: 'power' },
        h('div', { class: 'power-head' }, h('span', null, '力道（弱 ← → 強）'), el.powerNum = h('b', { id: 'power-num' }, '')),
        el.track,
        h('div', { class: 'nudge' },
          h('button', { id: 'p-dn', 'aria-label': '力道減 1', onclick: () => setPower(power - 0.01) }, '−1'),
          h('button', { id: 'p-dn2', 'aria-label': '力道減 0.2', onclick: () => setPower(power - 0.002) }, '−0.2'),
          h('button', { id: 'p-up2', 'aria-label': '力道加 0.2', onclick: () => setPower(power + 0.002) }, '+0.2'),
          h('button', { id: 'p-up', 'aria-label': '力道加 1', onclick: () => setPower(power + 0.01) }, '+1'),
          h('span', { class: 'sp' }),
          el.auto)),
      el.fire = h('button', { class: 'fire', id: 'btn-fire', onclick: () => setFiring(!firing) })));
  app.replaceChildren(root);
  setFiring(false);
  refreshPower();

  function resize() {
    const r = el.stage.getBoundingClientRect();
    const side = Math.max(120, Math.floor(Math.min(r.width, r.height)));
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const want = Math.round(side * dpr);
    cv.style.width = cv.style.height = `${side}px`;
    if (want !== px) { px = want; cv.width = cv.height = px; staticLayer = null; }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(el.stage);
  resize();

  // ---- 每一步 ----
  function tick() {
    cooldown -= PH.DT;
    if (firing && cooldown <= 0) {
      if (store.balls > 0) {
        store.balls--;
        session.fire(livePower());
        audio.play('fire');
        cooldown = FIRE_INTERVAL;
      } else { setFiring(false); askBorrow(); }
    }
    for (const e of session.step()) {
      if (e.type === 'foul') {
        store.balls++;
        audio.play('foul');
        if (time - lastFoulToast > 4) { lastFoulToast = time; toast('力道太弱，鋼珠掉回來了（退回，不扣球）'); }
      }
    }
    for (const b of session.world.balls) if (b.hit) { b.hit = 0; audio.play('pin'); }
  }

  function updateHud() {
    const d = logic.hud();
    el.badge.textContent = d.mode;
    el.badge.classList.toggle('hot', !!d.hot);
    el.big.textContent = wantRight() && !store.autoRight ? `${d.big}　→ 把力道拉到「右打」` : d.big;
    el.balls.textContent = fmt(store.balls);
    const st = session.stats;
    const rate = st.fired ? `${Math.round((st.paid / st.fired) * 100)}%` : '—';
    const rows = [...d.rows, ['這次發射', fmt(st.fired)], ['賠出', fmt(st.paid)], ['回收率', rate]];
    el.rows.replaceChildren(...rows.map(([k, v]) => h('span', null, `${k} `, h('b', null, String(v)))));
    if (el.zoneRight) el.zoneRight.classList.toggle('want', wantRight());
    refreshPower();
    rec.fired = base.fired + st.fired; rec.paid = base.paid + st.paid;
    rec.jackpots = base.jackpots + (st.byId.jackpot || 0) + (st.byId.V || 0);
  }

  function frame(ts) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - (last || ts)) / 1000);
    last = ts;
    time += dt;
    acc += dt * store.speed;
    let n = 0;
    while (acc >= PH.DT && n < 48) { tick(); acc -= PH.DT; n++; }
    if (n === 48) acc = 0;
    for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 0.9) pops.splice(i, 1); }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.add('hide'); }
    hudT += dt; if (hudT > 0.12) { hudT = 0; updateHud(); }
    saveT += dt; if (saveT > 4) { saveT = 0; saveStore(store); }
    if (!staticLayer) staticLayer = buildStatic(session.board, px, store.labels);
    drawFrame(ctx, px, session, { staticLayer, pops, time, rightHint: wantRight() });
  }

  function onKey(e) {
    if (document.querySelector('.modal')) return;
    const step = e.shiftKey ? 0.002 : 0.01;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') setPower(power - step);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') setPower(power + step);
    else if (e.code === 'Space') { if (!e.repeat) setFiring(!firing); }
    else if (e.code === 'Escape') leave();
    else return;
    e.preventDefault();
  }
  window.addEventListener('keydown', onKey);

  current = {
    session,
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('keydown', onKey);
      updateHud(); saveStore(store);
    },
    // 測試用
    debug: { setPower, setFiring, step: (k) => { for (let i = 0; i < k; i++) tick(); updateHud(); }, logic, store },
  };
  window.__pachinko = current;
  updateHud();
  raf = requestAnimationFrame(frame);
  if (!store.seen[machine.id]) { store.seen[machine.id] = true; helpSheet(machine); }
}

function boot() { showHall(); }
if (window.claude?.hot?.ready) window.claude.hot.ready(boot); else boot();
