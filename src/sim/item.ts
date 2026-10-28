/** Instance d'objet (sérialisable telle quelle dans la sauvegarde). */

export type Quality = 'low' | 'normal' | 'superior' | 'magic' | 'rare' | 'set' | 'unique' | 'crafted' | 'runeword';

export interface RolledMod {
  stat: string;
  value: number;
  param?: string;
}

export interface Item {
  uid: string;
  base: string;
  quality: Quality;
  ilvl: number;
  /** Affixes magiques/rares : identifiant + valeurs tirées */
  affixes?: { id: string; values: number[] }[];
  /** Unique / set : identifiant + valeurs tirées pour chaque mod */
  uniqueId?: string;
  setId?: string;
  rolls?: number[];
  /** Set : valeurs tirées des bonus de pièce (dans l'ordre de `partial`, mod par mod) */
  setRolls?: number[];
  /** Nom des rares */
  rareName?: string;
  /** Nom complet d'un objet magique importé de Diablo II (préfixe et suffixe d'origine, sans affixe du jeu) */
  importedName?: string;
  /** Bonus de qualité supérieure (défense/dégâts améliorés) */
  superiorPct?: number;
  /** Défense tirée pour les armures */
  defRoll?: number;
  sockets: number;
  socketed: Item[];
  /** Durabilité actuelle (absente : intact) ; voir sim/durability.ts */
  dur?: number;
  runeword?: string;
  ethereal?: boolean;
  /** Corruption PD2 : une seule par objet, état définitif */
  corrupted?: { outcome: string; mods: RolledMod[]; bricked?: boolean; addSockets?: number; desecrated?: boolean; tainted?: boolean };
  /** Quantité (runes, gemmes, orbes empilables) */
  qty?: number;
  /** Map d'endgame */
  map?: { tier: number; zone: string; mods: { id: string; value: number }[]; fortified?: boolean; corruptMod?: { id: string; value: number }; catalyst?: boolean; heroic?: boolean };
  /** Rolls du craft */
  craftMods?: RolledMod[];
  /** Bonus automatique de base (peaux du Druide : +1-3 à une compétence) */
  automod?: RolledMod[];
}

let uidCounter = 0;
/** Identifiant unique déterministe : dérivé d'une graine, sans dépendre de l'horloge. */
export function makeUid(seed: number): string {
  uidCounter = (uidCounter + 1) % 1e9;
  return `${(seed >>> 0).toString(36)}-${uidCounter.toString(36)}`;
}

export function resetUidCounter(v = 0): void {
  uidCounter = v;
}
