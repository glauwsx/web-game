import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIC_SPRITES, allLooks, characterFrames, POSES, customerLookCount } from '../../src/data/sprites/index.js';
import { PALETTE, PALETTE_SIZE } from '../../src/data/sprites/palette.js';
import { SUSHI_IDS } from '../../src/data/sprites/sushi.js';
import { hasString } from '../../src/data/strings.js';

function checkSprite(name, sp) {
  assert.equal(sp.rows.length, sp.h, `${name} 行數`);
  for (const row of sp.rows) {
    assert.equal(row.length, sp.w, `${name} 每行寬度`);
    for (const ch of row) assert.ok(ch in PALETTE, `${name} 用了調色盤沒有的字元「${ch}」`);
  }
}

test('像素圖：調色盤最多 48 色', () => {
  assert.ok(PALETTE_SIZE <= 48, `目前 ${PALETTE_SIZE} 色`);
});

test('像素圖：所有靜態圖格式正確，而且有名稱字串', () => {
  for (const [name, sp] of Object.entries(STATIC_SPRITES)) {
    checkSprite(name, sp);
    assert.ok(hasString(`sprite.${name}`), `缺字串 sprite.${name}`);
  }
});

test('像素圖：12 種壽司圖示都是 12×8', () => {
  assert.equal(SUSHI_IDS.length, 12);
  for (const id of SUSHI_IDS) {
    const sp = STATIC_SPRITES[`sushi.${id}`];
    assert.ok(sp, id);
    assert.equal(sp.w, 12);
    assert.equal(sp.h, 8);
  }
});

test('像素圖：計劃書列的家具都有圖', () => {
  for (const id of ['chefStation', 'counterSeat', 'tableSet', 'pachinko', 'raceTrack', 'fridge', 'lantern', 'fishTank', 'plant', 'uniformSign']) {
    assert.ok(STATIC_SPRITES[`furn.${id}`], id);
  }
  for (const id of ['wood', 'tatami', 'stone', 'street', 'grass']) assert.ok(STATIC_SPRITES[`tile.${id}`], id);
});

test('像素圖：每個角色有全部姿勢（正面、背面）且尺寸 16×24', () => {
  const looks = allLooks();
  for (const id of ['ryo', 'ryo_police', 'ryo_disguise', 'nakagawa', 'reiko', 'bucho', 'honda', 'terai', 'matoi', 'lemon', 'geparuto', 'yuutsu', 'shumaha', 'pro']) {
    assert.ok(looks[id], `缺角色 ${id}`);
  }
  for (const id of Object.keys(looks)) {
    const f = characterFrames(id);
    for (const pose of POSES) {
      for (const side of ['front', 'back']) {
        const sp = f[side][pose];
        checkSprite(`${id}.${side}.${pose}`, sp);
        assert.equal(sp.w, 16);
        assert.equal(sp.h, 24);
        // 腳要踩在最下面兩列之內
        assert.ok(/[^.]/.test(sp.rows[23]) || /[^.]/.test(sp.rows[22]), `${id}.${pose} 腳底位置`);
      }
    }
    checkSprite(`${id}.portrait`, f.portrait);
    assert.ok(hasString(`gallery.char.${id.replace(/\.\d+$/, '')}`), `缺字串 gallery.char.${id}`);
  }
});

test('像素圖：一般顧客至少 12 種外觀，每個類型至少 2 種', () => {
  let n = 0;
  for (const type of ['normal', 'salaryman', 'family', 'tourist', 'gourmet', 'pachinkoFan', 'raceFan']) {
    const c = customerLookCount(type);
    assert.ok(c >= 2, type);
    n += c;
  }
  assert.ok(n >= 12, `目前 ${n} 種`);
});

test('像素圖：不同角色的站立圖不一樣', () => {
  const seen = new Map();
  for (const id of Object.keys(allLooks())) {
    const key = characterFrames(id).front.stand.rows.join('');
    assert.ok(!seen.has(key), `${id} 跟 ${seen.get(key)} 外觀相同`);
    seen.set(key, id);
  }
});
