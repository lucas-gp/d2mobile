// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Cartes d'endgame : types et registres des zones de carte (`mapZones`) et des affixes de carte (`mapAffixes`), vides dans la base ; le
 * contenu (zones par palier, affixes à trois plages de valeurs et leurs bonus) vient d'un mod (mods/pd2/data/maps.ts). Les effets sont
 * exprimés en modificateurs de monde (mods/pd2/sim/mapmods.ts, règles nommées de src/mods/rules.ts).
 */
import { derivedList } from '../mods/derived';

export type MapLayout = 'field' | 'labyrinth';

export interface MapZoneDef {
  id: string;
  name: string;
  /** 1-3 : paliers ; 4 : donjon */
  tier: 1 | 2 | 3 | 4;
  layout: MapLayout;
  ground: string;
  /** Sol secondaire en taches (champs) ou des salles (labyrinthes) */
  floor: string;
  mood: string;
  ambient: { color: number; level: number };
  /** Décor dispersé (champs) ou des salles (labyrinthes) */
  props: string[];
  /** Bordure (champs) ou murs (labyrinthes : préfixe du décor de mur) */
  border: string[];
  /** Familles de monstres de la zone */
  monsters: string[];
  /** Immunités de la zone (105-120 %) : un élément par entrée */
  immune: ('fire' | 'cold' | 'light' | 'poison' | 'phys')[];
  boss: { monster: string; name: string };
  /** Carte unique PD2 (§6.6) : affixes fixes, aucun monstre immunisé, butin spécial du boss */
  unique?: { mods: { id: string; value: number }[]; reward: UniqueMapReward; text: string };
}

/** Butin spécial du boss d'une carte unique */
export type UniqueMapReward = 'socketedUniques' | 'treasure' | 'jewels' | 'puzzle' | 'etherealUniques' | 'corruptedUniques' | 'skillCharms' | 'highRune';

export const MAP_ZONES: MapZoneDef[] = [];

export const MAP_ZONE_BY_ID: Record<string, MapZoneDef> = Object.fromEntries(MAP_ZONES.map((z) => [z.id, z]));
/** Zones des cartes ordinaires (tirées au hasard) et cartes uniques */
export const MAP_RANDOM_ZONES = derivedList('cartes ordinaires', () => MAP_ZONES.filter((z) => !z.unique));
export const MAP_UNIQUE_ZONES = derivedList('cartes uniques', () => MAP_ZONES.filter((z) => z.unique));
export const MAP_TIER_LEVEL: Record<number, number> = { 1: 87, 2: 88, 3: 89, 4: 90 };

/** Affixe de carte : effet (modificateur de monde) + bonus, trois plages de valeurs */
export interface MapAffixDef {
  id: string;
  name: string;
  kind: 'prefix' | 'suffix';
  /** Modificateur de monde appliqué, valeur X tirée dans la plage du palier */
  mod: string;
  ranges: [[number, number], [number, number], [number, number]];
  text: string;
  xp?: [number, number];
  density?: [number, number];
  mf?: [number, number];
  /** Fréquence relative (½ pour les affixes rares de PD2) */
  freq?: number;
}

export const MAP_AFFIXES: MapAffixDef[] = [];

export const MAP_AFFIX_BY_ID: Record<string, MapAffixDef> = Object.fromEntries(MAP_AFFIXES.map((a) => [a.id, a]));
