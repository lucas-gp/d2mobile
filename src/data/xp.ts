// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Expérience (Experience.txt D2 1.13, identique PD2) : XP totale pour atteindre chaque niveau,
 * ExpRatio au-delà du niveau 69, et table L-XP de MonLvl par difficulté (points de contrôle
 * interpolés géométriquement). Voir mods/pd2/docs/ETUDE-PD2.md §9.
 */
import type { Difficulty } from './types';

export const MAX_LEVEL = 99;

/** XP_TABLE[L-1] = XP totale pour atteindre le niveau L */
export const XP_TABLE: number[] = [
  0, 500, 1500, 3750, 7875, 14175, 22680, 32886, 44396, 57715, 72144, 90180, 112725, 140906, 176132, 220165, 275207, 344008, 430010, 537513, 671891, 839864, 1049830, 1312287, 1640359, 2050449,
  2563061, 3203826, 3902260, 4663553, 5493363, 6397855, 7383752, 8458379, 9629723, 10906488, 12298162, 13815086, 15468534, 17270791, 19235252, 21376515, 23710491, 26254525, 29027522, 32050088,
  35344686, 38935798, 42850109, 47116709, 51767302, 56836449, 62361819, 68384473, 74949165, 82104680, 89904191, 98405658, 107672256, 117772849, 128782495, 140783010, 153863570, 168121381, 183662396,
  200602101, 219066380, 239192444, 261129853, 285041630, 311105466, 339515048, 370481492, 404234916, 441026148, 481128591, 524840254, 572485967, 624419793, 681027665, 742730244, 809986056, 883294891,
  963201521, 1050299747, 1145236814, 1248718217, 1361512946, 1484459201, 1618470619, 1764543065, 1923762030, 2097310703, 2286478756, 2492671933, 2717422497, 2962400612, 3229426756, 3520485254,
];

/** ExpRatio (sur 1024) pour les niveaux 70 à 99 ; 1024 avant. */
const EXP_RATIO_70: number[] = [976, 928, 880, 832, 784, 736, 688, 640, 592, 544, 496, 448, 400, 352, 304, 256, 192, 144, 108, 81, 61, 46, 35, 26, 20, 15, 11, 8, 6, 5];

export function expRatio(clvl: number): number {
  if (clvl < 70) return 1;
  return EXP_RATIO_70[Math.min(EXP_RATIO_70.length - 1, clvl - 70)] / 1024;
}

/** Points de contrôle L-XP (mlvl → xp de base à 100 %) par difficulté */
const LXP: Record<Difficulty, [number, number][]> = {
  0: [
    [1, 30],
    [10, 120],
    [20, 300],
    [30, 659],
    [40, 1297],
    [50, 2317],
    [60, 3357],
    [70, 4397],
    [80, 5437],
    [85, 5957],
    [99, 7413],
  ],
  1: [
    [1, 78],
    [10, 312],
    [20, 779],
    [30, 1709],
    [40, 3365],
    [50, 6618],
    [60, 11964],
    [70, 20540],
    [80, 29600],
    [85, 34130],
    [99, 46814],
  ],
  2: [
    [1, 117],
    [10, 468],
    [20, 1169],
    [30, 2564],
    [40, 5048],
    [50, 9927],
    [60, 17946],
    [70, 30810],
    [80, 44400],
    [85, 51195],
    [87, 53913],
    [89, 56631],
    [90, 57990],
    [99, 70221],
  ],
};

/** L-XP interpolée (géométrique entre points de contrôle) */
export function levelXp(mlvl: number, diff: Difficulty): number {
  const pts = LXP[diff];
  const L = Math.max(1, Math.min(110, mlvl));
  if (L <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [l1, v1] = pts[i];
    const [l0, v0] = pts[i - 1];
    if (L <= l1) {
      const t = (L - l0) / (l1 - l0);
      return v0 * Math.pow(v1 / v0, t);
    }
  }
  const [lz, vz] = pts[pts.length - 1];
  return vz * Math.pow(1.012, L - lz);
}
