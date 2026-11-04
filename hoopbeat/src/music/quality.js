// 編曲檢查：不主觀打「好不好聽」的分數，只看量得到的東西。
// 每一項都說明「量了什麼、標準是什麼」，畫面上照實顯示。

const TRACKS = ['drums', 'bass', 'chords', 'lead', 'fx'];

function clipKey(clips) {
  return TRACKS.map((t) => (clips[t] === null || clips[t] === undefined ? '-' : clips[t])).join('');
}

// song：loops 的編排 { sections: [{ type, bars, clips }] }
// mixer：{ drums: { vol, mute }, ... }
// peak：實際量到的輸出峰值（0～1，可省略）
export function arrangementChecks(song, mixer = {}, { peak = null } = {}) {
  const sections = song?.sections || [];
  const types = new Set(sections.map((s) => s.type));
  const combos = new Set(sections.map((s) => clipKey(s.clips || {})));

  // 1. 段落：至少 3 種段落類型（例如前奏、主歌、副歌）
  const sectionOk = types.size >= 3;

  // 2. 變化：至少 3 種不同的片段組合
  const variationOk = combos.size >= 3;

  // 3. 平衡：有在用的軌裡，最大聲的一軌不超過總音量的 45%
  const used = new Set();
  for (const s of sections) for (const t of TRACKS) if (s.clips?.[t] !== null && s.clips?.[t] !== undefined) used.add(t);
  const vols = [...used].map((t) => (mixer[t]?.mute ? 0 : mixer[t]?.vol ?? 0.8));
  const total = vols.reduce((a, b) => a + b, 0);
  const share = total > 0 ? Math.max(...vols) / total : 1;
  const balanceOk = used.size >= 3 && share <= 0.45;

  // 4. 破音：輸出峰值沒有撞到限幅器的天花板（0.86）
  let clipOk = true;
  let clipDetail = '還沒量到';
  if (peak !== null) {
    clipOk = peak < 0.85;
    clipDetail = `峰值 ${(peak * 100).toFixed(0)}%`;
  } else {
    const loud = vols.reduce((a, v) => a + v * v * 1.4, 0);
    clipOk = loud < 6;
    clipDetail = `音量總和 ${loud.toFixed(1)}`;
  }

  const checks = [
    { id: 'sections', label: '有段落', ok: sectionOk, detail: `${types.size} 種段落（標準：3 種以上）` },
    { id: 'variation', label: '有變化', ok: variationOk, detail: `${combos.size} 種片段組合（標準：3 種以上）` },
    { id: 'balance', label: '各軌平衡', ok: balanceOk, detail: `最大聲的一軌佔 ${Math.round(share * 100)}%（標準：45% 以下、3 軌以上）` },
    { id: 'clip', label: '沒有破音', ok: clipOk, detail: clipDetail },
  ];
  const score = checks.filter((c) => c.ok).length;
  return { checks, score, chemistry: score * 0.01 };
}
