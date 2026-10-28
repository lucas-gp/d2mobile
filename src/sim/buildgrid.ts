/** Grille de collision d'une zone (murs, décors, obstacles, drapeaux Diablo II). Module feuille : utilisé par world.ts et les zones. */
import type { ZoneDef } from '../data/zone-types';
import { PROP_BY_ID, propRect } from '../data/props';
import { WalkGrid } from './grid';

export function buildGrid(z: ZoneDef): WalkGrid {
  const g = new WalkGrid(z.width, z.height);
  if (z.d2Map && z.d2Map.cols === g.cols && z.d2Map.rows === g.rows) {
    // carte de Diablo II : la collision vient des drapeaux de ses tuiles (murs, bâtiments, arbres)
    g.blocked.set(z.d2Map.blocked);
    g.opaque.set(z.d2Map.opaque);
  }
  for (const w of z.walls) {
    const t = (w.thick ?? 1) / 2;
    const x0 = Math.min(w.x0, w.x1) - (w.x0 === w.x1 ? t : 0);
    const x1 = Math.max(w.x0, w.x1) + (w.x0 === w.x1 ? t : 0);
    const y0 = Math.min(w.y0, w.y1) - (w.y0 === w.y1 ? t : 0);
    const y1 = Math.max(w.y0, w.y1) + (w.y0 === w.y1 ? t : 0);
    g.blockRect(x0, y0, x1, y1, true);
  }
  for (const pl of z.props) {
    const def = PROP_BY_ID[pl.prop];
    if (!def) throw new Error(`Décor inconnu : ${pl.prop}`);
    if (def.shape === 'none') continue;
    const sc = pl.scale ?? 1;
    if (def.shape === 'circle') g.blockCircle(pl.x, pl.y, (Math.min(def.w, def.h) * sc * (def.solid ?? 1)) / 2, def.opaque);
    else {
      const r = propRect(def, pl.x, pl.y, sc);
      g.blockRect(r[0], r[1], r[2], r[3], def.opaque);
    }
  }
  for (const b of z.blockers) {
    if (b.rect) g.blockRect(b.rect[0], b.rect[1], b.rect[2], b.rect[3], b.opaque ?? true);
    if (b.circle) g.blockCircle(b.circle[0], b.circle[1], b.circle[2], b.opaque ?? false);
  }
  return g;
}
