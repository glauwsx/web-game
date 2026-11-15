// 所有顯示文字與對話。程式用 t('鍵') 取字串，{name} 會被參數取代。

export const STRINGS = {
  'title.name': '超神田壽司',
  'title.sub': '真工夫對決',
  'title.start': '點一下或按任意鍵開始',
  'title.note': '同人作品．非官方',

  'rotate.msg': '請把手機轉橫',

  'menu.owner': '店家版本',
  'menu.owner.desc': '經營阿兩的壽司店',
  'menu.customer': '顧客版本',
  'menu.customer.desc': '直接玩小鋼珠和賽車',
  'menu.settings': '設定',
  'menu.back': '返回',

  'owner.title': '店家版本',
  'owner.levels': '關卡模式',
  'owner.levels.desc': '10 關。營業額要贏過憂鬱的店',
  'owner.endless': '無限模式',
  'owner.endless.desc': '長期經營。自由擺設、擴建、研發',

  'placeholder.title': '施工中',
  'placeholder.body': '「{name}」還沒做好。',

  'save.unavailable': '這個瀏覽器無法存檔。遊戲可以照常玩，但關掉後進度會消失。',
  'save.corrupt': '存檔「{name}」壞掉了。',
  'save.corrupt.reset': '重設這份存檔',
  'save.corrupt.keep': '先不管它',
  'save.name.settings': '設定',
  'save.name.levels': '關卡進度',
  'save.name.endless': '無限模式',
  'save.name.customer': '顧客版本紀錄',

  // 角色名稱
  'char.ryo': '阿兩',
  'char.ryoDisguise': '淺草一郎',
  'char.nakagawa': '中川',
  'char.reiko': '麗子',
  'char.bucho': '部長',
  'char.honda': '本田',
  'char.terai': '寺井',
  'char.matoi': '纏',
  'char.lemon': '檸檬',
  'char.geparuto': '夏春都',
  'char.yuutsu': '憂鬱',
  'char.shumaha': '修馬哈',
  'char.pro': '職業玩家',

  // 圖鑑頁
  'gallery.characters': '角色（全部姿勢）',
  'gallery.furniture': '家具與設施',
  'gallery.sushi': '壽司與套餐',
  'gallery.tiles': '瓦片與牆面',
  'gallery.scenery': '店外背景',
  'gallery.mini': '小遊戲',
  'gallery.palette': '調色盤（{n} 色）',
  'gallery.back': '背',
  'gallery.flip': '翻轉',
  'gallery.portrait': '大頭像',
  'gallery.portraitAngry': '生氣',
  'gallery.pose.stand': '站立',
  'gallery.pose.walk1': '走路 1',
  'gallery.pose.walk2': '走路 2',
  'gallery.pose.sit': '坐著',
  'gallery.pose.work': '工作',
  'gallery.pose.happy': '高興',
  'gallery.pose.angry': '生氣',
  'gallery.char.ryo': '阿兩（板前服）',
  'gallery.char.ryo_police': '阿兩（警察制服）',
  'gallery.char.ryo_disguise': '阿兩變裝（淺草一郎）',
  'gallery.char.nakagawa': '中川圭一',
  'gallery.char.reiko': '麗子',
  'gallery.char.bucho': '大原部長',
  'gallery.char.honda': '本田速人',
  'gallery.char.honda_apron': '本田（外場圍裙）',
  'gallery.char.terai': '寺井洋一',
  'gallery.char.matoi': '纏',
  'gallery.char.lemon': '檸檬',
  'gallery.char.geparuto': '夏春都',
  'gallery.char.yuutsu': '憂鬱',
  'gallery.char.shumaha': '修馬哈（F1 車手）',
  'gallery.char.pro': '小鋼珠職業玩家',
  'gallery.char.normal': '一般客',
  'gallery.char.salaryman': '上班族',
  'gallery.char.family': '家庭客',
  'gallery.char.tourist': '外國觀光客',
  'gallery.char.gourmet': '美食家',
  'gallery.char.pachinkoFan': '小鋼珠迷',
  'gallery.char.raceFan': '賽車迷',

  // 像素圖名稱
  'sprite.furn.chefStation': '板前檯',
  'sprite.furn.counterSeat': '吧台座',
  'sprite.furn.tableSet': '桌位',
  'sprite.furn.pachinko': '小鋼珠台',
  'sprite.furn.raceTrack': '壽司賽道',
  'sprite.furn.fridge': '冰箱',
  'sprite.furn.lantern': '招牌燈籠',
  'sprite.furn.fishTank': '魚缸',
  'sprite.furn.plant': '盆栽',
  'sprite.furn.uniformSign': '均一價招牌',
  'sprite.furn.door': '入口',
  'sprite.sushi.tamago': '玉子',
  'sprite.sushi.kappa': '小黃瓜捲',
  'sprite.sushi.inari': '豆皮壽司',
  'sprite.sushi.ika': '花枝',
  'sprite.sushi.sake': '鮭魚',
  'sprite.sushi.ebi': '蝦',
  'sprite.sushi.maguro': '鮪魚赤身',
  'sprite.sushi.anago': '星鰻',
  'sprite.sushi.ikura': '鮭魚卵軍艦',
  'sprite.sushi.chutoro': '鮪魚中腹',
  'sprite.sushi.uni': '海膽軍艦',
  'sprite.sushi.otoro': '黑鮪魚大腹',
  'sprite.sushi.coupon': '招待券',
  'sprite.set.nami': '並套餐',
  'sprite.set.jo': '上套餐',
  'sprite.set.tokujo': '特上拼盤',
  'sprite.tile.wood': '木地板',
  'sprite.tile.tatami': '榻榻米',
  'sprite.tile.stone': '石板',
  'sprite.tile.street': '街道',
  'sprite.tile.streetLine': '街道中線',
  'sprite.tile.sidewalk': '人行道',
  'sprite.tile.grass': '草地',
  'sprite.tile.mat': '門口踏墊',
  'sprite.wall.L': '左後牆',
  'sprite.wall.R': '右後牆',
  'sprite.wall.L.shoji': '左後牆（障子）',
  'sprite.wall.R.shoji': '右後牆（障子）',
  'sprite.shadow': '影子',
  'sprite.scene.houseA': '鄰居房屋 A',
  'sprite.scene.houseB': '鄰居房屋 B',
  'sprite.scene.houseC': '鄰居房屋 C',
  'sprite.scene.pole': '電線桿',

  'demo.hint': '展示場景：拖曳平移，滾輪或雙指縮放',
  'demo.zoom': '縮放',

  'common.ok': '好',
  'common.cancel': '取消',
  'common.close': '關閉',
};

/** 取字串。找不到鍵時回傳「⟦鍵⟧」，方便在畫面上發現漏字。 */
export function t(key, params) {
  let s = STRINGS[key];
  if (s === undefined) return `⟦${key}⟧`;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
  }
  return s;
}

/** 測試用：這個鍵存不存在。 */
export function hasString(key) {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}
