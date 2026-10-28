/**
 * Courbes de niveau des compétences. Trois formes :
 * - paliers D2 (niveaux 2-8, 9-16, 17-22, 23-28, 29+) : `R(base, inc…)` ;
 * - table D2 échantillonnée aux niveaux 1, 2, 3, 8, 9, 16, 17 et 20 (Arreat Summit) :
 *   `P([…])`, interpolée linéairement (exacte à l'intérieur de chaque palier) et prolongée au-delà
 *   du niveau 20 avec la pente des niveaux 17 à 20 ;
 * - table complète niveau par niveau (wiki PD2, niveaux 1 à 60) : `T([…])`, prolongée au-delà
 *   avec la pente des deux dernières valeurs.
 */

export interface Ramp {
  base: number;
  /** incréments pour les tranches [2-8], [9-16], [17-22], [23-28], [29+] */
  inc: [number, number, number, number, number];
  /** Valeurs D2 aux niveaux PTS_LEVELS (prioritaires sur les paliers) */
  pts?: number[];
  /** Valeurs aux niveaux 1, 2, 3… (prioritaires sur tout le reste) */
  tab?: number[];
}

/** Valeur linéaire [base, par niveau] ou courbe */
export type Lin = [number, number] | Ramp;

const PTS_LEVELS = [1, 2, 3, 8, 9, 16, 17, 20];

export function ramp(r: Ramp, lvl: number): number {
  if (lvl <= 0) return 0;
  if (r.tab) {
    const t = r.tab;
    const i = Math.floor(lvl);
    if (i <= t.length) return t[Math.max(1, i) - 1];
    const n = t.length;
    return t[n - 1] + (n > 1 ? t[n - 1] - t[n - 2] : 0) * (i - n);
  }
  if (r.pts) {
    const p = r.pts;
    const L = PTS_LEVELS;
    if (lvl >= 20) return p[7] + ((p[7] - p[6]) / 3) * (lvl - 20);
    for (let i = 1; i < L.length; i++) {
      if (lvl <= L[i]) return p[i - 1] + ((p[i] - p[i - 1]) * (lvl - L[i - 1])) / (L[i] - L[i - 1]);
    }
    return p[7];
  }
  const l = lvl;
  let v = r.base;
  v += r.inc[0] * Math.max(0, Math.min(l, 8) - 1);
  v += r.inc[1] * Math.max(0, Math.min(l, 16) - 8);
  v += r.inc[2] * Math.max(0, Math.min(l, 22) - 16);
  v += r.inc[3] * Math.max(0, Math.min(l, 28) - 22);
  v += r.inc[4] * Math.max(0, l - 28);
  return v;
}

export const R = (base: number, a: number, b: number, c: number, d: number, e: number): Ramp => ({ base, inc: [a, b, c, d, e] });

/** Table D2 : valeurs aux niveaux 1, 2, 3, 8, 9, 16, 17, 20 */
export const P = (pts: number[]): Ramp => ({ base: pts[0], inc: [0, 0, 0, 0, 0], pts });

/** Table niveau par niveau (indice 0 = niveau 1) */
export const T = (tab: number[]): Ramp => ({ base: tab[0], inc: [0, 0, 0, 0, 0], tab });

export function lin(v: Lin | undefined, lvl: number): number {
  if (!v) return 0;
  if (!Array.isArray(v)) return ramp(v, Math.max(1, lvl));
  return v[0] + v[1] * Math.max(0, lvl - 1);
}
