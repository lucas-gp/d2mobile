/** DC6 : images fixes RLE (icônes d'objets, interface). Sortie en indices de palette (0 = transparent). */
export interface IndexedImage {
  w: number;
  h: number;
  /** décalage du coin haut-gauche par rapport à l'origine de l'animation */
  ox: number;
  oy: number;
  /** w*h indices de palette, 0 = transparent */
  px: Uint8Array;
}

export interface Dc6 {
  directions: number;
  framesPerDir: number;
  frames: IndexedImage[]; // direction * framesPerDir + frame
}

export function decodeDc6(d: Uint8Array): Dc6 {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const version = v.getUint32(0, true);
  if (version !== 6) throw new Error(`DC6 version ${version} non gérée`);
  const dirs = v.getUint32(16, true);
  const fpd = v.getUint32(20, true);
  const n = dirs * fpd;
  const frames: IndexedImage[] = [];
  for (let i = 0; i < n; i++) {
    const off = v.getUint32(24 + i * 4, true);
    const flip = v.getUint32(off, true);
    const w = v.getUint32(off + 4, true);
    const h = v.getUint32(off + 8, true);
    const ox = v.getInt32(off + 12, true);
    const oy = v.getInt32(off + 16, true);
    const len = v.getUint32(off + 28, true);
    const px = new Uint8Array(w * h);
    let p = off + 32;
    const end = p + len;
    let x = 0;
    let y = flip ? 0 : h - 1;
    while (p < end && y >= 0 && y < h) {
      const b = d[p++];
      if (b === 0x80) {
        x = 0;
        y += flip ? 1 : -1;
      } else if (b & 0x80) x += b & 0x7f;
      else {
        for (let k = 0; k < b; k++) {
          if (x < w) px[y * w + x] = d[p];
          x++;
          p++;
        }
      }
    }
    // oy = ligne du bas de l'image (repère écran, y vers le bas)
    frames.push({ w, h, ox, oy: flip ? oy : oy - h + 1, px });
  }
  return { directions: dirs, framesPerDir: fpd, frames };
}
