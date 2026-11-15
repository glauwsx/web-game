// 壽司與食材。每貫用掉 1 單位的對應食材。
// ref：參考售價。make：製作時間（分）。costP：高級食材成本。costC：便宜食材成本。

export const SUSHI = {
  tamago:  { tier: 1, ref: 100, make: 1.0, costP: 30,  costC: 15 },
  kappa:   { tier: 1, ref: 100, make: 1.0, costP: 25,  costC: 12 },
  inari:   { tier: 1, ref: 120, make: 0.8, costP: 30,  costC: 15 },
  ika:     { tier: 2, ref: 200, make: 1.2, costP: 70,  costC: 35 },
  sake:    { tier: 2, ref: 220, make: 1.2, costP: 80,  costC: 40 },
  ebi:     { tier: 2, ref: 250, make: 1.3, costP: 90,  costC: 45 },
  maguro:  { tier: 2, ref: 300, make: 1.2, costP: 110, costC: 50 },
  anago:   { tier: 3, ref: 400, make: 1.6, costP: 150, costC: 70 },
  ikura:   { tier: 3, ref: 450, make: 1.5, costP: 180, costC: 90 },
  chutoro: { tier: 3, ref: 500, make: 1.3, costP: 220, costC: 60, swordfish: true },
  uni:     { tier: 4, ref: 700, make: 1.5, costP: 320, costC: 140 },
  otoro:   { tier: 4, ref: 800, make: 1.4, costP: 380, costC: 60, swordfish: true },
};

export const SUSHI_ORDER = ['tamago', 'kappa', 'inari', 'ika', 'sake', 'ebi', 'maguro', 'anago', 'ikura', 'chutoro', 'uni', 'otoro'];

// 套餐（小遊戲獎品用）。內容是各等級的貫數。
export const SETS = {
  set_nami:   { tiers: { 2: 2 } },
  set_jo:     { tiers: { 3: 1, 2: 3 } },
  set_tokujo: { tiers: { 4: 2, 3: 3, 2: 3 } },
};

export const GRADES = ['premium', 'cheap'];
export const QUALITY = { premium: 3, cheap: 1 };
export const MENU_MODES = ['premium', 'cheapHonest', 'cheapDisguised'];

/** 賣法對應的食材等級。 */
export function gradeOfMode(mode) {
  return mode === 'premium' ? 'premium' : 'cheap';
}

/** 某個等級的所有壽司 id。 */
export function sushiOfTier(tier) {
  return SUSHI_ORDER.filter((id) => SUSHI[id].tier === tier);
}
