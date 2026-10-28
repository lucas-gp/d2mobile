// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de Diablo II (hors licence MIT) : voir LICENSE-DATA.md et docs/DERIVED-DATA.md.
/**
 * Objets divers : clé, Tome de portail (recette des Vaches), Pandémonium de Diablo II 1.11 (clés, organes), essences et jeton d'absolution
 * (1.13 : réinitialisation). Les objets propres à Project Diablo 2 (éclat de Pierre-Monde, énigme de Larzuk, Talisman du Pandémonium, accès
 * aux ubers, cartes et orbes) sont dans le mod (mods/pd2/data/items/misc.ts).
 */
import type { ItemBase } from '../types';

const misc = (id: string, name: string, icon: string, price: number, extra: Partial<ItemBase> = {}): ItemBase => ({
  id,
  name,
  type: 'currency',
  tier: 0,
  qlvl: 1,
  reqLvl: 1,
  reqStr: 0,
  reqDex: 0,
  maxSockets: 0,
  icon,
  rarity: 1,
  stack: 99,
  price,
  noRandomDrop: true,
  ...extra,
});

export const MISC_BASES: ItemBase[] = [
  misc('key', 'Clé', 'key', 50),
  // D2 : Tome de portail (vendu par Akara et Deckard Cain), ingrédient de la recette des Vaches
  misc('tome_portal', 'Tome de portail', 'token', 450),
  // Pandémonium (D2 1.11 : clés de la Comtesse, de l'Invocateur et de Nihlathak en Enfer, organes des trois mini-ubers) ; essences (1.13 : boss d'acte)
  misc('key_terror', 'Clé de la terreur', 'key', 20000, { stack: 9 }),
  misc('key_hate', 'Clé de la haine', 'key', 20000, { stack: 9 }),
  misc('key_destruction', 'Clé de la destruction', 'key', 20000, { stack: 9 }),
  misc('essence_twisted', 'Essence tordue de souffrance', 'shard', 30000, { stack: 9 }),
  misc('essence_charged', 'Essence chargée de haine', 'shard', 30000, { stack: 9 }),
  misc('essence_burning', 'Essence ardente de terreur', 'shard', 30000, { stack: 9 }),
  misc('essence_festering', 'Essence purulente de destruction', 'shard', 30000, { stack: 9 }),
  misc('organ_horn', 'Corne de Diablo', 'scarab', 50000, { stack: 9 }),
  misc('organ_eye', 'Œil de Baal', 'scarab', 50000, { stack: 9 }),
  misc('organ_brain', 'Cervelle de Méphisto', 'scarab', 50000, { stack: 9 }),
  misc('token_absolution', "Jeton d'absolution", 'token', 50000),
];
