/**
 * Sol par tuile : quelle case de forme (4 unités) fournit le sol d'une tuile affichée de côté T (5 pour les sols importés de D2,
 * 4 pour ceux du jeu). Les tuiles ne tombent pas sur la grille de la forme : une tuile dont le centre est sur du vide mais dont
 * l'emprise recouvre du sol praticable (ou le pied d'un mur) doit quand même être dessinée, sinon des bandes noires courent
 * le long des bords en escalier.
 */
export interface GroundTilesLike {
  size: number;
  cols: number;
  rows: number;
  data: Uint8Array;
}

export const NO_TILE = 255;

/** Sol de la tuile (i, j) de côté T : celui de la case sous son centre, à défaut celui de la case non vide de l'emprise la plus proche du centre */
export function groundKindAt(gt: GroundTilesLike, i: number, j: number, T: number): number {
  const at = (x: number, y: number) => gt.data[Math.max(0, Math.min(gt.rows - 1, y)) * gt.cols + Math.max(0, Math.min(gt.cols - 1, x))];
  const cx = (i + 0.5) * T;
  const cy = (j + 0.5) * T;
  const k = at(Math.floor(cx / gt.size), Math.floor(cy / gt.size));
  if (k !== NO_TILE) return k;
  // l'emprise [iT, (i+1)T[ ne déborde sur la case voisine que si T n'est pas un diviseur de la taille : lecture des cases touchées
  const x0 = Math.floor((i * T) / gt.size);
  const x1 = Math.floor(((i + 1) * T - 1e-6) / gt.size);
  const y0 = Math.floor((j * T) / gt.size);
  const y1 = Math.floor(((j + 1) * T - 1e-6) / gt.size);
  // hors de la carte (marge), seule la case de bord compte : pas d'extension du sol au-delà de la forme
  if (x1 < 0 || y1 < 0 || x0 >= gt.cols || y0 >= gt.rows) return NO_TILE;
  let best = NO_TILE;
  let bd = Infinity;
  for (let y = Math.max(0, y0); y <= Math.min(gt.rows - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(gt.cols - 1, x1); x++) {
      const v = gt.data[y * gt.cols + x];
      if (v === NO_TILE) continue;
      const d = Math.hypot((x + 0.5) * gt.size - cx, (y + 0.5) * gt.size - cy);
      if (d < bd) ((bd = d), (best = v));
    }
  return best;
}
