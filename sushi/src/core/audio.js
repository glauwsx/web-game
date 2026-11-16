// Web Audio 合成器：音效和音樂都即時合成，不使用音檔。
// 瀏覽器要求使用者互動後才能出聲，所以第一次點擊時才啟動。

export function createAudio(getSettings) {
  let ctx = null;
  let master = null;
  let sfxGain = null;
  let musicGain = null;
  let noiseBuf = null;
  const last = {};
  let engine = null; // 賽車的引擎聲 { osc, g }

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (e) {
      return false;
    }
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x3fffffff) - 1;
    }
    applyVolumes();
    return true;
  }

  function applyVolumes() {
    if (!ctx) return;
    const s = getSettings();
    sfxGain.gain.value = (s.sfx ?? 0.7) * 0.5;
    musicGain.gain.value = (s.music ?? 0.5) * 0.35;
  }

  /** 一個音：type 波形、f0 起始頻率、f1 結束頻率、dur 長度（秒）、vol 音量、at 延遲（秒）。 */
  function tone({ type = 'square', f0 = 440, f1 = null, dur = 0.1, vol = 0.3, at = 0, dest = null }) {
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.1, vol = 0.3, at = 0, freq = 2000, q = 1, type = 'bandpass' }) {
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const SFX = {
    button() { tone({ f0: 660, f1: 880, dur: 0.05, vol: 0.2 }); },
    deny() { tone({ type: 'sawtooth', f0: 180, f1: 120, dur: 0.14, vol: 0.2 }); },
    cash() { tone({ f0: 1320, dur: 0.06, vol: 0.2 }); tone({ f0: 1760, dur: 0.12, vol: 0.2, at: 0.06 }); },
    door() { tone({ type: 'triangle', f0: 880, dur: 0.12, vol: 0.2 }); tone({ type: 'triangle', f0: 660, dur: 0.18, vol: 0.18, at: 0.1 }); },
    done() { tone({ type: 'triangle', f0: 1046, f1: 1318, dur: 0.07, vol: 0.12 }); },
    angry() { tone({ type: 'sawtooth', f0: 220, f1: 110, dur: 0.25, vol: 0.2 }); },
    warning() { for (let i = 0; i < 3; i++) tone({ f0: 880, dur: 0.1, vol: 0.25, at: i * 0.16 }); },
    baka() { tone({ type: 'sawtooth', f0: 300, f1: 90, dur: 0.5, vol: 0.3 }); noise({ dur: 0.4, vol: 0.2, freq: 600 }); },
    kufu() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f0: f, dur: 0.16, vol: 0.25, at: i * 0.07 }));
      noise({ dur: 0.5, vol: 0.15, freq: 4000, at: 0.1 });
    },
    open() { [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.14, vol: 0.25, at: i * 0.1 })); },
    win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone({ f0: f, dur: 0.16, vol: 0.25, at: i * 0.12 })); },
    lose() { [392, 349, 311, 262].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.25, at: i * 0.2 })); },
    star() { tone({ f0: 1568, f1: 2093, dur: 0.2, vol: 0.25 }); },
    talk() { tone({ type: 'square', f0: 520, dur: 0.03, vol: 0.08 }); },
  };

  return {
    /** 使用者第一次互動時呼叫。 */
    resume() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    applyVolumes,
    /** 播一個音效。同一個音效在 minGapMs 內不重複播。 */
    sfx(name, minGapMs = 40) {
      if (!ctx || ctx.state !== 'running') return;
      const fn = SFX[name];
      if (!fn) return;
      const now = ctx.currentTime * 1000;
      if (last[name] && now - last[name] < minGapMs) return;
      last[name] = now;
      fn();
    },
    /**
     * 引擎聲（賽車）：持續的低音，音高跟速度連動。ratio 是速度比例（0 到 1.3），null 是關掉。
     */
    engine(ratio) {
      if (ratio === null || ratio === undefined) {
        if (engine) { engine.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); const e = engine; setTimeout(() => { try { e.osc.stop(); } catch (err) { /* 已經停了 */ } }, 300); engine = null; }
        return;
      }
      if (!ctx || ctx.state !== 'running') return;
      if (!engine) {
        const osc = ctx.createOscillator();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        f.type = 'lowpass';
        f.frequency.value = 900;
        g.gain.value = 0.0001;
        osc.connect(f); f.connect(g); g.connect(sfxGain);
        osc.start();
        engine = { osc, g };
      }
      const r = Math.max(0, Math.min(1.4, ratio));
      engine.osc.frequency.setTargetAtTime(55 + r * 140, ctx.currentTime, 0.05);
      engine.g.gain.setTargetAtTime(0.05 + r * 0.07, ctx.currentTime, 0.05);
    },
    /** 註冊更多音效（小遊戲用）。fn 會拿到 { tone, noise }。 */
    register(name, fn) { SFX[name] = () => fn({ tone, noise }); },
    get ctx() { return ctx; },
    get musicGain() { return musicGain; },
    tone(opts) { if (ctx && ctx.state === 'running') tone(opts); },
    noise(opts) { if (ctx && ctx.state === 'running') noise(opts); },
  };
}
