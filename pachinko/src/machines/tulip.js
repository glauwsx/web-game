// 鬱金香機（普通機）。盤面照「正村ゲージ」的想法：天四本、逆八字、風車、袴、鬱金香。
// 沒有螢幕、沒有抽獎。鋼珠進入賞口就賠 4 顆。
import { mkBoard, nail, row, pair, pocket, tulip, setTulip, windmill, rubber, label, field, rails, keep } from './common.js';

const PAY = 4;
export const TULIP = { life: 6.9, tlife: 7.0 };

function build() {
  const b = mkBoard();
  rails(b);
  // 天四本：最上面的四根釘子。鋼珠從左上進來，先撞這裡
  nail(b, 170, 40, 'ten'); nail(b, 190, 36, 'ten'); nail(b, 210, 36, 'ten'); nail(b, 230, 40, 'ten');
  rubber(b, 356, 96, 6);                    // 右上的橡膠：太強的鋼珠被彈回來
  // 天穴
  pair(b, TULIP.life, 74, 'life');
  pocket(b, { id: 'ten', x: 200, y: 82, pay: PAY, name: '天', color: '#e7b53c' });
  // 逆八字（鎧釘）：從天穴兩邊往外往下斜
  row(b, 180, 92, 140, 128, 5, 'yoroi'); row(b, 220, 92, 260, 128, 5, 'yoroi');
  // 中央鬱金香
  pair(b, TULIP.tlife, 154, 'life');
  tulip(b, { id: 'tc', x: 200, y: 168, pay: PAY, name: '中', color: '#e2483d' });
  // 上面的風車
  windmill(b, 132, 150); windmill(b, 268, 150);
  // 袖（左右兩邊的入賞口）
  for (const s of [-1, 1]) {
    const x = 200 + s * 132;
    nail(b, x - TULIP.life, 206, 'life'); nail(b, x + TULIP.life, 206, 'life'); nail(b, x, 190, 'guard');
    pocket(b, { id: s < 0 ? 'sl' : 'sr', x, y: 214, pay: PAY, name: '袖', color: '#3d8fd0' });
  }
  // 左右鬱金香，上面各有一組袴（ハカマ）把鋼珠收攏
  for (const s of [-1, 1]) {
    const x = 200 + s * 70;
    nail(b, x - TULIP.tlife, 230, 'life'); nail(b, x + TULIP.tlife, 230, 'life'); nail(b, x, 213, 'guard');
    tulip(b, { id: s < 0 ? 'tl' : 'tr', x, y: 244, pay: PAY, name: s < 0 ? '左' : '右', color: '#e2483d' });
  }
  // 下面的風車
  windmill(b, 104, 272); windmill(b, 296, 272);
  // 落とし：中間偏下的一般入賞口
  pair(b, TULIP.life, 232, 'life');
  pocket(b, { id: 'oto', x: 200, y: 240, pay: PAY, name: '落', color: '#3d8fd0' });
  // 最下面的鬱金香
  pair(b, TULIP.tlife, 308, 'life'); nail(b, 200, 291, 'guard');
  tulip(b, { id: 'tb', x: 200, y: 322, pay: PAY, name: '下', color: '#e2483d', reach: 15 });
  keep(b, 200, 384, 22);
  field(b, (x, y) => y > 30 && y < 352, 23, 19.5, 12, 34);

  label(b, 200, 38, '天四本', 250, 22);
  label(b, 200, 86, '天穴', 262, 70);
  label(b, 160, 110, '逆八字', 96, 80);
  label(b, 132, 150, '風車', 82, 140);
  label(b, 200, 168, '鬱金香', 262, 176);
  label(b, 68, 216, '袖', 44, 190);
  label(b, 120, 207, '袴', 150, 190);
  label(b, 200, 388, '出口（沒中）', 262, 372);
  label(b, 356, 96, '橡膠', 330, 62);
  b.art = { theme: 'tulip' };
  return b;
}

function createLogic(env) {
  const b = env.board;
  const st = { wins: 0, chain: 0, lastT: -9 };
  const open = (id) => { if (setTulip(b, id, true)) env.sfx('open'); };
  return {
    state: st,
    onSensor(s) {
      if (!s.pay) return undefined;
      env.pay(s.pay, s);
      st.wins++;
      st.chain = env.time() - st.lastT < 4 ? st.chain + 1 : 1;
      st.lastT = env.time();
      env.sfx('in');
      const t = b.tulips.find((q) => q.id === s.id);
      if (t) {
        // 鬱金香：進一顆就換狀態（合 → 開、開 → 合）
        setTulip(b, t.id, !t.open);
        env.sfx(t.open ? 'open' : 'close');
        if (s.id === 'tc' && !t.open) open('tb');           // 中央鬱金香收球 → 下鬱金香開
      } else if (s.id === 'ten') { open('tl'); open('tr'); env.msg('天穴！左右鬱金香開'); }
      else if (s.id === 'sl') { open('tl'); open('tb'); }
      else if (s.id === 'sr') { open('tr'); open('tb'); }
      else if (s.id === 'oto') { open('tc'); }
      return 'take';
    },
    onStageExit() { return 'take'; },
    update() {},
    wantRight: () => false,
    hud() {
      const n = b.tulips.filter((t) => t.open).length;
      return { mode: '普通機', big: `開著的鬱金香 ${n}／${b.tulips.length}`, rows: [['入賞次數', st.wins]] };
    },
  };
}

export default {
  id: 'tulip',
  name: '昭和鬱金香',
  type: '普通機（チューリップ台）',
  tagline: '沒有螢幕。鋼珠進洞就賠 4 顆。最容易懂。',
  spec: [['全部入賞口', '賠 4 顆'], ['鬱金香', '4 個'], ['打法', '左打，瞄準天四本']],
  help: [
    '鋼珠進任何一個入賞口，賠 4 顆。',
    '鬱金香合著時開口很窄。進一顆，花瓣張開。再進一顆，花瓣合起來。',
    '天穴：打開左右鬱金香。袖：打開同一側和最下面的鬱金香。落：打開中央鬱金香。',
    '力道讓鋼珠剛好撞到天四本。鋼珠會散到中間，最容易進洞。',
  ],
  defaultPower: 0.5, zones: { foul: 0.16, left: [0.39, 0.57] },
  build, createLogic,
};
