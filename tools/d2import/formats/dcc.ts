/**
 * DCC : sprites animés de D2 (personnages, monstres, calques d'équipement).
 * Flux de bits LSB d'abord ; par direction : en-tête, en-têtes de trames, table des couleurs utilisées,
 * puis 5 flux (cellules égales, masques de pixels, types d'encodage, pixels bruts, codes/déplacements).
 * Chaque trame est découpée en cellules de 4x4 alignées sur la boîte de la direction.
 * Sortie : indices de palette (0 = transparent), boîte de chaque trame en repère « pieds » (y vers le bas).
 */
import type { IndexedImage } from './dc6';

const CRAZY = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32];

class Bits {
  pos: number; // en bits
  constructor(
    readonly buf: Uint8Array,
    pos: number,
  ) {
    this.pos = pos;
  }
  read(n: number): number {
    let v = 0;
    let got = 0;
    while (got < n) {
      const byte = this.buf[this.pos >> 3] ?? 0;
      const bit = this.pos & 7;
      const take = Math.min(8 - bit, n - got);
      const bits = (byte >> bit) & ((1 << take) - 1);
      v += bits * 2 ** got;
      got += take;
      this.pos += take;
    }
    return v;
  }
  signed(n: number): number {
    if (n === 0) return 0;
    const v = this.read(n);
    return n < 32 && v >= 2 ** (n - 1) ? v - 2 ** n : v;
  }
}

export interface DccFrame extends IndexedImage {
  /** boîte en repère pieds : x = ox .. ox+w, y = oy .. oy+h (déjà dans IndexedImage) */
}
export interface DccDirection {
  frames: DccFrame[];
  /** vérification interne : taille des flux consommée vs annoncée */
  diag: { flag: number; ok: boolean; dev: number[] };
}
export interface Dcc {
  directions: DccDirection[];
  framesPerDir: number;
}

interface PbEntry {
  val: number[];
  frame: number;
  n: number;
}
export const RULE = { v: 'A', c: 'none' };
function bitsFor(v: number[], n: number): number {
  const distinct = new Set(v).size;
  switch (RULE.v) {
    case 'B':
      return v[0] === v[1] ? 0 : 2;
    case 'C':
      return n <= 1 ? 0 : n === 2 ? 1 : 2;
    case 'D':
      return v[0] === v[1] && v[1] === v[2] && v[2] === v[3] ? 0 : v[1] === v[2] ? 1 : 2;
    case 'E':
      return distinct === 1 ? 0 : distinct === 2 ? 1 : 2;
    case 'F':
      return v[0] === v[1] ? 0 : v[1] === v[2] ? 1 : v[2] === v[3] ? 2 : 2;
    default:
      return v[0] === v[1] ? 0 : v[1] === v[2] ? 1 : 2;
  }
}

export function decodeDcc(d: Uint8Array): Dcc {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  if (d[0] !== 0x74) throw new Error('DCC : signature invalide');
  const nDirs = d[2];
  const fpd = v.getUint32(3, true);
  const offs: number[] = [];
  for (let i = 0; i < nDirs; i++) offs.push(v.getUint32(15 + i * 4, true));
  const directions = offs.map((o, i) => decodeDirection(d, o, fpd, (offs[i + 1] ?? d.length) * 8));
  return { directions, framesPerDir: fpd };
}

/** Nombre de cellules sur un axe (formule du format ; validée : les 5 flux sont consommés exactement) */
function cellCount(size: number, first: number): number {
  const r = size - first;
  if (r <= 1) return 1;
  const tmp = r - 1;
  let n = 2 + Math.floor(tmp / 4);
  if (tmp % 4 === 0) n--;
  return n;
}

function decodeDirection(d: Uint8Array, byteOff: number, nFrames: number, endBit: number): DccDirection {
  const bm = new Bits(d, byteOff * 8);
  bm.read(32); // taille codée
  const flag = bm.read(2);
  const wVar0 = bm.read(4);
  const wW = bm.read(4);
  const wH = bm.read(4);
  const wX = bm.read(4);
  const wY = bm.read(4);
  const wOpt = bm.read(4);
  const wCoded = bm.read(4);

  interface FH {
    w: number;
    h: number;
    x0: number;
    y0: number;
    opt: number;
    coded: number;
    bottomUp: number;
    hcc: number;
    vcc: number;
    cw0: number;
    ch0: number;
    cx0: number;
    cy0: number;
  }
  const fh: FH[] = [];
  let bx0 = 1e9;
  let by0 = 1e9;
  let bx1 = -1e9;
  let by1 = -1e9;
  let optSum = 0;
  for (let f = 0; f < nFrames; f++) {
    bm.read(CRAZY[wVar0]);
    const w = bm.read(CRAZY[wW]);
    const h = bm.read(CRAZY[wH]);
    const xo = bm.signed(CRAZY[wX]);
    const yo = bm.signed(CRAZY[wY]);
    const opt = bm.read(CRAZY[wOpt]);
    const coded = bm.read(CRAZY[wCoded]);
    const bottomUp = bm.read(1);
    optSum += opt;
    const x0 = xo;
    const y0 = yo - h + 1;
    bx0 = Math.min(bx0, x0);
    by0 = Math.min(by0, y0);
    bx1 = Math.max(bx1, x0 + w);
    by1 = Math.max(by1, y0 + h);
    fh.push({ w, h, x0, y0, opt, coded, bottomUp, hcc: 0, vcc: 0, cw0: 0, ch0: 0, cx0: 0, cy0: 0 });
  }
  if (optSum > 0) bm.pos += optSum * 8;

  let ecSize = 0;
  let pmSize = 0;
  let etSize = 0;
  let rpSize = 0;
  if (flag & 2) ecSize = bm.read(20);
  pmSize = bm.read(20);
  if (flag & 1) {
    etSize = bm.read(20);
    rpSize = bm.read(20);
  }
  const palEntries: number[] = [];
  for (let i = 0; i < 256; i++) if (bm.read(1)) palEntries.push(i);
  const start = bm.pos;
  const ec = new Bits(d, start);
  const pm = new Bits(d, start + ecSize);
  const et = new Bits(d, start + ecSize + pmSize);
  const rp = new Bits(d, start + ecSize + pmSize + etSize);
  const pcd = new Bits(d, start + ecSize + pmSize + etSize + rpSize);

  const dirW = bx1 - bx0;
  const dirH = by1 - by0;
  const dcw = 1 + Math.floor((dirW - 1) / 4);
  const dch = 1 + Math.floor((dirH - 1) / 4);
  for (const f of fh) {
    f.cx0 = Math.floor((f.x0 - bx0) / 4);
    f.cy0 = Math.floor((f.y0 - by0) / 4);
    f.cw0 = Math.min(4 - ((f.x0 - bx0) % 4), f.w);
    f.ch0 = Math.min(4 - ((f.y0 - by0) % 4), f.h);
    f.hcc = cellCount(f.w, f.cw0);
    f.vcc = cellCount(f.h, f.ch0);
  }

  // passe 1 : tampon de pixels par cellule
  const cellBuf: (PbEntry | null)[] = new Array(dcw * dch).fill(null);
  const frameCells: PbEntry[][] = [];
  const stack = [0, 0, 0, 0];
  for (let fi = 0; fi < nFrames; fi++) {
    const f = fh[fi];
    const cells: PbEntry[] = [];
    for (let cy = 0; cy < f.vcc; cy++) {
      for (let cx = 0; cx < f.hcc; cx++) {
        const idx = f.cx0 + cx + (f.cy0 + cy) * dcw;
        const old = cellBuf[idx];
        let same = 0;
        if (old && ecSize > 0) same = ec.read(1);
        if (!same) {
          let mask = 0x0f;
          if (old) mask = pm.read(4);
          let nb = 0;
          for (let i = 0; i < 4; i++) if (mask & (1 << i)) nb++;
          let encType = 0;
          if (nb > 0 && flag & 1) encType = et.read(1);
          let last = 0;
          let decoded = 0;
          for (let i = 0; i < nb; i++) {
            let val: number;
            if (encType) val = rp.read(8);
            else {
              val = last;
              let disp = pcd.read(4);
              val += disp;
              while (disp === 15) {
                disp = pcd.read(4);
                val += disp;
              }
            }
            if (val === last) {
              stack[i] = 0;
              break;
            }
            last = val;
            stack[i] = val;
            decoded++;
          }
          const e: PbEntry = { val: [0, 0, 0, 0], frame: fi, n: decoded + (old ? 4 - nb : 0) };
          let cur = decoded - 1;
          let asc = 0;
          for (let i = 0; i < 4; i++) {
            if (mask & (1 << i)) {
              if (RULE.v === 'V3' && old) e.val[i] = asc < decoded ? stack[asc++] : 0;
              else e.val[i] = cur >= 0 ? stack[cur--] : 0;
            } else e.val[i] = old && RULE.v !== 'V2' ? old.val[i] : 0;
          }
          cellBuf[idx] = e;
          cells.push(e);
        } else cells.push(old!);
      }
    }
    frameCells.push(cells);
  }

  // passe 2 : rendu des trames
  const frames: DccFrame[] = [];
  for (let fi = 0; fi < nFrames; fi++) {
    const f = fh[fi];
    const px = new Uint8Array(f.w * f.h);
    const prov = new Uint8Array(f.w * f.h);
    let ci = 0;
    let yStart = 0;
    for (let cy = 0; cy < f.vcc; cy++) {
      const ch = f.vcc === 1 ? f.h : cy === 0 ? f.ch0 : cy === f.vcc - 1 ? f.h - yStart : 4;
      let xStart = 0;
      for (let cx = 0; cx < f.hcc; cx++) {
        const cw = f.hcc === 1 ? f.w : cx === 0 ? f.cw0 : cx === f.hcc - 1 ? f.w - xStart : 4;
        const e = frameCells[fi][ci++];
        if (e.frame !== fi && RULE.c === 'none') {
          // cellule vide
        } else if (e.frame !== fi) {
          // cellule identique à une trame précédente : copie (repère direction)
          // identique à la trame précédente (comparaison faite sur son image, pas sur celle où la cellule a été créée)
          const si = RULE.c === 'src' ? e.frame : fi - 1;
          const src = frames[si];
          const sf = fh[si];
          for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
              const sx = f.x0 + xStart + x - sf.x0;
              const sy = f.y0 + yStart + y - sf.y0;
              if (sx >= 0 && sy >= 0 && sx < sf.w && sy < sf.h) px[(yStart + y) * f.w + xStart + x] = src.px[sy * sf.w + sx];
              prov[(yStart + y) * f.w + xStart + x] = 1;
            }
          }
        } else if (bitsFor(e.val, e.n) === 0) {
          const c = palEntries[e.val[0]] ?? 0;
          for (let y = 0; y < ch; y++)
            for (let x = 0; x < cw; x++) {
              px[(yStart + y) * f.w + xStart + x] = c;
              prov[(yStart + y) * f.w + xStart + x] = 2;
            }
        } else {
          const nbBit = bitsFor(e.val, e.n);
          for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
              const code = pcd.read(nbBit);
              {
                px[(yStart + y) * f.w + xStart + x] = palEntries[e.val[code]] ?? 0;
                prov[(yStart + y) * f.w + xStart + x] = nbBit === 1 ? 3 : 4;
              }
            }
          }
        }
        xStart += cw;
      }
      yStart += ch;
    }
    frames.push({ w: f.w, h: f.h, ox: f.x0, oy: f.y0, px, prov } as DccFrame);
  }

  // les flux doivent être consommés exactement (à l'alignement près sur l'octet pour le dernier)
  const dev = [ec.pos - (start + ecSize), pm.pos - (start + ecSize + pmSize), et.pos - (start + ecSize + pmSize + etSize), rp.pos - (start + ecSize + pmSize + etSize + rpSize)];
  dev.push(endBit - pcd.pos);
  const ok = dev.slice(0, 4).every((x) => x === 0) && dev[4] >= 0 && dev[4] < 32;
  return { frames, diag: { flag, ok, dev } };
}
