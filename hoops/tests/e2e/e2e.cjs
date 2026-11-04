// Playwright 端對端測試：
//  1. 頁面載入沒有 console 錯誤
//  2. 模擬 navigator.getGamepads 送輸入：選單操作、移動、傳球、投籃、抄截、換人、按鍵符號
//  3. 電腦對電腦加速跑完整比賽（預設 3 場），檢查分數、NaN、卡球、進攻時限
//  4. 在不同時刻截圖存到 hoops/screenshots/
// 用法：node hoops/tests/e2e/e2e.cjs [--games 3] [--only load,gamepad,ai,shots]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const ROOT = path.resolve(__dirname, '../..');
const SHOTS = path.join(ROOT, 'screenshots');
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const GAMES = +argVal('--games', 3);
const ONLY = (argVal('--only', 'load,gamepad,ai,shots')).split(',');

const XBOX_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const PS_ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const SWITCH_ID = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

function freePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

const MOCK_PADS = `(() => {
  const pads = [null, null, null, null];
  const mk = (index, id) => ({ id, index, connected: true, mapping: 'standard', timestamp: performance.now(),
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: null });
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads.slice() });
  window.__pad = {
    connect(i, id) { pads[i] = mk(i, id); const e = new Event('gamepadconnected'); e.gamepad = pads[i]; window.dispatchEvent(e); },
    disconnect(i) { const gp = pads[i]; pads[i] = null; const e = new Event('gamepaddisconnected'); e.gamepad = gp; window.dispatchEvent(e); },
    button(i, b, on) { const gp = pads[i]; gp.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; gp.timestamp = performance.now(); },
    axes(i, x, y) { const gp = pads[i]; gp.axes[0] = x; gp.axes[1] = y; gp.timestamp = performance.now(); },
  };
})();`;

async function newPage(browser, port, viewport = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript(MOCK_PADS);
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.__hoops && window.__hoops.game, null, { timeout: 20000 });
  return { page, errors };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tapPad(page, i, b, hold = 320, after = 300) {
  await page.evaluate(([i, b]) => window.__pad.button(i, b, true), [i, b]);
  await sleep(hold);
  await page.evaluate(([i, b]) => window.__pad.button(i, b, false), [i, b]);
  await sleep(after);
}

// 按下按鈕直到畫面切換（軟體繪圖很慢時單次按鍵可能被漏掉）
async function tapUntil(page, i, b, screen, tries = 5) {
  for (let k = 0; k < tries; k++) {
    await tapPad(page, i, b);
    for (let w = 0; w < 6; w++) {
      if ((await page.evaluate(() => window.__hoops.screen())) === screen) return true;
      await sleep(150);
    }
  }
  return false;
}

async function waitFor(page, fn, arg, timeout = 15000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 50 });
}

// ---------------- 1. 載入 ----------------
async function testLoad(browser, port) {
  const { page, errors } = await newPage(browser, port);
  await sleep(4000);
  const info = await page.evaluate(() => ({ screen: window.__hoops.screen(), errs: window.__hoops.errors.length, phase: window.__hoops.state().phase }));
  record('頁面載入沒有 console 錯誤', errors.length === 0 && info.errs === 0, errors.length ? errors.slice(0, 3).join(' | ') : `畫面=${info.screen}，背景示範賽=${info.phase}`);
  record('一開始顯示標題畫面', info.screen === 'title', info.screen);
  await page.close();
}

// ---------------- 2. 手把輸入 ----------------
async function testGamepad(browser, port) {
  const { page, errors } = await newPage(browser, port);
  await sleep(800);
  await page.evaluate(([a, b]) => { window.__pad.connect(0, a); window.__pad.connect(1, b); }, [XBOX_ID, PS_ID]);
  await sleep(500);
  const devs = await page.evaluate(() => window.__hoops.app.input.connectedDevices().map((d) => d.type));
  record('偵測 Xbox 與 PlayStation 手把類型', devs.includes('xbox') && devs.includes('ps'), devs.join(','));

  // 用手把走選單
  const okMenu = await tapUntil(page, 0, 0, 'menu');
  await tapUntil(page, 0, 0, 'teams');
  await tapPad(page, 0, 13); await tapPad(page, 0, 13);
  const okCtrl = await tapUntil(page, 0, 0, 'controllers');
  // 鍵盤移到電腦欄，Xbox 到主隊，PS 到客隊
  await page.keyboard.down('ArrowRight'); await sleep(320); await page.keyboard.up('ArrowRight'); await sleep(300);
  await tapPad(page, 0, 14);
  await tapPad(page, 1, 15);
  const assign = await page.evaluate(() => Object.fromEntries(window.__hoops.app.assign));
  await tapUntil(page, 0, 0, 'settings'); // -> 設定
  await tapUntil(page, 0, 0, ''); // 跳球開賽
  await sleep(500);
  const humans = await page.evaluate(() => window.__hoops.game.humans.map((h) => `${h.label}:${h.id}:${h.team}`));
  record('手把操作選單（標題→選隊→分配→開賽）', okMenu && okCtrl && humans.length === 2, `assign=${JSON.stringify(assign)} humans=${humans.join(' ')}`);

  // 按鍵符號跟手把類型一致
  await sleep(1500);
  const hints = await page.evaluate(() => [...document.querySelectorAll('#hints .hint-box')].map((d) => d.innerText.replace(/\s+/g, ' ')));
  const p1 = hints.find((t) => t.includes('1P')) || '';
  const p2 = hints.find((t) => t.includes('2P')) || '';
  const xboxOk = /\bX\b/.test(p1) || /\bA\b/.test(p1) || /\bY\b/.test(p1);
  const psOk = /[✕○□△]/.test(p2);
  record('畫面按鍵提示跟手把類型一致（Xbox 字母、PS 符號）', xboxOk && psOk && !/[✕○□△]/.test(p1), `1P「${p1}」 2P「${p2}」`);

  // 關掉繪圖讓模擬以正常速度跑
  await page.evaluate(() => {
    window.__ev = [];
    window.__hoops.addStepHook((g) => { for (const e of g.events) window.__ev.push({ type: e.type, player: e.player ? e.player.name : null }); });
    window.__hoops.setRender(false);
  });
  await waitFor(page, () => window.__hoops.state().phase === 'live', null, 20000);
  await sleep(1500); // 等跳球的人落地

  // 移動
  await page.evaluate(() => window.__hoops.giveBallToOpponent('1P'));
  await page.evaluate(() => { const g = window.__hoops.game; g.ball.holder.pos.x = 0; g.ball.holder.pos.z = -5; });
  await sleep(100);
  const before = await page.evaluate(() => window.__hoops.humanPlayer('1P'));
  await page.evaluate(() => window.__pad.axes(0, 1, 0));
  await sleep(900);
  await page.evaluate(() => window.__pad.axes(0, 0, 0));
  const after = await page.evaluate(() => window.__hoops.humanPlayer('1P'));
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  record('左搖桿移動球員', after.name === before.name && after.x - before.x > 1.0, `${before.name} 移動 ${moved.toFixed(2)} 公尺（x ${before.x.toFixed(1)}→${after.x.toFixed(1)}）`);

  // 傳球
  const holder = await page.evaluate(() => window.__hoops.giveBallToHuman('1P'));
  await sleep(150);
  await page.evaluate(() => { window.__ev.length = 0; });
  await tapPad(page, 0, 0, 200, 600);
  const passEv = await page.evaluate((n) => window.__ev.filter((e) => e.type === 'pass' && e.player === n).length, holder);
  record('✕/A 傳球', passEv > 0, `${holder} 傳球事件 ${passEv} 次`);

  // 投籃（按住再放開）
  const shooter = await page.evaluate(() => window.__hoops.giveBallToHuman('1P'));
  await page.evaluate(() => { const g = window.__hoops.game; const p = g.humans[0].player; p.pos.x = g.attackSide(p.team) * 6.5; p.pos.z = 1; for (const o of g.onCourt(1 - p.team)) { o.pos.z = -6; } });
  await sleep(150);
  const fga0 = await page.evaluate(() => window.__hoops.humanPlayer('1P').fga);
  await page.evaluate(() => { window.__ev.length = 0; });
  await tapPad(page, 0, 2, 380, 900);
  const shot = await page.evaluate((n) => window.__ev.filter((e) => e.type === 'shot' && e.player === n).length, shooter);
  const fga1 = await page.evaluate(() => window.__hoops.humanPlayer('1P').fga);
  const meterSeen = await page.evaluate(() => window.__ev.some((e) => e.type === 'shotStart'));
  record('□/X 按住起跳、放開投籃', shot > 0 && fga1 === fga0 + 1 && meterSeen, `出手事件 ${shot} 次，出手數 ${fga0}→${fga1}`);

  // 抄截（等球員可以動作再按；最多試 3 次）
  await sleep(1200);
  let stealTry = [], me = '', victim = '', diag = '';
  for (let k = 0; k < 3 && !stealTry.includes(me || '?'); k++) {
    victim = await page.evaluate(() => window.__hoops.giveBallToOpponent('1P'));
    try { await waitFor(page, () => { const p = window.__hoops.game.humans[0].player; return !p.action && !p.airborne && p.stealCooldown <= 0; }, null, 2000); } catch (e) { /* 下面記錄狀態 */ }
    diag = JSON.stringify(await page.evaluate(() => { const g = window.__hoops.game; const p = g.humans[0].player; return { ph: g.phase, act: p.action && p.action.type, air: p.airborne, cd: +p.stealCooldown.toFixed(2) }; }));
    await page.evaluate(() => { window.__ev.length = 0; });
    await tapPad(page, 0, 2, 150, 500);
    stealTry = await page.evaluate(() => window.__ev.filter((e) => e.type === 'stealTry').map((e) => e.player));
    me = await page.evaluate(() => window.__hoops.humanPlayer('1P').name);
  }
  record('防守時 □/X 抄截', stealTry.includes(me), `${me} 對 ${victim} 出手抄截：${stealTry.join(',') || '無'}（按下前狀態 ${diag}）`);

  // 防守換人
  await page.evaluate(() => window.__hoops.giveBallToOpponent('1P'));
  await page.evaluate(() => { const g = window.__hoops.game; const h = g.humans[0]; h.player.pos.x = g.ball.holder.pos.x + 9 * Math.sign(-g.ball.holder.pos.x || 1); });
  await sleep(100);
  const sw0 = await page.evaluate(() => window.__hoops.humanPlayer('1P').name);
  await tapPad(page, 0, 0, 150, 400);
  const sw1 = await page.evaluate(() => window.__hoops.humanPlayer('1P').name);
  record('防守時 ✕/A 切換到離球最近的球員', sw0 !== sw1, `${sw0} → ${sw1}`);

  // 2P（PS 手把）蓋火鍋起跳
  await page.evaluate(() => window.__hoops.giveBallToOpponent('2P'));
  await sleep(100);
  await page.evaluate(() => { window.__ev.length = 0; });
  await tapPad(page, 1, 3, 150, 300);
  const jumps = await page.evaluate(() => window.__ev.filter((e) => e.type === 'jump').map((e) => e.player));
  const p2name = await page.evaluate(() => window.__hoops.humanPlayer('2P').name);
  record('2P 用 △ 起跳蓋火鍋', jumps.includes(p2name), `${p2name} 起跳`);

  // 拔掉手把會暫停，換 Switch 手把插回仍可辨識
  await page.evaluate(() => window.__pad.disconnect(1));
  await sleep(400);
  const paused = await page.evaluate(() => ({ scr: window.__hoops.screen(), paused: window.__hoops.app.paused }));
  await page.evaluate((id) => window.__pad.connect(2, id), SWITCH_ID);
  await sleep(400);
  const swType = await page.evaluate(() => window.__hoops.app.input.connectedDevices().map((d) => d.type));
  record('比賽中拔掉手把會自動暫停，插上 Switch Pro 手把可辨識', paused.paused && paused.scr === 'pause' && swType.includes('switch'), `screen=${paused.scr} types=${swType.join(',')}`);

  record('手把測試過程沒有 console 錯誤', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ---------------- 3. 電腦對電腦 ----------------
const MONITOR = `(() => {
  const m = window.__mon = { steps: 0, nan: 0, maxLoose: 0, looseT: 0, resets: 0, prevShot: 24, poss: 0, prevPoss: -2,
    scoreInc: 0, prevTotal: 0, maxNonLive: 0, phaseT: 0, lastPhase: '', heldT: 0, maxHeld: 0, lastHolder: null, periods: 0 };
  window.__hoops.clearStepHooks();
  window.__hoops.addStepHook((g) => {
    m.steps++;
    for (const p of g.everyoneOnCourt()) if (!Number.isFinite(p.pos.x + p.pos.z + p.y)) m.nan++;
    const b = g.ball;
    if (!Number.isFinite(b.pos.x + b.pos.y + b.pos.z)) m.nan++;
    if (g.phase === 'live' && b.state !== 'held') { m.looseT += 1 / 60; m.maxLoose = Math.max(m.maxLoose, m.looseT); } else m.looseT = 0;
    if (g.phase === 'live' && b.holder && b.holder === m.lastHolder) { m.heldT += 1 / 60; m.maxHeld = Math.max(m.maxHeld, m.heldT); } else { m.heldT = 0; m.lastHolder = b.holder; }
    const sc = g.rules.shotClock;
    if (sc > m.prevShot + 0.5) m.resets++;
    m.prevShot = sc;
    if (g.rules.possession !== m.prevPoss) { m.poss++; m.prevPoss = g.rules.possession; }
    const tot = g.rules.score[0] + g.rules.score[1];
    if (tot > m.prevTotal) { m.scoreInc++; m.prevTotal = tot; }
    if (g.phase !== m.lastPhase) { if (g.phase === 'periodBreak' || g.phase === 'gameOver') m.periods++; m.lastPhase = g.phase; m.phaseT = 0; }
    else { m.phaseT += 1 / 60; if (!['live', 'periodBreak', 'gameOver'].includes(g.phase)) m.maxNonLive = Math.max(m.maxNonLive, m.phaseT); }
  });
})();`;

async function testAI(browser, port) {
  const { page, errors } = await newPage(browser, port, { width: 960, height: 540 });
  const teams = ['owls', 'rhinos', 'rays', 'leopards', 'scorpions', 'frogs'];
  for (let i = 0; i < GAMES; i++) {
    const home = teams[(i * 2) % 6], away = teams[(i * 2 + 1) % 6];
    await page.evaluate(([home, away, seed]) => {
      window.__hoops.startMatch({ cpuOnly: true, home, away, quarterMinutes: 2, autoContinue: true, seed });
    }, [home, away, 2024 + i]);
    await page.evaluate(MONITOR); // 新比賽開始後才裝監看，避免讀到上一場的分數
    await page.evaluate(() => { window.__hoops.setRender(false); window.__hoops.setTimeScale(40); });
    const t0 = Date.now();
    try {
      await waitFor(page, () => window.__hoops.game.phase === 'gameOver', null, 300000);
    } catch (e) { /* 逾時在下面回報 */ }
    const r = await page.evaluate(() => {
      const g = window.__hoops.game;
      const m = window.__mon;
      const pts = (t) => g.teams[t].players.reduce((a, p) => a + p.stats.pts, 0);
      return { phase: g.phase, score: g.rules.score, period: g.rules.period, m, statPts: [pts(0), pts(1)], simMin: (m.steps / 3600).toFixed(1) };
    });
    const m = r.m;
    const ok = r.phase === 'gameOver' && m.scoreInc >= 10 && m.nan === 0 && m.maxLoose < 8 && m.resets >= 10 && m.maxNonLive < 10 && r.statPts[0] === r.score[0] && r.statPts[1] === r.score[1];
    record(`電腦對電腦第 ${i + 1} 場（${home} vs ${away}）`, ok,
      `比分 ${r.score[0]}:${r.score[1]}，打到第 ${r.period} 節，得分次數 ${m.scoreInc}，NaN ${m.nan}，最長無人持球 ${m.maxLoose.toFixed(1)} 秒，最長單人持球 ${m.maxHeld.toFixed(1)} 秒，進攻時限重設 ${m.resets} 次，球權變換 ${m.poss} 次，最長死球階段 ${m.maxNonLive.toFixed(1)} 秒，模擬 ${r.simMin} 分鐘，實際 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
    await page.evaluate(() => window.__hoops.setTimeScale(1));
  }
  record('電腦對戰過程沒有 console 錯誤', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ---------------- 4. 截圖 ----------------
async function testShots(browser, port) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { page, errors } = await newPage(browser, port, { width: 1600, height: 900 });
  const snap = async (name) => { await page.screenshot({ path: path.join(SHOTS, name) }); return name; };
  const shots = [];
  await sleep(3500);
  shots.push(await snap('01-title.png'));
  await page.evaluate(([a, b]) => { window.__pad.connect(0, a); window.__pad.connect(1, b); }, [XBOX_ID, PS_ID]);
  await sleep(400);
  await tapUntil(page, 0, 0, 'menu');
  await tapUntil(page, 0, 0, 'teams');
  await tapPad(page, 0, 15);
  await sleep(600);
  shots.push(await snap('02-team-select.png'));
  await tapPad(page, 0, 13); await tapPad(page, 0, 13);
  await tapUntil(page, 0, 0, 'controllers');
  await page.keyboard.down('ArrowRight'); await sleep(320); await page.keyboard.up('ArrowRight'); await sleep(300);
  await tapPad(page, 0, 14); await tapPad(page, 1, 15);
  await sleep(500);
  shots.push(await snap('03-controllers.png'));
  await tapUntil(page, 0, 0, 'settings');
  await tapUntil(page, 0, 0, '');
  await sleep(1800);
  shots.push(await snap('04-tipoff.png'));
  await page.evaluate(() => window.__hoops.setRender(false));
  await waitFor(page, () => window.__hoops.state().phase === 'live', null, 20000);
  await sleep(5000);
  await page.evaluate(() => {
    window.__hoops.giveBallToHuman('1P');
    const g = window.__hoops.game; const p = g.humans[0].player;
    p.pos.x = g.attackSide(p.team) * 5.5; p.pos.z = 2.5;
    window.__hoops.setRender(true);
  });
  await sleep(1500);
  shots.push(await snap('05-offense-pass-target.png'));
  // 跳投時機條
  await page.evaluate(() => window.__pad.button(0, 2, true));
  await sleep(900);
  shots.push(await snap('06-jumpshot-meter.png'));
  await page.evaluate(() => window.__pad.button(0, 2, false));
  await sleep(1600);
  shots.push(await snap('07-ball-in-flight.png'));
  // 防守
  await page.evaluate(() => window.__hoops.giveBallToOpponent('1P'));
  await page.evaluate(() => window.__pad.button(0, 6, true));
  await sleep(1500);
  shots.push(await snap('08-defense-stance.png'));
  await page.evaluate(() => window.__pad.button(0, 6, false));
  // 罰球
  await page.evaluate(() => { const g = window.__hoops.game; g.setupFreeThrows(g.humans[0].player, 2); });
  await sleep(2200);
  shots.push(await snap('09-free-throw.png'));
  // 暫停
  await tapUntil(page, 0, 9, 'pause');
  await sleep(500);
  shots.push(await snap('10-pause-menu.png'));
  await tapUntil(page, 0, 1, '');
  // 換節：玩家交給電腦控制，加速把第一節打完
  await page.evaluate(() => { window.__hoops.releaseHumans(); window.__hoops.setRender(false); window.__hoops.setTimeScale(40); });
  await waitFor(page, () => window.__hoops.screen() === 'break', null, 120000);
  await page.evaluate(() => { window.__hoops.setTimeScale(1); window.__hoops.setRender(true); });
  await sleep(1200);
  shots.push(await snap('11-quarter-break.png'));
  // 加速打完整場
  await page.evaluate(() => { window.__hoops.setRender(false); window.__hoops.setTimeScale(40); });
  for (let k = 0; k < 400; k++) {
    const st = await page.evaluate(() => ({ ph: window.__hoops.game.phase, scr: window.__hoops.screen() }));
    if (st.scr === 'results') break;
    if (st.ph === 'periodBreak') await page.evaluate(() => window.__hoops.continueBreak());
    await sleep(300);
  }
  await page.evaluate(() => { window.__hoops.setTimeScale(1); window.__hoops.setRender(true); });
  await waitFor(page, () => window.__hoops.screen() === 'results', null, 30000);
  await sleep(1200);
  shots.push(await snap('12-box-score.png'));
  // 說明（PS 頁籤）
  await page.evaluate(() => window.__hoops.app.go('help', { back: 'menu' }));
  await sleep(300);
  await tapPad(page, 1, 15, 320, 500);
  shots.push(await snap('13-help-controls.png'));
  record(`截圖 ${shots.length} 張`, shots.length >= 6, shots.join(', '));
  record('截圖過程沒有 console 錯誤', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  const port = await freePort();
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(800);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    if (ONLY.includes('load')) await testLoad(browser, port);
    if (ONLY.includes('gamepad')) await testGamepad(browser, port);
    if (ONLY.includes('ai')) await testAI(browser, port);
    if (ONLY.includes('shots')) await testShots(browser, port);
  } catch (err) {
    record('測試執行', false, String(err && err.stack || err));
  } finally {
    await browser.close();
    server.kill();
  }
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n結果：${results.length - fail}/${results.length} 通過`);
  process.exit(fail ? 1 : 0);
})();
