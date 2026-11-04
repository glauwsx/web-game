// 端對端測試（Playwright 無頭瀏覽器）：
//   1. 頁面載入時 console 沒有錯誤（電腦和手機尺寸都檢查）
//   2. 用介面生成片段、點片段播放、錄音、排出三個段落、匯出 WAV
//   3. 檢查 WAV：長度符合小節數、峰值低於 0 dBFS、不是靜音、每一軌都有聲音
//   4. 存截圖到 screenshots/
// 用法：node tests/e2e.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';
import { startServer } from './serve.mjs';
import { decodeWav, analyzeChannels } from '../src/wav.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let failed = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const TRACKS = ['drums', 'bass', 'chords', 'lead', 'fx'];
const { server, port } = await startServer();
const URL_ = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

function watchConsole(page, bucket) {
  page.on('console', (m) => { if (m.type() === 'error') bucket.push(m.text()); });
  page.on('pageerror', (e) => bucket.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => bucket.push(`requestfailed: ${r.url()}`));
}

try {
  // ───────── 電腦尺寸：完整流程 ─────────
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  watchConsole(page, errors);
  page.on('dialog', (d) => d.accept());
  await page.goto(URL_);
  await page.waitForTimeout(1200);
  check('電腦：頁面載入時 console 沒有錯誤', errors.length === 0, errors.join(' | '));
  const external = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => !n.startsWith(location.origin) && !n.startsWith('data:') && !n.startsWith('blob:')));
  check('沒有從外部（CDN）載入任何東西', external.length === 0, external.join(', '));
  await page.screenshot({ path: path.join(SHOTS, 'desktop-help.png') });
  await page.click('#help .btn');

  // 生成片段：選曲風、輸入種子、按「生成新片段」
  await page.click('.chip[data-genre="house"]');
  await page.fill('#seed-input', '4242');
  await page.click('#btn-generate');
  const bank1 = await page.evaluate(() => JSON.stringify(window.__loops.state.bank));
  const b1 = JSON.parse(bank1);
  check('生成：曲風與種子正確', b1.genre === 'house' && b1.seed === '4242', `${b1.genre} #${b1.seed} ${b1.bpm} BPM`);
  check('生成：每軌 6–8 段', TRACKS.every((t) => b1.tracks[t].length >= 6 && b1.tracks[t].length <= 8));
  check('生成：畫面顯示種子', (await page.inputValue('#seed-input')) === '4242');
  const cellCount = await page.locator('.cell').count();
  check('生成：格子數量 = 軌道 × 片段', cellCount === TRACKS.reduce((n, t) => n + b1.tracks[t].length, 0), `${cellCount} 格`);
  // 換別的種子再換回來，結果要一樣
  await page.click('#btn-dice');
  await page.fill('#seed-input', '4242');
  await page.click('#btn-generate');
  const bank2 = await page.evaluate(() => JSON.stringify(window.__loops.state.bank));
  check('生成：同一個種子在瀏覽器裡也得到一樣的結果', bank1 === bank2);

  // 點片段播放
  const clipsToPlay = { drums: 2, bass: 1, chords: 0, lead: 0, fx: 6 };
  for (const t of TRACKS) await page.click(`.cell[data-track="${t}"][data-clip="${clipsToPlay[t]}"]`);
  await page.waitForFunction(() => {
    const p = window.__loops.engine.position();
    return p && p.plan && ['drums', 'bass', 'chords', 'lead', 'fx'].every((t) => p.plan.tracks[t]);
  }, null, { timeout: 15000 });
  const playingCells = await page.locator('.cell.playing').count();
  check('播放：五軌都在播，格子有亮起來', playingCells === 5, `${playingCells} 格亮著`);
  // 小節中間切換片段 → 量化到下一個小節線
  const q = await page.evaluate(async () => {
    const E = window.__loops.engine;
    const barDur = 240 / window.__loops.state.bank.bpm;
    const before = E.position();
    const clickAt = E.audibleTime();
    await E.queueClip('drums', 5);
    const t0 = E.timeline[0].time - E.timeline[0].bar * barDur;
    await new Promise((r) => setTimeout(r, barDur * 1000 * 1.6));
    const entry = E.timeline.find((e) => e.plan.tracks.drums && e.plan.tracks.drums.clip === 5);
    return { clickAt, start: entry ? entry.time : null, bar: entry ? entry.bar : null, t0, barDur, clipBar: entry?.plan.tracks.drums.clipBar, beforeBar: before.bar };
  });
  const onLine = q.start !== null && Math.abs((q.start - q.t0) / q.barDur - Math.round((q.start - q.t0) / q.barDur)) < 1e-6;
  check('量化：切換的片段從小節線開始、而且從片段開頭播', onLine && q.start >= q.clickAt && q.clipBar === 0 && q.start - q.clickAt <= q.barDur + 0.2,
    `點擊 ${q.clickAt.toFixed(3)}s → 開始 ${q.start?.toFixed(3)}s（第 ${q.bar + 1} 小節）`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'desktop-loop-playing.png') });

  // 靜音／獨奏／音量
  await page.click('.col[data-track="bass"] .ms .m');
  await page.click('.col[data-track="lead"] .ms .s');
  const mix = await page.evaluate(() => window.__loops.engine.gains);
  check('混音：靜音和獨奏生效', mix.bass === 0 && mix.lead > 0 && mix.drums === 0, JSON.stringify(mix));
  await page.click('.col[data-track="bass"] .ms .m');
  await page.click('.col[data-track="lead"] .ms .s');

  // 錄下我的演奏
  await page.click('#btn-rec');
  await page.waitForFunction(() => window.__loops.engine.recording === 'recording', null, { timeout: 8000 });
  await page.click('.cell[data-track="lead"][data-clip="2"]');
  const barMs = (240 / b1.bpm) * 1000;
  await page.waitForTimeout(barMs * 2.6);
  await page.click('#btn-rec');
  const rec = await page.evaluate(() => window.__loops.state.song.sections.map((s) => ({ type: s.type, bars: s.bars, lead: s.clips.lead })));
  const recBars = rec.reduce((n, s) => n + s.bars, 0);
  check('錄音：演奏變成編曲段落', rec.length >= 1 && recBars >= 2 && rec.some((s) => s.lead === 2), `${rec.length} 段、${recBars} 小節`);
  await page.click('#btn-play'); // 停止

  // 清空，用介面排出三個段落
  await page.click('#btn-clear-song');
  const plan = [
    { type: 'intro', bars: 4, clips: { drums: 0, bass: null, chords: 0, lead: null, fx: 1 } },
    { type: 'verse', bars: 4, clips: { drums: 2, bass: 1, chords: 0, lead: 4, fx: null } },
    { type: 'chorus', bars: 4, clips: { drums: 7, bass: 5, chords: 3, lead: 0, fx: 4 } },
  ];
  for (const sec of plan) {
    await page.click(`.add-chips [data-add="${sec.type}"]`);
    await page.click(`#section-editor .quick [data-bars="${sec.bars}"]`);
    for (const t of TRACKS) {
      const v = sec.clips[t];
      await page.click(`#section-editor [data-pick="${t}:${v === null ? 'none' : v}"]`);
    }
  }
  const song = await page.evaluate(() => window.__loops.state.song);
  const okSong = song.sections.length === 3 && song.sections.every((s, i) => s.type === plan[i].type && s.bars === plan[i].bars && TRACKS.every((t) => s.clips[t] === plan[i].clips[t]));
  check('編曲：用介面排出三個段落', okSong, song.sections.map((s) => `${s.type}×${s.bars}`).join(' → '));
  await page.screenshot({ path: path.join(SHOTS, 'desktop-song.png') });

  // 從第二段開始播
  await page.click('.sec[data-index="1"]');
  await page.click('#btn-play-section');
  await page.waitForFunction(() => { const p = window.__loops.engine.position(); return p && !p.waiting && p.mode === 'song'; }, null, { timeout: 8000 });
  const sp = await page.evaluate(() => window.__loops.engine.position());
  check('編曲：可以從任一段開始播', sp.section === 1 && sp.bar === 4, `從第 ${sp.bar + 1} 小節（第 ${sp.section + 1} 段）開始`);
  await page.click('#btn-play');

  // 匯出 WAV（透過下載）
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.click('#btn-export')]);
  const wavPath = path.join(os.tmpdir(), `loops-e2e-${Date.now()}.wav`);
  await download.saveAs(wavPath);
  const buf = fs.readFileSync(wavPath);
  const wav = decodeWav(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const totalBars = plan.reduce((n, s) => n + s.bars, 0);
  const barDur = 240 / b1.bpm;
  const tail = 2;
  const expected = Math.ceil((totalBars * barDur + tail) * 44100);
  check('WAV：取樣率 44.1 kHz、立體聲、16-bit', wav.sampleRate === 44100 && wav.channels.length === 2 && wav.bits === 16);
  check('WAV：長度 = 小節數 × 每小節秒數 + 2 秒餘韻', wav.frames === expected,
    `${totalBars} 小節 × ${barDur.toFixed(4)} 秒 + ${tail} 秒 = ${(expected / 44100).toFixed(3)} 秒；檔案 ${wav.duration.toFixed(3)} 秒（${wav.frames} / ${expected} 個取樣點）`);
  const st = analyzeChannels(wav.channels);
  check('WAV：峰值低於 0 dBFS（沒有破音）', st.peak < 1 && st.peakDb < -0.1, `峰值 ${st.peakDb.toFixed(2)} dBFS`);
  check('WAV：不是靜音', st.rmsDb > -35, `RMS ${st.rmsDb.toFixed(1)} dBFS`);
  let clipped = 0;
  for (const ch of wav.channels) for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]) >= 0.999) clipped++;
  check('WAV：沒有任何取樣點碰到滿格', clipped === 0, `${clipped} 個`);
  // 每一段都有聲音
  const secRms = [];
  let startBar = 0;
  for (const s of plan) {
    const a = Math.floor(startBar * barDur * 44100);
    const b = Math.floor((startBar + s.bars) * barDur * 44100);
    secRms.push(analyzeChannels(wav.channels.map((c) => c.subarray(a, b))).rmsDb);
    startBar += s.bars;
  }
  check('WAV：每一段都有聲音', secRms.every((r) => r > -40), secRms.map((r) => `${r.toFixed(1)} dB`).join(' / '));
  const peakInfo = await page.textContent('#export-result');
  check('匯出：畫面顯示結果', /完成/.test(peakInfo), peakInfo);

  // 每一軌都真的有發出聲音（分軌算一次）
  const stems = await page.evaluate(async () => {
    const L = window.__loops;
    const out = {};
    for (const t of ['drums', 'bass', 'chords', 'lead', 'fx']) {
      const b = await L.renderSong({ bank: L.state.bank, song: L.state.song, mixer: L.state.mixer, tail: 2, only: t });
      const { stats } = L.bufferToWav(b);
      out[t] = { rmsDb: stats.rmsDb, peakDb: stats.peakDb };
    }
    return out;
  });
  for (const t of TRACKS) {
    check(`分軌：${t} 有發出聲音`, stems[t].rmsDb > -50 && stems[t].peakDb > -30 && stems[t].peakDb < 0,
      `RMS ${stems[t].rmsDb.toFixed(1)} dBFS、峰值 ${stems[t].peakDb.toFixed(1)} dBFS`);
  }

  // 存檔讀檔
  const roundTrip = await page.evaluate(async () => {
    const { serializeProject, parseProject } = await import('./src/project.js');
    const s = window.__loops.state;
    const p = parseProject(JSON.stringify(serializeProject(s)));
    return p.song.sections.length === s.song.sections.length && JSON.stringify(p.bank) === JSON.stringify(s.bank);
  });
  check('存檔：專案 JSON 可以完整讀回', roundTrip);
  await page.click('#btn-save-local');
  await page.click('#btn-clear-song');
  await page.click('#btn-load-local');
  const afterLoad = await page.evaluate(() => window.__loops.state.song.sections.length);
  check('存檔：存到瀏覽器再讀回來', afterLoad === 3, `${afterLoad} 段`);
  const badges = await page.evaluate(() => Object.keys(window.__loops.state.unlocked));
  check('挑戰：有解鎖徽章', badges.length >= 4, badges.join(', '));
  check('電腦：整個流程 console 沒有錯誤', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: path.join(SHOTS, 'desktop-full.png'), fullPage: true });
  await ctx.close();
  fs.unlinkSync(wavPath);

  // ───────── 手機尺寸 ─────────
  const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage();
  const merrors = [];
  watchConsole(m, merrors);
  m.on('dialog', (d) => d.accept());
  await m.goto(URL_);
  await m.waitForTimeout(1000);
  check('手機：頁面載入時 console 沒有錯誤', merrors.length === 0, merrors.join(' | '));
  await m.screenshot({ path: path.join(SHOTS, 'mobile-help.png') });
  await m.tap('#help .btn');
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('手機：沒有橫向捲動', overflow <= 0, `多出 ${overflow}px`);
  const small = await m.evaluate(() => [...document.querySelectorAll('.view.active button')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && (r.height < 30 || r.width < 24);
  }).map((b) => b.className || b.textContent).slice(0, 5));
  check('手機：按鈕夠大好點', small.length === 0, small.join(', '));
  for (const [t, c] of [['drums', 2], ['bass', 1], ['chords', 0], ['lead', 0]]) await m.tap(`.cell[data-track="${t}"][data-clip="${c}"]`);
  await m.waitForFunction(() => { const p = window.__loops.engine.position(); return p && p.plan && p.plan.tracks.lead; }, null, { timeout: 15000 });
  await m.waitForTimeout(300);
  await m.screenshot({ path: path.join(SHOTS, 'mobile-loop.png') });
  await m.evaluate(() => window.__loops.autoArrange());
  await m.tap('.tab[data-tab="song"]');
  await m.waitForTimeout(500);
  await m.tap('#btn-song-play');
  await m.waitForFunction(() => { const p = window.__loops.engine.position(); return p && !p.waiting && p.mode === 'song' && p.frac > 0.5; }, null, { timeout: 15000 });
  const mpos = await m.evaluate(() => window.__loops.engine.position());
  check('手機：播放整首歌', mpos.mode === 'song' && mpos.section === 0, `第 ${mpos.bar + 1} 小節`);
  await m.waitForTimeout(3500);
  await m.screenshot({ path: path.join(SHOTS, 'mobile-song.png') });
  await m.tap('.tab[data-tab="goals"]');
  await m.waitForTimeout(300);
  await m.screenshot({ path: path.join(SHOTS, 'mobile-goals.png') });
  await m.tap('.tab[data-tab="files"]');
  await m.waitForTimeout(300);
  await m.screenshot({ path: path.join(SHOTS, 'mobile-files.png') });
  const overflow2 = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('手機：每個畫面都沒有橫向捲動', overflow2 <= 0, `多出 ${overflow2}px`);
  check('手機：整個流程 console 沒有錯誤', merrors.length === 0, merrors.join(' | '));
  await mctx.close();
} catch (e) {
  check('測試流程沒有中斷', false, e.stack || String(e));
} finally {
  await browser.close();
  server.close();
}

const report = { date: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed, results };
fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.passed} 項通過，${failed} 項失敗`);
process.exit(failed ? 1 : 0);
