// 壽司圖示：12 種，各 12×8 像素。小遊戲和菜單共用。另有 3 種套餐圖示（16×10）。
import { fromRows } from './pixgrid.js';

export const SUSHI_SPRITES = {
  // 玉子：黃色蛋塊加海苔帶
  'sushi.tamago': fromRows([
    '............',
    '..yyyyyyyy..',
    '.yyYYjjYYyy.',
    '.yyyyjjyyye.',
    '.wwwwjjwwww.',
    '.wwwwjjwwwG.',
    '..GwwwwwwG..',
    '............',
  ]),
  // 小黃瓜捲：海苔捲，中心是綠色
  'sushi.kappa': fromRows([
    '............',
    '..jjjj.jjjj.',
    '.jwwwwjwwwwj',
    '.jwlNwjwlNwj',
    '.jwNlwjwNlwj',
    '.jwwwwjwwwwj',
    '..jjjj.jjjj.',
    '............',
  ]),
  // 豆皮壽司
  'sushi.inari': fromRows([
    '............',
    '...oooooo...',
    '..oeeeeeeo..',
    '.oeeoeeeeeo.',
    '.oeeeeeoeeo.',
    '.oeeeeeeeeo.',
    '..oooooooo..',
    '............',
  ]),
  // 花枝：白色帶光澤
  'sushi.ika': fromRows([
    '............',
    '..wwwwwwww..',
    '.wwEwwEwwEw.',
    '.wEwwEwwEwE.',
    '.EwwwwwwwwE.',
    '.wwwwwwwwwG.',
    '..GwwwwwwG..',
    '............',
  ]),
  // 鮭魚：橘色帶白紋
  'sushi.sake': fromRows([
    '............',
    '..ffffffff..',
    '.ffxffxffxf.',
    '.fxffxffxff.',
    '.ofwwwwwwfo.',
    '.wwwwwwwwwG.',
    '..GwwwwwwG..',
    '............',
  ]),
  // 蝦：橘白相間加尾巴
  'sushi.ebi': fromRows([
    '..........R.',
    '..xxfxxfxRR.',
    '.xwxfwxfwxR.',
    '.xxfxxfxxf..',
    '.fwwwwwwwf..',
    '.wwwwwwwwwG.',
    '..GwwwwwwG..',
    '............',
  ]),
  // 鮪魚赤身：深紅
  'sushi.maguro': fromRows([
    '............',
    '..FFFFFFFF..',
    '.FFRFFFRFFF.',
    '.FFFFRFFFFm.',
    '.mFwwwwwwFm.',
    '.wwwwwwwwwG.',
    '..GwwwwwwG..',
    '............',
  ]),
  // 星鰻：褐色加醬汁
  'sushi.anago': fromRows([
    '............',
    '..cccccccc..',
    '.cbcacbcacb.',
    '.ccbccbccbc.',
    '.bcwwwwwwcb.',
    '.wwwwwwwwwG.',
    '..GwwwwwwG..',
    '............',
  ]),
  // 鮭魚卵軍艦
  'sushi.ikura': fromRows([
    '............',
    '..zRzRzRzR..',
    '.zRzozRzozR.',
    '.jjjjjjjjjj.',
    '.jjjjjjjjjj.',
    '.jjjjjjjjjj.',
    '..jjjjjjjj..',
    '............',
  ]),
  // 鮪魚中腹：粉紅帶細紋
  'sushi.chutoro': fromRows([
    '............',
    '..RRRRRRRR..',
    '.RxRRxRRxRR.',
    '.RRxRRxRRxr.',
    '.rRwwwwwwRr.',
    '.wwwwwwwwwG.',
    '..GwwwwwwG..',
    '............',
  ]),
  // 海膽軍艦
  'sushi.uni': fromRows([
    '............',
    '..zeyzeyze..',
    '.zyzezyzezy.',
    '.jjjjjjjjjj.',
    '.jjjjjjjjjj.',
    '.jjjjjjjjjj.',
    '..jjjjjjjj..',
    '............',
  ]),
  // 黑鮪魚大腹：淡粉紅帶油花
  'sushi.otoro': fromRows([
    '............',
    '..xxxxxxxx..',
    '.xPxxPxxPxx.',
    '.xxPxxPxxPp.',
    '.pxwwwwwwxp.',
    '.wwwwwwwwwG.',
    '..GwwwwwwG..',
    '............',
  ]),
  // 招待券（獎品發不出來時）
  'sushi.coupon': fromRows([
    '............',
    '.WWWWWWWWWW.',
    '.WrrWWWWrrW.',
    '.WWWrrrrWWW.',
    '.WWWrrrrWWW.',
    '.WrrWWWWrrW.',
    '.WWWWWWWWWW.',
    '............',
  ]),

  // 套餐
  'set.nami': fromRows([
    '................',
    '..FFFFFF.ffffff.',
    '.FFRFFFFfxffxff.',
    '.mwwwwwmowwwwwo.',
    '.wwwwwwGwwwwwwG.',
    '.aaaaaaaaaaaaaa.',
    'abbbbbbbbbbbbbba',
    '.aa..........aa.',
    '................',
    '................',
  ]),
  'set.jo': fromRows([
    '................',
    '.RRRR.FFFF.ffff.',
    '.RxRr.FRFm.fxfo.',
    '.wwwG.wwwG.wwwG.',
    '..xxfxR..cccc...',
    '..wwwwG..bcab...',
    '.aaaaaaaaaaaaaa.',
    'abbbbbbbbbbbbbba',
    '.aa..........aa.',
    '................',
  ]),
  'set.tokujo': fromRows([
    '.....eeeeee.....',
    '.xxxx.zeyz.RRRR.',
    '.xPxp.jjjj.RxRr.',
    '.wwwG.jjjj.wwwG.',
    '.zRzR.FFFF.cccc.',
    '.jjjj.FRFm.bcab.',
    '.jjjj.wwwG.wwwG.',
    'eeeeeeeeeeeeeeee',
    'ebbbbbbbbbbbbbbe',
    '.ee..........ee.',
  ]),
};

export const SUSHI_IDS = ['tamago', 'kappa', 'inari', 'ika', 'sake', 'ebi', 'maguro', 'anago', 'ikura', 'chutoro', 'uni', 'otoro'];
