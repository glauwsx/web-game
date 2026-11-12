// WAV 編碼／解碼（16-bit PCM）。純函式，Node 也能用。

export function encodeWav(channels, sampleRate) {
  const numCh = channels.length;
  const len = channels[0].length;
  const bytesPerSample = 2;
  const dataSize = len * numCh * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numCh * bytesPerSample, true);
  v.setUint16(32, numCh * bytesPerSample, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let x = channels[c][i];
      if (x > 1) x = 1;
      else if (x < -1) x = -1;
      v.setInt16(o, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
      o += 2;
    }
  }
  return buf;
}

export function decodeWav(arrayBuffer) {
  const v = new DataView(arrayBuffer);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('不是 WAV 檔');
  let o = 12;
  let fmt = null;
  while (o < v.byteLength - 8) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = { channels: v.getUint16(o + 10, true), sampleRate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    } else if (id === 'data') {
      const frames = size / (fmt.channels * (fmt.bits / 8));
      const chans = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
      let p = o + 8;
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < fmt.channels; c++) {
          chans[c][i] = v.getInt16(p, true) / 32768;
          p += 2;
        }
      }
      return { ...fmt, frames, channels: chans, duration: frames / fmt.sampleRate };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error('WAV 檔裡找不到音訊資料');
}

export function analyzeChannels(channels) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
      sum += ch[i] * ch[i];
      n++;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peak, rms, peakDb: toDb(peak), rmsDb: toDb(rms) };
}
