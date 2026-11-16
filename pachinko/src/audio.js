// 音效：全部用 Web Audio API 即時合成，沒有音檔。
export function createAudio() {
  let ctx = null;
  let muted = false;
  const last = {};
  const ensure = () => {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  function tone({ type = 'sine', f0, f1, dur = 0.1, vol = 0.1, at = 0 }) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise({ dur = 0.05, vol = 0.1, freq = 3000, at = 0 }) {
    const t = ctx.currentTime + at;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(ctx.destination); s.start(t);
  }
  const seq = (notes, step, o = {}) => notes.forEach((f, i) => tone({ type: 'square', f0: f, dur: step * 1.4, vol: 0.09, at: i * step, ...o }));
  const defs = {
    fire: [50, () => { noise({ dur: 0.04, vol: 0.12, freq: 2400 }); tone({ type: 'triangle', f0: 180, f1: 520, dur: 0.06, vol: 0.05 }); }],
    pin: [28, () => tone({ type: 'square', f0: 2400 + Math.random() * 1400, dur: 0.018, vol: 0.025 })],
    in: [40, () => { tone({ type: 'triangle', f0: 1318, dur: 0.07, vol: 0.14 }); tone({ type: 'triangle', f0: 1760, dur: 0.12, vol: 0.12, at: 0.06 }); }],
    heso: [40, () => seq([988, 1318, 1568], 0.05, { type: 'triangle', vol: 0.13 })],
    catch: [30, () => seq([1568, 2093], 0.04, { type: 'triangle', vol: 0.12 })],
    warp: [100, () => tone({ type: 'sine', f0: 500, f1: 1800, dur: 0.25, vol: 0.1 })],
    open: [60, () => tone({ type: 'square', f0: 660, f1: 990, dur: 0.07, vol: 0.06 })],
    close: [60, () => tone({ type: 'square', f0: 700, f1: 420, dur: 0.07, vol: 0.05 })],
    reach: [500, () => seq([523, 659, 784, 1047, 784, 1047, 1319], 0.09, { vol: 0.1 })],
    round: [200, () => seq([784, 1047, 1319], 0.07, { vol: 0.1 })],
    jackpot: [800, () => seq([784, 988, 1175, 1568, 1175, 1568, 2093, 1568, 2093, 2637], 0.1, { vol: 0.13 })],
    foul: [300, () => tone({ type: 'sawtooth', f0: 220, f1: 110, dur: 0.18, vol: 0.06 })],
    ui: [30, () => tone({ type: 'triangle', f0: 880, dur: 0.04, vol: 0.06 })],
  };
  return {
    unlock: ensure,
    setMuted(m) { muted = m; },
    play(name) {
      if (muted) return;
      const d = defs[name];
      if (!d || !ensure()) return;
      const now = performance.now();
      if (now - (last[name] || 0) < d[0]) return;
      last[name] = now;
      try { d[1](); } catch { /* 音效失敗不影響遊戲 */ }
    },
  };
}
