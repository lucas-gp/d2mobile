// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Lot 321: Diablo II's town NPCs who trade, each with his own stall (audit of the Campaign 3.3, 3.5, 3.13).
 *
 * What each one sells is read from the vendor columns of Diablo II LoD 1.13c's item tables (Weapons.txt, Armor.txt, Misc.txt:
 * `CharsiMin`, `GheedMagicMin`…, a type sold when one of its bases has a count for that NPC), gathered by this game's base types:
 * - weapons and armour: the types of the bases the NPC stocks (club, mace and hammer are this game's `mace`; throwing knives and axes
 *   `thrown`; Assassin's katars `claw`);
 * - potions of healing and mana: the best tier his stall holds in Normal (Misc.txt hp1-hp5), Nightmare's and Hell's upgrades
 *   (`NightmareUpgrade`, `HellUpgrade`: Greater, then Super) for every NPC who sells them;
 * - keys, the Tome of Town Portal;
 * - gambling (Gheed, Elzix, Alkor, Jamella, Anya) and repair (the smiths: Charsi, Fara, Hratli, Halbu, Larzuk).
 *
 * Simplifications (not in the tables): the class items of the expansion (orbs, heads, pelts, Barbarian helms, claws) are put with the
 * casters' (orbs, heads) and the smiths' (pelts, helms, claws) wares, the hero's class only; the throwing potions, absent from the
 * vendor columns, are sold by the alchemists (Lysander, Alkor) and Malah; stamina, antidote and thawing potions, and the scrolls, are not
 * in this game. Atma, Greiz, Kashya, Qual-Kehk and the others who do not trade in Diablo II have no stall.
 */
export interface VendorDef {
  /** Displayed name */
  name: string;
  /** Act of his town (1-5) */
  act: 1 | 2 | 3 | 4 | 5;
  /** Base types of this game the stall holds (weapons and armour) */
  types: readonly string[];
  /** Class items of the hero's class put on the stall: a caster's (orbs, heads) or a smith's (pelts, Barbarian helms, claws) */
  classItems?: 'caster' | 'melee';
  /** Best tier (0 Minor … 4 Super) of the healing and mana potions sold in Normal; none: no potion */
  potionTier?: 0 | 1 | 2 | 3;
  /** Sells keys */
  keys?: boolean;
  /** Sells the Tome of Town Portal (the Cow Level's recipe) */
  tome?: boolean;
  /** Sells the throwing potions */
  throwPotions?: boolean;
  /** Gambles */
  gamble?: boolean;
  /** Repairs (and recharges) the equipment */
  repair?: boolean;
}

const SMITH = ['axe', 'sword', 'dagger', 'thrown', 'javelin', 'spear', 'polearm', 'bow', 'claw', 'helm', 'armor', 'shield', 'gloves', 'boots', 'belt'] as const;

export const VENDORS: Record<string, VendorDef> = {
  // Act I
  akara: { name: 'Akara', act: 1, types: ['wand', 'scepter', 'staff'], classItems: 'caster', potionTier: 0, keys: true, tome: true },
  charsi: { name: 'Charsi', act: 1, types: SMITH, classItems: 'melee', repair: true },
  gheed: {
    name: 'Gheed',
    act: 1,
    types: ['axe', 'mace', 'sword', 'dagger', 'thrown', 'javelin', 'spear', 'polearm', 'bow', 'claw', 'gloves', 'boots', 'belt'],
    keys: true,
    gamble: true,
  },
  // Act II
  fara: {
    name: 'Fara',
    act: 2,
    types: ['axe', 'mace', 'sword', 'dagger', 'thrown', 'javelin', 'spear', 'bow', 'crossbow', 'claw', 'helm', 'armor', 'shield', 'gloves', 'boots', 'belt'],
    classItems: 'melee',
    repair: true,
  },
  drognan: { name: 'Drognan', act: 2, types: ['wand', 'scepter', 'staff', 'helm', 'shield'], classItems: 'caster', potionTier: 1, tome: true },
  lysander: { name: 'Lysander', act: 2, types: [], potionTier: 1, keys: true, throwPotions: true },
  elzix: {
    name: 'Elzix',
    act: 2,
    types: ['axe', 'mace', 'sword', 'dagger', 'thrown', 'javelin', 'spear', 'polearm', 'bow', 'crossbow', 'claw', 'helm', 'armor', 'shield', 'gloves', 'boots', 'belt'],
    gamble: true,
  },
  // Act III
  ormus: { name: 'Ormus', act: 3, types: ['wand', 'scepter', 'staff'], classItems: 'caster', potionTier: 2, tome: true },
  alkor: { name: 'Alkor', act: 3, types: [], throwPotions: true, gamble: true },
  hratli: {
    name: 'Hratli',
    act: 3,
    types: ['axe', 'mace', 'sword', 'dagger', 'polearm', 'claw', 'helm', 'armor', 'shield'],
    classItems: 'melee',
    keys: true,
    repair: true,
  },
  asheara: {
    name: 'Asheara',
    act: 3,
    types: ['sword', 'dagger', 'thrown', 'javelin', 'spear', 'polearm', 'bow', 'crossbow', 'claw', 'helm', 'armor', 'shield', 'gloves', 'boots', 'belt'],
  },
  // Act IV
  jamella: {
    name: 'Jamella',
    act: 4,
    types: ['wand', 'scepter', 'sword', 'dagger', 'javelin', 'staff', 'bow', 'crossbow', 'claw', 'armor', 'shield', 'gloves', 'boots', 'belt'],
    classItems: 'caster',
    potionTier: 3,
    keys: true,
    tome: true,
    gamble: true,
  },
  halbu: { name: 'Halbu', act: 4, types: [...SMITH.filter((t) => t !== 'bow')], classItems: 'melee', repair: true },
  // Act V
  malah: {
    name: 'Malah',
    act: 5,
    types: ['wand', 'scepter', 'sword', 'dagger', 'thrown', 'javelin', 'staff'],
    classItems: 'caster',
    potionTier: 3,
    keys: true,
    tome: true,
    throwPotions: true,
  },
  larzuk: {
    name: 'Larzuk',
    act: 5,
    types: ['axe', 'mace', 'sword', 'spear', 'polearm', 'bow', 'crossbow', 'claw', 'helm', 'armor', 'shield', 'gloves', 'boots', 'belt'],
    classItems: 'melee',
    repair: true,
  },
  anya: { name: 'Anya', act: 5, types: [], gamble: true },
};

/** Class item types by the vendors' kind (filtered by the hero's class when the stall is rolled) */
export const VENDOR_CLASS_TYPES: Record<'caster' | 'melee', readonly string[]> = { caster: ['orb', 'head'], melee: ['pelt', 'primal', 'claw'] };

/** Diablo II's healing and mana potion prices by tier (Misc.txt `cost`, hp1-hp5 and mp1-mp5) */
export const POTION_PRICES: Record<'hp_potion' | 'mp_potion', readonly number[]> = { hp_potion: [30, 75, 125, 250, 500], mp_potion: [60, 150, 300, 500, 1000] };

/** The tier of the potions an NPC sells at a difficulty (Nightmare: Greater, Hell: Super, Misc.txt's upgrades), null if he sells none */
export function vendorPotionTier(def: VendorDef | undefined, difficulty: number): number | null {
  if (def?.potionTier === undefined) return null;
  return difficulty >= 2 ? 4 : difficulty === 1 ? Math.max(3, def.potionTier) : def.potionTier;
}
