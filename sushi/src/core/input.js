// 滑鼠、觸控、鍵盤的統一介面。
// 指標事件會轉成畫布的邏輯座標（480×270）再送出。
// 事件格式：
//   { type: 'pointerdown' | 'pointermove' | 'pointerup', id, x, y, button, touch }
//   { type: 'wheel', x, y, dy }
//   { type: 'pinch', factor, x, y }      雙指縮放。factor > 1 是放大
//   { type: 'keydown' | 'keyup', code, key, repeat, shift }

export function createInput(canvas, logicalW, logicalH, emit) {
  const keys = Object.create(null);
  const pointers = new Map(); // id -> { x, y }
  let pinchDist = 0;

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * logicalW,
      y: ((e.clientY - r.top) / r.height) * logicalH,
    };
  }

  function pinchInfo() {
    const pts = [...pointers.values()];
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return { dist: Math.hypot(dx, dy), x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = toLogical(e);
    pointers.set(e.pointerId, p);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    if (pointers.size === 2) pinchDist = pinchInfo().dist;
    emit({ type: 'pointerdown', id: e.pointerId, x: p.x, y: p.y, button: e.button, touch: e.pointerType === 'touch' });
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const info = pinchInfo();
      if (pinchDist > 0 && info.dist > 0) {
        const factor = info.dist / pinchDist;
        if (factor > 1.25 || factor < 0.8) {
          emit({ type: 'pinch', factor, x: info.x, y: info.y });
          pinchDist = info.dist;
        }
      }
      return;
    }
    emit({ type: 'pointermove', id: e.pointerId, x: p.x, y: p.y, down: pointers.has(e.pointerId), touch: e.pointerType === 'touch' });
  });
  function up(e) {
    const p = toLogical(e);
    const had = pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (had) emit({ type: 'pointerup', id: e.pointerId, x: p.x, y: p.y, button: e.button, touch: e.pointerType === 'touch' });
  }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    const p = toLogical(e);
    emit({ type: 'wheel', x: p.x, y: p.y, dy: e.deltaY });
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    keys[e.code] = true;
    const handled = emit({ type: 'keydown', code: e.code, key: e.key, repeat: e.repeat, shift: e.shiftKey });
    if (handled || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    emit({ type: 'keyup', code: e.code, key: e.key, shift: e.shiftKey });
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    pointers.clear();
  });

  return {
    /** 某個鍵現在是不是按著。code 例如 'ArrowLeft'、'Space'、'KeyA'。 */
    isDown(code) { return !!keys[code]; },
    /** 任何一個鍵按著就回傳 true。 */
    anyDown(...codes) { return codes.some((c) => keys[c]); },
    /** 虛擬按鍵（觸控按鈕用）：直接設定某個鍵的狀態。 */
    setVirtual(code, down) { keys[code] = !!down; },
  };
}
