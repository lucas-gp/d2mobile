/**
 * DT1 : tuiles isométriques (sols, murs, toits). Un tuile = blocs de 32 px placés par (x, y) ;
 * bloc isométrique (format 1, losange 32x15, 256 octets) ou RLE (murs, ornements).
 * Sortie : image en indices de palette, décalée par rapport à l'origine de la tuile.
 */
import type { IndexedImage } from './dc6';

export interface Dt1Tile {
  index: number;
  /** orientation brute du format : 0 sol, 1..12 murs/coins, 13.. ombres/arbres, 15 toit */
  orientation: number;
  kind: 'floor' | 'wall' | 'roof' | 'other';
  mainIndex: number;
  subIndex: number;
  rarity: number;
  /** dimensions déclarées (largeur, hauteur ; hauteur négative pour les murs) */
  width: number;
  height: number;
  roofHeight: number;
  blocks: number;
  /** drapeaux des 25 sous-tuiles (5 × 5, ligne par ligne) : 1 = bloque la marche, 8 = bloque le joueur, 32 = bloque la vue/les sorts */
  subFlags: Uint8Array;
  image: IndexedImage;
}

const ISO_W = [4, 8, 12, 16, 20, 24, 28, 32, 28, 24, 20, 16, 12, 8, 4];
const ISO_X = [14, 12, 10, 8, 6, 4, 2, 0, 2, 4, 6, 8, 10, 12, 14];

export function dt1TileCount(d: Uint8Array): number {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getInt32(268, true);
}

export function decodeDt1(d: Uint8Array): Dt1Tile[] {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const n = v.getInt32(268, true);
  let p = v.getInt32(272, true);
  const tiles: Dt1Tile[] = [];
  for (let t = 0; t < n; t++, p += 96) {
    const orientation = v.getInt32(p + 20, true);
    const width = v.getInt32(p + 12, true);
    const height = v.getInt32(p + 8, true);
    const blockPtr = v.getInt32(p + 72, true);
    const nBlocks = v.getInt32(p + 80, true);
    const bl: { x: number; y: number; w: number; h: number; px: Uint8Array }[] = [];
    for (let b = 0; b < nBlocks; b++) {
      const h = blockPtr + b * 20;
      const x = v.getInt16(h, true);
      const y = v.getInt16(h + 2, true);
      const fmt = v.getUint16(h + 8, true);
      const len = v.getInt32(h + 10, true);
      const off = blockPtr + v.getInt32(h + 16, true);
      const data = d.subarray(off, off + len);
      if (fmt === 1) {
        const px = new Uint8Array(32 * 15);
        let q = 0;
        for (let r = 0; r < 15; r++) for (let i = 0; i < ISO_W[r]; i++) px[r * 32 + ISO_X[r] + i] = data[q++];
        bl.push({ x, y, w: 32, h: 15, px });
      } else {
        // RLE : paires (saut, nombre) ; (0, 0) = ligne suivante
        let rows = 1;
        for (let q = 0; q + 1 < data.length;) {
          const skip = data[q];
          const cnt = data[q + 1];
          q += 2;
          if (!skip && !cnt) rows++;
          else q += cnt;
        }
        const px = new Uint8Array(32 * rows);
        let row = 0;
        let cx = 0;
        for (let q = 0; q + 1 < data.length;) {
          const skip = data[q];
          const cnt = data[q + 1];
          q += 2;
          if (!skip && !cnt) {
            row++;
            cx = 0;
            continue;
          }
          cx += skip;
          for (let i = 0; i < cnt; i++) {
            if (cx < 32 && row < rows) px[row * 32 + cx] = data[q];
            cx++;
            q++;
          }
        }
        bl.push({ x, y, w: 32, h: rows, px });
      }
    }
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    for (const b of bl) {
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    if (!bl.length) {
      x0 = y0 = 0;
      x1 = y1 = 1;
    }
    const w = x1 - x0;
    const h = y1 - y0;
    const px = new Uint8Array(w * h);
    for (const b of bl) {
      for (let y = 0; y < b.h; y++) {
        for (let x = 0; x < b.w; x++) {
          const c = b.px[y * b.w + x];
          if (c) px[(b.y - y0 + y) * w + (b.x - x0 + x)] = c;
        }
      }
    }
    tiles.push({
      index: t,
      orientation,
      kind: orientation === 0 ? 'floor' : orientation === 15 ? 'roof' : orientation >= 1 && orientation <= 12 ? 'wall' : 'other',
      mainIndex: v.getInt32(p + 24, true),
      subIndex: v.getInt32(p + 28, true),
      rarity: v.getInt32(p + 32, true),
      width,
      height,
      roofHeight: v.getUint16(p + 4, true),
      blocks: nBlocks,
      subFlags: d.slice(p + 40, p + 65),
      image: { w, h, ox: x0, oy: y0, px },
    });
  }
  return tiles;
}
