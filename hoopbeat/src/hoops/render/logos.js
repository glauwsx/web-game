// 原創隊徽與聯盟標誌：全部用 Canvas 2D 繪製。

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function badge(ctx, shape, s, fill, ring) {
  ctx.save();
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(0, 0, s, 0, Math.PI * 2);
  else if (shape === 'shield') {
    ctx.moveTo(-s * 0.85, -s * 0.85);
    ctx.lineTo(s * 0.85, -s * 0.85);
    ctx.lineTo(s * 0.85, s * 0.1);
    ctx.quadraticCurveTo(s * 0.8, s * 0.75, 0, s);
    ctx.quadraticCurveTo(-s * 0.8, s * 0.75, -s * 0.85, s * 0.1);
    ctx.closePath();
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const x = Math.cos(a) * s, y = Math.sin(a) * s;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (shape === 'diamond') {
    ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath();
  } else {
    roundedRect(ctx, -s * 0.9, -s * 0.9, s * 1.8, s * 1.8, s * 0.45);
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = s * 0.1;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.restore();
}

const DRAW = {
  owls(ctx, s, c) {
    badge(ctx, 'circle', s, c.base, c.accent);
    ctx.fillStyle = c.accent;
    // 耳羽
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.2); ctx.lineTo(-s * 0.62, -s * 0.72); ctx.lineTo(-s * 0.2, -s * 0.38); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.55, -s * 0.2); ctx.lineTo(s * 0.62, -s * 0.72); ctx.lineTo(s * 0.2, -s * 0.38); ctx.closePath(); ctx.fill();
    // 臉盤
    ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.62, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    for (const sx of [-1, 1]) {
      ctx.fillStyle = c.base;
      ctx.beginPath(); ctx.arc(sx * s * 0.26, -s * 0.02, s * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.light;
      ctx.beginPath(); ctx.arc(sx * s * 0.26, -s * 0.02, s * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.base;
      ctx.beginPath(); ctx.arc(sx * s * 0.24, -s * 0.04, s * 0.05, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = c.base;
    ctx.beginPath(); ctx.moveTo(-s * 0.09, s * 0.2); ctx.lineTo(s * 0.09, s * 0.2); ctx.lineTo(0, s * 0.42); ctx.closePath(); ctx.fill();
  },
  rhinos(ctx, s, c) {
    badge(ctx, 'shield', s, c.base, c.accent);
    ctx.fillStyle = c.light;
    // 犀牛頭側影
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, s * 0.45);
    ctx.lineTo(-s * 0.6, -s * 0.05);
    ctx.lineTo(-s * 0.3, -s * 0.35);
    ctx.lineTo(-s * 0.36, -s * 0.6);
    ctx.lineTo(-s * 0.12, -s * 0.36);
    ctx.lineTo(s * 0.25, -s * 0.25);
    ctx.lineTo(s * 0.42, -s * 0.72);
    ctx.lineTo(s * 0.52, -s * 0.18);
    ctx.lineTo(s * 0.68, s * 0.02);
    ctx.lineTo(s * 0.6, s * 0.3);
    ctx.lineTo(s * 0.1, s * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c.base;
    ctx.beginPath(); ctx.arc(-s * 0.02, -s * 0.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
  },
  rays(ctx, s, c) {
    badge(ctx, 'circle', s, c.base, c.accent);
    ctx.fillStyle = c.light;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5);
    ctx.quadraticCurveTo(s * 0.45, -s * 0.35, s * 0.78, s * 0.05);
    ctx.quadraticCurveTo(s * 0.35, s * 0.05, 0, s * 0.32);
    ctx.quadraticCurveTo(-s * 0.35, s * 0.05, -s * 0.78, s * 0.05);
    ctx.quadraticCurveTo(-s * 0.45, -s * 0.35, 0, -s * 0.5);
    ctx.fill();
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = s * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, s * 0.32); ctx.quadraticCurveTo(s * 0.1, s * 0.6, -s * 0.05, s * 0.82); ctx.stroke();
    ctx.fillStyle = c.base;
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * s * 0.12, -s * 0.25, s * 0.05, 0, Math.PI * 2); ctx.fill(); }
  },
  leopards(ctx, s, c) {
    badge(ctx, 'hex', s, c.base, c.accent);
    ctx.fillStyle = c.light;
    ctx.beginPath(); ctx.ellipse(0, s * 0.22, s * 0.3, s * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    const toes = [[-0.36, -0.12], [-0.13, -0.36], [0.13, -0.36], [0.36, -0.12]];
    for (const [x, y] of toes) { ctx.beginPath(); ctx.ellipse(x * s, y * s, s * 0.12, s * 0.15, x * 0.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.arc(s * 0.0, s * 0.25, s * 0.07, 0, Math.PI * 2); ctx.fill();
  },
  scorpions(ctx, s, c) {
    badge(ctx, 'diamond', s * 1.05, c.base, c.accent);
    ctx.fillStyle = c.accent;
    // 身體與尾巴節
    const pts = [[0, 0.32, 0.16], [0, 0.08, 0.14], [0.12, -0.12, 0.11], [0.28, -0.26, 0.1], [0.4, -0.4, 0.085], [0.34, -0.56, 0.07]];
    for (const [x, y, r] of pts) { ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(s * 0.26, -s * 0.6); ctx.lineTo(s * 0.12, -s * 0.5); ctx.lineTo(s * 0.26, -s * 0.48); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c.accent; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sx * s * 0.1, s * 0.35); ctx.quadraticCurveTo(sx * s * 0.35, s * 0.38, sx * s * 0.42, s * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx * s * 0.12, s * 0.2); ctx.lineTo(sx * s * 0.42, s * 0.12); ctx.stroke();
    }
  },
  frogs(ctx, s, c) {
    badge(ctx, 'round', s, c.base, c.accent);
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.ellipse(0, s * 0.15, s * 0.62, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    for (const sx of [-1, 1]) {
      ctx.fillStyle = c.accent;
      ctx.beginPath(); ctx.arc(sx * s * 0.32, -s * 0.22, s * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.light;
      ctx.beginPath(); ctx.arc(sx * s * 0.32, -s * 0.24, s * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.base;
      ctx.beginPath(); ctx.arc(sx * s * 0.3, -s * 0.24, s * 0.055, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = c.base; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, s * 0.08, s * 0.32, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  },
};

export function logoColors(team) {
  return { base: team.dark.jersey, accent: team.dark.trim, light: team.light.jersey };
}

export function drawLogo(ctx, team, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  const fn = DRAW[team.key] || DRAW.owls;
  fn(ctx, size, logoColors(team));
  ctx.restore();
}

export function logoCanvas(team, px = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  drawLogo(ctx, team, px / 2, px / 2, px * 0.44);
  return c;
}

// 聯盟標誌：鋼框
export function drawLeagueLogo(ctx, x, y, s, { mono = false, color = '#ffffff', accent = '#ff7a1a' } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.09;
  ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = mono ? color : accent;
  ctx.lineWidth = s * 0.13;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.62, s * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = s * 0.05;
  ctx.strokeStyle = color;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s * 0.17, s * 0.06);
    ctx.lineTo(i * s * 0.1, s * 0.55);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.font = `900 ${Math.round(s * 0.34)}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('鋼框', 0, s * 0.74 - s * 0.02);
  ctx.restore();
}
