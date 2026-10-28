/**
 * Composition des calques d'une animation selon le COF (ordre de dessin propre à chaque direction et
 * à chaque trame), sur un cadre commun à toute l'animation avec un point d'ancrage fixe aux pieds.
 */
import type { Cof } from './formats/cof';
import type { Dcc } from './formats/dcc';
import type { Palette } from './formats/palette';
import { directionOrder } from './directions';

export interface Composed {
  /** taille du cadre commun */
  w: number;
  h: number;
  /** position des pieds (origine de l'animation) dans le cadre */
  ax: number;
  ay: number;
  directions: number;
  frames: number;
  /** [direction interne][trame] → RGBA w*h*4 */
  rgba: Uint8Array[][];
  /** [direction interne][trame] : le calque `behind` (arme, bouclier) est-il dessiné avant le torse (donc derrière le corps) */
  behind?: boolean[][];
}

export function compose(cof: Cof, layers: Map<number, Dcc>, pal: Palette, allAdditive = false, behindOf = -1): Composed {
  // le COF peut annoncer plus de directions que les DCC n'en contiennent (ex. corbeau : 16 annoncées, 8 réelles)
  let nd = cof.directions;
  for (const dcc of layers.values()) nd = Math.min(nd, dcc.directions.length);
  const step = cof.directions / nd;
  // le COF est indexé dans l'ordre angulaire (position logique : 0 = face au joueur, sens horaire), les DCC dans l'ordre de fichier : la direction interne d du DCC
  // correspond à la ligne `logical[d]` de l'ordre logique (même constat que Riiablo, DC.Direction.toRealDir) — sans cela, bouclier et arme alternaient devant/derrière
  const logical = directionOrder(nd).rows.reduce<number[]>((acc, r) => ((acc[r.source] = r.row), acc), []);
  const nf = cof.framesPerDir;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (const dcc of layers.values()) {
    for (const dir of dcc.directions) {
      for (const f of dir.frames) {
        if (!f.w || !f.h) continue;
        x0 = Math.min(x0, f.ox);
        y0 = Math.min(y0, f.oy);
        x1 = Math.max(x1, f.ox + f.w);
        y1 = Math.max(y1, f.oy + f.h);
      }
    }
  }
  if (x0 > x1) throw new Error('aucun calque dessinable');
  const w = x1 - x0;
  const h = y1 - y0;
  // effet de dessin par calque (−1 = opaque)
  const effects = new Map<number, number>();
  for (const l of cof.layers) if (l.transparent) effects.set(l.composit, l.drawEffect);
  // objets de lumière (portails) : tous les calques s'additionnent, le noir est invisible
  if (allAdditive) for (const l of cof.layers) effects.set(l.composit, 5);
  const rgba: Uint8Array[][] = [];
  const behind: boolean[][] = [];
  for (let d = 0; d < nd; d++) {
    const row: Uint8Array[] = [];
    const brow: boolean[] = [];
    for (let f = 0; f < nf; f++) {
      const img = new Uint8Array(w * h * 4);
      if (behindOf >= 0) {
        const ord = cof.order[(logical[d] ?? d) * step][f];
        brow.push(ord.indexOf(behindOf) < ord.indexOf(1));
      }
      for (const comp of cof.order[(logical[d] ?? d) * step][f]) {
        const dcc = layers.get(comp);
        const fr = dcc?.directions[d]?.frames[f];
        if (!fr) continue;
        const fx = effects.get(comp) ?? -1;
        for (let y = 0; y < fr.h; y++) {
          const yy = fr.oy - y0 + y;
          for (let x = 0; x < fr.w; x++) {
            const c = fr.px[y * fr.w + x];
            if (!c) continue;
            const o = (yy * w + (fr.ox - x0 + x)) * 4;
            const r = pal[c * 3];
            const g = pal[c * 3 + 1];
            const b = pal[c * 3 + 2];
            if (fx < 0) {
              img[o] = r;
              img[o + 1] = g;
              img[o + 2] = b;
              img[o + 3] = 255;
            } else if (fx <= 2) {
              // transparence fixe (25, 50 ou 75 % d'opacité) par-dessus ce qui est déjà dessiné
              const a = (fx + 1) * 64;
              const da = img[o + 3];
              const oa = a + (da * (255 - a)) / 255;
              img[o] = (r * a + (img[o] * da * (255 - a)) / 255) / oa;
              img[o + 1] = (g * a + (img[o + 1] * da * (255 - a)) / 255) / oa;
              img[o + 2] = (b * a + (img[o + 2] * da * (255 - a)) / 255) / oa;
              img[o + 3] = oa;
            } else {
              // mélange additif : la lumière s'ajoute ; sur fond vide, l'opacité suit la luminosité (noir = invisible)
              const da = img[o + 3];
              const pr = Math.min(255, (img[o] * da) / 255 + r);
              const pg = Math.min(255, (img[o + 1] * da) / 255 + g);
              const pb = Math.min(255, (img[o + 2] * da) / 255 + b);
              const oa = Math.max(da, r, g, b);
              if (!oa) continue;
              img[o] = Math.min(255, (pr * 255) / oa);
              img[o + 1] = Math.min(255, (pg * 255) / oa);
              img[o + 2] = Math.min(255, (pb * 255) / oa);
              img[o + 3] = oa;
            }
          }
        }
      }
      if (allAdditive) {
        fillEnclosed(img, w, h);
        softenGlow(img, w, h);
      }
      row.push(img);
    }
    rgba.push(row);
    behind.push(brow);
  }
  return { w, h, ax: -x0, ay: -y0, directions: nd, frames: nf, rgba, behind: behindOf >= 0 ? behind : undefined };
}

/** Image de lumière : les pixels vides qui ne touchent pas le bord (trous du dessin, intérieur du portail) deviennent un voile bleu sombre */
function fillEnclosed(img: Uint8Array, w: number, h: number): void {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (!outside[i] && !img[i * 4 + 3]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let i = 0; i < w * h; i++) {
    if (outside[i] || img[i * 4 + 3]) continue;
    img[i * 4] = 100;
    img[i * 4 + 1] = 130;
    img[i * 4 + 2] = 255;
    img[i * 4 + 3] = 150;
  }
}

/** Adoucit une image de lumière (portail) : flou 3 × 3 sur les couleurs pondérées par l'opacité, qui efface les pixels isolés du tramage d'origine */
function softenGlow(img: Uint8Array, w: number, h: number): void {
  const src = img.slice();
  const k = [1, 2, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = (yy * w + xx) * 4;
          const wk = k[dx + 1] * k[dy + 1];
          const al = src[q + 3];
          r += src[q] * al * wk;
          g += src[q + 1] * al * wk;
          b += src[q + 2] * al * wk;
          a += al * wk;
          wt += wk;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        img[o] = r / a;
        img[o + 1] = g / a;
        img[o + 2] = b / a;
      }
      img[o + 3] = a / wt;
    }
  }
}
