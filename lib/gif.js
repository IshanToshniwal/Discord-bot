// Minimal animated-GIF encoder: median-cut palette (255 colours + 1 transparent
// slot) and standard GIF LZW. Pure JS, no dependencies.
//
// encodeGif(frames, { loop = 0 })
//   frames: [{ data: Uint8ClampedArray (RGBA), width, height, delay (ms) }]
//   returns Buffer

const TRANSPARENT = 0; // palette index reserved for transparency
const MAX_COLORS = 255;

// ---------------------------------------------------------------------------
// Palette: median cut over a sample of opaque pixels
// ---------------------------------------------------------------------------
function buildPalette(data, sampleStep = 4) {
  const px = [];
  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    if (data[i + 3] < 128) continue;
    px.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!px.length) return [[0, 0, 0]];

  let boxes = [px];
  while (boxes.length < MAX_COLORS) {
    // pick the box with the largest range
    let bi = -1;
    let bestRange = -1;
    let bestCh = 0;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      if (box.length < 2) continue;
      for (let ch = 0; ch < 3; ch++) {
        let mn = 255, mx = 0;
        for (const p of box) {
          if (p[ch] < mn) mn = p[ch];
          if (p[ch] > mx) mx = p[ch];
        }
        if (mx - mn > bestRange) {
          bestRange = mx - mn;
          bi = b;
          bestCh = ch;
        }
      }
    }
    if (bi === -1 || bestRange === 0) break;
    const box = boxes[bi];
    box.sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
    const n = box.length;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

function nearestIndex(palette, cache, r, g, b) {
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  const hit = cache[key];
  if (hit !== 0) return hit - 1;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
      if (d === 0) break;
    }
  }
  cache[key] = best + 1;
  return best;
}

function indexFrame(data, palette) {
  const out = new Uint8Array(data.length / 4);
  const cache = new Uint16Array(32768);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    if (data[i + 3] < 128) {
      out[j] = TRANSPARENT;
      continue;
    }
    out[j] = nearestIndex(palette, cache, data[i], data[i + 1], data[i + 2]) + 1; // +1: slot 0 is transparent
  }
  return out;
}

// ---------------------------------------------------------------------------
// LZW
// ---------------------------------------------------------------------------
function lzwEncode(indices, minCodeSize, out) {
  const clearCode = 1 << minCodeSize;
  const eoi = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoi + 1;
  let dict = new Map();

  let bitBuf = 0;
  let bitCnt = 0;
  const chunk = [];
  const flushChunk = () => {
    if (!chunk.length) return;
    out.push(chunk.length, ...chunk);
    chunk.length = 0;
  };
  const emit = (code) => {
    bitBuf |= code << bitCnt;
    bitCnt += codeSize;
    while (bitCnt >= 8) {
      chunk.push(bitBuf & 0xff);
      bitBuf >>>= 8;
      bitCnt -= 8;
      if (chunk.length === 255) flushChunk();
    }
  };

  emit(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (nextCode < 4096) {
      dict.set(key, nextCode++);
      if (nextCode > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      emit(clearCode);
      dict = new Map();
      nextCode = eoi + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bitCnt > 0) chunk.push(bitBuf & 0xff);
  flushChunk();
  out.push(0); // block terminator
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------
function u16(out, v) {
  out.push(v & 0xff, (v >> 8) & 0xff);
}

function encodeGif(frames, { loop = 0 } = {}) {
  if (!frames.length) throw new Error('No frames');
  const { width, height } = frames[0];
  const out = [];

  // Header + logical screen (no global colour table; each frame carries its own)
  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a
  u16(out, width);
  u16(out, height);
  out.push(0x00, 0x00, 0x00);

  // Netscape looping extension
  out.push(0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 0x03, 0x01);
  u16(out, loop);
  out.push(0x00);

  for (const f of frames) {
    const palette = buildPalette(f.data);
    const indices = indexFrame(f.data, palette);
    const size = palette.length + 1; // + transparent slot
    let bits = 2;
    while (1 << bits < size) bits++;
    const tableSize = 1 << bits;

    // Graphic control extension: disposal 2 (restore to bg), transparency on
    out.push(0x21, 0xf9, 0x04, (2 << 2) | 0x01);
    u16(out, Math.max(2, Math.round((f.delay ?? 80) / 10)));
    out.push(TRANSPARENT, 0x00);

    // Image descriptor with local colour table
    out.push(0x2c);
    u16(out, 0);
    u16(out, 0);
    u16(out, width);
    u16(out, height);
    out.push(0x80 | (bits - 1));
    out.push(0, 0, 0); // index 0 = transparent
    for (const [r, g, b] of palette) out.push(r, g, b);
    for (let i = palette.length + 1; i < tableSize; i++) out.push(0, 0, 0);

    const minCodeSize = Math.max(2, bits);
    out.push(minCodeSize);
    lzwEncode(indices, minCodeSize, out);
  }
  out.push(0x3b); // trailer
  return Buffer.from(out);
}

module.exports = { encodeGif };
