// 啟動、場景管理。
import { createStepper, startLoop } from './core/loop.js';
import { createSceneManager } from './core/scenes.js';
import { createInput } from './core/input.js';
import { createSaveStore, probeLocalStorage } from './core/save.js';
import { t } from './data/strings.js';
import { toast } from './ui/dom.js';
import {
  createTitleScene, createMainMenuScene, createOwnerMenuScene, createPlaceholderScene, createSettingsScene, createOverlayMenu,
} from './ui/menus.js';
import { createDemoScene } from './modes/demo.js';
import { createAudio } from './core/audio.js';
import { SAVE_KEYS } from './core/save.js';
import { createLevelSelectScene, startLevel } from './modes/owner-level.js';
import { createRaceScene } from './mini/race/game.js';
import { TRACKS } from './data/tracks.js';

const W = 480;
const H = 270;
const MIN_W = 640; // 支援的最小視窗寬度

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const stage = document.getElementById('stage');
const uiRoot = document.getElementById('ui');
document.getElementById('rotate-msg').textContent = t('rotate.msg');

// ---- 網址參數 ----
const query = new URLSearchParams(location.search);
const debug = query.get('debug') === '1';
const params = {
  debug,
  seed: query.has('seed') ? Number(query.get('seed')) >>> 0 : null,
  scene: query.get('scene') || '',
  speed: debug && query.has('speed') ? Math.max(1, Number(query.get('speed')) || 1) : 1,
  // 只在 debug 下有效的測試用參數
  noIntro: debug && query.get('nointro') === '1',
  noHints: debug && query.get('nohints') === '1',
  unlockAll: debug && query.get('unlock') === '1',
};

// ---- 畫布縮放 ----
// 畫布邏輯解析度固定 480×270。放大到視窗能容納的最大 16:9。
// 放大倍數（以裝置像素計）取整數後如果損失不到 15%，就用整數倍，像素才會一樣大。
function layout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  let scale = Math.min(vw / W, vh / H);
  const dev = scale * dpr;
  const snapped = Math.floor(dev);
  if (snapped >= 1 && snapped / dev >= 0.85) scale = snapped / dpr;
  const sw = Math.round(W * scale);
  const sh = Math.round(H * scale);
  const root = document.documentElement.style;
  root.setProperty('--stage-w', `${sw}px`);
  root.setProperty('--stage-h', `${sh}px`);
  // 介面字級跟著舞台寬度走，但有上下限（手機上不能太小）。
  const fs = Math.max(11, Math.min(20, sw / 62));
  root.setProperty('--fs', `${fs.toFixed(2)}px`);
  stage.classList.toggle('narrow', vw < 900);
  stage.classList.toggle('tiny', vw < MIN_W);
  app.stageScale = scale;
}

// ---- 場景管理 ----
const scenes = createSceneManager({
  mount(root) { uiRoot.appendChild(root); },
  unmount(root) { root.remove(); },
  setVisible(root, on) { root.classList.toggle('hidden', !on); },
});

const store = createSaveStore(probeLocalStorage());

const SETTINGS_SPEC = {
  version: 1,
  defaults: () => ({ version: 1, music: 0.5, sfx: 0.7, autoAccel: false }),
};
const corruptReported = {};

const app = {
  W, H, canvas, ctx, scenes, store, params,
  stageScale: 1,
  input: null,
  settings: SETTINGS_SPEC.defaults(),
  audio: null,
  /** 播音效。 */
  sfx(name, gap) { if (app.audio) app.audio.sfx(name, gap); },
  saveSettings() { store.save(SAVE_KEYS.settings, app.settings); },
  /** 讀到壞掉的存檔：提示玩家，讓玩家選擇要不要重設。每份存檔只問一次。 */
  reportCorrupt(name) {
    if (corruptReported[name]) return;
    corruptReported[name] = true;
    scenes.push(createOverlayMenu(app, {
      name: 'corrupt',
      title: t('save.corrupt', { name: t(`save.name.${name}`) }),
      items: [
        { id: 'corrupt-reset', label: t('save.corrupt.reset'), cls: 'red', action: () => { store.remove(SAVE_KEYS[name]); scenes.pop(); } },
        { id: 'corrupt-keep', label: t('save.corrupt.keep'), action: () => scenes.pop() },
      ],
      onEscape: () => scenes.pop(),
    }));
  },
  /** 路由表：名稱 → 函式 (app, 參數)。函式自己切換場景；回傳場景物件的話會被疊上去。 */
  routes: {},
  /** 依名稱前往場景。名稱可以帶參數，例如 'level:3'。 */
  go(name) {
    const [key, arg] = String(name).split(':');
    const route = app.routes[key];
    if (route) {
      const r = route(app, arg);
      if (r && r.name) scenes.push(r);
      if (r) return r;
    }
    return scenes.push(createPlaceholderScene(app, name));
  },
};

{
  const r = store.load(SAVE_KEYS.settings, SETTINGS_SPEC);
  app.settings = { ...SETTINGS_SPEC.defaults(), ...r.data };
  if (r.status === 'corrupt') store.remove(SAVE_KEYS.settings);
}
app.audio = createAudio(() => app.settings);
// 瀏覽器要求使用者互動後才能出聲
const wake = () => app.audio.resume();
window.addEventListener('pointerdown', wake);
window.addEventListener('keydown', wake);
document.addEventListener('visibilitychange', () => { if (document.hidden) app.audio.suspend(); else app.audio.resume(); });

app.routes.demo = (a) => createDemoScene(a);
// 自己切換場景的路由回傳 true；回傳場景物件的路由會被 go() 疊到最上層。
app.routes.menu = (a) => { scenes.reset(createMainMenuScene(a)); return true; };
app.routes.owner = (a) => { scenes.reset(createOwnerMenuScene(a)); return true; };
app.routes.settings = (a) => createSettingsScene(a);
app.routes.levels = (a) => { scenes.reset(createLevelSelectScene(a)); return true; };
app.routes.level = (a, arg) => {
  scenes.reset(createLevelSelectScene(a));
  return startLevel(a, Number(arg) || 1) ? true : null;
};

// ?scene=race 或 ?scene=race:賽道id：直接開一場賽車（自由遊玩）
app.routes.race = (a, arg) => createRaceScene(a, { track: TRACKS[arg] ? arg : 'itamae', level: 3 });

app.input = createInput(canvas, W, H, (evt) => scenes.input(evt));

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', layout);
layout();

// ---- 主迴圈 ----
// 場景自己決定固定步長（經營 50ms、小鋼珠 1/120 秒、賽車 1/60 秒）。這裡只給每個畫面的時間。
function isPortraitBlocked() {
  return window.matchMedia('(orientation: portrait) and (max-width: 600px)').matches;
}
startLoop((dt) => {
  if (isPortraitBlocked()) return; // 直向時暫停
  scenes.update(dt);
  scenes.render(ctx);
});

// ---- 起始場景 ----
if (params.scene === 'menu') scenes.push(createMainMenuScene(app));
else if (params.scene) { scenes.push(createMainMenuScene(app)); app.go(params.scene); }
else scenes.push(createTitleScene(app));

if (store.consumeUnavailableNotice()) toast(t('save.unavailable'), 6000);

// ---- 除錯介面 ----
// 每個場景可以提供 debug 物件：{ state(), step(n), act(a), useBot(name), mini() }
if (debug) {
  const call = (fn, ...args) => {
    const top = scenes.top();
    const d = top && top.debug;
    return d && d[fn] ? d[fn](...args) : null;
  };
  window.__sushi = {
    state: () => call('state'),
    scene: () => (scenes.top() ? scenes.top().name : ''),
    scenes: () => scenes.names(),
    step: (ticks) => call('step', ticks),
    act: (action) => call('act', action),
    useBot: (name) => call('useBot', name),
    mini: () => call('mini'),
    app,
  };
  document.documentElement.classList.add('debug');
}

export { app, createStepper };
