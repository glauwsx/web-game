// 音樂（計劃書 16）：6 首原創的晶片音樂循環，每首 8 小節。
// 格式：每個字元組是一個八分音符。音名如 'C5'、'F#4'、'Bb4'；'-' 是延長上一個音；'.' 是休止。'|' 只是小節線，不算拍子。
// 鼓：'k' 大鼓、's' 小鼓、'h' 腳踏鈸、'.' 休止。
// bass 用 'chords' 自動產生：每小節一個和弦根音，照 bassPattern 彈（'r' 根音、'o' 高八度、'f' 五度、'.' 休止）。

export const SONGS = {
  // 標題、選單：明亮的 C 大調
  title: {
    bpm: 120,
    lead: 'E5 - G5 - C6 - G5 E5 | A5 - G5 E5 C5 - E5 - | F5 - A5 - C6 - A5 F5 | G5 - - D5 G5 - B5 - |'
      + ' C6 - B5 G5 E5 - G5 - | A5 - C6 - E6 - D6 C6 | A5 - F5 - G5 - B5 - | C6 - - - . . . . |',
    chords: ['C3', 'A2', 'F2', 'G2', 'C3', 'A2', 'F2', 'C3'],
    bassPattern: 'r . r f o . f .',
    drums: 'k . h . s . h . | k . h . s . h k | k . h . s . h . | k . h . s s h . |',
    leadWave: 'square',
  },
  // 經營（平常）：悠閒的 F 大調五聲音階
  shop: {
    bpm: 100,
    lead: 'A4 - C5 - D5 C5 A4 - | D5 - F5 - D5 - C5 - | D5 - C5 A4 G4 - F4 - | G4 - A4 - C5 - - - |'
      + ' F5 - D5 C5 A4 - C5 - | D5 - A4 - F4 - A4 - | G4 - A4 - C5 - D5 - | C5 - - - . . . . |',
    chords: ['F2', 'D2', 'Bb2', 'C3', 'F2', 'D2', 'Bb2', 'C3'],
    bassPattern: 'r . . f r . o .',
    drums: 'k . h . k . h . | k . h . k . h h |',
    leadWave: 'triangle',
  },
  // 經營（尖峰時段）：同一段旋律，快一點、鼓更密
  shopPeak: {
    bpm: 136,
    lead: 'A4 - C5 - D5 C5 A4 - | D5 - F5 - D5 - C5 - | D5 - C5 A4 G4 - F4 - | G4 - A4 - C5 - - - |'
      + ' F5 - D5 C5 A4 - C5 - | D5 - A4 - F4 - A4 - | G4 - A4 - C5 - D5 - | C5 - - - C5 D5 F5 G5 |',
    chords: ['F2', 'D2', 'Bb2', 'C3', 'F2', 'D2', 'Bb2', 'C3'],
    bassPattern: 'r o r o f o r o',
    drums: 'k h s h k h s h | k h s h k k s s |',
    leadWave: 'square',
  },
  // 小鋼珠：A 小調的快速琶音，閃閃發亮
  pachinko: {
    bpm: 150,
    lead: 'A4 C5 E5 A5 E5 C5 A4 C5 | F4 A4 C5 F5 C5 A4 F4 A4 | G4 B4 D5 G5 D5 B4 G4 B4 | E4 G#4 B4 E5 B4 G#4 E5 - |'
      + ' A5 C6 E6 A6 E6 C6 A5 C6 | F5 A5 C6 F6 C6 A5 F5 A5 | G5 B5 D6 G6 D6 B5 G5 B5 | E5 G#5 B5 E6 - - . . |',
    chords: ['A2', 'F2', 'G2', 'E2', 'A2', 'F2', 'G2', 'E2'],
    bassPattern: 'r . o . r . o .',
    drums: 'k h h h s h h h | k h h k s h s h |',
    leadWave: 'square',
  },
  // 賽車：D 小調，衝刺感
  race: {
    bpm: 160,
    lead: 'D5 - F5 - A5 - G5 F5 | D5 - - F5 - D5 C5 - | E5 - G5 - C6 - Bb5 A5 | A5 - - C#5 E5 - A5 - |'
      + ' D6 - C6 A5 F5 - A5 - | Bb5 - A5 F5 D5 - F5 - | G5 - E5 - C5 - E5 G5 | A5 - - - C#6 - E6 - |',
    chords: ['D2', 'Bb1', 'C2', 'A1', 'D2', 'Bb1', 'C2', 'A1'],
    bassPattern: 'r r o r r r o r',
    drums: 'k h s h k k s h | k h s h k k s s |',
    leadWave: 'sawtooth',
  },
  // 結算：慢一點的號角
  results: {
    bpm: 108,
    lead: 'C5 - E5 - G5 - - - | A5 - G5 - F5 - A5 - | G5 - - - D5 - G5 - | E5 - - - C5 - - - |'
      + ' E5 - A5 - C6 - - - | C6 - A5 - F5 - A5 - | B5 - D6 - G5 - B5 - | C6 - - - - - . . |',
    chords: ['C3', 'F2', 'G2', 'C3', 'A2', 'F2', 'G2', 'C3'],
    bassPattern: 'r . f . r . f .',
    drums: 'k . . . s . . . | k . . . s . h h |',
    leadWave: 'square',
  },
};

// 場景名稱對應的音樂。'*shop' 代表經營畫面：營業中的尖峰時段用 shopPeak，其他時間用 shop。
// 列在 KEEP 的場景（對話、暫停、選單）不換音樂，照下一層的。
export const SCENE_MUSIC = {
  title: 'title', menu: 'title', 'owner-menu': 'title', levels: 'title', settings: 'title',
  customer: 'title', 'endless-menu': 'title', demo: 'title',
  level: '*shop', endless: '*shop',
  pachinko: 'pachinko', race: 'race',
  results: 'results', 'endless-over': 'results',
};
export const KEEP_MUSIC = ['dialog', 'pause', 'boss', 'confirm', 'corrupt'];
