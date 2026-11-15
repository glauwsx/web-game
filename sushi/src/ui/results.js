// 結算畫面。
import { h } from './dom.js';
import { t } from '../data/strings.js';
import { yen } from './hud.js';

/**
 * 結算場景（蓋在經營畫面上）。
 * info = { state, result, title, newBest, buttons: [{ id, label, cls, action }] }
 */
export function createResultsScene(app, info) {
  const { state, result } = info;
  const d = state.day;
  const line = (label, value, cls = '') => h('div', { class: `res-line ${cls}` }, h('span', null, label), h('span', { class: 'res-num' }, value));
  const stars = [1, 2, 3].map((n) => h('span', { class: `res-star ${result.stars >= n ? 'on' : ''}`, dataset: { star: n } }, '★'));
  const root = h('div', { class: 'scene results-scene' },
    h('div', { class: 'panel results-panel solid' },
      h('h1', { class: `menu-title ${result.passed ? 'pass' : 'fail'}` }, info.title || t(result.passed ? 'result.title.pass' : 'result.title.fail')),
      info.showStars === false ? null : h('div', { class: 'res-stars', dataset: { stars: result.stars } }, stars),
      info.newBest ? h('div', { class: 'res-best' }, t('result.newBest')) : null,
      h('div', { class: 'res-cols' },
        h('div', { class: 'res-col' },
          line(t('result.revenue'), yen(result.revenue), 'big'),
          info.showTarget === false ? null : line(t(state.rival ? 'result.target.rival' : 'result.target.fixed'), yen(result.target), 'big'),
          line(t('result.sales'), yen(d.sales)),
          d.fees ? line(t('result.fees'), yen(d.fees)) : null,
          line(t('result.tips'), yen(d.tips)),
          d.bonus ? line(t('result.bonus'), yen(d.bonus)) : null,
          d.penalties ? line(t('result.penalties'), `−${yen(d.penalties)}`, 'neg') : null),
        h('div', { class: 'res-col' },
          line(t('result.purchases'), `−${yen(d.purchases)}`),
          line(t('result.wages'), `−${yen(d.wages)}`),
          (info.extraCosts || []).map((e) => line(e.label, `−${yen(e.value)}`)),
          line(t('result.profit'), yen(info.profit ?? result.profit), 'big'),
          line(t('result.served'), t('result.people', { n: d.served })),
          line(t('result.angry'), t('result.people', { n: d.angry })),
          line(t('result.rep'), `${Math.round(result.repStart)} → ${Math.round(result.reputation)}`))),
      info.showStars === false ? null : h('div', { class: 'res-rules' },
        h('div', { class: result.stars >= 1 ? 'on' : '' }, t('result.star1')),
        h('div', { class: result.stars >= 2 ? 'on' : '' }, t('result.star2')),
        h('div', { class: result.stars >= 3 ? 'on' : '' }, t('result.star3'))),
      info.extra || null,
      h('div', { class: 'menu-foot' }, info.buttons.map((b) => h('button', {
        class: `btn ${b.cls || 'plain'}`, dataset: { id: b.id }, onclick: () => { app.sfx('button'); b.action(); },
      }, b.label)))));
  return {
    name: 'results',
    overlay: true,
    root,
    enter() { app.sfx(result.passed ? 'win' : 'lose'); },
    input() { return true; },
  };
}
