/** COF : description d'une animation (calques, ordre de dessin par direction et par trame) */
import { latin1 } from '../bytes';
export const COMPOSITS = ['hd', 'tr', 'lg', 'ra', 'la', 'rh', 'lh', 'sh', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

export interface CofLayer {
  composit: number;
  dir: string; // 'hd', 'tr'...
  shadow: number;
  selectable: number;
  /** calque dessiné avec un effet de transparence (voir drawEffect) */
  transparent: number;
  /** 0-2 : transparence 75 / 50 / 25 % ; 3 et plus : mélange additif (lueurs, flammes : le noir est invisible) */
  drawEffect: number;
  weaponClass: string;
}
export interface Cof {
  layers: CofLayer[];
  framesPerDir: number;
  directions: number;
  /** flags par trame (bit 0 = trame de déclenchement : coup porté, pas, etc.) */
  frameFlags: number[];
  /** ordre de dessin : [direction][trame] = liste de composits (du fond vers l'avant) */
  order: number[][][];
}

export function parseCof(d: Uint8Array): Cof {
  const nLayers = d[0];
  const fpd = d[1];
  const dirs = d[2];
  let p = 28;
  const layers: CofLayer[] = [];
  for (let i = 0; i < nLayers; i++) {
    const comp = d[p];
    const wc = latin1(d.subarray(p + 5, p + 9)).replace(/\0.*$/, '');
    layers.push({ composit: comp, dir: COMPOSITS[comp] ?? `c${comp}`, shadow: d[p + 1], selectable: d[p + 2], transparent: d[p + 3], drawEffect: d[p + 4], weaponClass: wc });
    p += 9;
  }
  const frameFlags = Array.from(d.subarray(p, p + fpd));
  p += fpd;
  const order: number[][][] = [];
  for (let di = 0; di < dirs; di++) {
    const fr: number[][] = [];
    for (let f = 0; f < fpd; f++) {
      fr.push(Array.from(d.subarray(p, p + nLayers)));
      p += nLayers;
    }
    order.push(fr);
  }
  return { layers, framesPerDir: fpd, directions: dirs, frameFlags, order };
}
