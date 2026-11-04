// 依手把類型產生按鍵符號的 HTML。
import { GLYPHS, GLYPH_COLORS } from '../input/input.js';

export const ACTION_KEY = {
  shoot: 'left', pass: 'bottom', move: 'right', lob: 'top',
  steal: 'left', block: 'top', switch: 'bottom',
  sprint: 'rt', stance: 'lt', pause: 'start', confirm: 'bottom', back: 'right',
};

export function glyph(type, action) {
  const t = GLYPHS[type] ? type : 'xbox';
  const key = ACTION_KEY[action] || action;
  if (t === 'keyboard') {
    const map = { left: 'J', bottom: 'K', right: 'L', top: 'I', rt: 'Shift', lt: 'Space', start: 'Esc', confirm: 'Enter', back: 'Esc' };
    let label = map[key] || GLYPHS.keyboard[key] || key;
    if (action === 'confirm') label = 'Enter';
    if (action === 'back') label = 'Esc';
    return `<span class="glyph kb">${label}</span>`;
  }
  const label = GLYPHS[t][key] || key;
  const color = (GLYPH_COLORS[t] || {})[key] || '#cfd6e4';
  const wide = label.length > 1 && !['✕', '○', '□', '△'].includes(label);
  return `<span class="glyph${wide ? ' wide' : ''}" style="color:${color}">${label}</span>`;
}

export function stickGlyph(type) {
  if (type === 'keyboard') return '<span class="glyph kb">WASD</span>';
  return `<span class="glyph wide" style="color:#cfd6e4">${type === 'switch' ? 'L 搖桿' : '左搖桿'}</span>`;
}
