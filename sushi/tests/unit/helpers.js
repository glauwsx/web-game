// 單元測試共用的店鋪設定。

/** 一間小店：1 座板前檯、4 個吧台座、1 張桌子。阿兩當師傅，本田當外場。 */
export function sampleConfig(over = {}) {
  return {
    seed: 1,
    mode: 'level',
    shop: {
      w: 8, h: 8, floor: 'wood', door: { gx: 3 },
      furniture: [
        { type: 'chefStation', x: 2, y: 1 },
        { type: 'counterSeat', x: 2, y: 2 },
        { type: 'counterSeat', x: 3, y: 2 },
        { type: 'counterSeat', x: 1, y: 2 },
        { type: 'counterSeat', x: 4, y: 2 },
        { type: 'tableSet', x: 5, y: 4 },
      ],
    },
    staff: [{ id: 'ryo', role: 'chef' }, { id: 'honda', role: 'floor' }],
    menu: ['tamago', 'kappa', 'ika', 'sake', 'ebi', 'maguro'],
    money: 50000,
    reputation: 30,
    hours: [11, 21],
    baseArrival: 0.18,
    mix: { normal: 5, salaryman: 2, family: 1 },
    goal: { kind: 'rival', target: 35000 },
    ...over,
  };
}
