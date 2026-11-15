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
