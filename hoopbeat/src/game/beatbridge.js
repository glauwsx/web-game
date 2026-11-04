// 拍點橋接：把「音樂」和「籃球模擬」接起來。
//  1. 每一步更新兩隊的音樂修正值（mods），球員的跑速、命中率、失誤、犯規……都讀這份。
//  2. 包住投籃、傳球、過人、抄截、蓋火鍋：玩家按下的瞬間做拍點判定；
//     電腦球員會把動作排到下一個拍點（越急躁越常等不及，直接出手）。
//  3. 播進攻方的歌：換邊時通知指揮。
// 瀏覽器和無頭模擬共用；差別只在時鐘（音訊時鐘 vs 模擬時間）。

import { judge, Combo, GRADE_INFO } from '../rhythm/judge.js';
import { teamModifiers, baseModifiers, GRADE_EFFECT } from '../music/effects.js';
import { chooseShotKind } from '../hoops/sim/shooting.js';
import { GRAVITY } from '../hoops/sim/constants.js';

// 電腦球員按拍子的誤差（秒，常態分布的標準差）
export const AI_SIGMA = { easy: 0.055, normal: 0.042, hard: 0.03 };
// 投籃：判定結果 → 命中率倍數
export const SHOT_MUL = { perfect: 1.22, great: 1.06, good: 0.9, miss: 0.64 };

const DECK_IDS = ['home', 'away'];

export class BeatBridge {
  constructor({ conductor, clock = null, difficulty = 'normal', latencyMs = 0, aiSigma = null, headless = false } = {}) {
    this.conductor = conductor;
    this.clock = clock; // () => 現在的音訊時間（聽得到的）；null = 用模擬時間
    this.difficulty = difficulty;
    this.latencyMs = latencyMs;
    this.aiSigma = aiSigma ?? AI_SIGMA[difficulty] ?? AI_SIGMA.normal;
    this.headless = headless;
    this.game = null;
    this.combos = [new Combo(), new Combo()];
    this.mods = [baseModifiers(), baseModifiers()];
    this.feats = [null, null];
    this.heat = new Map();
    this.intents = new Map();
    this.judgments = []; // 給 HUD：最近的判定
    this.bypass = false;
    this.cur = null; // 正在執行的動作的判定
    this.featTimer = 0;
    this.lastOffense = -1;
    this.stats = [0, 1].map(() => ({ perfect: 0, great: 0, good: 0, miss: 0, rush: 0, boosts: 0, judged: 0, badPass: 0, fumble: 0 }));
    this.djEnabled = [true, true];
  }

  deck(team) {
    return this.conductor.decks[DECK_IDS[team]];
  }

  get grid() {
    return this.conductor.grid;
  }

  now() {
    if (this.clock) return this.clock();
    return this.game ? this.game.time : 0;
  }

  // ── 安裝到 Game 上 ──
  install(game) {
    this.game = game;
    game.beat = this;
    const self = this;

    const origStep = game.step.bind(game);
    game.step = (dt) => {
      self.preStep(dt);
      origStep(dt);
      self.postStep(dt);
    };

    const wrap = (name, kindOf) => {
      const orig = game[name].bind(game);
      game[name] = (...args) => {
        const p = args[0];
        const kind = kindOf(args);
        if (self.bypass || !kind || !p) return orig(...args);
        if (p.human) return self.humanAct(p, kind, () => orig(...args));
        return self.aiAct(p, kind, () => orig(...args), args);
      };
    };
    wrap('startShot', (a) => (a[1] && a[1].kind === 'ft' ? null : 'shot'));
    wrap('passBall', (a) => (a[2] && a[2].inbound ? null : 'pass'));
    wrap('attemptSteal', () => 'steal');
    wrap('dribbleMove', () => 'dribble');
    wrap('jumpPlayer', (a) => (a[1] === 'block' ? 'block' : null));
    return this;
  }

  // ── 每一步 ──
  preStep(dt) {
    const g = this.game;
    if (this.headless) this.conductor.tick(g.time, 0.15);
    // 播進攻方的歌
    const off = g.offenseTeam();
    if (off !== this.lastOffense && (off === 0 || off === 1)) {
      this.conductor.setAudible(DECK_IDS[off]);
      this.lastOffense = off;
    }
    this.featTimer -= dt;
    if (this.featTimer <= 0) {
      this.featTimer = 0.1;
      this.refreshMods();
    }
    for (const p of g.everyoneOnCourt()) p.mods = this.mods[p.team];
    // 手感慢慢退燒
    for (const [id, h] of this.heat) this.heat.set(id, Math.max(0, h - dt * 0.012));
    this.runIntents();
    this.updateAIDJ();
  }

  postStep() {
    for (const e of this.game.events) {
      if (e.type === 'score' && e.player && e.points !== 1) this.addHeat(e.player, 1);
    }
  }

  refreshMods() {
    const now = this.now();
    for (const t of [0, 1]) {
      const d = this.deck(t);
      const f = d.features();
      const c = this.combos[t];
      this.feats[t] = f;
      this.mods[t] = teamModifiers(f, { combo: c.count, feel: c.feel(), morale: d.morale(now) });
    }
  }

  // ── 判定 ──
  judgeAt(p, kind, time, opts = {}) {
    const lat = p.human ? this.latencyMs : 0;
    const j = judge(time, this.grid, { latencyMs: lat, difficulty: this.difficulty, strongOnly: !!opts.strongOnly });
    j.kind = kind;
    j.team = p.team;
    j.player = p;
    j.human = !!p.human;
    j.rush = !!opts.rush;
    j.t = time;
    const s = this.stats[p.team];
    s[j.grade] += 1;
    s.judged += 1;
    if (opts.rush) s.rush += 1;
    this.combos[p.team].register(j.grade);
    j.combo = this.combos[p.team].count;
    this.judgments.push(j);
    if (this.judgments.length > 40) this.judgments.shift();
    if (this.game) this.game.emit('beatJudge', { player: p, team: p.team, kind, grade: j.grade, offsetMs: j.offsetMs, strong: j.strong, weakBeat: j.weakBeat, combo: j.combo, human: j.human });
    return j;
  }

  humanAct(p, kind, fn) {
    // 跳投和罰球在「放開按鈕」時判定；其他動作在按下時判定
    if (kind === 'shot') {
      const ok = fn();
      const a = p.action;
      if (ok && a && a.type === 'shot' && (a.kind === 'layup' || a.kind === 'dunk')) a.beat = this.judgeAt(p, 'shot', this.now());
      return ok;
    }
    if (this.game.phase !== 'live' && kind !== 'pass') return fn();
    const j = this.game.phase === 'live' ? this.judgeAt(p, kind, this.now()) : null;
    this.cur = j;
    const ok = fn();
    this.cur = null;
    if (ok && j && p.action && (kind === 'steal' || kind === 'block')) p.action.beat = j;
    return ok;
  }

  gauss() {
    const r = this.game.rng;
    return typeof r.gauss === 'function' ? r.gauss(0, 1) : (r.next() + r.next() + r.next() - 1.5) * 2;
  }

  aiAct(p, kind, fn, args) {
    const g = this.game;
    if (g.phase !== 'live') return fn();
    if (kind === 'block') {
      // 蓋火鍋要配合對手出手，沒辦法等拍點：照實際時間判定
      const ok = fn();
      if (ok && p.action) p.action.beat = this.judgeAt(p, 'block', this.now());
      return ok;
    }
    if (this.intents.has(p.id)) return true; // 已經決定好了，在等拍點
    const now = this.now();
    const m = this.mods[p.team];
    const rush = g.rng.next() < 0.05 + 0.35 * m.haste; // 急躁：等不及拍點
    const r = g.rules;
    const urgent = (!r.shotClockOff && r.shotClock < 1.4) || r.gameClock < 1.4;
    const intent = { kind, fn, rush: rush || urgent, created: now, args };
    if (intent.rush) {
      intent.at = now;
    } else if (kind === 'shot') {
      const sk = chooseShotKind(g, p, { allowDunk: args[1]?.allowDunk !== false });
      if (sk === 'jump') {
        // 跳投：最佳出手點在強拍。先算起跳到出手要多久，往回推起手時間
        const lead = 0.13 + (0.92 * p.jumpVelocity('shot')) / GRAVITY;
        const patience = 0.85 + 0.6 * m.calm;
        let target = this.grid.nextBeat(now + lead, { strongOnly: true });
        if (target.time - lead - now > patience) target = this.grid.nextBeat(now + lead);
        intent.at = target.time - lead;
        intent.release = target.time + this.gauss() * this.aiSigma;
      } else {
        intent.at = this.grid.nextBeat(now + 0.02).time + this.gauss() * this.aiSigma;
      }
    } else {
      intent.at = this.grid.nextBeat(now + 0.02).time + this.gauss() * this.aiSigma;
    }
    this.intents.set(p.id, intent);
    if (intent.at <= now) this.fireIntent(p, intent);
    return true;
  }

  hasIntent(p) {
    return this.intents.has(p.id);
  }

  runIntents() {
    if (!this.intents.size) return;
    const now = this.now();
    for (const p of this.game.everyoneOnCourt()) {
      const it = this.intents.get(p.id);
      if (it && now >= it.at) this.fireIntent(p, it);
    }
    // 換人下場的球員
    for (const id of [...this.intents.keys()]) {
      if (!this.game.everyoneOnCourt().some((p) => p.id === id)) this.intents.delete(id);
    }
  }

  fireIntent(p, it) {
    const g = this.game;
    this.intents.delete(p.id);
    if (g.phase !== 'live') return;
    const needBall = it.kind === 'shot' || it.kind === 'pass' || it.kind === 'dribble';
    if (needBall && g.ball.holder !== p) return;
    if (p.action || p.airborne) return;
    if (it.kind === 'pass') {
      const recv = it.args[1];
      if (!recv || !recv.onCourt || recv.team !== p.team) return;
    }
    const t = it.rush ? this.now() : it.at;
    this.bypass = true;
    try {
      if (it.kind === 'shot') {
        p.beatRelease = it.release ?? null;
        p.beatRush = it.rush;
        const ok = it.fn();
        const a = p.action;
        if (ok && a && a.type === 'shot' && (a.kind === 'layup' || a.kind === 'dunk')) a.beat = this.judgeAt(p, 'shot', t, { rush: it.rush });
        p.beatRelease = null;
      } else {
        const j = this.judgeAt(p, it.kind, t, { rush: it.rush });
        this.cur = j;
        const ok = it.fn();
        this.cur = null;
        if (ok && p.action && it.kind === 'steal') p.action.beat = j;
      }
    } finally {
      this.bypass = false;
      this.cur = null;
    }
  }

  // ── 給 hoops 模擬層呼叫的掛勾（標記 HOOPBEAT 的地方） ──

  // 電腦跳投：把出手時間對齊拍點。回傳相對於動作開始的秒數，或 null 用原本的算法
  aiReleaseAt(p, a) {
    if (p.beatRelease == null) {
      if (p.beatRush || a.kind === 'ft') {
        // 急躁或罰球：罰球會等強拍；急躁的跳投照原本時間
        if (a.kind === 'ft') {
          const now = this.now();
          const tb = this.grid.nextBeat(now + a.ideal * 0.8, { strongOnly: true }).time + this.gauss() * this.aiSigma;
          a.beatReleaseTime = tb;
          return Math.max(0.2, tb - now);
        }
        return null;
      }
      return null;
    }
    const now = this.now();
    const rel = p.beatRelease - now;
    const min = a.gather + 0.08;
    const max = a.gather + (1.7 * a.jumpV) / GRAVITY;
    a.beatReleaseTime = p.beatRelease;
    return Math.max(min, Math.min(max, rel));
  }

  // 投籃出手時：判定 + 命中率倍數
  shotTiming(p, a) {
    let j = a.beat || null;
    if (!j && (a.kind === 'jump' || a.kind === 'ft')) {
      const t = !p.human && a.beatReleaseTime != null ? a.beatReleaseTime : this.now();
      j = this.judgeAt(p, 'shot', t, { strongOnly: true, rush: !!p.beatRush && !p.human });
    }
    p.beatRush = false;
    if (!j) return { mul: 1, grade: 'auto' };
    a.beat = j;
    return { mul: SHOT_MUL[j.grade], grade: j.grade, beat: j };
  }

  // 投籃命中率的加減（百分點）：音樂 + 手感 + 助攻
  shotBonus(p, assisted) {
    const m = this.mods[p.team];
    let b = m.shot + this.heatBonus(p);
    if (assisted) b += m.assist;
    return b;
  }

  heatBonus(p) {
    return 0.06 * Math.min(1.5, this.heat.get(p.id) || 0);
  }

  isHot(p) {
    return (this.heat.get(p.id) || 0) >= 1;
  }

  addHeat(p, made) {
    const m = this.mods[p.team];
    const h = this.heat.get(p.id) || 0;
    this.heat.set(p.id, Math.max(0, Math.min(1.6, h + (made ? 0.42 * m.heat : -0.3))));
  }

  onShotMissed(p) {
    this.addHeat(p, 0);
  }

  foulMul(team) {
    return this.mods[team].foul;
  }

  defenseMul(team) {
    return this.mods[team].defense;
  }

  reboundMul(team) {
    return this.mods[team].rebound;
  }

  // 傳球：誤差倍數、是否變成失誤（傳歪）
  passOutcome(p) {
    const j = this.cur;
    const m = this.mods[p.team];
    const g = j ? j.grade : 'good';
    const errMul = { perfect: 0.5, great: 0.8, good: 1, miss: 1.9 }[g] * Math.max(0.4, 1 - 2 * m.pass);
    const bad = Math.max(0, m.turnover * 0.9 + (g === 'miss' ? 0.07 : 0) - GRADE_EFFECT.pass[g] * 0.3);
    const isBad = this.game.rng.next() < bad;
    if (isBad) this.stats[p.team].badPass += 1;
    return { errMul, bad: isBad, speedMul: g === 'perfect' ? 0.9 : 1 };
  }

  // 過人：成功率加減、運球失誤的機率加減
  dribbleOutcome(p) {
    const j = this.cur;
    const m = this.mods[p.team];
    const g = j ? j.grade : 'good';
    return { bonus: GRADE_EFFECT.dribble[g] + m.dribble, fumble: Math.max(0, m.turnover * 0.8 + (g === 'miss' ? 0.08 : 0)) };
  }

  // 抄截：成功率加減
  stealBonus(p) {
    const j = p.action && p.action.beat;
    const g = j ? j.grade : 'good';
    return GRADE_EFFECT.steal[g];
  }

  // 蓋火鍋：成功率加減
  blockBonus(d) {
    const j = d.action && d.action.beat;
    if (!j) return 0;
    return GRADE_EFFECT.block[j.grade];
  }

  // 電腦的決策：急躁的隊伍出手早、選擇差
  aiShotThresholdAdj(team) {
    return 0.5 * this.mods[team].selection;
  }

  aiDecision(team) {
    return this.mods[team].decision;
  }

  aiStealMul(team) {
    return this.mods[team].steal * (0.7 + 0.6 * this.mods[team].aggression);
  }

  aiBlockMul(team) {
    return 0.7 + 0.6 * this.mods[team].aggression;
  }

  // ── 電腦 DJ：聽膩了就在樂句交界換段落 ──
  updateAIDJ() {
    const g = this.game;
    for (const t of [0, 1]) {
      if (!this.djEnabled[t] || g.teams[t].humans.length) continue;
      const d = this.deck(t);
      if (!d.playing || d.pending) continue;
      const f = this.feats[t];
      if (!f) continue;
      if (f.freshness < 0.75 && d.barsToPhrase() === 1 && g.rng.next() < 0.02) d.jumpSection(1);
    }
  }

  gradeInfo(g) {
    return GRADE_INFO[g];
  }
}
