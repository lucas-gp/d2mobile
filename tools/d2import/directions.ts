/**
 * Ordre des directions. L'ordre interne des DCC n'est pas séquentiel : la table ci-dessous donne, pour chaque
 * position de l'ordre logique (sens horaire à l'écran, position 0 = face au joueur, vers le bas de l'écran),
 * l'indice interne correspondant. Vérifié visuellement sur le Paladin (rotation continue, dos en position 8/16).
 */
const D16 = [4, 8, 0, 9, 5, 10, 1, 11, 6, 12, 2, 13, 7, 14, 3, 15];
const D8 = [4, 0, 5, 1, 6, 2, 7, 3];

const NAMES8 = ['down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right'];
const NAMES16 = [
  'down',
  'down-down-left',
  'down-left',
  'down-left-left',
  'left',
  'up-left-left',
  'up-left',
  'up-up-left',
  'up',
  'up-up-right',
  'up-right',
  'up-right-right',
  'right',
  'down-right-right',
  'down-right',
  'down-down-right',
];

export interface DirInfo {
  row: number;
  label: string;
  /** angle horaire à l'écran depuis « bas » (0°) */
  angle: number;
  /** indice interne dans le DCC */
  source: number;
}

export interface DirectionOrder {
  convention: string;
  /** false : correspondance déduite par symétrie mais non contrôlée visuellement (4 directions) */
  verified: boolean;
  rows: DirInfo[];
}

export function directionOrder(n: number): DirectionOrder {
  const convention = 'lignes en sens horaire à l’écran ; ligne 0 = personnage face au joueur (bas de l’écran) ; angle = degrés horaires depuis le bas';
  if (n === 16 || n === 8) {
    const src = n === 16 ? D16 : D8;
    const names = n === 16 ? NAMES16 : NAMES8;
    return { convention, verified: true, rows: src.map((s, i) => ({ row: i, label: names[i], angle: (360 * i) / n, source: s })) };
  }
  if (n === 32) {
    // 32 directions : même construction récursive que 8 et 16 (les positions paires reprennent l'ordre à 16, les impaires les indices 16-31) ;
    // déduit par régularité, à vérifier sur la direction des flèches
    const src = Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? D16[i / 2] : 16 + (i - 1) / 2));
    return { convention, verified: false, rows: src.map((s, i) => ({ row: i, label: `dir${i}`, angle: (360 * i) / 32, source: s })) };
  }
  if (n === 4) {
    const names = ['down', 'left', 'up', 'right'];
    return { convention, verified: false, rows: names.map((l, i) => ({ row: i, label: l, angle: i * 90, source: i })) };
  }
  return { convention, verified: false, rows: Array.from({ length: n }, (_, i) => ({ row: i, label: `dir${i}`, angle: (360 * i) / n, source: i })) };
}
