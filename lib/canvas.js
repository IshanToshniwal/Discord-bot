// All image rendering lives here. Uses @napi-rs/canvas (prebuilt, no native build step).
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'DejaVuSans.ttf'), 'Sans');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'), 'SansBold');

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const C = {
  bg1: '#12131a',
  bg2: '#1c1e2b',
  panel: 'rgba(255,255,255,0.05)',
  panelStroke: 'rgba(255,255,255,0.08)',
  text: '#f4f5fa',
  muted: '#9aa0b4',
  blurple: '#6d7cff',
  purple: '#a06bff',
  green: '#4ade80',
  yellow: '#fbbf24',
  red: '#f4536a',
  cyan: '#38d6f5',
  gold: '#ffd166',
  silver: '#d9dde7',
  bronze: '#e0955a',
};

const font = (size, bold = false) => `${size}px ${bold ? 'SansBold' : 'Sans'}`;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Dark gradient background with soft colour glows and a faint dot grid.
function background(ctx, W, H, accent = C.blurple, accent2 = C.purple) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, C.bg2);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const glow = (x, y, r, color) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexA(color, 0.28));
    rg.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  glow(W * 0.15, H * 0.1, Math.max(W, H) * 0.5, accent);
  glow(W * 0.9, H * 0.95, Math.max(W, H) * 0.45, accent2);

  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = 14; x < W; x += 28) {
    for (let y = 14; y < H; y += 28) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function panel(ctx, x, y, w, h, r = 16, { fill = C.panel, stroke = C.panelStroke, shadow = true } = {}) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
  }
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  if (stroke) {
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function glowStroke(ctx, color, blur = 18) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.strokeStyle = color;
}

function text(ctx, str, x, y, { size = 20, bold = false, color = C.text, align = 'left', baseline = 'top', max } = {}) {
  ctx.font = font(size, bold);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(max ? fitText(ctx, str, max) : str, x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function toAttachment(canvas, name) {
  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name });
}

async function drawAvatar(ctx, url, x, y, size, ring = null) {
  ctx.save();
  if (ring) {
    ctx.shadowColor = ring;
    ctx.shadowBlur = 14;
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  try {
    const img = await loadImage(url);
    ctx.drawImage(img, x, y, size, size);
  } catch {
    ctx.fillStyle = '#3a3d4d';
    ctx.fillRect(x, y, size, size);
    text(ctx, '?', x + size / 2, y + size / 2 + 1, { size: size * 0.5, bold: true, align: 'center', baseline: 'middle', color: C.muted });
  }
  ctx.restore();
}

function crown(ctx, cx, cy, s, color = C.gold) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.6);
  ctx.lineTo(cx - s, cy - s * 0.3);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.1);
  ctx.lineTo(cx, cy - s * 0.7);
  ctx.lineTo(cx + s * 0.5, cy + s * 0.1);
  ctx.lineTo(cx + s, cy - s * 0.3);
  ctx.lineTo(cx + s, cy + s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Generic result card
// ---------------------------------------------------------------------------
function renderCard({ title, subtitle = '', body = '', accent = C.blurple, footer = '' }) {
  const W = 760;
  const measure = createCanvas(10, 10).getContext('2d');
  measure.font = font(28);
  const bodyLines = body ? wrapText(measure, body, W - 120) : [];
  const H = 56 + 48 + (subtitle ? 36 : 0) + bodyLines.length * 38 + (footer ? 40 : 0) + 44;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H, accent, C.purple);
  panel(ctx, 24, 24, W - 48, H - 48, 20);

  // accent bar
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 16;
  roundRect(ctx, 40, 44, 8, H - 88, 4);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  let y = 50;
  text(ctx, title, 72, y, { size: 34, bold: true, max: W - 120 });
  y += 50;
  if (subtitle) {
    text(ctx, subtitle, 72, y, { size: 20, color: C.muted, max: W - 120 });
    y += 40;
  }
  for (const line of bodyLines) {
    text(ctx, line, 72, y, { size: 28 });
    y += 38;
  }
  if (footer) text(ctx, footer, 72, H - 72, { size: 17, color: C.muted, max: W - 120 });
  return toAttachment(canvas, 'card.png');
}

// ---------------------------------------------------------------------------
// Leaderboard — entries: [{ name, avatarURL, wins, games }]
// ---------------------------------------------------------------------------
async function renderLeaderboard({ title, entries, subtitle = '' }) {
  const W = 860;
  const rowH = 82;
  const top = 130;
  const H = top + Math.max(entries.length, 1) * rowH + 30;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H, C.gold, C.blurple);

  crown(ctx, 58, 56, 18);
  text(ctx, title, 90, 34, { size: 38, bold: true, max: W - 130 });
  if (subtitle) text(ctx, subtitle, 92, 80, { size: 17, color: C.muted });
  text(ctx, 'WINS', W - 200, 96, { size: 15, color: C.muted, align: 'center' });
  text(ctx, 'GAMES', W - 110, 96, { size: 15, color: C.muted, align: 'center' });

  if (!entries.length) {
    panel(ctx, 24, top, W - 48, rowH - 10, 16);
    text(ctx, 'No games played yet — go win something!', W / 2, top + (rowH - 10) / 2, { size: 24, color: C.muted, align: 'center', baseline: 'middle' });
    return toAttachment(canvas, 'leaderboard.png');
  }

  const medal = [C.gold, C.silver, C.bronze];
  const maxWins = Math.max(...entries.map((e) => e.wins), 1);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const y = top + i * rowH;
    const h = rowH - 10;
    const accent = medal[i] || null;
    panel(ctx, 24, y, W - 48, h, 16, {
      fill: accent ? hexA(accent, 0.09) : C.panel,
      stroke: accent ? hexA(accent, 0.35) : C.panelStroke,
    });

    // rank badge
    ctx.save();
    if (accent) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = accent || 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(66, y + h / 2, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    text(ctx, String(i + 1), 66, y + h / 2 + 1, { size: 20, bold: true, color: accent ? '#1a1a1a' : C.text, align: 'center', baseline: 'middle' });

    await drawAvatar(ctx, e.avatarURL, 106, y + (h - 52) / 2, 52, accent);
    if (i === 0) crown(ctx, 132, y + 2, 9);

    text(ctx, e.name, 176, y + 14, { size: 24, bold: true, max: 360 });
    // win-rate bar
    const rate = e.games ? e.wins / e.games : 0;
    const bx = 176, by = y + h - 20, bw = 360, bh = 8;
    roundRect(ctx, bx, by, bw, bh, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    if (rate > 0) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, C.cyan);
      g.addColorStop(1, C.green);
      roundRect(ctx, bx, by, Math.max(bw * (e.wins / maxWins), bh), bh, 4);
      ctx.fillStyle = g;
      ctx.fill();
    }
    text(ctx, `${Math.round(rate * 100)}% win rate`, bx + bw + 14, by - 5, { size: 14, color: C.muted });

    text(ctx, String(e.wins), W - 200, y + h / 2, { size: 30, bold: true, color: C.green, align: 'center', baseline: 'middle' });
    text(ctx, String(e.games), W - 110, y + h / 2, { size: 24, color: C.muted, align: 'center', baseline: 'middle' });
  }
  return toAttachment(canvas, 'leaderboard.png');
}

// ---------------------------------------------------------------------------
// Tic-tac-toe — board: 9 x ('X'|'O'|null), winLine: [i,j,k]|null
// ---------------------------------------------------------------------------
function renderTicTacToe(board, winLine = null, { names = {}, turn = null } = {}) {
  const S = 480;
  const pad = 30;
  const grid = S - pad * 2;
  const cell = grid / 3;
  const W = S;
  const H = S + 70;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H, C.red, C.blurple);

  // header
  text(ctx, names.X || 'X', pad, 22, { size: 20, bold: true, color: turn === 'X' ? C.red : C.muted, max: 180 });
  text(ctx, 'vs', W / 2, 22, { size: 16, color: C.muted, align: 'center' });
  text(ctx, names.O || 'O', W - pad, 22, { size: 20, bold: true, color: turn === 'O' ? C.blurple : C.muted, align: 'right', max: 180 });

  const oy = 60;
  panel(ctx, pad - 10, oy - 10, grid + 20, grid + 20, 22);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(pad + i * cell, oy + 12);
    ctx.lineTo(pad + i * cell, oy + grid - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad + 12, oy + i * cell);
    ctx.lineTo(pad + grid - 12, oy + i * cell);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < 9; i++) {
    const cx = pad + (i % 3) * cell + cell / 2;
    const cy = oy + Math.floor(i / 3) * cell + cell / 2;
    const v = board[i];
    if (!v) {
      text(ctx, String(i + 1), cx, cy, { size: 18, color: 'rgba(255,255,255,0.12)', align: 'center', baseline: 'middle' });
      continue;
    }
    const r = cell * 0.27;
    const win = winLine?.includes(i);
    const color = win ? C.green : v === 'X' ? C.red : C.blurple;
    ctx.save();
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    glowStroke(ctx, color, win ? 28 : 16);
    if (v === 'X') {
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (winLine) {
    const c = (i) => [pad + (i % 3) * cell + cell / 2, oy + Math.floor(i / 3) * cell + cell / 2];
    const [x1, y1] = c(winLine[0]);
    const [x2, y2] = c(winLine[2]);
    ctx.save();
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    glowStroke(ctx, hexA(C.green, 0.9), 24);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }
  return toAttachment(canvas, 'tictactoe.png');
}

// ---------------------------------------------------------------------------
// Rock–paper–scissors reveal
// ---------------------------------------------------------------------------
// Hand gestures: fist (rock), open palm (paper), two fingers (scissors)
function drawRpsIcon(ctx, choice, cx, cy, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const dark = 'rgba(0,0,0,0.28)';
  const finger = (x, y, w, h, r) => {
    roundRect(ctx, x - w / 2, y - h, w, h + r, w / 2);
    ctx.fill();
  };

  if (choice === 'rock') {
    // wrist
    roundRect(ctx, -24, 30, 48, 40, 12);
    ctx.fill();
    // fist body
    roundRect(ctx, -48, -34, 96, 74, 26);
    ctx.fill();
    // knuckles (bumps on top)
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-36 + i * 24, -34, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    // thumb across the front
    roundRect(ctx, -50, -4, 62, 24, 12);
    ctx.fill();
    // creases
    ctx.shadowBlur = 0;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-36 + i * 24 - 12, -26);
      ctx.lineTo(-36 + i * 24 - 12, -8);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-48, 20);
    ctx.lineTo(12, 20);
    ctx.stroke();
  } else if (choice === 'paper') {
    // wrist
    roundRect(ctx, -22, 40, 44, 34, 10);
    ctx.fill();
    // palm
    roundRect(ctx, -44, -6, 88, 62, 22);
    ctx.fill();
    // four fingers
    const fingers = [[-33, 44, 17], [-11, 56, 17], [11, 52, 17], [33, 40, 16]];
    for (const [x, h, w] of fingers) finger(x, -2, w, h, 6);
    // thumb
    ctx.save();
    ctx.rotate(-0.85);
    roundRect(ctx, -68, -10, 48, 20, 10);
    ctx.fill();
    ctx.restore();
    // palm lines
    ctx.shadowBlur = 0;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-26, 16);
    ctx.quadraticCurveTo(0, 30, 28, 14);
    ctx.stroke();
  } else if (choice === 'scissors') {
    // wrist
    roundRect(ctx, -22, 40, 44, 34, 10);
    ctx.fill();
    // palm
    roundRect(ctx, -42, 0, 84, 56, 22);
    ctx.fill();
    // two extended fingers in a V
    ctx.save();
    ctx.rotate(-0.28);
    finger(-18, 4, 18, 70, 6);
    ctx.restore();
    ctx.save();
    ctx.rotate(0.28);
    finger(18, 4, 18, 70, 6);
    ctx.restore();
    // folded fingers
    ctx.beginPath();
    ctx.arc(18, 2, 12, 0, Math.PI * 2);
    ctx.arc(36, 8, 11, 0, Math.PI * 2);
    ctx.fill();
    // thumb tucked
    roundRect(ctx, -46, 10, 30, 20, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-20, 30);
    ctx.lineTo(24, 34);
    ctx.stroke();
  } else {
    text(ctx, '?', 0, 2, { size: 80, bold: true, color, align: 'center', baseline: 'middle' });
  }
  ctx.restore();
}

async function renderRps({ p1, p2, c1, c2, result }) {
  const W = 820;
  const H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H, C.cyan, C.purple);

  const side = async (p, c, x, isWinner) => {
    const color = isWinner ? C.green : result === 'draw' ? C.yellow : C.muted;
    panel(ctx, x - 165, 30, 330, 310, 22, isWinner ? { fill: hexA(C.green, 0.08), stroke: hexA(C.green, 0.4) } : {});
    await drawAvatar(ctx, p.avatarURL, x - 30, 48, 60, isWinner ? C.green : null);
    text(ctx, p.name, x, 118, { size: 22, bold: true, align: 'center', max: 300 });
    drawRpsIcon(ctx, c, x, 215, c ? (isWinner ? C.green : C.text) : C.muted);
    text(ctx, c ? c.toUpperCase() : 'NO PICK', x, 300, { size: 17, color, align: 'center' });
  };
  await side(p1, c1, 200, result === 'p1');
  await side(p2, c2, W - 200, result === 'p2');

  ctx.save();
  ctx.shadowColor = C.purple;
  ctx.shadowBlur = 20;
  ctx.fillStyle = C.purple;
  ctx.beginPath();
  ctx.arc(W / 2, 185, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  text(ctx, 'VS', W / 2, 187, { size: 22, bold: true, align: 'center', baseline: 'middle' });

  const label = result === 'draw' ? "It's a draw!" : `${result === 'p1' ? p1.name : p2.name} wins!`;
  text(ctx, label, W / 2, H - 24, { size: 26, bold: true, color: result === 'draw' ? C.yellow : C.green, align: 'center', baseline: 'middle', max: W - 60 });
  return toAttachment(canvas, 'rps.png');
}

// ---------------------------------------------------------------------------
// Wordle grid — guesses: [{ word, result: ['g'|'y'|'x'] }]
// ---------------------------------------------------------------------------
function renderWordle(guesses, { maxRows = 6, title = 'Wordle', subtitle = '' } = {}) {
  const tile = 64;
  const gap = 9;
  const cols = 5;
  const gridW = cols * tile + (cols - 1) * gap;
  const W = gridW + 120;
  const top = 96;
  const H = top + maxRows * (tile + gap) + 30;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H, C.green, C.yellow);

  text(ctx, title, W / 2, 26, { size: 28, bold: true, align: 'center' });
  if (subtitle) text(ctx, subtitle, W / 2, 62, { size: 15, color: C.muted, align: 'center' });

  const colors = { g: ['#3fb26f', '#2e8b57'], y: ['#d9b23a', '#b3901f'], x: ['#3a3d4c', '#2a2c38'] };
  const x0 = (W - gridW) / 2;
  for (let r = 0; r < maxRows; r++) {
    const g = guesses[r];
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (tile + gap);
      const y = top + r * (tile + gap);
      if (!g) {
        roundRect(ctx, x, y, tile, tile, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();
        continue;
      }
      const [a, b] = colors[g.result[c]];
      const grad = ctx.createLinearGradient(x, y, x, y + tile);
      grad.addColorStop(0, a);
      grad.addColorStop(1, b);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      roundRect(ctx, x, y, tile, tile, 10);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
      text(ctx, g.word[c].toUpperCase(), x + tile / 2, y + tile / 2 + 2, { size: 34, bold: true, color: '#fff', align: 'center', baseline: 'middle' });
    }
  }
  return toAttachment(canvas, 'wordle.png');
}

// ---------------------------------------------------------------------------
// Hangman
// ---------------------------------------------------------------------------
function renderHangman({ word, guessed, wrong, maxWrong = 6, revealed = false }) {
  const W = 820;
  const H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const lost = wrong >= maxWrong;
  background(ctx, W, H, lost ? C.red : C.cyan, C.purple);

  // Scene panel
  panel(ctx, 30, 30, 290, 340, 22);
  // moon
  ctx.save();
  ctx.shadowColor = C.yellow;
  ctx.shadowBlur = 30;
  ctx.fillStyle = hexA(C.yellow, 0.8);
  ctx.beginPath();
  ctx.arc(275, 78, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // gallows
  ctx.save();
  ctx.strokeStyle = '#a58a6b';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ox = 70, oy = 335;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + 170, oy);
  ctx.moveTo(ox + 40, oy);
  ctx.lineTo(ox + 40, 60);
  ctx.lineTo(ox + 160, 60);
  ctx.lineTo(ox + 160, 96);
  ctx.moveTo(ox + 40, 110);
  ctx.lineTo(ox + 90, 60);
  ctx.stroke();
  ctx.restore();

  // figure
  const px = ox + 160;
  const color = lost ? C.red : C.text;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = lost ? 18 : 8;
  const parts = [
    () => { ctx.beginPath(); ctx.arc(px, 122, 26, 0, Math.PI * 2); ctx.stroke(); },
    () => { ctx.beginPath(); ctx.moveTo(px, 148); ctx.lineTo(px, 238); ctx.stroke(); },
    () => { ctx.beginPath(); ctx.moveTo(px, 168); ctx.lineTo(px - 42, 206); ctx.stroke(); },
    () => { ctx.beginPath(); ctx.moveTo(px, 168); ctx.lineTo(px + 42, 206); ctx.stroke(); },
    () => { ctx.beginPath(); ctx.moveTo(px, 238); ctx.lineTo(px - 36, 300); ctx.stroke(); },
    () => { ctx.beginPath(); ctx.moveTo(px, 238); ctx.lineTo(px + 36, 300); ctx.stroke(); },
  ];
  for (let i = 0; i < Math.min(wrong, parts.length); i++) parts[i]();
  if (lost) {
    ctx.lineWidth = 3;
    for (const dx of [-9, 9]) {
      ctx.beginPath();
      ctx.moveTo(px + dx - 5, 117); ctx.lineTo(px + dx + 5, 127);
      ctx.moveTo(px + dx + 5, 117); ctx.lineTo(px + dx - 5, 127);
      ctx.stroke();
    }
  }
  ctx.restore();

  // word panel
  panel(ctx, 350, 30, 440, 340, 22);
  const letters = word.toUpperCase().split('');
  const slot = Math.min(44, 400 / letters.length);
  const startX = 570 - ((letters.length - 1) * slot) / 2;
  letters.forEach((ch, i) => {
    const x = startX + i * slot;
    const known = guessed.has(ch.toLowerCase());
    ctx.save();
    ctx.strokeStyle = known ? C.cyan : 'rgba(255,255,255,0.3)';
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = known ? 10 : 0;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - slot * 0.36, 160);
    ctx.lineTo(x + slot * 0.36, 160);
    ctx.stroke();
    ctx.restore();
    if (known || revealed) {
      text(ctx, ch, x, 135, { size: Math.min(36, slot * 0.9), bold: true, color: known ? C.text : C.red, align: 'center', baseline: 'middle' });
    }
  });

  text(ctx, 'GUESSED', 380, 200, { size: 14, color: C.muted });
  const used = [...guessed].sort().map((l) => l.toUpperCase()).join('  ') || '—';
  text(ctx, used, 380, 222, { size: 22, bold: true, max: 380 });

  // lives
  text(ctx, 'LIVES', 380, 276, { size: 14, color: C.muted });
  for (let i = 0; i < maxWrong; i++) {
    const alive = i < maxWrong - wrong;
    ctx.save();
    ctx.fillStyle = alive ? C.red : 'rgba(255,255,255,0.1)';
    if (alive) { ctx.shadowColor = C.red; ctx.shadowBlur = 10; }
    const hx = 392 + i * 34, hy = 312;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 10);
    ctx.bezierCurveTo(hx - 14, hy - 4, hx - 4, hy - 14, hx, hy - 4);
    ctx.bezierCurveTo(hx + 4, hy - 14, hx + 14, hy - 4, hx, hy + 10);
    ctx.fill();
    ctx.restore();
  }
  text(ctx, `${wrong}/${maxWrong} wrong`, 780, 302, { size: 14, color: lost ? C.red : C.muted, align: 'right' });
  return toAttachment(canvas, 'hangman.png');
}

// ---------------------------------------------------------------------------
// Dice and coin
// ---------------------------------------------------------------------------
function drawDie(ctx, x, y, size, value) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  const g = ctx.createLinearGradient(x, y, x + size, y + size);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#d8dbe6');
  roundRect(ctx, x, y, size, size, size * 0.2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  const pip = size * 0.085;
  const pos = { tl: [0.26, 0.26], tr: [0.74, 0.26], ml: [0.26, 0.5], mr: [0.74, 0.5], bl: [0.26, 0.74], br: [0.74, 0.74], c: [0.5, 0.5] };
  const layout = { 1: ['c'], 2: ['tl', 'br'], 3: ['tl', 'c', 'br'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'c', 'bl', 'br'], 6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'] };
  for (const k of layout[value] || []) {
    const [fx, fy] = pos[k];
    const pg = ctx.createRadialGradient(x + fx * size - pip * 0.3, y + fy * size - pip * 0.3, 0, x + fx * size, y + fy * size, pip);
    pg.addColorStop(0, '#3a3d4c');
    pg.addColorStop(1, '#0f1016');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x + fx * size, y + fy * size, pip, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderDice(values, sides = 6, label = '') {
  const n = values.length;
  const size = 116;
  const gap = 24;
  const W = Math.max(460, n * (size + gap) + 80);
  const H = 280;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H, C.purple, C.cyan);
  const startX = (W - (n * (size + gap) - gap)) / 2;
  values.forEach((v, i) => {
    const x = startX + i * (size + gap);
    if (sides === 6) drawDie(ctx, x, 50, size, v);
    else {
      ctx.save();
      ctx.shadowColor = C.purple;
      ctx.shadowBlur = 24;
      const g = ctx.createLinearGradient(x, 50, x + size, 50 + size);
      g.addColorStop(0, C.purple);
      g.addColorStop(1, C.blurple);
      roundRect(ctx, x, 50, size, size, 24);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      text(ctx, String(v), x + size / 2, 50 + size / 2 + 2, { size: 44, bold: true, align: 'center', baseline: 'middle' });
    }
  });
  const total = values.reduce((a, b) => a + b, 0);
  text(ctx, label || `${n}d${sides}  =  ${total}`, W / 2, 212, { size: 30, bold: true, align: 'center' });
  return toAttachment(canvas, 'dice.png');
}

function renderCoin(side) {
  const S = 360;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const heads = side === 'heads';
  background(ctx, S, S, heads ? C.gold : C.silver, C.blurple);
  const cx = S / 2, cy = S / 2, r = 125;
  ctx.save();
  ctx.shadowColor = heads ? C.gold : C.silver;
  ctx.shadowBlur = 40;
  const g = ctx.createRadialGradient(cx - 40, cy - 45, 10, cx, cy, r);
  g.addColorStop(0, heads ? '#fff3b0' : '#ffffff');
  g.addColorStop(0.6, heads ? '#f2c14e' : '#c9ced9');
  g.addColorStop(1, heads ? '#b8860b' : '#7f8696');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = heads ? '#8a6414' : '#5a6070';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 22, 0, Math.PI * 2);
  ctx.stroke();
  // shine
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(cx - 40, cy - 60, 55, 22, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // rim ticks
  ctx.strokeStyle = heads ? 'rgba(138,100,20,0.6)' : 'rgba(90,96,112,0.6)';
  ctx.lineWidth = 3;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
    ctx.lineTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18));
    ctx.stroke();
  }
  text(ctx, heads ? 'HEADS' : 'TAILS', cx, cy + 4, { size: 46, bold: true, color: heads ? '#5c4208' : '#2f3542', align: 'center', baseline: 'middle' });
  return toAttachment(canvas, 'coin.png');
}

// ---------------------------------------------------------------------------
// Magic 8-ball
// ---------------------------------------------------------------------------
function renderEightBall(question, answer, tone) {
  const W = 780;
  const H = 380;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const accent = tone === 'yes' ? C.green : tone === 'no' ? C.red : C.yellow;
  background(ctx, W, H, accent, C.purple);

  const cx = 170, cy = 190, r = 125;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  const g = ctx.createRadialGradient(cx - 45, cy - 50, 10, cx, cy, r);
  g.addColorStop(0, '#5a5d6e');
  g.addColorStop(0.5, '#1c1d26');
  g.addColorStop(1, '#040406');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // shine
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(cx - 50, cy - 70, 40, 18, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // window
  const wg = ctx.createRadialGradient(cx, cy + 10, 5, cx, cy, 66);
  wg.addColorStop(0, hexA(accent, 0.55));
  wg.addColorStop(1, '#0b1030');
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.arc(cx, cy, 66, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 20;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 50);
  ctx.lineTo(cx + 46, cy + 30);
  ctx.lineTo(cx - 46, cy + 30);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(ctx, '8', cx, cy + 4, { size: 40, bold: true, color: '#0b1030', align: 'center', baseline: 'middle' });

  panel(ctx, 330, 50, 420, 280, 22);
  ctx.font = font(19);
  const qLines = wrapText(ctx, question, 370).slice(0, 3);
  text(ctx, 'YOU ASKED', 356, 72, { size: 13, color: C.muted });
  let y = 94;
  for (const l of qLines) { text(ctx, l, 356, y, { size: 19, color: C.muted }); y += 26; }
  text(ctx, 'THE BALL SAYS', 356, y + 18, { size: 13, color: accent });
  y += 42;
  ctx.font = font(30, true);
  for (const l of wrapText(ctx, answer, 370)) { text(ctx, l, 356, y, { size: 30, bold: true, color: accent }); y += 38; }
  return toAttachment(canvas, '8ball.png');
}

// ---------------------------------------------------------------------------
// Guess-the-number range bar
// ---------------------------------------------------------------------------
function renderRange({ lo, hi, max, guesses = [], solved = null }) {
  const W = 760;
  const H = 240;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H, solved ? C.green : C.cyan, C.purple);
  panel(ctx, 24, 24, W - 48, H - 48, 20);

  text(ctx, solved ? `${solved.name} got it!` : 'Guess the number', 48, 44, { size: 28, bold: true, max: 500 });
  text(ctx, solved ? `The number was ${solved.n}` : `Somewhere between ${lo} and ${hi}`, 48, 84, { size: 18, color: C.muted });

  const bx = 48, by = 140, bw = W - 96, bh = 16;
  roundRect(ctx, bx, by, bw, bh, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  const px = (v) => bx + ((v - 1) / Math.max(max - 1, 1)) * bw;
  const x1 = px(lo), x2 = px(hi);
  ctx.save();
  ctx.shadowColor = C.cyan;
  ctx.shadowBlur = 16;
  const g = ctx.createLinearGradient(x1, 0, x2, 0);
  g.addColorStop(0, C.cyan);
  g.addColorStop(1, C.green);
  roundRect(ctx, x1, by, Math.max(x2 - x1, bh), bh, 8);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  for (const gs of guesses.slice(-12)) {
    const x = px(gs);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(x, by - 6);
    ctx.lineTo(x - 5, by - 14);
    ctx.lineTo(x + 5, by - 14);
    ctx.closePath();
    ctx.fill();
  }
  if (solved) {
    const x = px(solved.n);
    ctx.save();
    ctx.shadowColor = C.green;
    ctx.shadowBlur = 20;
    ctx.fillStyle = C.green;
    ctx.beginPath();
    ctx.arc(x, by + bh / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  text(ctx, '1', bx, by + 26, { size: 14, color: C.muted });
  text(ctx, String(max), bx + bw, by + 26, { size: 14, color: C.muted, align: 'right' });
  text(ctx, `${guesses.length} guess${guesses.length === 1 ? '' : 'es'} so far`, W / 2, by + 26, { size: 14, color: C.muted, align: 'center' });
  return toAttachment(canvas, 'range.png');
}

module.exports = {
  C,
  renderCard,
  renderLeaderboard,
  renderTicTacToe,
  renderRps,
  renderWordle,
  renderHangman,
  renderDice,
  renderCoin,
  renderEightBall,
  renderRange,
};
