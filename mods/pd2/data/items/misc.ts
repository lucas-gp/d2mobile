// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Objets divers propres à Project Diablo 2 : éclat de Pierre-Monde (corruption), boîte et pièce d'énigme de Larzuk (châsses), accès aux
 * ubers (sceaux, reliques, pierres), objets de carte, orbes de cartes et cartes. Deux groupes, enregistrés à leur place d'origine parmi les
 * objets divers de la base (src/data/items/misc.ts) : après le Tome de portail, puis après le Jeton d'absolution (Talisman du Pandémonium,
 * autrefois dans la base, et accès aux ubers ; lot M10e).
 */
import type { ItemBase } from '../../../../src/mods/api';

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

/** Après `tome_portal` */
export const PD2_MISC_AFTER_TOME: ItemBase[] = [
  misc('worldstone_shard', 'Éclat de Pierre-Monde', 'shard', 3000),
  misc('puzzlepiece', "Pièce d'énigme de Larzuk", 'puzzlepiece', 5000),
  misc('puzzlebox', 'Boîte à énigme de Larzuk', 'puzzlebox', 20000),
];

/** Après `token_absolution` : le Talisman du Pandémonium (PD2 : les trois organes le forment, il ouvre Tristram pandémoniaque) */
export const PD2_MISC_TALISMAN: ItemBase[] = [misc('pandemonium_talisman', 'Talisman du Pandémonium', 'scarab', 150000, { stack: 9 })];

/** Après `pandemonium_talisman` */
export const PD2_MISC_AFTER_TALISMAN: ItemBase[] = [
  // PD2 « Uber Access » : sceaux des Anciens, Vision de la terreur, Pierre du Vide, Ombre de la haine (recettes du Cube)
  misc('sigil_madawc', 'Sceau de Madawc', 'scarab', 40000, { stack: 9 }),
  misc('sigil_talic', 'Sceau de Talic', 'scarab', 40000, { stack: 9 }),
  misc('sigil_korlic', 'Sceau de Korlic', 'scarab', 40000, { stack: 9 }),
  misc('relic_ancients', 'Relique des Anciens', 'scarab', 150000, { stack: 9 }),
  misc('prime_evil_soul', 'Âme du Mal primordial', 'shard', 30000, { stack: 9 }),
  misc('black_soulstone', "Pierre d'âme noire", 'shard', 60000, { stack: 9 }),
  misc('pure_essence', 'Essence démoniaque pure', 'shard', 30000, { stack: 9 }),
  misc('vision_terror', 'Vision de la terreur', 'scarab', 150000, { stack: 9 }),
  misc('jawbone_trang', 'Mâchoire de Trang-Oul', 'scarab', 40000, { stack: 9 }),
  misc('splinter_void', 'Éclat du Vide', 'shard', 40000, { stack: 9 }),
  misc('hellfire_ashes', "Cendres du feu de l'enfer", 'shard', 60000, { stack: 9 }),
  misc('voidstone', 'Pierre du Vide', 'scarab', 150000, { stack: 9 }),
  misc('demonic_insignia', 'Insigne démoniaque', 'scarab', 40000, { stack: 9 }),
  misc('talisman_transgression', 'Talisman de la Transgression', 'scarab', 40000, { stack: 9 }),
  misc('flesh_malic', 'Chair de Malic', 'shard', 40000, { stack: 9 }),
  misc('shadow_hatred', 'Ombre de la haine', 'scarab', 150000, { stack: 9 }),
  misc('tainted_shard', 'Éclat souillé de Pierre-Monde', 'shard', 80000, { stack: 9 }),
  misc('desecration_token', 'Jeton de profanation', 'token', 80000, { stack: 9 }),
  // objets de carte : Éclat du Catalyseur (événement) et Étendard des Héros (Anciens ultimes)
  misc('catalyst_shard', 'Éclat du Catalyseur', 'shard', 20000),
  misc('standard_heroes', 'Étendard des Héros', 'scarab', 40000),
  // orbes de maps (PD2)
  misc('orb_arcane', 'Orbe arcanique', 'orb_blue', 2000),
  misc('orb_angelic', 'Orbe angélique', 'orb_gold', 5000),
  misc('orb_zakarum', 'Orbe de Zakarum', 'orb_white', 5000),
  misc('orb_horadrim', 'Orbe horadrique', 'orb_brown', 6000),
  misc('orb_destruction', 'Orbe de destruction', 'orb_red', 3000),
  misc('orb_cartographer', 'Orbe du cartographe', 'orb_green', 12000),
  misc('orb_fortification', 'Orbe de fortification', 'orb_purple', 15000),
  misc('horadrim_scarab', 'Scarabée horadrique', 'scarab', 30000),
  // maps : une base par palier (T1 à T3, donjon)
  { id: 'map_t1', name: 'Carte de palier 1', type: 'map', tier: 0, qlvl: 80, reqLvl: 75, reqStr: 0, reqDex: 0, maxSockets: 0, icon: 'map', rarity: 1, price: 1000, noRandomDrop: true },
  { id: 'map_t2', name: 'Carte de palier 2', type: 'map', tier: 1, qlvl: 83, reqLvl: 75, reqStr: 0, reqDex: 0, maxSockets: 0, icon: 'map', rarity: 1, price: 2000, noRandomDrop: true },
  { id: 'map_t3', name: 'Carte de palier 3', type: 'map', tier: 1, qlvl: 86, reqLvl: 75, reqStr: 0, reqDex: 0, maxSockets: 0, icon: 'map', rarity: 1, price: 4000, noRandomDrop: true },
  { id: 'map_t4', name: 'Donjon', type: 'map', tier: 2, qlvl: 89, reqLvl: 75, reqStr: 0, reqDex: 0, maxSockets: 0, icon: 'map_dungeon', rarity: 1, price: 8000, noRandomDrop: true },
];
