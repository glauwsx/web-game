// 關卡模式流程：關卡選擇 → 開場對話 → 準備 → 營業 → 打烊結算 → 評星。
import { h } from '../ui/dom.js';
import { t } from '../data/strings.js';
import { SAVE_KEYS } from '../core/save.js';
import { LEVEL_COUNT, getLevel, levelConfig } from '../data/levels.js';
import { createShopScene } from './shop-scene.js';
import './machines-ui.js';
import { createDialogScene } from '../ui/dialog.js';
import { createResultsScene } from '../ui/results.js';
import { drawBackdrop } from '../ui/menus.js';
import { yen } from '../ui/hud.js';

const LEVEL_SAVE = {
  version: 1,
  defaults: () => ({ version: 1, cleared: {} }),
  validate: (d) => d.cleared && typeof d.cleared === 'object',
};

export function loadLevelSave(app) {
  const r = app.store.load(SAVE_KEYS.levels, LEVEL_SAVE);
  if (r.status === 'corrupt') app.reportCorrupt('levels');
  return r.data;
}

/** 目前解鎖到第幾關。 */
export function unlockedLevel(save) {
  let n = 1;
  for (let i = 1; i <= LEVEL_COUNT; i++) if (save.cleared[i]) n = i + 1;
  return Math.min(LEVEL_COUNT, n);
}

/** 記錄過關成績。回傳是不是新紀錄。 */
export function recordLevel(app, id, result) {
  const save = loadLevelSave(app);
  const prev = save.cleared[id];
  let newBest = false;
  if (result.passed) {
    newBest = !prev || result.revenue > prev.best;
    save.cleared[id] = {
      stars: Math.max(prev ? prev.stars : 0, result.stars),
      best: Math.max(prev ? prev.best : 0, result.revenue),
    };
    app.store.save(SAVE_KEYS.levels, save);
  }
  return newBest;
}

export function createLevelSelectScene(app) {
  let time = 0;
  const grid = h('div', { class: 'level-grid' });
  function refresh() {
    const save = loadLevelSave(app);
    const unlocked = app.params.debug && app.params.unlockAll ? LEVEL_COUNT : unlockedLevel(save);
    grid.replaceChildren();
    for (let id = 1; id <= LEVEL_COUNT; id++) {
      const lv = getLevel(id);
      const rec = save.cleared[id];
      const locked = id > unlocked;
      const stars = rec ? rec.stars : 0;
      grid.appendChild(h('button', {
        class: `btn level-card ${locked || !lv ? 'locked' : ''} ${rec ? 'cleared' : ''}`,
        dataset: { level: id }, disabled: locked || !lv,
        onclick: () => { app.sfx('button'); startLevel(app, id); },
      },
      h('div', { class: 'level-num' }, t('level.n', { n: id })),
      h('div', { class: 'level-name' }, t(`level.${id}.name`)),
      h('div', { class: 'level-stars' }, !lv ? t('levels.soon') : locked ? t('levels.locked') : [1, 2, 3].map((n) => h('span', { class: stars >= n ? 'on' : '' }, '★'))),
      rec ? h('div', { class: 'level-best' }, t('levels.best', { n: rec.best.toLocaleString('en-US') })) : null));
    }
  }
  const back = () => app.go('owner');
  const root = h('div', { class: 'scene menu-scene' },
    h('div', { class: 'panel menu-panel levels-panel solid' },
      h('h1', { class: 'menu-title' }, t('levels.title')),
      grid,
      h('div', { class: 'menu-foot' }, h('button', { class: 'btn plain', dataset: { id: 'back' }, onclick: () => { app.sfx('button'); back(); } }, t('menu.back')))));
  return {
    name: 'levels',
    root,
    enter: refresh,
    resume: refresh,
    update(dt) { time += dt; },
    render(ctx) {
      drawBackdrop(ctx, app.W, app.H, time);
      ctx.fillStyle = 'rgba(20, 12, 8, 0.55)';
      ctx.fillRect(0, 0, app.W, app.H);
    },
    input(evt) { if (evt.type === 'keydown' && evt.code === 'Escape') { back(); return true; } return false; },
  };
}

/** 選出結算對話。第 10 關有三種結局（階段 6）。 */
function outroLines(lv, state, result) {
  if (lv.endings) return lv.endings(state, result);
  return result.passed ? lv.pass : lv.fail;
}

/** 開始一關。會把經營畫面疊到目前的場景上面。 */
export function startLevel(app, id, replace = false) {
  const lv = getLevel(id);
  if (!lv) return null;
  const seed = app.params.seed ?? ((Date.now() ^ (id * 7919)) >>> 0);
  const goalText = t(lv.goal.kind === 'fixed' ? 'level.goal.fixed' : 'level.goal.rival', { n: lv.goal.target.toLocaleString('en-US') });
  const leave = () => {
    // 回到關卡選擇：把關卡畫面和它上面的東西都拿掉
    while (app.scenes.depth() > 0 && app.scenes.top().name !== 'levels') {
      if (app.scenes.depth() === 1) { app.scenes.reset(createLevelSelectScene(app)); return; }
      app.scenes.pop();
    }
  };
  const restart = (levelId) => {
    while (app.scenes.depth() > 1 && app.scenes.top().name !== 'level') app.scenes.pop();
    startLevel(app, levelId, app.scenes.top().name === 'level');
  };
  const scene = createShopScene(app, {
    name: 'level',
    cfg: levelConfig(id, seed),
    title: `${t('level.n', { n: id })}　${t(`level.${id}.name`)}`,
    tutorial: app.params.noHints ? null : lv.tutorial,
    hints: app.params.noHints ? null : lv.hints,
    pauseItems: () => [
      { id: 'restart', label: t('pause.restart'), action: () => restart(id) },
      { id: 'quit', label: t('pause.quit'), action: leave },
    ],
    onClosed(state) {
      const result = state.result;
      const newBest = recordLevel(app, id, result);
      const showResults = () => {
        const buttons = [];
        if (result.passed && getLevel(id + 1)) buttons.push({ id: 'next', label: t('result.next'), cls: 'red', action: () => restart(id + 1) });
        buttons.push({ id: 'retry', label: t('result.retry'), action: () => restart(id) });
        buttons.push({ id: 'back', label: t('result.back'), action: leave });
        app.scenes.push(createResultsScene(app, { state, result, newBest, buttons }));
      };
      app.scenes.push(createDialogScene(app, outroLines(lv, state, result) || [], showResults));
    },
  });
  scene.levelId = id;
  if (replace) app.scenes.replace(scene); else app.scenes.push(scene);
  const intro = (lv.intro || []).concat([]);
  if (intro.length && !app.params.noIntro) {
    app.scenes.push(createDialogScene(app, intro, () => {}));
  }
  scene.goalText = goalText;
  return scene;
}

export { yen };
