// 像素圖總表：名稱 → 像素圖資料。圖鑑頁和繪圖模組都從這裡拿。
import { TILE_SPRITES, WALL_SPRITES, SHADOW_SPRITE } from './tiles.js';
import { FURNITURE_SPRITES, SCENERY_SPRITES } from './furniture.js';
import { SUSHI_SPRITES } from './sushi.js';
import { buildCharacter, POSES } from './characters.js';
import { CAST_LOOKS, CUSTOMER_LOOKS } from '../characters.js';

export { POSES };

/** 靜態像素圖（瓦片、牆、家具、壽司、背景）。 */
export const STATIC_SPRITES = {
  ...TILE_SPRITES,
  ...WALL_SPRITES,
  shadow: SHADOW_SPRITE,
  ...FURNITURE_SPRITES,
  ...SCENERY_SPRITES,
  ...SUSHI_SPRITES,
};

/** 所有角色外觀：id → look。一般顧客的 id 是「類型.編號」，例如 'normal.0'。 */
export function allLooks() {
  const out = { ...CAST_LOOKS };
  for (const [type, list] of Object.entries(CUSTOMER_LOOKS)) {
    list.forEach((look, i) => { out[`${type}.${i}`] = look; });
  }
  return out;
}

const charCache = {};

/** 取得某個角色的全部畫格（有快取）。 */
export function characterFrames(id) {
  if (!charCache[id]) {
    const look = allLooks()[id];
    if (!look) return null;
    charCache[id] = buildCharacter(look);
  }
  return charCache[id];
}

/** 某個顧客類型有幾種外觀。 */
export function customerLookCount(type) {
  return (CUSTOMER_LOOKS[type] || []).length;
}
