// 進入點
import { HoopbeatApp } from './app.js';

function boot() {
  try {
    window.__app = new HoopbeatApp();
  } catch (err) {
    console.error(err);
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:18px sans-serif;background:#111;padding:40px;text-align:center';
    d.textContent = `無法啟動遊戲：${err.message}。請確認瀏覽器支援 WebGL 與 Web Audio。`;
    document.body.appendChild(d);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
