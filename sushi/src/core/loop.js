// 固定步長主迴圈。
// createStepper 是純邏輯（Node.js 可測）。startLoop 才用到瀏覽器的 requestAnimationFrame。

/**
 * 固定步長累加器。
 * advance(dtMs, fn) 會呼叫 fn 零次或多次，回傳內插比例 alpha（0 到 1）。
 */
export function createStepper(stepMs, maxStepsPerFrame = 240) {
  let acc = 0;
  return {
    stepMs,
    advance(dtMs, fn) {
      acc += dtMs;
      let n = 0;
      while (acc >= stepMs && n < maxStepsPerFrame) {
        fn();
        acc -= stepMs;
        n++;
      }
      if (n === maxStepsPerFrame) acc = 0; // 落後太多就丟掉，避免越追越慢
      return acc / stepMs;
    },
    reset() { acc = 0; },
  };
}

/**
 * 啟動畫面迴圈。frame(dtMs) 每個畫面呼叫一次。
 * 分頁在背景時不呼叫 frame，回到前景時不補時間。
 */
export function startLoop(frame, { maxDtMs = 100 } = {}) {
  let last = 0;
  let running = true;
  let handle = 0;
  function tick(now) {
    if (!running) return;
    handle = requestAnimationFrame(tick);
    if (document.hidden) { last = 0; return; }
    const dt = last ? Math.min(maxDtMs, now - last) : 0;
    last = now;
    frame(dt);
  }
  document.addEventListener('visibilitychange', () => { last = 0; });
  handle = requestAnimationFrame(tick);
  return {
    stop() { running = false; cancelAnimationFrame(handle); },
  };
}
