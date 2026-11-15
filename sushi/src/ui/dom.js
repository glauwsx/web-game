// 建立 DOM 節點的小工具。
// h('div', { class: 'a', onclick: fn }, '文字', 子節點...)

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** 顯示一則幾秒後自動消失的通知。 */
export function toast(text, ms = 4000) {
  let box = document.getElementById('toasts');
  if (!box) return;
  const el = h('div', { class: 'toast' }, text);
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); }, ms);
  setTimeout(() => { el.remove(); }, ms + 400);
}
