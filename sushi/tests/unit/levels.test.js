// 單元測試 14：關卡資料完整性。家具不重疊、座位和機台都走得到、引用的 id 和字串都存在。
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, levelConfig } from '../../src/data/levels.js';
import { validateShop } from '../../src/sim/pathfind.js';
import { FURNITURE } from '../../src/data/furniture.js';
import { SUSHI } from '../../src/data/sushi.js';
import { STAFF, CUSTOMER_TYPES, CAST_LOOKS } from '../../src/data/characters.js';
import { TRACK_ORDER } from '../../src/data/tracks.js';
import { hasString } from '../../src/data/strings.js';
import { createShopState } from '../../src/sim/shop.js';

const EVENT_KINDS = ['bucho', 'pro', 'shumaha', 'lemon'];

for (const lv of LEVELS) {
  test(`第 ${lv.id} 關的資料完整`, () => {
    assert.deepEqual(validateShop(lv.shop), [], '店面格局合法');
    for (const f of lv.shop.furniture) {
      assert.ok(FURNITURE[f.type], f.type);
      if (f.track !== undefined) assert.ok(TRACK_ORDER[f.track], `賽道 ${f.track}`);
    }
    for (const id of lv.menu) assert.ok(SUSHI[id], id);
    for (const s of lv.staff) assert.ok(STAFF[s.id], s.id);
    assert.ok(lv.staff.some((s) => s.role === 'chef'), '至少一位師傅');
    for (const type of Object.keys(lv.mix)) assert.ok(CUSTOMER_TYPES[type], type);
    for (const e of lv.events || []) assert.ok(EVENT_KINDS.includes(e.kind), e.kind);
    assert.ok(hasString(`level.${lv.id}.name`));
    for (const part of ['intro', 'pass', 'fail']) {
      assert.ok(lv[part] && lv[part].length >= 2, `${part} 有對話`);
      for (const line of lv[part]) {
        assert.ok(hasString(line.key), line.key);
        assert.ok(CAST_LOOKS[line.who], `說話的人 ${line.who}`);
      }
    }
    for (const step of (lv.tutorial || []).concat(lv.hints || [])) assert.ok(hasString(step.key), step.key);
    // 機台關卡：獎品要用的高等級壽司在菜單上
    if (lv.shop.furniture.some((f) => FURNITURE[f.type].machine)) {
      assert.ok(lv.menu.some((id) => SUSHI[id].tier >= 3), '有 T3 以上的品項可以當獎品');
    }
    const s = createShopState(levelConfig(lv.id, 1));
    assert.equal(s.levelId, lv.id);
  });
}
