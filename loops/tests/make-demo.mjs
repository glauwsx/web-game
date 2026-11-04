// 產生示範歌：examples/demo-project.json（給「載入示範歌」用）和 examples/demo-song.wav。
// 用法：node tests/make-demo.mjs [曲風] [種子]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';
import { startServer } from './serve.mjs';
import { decodeWav, analyzeChannels } from '../src/wav.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const genre = process.argv[2] || 'house';
const seed = process.argv[3] || '8080';

const { server, port } = await startServer();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.click('#help .btn');

const project = await page.evaluate(async ({ genre, seed }) => {
  const L = window.__loops;
  const { makeSection } = await import('./src/song.js');
  const { serializeProject } = await import('./src/project.js');
  L.generate(genre, seed, { quiet: true });
  const bank = L.state.bank;
  const find = (t, styles) => {
    for (const st of styles) {
      const i = bank.tracks[t].findIndex((c) => c.style === st);
      if (i >= 0) return i;
    }
    return 0;
  };
  const chordsAlt = Math.max(1, bank.tracks.chords.findIndex((c, i) => i > 0 && c.bars === 4));
  L.state.song = {
    sections: [
      makeSection('intro', 4, { drums: find('drums', ['light']), chords: 0, fx: find('fx', ['riser']) }),
      makeSection('verse', 8, { drums: find('drums', ['main']), bass: find('bass', ['main']), chords: 0, lead: find('lead', ['sparse']) }),
      makeSection('chorus', 8, { drums: find('drums', ['peak']), bass: find('bass', ['busy']), chords: chordsAlt, lead: find('lead', ['hook']), fx: find('fx', ['impact', 'sparkle']) }),
      makeSection('outro', 4, { drums: find('drums', ['light']), chords: 0, fx: find('fx', ['down', 'swell']) }),
    ],
  };
  L.state.name = `示範歌－${bank.seed}`;
  document.querySelector('#project-name').value = L.state.name;
  return serializeProject(L.state);
}, { genre, seed });

project.savedAt = '2026-11-05T00:00:00.000Z';
const examples = path.join(ROOT, 'examples');
fs.mkdirSync(examples, { recursive: true });
fs.writeFileSync(path.join(examples, 'demo-project.json'), `${JSON.stringify(project, null, 1)}\n`);

// 透過「載入示範歌」按鈕讀回來，再用「匯出」按鈕下載 WAV（走跟使用者一樣的路徑）
await page.click('#btn-demo');
await page.waitForFunction(() => window.__loops.state.song.sections.length === 4);
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('#btn-export')]);
const wavPath = path.join(examples, 'demo-song.wav');
await download.saveAs(wavPath);
const buf = fs.readFileSync(wavPath);
const wav = decodeWav(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const st = analyzeChannels(wav.channels);
console.log(`demo-song.wav：${wav.duration.toFixed(2)} 秒、${(buf.length / 1048576).toFixed(2)} MB、峰值 ${st.peakDb.toFixed(2)} dBFS、RMS ${st.rmsDb.toFixed(1)} dBFS`);
if (buf.length >= 10 * 1048576) {
  console.error('示範歌超過 10 MB！');
  process.exitCode = 1;
}
await browser.close();
server.close();
