// All image rendering lives here. Uses @napi-rs/canvas (prebuilt, no native build step).
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'DejaVuSans.ttf'), 'Sans');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'), 'SansBold');

const C = {
  bg: '#1e1f22',
  panel: '#2b2d31',
  panel2: '#313338',
  text: '#f2f3f5',
  muted: '#949ba4',
  blurple: '#5865f2',
  green: '#57f287',
  yellow: '#fee75c',
  red: '#ed4245',
  gold: '#f1c40f',
  silver: '#bdc3c7',
  bronze: '#cd7f32',
};

function font(size, bold = false) {
  return `${size}px ${bold ? 'SansBold' : 'Sans'}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
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

function toAttachment(canvas, name) {
  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name });
}

async function drawAvatar(ctx, url, x, y, size) {
  try {
    const img = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } catch {
    ctx.fillStyle = C.panel2;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Generic result card (8ball, trivia result, guess-number win, etc.)
// ---------------------------------------------------------------------------
function renderCard({ title, subtitle = '', body = '', accent = C.blurple, footer = '' }) {
  const W = 720;
  const measure = createCanvas(10, 10).getContext('2d');
  measure.font = font(30);
  const bodyLines = body ? wrapText(measure, body, W - 80) : [];
  const H = 40 + 44 + (subtitle ? 34 : 0) + bodyLines.length * 40 + (footer ? 36 : 0) + 40;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 10, H);

  let y = 40;
  ctx.fillStyle = C.text;
  ctx.font = font(36, true);
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, title, W - 80), 40, y);
  y += 50;
  if (subtitle) {
    ctx.fillStyle = C.muted;
    ctx.font = font(22);
    ctx.fillText(fitText(ctx, subtitle, W - 80), 40, y);
    y += 40;
  }
  ctx.fillStyle = C.text;
  ctx.font = font(30);
  for (const line of bodyLines) {
    ctx.fillText(line, 40, y);
    y += 40;
  }
  if (footer) {
    ctx.fillStyle = C.muted;
    ctx.font = font(18);
    ctx.fillText(fitText(ctx, footer, W - 80), 40, H - 60);
  }
  return toAttachment(canvas, 'card.png');
}

// ---------------------------------------------------------------------------
// Leaderboard
// entries: [{ name, avatarURL, wins, games }]
// ---------------------------------------------------------------------------
async function renderLeaderboard({ title, entries }) {
  const W = 800;
  const rowH = 74;
  const H = 110 + Math.max(entries.length, 1) * rowH + 30;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = C.text;
  ctx.font = font(38, true);
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, title, W - 60), 30, 30);

  ctx.fillStyle = C.muted;
  ctx.font = font(18);
  ctx.fillText('WINS', W - 210, 82);
  ctx.fillText('GAMES', W - 100, 82);

  if (!entries.length) {
    ctx.fillStyle = C.muted;
    ctx.font = font(26);
    ctx.fillText('No games played yet. Go win something!', 30, 130);
    return toAttachment(canvas, 'leaderboard.png');
  }

  const medal = [C.gold, C.silver, C.bronze];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const y = 110 + i * rowH;
    ctx.fillStyle = i % 2 ? C.panel : C.panel2;
    roundRect(ctx, 20, y, W - 40, rowH - 8, 12);
    ctx.fill();

    // rank bubble
    ctx.fillStyle = medal[i] || '#4e5058';
    ctx.beginPath();
    ctx.arc(60, y + (rowH - 8) / 2, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = i < 3 ? '#1e1f22' : C.text;
    ctx.font = font(20, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), 60, y + (rowH - 8) / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    await drawAvatar(ctx, e.avatarURL, 100, y + 9, 48);

    ctx.fillStyle = C.text;
    ctx.font = font(26, true);
    ctx.fillText(fitText(ctx, e.name, 380), 165, y + 18);

    ctx.font = font(28, true);
    ctx.fillStyle = C.green;
    ctx.fillText(String(e.wins), W - 210, y + 16);
    ctx.fillStyle = C.muted;
    ctx.font = font(24);
    ctx.fillText(String(e.games), W - 100, y + 18);
  }
  return toAttachment(canvas, 'leaderboard.png');
}

// ---------------------------------------------------------------------------
// Tic-tac-toe board. board: array of 9 ('X' | 'O' | null). winLine: [i,j,k] | null
// ---------------------------------------------------------------------------
function renderTicTacToe(board, winLine = null) {
  const S = 420;
  const cell = S / 3;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = '#4e5058';
  ctx.lineWidth = 6;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 20);
    ctx.lineTo(i * cell, S - 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, i * cell);
    ctx.lineTo(S - 20, i * cell);
    ctx.stroke();
  }

  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const v = board[i];
    if (!v) continue;
    const cx = (i % 3) * cell + cell / 2;
    const cy = Math.floor(i / 3) * cell + cell / 2;
    const r = cell * 0.28;
    const highlight = winLine?.includes(i);
    if (v === 'X') {
      ctx.strokeStyle = highlight ? C.green : C.red;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    } else {
      ctx.strokeStyle = highlight ? C.green : C.blurple;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return toAttachment(canvas, 'tictactoe.png');
}

// ---------------------------------------------------------------------------
// Rock–paper–scissors reveal
// ---------------------------------------------------------------------------
function drawRpsIcon(ctx, choice, cx, cy, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  if (choice === 'rock') {
    ctx.beginPath();
    ctx.arc(cx, cy, 50, 0, Math.PI * 2);
    ctx.fill();
  } else if (choice === 'paper') {
    roundRect(ctx, cx - 45, cy - 55, 90, 110, 10);
    ctx.fill();
  } else if (choice === 'scissors') {
    ctx.beginPath();
    ctx.moveTo(cx - 40, cy - 50);
    ctx.lineTo(cx + 40, cy + 50);
    ctx.moveTo(cx + 40, cy - 50);
    ctx.lineTo(cx - 40, cy + 50);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - 35, cy + 55, 16, 0, Math.PI * 2);
    ctx.arc(cx + 35, cy + 55, 16, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.font = font(64, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
}

async function renderRps({ p1, p2, c1, c2, result }) {
  const W = 760;
  const H = 360;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const side = async (p, c, x, color) => {
    await drawAvatar(ctx, p.avatarURL, x - 32, 30, 64);
    ctx.fillStyle = C.text;
    ctx.font = font(24, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fitText(ctx, p.name, 280), x, 104);
    drawRpsIcon(ctx, c, x, 210, color);
    ctx.fillStyle = C.muted;
    ctx.font = font(20);
    ctx.textAlign = 'center';
    ctx.fillText(c ? c.toUpperCase() : 'NO PICK', x, 290);
    ctx.textAlign = 'left';
  };
  await side(p1, c1, 190, result === 'p1' ? C.green : C.text);
  await side(p2, c2, 570, result === 'p2' ? C.green : C.text);

  ctx.fillStyle = C.muted;
  ctx.font = font(34, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', W / 2, 200);

  ctx.fillStyle = result === 'draw' ? C.yellow : C.green;
  ctx.font = font(26, true);
  const label =
    result === 'draw' ? "It's a draw!" : `${result === 'p1' ? p1.name : p2.name} wins!`;
  ctx.fillText(fitText(ctx, label, W - 40), W / 2, H - 28);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  return toAttachment(canvas, 'rps.png');
}

// ---------------------------------------------------------------------------
// Wordle grid. guesses: [{ word, result: ['g'|'y'|'x', ...] }], maxRows = 6
// ---------------------------------------------------------------------------
function renderWordle(guesses, { maxRows = 6, title = 'Wordle' } = {}) {
  const tile = 62;
  const gap = 8;
  const cols = 5;
  const W = cols * tile + (cols + 1) * gap + 40;
  const H = 70 + maxRows * (tile + gap) + 20;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = C.text;
  ctx.font = font(28, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(title, W / 2, 20);

  const colors = { g: '#538d4e', y: '#b59f3b', x: '#3a3a3c' };
  for (let r = 0; r < maxRows; r++) {
    const g = guesses[r];
    for (let c = 0; c < cols; c++) {
      const x = 20 + gap + c * (tile + gap);
      const y = 70 + r * (tile + gap);
      ctx.fillStyle = g ? colors[g.result[c]] : '#121213';
      roundRect(ctx, x, y, tile, tile, 6);
      ctx.fill();
      if (!g) {
        ctx.strokeStyle = '#3a3a3c';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = font(34, true);
        ctx.textBaseline = 'middle';
        ctx.fillText(g.word[c].toUpperCase(), x + tile / 2, y + tile / 2 + 2);
        ctx.textBaseline = 'top';
      }
    }
  }
  ctx.textAlign = 'left';
  return toAttachment(canvas, 'wordle.png');
}

// ---------------------------------------------------------------------------
// Hangman. wrong: number of wrong guesses (0-6), word: string, guessed: Set<string>
// ---------------------------------------------------------------------------
function renderHangman({ word, guessed, wrong, maxWrong = 6, revealed = false }) {
  const W = 760;
  const H = 360;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Gallows
  ctx.strokeStyle = '#8a8f98';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  const ox = 60;
  const oy = 320;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + 160, oy); // base
  ctx.moveTo(ox + 40, oy);
  ctx.lineTo(ox + 40, 40); // post
  ctx.lineTo(ox + 160, 40); // beam
  ctx.lineTo(ox + 160, 80); // rope
  ctx.stroke();

  // Body parts
  const px = ox + 160;
  ctx.strokeStyle = wrong >= maxWrong ? C.red : C.text;
  ctx.lineWidth = 6;
  const parts = [
    () => {
      ctx.beginPath();
      ctx.arc(px, 105, 25, 0, Math.PI * 2);
      ctx.stroke();
    }, // head
    () => {
      ctx.beginPath();
      ctx.moveTo(px, 130);
      ctx.lineTo(px, 220);
      ctx.stroke();
    }, // body
    () => {
      ctx.beginPath();
      ctx.moveTo(px, 150);
      ctx.lineTo(px - 40, 190);
      ctx.stroke();
    }, // left arm
    () => {
      ctx.beginPath();
      ctx.moveTo(px, 150);
      ctx.lineTo(px + 40, 190);
      ctx.stroke();
    }, // right arm
    () => {
      ctx.beginPath();
      ctx.moveTo(px, 220);
      ctx.lineTo(px - 35, 280);
      ctx.stroke();
    }, // left leg
    () => {
      ctx.beginPath();
      ctx.moveTo(px, 220);
      ctx.lineTo(px + 35, 280);
      ctx.stroke();
    }, // right leg
  ];
  for (let i = 0; i < Math.min(wrong, parts.length); i++) parts[i]();

  // Word
  const letters = word.toUpperCase().split('');
  const slot = 40;
  const startX = 320;
  ctx.font = font(34, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  letters.forEach((ch, i) => {
    const x = startX + i * slot;
    if (ch === ' ') return;
    ctx.strokeStyle = '#8a8f98';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 14, 190);
    ctx.lineTo(x + 14, 190);
    ctx.stroke();
    const show = guessed.has(ch.toLowerCase()) || revealed;
    if (show) {
      ctx.fillStyle = guessed.has(ch.toLowerCase()) ? C.text : C.red;
      ctx.fillText(ch, x, 168);
    }
  });

  // Guessed letters
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.muted;
  ctx.font = font(18);
  ctx.fillText('Guessed:', 320, 240);
  const used = [...guessed].sort().map((l) => l.toUpperCase()).join(' ') || '—';
  ctx.fillStyle = C.text;
  ctx.font = font(22, true);
  ctx.fillText(fitText(ctx, used, 400), 320, 265);

  ctx.fillStyle = wrong >= maxWrong ? C.red : C.muted;
  ctx.font = font(18);
  ctx.fillText(`Wrong guesses: ${wrong} / ${maxWrong}`, 320, 310);
  return toAttachment(canvas, 'hangman.png');
}

// ---------------------------------------------------------------------------
// Dice and coin
// ---------------------------------------------------------------------------
function drawDie(ctx, x, y, size, value) {
  ctx.fillStyle = '#f2f3f5';
  roundRect(ctx, x, y, size, size, size * 0.18);
  ctx.fill();
  const pip = size * 0.09;
  const pos = {
    tl: [0.25, 0.25],
    tr: [0.75, 0.25],
    ml: [0.25, 0.5],
    mr: [0.75, 0.5],
    bl: [0.25, 0.75],
    br: [0.75, 0.75],
    c: [0.5, 0.5],
  };
  const layout = {
    1: ['c'],
    2: ['tl', 'br'],
    3: ['tl', 'c', 'br'],
    4: ['tl', 'tr', 'bl', 'br'],
    5: ['tl', 'tr', 'c', 'bl', 'br'],
    6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
  };
  ctx.fillStyle = '#1e1f22';
  for (const k of layout[value] || []) {
    const [fx, fy] = pos[k];
    ctx.beginPath();
    ctx.arc(x + fx * size, y + fy * size, pip, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderDice(values, sides = 6, label = '') {
  const n = values.length;
  const size = 110;
  const gap = 20;
  const W = Math.max(420, n * (size + gap) + gap);
  const H = 250;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const startX = (W - (n * (size + gap) - gap)) / 2;
  values.forEach((v, i) => {
    const x = startX + i * (size + gap);
    if (sides === 6) drawDie(ctx, x, 40, size, v);
    else {
      ctx.fillStyle = C.blurple;
      roundRect(ctx, x, 40, size, size, 20);
      ctx.fill();
      ctx.fillStyle = C.text;
      ctx.font = font(44, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(v), x + size / 2, 40 + size / 2 + 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
  });

  const total = values.reduce((a, b) => a + b, 0);
  ctx.fillStyle = C.text;
  ctx.font = font(30, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label || `${n}d${sides} = ${total}`, W / 2, 180);
  ctx.textAlign = 'left';
  return toAttachment(canvas, 'dice.png');
}

function renderCoin(side) {
  const S = 320;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, S, S);

  const grad = ctx.createRadialGradient(S / 2 - 30, S / 2 - 30, 20, S / 2, S / 2, 120);
  grad.addColorStop(0, side === 'heads' ? '#ffe680' : '#e6e6e6');
  grad.addColorStop(1, side === 'heads' ? '#c9a227' : '#8f8f8f');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = side === 'heads' ? '#8a6d1f' : '#5c5c5c';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 95, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = side === 'heads' ? '#6b5314' : '#3a3a3a';
  ctx.font = font(48, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(side === 'heads' ? 'HEADS' : 'TAILS', S / 2, S / 2 + 4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  return toAttachment(canvas, 'coin.png');
}

// ---------------------------------------------------------------------------
// Magic 8-ball
// ---------------------------------------------------------------------------
function renderEightBall(question, answer, tone /* 'yes' | 'no' | 'maybe' */) {
  const W = 720;
  const H = 360;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // ball
  const cx = 150;
  const cy = 180;
  const grad = ctx.createRadialGradient(cx - 40, cy - 40, 10, cx, cy, 130);
  grad.addColorStop(0, '#4a4a4a');
  grad.addColorStop(1, '#050505');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.fill();
  // window
  ctx.fillStyle = tone === 'yes' ? '#1b4d8a' : tone === 'no' ? '#6b1d1d' : '#3b3b6b';
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.fill();
  // triangle
  ctx.fillStyle = tone === 'yes' ? '#2f7de1' : tone === 'no' ? '#c03a3a' : '#7070c8';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 48);
  ctx.lineTo(cx + 44, cy + 28);
  ctx.lineTo(cx - 44, cy + 28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = font(40, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('8', cx, cy + 2);

  // text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.muted;
  ctx.font = font(20);
  const qLines = wrapText(ctx, `Q: ${question}`, W - 330).slice(0, 3);
  let y = 80;
  for (const l of qLines) {
    ctx.fillText(l, 300, y);
    y += 28;
  }
  ctx.fillStyle = tone === 'yes' ? C.green : tone === 'no' ? C.red : C.yellow;
  ctx.font = font(32, true);
  const aLines = wrapText(ctx, answer, W - 330);
  y += 16;
  for (const l of aLines) {
    ctx.fillText(l, 300, y);
    y += 42;
  }
  return toAttachment(canvas, '8ball.png');
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
};
