// 存檔、讀檔、版本遷移。
// storage 由外面傳入（瀏覽器是 localStorage，測試用假的）。
// localStorage 不能用時改存在記憶體，遊戲照常運作。

export const SAVE_KEYS = {
  settings: 'sushi.v1.settings',
  levels: 'sushi.v1.levels',
  endless: 'sushi.v1.endless',
  customer: 'sushi.v1.customer',
};

/** 取得瀏覽器的 localStorage。不能用時回傳 null。 */
export function probeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const k = '__sushi_probe__';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch (e) {
    return null;
  }
}

export function createSaveStore(storage) {
  const memory = {};
  const available = !!storage;
  let noticePending = !available;

  function rawGet(key) {
    if (!available) return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    try { return storage.getItem(key); } catch (e) { return null; }
  }

  return {
    available,
    /**
     * 讀檔。
     * spec = { version, defaults(), migrations: { [舊版本]: (data) => 新資料 } }
     * 回傳 { data, status }。status 是 'ok'、'empty'、'corrupt' 其中之一。
     * 壞掉的存檔不會被自動刪除。呼叫的人決定要不要重設。
     */
    load(key, spec) {
      const raw = rawGet(key);
      if (raw === null || raw === undefined) return { data: spec.defaults(), status: 'empty' };
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return { data: spec.defaults(), status: 'corrupt' };
      }
      if (!data || typeof data !== 'object' || typeof data.version !== 'number') {
        return { data: spec.defaults(), status: 'corrupt' };
      }
      try {
        let guard = 0;
        while (data.version < spec.version) {
          const fn = spec.migrations && spec.migrations[data.version];
          if (!fn || guard++ > 100) return { data: spec.defaults(), status: 'corrupt' };
          const from = data.version;
          data = fn(data);
          if (!data || data.version <= from) return { data: spec.defaults(), status: 'corrupt' };
        }
      } catch (e) {
        return { data: spec.defaults(), status: 'corrupt' };
      }
      if (data.version > spec.version) return { data: spec.defaults(), status: 'corrupt' };
      if (spec.validate && !spec.validate(data)) return { data: spec.defaults(), status: 'corrupt' };
      return { data, status: 'ok' };
    },
    /** 存檔。成功回傳 true。 */
    save(key, data) {
      const raw = JSON.stringify(data);
      if (!available) { memory[key] = raw; return false; }
      try {
        storage.setItem(key, raw);
        return true;
      } catch (e) {
        memory[key] = raw;
        noticePending = true;
        return false;
      }
    },
    remove(key) {
      delete memory[key];
      if (available) { try { storage.removeItem(key); } catch (e) { /* 忽略 */ } }
    },
    has(key) { return rawGet(key) !== null; },
    /** 讀出原始字串（匯出存檔用）。 */
    raw(key) { return rawGet(key); },
    /** 「無法存檔」的提示只顯示一次。回傳 true 代表現在該顯示。 */
    consumeUnavailableNotice() {
      if (!noticePending) return false;
      noticePending = false;
      return true;
    },
  };
}
