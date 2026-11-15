// 自動玩家（給平衡測試和除錯用）。純邏輯。
// botActions(state, name) 回傳這個 tick 要送出的操作清單。
import { applyAction, stepShop, createShopState } from './shop.js';

export const BOTS = {
  // naive：照系統建議量進貨，全部用預設設定，營業中不做任何操作，不回應事件。
  naive(state) {
    if (state.phase === 'prep') return [{ type: 'buySuggested' }, { type: 'open' }];
    return [];
  },
};

export function botActions(state, name) {
  const bot = BOTS[name];
  return bot ? bot(state) : [];
}

/** 讓自動玩家對目前狀態下一步棋，然後前進一個 tick。 */
export function botStep(state, name) {
  for (const a of botActions(state, name)) applyAction(state, a);
  stepShop(state);
}

/** 用自動玩家跑完一個營業日。回傳最終狀態。 */
export function runDay(cfg, name = 'naive', maxTicks = 100000) {
  const state = createShopState(cfg);
  for (let i = 0; i < maxTicks && state.phase !== 'closed'; i++) botStep(state, name);
  return state;
}
