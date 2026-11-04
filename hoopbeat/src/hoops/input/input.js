// 輸入管理：鍵盤與手把（Gamepad API standard mapping），可隨時插拔，並辨識手把類型。

export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16 };

// 依手把 id 判斷類型
export function detectPadType(id = '') {
  const s = id.toLowerCase();
  if (/054c|dualsense|dualshock|playstation|ps4|ps5|sony/.test(s)) return 'ps';
  if (s.includes('wireless controller') && !/xbox|045e/.test(s)) return 'ps';
  if (/057e|nintendo|pro controller|joy-con|switch/.test(s)) return 'switch';
  if (/045e|xbox|xinput/.test(s)) return 'xbox';
  return 'generic';
}

export const PAD_NAMES = { xbox: 'Xbox 手把', ps: 'PlayStation 手把', switch: 'Switch Pro 手把', generic: '手把', keyboard: '鍵盤' };

// 各類型的按鍵符號。key 是動作在 standard mapping 的位置。
export const GLYPHS = {
  xbox: { bottom: 'A', right: 'B', left: 'X', top: 'Y', lt: 'LT', rt: 'RT', lb: 'LB', rb: 'RB', start: '☰', back: '⧉' },
  generic: { bottom: 'A', right: 'B', left: 'X', top: 'Y', lt: 'LT', rt: 'RT', lb: 'LB', rb: 'RB', start: 'START', back: 'BACK' },
  ps: { bottom: '✕', right: '○', left: '□', top: '△', lt: 'L2', rt: 'R2', lb: 'L1', rb: 'R1', start: 'OPTIONS', back: 'SHARE' },
  switch: { bottom: 'B', right: 'A', left: 'Y', top: 'X', lt: 'ZL', rt: 'ZR', lb: 'L', rb: 'R', start: '+', back: '−' },
  keyboard: { bottom: 'K', right: 'L', left: 'J', top: 'I', lt: 'Space', rt: 'Shift', lb: 'Q', rb: 'E', start: 'Esc', back: 'Tab' },
};
export const GLYPH_COLORS = {
  xbox: { bottom: '#5dc21e', right: '#e03a3e', left: '#2f7fe0', top: '#f2c029' },
  generic: { bottom: '#5dc21e', right: '#e03a3e', left: '#2f7fe0', top: '#f2c029' },
  ps: { bottom: '#7aa7e6', right: '#e8676b', left: '#d78fd8', top: '#4fc9a4' },
  switch: { bottom: '#d9d9d9', right: '#d9d9d9', left: '#d9d9d9', top: '#d9d9d9' },
  keyboard: { bottom: '#cfd6e4', right: '#cfd6e4', left: '#cfd6e4', top: '#cfd6e4' },
};

const DEADZONE = 0.22;

function shapeStick(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return [0, 0];
  const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
  return [x * k, y * k];
}

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.prevKeys = new Set();
    this.devices = new Map(); // id -> device
    this.listeners = [];
    this.lastActivity = 0;
    this.repeat = new Map();
    this.devices.set('kb', { id: 'kb', kind: 'keyboard', type: 'keyboard', name: '鍵盤', index: -1, connected: true });
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
      this.keys.add(e.code);
      this.lastActivity = performance.now();
      this.emitActivity();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('gamepadconnected', () => this.poll());
    window.addEventListener('gamepaddisconnected', () => this.poll());
    this.padState = new Map();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const fn of this.listeners) fn(type, data); }
  emitActivity() { this.emit('activity', {}); }

  // 每一幀呼叫一次
  poll() {
    let pads = [];
    try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []; } catch (e) { pads = []; }
    const seen = new Set();
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const id = `pad${gp.index}`;
      seen.add(id);
      let dev = this.devices.get(id);
      if (!dev || !dev.connected || dev.rawId !== gp.id) {
        const type = detectPadType(gp.id);
        dev = { id, kind: 'gamepad', type, name: PAD_NAMES[type], index: gp.index, connected: true, rawId: gp.id };
        this.devices.set(id, dev);
        this.emit('connected', dev);
      }
      const prev = this.padState.get(id);
      const buttons = [];
      for (let i = 0; i < 17; i++) {
        const b = gp.buttons[i];
        buttons.push(b ? (typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5) : false);
      }
      const ltv = gp.buttons[6] ? (gp.buttons[6].value ?? (gp.buttons[6].pressed ? 1 : 0)) : 0;
      const rtv = gp.buttons[7] ? (gp.buttons[7].value ?? (gp.buttons[7].pressed ? 1 : 0)) : 0;
      buttons[6] = buttons[6] || ltv > 0.3;
      buttons[7] = buttons[7] || rtv > 0.3;
      const axes = [gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[3] || 0];
      const state = { buttons, axes, prev: prev ? prev.buttons : buttons.map(() => false), prevAxes: prev ? prev.axes : [0, 0, 0, 0] };
      if (buttons.some((b, i) => b && !state.prev[i]) || Math.hypot(axes[0], axes[1]) > 0.5) {
        this.lastActivity = performance.now();
      }
      this.padState.set(id, state);
    }
    for (const [id, dev] of this.devices) {
      if (dev.kind === 'gamepad' && dev.connected && !seen.has(id)) {
        dev.connected = false;
        this.padState.delete(id);
        this.emit('disconnected', dev);
      }
    }
  }

  // 每幀結束時呼叫，更新上一幀狀態
  endFrame() {
    this.prevKeys = new Set(this.keys);
  }

  connectedDevices() {
    return [...this.devices.values()].filter((d) => d.connected);
  }

  keyDown(code) { return this.keys.has(code); }
  keyPressed(code) { return this.keys.has(code) && !this.prevKeys.has(code); }

  btn(id, i) {
    const s = this.padState.get(id);
    return !!(s && s.buttons[i]);
  }
  btnPressed(id, i) {
    const s = this.padState.get(id);
    return !!(s && s.buttons[i] && !s.prev[i]);
  }

  // 比賽輸入。kbScheme：'full'（WASD+方向鍵）
  gameInput(id) {
    const inp = {
      mx: 0, my: 0, sprint: false, stance: false,
      shoot: false, shootDown: false, pass: false, passDown: false,
      move: false, moveDown: false, lob: false, lobDown: false, pause: false,
      // HOOPBEAT: 戰術配樂（十字鍵／肩鍵／數字鍵），只記按下的瞬間
      dj: { up: false, down: false, left: false, right: false, prev: false, next: false, reset: false },
    };
    if (id === 'kb') {
      const k = (c) => this.keyDown(c);
      const kp = (c) => this.keyPressed(c);
      let x = 0, y = 0;
      if (k('KeyA') || k('ArrowLeft')) x -= 1;
      if (k('KeyD') || k('ArrowRight')) x += 1;
      if (k('KeyW') || k('ArrowUp')) y -= 1;
      if (k('KeyS') || k('ArrowDown')) y += 1;
      const m = Math.hypot(x, y);
      if (m > 0) { x /= m; y /= m; }
      inp.mx = x; inp.my = y;
      inp.sprint = k('ShiftLeft') || k('ShiftRight');
      inp.stance = k('Space');
      inp.shoot = k('KeyJ'); inp.shootDown = kp('KeyJ');
      inp.pass = k('KeyK'); inp.passDown = kp('KeyK');
      inp.move = k('KeyL'); inp.moveDown = kp('KeyL');
      inp.lob = k('KeyI'); inp.lobDown = kp('KeyI');
      inp.pause = kp('Escape') || kp('KeyP');
      // HOOPBEAT: 1～4 換戰術配樂、Q／E 換段落、R 回到原曲
      inp.dj = { up: kp('Digit1'), down: kp('Digit2'), left: kp('Digit3'), right: kp('Digit4'), prev: kp('KeyQ'), next: kp('KeyE'), reset: kp('KeyR') };
      return inp;
    }
    const s = this.padState.get(id);
    if (!s) return inp;
    // HOOPBEAT: 十字鍵不再控制移動，改成戰術配樂；LB／RB 換段落
    const [x, y] = shapeStick(s.axes[0], s.axes[1]);
    inp.mx = x; inp.my = y;
    const b = s.buttons, pv = s.prev;
    const pr = (i) => b[i] && !pv[i];
    inp.sprint = b[BTN.RT];
    inp.stance = b[BTN.LT];
    inp.dj = { up: pr(BTN.UP), down: pr(BTN.DOWN), left: pr(BTN.LEFT), right: pr(BTN.RIGHT), prev: pr(BTN.LB), next: pr(BTN.RB), reset: pr(BTN.BACK) || pr(BTN.RS) };
    inp.shoot = b[BTN.X]; inp.shootDown = pr(BTN.X);
    inp.pass = b[BTN.A]; inp.passDown = pr(BTN.A);
    inp.move = b[BTN.B]; inp.moveDown = pr(BTN.B);
    inp.lob = b[BTN.Y]; inp.lobDown = pr(BTN.Y);
    inp.pause = pr(BTN.START);
    return inp;
  }

  // 選單輸入（含方向鍵自動連發）
  menuInput(id) {
    const out = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, any: false };
    let dirs = { up: false, down: false, left: false, right: false };
    if (id === 'kb') {
      const kp = (c) => this.keyPressed(c);
      out.confirm = kp('Enter') || kp('Space') || kp('KeyJ') || kp('NumpadEnter');
      out.back = kp('Escape') || kp('Backspace');
      out.start = kp('Escape') || kp('KeyP');
      dirs = {
        up: this.keyDown('ArrowUp') || this.keyDown('KeyW'),
        down: this.keyDown('ArrowDown') || this.keyDown('KeyS'),
        left: this.keyDown('ArrowLeft') || this.keyDown('KeyA'),
        right: this.keyDown('ArrowRight') || this.keyDown('KeyD'),
      };
      out.any = this.keys.size > 0 && [...this.keys].some((k) => !this.prevKeys.has(k));
    } else {
      const s = this.padState.get(id);
      if (!s) return out;
      const b = s.buttons, pv = s.prev;
      const pr = (i) => b[i] && !pv[i];
      out.confirm = pr(BTN.A);
      out.back = pr(BTN.B);
      out.start = pr(BTN.START);
      const ax = s.axes[0], ay = s.axes[1];
      dirs = {
        up: b[BTN.UP] || ay < -0.6, down: b[BTN.DOWN] || ay > 0.6,
        left: b[BTN.LEFT] || ax < -0.6, right: b[BTN.RIGHT] || ax > 0.6,
      };
      out.any = b.some((v, i) => v && !pv[i]);
    }
    const now = performance.now();
    for (const d of ['up', 'down', 'left', 'right']) {
      const key = id + d;
      if (dirs[d]) {
        const r = this.repeat.get(key);
        if (!r) { out[d] = true; this.repeat.set(key, now + 380); }
        else if (now >= r) { out[d] = true; this.repeat.set(key, now + 120); }
      } else this.repeat.delete(key);
    }
    return out;
  }

  vibrate(id, strong = 0.5, weak = 0.5, ms = 120) {
    if (id === 'kb') return;
    try {
      const dev = this.devices.get(id);
      const gp = navigator.getGamepads()[dev.index];
      if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) {
        gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      }
    } catch (e) { /* 部分瀏覽器不支援震動 */ }
  }
}
