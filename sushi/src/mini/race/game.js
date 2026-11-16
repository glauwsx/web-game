// 賽車小遊戲的場景。
// opts = { track, level, shumaha, stats, laps, auto（一開始就用自動駕駛）, onDone(result) }
// result = { place, time, integrity, won（贏過的壽司 id）, prizes（拿到的壽司 id）, shumahaPlace（有修馬哈時他的名次，沒有是 0） }
import { h } from '../../ui/dom.js';
import { t } from '../../data/strings.js';
import { RACE as R } from '../../data/balance.js';
import { createStepper } from '../../core/loop.js';
import { createRace, stepRace, playerCar, placeOf, wonSushi } from './physics.js';
import { autopilotInput, prizesFor, prizeValue } from './ai.js';
import { sushiIcon } from '../../ui/panels.js';
import { yen } from '../../ui/hud.js';
import { drawRace } from './render.js';

const COUNTDOWN_MS = 3000;

// 賽車專用的音效（計劃書 16）：噴射、碰撞、水灘、倒數、出發
let soundsReady = false;
function registerSounds(app) {
  if (soundsReady || !app.audio || !app.audio.register) return;
  soundsReady = true;
  app.audio.register('raceBoost', ({ tone, noise }) => { noise({ dur: 0.5, vol: 0.2, freq: 1200, type: 'lowpass' }); tone({ type: 'sawtooth', f0: 220, f1: 660, dur: 0.4, vol: 0.12 }); });
  app.audio.register('raceCrash', ({ tone, noise }) => { noise({ dur: 0.25, vol: 0.35, freq: 500 }); tone({ type: 'square', f0: 160, f1: 60, dur: 0.2, vol: 0.15 }); });
  app.audio.register('raceBump', ({ noise }) => { noise({ dur: 0.08, vol: 0.2, freq: 900 }); });
  app.audio.register('racePuddle', ({ noise, tone }) => { noise({ dur: 0.35, vol: 0.18, freq: 2500, q: 4 }); tone({ type: 'sine', f0: 900, f1: 300, dur: 0.3, vol: 0.1 }); });
  app.audio.register('raceCount', ({ tone }) => { tone({ type: 'square', f0: 660, dur: 0.15, vol: 0.2 }); });
  app.audio.register('raceGo', ({ tone }) => { tone({ type: 'square', f0: 1320, dur: 0.4, vol: 0.22 }); });
}
const EVENT_SOUND = { boost: 'raceBoost', pad: 'raceBoost', puddle: 'racePuddle', crash: 'raceCrash', bump: 'raceBump' };

export function createRaceScene(app, opts = {}) {
  registerSounds(app);
  const race = createRace({ track: opts.track || 'itamae', level: opts.level || 3, shumaha: !!opts.shumaha, stats: opts.stats, laps: opts.laps });
  const p = playerCar(race);
  const stepper = createStepper(1000 * R.DT);
  const view = { W: app.W, H: app.H, time: 0, steer: 0 };
  let countdown = app.params.debug && opts.noCountdown ? 0 : COUNTDOWN_MS;
  let auto = !!opts.auto;
  let boostQueued = false;
  let finished = false;
  let seenEvents = 0;
  let uiTimer = 0;
  let renderMs = 0;
  let renderN = 0;
  const el = {};
  // HUD 的壽司圖示：這一場的對手壽司車（照 LINEUP 由慢到快）。贏過的點亮
  const rivals = race.cars.filter((c) => c.kind === 'shop').map((c) => c.sushi).sort((a, b) => R.LINEUP.indexOf(a) - R.LINEUP.indexOf(b));
  const wonIcons = {};
  let lastWon = [];
  let gotTimer = 0;

  // 觸控按鈕：按住時把對應的鍵設成按下
  const hold = (code, label, cls) => {
    const b = h('button', { class: `btn plain race-btn ${cls || ''}`, dataset: { key: code } }, label);
    const set = (on) => (e) => { e.preventDefault(); if (code === 'Space') { if (on) boostQueued = true; } else app.input.setVirtual(code, on); b.classList.toggle('active', on); };
    b.addEventListener('pointerdown', set(true));
    b.addEventListener('pointerup', set(false));
    b.addEventListener('pointerleave', set(false));
    b.addEventListener('pointercancel', set(false));
    return b;
  };
  const exit = () => { app.scenes.pop(); if (opts.onExit) opts.onExit(); };
  const root = h('div', { class: 'scene race-scene' },
    h('div', { class: 'race-hud solid' },
      el.lap = h('span', null, ''), el.place = h('span', { class: 'race-place' }, ''),
      el.won = h('span', { class: 'race-won', dataset: { id: 'race-won' } },
        rivals.map((id) => (wonIcons[id] = h('span', { class: 'won-icon', dataset: { sushi: id }, title: t(`sushi.${id}`) }, sushiIcon(id, 2))))), el.speed = h('span', null, ''), el.boost = h('span', null, ''), el.integ = h('span', null, ''),
      h('button', { class: 'btn plain mini', dataset: { id: 'race-auto' }, onclick: () => { auto = !auto; } }, t('race.auto')),
      h('button', { class: 'btn plain mini', dataset: { id: 'race-exit' }, onclick: exit }, t('race.exit'))),
    el.center = h('div', { class: 'race-center' }, ''),
    el.got = h('div', { class: 'race-got hidden', dataset: { id: 'race-got' } }, ''),
    h('div', { class: 'race-hint' }, t('race.hint')),
    h('div', { class: 'race-pad left' }, hold('ArrowLeft', t('race.btn.left')), hold('ArrowRight', t('race.btn.right'))),
    h('div', { class: 'race-pad right' }, hold('Space', t('race.btn.boost'), 'boost'), hold('ArrowDown', t('race.btn.brake')), hold('ArrowUp', t('race.btn.gas'), 'gas')),
    el.result = h('div', { class: 'panel race-result solid hidden' }));

  function readInput() {
    if (auto) {
      const a = autopilotInput(race, p, 1.0);
      // 自動駕駛在直線上用噴射
      a.boost = p.boosts > 0 && p.boostT <= 0 && race.t > 3 && Math.abs(a.steer) < 0.2;
      return a;
    }
    const inp = app.input;
    const steer = (inp.anyDown('ArrowRight', 'KeyD') ? 1 : 0) - (inp.anyDown('ArrowLeft', 'KeyA') ? 1 : 0);
    const boost = boostQueued;
    boostQueued = false;
    return { steer, accel: app.settings.autoAccel || inp.anyDown('ArrowUp', 'KeyW'), brake: inp.anyDown('ArrowDown', 'KeyS'), boost };
  }

  /** 引擎聲：音高跟速度連動。null 是關掉。 */
  function engine(ratio) {
    if (app.audio && app.audio.engine) app.audio.engine(ratio);
  }

  function finish() {
    finished = true;
    engine(null);
    el.got.classList.add('hidden');
    const place = p.place || placeOf(race, p);
    const won = wonSushi(race);
    const sh = race.cars.find((c) => c.kind === 'shumaha');
    const shumahaPlace = sh ? sh.place || placeOf(race, sh) : 0;
    const result = { place, time: p.finishT, integrity: Math.round(p.integrity), won, prizes: prizesFor(won), shumahaPlace };
    // 跟修馬哈比：只看有沒有跑在他前面
    const vsShumaha = !!opts.shumaha && shumahaPlace > 0;
    const beat = vsShumaha && place < shumahaPlace;
    app.sfx((vsShumaha ? beat : won.length) ? 'win' : 'lose');
    el.result.classList.remove('hidden');
    el.result.replaceChildren(
      h('h1', { class: 'menu-title' }, t('race.finish')),
      h('div', { class: 'res-line big' }, h('span', null, t('race.result.place')), h('span', { dataset: { id: 'race-place' } }, t('race.place', { n: place }))),
      h('div', { class: 'res-line' }, h('span', null, t('race.result.time')), h('span', null, t('race.seconds', { n: result.time.toFixed(1) }))),
      h('div', { class: 'res-line' }, h('span', null, t('race.result.integrity')), h('span', null, `${result.integrity}%`)),
      vsShumaha
        ? h('div', { class: 'res-line' }, h('span', null, t('race.result.shumaha')), h('span', null, t('race.place', { n: shumahaPlace })))
        : h('div', { class: 'res-prizes' },
          h('div', { class: 'res-line' }, h('span', null, won.length ? t('race.result.prize') : t('race.consolation')), h('span', { dataset: { id: 'race-value' } }, t('race.result.value', { v: yen(prizeValue(result.prizes)) }))),
          h('div', { class: 'race-prize-list', dataset: { id: 'race-prize' } },
            result.prizes.map((id) => h('span', { class: 'race-prize' }, sushiIcon(id, 3), t(`sushi.${id}`))))),
      vsShumaha ? h('div', { class: `pk-verdict ${beat ? 'win' : 'lose'}`, dataset: { id: 'race-verdict' } }, t(beat ? 'race.result.beat' : 'race.result.lost')) : '',
      h('div', { class: 'menu-foot' },
        opts.onDone ? null : h('button', { class: 'btn plain', dataset: { id: 'race-again' }, onclick: () => app.scenes.replace(createRaceScene(app, opts)) }, t('race.again')),
        h('button', { class: 'btn red', dataset: { id: 'race-done' }, onclick: () => { app.scenes.pop(); if (opts.onDone) opts.onDone(result); } }, t('common.ok'))));
    scene.result = result;
    updateHud();
  }

  /**
   * 壽司圖示：贏過的點亮，被追回去的變暗（計劃書 9.2）。圖示只改亮度，不改大小和位置。
   * 剛超過一台時跳「入手：某某」並播音效；被追回去播 deny。
   */
  function updateWon() {
    const now = wonSushi(race);
    for (const id of rivals) wonIcons[id].classList.toggle('on', now.includes(id));
    if (countdown <= 0 && !finished) {
      const gained = now.filter((id) => !lastWon.includes(id));
      const lost = lastWon.filter((id) => !now.includes(id));
      if (gained.length) {
        el.got.textContent = t('race.got', { name: gained.map((id) => t(`sushi.${id}`)).join('、') });
        el.got.classList.remove('hidden', 'show');
        void el.got.offsetWidth;
        el.got.classList.add('show');
        gotTimer = 1200;
        app.sfx('star', 150);
      } else if (lost.length) {
        app.sfx('deny', 150);
      }
    }
    lastWon = now;
  }

  function updateHud() {
    el.lap.textContent = t('race.lap', { n: Math.min(race.laps, p.lap + 1), total: race.laps });
    el.place.textContent = t('race.place', { n: placeOf(race, p) });
    el.speed.textContent = `${t('race.speed')} ${Math.round((p.speed / R.MAX_SPEED) * 120)}`;
    el.boost.textContent = `${t('race.boost')} ${'●'.repeat(p.boosts)}${'○'.repeat(R.BOOSTS - p.boosts)}`;
    updateWon();
    el.integ.textContent = `${t('race.integrity')} ${Math.round(p.integrity)}%`;
  }

  const scene = {
    name: 'race',
    root,
    result: null,
    exit() { engine(null); },
    update(dt) {
      view.time += dt;
      if (countdown > 0) {
        const before = Math.ceil(countdown / 1000);
        countdown -= dt;
        const now = Math.ceil(countdown / 1000);
        el.center.textContent = countdown > 0 ? String(now) : t('race.go');
        if (now !== before) app.sfx(countdown > 0 ? 'raceCount' : 'raceGo');
        if (countdown <= 0) setTimeout(() => { if (!finished) el.center.textContent = ''; }, 700);
        return;
      }
      if (!race.over) {
        stepper.advance(dt * (app.params.speed || 1), () => {
          if (race.over) return;
          const inp = readInput();
          view.steer = inp.steer;
          stepRace(race, inp);
        });
        for (; seenEvents < race.events.length; seenEvents++) {
          const k = race.events[seenEvents].kind;
          app.sfx(EVENT_SOUND[k] || 'raceBump', 200);
        }
        if (race.events.length >= 20) seenEvents = race.events.length;
        engine(p.speed / R.MAX_SPEED);
      } else if (!finished) finish();
      if (gotTimer > 0) { gotTimer -= dt; if (gotTimer <= 0) el.got.classList.add('hidden'); }
      uiTimer += dt;
      if (uiTimer > 100) { uiTimer = 0; updateHud(); }
    },
    render(ctx) {
      const t0 = performance.now();
      drawRace(ctx, race, view);
      renderMs += performance.now() - t0;
      renderN++;
    },
    input(evt) {
      if (evt.type === 'keydown' && !evt.repeat) {
        if (evt.code === 'Space') { boostQueued = true; return true; }
        if (evt.code === 'Escape') { exit(); return true; }
      }
      return true;
    },
    debug: {
      mini: () => ({ kind: 'race', track: race.track, t: race.t, lap: p.lap, laps: race.laps, place: placeOf(race, p), won: wonSushi(race), speed: p.speed, boosts: p.boosts, integrity: p.integrity, over: race.over, result: scene.result, renderMs: renderN ? renderMs / renderN : 0 }),
      state: () => JSON.parse(JSON.stringify(race)),
      auto: (on) => { auto = on !== false; return auto; },
      step: (n = 1) => { countdown = 0; el.center.textContent = ''; for (let i = 0; i < n && !race.over; i++) stepRace(race, readInput()); return race.t; },
    },
  };
  updateHud();
  return scene;
}
