/** Décodeur GIF minimal (images animées, palette globale/locale, transparence, méthodes de disposition 0-3) : renvoie des images RGBA complètes */
export interface GifFrame {
  /** RGBA, w × h du GIF */
  rgba: Uint8Array;
  /** durée en ms */
  delay: number;
}

export function decodeGif(buf: Uint8Array): { w: number; h: number; frames: GifFrame[] } {
  let p = 6;
  const u16 = () => {
    const v = buf[p] | (buf[p + 1] << 8);
    p += 2;
    return v;
  };
  if (String.fromCharCode(...buf.subarray(0, 3)) !== 'GIF') throw new Error('pas un GIF');
  const W = u16();
  const H = u16();
  const flags = buf[p++];
  p += 2; // fond, ratio
  let gct: Uint8Array | null = null;
  if (flags & 0x80) {
    const n = 3 << ((flags & 7) + 1);
    gct = buf.subarray(p, p + n);
    p += n;
  }
  const frames: GifFrame[] = [];
  let canvas = new Uint8Array(W * H * 4);
  let gce = { delay: 100, transp: -1, disposal: 0 };
  const skipBlocks = () => {
    while (buf[p]) p += buf[p] + 1;
    p++;
  };
  while (p < buf.length) {
    const b = buf[p++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = buf[p++];
      if (label === 0xf9) {
        const f = buf[p + 1];
        gce = { delay: (buf[p + 2] | (buf[p + 3] << 8)) * 10 || 100, transp: f & 1 ? buf[p + 4] : -1, disposal: (f >> 2) & 7 };
      }
      skipBlocks();
    } else if (b === 0x2c) {
      const x0 = u16();
      const y0 = u16();
      const w = u16();
      const h = u16();
      const lf = buf[p++];
      let ct = gct;
      if (lf & 0x80) {
        const n = 3 << ((lf & 7) + 1);
        ct = buf.subarray(p, p + n);
        p += n;
      }
      const interlaced = !!(lf & 0x40);
      const minCode = buf[p++];
      const data: number[] = [];
      while (buf[p]) {
        for (let i = 0; i < buf[p]; i++) data.push(buf[p + 1 + i]);
        p += buf[p] + 1;
      }
      p++;
      const idx = lzw(data, minCode, w * h);
      const prev = gce.disposal === 3 ? canvas.slice() : null;
      const rows = interlaced ? interlaceRows(h) : null;
      for (let i = 0; i < w * h; i++) {
        const c = idx[i];
        if (c === gce.transp || !ct) continue;
        const yy = y0 + (rows ? rows[Math.floor(i / w)] : Math.floor(i / w));
        const xx = x0 + (i % w);
        if (xx >= W || yy >= H) continue;
        const o = (yy * W + xx) * 4;
        canvas[o] = ct[c * 3];
        canvas[o + 1] = ct[c * 3 + 1];
        canvas[o + 2] = ct[c * 3 + 2];
        canvas[o + 3] = 255;
      }
      frames.push({ rgba: canvas.slice(), delay: gce.delay });
      if (gce.disposal === 2) {
        for (let y = y0; y < Math.min(H, y0 + h); y++) canvas.fill(0, (y * W + x0) * 4, (y * W + Math.min(W, x0 + w)) * 4);
      } else if (gce.disposal === 3 && prev) canvas = prev;
      gce = { delay: 100, transp: -1, disposal: 0 };
    } else break;
  }
  return { w: W, h: H, frames };
}

function interlaceRows(h: number): number[] {
  const out: number[] = [];
  for (const [s, st] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ])
    for (let y = s; y < h; y += st) out.push(y);
  return out;
}

function lzw(data: number[], minCode: number, size: number): Uint8Array {
  const out = new Uint8Array(size);
  const clear = 1 << minCode;
  const end = clear + 1;
  let codeSize = minCode + 1;
  let next = end + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  let prev = -1;
  let first = 0;
  let bits = 0;
  let nbits = 0;
  let di = 0;
  let o = 0;
  for (let i = 0; i < clear; i++) suffix[i] = i;
  while (o < size) {
    while (nbits < codeSize && di < data.length) {
      bits |= data[di++] << nbits;
      nbits += 8;
    }
    if (nbits < codeSize) break;
    let code = bits & ((1 << codeSize) - 1);
    bits >>= codeSize;
    nbits -= codeSize;
    if (code === clear) {
      codeSize = minCode + 1;
      next = end + 1;
      prev = -1;
      continue;
    }
    if (code === end) break;
    if (prev === -1) {
      out[o++] = suffix[code];
      prev = code;
      first = code;
      continue;
    }
    const inCode = code;
    let sp = 0;
    if (code >= next) {
      stack[sp++] = first;
      code = prev;
    }
    while (code >= clear) {
      stack[sp++] = suffix[code];
      code = prefix[code];
    }
    first = suffix[code];
    stack[sp++] = first;
    if (next < 4096) {
      prefix[next] = prev;
      suffix[next] = first;
      next++;
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = inCode;
    while (sp > 0 && o < size) out[o++] = stack[--sp];
  }
  return out;
}
