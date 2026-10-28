/**
 * Paliers (breakpoints) en images à 25 images/s, repris de Diablo 2 (tables par classe dans
 * data/classes.ts). Une animation d'incantation dure N images selon le pourcentage de FCR.
 */
import { CLASSES, type ClassId } from '../data/classes';
import { animA } from '../data/attack-anim';

/** Foudre et Éclair en chaîne : animation propre de 19 images */
const FCR_LIGHTNING: [number, number][] = [
  [0, 19],
  [7, 18],
  [15, 17],
  [23, 16],
  [35, 15],
  [52, 14],
  [78, 13],
  [117, 12],
  [194, 11],
];

function lookup(table: [number, number][], v: number): number {
  let frames = table[0][1];
  for (const [bp, f] of table) if (v >= bp) frames = f;
  return frames;
}

export function fcrFrames(fcr: number, cls: ClassId = 'sorceress'): number {
  return lookup(CLASSES[cls].fcr, fcr);
}

export function fcrFramesLightning(fcr: number): number {
  return lookup(FCR_LIGHTNING, fcr);
}

/** Contexte d'animation de récupération : forme animale et type d'arme en main (les tables D2 en dépendent) */
export interface RecCtx {
  form?: 'werewolf' | 'werebear' | null;
  /** '1h' : arme à une main qui balance (ou mains nues) ; 'spearstaff' : lance ou bâton ; 'other' : le reste */
  weapon?: '1h' | 'spearstaff' | 'other';
  holyShield?: boolean;
}

/** Tables FHR particulières (Breakpoints PD2) : druide à une main, ours, loup, paladin lance/bâton */
const FHR_DRUID_1H: [number, number][] = [
  [0, 14],
  [3, 13],
  [7, 12],
  [13, 11],
  [19, 10],
  [29, 9],
  [42, 8],
  [63, 7],
  [99, 6],
  [174, 5],
  [456, 4],
];
const FHR_DRUID_OTHER: [number, number][] = [
  [0, 13],
  [5, 12],
  [10, 11],
  [16, 10],
  [26, 9],
  [39, 8],
  [56, 7],
  [86, 6],
  [152, 5],
  [377, 4],
];
const FHR_BEAR: [number, number][] = [
  [0, 13],
  [5, 12],
  [10, 11],
  [16, 10],
  [24, 9],
  [37, 8],
  [54, 7],
  [86, 6],
  [152, 5],
  [360, 4],
];
const FHR_WOLF: [number, number][] = [
  [0, 7],
  [9, 6],
  [20, 5],
  [42, 4],
  [86, 3],
  [280, 2],
];
const FHR_PALADIN_SPEAR: [number, number][] = [
  [0, 13],
  [3, 12],
  [7, 11],
  [13, 10],
  [20, 9],
  [32, 8],
  [48, 7],
  [75, 6],
  [120, 5],
  [280, 4],
];
const FBR_AMAZON_1H: [number, number][] = [
  [0, 17],
  [4, 16],
  [6, 15],
  [11, 14],
  [15, 13],
  [23, 12],
  [29, 11],
  [40, 10],
  [56, 9],
  [80, 8],
  [120, 7],
  [200, 6],
  [480, 5],
];
const FBR_BEAR: [number, number][] = [
  [0, 12],
  [5, 11],
  [10, 10],
  [16, 9],
  [27, 8],
  [40, 7],
  [65, 6],
  [109, 5],
  [223, 4],
];
const FBR_WOLF: [number, number][] = [
  [0, 9],
  [7, 8],
  [15, 7],
  [27, 6],
  [48, 5],
  [86, 4],
  [200, 3],
];
const FBR_HOLY_SHIELD: [number, number][] = [
  [0, 2],
  [86, 1],
];

function fhrTable(cls: ClassId, c?: RecCtx): [number, number][] {
  if (cls === 'druid') {
    if (c?.form === 'werewolf') return FHR_WOLF;
    if (c?.form === 'werebear') return FHR_BEAR;
    return c?.weapon === '1h' ? FHR_DRUID_1H : FHR_DRUID_OTHER;
  }
  if (cls === 'paladin' && c?.weapon === 'spearstaff') return FHR_PALADIN_SPEAR;
  return CLASSES[cls].fhr;
}

export function fhrFrames(fhr: number, cls: ClassId = 'sorceress', c?: RecCtx): number {
  return lookup(fhrTable(cls, c), fhr);
}

/** Palier suivant (pour l'affichage « prochain palier : X % ») */
export function nextFcrBreakpoint(fcr: number, cls: ClassId = 'sorceress'): number | null {
  for (const [bp] of CLASSES[cls].fcr) if (bp > fcr) return bp;
  return null;
}

export function nextFhrBreakpoint(fhr: number, cls: ClassId = 'sorceress'): number | null {
  for (const [bp] of CLASSES[cls].fhr) if (bp > fhr) return bp;
  return null;
}

/** IAS effectif d'objet après rendement décroissant (D2 : 120*IAS/(120+IAS)) */
export function effectiveIas(ias: number): number {
  return Math.floor((120 * Math.max(0, ias)) / (120 + Math.max(0, ias)));
}

/** Images d'une animation de A images de base pour une vitesse totale TAS (IAS effectif + IAS de compétence - WSM) */
export function framesForSpeed(A: number, tas: number): number {
  const t = Math.max(-60, Math.min(tas, 400));
  return Math.max(4, Math.ceil((256 * A) / Math.floor((256 * (100 + t)) / 100)) - 1);
}

/** Jeu d'animation d'une arme : images de base (A) et vitesse d'arme (WSM) */
export interface AtkSet {
  A: number;
  wsm: number;
}

/**
 * Attaque : formule D2 (WSM de l'arme, rendement décroissant sur l'IAS d'objet, IAS de compétence ajouté tel quel).
 * Double maniement : on garde l'arme la plus rapide. Sans jeu fourni : animation « 1 main » de la classe, WSM 0.
 */
export function attackFrames(ias: number, cls: ClassId = 'sorceress', sets?: AtkSet[], iasSkill = 0): number {
  const list = sets && sets.length ? sets : [{ A: animA(cls, 'swing1'), wsm: 0 }];
  const eff = effectiveIas(ias);
  let best = Infinity;
  for (const s of list) best = Math.min(best, framesForSpeed(s.A, eff + iasSkill - s.wsm));
  return best;
}

/** Blocage : images de récupération par classe et table FBR (D2 : bouclier, ~ images à 0 % FBR) */
export function fbrFrames(fbr: number, cls: ClassId = 'sorceress', c?: RecCtx): number {
  if (cls === 'druid' && c?.form === 'werewolf') return lookup(FBR_WOLF, fbr);
  if (cls === 'druid' && c?.form === 'werebear') return lookup(FBR_BEAR, fbr);
  if (cls === 'amazon' && c?.weapon === '1h') return lookup(FBR_AMAZON_1H, fbr);
  if (cls === 'paladin' && c?.holyShield) return lookup(FBR_HOLY_SHIELD, fbr);
  return lookup(CLASSES[cls].fbr, fbr);
}
