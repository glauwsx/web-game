// 角色：外觀參數（給紙娃娃產生器用）。員工數值和顧客類型數值在階段 2 加入。
// 外觀照原作設定：髮型、服裝顏色、特徵。圖像全部由程式產生。

const RYO_FACE = { brow: 'uni', stubble: true };
const RYO_BASE = { build: 'stocky', skin: 'S', hair: { style: 'buzz', color: 'k' }, shoes: { style: 'geta' } };

export const CAST_LOOKS = {
  // 阿兩：警察制服（袖子捲起、木屐）
  ryo_police: {
    ...RYO_BASE, face: RYO_FACE,
    top: { style: 'uniform', color: 'U', sleeve: 'rolled', tie: 'u' }, bottom: { style: 'pants', color: 'U' },
  },
  // 阿兩：在店裡穿白色板前服、戴白帽
  ryo: {
    ...RYO_BASE, face: RYO_FACE,
    top: { style: 'chef', color: 'w', sleeve: 'short' }, bottom: { style: 'pants', color: 'w' },
    hat: { style: 'chef', color: 'w' },
  },
  // 阿兩變裝成「淺草一郎」：假八字鬍加眼鏡
  ryo_disguise: {
    ...RYO_BASE, face: { brow: 'uni', stubble: true, mustache: 'fake', glasses: 'glasses' },
    top: { style: 'chef', color: 'w', sleeve: 'short' }, bottom: { style: 'pants', color: 'w' },
    hat: { style: 'chef', color: 'w' },
  },
  nakagawa: {
    build: 'tall', skin: 's', hair: { style: 'sidepart', color: 'h' }, face: {},
    top: { style: 'uniform', color: 'y', tie: 'r' }, bottom: { style: 'pants', color: 'y' }, shoes: { color: 'k' },
  },
  reiko: {
    build: 'adult', skin: 's', hair: { style: 'long', color: 'D' }, face: { blush: true },
    top: { style: 'uniform', color: 'p', tie: 'r' }, bottom: { style: 'skirt', color: 'p' }, shoes: { color: 'r' },
  },
  bucho: {
    build: 'adult', skin: 's', hair: { style: 'thin', color: 'g' },
    face: { mustache: 'hachi', brow: 'thick', angryRed: true },
    top: { style: 'uniform', color: 'u', tie: 'k' }, bottom: { style: 'pants', color: 'u' }, shoes: { color: 'k' },
    hat: { style: 'police', color: 'u' },
  },
  honda: {
    build: 'adult', skin: 's', hair: { style: 'bangs', color: 'h' }, face: { eyes: 'dot' },
    top: { style: 'uniform', color: 'i', tie: 'u' }, bottom: { style: 'pants', color: 'i' }, shoes: { color: 'k' },
  },
  // 本田當外場：制服外面套店裡的圍裙
  honda_apron: {
    build: 'adult', skin: 's', hair: { style: 'bangs', color: 'h' }, face: { eyes: 'dot' },
    top: { style: 'uniform', color: 'i', tie: 'u' }, bottom: { style: 'pants', color: 'i' }, shoes: { color: 'k' },
    acc: ['apron'],
  },
  terai: {
    build: 'stocky', skin: 's', hair: { style: 'short', color: 'h' }, face: { eyes: 'dot' },
    top: { style: 'uniform', color: 'i', tie: 'u' }, bottom: { style: 'pants', color: 'i' }, shoes: { color: 'k' },
  },
  matoi: {
    build: 'tall', skin: 's', hair: { style: 'tomboy', color: 'k' }, face: {},
    top: { style: 'happi', color: 'U', color2: 'W' }, bottom: { style: 'pants', color: 'u' }, shoes: { color: 'W' },
  },
  lemon: {
    build: 'child', skin: 's', hair: { style: 'bob', color: 'h' }, face: { blush: true },
    top: { style: 'kimono', color: 'Y', color2: 'w', obi: 'r' }, bottom: { style: 'kimono', color: 'Y' }, shoes: { color: 'r' },
  },
  geparuto: {
    build: 'short', skin: 's', hair: { style: 'bun', color: 'E' }, face: { brow: 'thick', eyes: 'dot' },
    top: { style: 'kimono', color: 'v', color2: 'W', obi: 'e' }, bottom: { style: 'kimono', color: 'v' }, shoes: { color: 'W' },
  },
  yuutsu: {
    build: 'adult', skin: 's', hair: { style: 'short', color: 'k' }, face: {},
    top: { style: 'chef', color: 'w', sleeve: 'short' }, bottom: { style: 'pants', color: 'w' }, shoes: { color: 'k' },
    hat: { style: 'headband', color: 'U' },
  },
  // 修馬哈：F1 車手（惡搞角色）
  shumaha: {
    build: 'adult', skin: 's', hair: { style: 'none' }, face: { mouth: false },
    top: { style: 'race', color: 'r' }, bottom: { style: 'pants', color: 'r' }, shoes: { color: 'k' },
    hat: { style: 'helmet', color: 'r' },
  },
  // 小鋼珠職業玩家（原創造型）
  pro: {
    build: 'adult', skin: 's', hair: { style: 'spiky', color: 'k' }, face: { glasses: 'shades' },
    top: { style: 'jacket', color: 'v', color2: 'K' }, bottom: { style: 'pants', color: 'K' }, shoes: { color: 'k' },
  },
};

// 一般顧客的外觀。每種類型有可辨識的特徵：
// 上班族穿西裝打領帶、家庭客是大人帶小孩、觀光客金髮帶相機、美食家戴貝雷帽圍圍巾。
export const CUSTOMER_LOOKS = {
  normal: [
    { build: 'adult', skin: 's', hair: { style: 'short', color: 'h' }, top: { style: 'tshirt', color: 'N', sleeve: 'short' }, bottom: { style: 'pants', color: 'i' }, shoes: { color: 'w' } },
    { build: 'adult', skin: 's', hair: { style: 'ponytail', color: 'H' }, top: { style: 'stripe', color: 'w', color2: 'R', sleeve: 'short' }, bottom: { style: 'skirt', color: 'U' }, shoes: { color: 'r' } },
    { build: 'stocky', skin: 's', hair: { style: 'thin', color: 'g' }, top: { style: 'tshirt', color: 'd', sleeve: 'long' }, bottom: { style: 'pants', color: 'b' }, shoes: { color: 'k' } },
    { build: 'adult', skin: 's', hair: { style: 'bob', color: 'k' }, top: { style: 'tshirt', color: 'V', sleeve: 'long' }, bottom: { style: 'pants', color: 'K' }, shoes: { color: 'k' } },
  ],
  salaryman: [
    { build: 'adult', skin: 's', hair: { style: 'sidepart', color: 'k' }, top: { style: 'suit', color: 'K', tie: 'r' }, bottom: { style: 'pants', color: 'K' }, shoes: { color: 'k' } },
    { build: 'tall', skin: 's', hair: { style: 'short', color: 'h' }, face: { glasses: 'glasses' }, top: { style: 'suit', color: 'u', tie: 'e' }, bottom: { style: 'pants', color: 'u' }, shoes: { color: 'k' } },
    { build: 'stocky', skin: 's', hair: { style: 'thin', color: 'k' }, top: { style: 'suit', color: 'g', tie: 'i' }, bottom: { style: 'pants', color: 'g' }, shoes: { color: 'k' } },
  ],
  family: [
    { build: 'adult', skin: 's', hair: { style: 'long', color: 'h' }, top: { style: 'tshirt', color: 'P', sleeve: 'long' }, bottom: { style: 'skirt', color: 'r' }, shoes: { color: 'w' } },
    { build: 'adult', skin: 's', hair: { style: 'short', color: 'k' }, top: { style: 'stripe', color: 'I', color2: 'w', sleeve: 'short' }, bottom: { style: 'pants', color: 'd' }, shoes: { color: 'k' } },
    { build: 'child', skin: 's', hair: { style: 'spiky', color: 'k' }, top: { style: 'tshirt', color: 'y', sleeve: 'short' }, bottom: { style: 'shorts', color: 'i' }, shoes: { color: 'r' }, hat: { style: 'cap', color: 'r' } },
    { build: 'child', skin: 's', hair: { style: 'ponytail', color: 'h' }, top: { style: 'tshirt', color: 'p', sleeve: 'short' }, bottom: { style: 'skirt', color: 'p' }, shoes: { color: 'w' } },
  ],
  tourist: [
    { build: 'tall', skin: 's', hair: { style: 'short', color: 'D' }, top: { style: 'aloha', color: 'q', color2: 'y', sleeve: 'short' }, bottom: { style: 'shorts', color: 'd' }, shoes: { color: 'w' }, acc: ['camera'] },
    { build: 'adult', skin: 'S', hair: { style: 'curly', color: 'H' }, top: { style: 'aloha', color: 'o', color2: 'w', sleeve: 'short' }, bottom: { style: 'shorts', color: 'i' }, shoes: { color: 'w' }, hat: { style: 'sunhat', color: 'Y', band: 'r' }, acc: ['camera'] },
    { build: 'tall', skin: 't', hair: { style: 'short', color: 'k' }, top: { style: 'tshirt', color: 'w', sleeve: 'short' }, bottom: { style: 'pants', color: 'N' }, shoes: { color: 'k' }, hat: { style: 'cap', color: 'i' }, acc: ['camera'] },
  ],
  gourmet: [
    { build: 'stocky', skin: 's', hair: { style: 'short', color: 'g' }, face: { mustache: 'hachi', mustacheColor: 'g' }, top: { style: 'suit', color: 'b', tie: 'e' }, bottom: { style: 'pants', color: 'a' }, shoes: { color: 'k' }, hat: { style: 'beret', color: 'm' }, acc: ['scarf'] },
    { build: 'adult', skin: 's', hair: { style: 'bob', color: 'h' }, face: { glasses: 'glasses' }, top: { style: 'tshirt', color: 'k', sleeve: 'long', neck: false, scarf: 'e' }, bottom: { style: 'pants', color: 'k' }, shoes: { color: 'k' }, hat: { style: 'beret', color: 'v' }, acc: ['scarf'] },
  ],
  pachinkoFan: [
    { build: 'adult', skin: 's', hair: { style: 'curly', color: 'k' }, top: { style: 'jacket', color: 'n', color2: 'w' }, bottom: { style: 'pants', color: 'K' }, shoes: { color: 'k' } },
    { build: 'stocky', skin: 's', hair: { style: 'short', color: 'h' }, top: { style: 'stripe', color: 'e', color2: 'k', sleeve: 'short' }, bottom: { style: 'pants', color: 'b' }, shoes: { color: 'k' }, hat: { style: 'cap', color: 'k' } },
  ],
  raceFan: [
    { build: 'adult', skin: 's', hair: { style: 'spiky', color: 'H' }, top: { style: 'jacket', color: 'r', color2: 'w' }, bottom: { style: 'pants', color: 'u' }, shoes: { color: 'w' }, hat: { style: 'cap', color: 'r' } },
    { build: 'tall', skin: 's', hair: { style: 'short', color: 'k' }, top: { style: 'race', color: 'i', sleeve: 'long' }, bottom: { style: 'pants', color: 'i' }, shoes: { color: 'k' } },
  ],
};

// 顯示名稱的字串鍵
export const CAST_NAME_KEYS = {
  ryo: 'char.ryo', ryo_police: 'char.ryo', ryo_disguise: 'char.ryoDisguise',
  nakagawa: 'char.nakagawa', reiko: 'char.reiko', bucho: 'char.bucho', honda: 'char.honda', honda_apron: 'char.honda',
  terai: 'char.terai', matoi: 'char.matoi', lemon: 'char.lemon', geparuto: 'char.geparuto', yuutsu: 'char.yuutsu',
  shumaha: 'char.shumaha', pro: 'char.pro',
};
