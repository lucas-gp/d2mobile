/**
 * Description d'une carte d'endgame et son nom affichable. Module feuille : partagé par
 * maps.ts (génération) et itemstats.ts (noms d'objets) sans cycle d'imports.
 */
import { MAP_ZONE_BY_ID } from '../data/maps';
import type { Item } from './item';

export interface MapInfo {
  tier: number;
  zone: string;
  mods: { id: string; value: number }[];
  fortified?: boolean;
  corruptMod?: { id: string; value: number };
  /** Éclat du Catalyseur : un événement est garanti à l'ouverture */
  catalyst?: boolean;
  /** Étendard des Héros : bonus héroïques (+10 % d'expérience, +20 % de densité, +20 % de MF et d'or) */
  heroic?: boolean;
}

export function mapName(it: Item): string {
  const m = it.map as MapInfo | undefined;
  if (!m) return 'Carte';
  const z = MAP_ZONE_BY_ID[m.zone];
  const tier = m.tier >= 4 ? 'Donjon' : `P${m.tier}`;
  return `${z?.name ?? 'Carte'} (${tier})`;
}
