// 3D 節拍圈：控制中的球員腳下有一圈「往內收縮」的圈，縮到跟球員的指示圈一樣大的瞬間就是拍點。
// 強拍是金色、比較粗；判定結果會讓圈閃一下對應的顏色。
import * as THREE from 'three';
import { GRADE_INFO } from '../rhythm/judge.js';

export class BeatViz {
  constructor(renderer) {
    this.r = renderer;
    this.rings = [];
    this.flash = new Map();
    for (let i = 0; i < 4; i++) {
      const outer = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.6, 48),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
      );
      outer.rotation.x = -Math.PI / 2;
      outer.position.y = 0.02;
      outer.visible = false;
      renderer.scene.add(outer);
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.58, 40),
        new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0, depthWrite: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.011;
      glow.visible = false;
      renderer.scene.add(glow);
      this.rings.push({ outer, glow });
    }
  }

  onJudge(e) {
    if (e.player && e.human) this.flash.set(e.player.id, { color: GRADE_INFO[e.grade].color, t: 0.35 });
  }

  update(dt, game, bridge) {
    const show = !!(bridge && bridge.grid.segments.length);
    let targets = [];
    if (show) {
      targets = game.humans.map((h) => h.player).filter((p) => p && p.onCourt);
      // 觀賞模式：跟著持球者
      if (!targets.length && game.ball.holder) targets = [game.ball.holder];
    }
    const now = show ? bridge.now() : 0;
    for (let i = 0; i < this.rings.length; i++) {
      const { outer, glow } = this.rings[i];
      const p = targets[i];
      const vis = !!(p && game.phase !== 'gameOver');
      outer.visible = vis;
      glow.visible = vis;
      if (!vis) continue;
      const grid = bridge.grid;
      const next = grid.nextBeat(now);
      const prevT = grid.beatTime(next.beat - 1);
      const span = next.time - prevT;
      const frac = Math.max(0, Math.min(1, (now - prevT) / span)); // 0 = 剛過拍點，1 = 拍點到了
      const s = 1 + 1.7 * (1 - frac);
      outer.scale.set(s, s, 1);
      outer.position.x = p.pos.x;
      outer.position.z = p.pos.z;
      outer.material.color.set(next.strong ? '#ffd84a' : '#e9eef7');
      outer.material.opacity = 0.25 + 0.65 * frac * frac;
      glow.position.x = p.pos.x;
      glow.position.z = p.pos.z;
      const since = now - prevT;
      const prevStrong = grid.describe(next.beat - 1).strong;
      let a = Math.max(0, 1 - since / 0.18) * (prevStrong ? 0.55 : 0.28);
      const fl = this.flash.get(p.id);
      if (fl) {
        fl.t -= dt;
        if (fl.t <= 0) this.flash.delete(p.id);
        else {
          glow.material.color.set(fl.color);
          a = Math.max(a, fl.t / 0.35);
        }
      } else glow.material.color.set(prevStrong ? '#ffd84a' : '#ffffff');
      glow.material.opacity = a;
    }
  }
}
