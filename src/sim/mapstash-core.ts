/**
 * Coffre de cartes : onglet du coffre où les cartes (objets `item.map`) ramassées vont d'office, sans prendre de place.
 * Liste libre (`CharacterState.mapStash`), plafonnée ; absente des anciennes sauvegardes = vide.
 */
import type { CharacterState } from './character-state';
import type { Item, Quality } from './item';

export const MAP_STASH_MAX = 400;

/** Seuil de ramassage automatique des cartes (absent = aucune) */
export type AutoPickupMaps = 'none' | 'all' | 'rare' | 'magic';

const QUALITY_RANK: Record<string, number> = { normal: 0, magic: 1, rare: 2, unique: 3 };
const MIN_RANK: Record<AutoPickupMaps, number> = { none: 99, all: 0, magic: 1, rare: 2 };

/** La carte atteint-elle le seuil choisi ? */
export function mapMeetsPickup(item: Item, mode: AutoPickupMaps | undefined): boolean {
  if (!item.map) return false;
  return (QUALITY_RANK[item.quality as Quality] ?? 0) >= MIN_RANK[mode ?? 'none'];
}

export function mapStashFull(c: CharacterState): boolean {
  return (c.mapStash?.length ?? 0) >= MAP_STASH_MAX;
}

/** Range une carte dans le coffre de cartes ; faux si ce n'est pas une carte ou s'il est plein */
export function addMapToStash(c: CharacterState, item: Item): boolean {
  if (!item.map || mapStashFull(c)) return false;
  (c.mapStash ??= []).push(item);
  return true;
}

/** Tri : palier décroissant, puis qualité décroissante */
export function sortMapStash(c: CharacterState): void {
  c.mapStash?.sort((a, b) => b.map!.tier - a.map!.tier || (QUALITY_RANK[b.quality] ?? 0) - (QUALITY_RANK[a.quality] ?? 0));
}
