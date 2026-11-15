// 對話場景、教學提示框。
import { h } from './dom.js';
import { t } from '../data/strings.js';
import { portraitImg } from './panels.js';
import { CAST_NAME_KEYS, STAFF } from '../data/characters.js';

/** 對話時用的外觀：阿兩在店裡穿板前服。 */
function lookOf(who) {
  return STAFF[who] ? STAFF[who].look.replace('honda_apron', 'honda') : who;
}

/**
 * 對話場景（蓋在目前畫面上面）。
 * lines = [{ who, key, angry }]。講完或跳過後呼叫 onDone，然後自己離開。
 */
export function createDialogScene(app, lines, onDone) {
  let i = 0;
  const face = h('div', { class: 'dlg-face' });
  const name = h('div', { class: 'dlg-name' }, '');
  const text = h('div', { class: 'dlg-text' }, '');
  const finish = () => {
    app.scenes.pop();
    if (onDone) onDone();
  };
  const show = () => {
    const line = lines[i];
    face.replaceChildren(portraitImg(lookOf(line.who), 6, !!line.angry));
    name.textContent = t(CAST_NAME_KEYS[lookOf(line.who)] || `char.${line.who}`);
    text.textContent = t(line.key);
    app.sfx('talk');
  };
  const next = () => {
    i++;
    if (i >= lines.length) finish(); else show();
  };
  const root = h('div', { class: 'scene dialog-scene' },
    h('div', { class: 'dlg-shade solid', onclick: next }),
    h('div', { class: 'dlg-box solid', onclick: next },
      face,
      h('div', { class: 'dlg-main' }, name, text),
      h('div', { class: 'dlg-btns' },
        h('button', { class: 'btn plain', dataset: { id: 'dlg-skip' }, onclick: (e) => { e.stopPropagation(); finish(); } }, t('dialog.skip')),
        h('button', { class: 'btn red', dataset: { id: 'dlg-next' }, onclick: (e) => { e.stopPropagation(); next(); } }, t('dialog.next')))));
  return {
    name: 'dialog',
    overlay: true,
    root,
    enter() { if (!lines.length) { finish(); return; } show(); },
    input(evt) {
      if (evt.type === 'keydown' && !evt.repeat) {
        if (evt.code === 'Escape') finish(); else if (evt.code === 'Space' || evt.code === 'Enter') next();
        return true;
      }
      if (evt.type === 'pointerup') { next(); return true; }
      return true;
    },
  };
}

/**
 * 教學提示框：一步一步指向對應的按鈕。不擋住操作。
 * steps = [{ target: CSS 選擇器, key: 字串鍵, until: 條件名稱 }]
 * conditions = { 條件名稱: () => 布林 }。有 until 的步驟在條件成立時自動前進；沒有的要按「知道了」。
 */
export function createHints(container, steps, conditions, onDone) {
  let i = 0;
  let done = !steps || !steps.length;
  const text = h('div', { class: 'hint-text' }, '');
  const nextBtn = h('button', { class: 'btn red mini', dataset: { id: 'hint-next' }, onclick: () => advance() }, t('tut.next'));
  const box = h('div', { class: 'hint solid hidden' },
    text,
    h('div', { class: 'hint-btns' },
      h('button', { class: 'btn plain mini', dataset: { id: 'hint-skip' }, onclick: () => finish() }, t('tut.skip')),
      nextBtn));
  const ring = h('div', { class: 'hint-ring hidden' });
  container.appendChild(ring);
  container.appendChild(box);

  function finish() {
    done = true;
    box.classList.add('hidden');
    ring.classList.add('hidden');
    if (onDone) onDone();
  }
  function advance() {
    i++;
    if (i >= steps.length) finish(); else place(true);
  }
  function place(fresh) {
    if (done) return;
    const step = steps[i];
    const target = container.querySelector(step.target);
    const host = container.getBoundingClientRect();
    if (fresh) {
      text.textContent = t(step.key);
      nextBtn.classList.toggle('hidden', !!step.until);
    }
    box.classList.remove('hidden');
    if (!target || target.offsetParent === null) {
      ring.classList.add('hidden');
      box.style.left = `${host.width * 0.3}px`;
      box.style.top = `${host.height * 0.4}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    ring.classList.remove('hidden');
    ring.style.left = `${r.left - host.left - 4}px`;
    ring.style.top = `${r.top - host.top - 4}px`;
    ring.style.width = `${r.width + 8}px`;
    ring.style.height = `${r.height + 8}px`;
    // 提示框放在目標的左邊或下方，不超出畫面
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    // 目標在側邊面板裡：提示框放在面板左邊，不要蓋住面板
    const side = target.closest('.side');
    const anchorLeft = side ? side.getBoundingClientRect().left : r.left;
    let x = anchorLeft - host.left - bw - 12;
    let y = r.top - host.top + r.height / 2 - bh / 2;
    if (x < 8) { x = r.left - host.left + r.width / 2 - bw / 2; y = r.top - host.top + r.height + 12; }
    if (y + bh > host.height - 8) y = r.top - host.top - bh - 12;
    x = Math.max(8, Math.min(host.width - bw - 8, x));
    y = Math.max(8, Math.min(host.height - bh - 8, y));
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
  }
  if (!done) place(true);
  return {
    /** 每秒呼叫幾次：檢查條件、跟著目標移動。 */
    update() {
      if (done) return;
      const step = steps[i];
      if (step.until && conditions[step.until] && conditions[step.until]()) { advance(); return; }
      place(false);
    },
    isDone: () => done,
    skip: finish,
    index: () => i,
  };
}
