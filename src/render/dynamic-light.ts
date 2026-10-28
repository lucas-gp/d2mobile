/**
 * Éclairage dynamique : logique pure (sans Pixi ni DOM) de la couche de lumière.
 *
 * Choix technique : le rendu possède déjà UNE carte de lumière basse résolution (moitié de l'écran, `lightRT` du renderer),
 * remplie par des sprites radiaux additifs sur la teinte d'ambiance puis appliquée en multiplication sur la scène. Aucun
 * nouveau passage plein écran n'est donc ajouté : l'éclairage dynamique se contente d'alimenter cette même carte, avec
 *  - un plafond dur du nombre de lumières (12 en Léger, 24 en Normal), priorité aux plus proches du joueur / centre d'écran ;
 *  - une teinte par élément (feu, froid, foudre, poison, magie) ;
 *  - des lueurs d'alliés (mercenaire, créatures) en Normal ;
 *  - un assombrissement doux des zones lointaines : la teinte d'ambiance est réduite de `edgeDark` et un seul grand sprite
 *    additif centré sur le joueur la restitue à l'intérieur de l'écran ; au-delà, le fond reste à (1 − edgeDark) de son niveau
 *    (Léger 0,85, Normal 0,75 : jamais sous ~70 % de la luminosité sans l'effet).
 * Coût borné : au plus `cap + 3` sprites de 128×128 dans une texture d'environ 450×400. PerfGuard le rétrograde en premier
 * (Normal -> Léger -> Désactivé). Désactivé = chemin d'origine du renderer, aucun pixel changé.
 */
import type { DynamicLight } from '../sim/save';

export interface DynLevel {
  /** Nombre maximal de lumières dynamiques (hors lueur du joueur et décor) */
  cap: number;
  /** Assombrissement des zones lointaines, 0..1 (1 − edgeDark = plancher de luminosité du fond) */
  edgeDark: number;
  /** Lueurs du mercenaire et des créatures */
  allies: boolean;
  /** Vacillement doux de la lueur du joueur (amplitude relative) */
  flicker: number;
  /** Réchauffement de la lueur du joueur (0 = inchangée) */
  warm: number;
}

export const DYN_LEVELS: Record<Exclude<DynamicLight, 'off'>, DynLevel> = {
  light: { cap: 12, edgeDark: 0.15, allies: false, flicker: 0.03, warm: 0.5 },
  normal: { cap: 24, edgeDark: 0.25, allies: true, flicker: 0.05, warm: 1 },
};

/** Plus petit facteur de luminosité du fond autorisé par un niveau (documenté, vérifié par les tests) */
export const DYN_MIN_FACTOR = 0.7;

export function sanitizeDynamicLight(v: unknown): DynamicLight {
  return v === 'light' || v === 'normal' ? v : 'off';
}

/**
 * Niveau effectif : le réglage, rétrogradé de `drop` crans par la garde de performance (Normal -> Léger -> Désactivé).
 * `available` faux (qualité graphique basse : pas de lumières dynamiques) = désactivé.
 */
export function effectiveDynamicLight(setting: unknown, drop = 0, available = true): DynamicLight {
  if (!available) return 'off';
  const order: DynamicLight[] = ['off', 'light', 'normal'];
  const i = order.indexOf(sanitizeDynamicLight(setting));
  return order[Math.max(0, i - Math.max(0, drop))];
}

export function dynLevel(l: DynamicLight): DynLevel | null {
  return l === 'off' ? null : DYN_LEVELS[l];
}

/** Teinte de lumière par élément (feu orangé, froid bleu, foudre blanc-bleu, poison vert, magie violette) */
const ELEM_LIGHT: Record<string, number> = {
  fire: 0xff7a2a,
  cold: 0x7ab8ff,
  light: 0xc8d4ff,
  lightning: 0xc8d4ff,
  poison: 0x6ad04a,
  magic: 0xd08aff,
  phys: 0xffe8d0,
};
export function elemLightColor(elem: string | undefined): number {
  return (elem && ELEM_LIGHT[elem]) || 0xffffff;
}

/** Teinte d'une zone au sol : les murs et sols de feu éclairent, les zones de froid / poison / foudre aussi */
export function areaLightColor(kind: string, elem: string | undefined): number | null {
  if (kind === 'fire_wall' || kind === 'fire_ground') return 0xff7a3a;
  if (elem && elem !== 'phys' && ELEM_LIGHT[elem]) return ELEM_LIGHT[elem];
  return null;
}

export interface LightCandidate {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  kind: 'missile' | 'area' | 'item' | 'flash' | 'ally';
}

/** Ordre de priorité à distance égale : les projectiles et éclairs d'abord, les alliés ensuite */
const KIND_RANK: Record<LightCandidate['kind'], number> = { flash: 0, missile: 1, area: 2, item: 3, ally: 4 };

/**
 * Sélectionne au plus `cap` lumières : celles hors de la portée de l'écran (`reach`, unités de monde) sont retirées,
 * les autres sont triées par distance au centre (le joueur) puis par genre. Ne modifie pas l'entrée.
 */
export function selectLights(cands: readonly LightCandidate[], cx: number, cy: number, reach: number, cap: number): LightCandidate[] {
  if (cap <= 0) return [];
  const keep: { c: LightCandidate; d: number }[] = [];
  for (const c of cands) {
    const d = Math.hypot(c.x - cx, c.y - cy);
    if (d - c.radius > reach) continue;
    keep.push({ c, d });
  }
  keep.sort((a, b) => a.d - b.d || KIND_RANK[a.c.kind] - KIND_RANK[b.c.kind]);
  return keep.slice(0, cap).map((k) => k.c);
}

/** Lueur du joueur réchauffée : mélange la couleur de base vers un ambre doux, `warm` 0..1 */
export function warmPlayerColor(base: number, warm: number): number {
  const t = Math.max(0, Math.min(1, warm)) * 0.35;
  const amber = 0xffc890;
  const ch = (sh: number) => Math.round(((base >> sh) & 255) * (1 - t) + ((amber >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Teinte d'ambiance après assombrissement des bords : `amb` × (1 − edgeDark). Le même terme est rendu par le grand sprite
 * central (`edgeFill`) : au centre, le résultat redevient `amb` ; au bord, il reste réduit.
 */
export function edgeAmbient(amb: number, edgeDark: number): { base: number; fill: number } {
  const k = 1 - Math.max(0, Math.min(1 - DYN_MIN_FACTOR, edgeDark));
  const sc = (c: number, f: number) => {
    const r = Math.round(((c >> 16) & 255) * f);
    const g = Math.round(((c >> 8) & 255) * f);
    const b = Math.round((c & 255) * f);
    return (r << 16) | (g << 8) | b;
  };
  return { base: sc(amb, k), fill: sc(amb, 1 - k) };
}
