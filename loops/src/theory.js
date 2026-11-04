// 樂理：調式、和弦、音高換算。所有音高都從「調內音級」算出來，所以一定在調內。

export const NOTE_NAMES = ['C', 'C#', 'D', 'E♭', 'E', 'F', 'F#', 'G', 'A♭', 'A', 'B♭', 'B'];
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const MODE_OFFSET = { ionian: 0, dorian: 2, phrygian: 4, mixolydian: 7, aeolian: 9 };

// 依調號決定用升記號還是降記號
export function noteName(pc, key) {
  const relMajor = mod(key.tonic - MODE_OFFSET[key.mode], 12);
  const flat = [5, 10, 3, 8, 1, 6].includes(relMajor);
  const sharpKeys = [7, 2, 9, 4, 11];
  if (flat) return FLAT_NAMES[mod(pc, 12)];
  if (sharpKeys.includes(relMajor)) return SHARP_NAMES[mod(pc, 12)];
  return NOTE_NAMES[mod(pc, 12)];
}

export const MODES = {
  ionian: { label: '大調', steps: [0, 2, 4, 5, 7, 9, 11] },
  aeolian: { label: '小調', steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: '多利安', steps: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { label: '混合利底亞', steps: [0, 2, 4, 5, 7, 9, 10] },
  phrygian: { label: '弗里吉亞', steps: [0, 1, 3, 5, 7, 8, 10] },
};

// 每個調式可以用的和弦進行（音級從 0 起算）。已避開減三和弦。
export const PROGRESSIONS = {
  ionian: {
    four: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 4, 3], [3, 4, 2, 5], [0, 2, 3, 4], [0, 3, 5, 4]],
    two: [[0, 3], [0, 4], [3, 4], [5, 3], [0, 5]],
  },
  aeolian: {
    four: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 6, 2], [0, 5, 3, 4], [5, 6, 0, 0], [0, 2, 3, 5], [0, 3, 5, 6]],
    two: [[0, 5], [0, 3], [5, 6], [0, 6]],
  },
  dorian: {
    four: [[0, 3, 0, 3], [0, 6, 3, 0], [0, 2, 3, 3], [0, 1, 2, 3], [0, 3, 6, 6], [0, 4, 3, 0]],
    two: [[0, 3], [0, 6], [0, 1], [0, 4]],
  },
  mixolydian: {
    four: [[0, 6, 3, 0], [0, 6, 3, 3], [0, 3, 6, 0], [0, 4, 6, 3], [0, 0, 6, 3]],
    two: [[0, 6], [0, 3], [6, 3]],
  },
  phrygian: {
    four: [[0, 1, 0, 6], [0, 1, 6, 1], [0, 6, 5, 1], [0, 5, 6, 0], [0, 3, 1, 0]],
    two: [[0, 1], [0, 6], [5, 1]],
  },
};

export function mod(n, m) {
  return ((n % m) + m) % m;
}

// 音級 → 從主音起算的半音數（可以是負的，也可以跨八度）
export function degToSemis(deg, mode) {
  const st = MODES[mode].steps;
  return 12 * Math.floor(deg / 7) + st[mod(deg, 7)];
}

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function scalePitchClasses(key) {
  return MODES[key.mode].steps.map((s) => mod(key.tonic + s, 12));
}

// 把和弦根音的音級收進 -3..3，讓旋律跟著和弦移動時不會跳太遠
export function normRoot(deg) {
  const d = mod(deg, 7);
  return d > 3 ? d - 7 : d;
}

// 和弦組成音（相對根音的音級）。ext：'' / '7' / '9' / '79'
export function chordTones(rootDeg, mode, ext = '') {
  const tones = [0, 2, 4];
  if (ext.includes('7')) tones.push(6);
  if (ext.includes('9')) {
    // 只有根音上方是全音時才加九音，避免小九度的刺耳聲
    const step = degToSemis(rootDeg + 1, mode) - degToSemis(rootDeg, mode);
    if (step === 2) tones.push(8);
  }
  return tones;
}

export function triadQuality(rootDeg, mode) {
  const r = degToSemis(rootDeg, mode);
  const third = degToSemis(rootDeg + 2, mode) - r;
  const fifth = degToSemis(rootDeg + 4, mode) - r;
  if (third === 4 && fifth === 7) return 'maj';
  if (third === 3 && fifth === 7) return 'min';
  if (third === 3 && fifth === 6) return 'dim';
  return 'aug';
}

export function chordName(deg, key, ext = '') {
  const pc = mod(key.tonic + degToSemis(deg, key.mode), 12);
  const q = triadQuality(deg, key.mode);
  let name = noteName(pc, key) + (q === 'min' ? 'm' : q === 'dim' ? 'dim' : q === 'aug' ? '+' : '');
  if (ext.includes('7')) {
    const sev = degToSemis(deg + 6, key.mode) - degToSemis(deg, key.mode);
    if (q === 'maj') name += sev === 11 ? 'maj7' : '7';
    else name += '7';
  }
  return name;
}

export function keyLabel(key) {
  return `${noteName(key.tonic, key)} ${MODES[key.mode].label}`;
}

// 各軌的主音在哪個八度（MIDI 編號）
export function trackBase(track, tonic) {
  switch (track) {
    case 'bass':
      return tonic <= 8 ? 36 + tonic : 24 + tonic; // C2..A♭2 / A1..B1：最低的根音不會低於 E1
    case 'chords':
      return 48 + tonic;
    case 'lead':
      return tonic <= 4 ? 72 + tonic : 60 + tonic; // F4..E5
    case 'fx':
      return tonic <= 4 ? 84 + tonic : 72 + tonic;
    default:
      return 60 + tonic;
  }
}

// 和弦配置：三和弦音放在 center 附近的一個八度裡，延伸音放上面，避免小二度。
export function voiceChord(rootDeg, key, rels, center = 62) {
  const lo = center - 6;
  const base = [];
  const ext = [];
  for (const r of rels) {
    const pc = mod(key.tonic + degToSemis(rootDeg + r, key.mode), 12);
    if (r <= 4) base.push(lo + mod(pc - lo, 12));
    else ext.push(pc);
  }
  const notes = Array.from(new Set(base)).sort((a, b) => a - b);
  for (const pc of ext) {
    let chosen = null;
    for (let m = lo + mod(pc - lo, 12); m <= center + 14; m += 12) {
      if (notes.every((n) => Math.abs(n - m) >= 2)) {
        chosen = m;
        if (m >= center) break;
      }
    }
    if (chosen !== null) notes.push(chosen);
  }
  return notes.sort((a, b) => a - b);
}

// 強力和弦：根音、五度、八度（從音級算，仍在調內）
export function powerChord(rootDeg, key, center = 52) {
  const lo = center - 6;
  const pc = mod(key.tonic + degToSemis(rootDeg, key.mode), 12);
  const root = lo + mod(pc - lo, 12);
  const fifth = root + (degToSemis(rootDeg + 4, key.mode) - degToSemis(rootDeg, key.mode));
  return [root, fifth, root + 12];
}
