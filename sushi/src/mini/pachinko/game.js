// 小鋼珠小遊戲的場景（數位機）。
// opts = {
//   board（機台 id）, setting（釘子設定 1–5）, fee（入場費，只用來算回饋率）,
//   target（親自應戰的目標價值，¥）, seed, power（力道初始值），
//   onDone(result), onExit()
// }
// result = { counts: { J, A, B, C, D }, balls（出玉）, value, fee, target, win, quit, jackpots }
import { h } from '../../ui/dom.js';
import { t } from '../../data/strings.js';
import { PACHINKO as P } from '../../data/balance.js';
import { BOARDS } from '../../data/pachinko-boards.js';
import { createSession } from './machine.js';
import { exchange, prizeBalls, PRIZE_KINDS } from './ai.js';
import { buildStatic, drawFrame } from './render.js';
import { sushiIcon } from '../../ui/panels.js';
import { yen } from '../../ui/hud.js';

const PH = P.PH;
const STEP = 0.01;            // 方向鍵一次調多少
const FINE = 0.002;           // 按住 Shift 一次調多少
const PRIZE_ICON = { J: 'otoro', A: 'uni', B: 'anago', C: 'maguro', D: 'tamago' };
const SPEEDS = [1, 2, 4];

let soundsReady = false;
function registerSounds(app) {
  if (soundsReady || !app.audio || !app.audio.register) return;
  soundsReady = true;
  const R = (n, fn) => app.audio.register(n, fn);
  const seq = (tone, notes, step, o = {}) => notes.forEach((f, i) => tone({ type: 'square', f0: f, dur: step * 1.4, vol: 0.09, at: i * step, ...o }));
  R('pkFire', ({ noise, tone }) => { noise({ dur: 0.04, vol: 0.1, freq: 2400 }); tone({ type: 'triangle', f0: 180, f1: 520, dur: 0.06, vol: 0.04 }); });
  R('pkPin', ({ tone }) => { tone({ type: 'square', f0: 2400 + Math.random() * 1400, dur: 0.018, vol: 0.025 }); });
  R('pkIn', ({ tone }) => { tone({ type: 'triangle', f0: 1318, dur: 0.07, vol: 0.14 }); tone({ type: 'triangle', f0: 1760, dur: 0.12, vol: 0.12, at: 0.06 }); });
  R('pkCatch', ({ tone }) => seq(tone, [1568, 2093], 0.04, { type: 'triangle', vol: 0.12 }));
  R('pkWarp', ({ tone }) => tone({ type: 'sine', f0: 500, f1: 1800, dur: 0.25, vol: 0.1 }));
  R('pkOpen', ({ tone }) => tone({ type: 'square', f0: 660, f1: 990, dur: 0.07, vol: 0.06 }));
  R('pkClose', ({ tone }) => tone({ type: 'square', f0: 700, f1: 420, dur: 0.07, vol: 0.05 }));
  R('pkReach', ({ tone }) => seq(tone, [523, 659, 784, 1047, 784, 1047, 1319], 0.09, { vol: 0.1 }));
  R('pkRound', ({ tone }) => seq(tone, [784, 1047, 1319], 0.07, { vol: 0.1 }));
  R('pkJackpot', ({ tone }) => seq(tone, [784, 988, 1175, 1568, 1175, 1568, 2093, 1568, 2093, 2637], 0.1, { vol: 0.13 }));
  R('pkFoul', ({ tone }) => tone({ type: 'sawtooth', f0: 220, f1: 110, dur: 0.18, vol: 0.06 }));
}

export function createPachinkoScene(app, opts = {}) {
  registerSounds(app);
  const boardId = BOARDS[opts.board] ? opts.board : 'ryujin';
  const setting = Math.max(1, Math.min(5, opts.setting || 3));
  const fee = opts.fee ?? P.FEE;
  // 親自應戰：有目標成績（可能是 0，這時只要贏到任何東西就算贏）
  const challenge = typeof opts.target === 'number';
  const target = challenge ? opts.target : 0;
  const el = {};
  const pops = [];
  let power = opts.power ?? P.ZONES.best;
  let firing = false, cooldown = 0, acc = 0, time = 0, uiTimer = 0, toastT = 0, lastFoul = -9;
  let finished = false, result = null, staticLayer = null, px = 0, labels = false, autoRight = true;
  let speed = 1;
  let resizeObs = null;

  const toast = (text) => { el.toast.textContent = text; el.toast.classList.remove('hidden'); toastT = 3.2; };
  const session = createSession(boardId, setting, {
    seed: (opts.seed ?? app.params.seed ?? Date.now()) >>> 0,
    sfx: (n) => app.sfx(n, 30),
    msg: toast,
    onPay(n, s) { if (s) pops.push({ x: s.x + s.w / 2, y: s.y, text: `+${n}`, t: 0 }); },
  });
  const logic = session.logic;
  const st = logic.state;
  const livePower = () => (session.wantRight() && autoRight ? P.RIGHT_POWER : power);

  // ---- DOM ----
  const prizeN = {};
  const prizeRow = (k) => h('div', { class: 'pk-prize' },
    sushiIcon(PRIZE_ICON[k], 2),
    h('span', { class: 'pk-prize-name' }, t(`pk.prize.${k}`)),
    h('span', { class: 'pk-prize-cost' }, t('pk.cost', { n: Math.ceil(prizeBalls(k)) })),
    h('span', { class: 'pk-prize-n' }, '×', prizeN[k] = h('span', { class: 'num' }, '0')));
  const zone = (cls, a, b, text) => h('div', { class: `pk-zone ${cls}`, style: `left:${a * 100}%;width:${(b - a) * 100}%` }, text);
  const btn = (id, label, cls, fn) => h('button', { class: `btn plain pk-btn ${cls || ''}`, dataset: { id: `pk-${id}` }, onclick: fn }, label);
  const Z = P.ZONES;
  el.canvas = h('canvas', { class: 'pk-board', dataset: { id: 'pk-board' } });
  const root = h('div', { class: 'scene pk-scene' },
    h('div', { class: 'pk-left panel solid' },
      h('div', { class: 'pk-title' }, t(`pk.board.${boardId}`)),
      h('div', { class: 'pk-sub' }, t('pk.setting', { n: setting }), ' · ', t('pk.odds', { n: Math.round(1 / logic.pLow) })),
      h('div', { class: 'pk-head' }, t('pk.exchange')),
      PRIZE_KINDS.map(prizeRow),
      h('div', { class: 'pk-total' }, t('pk.total'), ' ', el.value = h('span', { class: 'num', dataset: { id: 'pk-value' } }, yen(0))),
      challenge ? h('div', { class: 'pk-target', dataset: { id: 'pk-target' } }, t('pk.target', { n: Math.round(target).toLocaleString('en-US') })) : null,
      challenge ? h('div', { class: 'pk-bar' }, el.targetFill = h('div', { class: 'pk-bar-fill' })) : null),
    el.canvas,
    el.toast = h('div', { class: 'pk-toast hidden', role: 'status' }),
    h('div', { class: 'pk-right' },
      h('div', { class: 'pk-top panel solid' },
        h('div', { class: 'pk-count' },
          h('div', null, h('small', null, t('pk.lent')), el.lent = h('b', { class: 'num', dataset: { id: 'pk-balls' } }, '')),
          h('div', null, h('small', null, t('pk.won')), el.won = h('b', { class: 'num won', dataset: { id: 'pk-won' } }, ''))),
        h('div', { class: 'pk-mode' }, el.badge = h('span', { class: 'pk-badge' }, ''), el.big = h('span', { class: 'pk-big' }, '')),
        h('ol', { class: 'pk-guide' }, [1, 2, 3, 4].map((i) => h('li', null, t(`pk.guide.${i}`))))),
      h('div', { class: 'pk-power' }, t('pk.power'), ' ', el.power = h('span', { class: 'num', dataset: { id: 'pk-power' } }, '')),
      el.track = h('div', { class: 'pk-track', dataset: { id: 'pk-track' }, tabindex: '0', role: 'slider', 'aria-label': t('pk.power') },
        zone('foul', 0, Z.foul, t('pk.zone.foul')),
        zone('left', Z.left[0], Z.left[1], t('pk.zone.left')),
        el.zoneRight = zone('right', Z.right[0], Z.right[1], t('pk.zone.right')),
        el.thumb = h('div', { class: 'pk-thumb' })),
      h('div', { class: 'pk-ctl' },
        btn('minus', '−', 'mini', () => adjust(-STEP)),
        btn('fminus', t('pk.fine.minus'), 'mini', () => adjust(-FINE)),
        btn('fplus', t('pk.fine.plus'), 'mini', () => adjust(FINE)),
        btn('plus', '+', 'mini', () => adjust(STEP))),
      h('div', { class: 'pk-ctl' },
        el.auto = btn('auto', t('pk.auto'), 'mini on', () => { autoRight = !autoRight; el.auto.classList.toggle('on', autoRight); updateHud(); }),
        el.speed = btn('speed', '×1', 'mini', () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; el.speed.textContent = `×${speed}`; }),
        el.labels = btn('labels', t('pk.labels'), 'mini', () => { labels = !labels; el.labels.classList.toggle('on', labels); staticLayer = null; })),
      h('div', { class: 'pk-ctl' },
        el.fire = btn('fire', t('pk.fire'), 'red pk-fire', () => setFiring(!firing)),
        btn('exit', t('pk.exit'), 'mini', () => exit()))),
    h('div', { class: 'pk-hint' }, t('pk.hint')),
    el.result = h('div', { class: 'panel pk-result solid hidden' }));

  function adjust(d) { power = Math.max(0, Math.min(1, Math.round((power + d) * 1000) / 1000)); updateHud(); }
  function setFiring(on) {
    firing = !!on && !finished;
    el.fire.classList.toggle('active', firing);
    el.fire.textContent = t(firing ? 'pk.stop' : 'pk.fire');
  }
  // 拖曳力道條
  const fromPointer = (e) => { const r = el.track.getBoundingClientRect(); if (r.width) { power = Math.max(0, Math.min(1, Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000)); updateHud(); } };
  el.track.addEventListener('pointerdown', (e) => { e.preventDefault(); el.track.setPointerCapture(e.pointerId); fromPointer(e); });
  el.track.addEventListener('pointermove', (e) => { if (el.track.hasPointerCapture(e.pointerId)) fromPointer(e); });

  /** 離開：已經結束就等於按「好」；應戰或顧客模式中途離開算放棄（用目前的出玉結算）；試玩就直接離開。 */
  function exit() {
    if (finished) { const b = el.result.querySelector('[data-id="pk-done"]'); if (b) b.click(); return; }
    if (opts.onDone) { finish(true); return; }
    app.scenes.pop();
    if (opts.onExit) opts.onExit();
  }

  // ---- 遊戲邏輯 ----
  function physicsStep() {
    cooldown -= PH.DT;
    if (firing && cooldown <= 0) {
      if (session.canFire()) {
        session.fire(livePower());
        app.sfx('pkFire', 50);
        cooldown = P.FIRE_INTERVAL;
      } else if (!session.wantRight()) setFiring(false);
    }
    for (const e of session.step()) {
      if (e.type === 'foul') {
        app.sfx('pkFoul', 300);
        if (time - lastFoul > 4000) { lastFoul = time; toast(t('pk.fb.foul')); }
      }
    }
    for (const b of session.world.balls) if (b.hit) { b.hit = 0; app.sfx('pkPin', 28); }
    if (!finished && session.isOver()) finish(false);
  }

  function finish(quit) {
    if (finished) return;
    finished = true;
    setFiring(false);
    const ex = session.result();
    const win = challenge ? ex.value > target : ex.value >= fee;
    result = { counts: { ...ex.counts }, balls: ex.balls, value: Math.round(ex.value), fee, target, win, quit: !!quit, jackpots: st.jackpots };
    scene.result = result;
    app.sfx(win ? 'win' : 'lose');
    const line = (label, v, cls = '') => h('div', { class: `res-line ${cls}` }, h('span', null, label), h('span', null, v));
    const parts = [];
    for (const k of PRIZE_KINDS) if (ex.counts[k]) parts.push(`${t(`pk.prize.${k}`)} ×${ex.counts[k]}`);
    el.result.classList.remove('hidden');
    el.result.replaceChildren(...[
      h('h1', { class: 'menu-title' }, t(quit ? 'pk.result.quit' : 'pk.result.title')),
      line(t('pk.result.balls'), t('pk.result.ballsV', { n: ex.balls, j: st.jackpots })),
      line(t('pk.result.won'), parts.length ? parts.join('、') : t('pk.result.nothing')),
      line(t('pk.total'), yen(result.value), 'big'),
      challenge ? line(t('pk.result.target'), yen(Math.round(target))) : line(t('pk.result.rate'), `${Math.round((result.value / fee) * 100)}%`),
      challenge ? h('div', { class: `pk-verdict ${win ? 'win' : 'lose'}`, dataset: { id: 'pk-verdict' } }, t(win ? 'pk.result.beat' : 'pk.result.lost')) : null,
      h('div', { class: 'menu-foot' },
        opts.onDone ? null : h('button', { class: 'btn plain', dataset: { id: 'pk-again' }, onclick: () => app.scenes.replace(createPachinkoScene(app, { ...opts, seed: undefined, power })) }, t('pk.again')),
        h('button', { class: 'btn red', dataset: { id: 'pk-done' }, onclick: () => { app.scenes.pop(); if (opts.onDone) opts.onDone(result); else if (opts.onExit) opts.onExit(); } }, t('common.ok'))),
    ].filter(Boolean));
  }

  function updateHud() {
    const p = livePower();
    el.thumb.style.left = `${p * 100}%`;
    el.power.textContent = (p * 100).toFixed(1);
    el.lent.textContent = String(session.lent);
    el.won.textContent = String(session.won);
    const ex = exchange(session.won);
    for (const k of PRIZE_KINDS) prizeN[k].textContent = String(ex.counts[k]);
    el.value.textContent = yen(Math.round(ex.value));
    const right = session.wantRight();
    let badge, big;
    if (st.phase === 'jp') {
      badge = t('pk.mode.jp');
      big = st.jp.sub === 'intro' ? t('pk.big.jpIntro') : t('pk.big.jp', { r: st.jp.r, R: st.jp.rounds, c: st.jp.count, C: session.C.count });
    } else if (st.mode === 'st') {
      badge = t('pk.mode.st'); big = t('pk.big.st', { n: st.stLeft });
    } else {
      badge = t('pk.mode.normal');
      big = session.lent > 0 ? t('pk.big.normal', { n: st.since }) : t('pk.big.wait');
    }
    if (right && !autoRight) big += t('pk.big.pullRight');
    el.badge.textContent = badge;
    el.badge.classList.toggle('hot', st.phase === 'jp' || st.mode === 'st');
    el.big.textContent = big;
    el.zoneRight.classList.toggle('want', right);
    if (el.targetFill) {
      el.targetFill.style.width = `${target > 0 ? Math.min(100, (ex.value / target) * 100).toFixed(1) : ex.value > 0 ? 100 : 0}%`;
      el.targetFill.classList.toggle('beat', ex.value > target);
    }
  }

  function layoutCanvas() {
    const r = el.canvas.getBoundingClientRect();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const want = Math.max(64, Math.round(r.height * dpr));
    if (want !== px) { px = want; el.canvas.width = el.canvas.height = px; staticLayer = null; }
  }

  function draw() {
    if (!px) layoutCanvas();
    if (!px) return;
    if (!staticLayer) staticLayer = buildStatic(session.board, px, labels);
    const c = el.canvas.getContext('2d');
    drawFrame(c, px, session, { staticLayer, pops, time: time / 1000, rightHint: session.wantRight() });
  }

  const scene = {
    name: 'pachinko',
    root,
    result: null,
    enter() {
      requestAnimationFrame(layoutCanvas);
      if (typeof ResizeObserver !== 'undefined') { resizeObs = new ResizeObserver(layoutCanvas); resizeObs.observe(el.canvas); }
    },
    exit() { if (resizeObs) resizeObs.disconnect(); },
    update(dt) {
      time += dt;
      if (!finished) {
        acc += (dt / 1000) * speed * (app.params.speed || 1);
        let n = 0;
        while (acc >= PH.DT && n < 240) { physicsStep(); acc -= PH.DT; n++; }
        if (n === 240) acc = 0;
      }
      for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt / 1000; if (pops[i].t > 0.9) pops.splice(i, 1); }
      if (toastT > 0) { toastT -= dt / 1000; if (toastT <= 0) el.toast.classList.add('hidden'); }
      uiTimer += dt;
      if (uiTimer > 80) { uiTimer = 0; updateHud(); }
    },
    render(ctx) {
      // 480×270 的畫布只畫店裡的牆當背景，盤面畫在自己的畫布上
      ctx.fillStyle = '#2b1d12';
      ctx.fillRect(0, 0, app.W, app.H);
      ctx.fillStyle = '#3a2416';
      for (let x = 0; x < app.W; x += 24) ctx.fillRect(x, 0, 12, app.H);
      draw();
    },
    input(evt) {
      if (evt.type === 'keydown') {
        if (evt.code === 'ArrowLeft' || evt.code === 'KeyA') { adjust(evt.shift ? -FINE : -STEP); return true; }
        if (evt.code === 'ArrowRight' || evt.code === 'KeyD') { adjust(evt.shift ? FINE : STEP); return true; }
        if (evt.code === 'Space' && !evt.repeat && !finished) { setFiring(!firing); return true; }
        if (evt.code === 'Escape' && !evt.repeat) { exit(); return true; }
        if (evt.code === 'Enter' && finished && !evt.repeat) { exit(); return true; }
      }
      return true;
    },
    debug: {
      mini: () => ({
        kind: 'pachinko', board: boardId, setting, left: session.lent, won: session.won, inFlight: session.world.balls.length,
        spinning: st.phase === 'spin', mode: st.mode, phase: st.phase, jackpots: st.jackpots,
        counts: exchange(session.won).counts, value: Math.round(exchange(session.won).value), power, firing, over: finished, result, target,
      }),
      /** 前進 n 個物理步長（不受畫面時間影響）。 */
      step: (n = 1) => { for (let i = 0; i < n && !finished; i++) physicsStep(); updateHud(); return session.lent; },
      setPower: (v) => { power = v; updateHud(); return power; },
      hold: (on) => { setFiring(on !== false); return firing; },
      win: () => { logic.debugWin(); return true; },
      session,
    },
  };
  setFiring(false);
  updateHud();
  return scene;
}
