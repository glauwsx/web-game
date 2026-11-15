// 小鋼珠小遊戲的場景。
// opts = {
//   board（檯面 id）, setting（釘子設定 1–5）, balls（彈珠數）, fee（入場費，只用來算回饋率）,
//   target（親自應戰的目標價值，¥）, seed, power（旋鈕初始值）,
//   onDone(result), onExit()
// }
// result = { counts: { A, B, C, D, S, J }, value, fee, target, win, quit }
import { h } from '../../ui/dom.js';
import { t } from '../../data/strings.js';
import { PACHINKO as P } from '../../data/balance.js';
import { createStepper } from '../../core/loop.js';
import { rngCreate, rngRange, rngChance, rngInt } from '../../core/rng.js';
import { BOARDS } from '../../data/pachinko-boards.js';
import { compileBoard, createBall, stepBall, jitterPower } from './physics.js';
import { PRIZE_VALUE, jackpotChance } from './ai.js';
import { drawPachinko, GATE_X, GATE_Y } from './render.js';
import { sushiIcon } from '../../ui/panels.js';
import { yen } from '../../ui/hud.js';
import { getSprite, spriteDataURL } from '../../iso/sprites.js';

const RAIL_S = 0.22;          // 彈珠在發射軌道上跑幾秒（純動畫）
const SPIN_S = 1.3;           // 滾輪轉一次幾秒
const STEP = 0.005;           // 方向鍵一次調多少
const FINE = 0.001;           // 按住 Shift 一次調多少
const DRAG = 0.0005;          // 拖曳刻度：每個畫布像素調多少
const REEL_SYMBOLS = ['tamago', 'maguro', 'ebi', 'ikura', 'uni', 'otoro'];
const PRIZE_ICON = { A: 'uni', B: 'anago', C: 'maguro', D: 'tamago', J: 'otoro' };
const KINDS = ['J', 'A', 'B', 'C', 'D'];

let soundsReady = false;
function registerSounds(app) {
  if (soundsReady || !app.audio || !app.audio.register) return;
  soundsReady = true;
  app.audio.register('pkFire', ({ noise, tone }) => { noise({ dur: 0.06, vol: 0.18, freq: 3000 }); tone({ type: 'triangle', f0: 220, f1: 660, dur: 0.08, vol: 0.08 }); });
  app.audio.register('pkPin', ({ tone }) => { tone({ type: 'square', f0: 2200 + Math.random() * 900, dur: 0.02, vol: 0.05 }); });
  app.audio.register('pkIn', ({ tone }) => { tone({ type: 'triangle', f0: 1318, dur: 0.08, vol: 0.2 }); tone({ type: 'triangle', f0: 1760, dur: 0.14, vol: 0.18, at: 0.07 }); });
  app.audio.register('pkReel', ({ tone }) => { tone({ type: 'square', f0: 880, dur: 0.02, vol: 0.06 }); });
  app.audio.register('pkJackpot', ({ tone }) => {
    [784, 988, 1175, 1568, 1175, 1568, 2093].forEach((f, i) => tone({ f0: f, dur: 0.14, vol: 0.25, at: i * 0.09 }));
  });
}

export function createPachinkoScene(app, opts = {}) {
  registerSounds(app);
  const boardId = BOARDS[opts.board] ? opts.board : 'itamae';
  const setting = Math.max(1, Math.min(5, opts.setting || 3));
  const geom = compileBoard(BOARDS[boardId], setting);
  const jp = jackpotChance(boardId, setting);
  const fee = opts.fee ?? P.FEE;
  // 親自應戰：有目標成績（可能是 0，這時只要贏到任何東西就算贏）
  const challenge = typeof opts.target === 'number';
  const target = challenge ? opts.target : 0;
  const rng = rngCreate((opts.seed ?? app.params.seed ?? Date.now()) >>> 0);
  const stepper = createStepper(P.DT * 1000);
  let power = opts.power ?? 0.46;
  let drift = rngRange(rng, -P.DRIFT_MAX / 2, P.DRIFT_MAX / 2);
  let left = opts.balls ?? P.BALLS;
  const balls = [];
  const rail = [];
  const land = [];
  const counts = { A: 0, B: 0, C: 0, D: 0, S: 0, J: 0 };
  let value = 0;
  let cooldown = 0;
  let fireHeld = false;
  let queue = 0;           // 等著轉的滾輪次數
  let spin = null;         // { t, win, final }
  let flash = 0;
  let endT = -1;
  let finished = false;
  let time = 0;
  let uiTimer = 0;
  let drag = null;
  let gaugeRect = null;
  let lastFeedback = '';
  let result = null;
  const el = {};

  // ---- DOM ----
  const prizeRows = {};
  for (const k of KINDS) {
    prizeRows[k] = h('span', { class: 'num' }, '0');
  }
  const prizeRow = (k) => h('div', { class: 'pk-prize' },
    sushiIcon(PRIZE_ICON[k], 2),
    h('span', { class: 'pk-prize-name' }, t(`pk.prize.${k}`)),
    h('span', { class: 'pk-prize-n' }, '×', prizeRows[k]));
  const reelImgs = [0, 1, 2].map(() => sushiIcon('tamago', 3));
  const holdBtn = (code, label, cls, onDown) => {
    const b = h('button', { class: `btn plain pk-btn ${cls || ''}`, dataset: { id: `pk-${code}` } }, label);
    const set = (on) => (e) => {
      e.preventDefault();
      if (onDown) { if (on) onDown(); return; }
      fireHeld = on;
      b.classList.toggle('active', on);
    };
    b.addEventListener('pointerdown', set(true));
    b.addEventListener('pointerup', set(false));
    b.addEventListener('pointerleave', set(false));
    b.addEventListener('pointercancel', set(false));
    return b;
  };
  const adjust = (d) => { power = Math.max(0, Math.min(1, Math.round((power + d) * 1000) / 1000)); updateHud(); };
  const root = h('div', { class: 'scene pk-scene' },
    h('div', { class: 'pk-left panel solid' },
      h('div', { class: 'pk-title' }, t(`pk.board.${boardId}`), h('small', null, ` ${t('pk.setting', { n: setting })}`)),
      h('div', { class: 'pk-head' }, t('pk.prizes')),
      KINDS.map(prizeRow),
      h('div', { class: 'pk-total' }, t('pk.total'), ' ', el.value = h('span', { class: 'num', dataset: { id: 'pk-value' } }, yen(0))),
      challenge ? h('div', { class: 'pk-target', dataset: { id: 'pk-target' } }, t('pk.target', { n: Math.round(target).toLocaleString('en-US') })) : null,
      el.targetBar = challenge ? h('div', { class: 'pk-bar' }, el.targetFill = h('div', { class: 'pk-bar-fill' })) : null),
    h('div', { class: 'pk-right' },
      h('div', { class: 'pk-top panel solid' },
        h('div', { class: 'pk-balls' }, t('pk.balls'), ' ', el.balls = h('span', { class: 'num', dataset: { id: 'pk-balls' } }, '')),
        el.reels = h('div', { class: 'pk-reels' }, reelImgs),
        el.reelMsg = h('div', { class: 'pk-reel-msg' }, ''),
        el.feedback = h('div', { class: 'pk-feedback', dataset: { id: 'pk-feedback' } }, t('pk.fb.none'))),
      el.gauge = h('div', { class: 'pk-gauge' }),
      h('div', { class: 'pk-power' }, t('pk.power'), ' ', el.power = h('span', { class: 'num', dataset: { id: 'pk-power' } }, '')),
      h('div', { class: 'pk-ctl' },
        holdBtn('minus', '−', 'mini', () => adjust(-STEP)),
        holdBtn('fminus', t('pk.fine.minus'), 'mini', () => adjust(-FINE)),
        holdBtn('fplus', t('pk.fine.plus'), 'mini', () => adjust(FINE)),
        holdBtn('plus', '+', 'mini', () => adjust(STEP))),
      h('div', { class: 'pk-ctl' },
        el.fire = holdBtn('fire', t('pk.fire'), 'red pk-fire'),
        h('button', { class: 'btn plain mini', dataset: { id: 'pk-exit' }, onclick: () => exit() }, t('pk.exit')))),
    h('div', { class: 'pk-hint' }, t('pk.hint')),
    el.result = h('div', { class: 'panel pk-result solid hidden' }));

  /** 離開：已經結束就等於按「好」；應戰中離開算放棄（結算目前的成績）；試玩就直接離開。 */
  function exit() {
    if (finished) { const b = el.result.querySelector('[data-id="pk-done"]'); if (b) b.click(); return; }
    if (opts.onDone) { finish(true); return; }
    app.scenes.pop();
    if (opts.onExit) opts.onExit();
  }

  // ---- 遊戲邏輯 ----
  function fire() {
    if (left <= 0 || finished) return;
    left--;
    // 實際力道 = 旋鈕值 + 漂移 + 機台抖動
    const actual = jitterPower(power + drift, rng);
    drift = Math.max(-P.DRIFT_MAX, Math.min(P.DRIFT_MAX, drift + rngRange(rng, -P.DRIFT_STEP, P.DRIFT_STEP)));
    rail.push({ y: 290, t: 0, power: actual });
    app.sfx('pkFire', 60);
  }

  function startSpin() {
    queue--;
    const win = rngChance(rng, jp);
    let final;
    if (win) final = ['otoro', 'otoro', 'otoro'];
    else {
      const a = REEL_SYMBOLS[rngInt(rng, 0, REEL_SYMBOLS.length - 1)];
      // 有時候前兩格相同（差一點）
      const b = rngChance(rng, 0.3) ? a : REEL_SYMBOLS[rngInt(rng, 0, REEL_SYMBOLS.length - 1)];
      let c = REEL_SYMBOLS[rngInt(rng, 0, REEL_SYMBOLS.length - 1)];
      if (a === b && c === a) c = REEL_SYMBOLS[(REEL_SYMBOLS.indexOf(a) + 1) % REEL_SYMBOLS.length];
      final = [a, b, c];
    }
    spin = { t: 0, win, final, shown: [-1, -1, -1] };
    el.reelMsg.textContent = '';
  }

  function endSpin() {
    if (spin.win) {
      counts.J++;
      value += PRIZE_VALUE.J;
      flash = 2.5;
      app.sfx('pkJackpot');
      el.reelMsg.textContent = t('pk.jackpot');
      el.reelMsg.classList.add('win');
    } else {
      counts.S++;
      el.reelMsg.textContent = t('pk.miss');
      el.reelMsg.classList.remove('win');
    }
    spin = null;
  }

  function onBallDone(b) {
    if (b.done === 'out') return;
    if (b.done === 'S') { queue++; app.sfx('pkIn'); return; }
    counts[b.done]++;
    value += PRIZE_VALUE[b.done];
    app.sfx('pkIn');
  }

  function feedbackFor(b) {
    if (b.foul) return t('pk.fb.foul');
    const dx = Math.round(b.landX - GATE_X);
    if (Math.abs(dx) <= 3) return t('pk.fb.center');
    return dx < 0 ? t('pk.fb.strong', { n: -dx }) : t('pk.fb.weak', { n: dx });
  }

  /** 前進一個物理步長（1/120 秒）。 */
  function physicsStep() {
    const dt = P.DT;
    // 發射：按住時每 0.6 秒一顆
    cooldown -= dt;
    if ((fireHeld || app.input.anyDown('Space')) && cooldown <= 0 && left > 0) {
      fire();
      cooldown = P.FIRE_INTERVAL;
    }
    // 軌道上的彈珠
    for (let i = rail.length - 1; i >= 0; i--) {
      const r = rail[i];
      r.t += dt;
      r.y = 290 - (290 - 14) * Math.min(1, r.t / RAIL_S);
      if (r.t >= RAIL_S) {
        rail.splice(i, 1);
        const b = createBall(geom, r.power);
        if (b.foul) { lastFeedback = feedbackFor(b); land.push({ x: geom.launch.x, age: 0 }); continue; }
        balls.push(b);
      }
    }
    // 檯面上的彈珠
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      const hits = b.hits;
      stepBall(geom, b, rng);
      if (b.hits > hits && b.hitSpeed > 120) app.sfx('pkPin', 25);
      if (b.landX === undefined && b.y >= GATE_Y && b.vy > 0) {
        b.landX = b.x;
        land.push({ x: b.x, age: 0 });
        if (land.length > 6) land.shift();
        lastFeedback = feedbackFor(b);
      }
      if (b.done) {
        if (b.landX === undefined) { b.landX = b.x; lastFeedback = feedbackFor(b); }
        balls.splice(i, 1);
        onBallDone(b);
      }
    }
    for (const l of land) l.age += dt;
    // 滾輪
    if (!spin && queue > 0) startSpin();
    if (spin) {
      spin.t += dt;
      if (spin.t >= SPIN_S) endSpin();
    }
    if (flash > 0) flash -= dt;
    // 全部結束
    if (!finished && left === 0 && !rail.length && !balls.length && !spin && queue === 0) {
      if (endT < 0) endT = 0.6;
      endT -= dt;
      if (endT <= 0) finish(false);
    }
  }

  function updateReels() {
    if (!spin) return;
    for (let i = 0; i < 3; i++) {
      const stopAt = SPIN_S * (0.45 + 0.25 * i);
      let sym;
      if (spin.t >= stopAt) sym = REEL_SYMBOLS.indexOf(spin.final[i]);
      else sym = Math.floor(time / 70 + i * 2) % REEL_SYMBOLS.length;
      if (spin.shown[i] !== sym) {
        spin.shown[i] = sym;
        reelImgs[i].src = spriteDataURL(getSprite(`sushi.${REEL_SYMBOLS[sym]}`), 3);
        if (spin.t < stopAt) app.sfx('pkReel', 60);
      }
    }
  }

  function finish(quit) {
    if (finished) return;
    finished = true;
    fireHeld = false;
    const win = challenge ? value > target : value >= fee;
    result = { counts: { ...counts }, value: Math.round(value), fee, target, win, quit: !!quit };
    scene.result = result;
    app.sfx(win ? 'win' : 'lose');
    const line = (label, v, cls = '') => h('div', { class: `res-line ${cls}` }, h('span', null, label), h('span', null, v));
    const parts = [];
    for (const k of KINDS) if (counts[k]) parts.push(`${t(`pk.prize.${k}`)} ×${counts[k]}`);
    el.result.classList.remove('hidden');
    el.result.replaceChildren(...[
      h('h1', { class: 'menu-title' }, t(quit ? 'pk.result.quit' : 'pk.result.title')),
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
    el.balls.textContent = String(left);
    el.power.textContent = power.toFixed(3);
    el.value.textContent = yen(Math.round(value));
    for (const k of KINDS) prizeRows[k].textContent = String(counts[k]);
    el.feedback.textContent = lastFeedback || t('pk.fb.none');
    if (el.targetFill) {
      el.targetFill.style.width = `${target > 0 ? Math.min(100, (value / target) * 100).toFixed(1) : value > 0 ? 100 : 0}%`;
      el.targetFill.classList.toggle('beat', value > target);
    }
    el.reels.classList.toggle('spinning', !!spin);
    el.reels.classList.toggle('held', queue > 0);
    el.reels.dataset.hold = queue > 0 ? `+${queue}` : '';
  }

  /** DOM 裡刻度的位置換成畫布座標。 */
  function layoutGauge() {
    const c = app.canvas.getBoundingClientRect();
    const r = el.gauge.getBoundingClientRect();
    if (!c.width || !r.width) { gaugeRect = null; return; }
    const k = app.W / c.width;
    gaugeRect = { x: Math.round((r.left - c.left) * k), y: Math.round((r.top - c.top) * k), w: Math.round(r.width * k), h: Math.round(r.height * k) };
  }

  const view = { geom, boardId, setting, balls, rail, land, power, gaugeRect: null, flash: 0 };

  const scene = {
    name: 'pachinko',
    root,
    result: null,
    enter() { requestAnimationFrame(layoutGauge); window.addEventListener('resize', layoutGauge); },
    exit() { window.removeEventListener('resize', layoutGauge); app.input.setVirtual('Space', false); },
    update(dt) {
      time += dt;
      if (!gaugeRect) layoutGauge();
      if (!finished) stepper.advance(dt * (app.params.speed || 1), physicsStep);
      updateReels();
      uiTimer += dt;
      if (uiTimer > 80) { uiTimer = 0; updateHud(); }
    },
    render(ctx) {
      view.power = power;
      view.gaugeRect = gaugeRect;
      view.flash = flash;
      drawPachinko(ctx, app.W, app.H, view, time);
    },
    input(evt) {
      if (evt.type === 'keydown') {
        if (evt.code === 'ArrowLeft' || evt.code === 'KeyA') { adjust(evt.shift ? -FINE : -STEP); return true; }
        if (evt.code === 'ArrowRight' || evt.code === 'KeyD') { adjust(evt.shift ? FINE : STEP); return true; }
        if (evt.code === 'Escape' && !evt.repeat) { exit(); return true; }
        if (evt.code === 'Enter' && finished && !evt.repeat) { exit(); return true; }
      } else if (evt.type === 'pointerdown') {
        const g = gaugeRect;
        if (g && evt.x >= g.x && evt.x <= g.x + g.w && evt.y >= g.y && evt.y <= g.y + g.h) drag = { x: evt.x };
      } else if (evt.type === 'pointermove' && drag && evt.down) {
        adjust((evt.x - drag.x) * DRAG);
        drag.x = evt.x;
      } else if (evt.type === 'pointerup') {
        drag = null;
      }
      return true;
    },
    debug: {
      mini: () => ({
        kind: 'pachinko', board: boardId, setting, left, inFlight: balls.length + rail.length, queue, spinning: !!spin,
        counts: { ...counts }, value: Math.round(value), power, over: finished, result, target,
      }),
      state: () => ({ power, drift, left, balls: balls.map((b) => ({ x: b.x, y: b.y })), counts: { ...counts }, value }),
      /** 前進 n 個物理步長（不受畫面時間影響）。 */
      step: (n = 1) => { for (let i = 0; i < n && !finished; i++) physicsStep(); updateHud(); return left; },
      setPower: (v) => { power = v; updateHud(); return power; },
      hold: (on) => { fireHeld = on !== false; return fireHeld; },
    },
  };
  updateHud();
  return scene;
}
