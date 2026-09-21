// Turns a still image into animated frames. Each effect is a function
// (ctx, img, t, W, H) drawing frame t in [0, 1).
const TAU = Math.PI * 2;

function drawCentered(ctx, img, W, H, { scale = 1, rotate = 0, dx = 0, dy = 0, flipX = 1, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2 + dx, H / 2 + dy);
  ctx.rotate(rotate);
  ctx.scale(scale * flipX, scale);
  ctx.drawImage(img, -W / 2, -H / 2, W, H);
  ctx.restore();
}

const EFFECTS = {
  spin: { frames: 24, delay: 50, draw: (ctx, img, t, W, H) => drawCentered(ctx, img, W, H, { rotate: t * TAU, scale: 0.72 }) },
  bounce: {
    frames: 24, delay: 50,
    draw: (ctx, img, t, W, H) => {
      const y = Math.abs(Math.sin(t * TAU)); // 0..1..0
      const squash = 1 - 0.18 * (1 - y) * (t > 0.5 ? 1 : 0);
      ctx.save();
      ctx.translate(W / 2, H);
      ctx.scale(1 + (1 - squash) * 0.8, squash);
      ctx.translate(-W / 2, -H);
      drawCentered(ctx, img, W, H, { scale: 0.85, dy: -y * H * 0.18 + H * 0.07 });
      ctx.restore();
    },
  },
  shake: { frames: 16, delay: 40, draw: (ctx, img, t, W, H) => drawCentered(ctx, img, W, H, { scale: 0.9, dx: (Math.random() - 0.5) * W * 0.12, dy: (Math.random() - 0.5) * H * 0.12 }) },
  zoom: { frames: 24, delay: 50, draw: (ctx, img, t, W, H) => drawCentered(ctx, img, W, H, { scale: 0.8 + 0.35 * (0.5 - 0.5 * Math.cos(t * TAU)) }) },
  wiggle: { frames: 20, delay: 45, draw: (ctx, img, t, W, H) => drawCentered(ctx, img, W, H, { scale: 0.88, rotate: Math.sin(t * TAU) * 0.22 }) },
  flip: { frames: 24, delay: 50, draw: (ctx, img, t, W, H) => drawCentered(ctx, img, W, H, { scale: 0.95, flipX: Math.cos(t * TAU) || 0.01 }) },
  fade: {
    frames: 24, delay: 60,
    draw: (ctx, img, t, W, H) => {
      // GIF has no partial transparency, so fade over a solid Discord-dark background.
      ctx.fillStyle = '#313338';
      ctx.fillRect(0, 0, W, H);
      drawCentered(ctx, img, W, H, { alpha: 0.05 + 0.95 * (0.5 - 0.5 * Math.cos(t * TAU)) });
    },
  },
  slide: { frames: 24, delay: 45, draw: (ctx, img, t, W, H) => drawCentered(ctx, img, W, H, { dx: (t - 0.5) * W * 2 }) },
  rainbow: {
    frames: 24, delay: 60,
    draw: (ctx, img, t, W, H) => {
      drawCentered(ctx, img, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'hue';
      ctx.fillStyle = `hsl(${Math.round(t * 360)}, 100%, 50%)`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(img, 0, 0, W, H); // keep original alpha
      ctx.restore();
    },
  },
  pulse: { frames: 20, delay: 50, draw: (ctx, img, t, W, H) => drawCentered(ctx, img, W, H, { scale: 0.85 + 0.12 * Math.max(0, Math.sin(t * TAU)), alpha: 0.85 + 0.15 * Math.max(0, Math.sin(t * TAU)) }) },
  still: { frames: 1, delay: 100, draw: (ctx, img, t, W, H) => drawCentered(ctx, img, W, H) },
};

const SPEED = { slow: 1.8, normal: 1, fast: 0.55 };

// Renders all frames as RGBA arrays. createCanvas comes from the canvas lib.
function renderFrames(createCanvas, img, { effect = 'spin', size = 256, speed = 'normal' } = {}) {
  const fx = EFFECTS[effect] || EFFECTS.spin;
  const ratio = img.width / img.height;
  const W = ratio >= 1 ? size : Math.round(size * ratio);
  const H = ratio >= 1 ? Math.round(size / ratio) : size;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const frames = [];
  for (let i = 0; i < fx.frames; i++) {
    ctx.clearRect(0, 0, W, H);
    fx.draw(ctx, img, i / fx.frames, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    frames.push({ data, width: W, height: H, delay: Math.round(fx.delay * (SPEED[speed] || 1)) });
  }
  return frames;
}

module.exports = { EFFECTS, renderFrames, EFFECT_NAMES: Object.keys(EFFECTS) };
