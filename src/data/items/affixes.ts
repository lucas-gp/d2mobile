// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Préfixes et suffixes magiques. La table tirée est celle de Diablo II LoD 1.13c (affixes-d2.ts, régénérée depuis les MPQ : lot M10a) ;
 * un mod la patche (Project Diablo 2 : ~1 100 lignes d'équipement, de joyaux et de charmes du wiki, mods/pd2/data/items/affixes.patch.ts).
 * Chaque affixe appartient à un groupe d'exclusion : un objet ne peut porter deux affixes du même groupe. `level` = niveau d'affixe minimal
 * (comparé à l'alvl), `maxLevel` = alvl maximal, `types` = types d'objets : codes d'ItemTypes.txt (`d2:armo`, itemtypes-d2.ts), noms de
 * types du wiki PD2 (AFFIX_TYPES) ou types du jeu (anciens affixes).
 * Les 172 affixes d'avant (LEGACY_AFFIXES) ne sont plus tirés : ils restent lisibles pour les objets sauvegardés.
 */
import type { AffixDef, ItemBase, StatRoll } from '../types';
import { TYPE_GROUPS, typeMatches } from '../types';
import { D2_AFFIXES } from './affixes-d2';
import { d2TypeIs } from './itemtypes';

export { d2TypeIs };

const r = (stat: string, min: number, max: number, param?: string): StatRoll => ({ stat, min, max, param });

type A = Omit<AffixDef, 'kind' | 'freq' | 'rare' | 'reqLvl'> & Partial<Pick<AffixDef, 'freq' | 'rare' | 'reqLvl'>>;

const P = (a: A): AffixDef => ({ kind: 'prefix', freq: 10, rare: true, reqLvl: Math.max(1, Math.round(a.level * 0.75)), ...a });
const X = (a: A): AffixDef => ({ kind: 'suffix', freq: 10, rare: true, reqLvl: Math.max(1, Math.round(a.level * 0.75)), ...a });

const ARM = ['armorAny'];
const WEP = ['weapon'];
const ALLEQ = ['equip'];

/** Anciens affixes (avant la table PD2) : jamais tirés, gardés pour les sauvegardes */
export const LEGACY_AFFIXES: AffixDef[] = [
  /* ======================= PRÉFIXES ======================= */
  // Dégâts améliorés (armes)
  P({ id: 'jagged', name: 'Dentelé', group: 'ed', level: 1, maxLevel: 12, types: WEP, mods: [r('edPct', 10, 20)] }),
  P({ id: 'deadly', name: 'Mortel', group: 'ed', level: 6, maxLevel: 20, types: WEP, mods: [r('edPct', 21, 30)] }),
  P({ id: 'vicious', name: 'Vicieux', group: 'ed', level: 12, maxLevel: 30, types: WEP, mods: [r('edPct', 31, 40)] }),
  P({ id: 'brutal', name: 'Brutal', group: 'ed', level: 18, maxLevel: 40, types: WEP, mods: [r('edPct', 41, 50)] }),
  P({ id: 'massive', name: 'Massif', group: 'ed', level: 26, types: WEP, mods: [r('edPct', 51, 65)] }),
  P({ id: 'savage', name: 'Sauvage', group: 'ed', level: 35, types: WEP, mods: [r('edPct', 66, 80)] }),
  P({ id: 'merciless', name: 'Impitoyable', group: 'ed', level: 45, types: WEP, mods: [r('edPct', 81, 100)] }),
  P({ id: 'cruel', name: 'Cruel', group: 'ed', level: 56, types: WEP, mods: [r('edPct', 201, 300)], rare: false, freq: 3 }),
  // Défense améliorée (armures)
  P({ id: 'sturdy', name: 'Robuste', group: 'ed', level: 1, maxLevel: 12, types: ARM, mods: [r('defPct', 10, 20)] }),
  P({ id: 'strong', name: 'Solide', group: 'ed', level: 6, maxLevel: 20, types: ARM, mods: [r('defPct', 21, 30)] }),
  P({ id: 'glorious', name: 'Glorieux', group: 'ed', level: 14, maxLevel: 32, types: ARM, mods: [r('defPct', 31, 40)] }),
  P({ id: 'blessed', name: 'Béni', group: 'ed', level: 20, maxLevel: 45, types: ARM, mods: [r('defPct', 41, 50)] }),
  P({ id: 'saintly', name: 'Saint', group: 'ed', level: 30, types: ARM, mods: [r('defPct', 51, 65)] }),
  P({ id: 'holy', name: 'Sacré', group: 'ed', level: 40, types: ARM, mods: [r('defPct', 66, 80)] }),
  P({ id: 'godly', name: 'Divin', group: 'ed', level: 52, types: ARM, mods: [r('defPct', 81, 100)], rare: false, freq: 4 }),
  // Résistances
  P({ id: 'red', name: 'Rouge', group: 'resFire', level: 1, maxLevel: 14, types: ALLEQ, mods: [r('resFire', 5, 10)] }),
  P({ id: 'crimson', name: 'Cramoisi', group: 'resFire', level: 12, maxLevel: 30, types: ALLEQ, mods: [r('resFire', 11, 20)] }),
  P({ id: 'burgundy', name: 'Bordeaux', group: 'resFire', level: 26, types: ALLEQ, mods: [r('resFire', 21, 30)] }),
  P({ id: 'garnet', name: 'Grenat', group: 'resFire', level: 42, types: ['armorAny', 'jewelry', 'charm'], mods: [r('resFire', 31, 40)] }),
  P({ id: 'blue', name: 'Bleu', group: 'resCold', level: 1, maxLevel: 14, types: ALLEQ, mods: [r('resCold', 5, 10)] }),
  P({ id: 'azure', name: 'Azur', group: 'resCold', level: 12, maxLevel: 30, types: ALLEQ, mods: [r('resCold', 11, 20)] }),
  P({ id: 'lapis', name: 'Lapis', group: 'resCold', level: 26, types: ALLEQ, mods: [r('resCold', 21, 30)] }),
  P({ id: 'sapphire', name: 'Saphir', group: 'resCold', level: 42, types: ['armorAny', 'jewelry', 'charm'], mods: [r('resCold', 31, 40)] }),
  P({ id: 'orange', name: 'Orange', group: 'resLight', level: 1, maxLevel: 14, types: ALLEQ, mods: [r('resLight', 5, 10)] }),
  P({ id: 'coral', name: 'Corail', group: 'resLight', level: 12, maxLevel: 30, types: ALLEQ, mods: [r('resLight', 11, 20)] }),
  P({ id: 'amber', name: 'Ambre', group: 'resLight', level: 26, types: ALLEQ, mods: [r('resLight', 21, 30)] }),
  P({ id: 'topaz', name: 'Topaze', group: 'resLight', level: 42, types: ['armorAny', 'jewelry', 'charm'], mods: [r('resLight', 31, 40)] }),
  P({ id: 'green', name: 'Vert', group: 'resPoison', level: 1, maxLevel: 14, types: ALLEQ, mods: [r('resPoison', 5, 10)] }),
  P({ id: 'jade', name: 'Jade', group: 'resPoison', level: 12, maxLevel: 30, types: ALLEQ, mods: [r('resPoison', 11, 20)] }),
  P({ id: 'emerald', name: 'Émeraude', group: 'resPoison', level: 26, types: ALLEQ, mods: [r('resPoison', 21, 30)] }),
  P({ id: 'beryl', name: 'Béryl', group: 'resAll', level: 18, maxLevel: 40, types: ['armorAny', 'jewelry', 'charm'], mods: [r('resAll', 5, 10)] }),
  P({ id: 'jacinth', name: 'Hyacinthe', group: 'resAll', level: 38, types: ['armorAny', 'jewelry', 'charm'], mods: [r('resAll', 11, 15)] }),
  P({ id: 'chromatic', name: 'Chromatique', group: 'resAll', level: 55, types: ['armorAny', 'jewelry', 'charm'], mods: [r('resAll', 16, 20)], rare: false, freq: 4 }),
  P({ id: 'prismatic', name: 'Prismatique', group: 'resAll', level: 65, types: ['armorAny', 'amulet', 'charm'], mods: [r('resAll', 21, 25)], rare: false, freq: 3 }),
  // préfixe de la recette du Cube « amulette prismatique » (PD2 : +16-20, ilvl 50) : jamais tiré au hasard (fréquence 0)
  P({ id: 'prismatic_cube', name: 'Prismatique', group: 'resAll', level: 50, types: ['amulet'], mods: [r('resAll', 16, 20)], rare: false, freq: 0 }),
  // Mana / vie (préfixes)
  P({ id: 'lizards', name: 'de Lézard', group: 'mana', level: 1, maxLevel: 14, types: ['caster', 'armorAny', 'jewelry', 'charm'], mods: [r('mana', 1, 5)] }),
  P({ id: 'snakes', name: 'de Serpent', group: 'mana', level: 10, maxLevel: 26, types: ['caster', 'armorAny', 'jewelry', 'charm'], mods: [r('mana', 6, 10)] }),
  P({ id: 'serpents', name: 'Serpentin', group: 'mana', level: 20, types: ['caster', 'armorAny', 'jewelry', 'charm'], mods: [r('mana', 11, 30)] }),
  P({ id: 'drakes', name: 'de Drake', group: 'mana', level: 36, types: ['caster', 'armor', 'helmAny', 'jewelry', 'charm'], mods: [r('mana', 31, 60)] }),
  P({ id: 'dragons', name: 'de Dragon', group: 'mana', level: 52, types: ['caster', 'circlet', 'amulet', 'charm'], mods: [r('mana', 61, 90)] }),
  // Compétences de la Sorcière
  P({ id: 'sorc_skills_1', name: "d'Arcaniste", group: 'classSkills', level: 20, types: ['caster', 'circlet', 'amulet'], mods: [r('sorcSkills', 1, 1)], freq: 6 }),
  P({ id: 'sorc_skills_2', name: 'de Magicienne', group: 'classSkills', level: 45, types: ['caster', 'circlet', 'amulet'], mods: [r('sorcSkills', 2, 2)], freq: 4 }),
  P({ id: 'fire_tree_1', name: 'Pyromancien', group: 'treeSkills', level: 12, types: ['caster', 'circlet', 'amulet', 'grandcharm'], mods: [r('fireSkills', 1, 1)], freq: 5 }),
  P({ id: 'fire_tree_2', name: 'Pyromancien suprême', group: 'treeSkills', level: 45, types: ['caster', 'circlet'], mods: [r('fireSkills', 2, 2)], freq: 3, rare: false }),
  P({ id: 'fire_tree_3', name: 'de la Fournaise', group: 'treeSkills', level: 60, types: ['orb', 'staff'], mods: [r('fireSkills', 3, 3)], freq: 2, rare: false }),
  P({ id: 'cold_tree_1', name: 'Cryomancien', group: 'treeSkills', level: 12, types: ['caster', 'circlet', 'amulet', 'grandcharm'], mods: [r('coldSkills', 1, 1)], freq: 5 }),
  P({ id: 'cold_tree_2', name: 'Cryomancien suprême', group: 'treeSkills', level: 45, types: ['caster', 'circlet'], mods: [r('coldSkills', 2, 2)], freq: 3, rare: false }),
  P({ id: 'cold_tree_3', name: "de l'Hiver", group: 'treeSkills', level: 60, types: ['orb', 'staff'], mods: [r('coldSkills', 3, 3)], freq: 2, rare: false }),
  P({ id: 'light_tree_1', name: 'Électromancien', group: 'treeSkills', level: 12, types: ['caster', 'circlet', 'amulet', 'grandcharm'], mods: [r('lightSkills', 1, 1)], freq: 5 }),
  P({ id: 'light_tree_2', name: 'Électromancien suprême', group: 'treeSkills', level: 45, types: ['caster', 'circlet'], mods: [r('lightSkills', 2, 2)], freq: 3, rare: false }),
  P({ id: 'light_tree_3', name: "de l'Orage", group: 'treeSkills', level: 60, types: ['orb', 'staff'], mods: [r('lightSkills', 3, 3)], freq: 2, rare: false }),
  // Compétences du Druide (D2 : les affixes de classe tombent pour toutes les classes)
  P({ id: 'druid_skills_1', name: 'de Chamane', group: 'classSkills', level: 20, types: ['caster', 'circlet', 'amulet'], mods: [r('druidSkills', 1, 1)], freq: 6 }),
  P({ id: 'druid_skills_2', name: 'de Druide', group: 'classSkills', level: 45, types: ['caster', 'circlet', 'amulet'], mods: [r('druidSkills', 2, 2)], freq: 4 }),
  P({ id: 'ele_tree_1', name: 'Tempétueux', group: 'treeSkills', level: 12, types: ['caster', 'circlet', 'amulet', 'grandcharm'], mods: [r('eleSkills', 1, 1)], freq: 5 }),
  P({ id: 'ele_tree_2', name: 'Tempétueux suprême', group: 'treeSkills', level: 45, types: ['caster', 'circlet'], mods: [r('eleSkills', 2, 2)], freq: 3, rare: false }),
  P({ id: 'ele_tree_3', name: 'des Éléments', group: 'treeSkills', level: 60, types: ['staff'], mods: [r('eleSkills', 3, 3)], freq: 2, rare: false }),
  P({ id: 'shape_tree_1', name: 'Bestial', group: 'treeSkills', level: 12, types: ['circlet', 'amulet', 'helm', 'grandcharm'], mods: [r('shapeSkills', 1, 1)], freq: 5 }),
  P({ id: 'shape_tree_2', name: 'Bestial suprême', group: 'treeSkills', level: 45, types: ['circlet', 'helm'], mods: [r('shapeSkills', 2, 2)], freq: 3, rare: false }),
  P({ id: 'shape_tree_3', name: 'de la Bête', group: 'treeSkills', level: 60, types: ['staff', 'mace', 'axe'], mods: [r('shapeSkills', 3, 3)], freq: 2, rare: false }),
  P({ id: 'summon_tree_1', name: 'Sylvestre', group: 'treeSkills', level: 12, types: ['caster', 'circlet', 'amulet', 'grandcharm'], mods: [r('summonSkills', 1, 1)], freq: 5 }),
  P({ id: 'summon_tree_2', name: 'Sylvestre suprême', group: 'treeSkills', level: 45, types: ['caster', 'circlet'], mods: [r('summonSkills', 2, 2)], freq: 3, rare: false }),
  P({ id: 'summon_tree_3', name: 'de la Forêt', group: 'treeSkills', level: 60, types: ['staff'], mods: [r('summonSkills', 3, 3)], freq: 2, rare: false }),
  // FCR (préfixe « Apprenti/Magus » sur les orbes en PD2)
  P({ id: 'apprentice', name: "d'Apprenti", group: 'fcrPrefix', level: 15, types: ['caster', 'circlet'], mods: [r('fcr', 10, 10)], freq: 6 }),
  P({ id: 'magus', name: 'de Mage', group: 'fcrPrefix', level: 37, types: ['caster', 'circlet'], mods: [r('fcr', 20, 20)], freq: 4 }),
  // Magic find (préfixe)
  P({ id: 'felicitous', name: 'Chanceux', group: 'mfPrefix', level: 12, types: ['armorAny', 'jewelry', 'charm'], mods: [r('mf', 5, 10)] }),
  P({ id: 'fortuitous', name: 'Fortuné', group: 'mfPrefix', level: 30, types: ['armorAny', 'jewelry'], mods: [r('mf', 11, 20)] }),
  // Dégâts de sort élémentaires (PD2)
  P({ id: 'searing', name: 'Brûlant', group: 'spellDmg', level: 20, types: ['caster', 'amulet', 'grandcharm'], mods: [r('fireDmgPct', 5, 10)], freq: 5 }),
  P({ id: 'infernal', name: 'Infernal', group: 'spellDmg', level: 45, types: ['caster', 'amulet', 'grandcharm'], mods: [r('fireDmgPct', 11, 20)], freq: 3 }),
  P({ id: 'freezing', name: 'Glacial', group: 'spellDmg', level: 20, types: ['caster', 'amulet', 'grandcharm'], mods: [r('coldDmgPct', 5, 10)], freq: 5 }),
  P({ id: 'arctic', name: 'Arctique', group: 'spellDmg', level: 45, types: ['caster', 'amulet', 'grandcharm'], mods: [r('coldDmgPct', 11, 20)], freq: 3 }),
  P({ id: 'shocking', name: 'Électrisant', group: 'spellDmg', level: 20, types: ['caster', 'amulet', 'grandcharm'], mods: [r('lightDmgPct', 5, 10)], freq: 5 }),
  P({ id: 'thundering', name: 'Tonitruant', group: 'spellDmg', level: 45, types: ['caster', 'amulet', 'grandcharm'], mods: [r('lightDmgPct', 11, 20)], freq: 3 }),
  // Défense brute
  P({ id: 'plated', name: 'Plaqué', group: 'defFlat', level: 5, types: ['charm'], mods: [r('defense', 5, 15)] }),

  /* ======================= SUFFIXES ======================= */
  // Vie
  X({ id: 'of_the_jackal', name: 'du Chacal', group: 'life', level: 1, maxLevel: 14, types: ['armorAny', 'jewelry', 'charm'], mods: [r('life', 1, 5)] }),
  X({ id: 'of_the_fox', name: 'du Renard', group: 'life', level: 8, maxLevel: 24, types: ['armorAny', 'jewelry', 'charm'], mods: [r('life', 6, 10)] }),
  X({ id: 'of_the_wolf', name: 'du Loup', group: 'life', level: 16, maxLevel: 36, types: ['armorAny', 'jewelry', 'charm'], mods: [r('life', 11, 20)] }),
  X({ id: 'of_the_tiger', name: 'du Tigre', group: 'life', level: 26, types: ['armorAny', 'jewelry', 'charm'], mods: [r('life', 21, 30)] }),
  X({ id: 'of_the_mammoth', name: 'du Mammouth', group: 'life', level: 36, types: ['armor', 'shield', 'belt', 'grandcharm'], mods: [r('life', 31, 40)] }),
  X({ id: 'of_the_colossus', name: 'du Colosse', group: 'life', level: 52, types: ['armor', 'shield', 'belt', 'grandcharm'], mods: [r('life', 41, 60)] }),
  // Caractéristiques
  X({ id: 'of_strength', name: 'de Force', group: 'str', level: 1, maxLevel: 20, types: ALLEQ, mods: [r('str', 1, 5)] }),
  X({ id: 'of_might', name: 'de Puissance', group: 'str', level: 16, types: ALLEQ, mods: [r('str', 6, 10)] }),
  X({ id: 'of_the_ox', name: 'du Bœuf', group: 'str', level: 30, types: ALLEQ, mods: [r('str', 11, 15)] }),
  X({ id: 'of_dexterity', name: 'de Dextérité', group: 'dex', level: 1, maxLevel: 20, types: ALLEQ, mods: [r('dex', 1, 5)] }),
  X({ id: 'of_skill', name: 'de Dextérité accrue', group: 'dex', level: 16, types: ALLEQ, mods: [r('dex', 6, 10)] }),
  X({ id: 'of_accuracy', name: 'de Précision', group: 'dex', level: 30, types: ALLEQ, mods: [r('dex', 11, 15)] }),
  X({ id: 'of_energy', name: "d'Énergie", group: 'ene', level: 1, maxLevel: 20, types: ['caster', 'armorAny', 'jewelry'], mods: [r('ene', 1, 5)] }),
  X({ id: 'of_the_mind', name: "de l'Esprit", group: 'ene', level: 16, types: ['caster', 'armorAny', 'jewelry'], mods: [r('ene', 6, 10)] }),
  X({ id: 'of_brilliance', name: 'de Brillance', group: 'ene', level: 30, types: ['caster', 'armorAny', 'jewelry'], mods: [r('ene', 11, 15)] }),
  X({ id: 'of_vitality', name: 'de Vitalité', group: 'vit', level: 5, maxLevel: 24, types: ['armorAny', 'jewelry'], mods: [r('vit', 1, 5)] }),
  X({ id: 'of_life_v', name: 'de Vie', group: 'vit', level: 20, types: ['armorAny', 'jewelry'], mods: [r('vit', 6, 10)] }),
  // Vitesses
  X({ id: 'of_the_apprentice', name: "d'Apprenti", group: 'fcr', level: 12, types: ['caster', 'amulet', 'ring', 'circlet'], mods: [r('fcr', 10, 10)] }),
  X({ id: 'of_the_magus', name: 'du Mage', group: 'fcr', level: 29, types: ['caster', 'amulet', 'circlet'], mods: [r('fcr', 20, 20)] }),
  X({ id: 'of_balance', name: "d'Équilibre", group: 'fhr', level: 9, maxLevel: 30, types: ['armorAny', 'jewelry', 'charm'], mods: [r('fhr', 10, 10)] }),
  X({ id: 'of_stability', name: 'de Stabilité', group: 'fhr', level: 25, types: ['armorAny', 'amulet'], mods: [r('fhr', 17, 17)] }),
  X({ id: 'of_haste', name: 'de Hâte', group: 'frw', level: 11, types: ['boots'], mods: [r('frw', 10, 10)] }),
  X({ id: 'of_speed', name: 'de Vitesse', group: 'frw', level: 25, types: ['boots'], mods: [r('frw', 20, 20)] }),
  X({ id: 'of_alacrity', name: "d'Alacrité", group: 'frw', level: 45, types: ['boots'], mods: [r('frw', 30, 30)] }),
  X({ id: 'of_readiness', name: 'de Promptitude', group: 'ias', level: 5, types: ['weapon', 'gloves'], mods: [r('ias', 10, 10)] }),
  X({ id: 'of_quickness', name: 'de Célérité', group: 'ias', level: 20, types: ['weapon', 'gloves'], mods: [r('ias', 20, 20)] }),
  // Régénération de mana, vol
  X({ id: 'of_the_sorcerer', name: 'du Sorcier', group: 'manaRegen', level: 10, types: ['caster', 'ring', 'amulet', 'circlet'], mods: [r('manaRegenPct', 10, 20)] }),
  X({ id: 'of_the_wizard', name: "de l'Enchanteur", group: 'manaRegen', level: 30, types: ['caster', 'ring', 'amulet', 'circlet'], mods: [r('manaRegenPct', 21, 40)] }),
  X({ id: 'of_the_leech', name: 'de la Sangsue', group: 'lifeLeech', level: 6, types: ['weapon', 'gloves', 'ring', 'amulet'], mods: [r('lifeLeech', 3, 5)] }),
  X({ id: 'of_the_bat', name: 'de la Chauve-souris', group: 'manaLeech', level: 6, types: ['weapon', 'gloves', 'ring', 'amulet'], mods: [r('manaLeech', 3, 5)] }),
  X({ id: 'of_regen', name: 'de Régénération', group: 'lifeRegen', level: 4, types: ['armorAny', 'jewelry'], mods: [r('lifeRegen', 2, 5)] }),
  // Magic find / or
  X({ id: 'of_luck', name: 'de Chance', group: 'mf', level: 12, types: ['armorAny', 'jewelry', 'charm'], mods: [r('mf', 5, 15)] }),
  X({ id: 'of_fortune', name: 'de Fortune', group: 'mf', level: 32, types: ['armorAny', 'jewelry', 'charm'], mods: [r('mf', 16, 25)] }),
  X({ id: 'of_greed', name: 'de Cupidité', group: 'gf', level: 1, types: ['armorAny', 'jewelry', 'charm'], mods: [r('gf', 20, 40)] }),
  X({ id: 'of_wealth', name: 'de Richesse', group: 'gf', level: 20, types: ['armorAny', 'jewelry', 'charm'], mods: [r('gf', 41, 80)] }),
  // Réduction de dégâts
  X({ id: 'of_protection', name: 'de Protection', group: 'drFlat', level: 5, types: ['armorAny'], mods: [r('drFlat', 1, 4)] }),
  X({ id: 'of_absorption', name: "d'Absorption", group: 'drFlat', level: 24, types: ['armorAny'], mods: [r('drFlat', 5, 10)] }),
  X({ id: 'of_warding', name: 'de Protection magique', group: 'mdr', level: 5, types: ['armorAny', 'jewelry'], mods: [r('mdr', 1, 5)] }),
  // Rayon de lumière
  X({ id: 'of_light', name: 'de Lumière', group: 'lightRadius', level: 1, types: ['armorAny', 'jewelry'], mods: [r('lightRadius', 1, 2)] }),
  X({ id: 'of_the_sun', name: 'du Soleil', group: 'lightRadius', level: 20, types: ['armorAny', 'jewelry'], mods: [r('lightRadius', 3, 5)] }),
  // Dégâts élémentaires ajoutés (armes)
  X({ id: 'of_flame', name: 'de Flamme', group: 'addFire', level: 4, types: ['weapon', 'jewelry'], mods: [r('addFireMin', 1, 3), r('addFireMax', 4, 8)] }),
  X({ id: 'of_frost', name: 'de Givre', group: 'addCold', level: 4, types: ['weapon', 'jewelry'], mods: [r('addColdMin', 1, 3), r('addColdMax', 4, 6)] }),
  X({ id: 'of_shock', name: "d'Électrochoc", group: 'addLight', level: 4, types: ['weapon', 'jewelry'], mods: [r('addLightMin', 1, 1), r('addLightMax', 8, 14)] }),
  // Frappe écrasante / mortelle
  X({ id: 'of_crushing', name: 'Écrasant', group: 'cb', level: 20, types: ['melee', 'gloves'], mods: [r('crushingBlow', 5, 10)] }),
  // Résistance maximale (rare, haut niveau)
  X({ id: 'of_the_fortress', name: 'de la Forteresse', group: 'maxRes', level: 60, types: ['shield', 'armor'], mods: [r('maxResAll', 1, 3)], rare: false, freq: 2 }),
];

/**
 * Compétences des cinq autres classes D2 : +1/+2 aux compétences de la classe (amulettes, diadèmes),
 * puis +1/+2/+3 à un arbre (D2 : le +3 tombe sur les objets propres à la classe).
 */
interface ClassAffix {
  cls: string;
  stat: string;
  names: [string, string];
  /** [id, stat, nom +1, nom +2, nom +3, objets du +3] par arbre */
  trees: [string, string, string, string, string, string[]][];
}
const CLASS_AFFIXES: ClassAffix[] = [
  {
    cls: 'barbarian',
    stat: 'barSkills',
    names: ['de Guerrier', 'de Barbare'],
    trees: [
      ['bar_combat', 'barCombatSkills', 'Combattant', 'Combattant suprême', 'du Massacre', ['primal']],
      ['bar_mastery', 'barMasterySkills', "Maître d'armes", "Maître d'armes suprême", 'de la Maîtrise', ['primal']],
      ['bar_warcry', 'barWarcrySkills', 'Hurleur', 'Hurleur suprême', 'du Cri de guerre', ['primal']],
    ],
  },
  {
    cls: 'paladin',
    stat: 'palSkills',
    names: ['de Chevalier', 'de Paladin'],
    trees: [
      ['pal_combat', 'palCombatSkills', 'Zélé', 'Zélé suprême', 'du Jugement', ['shield']],
      ['pal_defense', 'palDefenseSkills', 'Gardien', 'Gardien suprême', 'de la Salvation', ['shield']],
      ['pal_offense', 'palOffenseSkills', 'Crusader', 'Crusader suprême', 'de la Conviction', ['shield']],
    ],
  },
  {
    cls: 'amazon',
    stat: 'amzSkills',
    names: ["d'Éclaireuse", "d'Amazone"],
    trees: [
      ['amz_bow', 'amzBowSkills', "d'Archer", "d'Archer suprême", "de l'Arc", ['bow', 'crossbow']],
      ['amz_passive', 'amzPassiveSkills', "d'Acrobate", "d'Acrobate suprême", "de l'Agilité", ['javelin', 'spear']],
      ['amz_javelin', 'amzJavelinSkills', 'de Lancier', 'de Lancier suprême', 'du Javelot', ['javelin', 'spear']],
    ],
  },
  {
    cls: 'assassin',
    stat: 'asnSkills',
    names: ['de Voleur', "d'Assassin"],
    trees: [
      ['asn_martial', 'asnMartialSkills', 'Combattant martial', 'Combattant martial suprême', 'du Dragon', ['claw']],
      ['asn_shadow', 'asnShadowSkills', "de l'Ombre", "de l'Ombre suprême", 'des Ténèbres', ['claw']],
      ['asn_traps', 'asnTrapSkills', 'Poseur de pièges', 'Poseur de pièges suprême', 'des Pièges', ['claw']],
    ],
  },
  {
    cls: 'necromancer',
    stat: 'necSkills',
    names: ['de Fossoyeur', 'de Nécromancien'],
    trees: [
      ['nec_summon', 'necSummonSkills', "d'Invocateur", "d'Invocateur suprême", "de l'Armée des morts", ['head']],
      ['nec_poison', 'necPoisonSkills', 'Empoisonneur', 'Empoisonneur suprême', 'de la Peste', ['head', 'wand']],
      ['nec_curse', 'necCurseSkills', 'Maudit', 'Maudit suprême', 'de la Malédiction', ['head', 'wand']],
    ],
  },
];
for (const c of CLASS_AFFIXES) {
  LEGACY_AFFIXES.push(
    P({ id: `${c.cls}_skills_1`, name: c.names[0], group: 'classSkills', level: 20, types: ['caster', 'circlet', 'amulet'], mods: [r(c.stat, 1, 1)], freq: 6 }),
    P({ id: `${c.cls}_skills_2`, name: c.names[1], group: 'classSkills', level: 45, types: ['caster', 'circlet', 'amulet'], mods: [r(c.stat, 2, 2)], freq: 4 }),
  );
  for (const [id, stat, n1, n2, n3, items] of c.trees) {
    LEGACY_AFFIXES.push(
      P({ id: `${id}_1`, name: n1, group: 'treeSkills', level: 12, types: ['circlet', 'amulet', 'helm', 'grandcharm'], mods: [r(stat, 1, 1)], freq: 5 }),
      P({ id: `${id}_2`, name: n2, group: 'treeSkills', level: 45, types: ['circlet', 'helm'], mods: [r(stat, 2, 2)], freq: 3, rare: false }),
      P({ id: `${id}_3`, name: n3, group: 'treeSkills', level: 60, types: items, mods: [r(stat, 3, 3)], freq: 2, rare: false }),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Types d'objets des affixes PD2 (noms du wiki, page Item_Affixes)     */
/* (lus par le patch du mod pd2 et par les noms des rares)              */
/* ------------------------------------------------------------------ */

/** Sous-types D2 d'armes (colonne `type` de weapons.txt) : nos bases ne les distinguent pas */
const SUBTYPES: Record<string, string[]> = {
  club: ['club', 'spiked_club', 'cudgel', 'barbed_club', 'truncheon', 'tyrant_club'],
  hammer: ['war_hammer', 'maul', 'great_maul', 'battle_hammer', 'war_club', 'martel_de_fer', 'legendary_mallet', 'ogre_maul', 'thunder_maul'],
  tippedMace: ['mace', 'morning_star', 'flail', 'flanged_mace', 'jagged_star', 'knout', 'reinforced_mace', 'devil_star', 'scourge'],
  throwingKnife: ['throwing_knife', 'balanced_knife', 'battle_dart', 'war_dart', 'flying_knife', 'winged_knife'],
  throwingAxe: ['throwing_axe', 'balanced_axe', 'francisca', 'hurlbat', 'flying_axe', 'winged_axe'],
  crystalSword: ['crystal_sword', 'dimensional_blade', 'phase_blade'],
  scythe: ['scythe', 'war_scythe', 'battle_scythe', 'grim_scythe', 'thresher', 'giant_thresher'],
};
export const AFFIX_SUBTYPES: Readonly<Record<string, readonly string[]>> = SUBTYPES;
const sub =
  (k: string) =>
  (b: ItemBase): boolean =>
    SUBTYPES[k].includes(b.id);
const is =
  (...t: string[]) =>
  (b: ItemBase): boolean =>
    typeMatches(b.type, t);
const not =
  (f: (b: ItemBase) => boolean, g: (b: ItemBase) => boolean) =>
  (b: ItemBase): boolean =>
    f(b) && !g(b);
const onlyClass = (b: ItemBase, c: string): boolean => b.classOnly === c || (Array.isArray(b.classOnly) && b.classOnly.length === 1 && b.classOnly[0] === c);
const throwing = (b: ItemBase): boolean => b.type === 'thrown' || b.type === 'javelin';
const weapon = is('weapon');
/** Arme de mêlée D2 : toutes sauf arcs, arbalètes et orbes */
const melee = not(weapon, is('bow', 'crossbow', 'orb'));
/** « P » : sans les armes de lanceur de sorts (orbe, baguette, bâton) ; « PS » : bâtons admis */
const weaponP = not(weapon, is('orb', 'wand', 'staff'));
const blunt = is('mace', 'scepter', 'staff', 'wand');
const helm = is('helm', 'circlet', 'pelt', 'primal');
const shield = is('shield', 'head');
const paladinShield = (b: ItemBase): boolean => b.type === 'shield' && onlyClass(b, 'paladin');

/** Prédicat de chaque type d'objet cité par la table d'affixes PD2 (« NC » : sans les objets de classe) */
export const AFFIX_TYPES: Record<string, (b: ItemBase) => boolean> = {
  Armor: is('armorAny'),
  Chest: is('armor'),
  Helm: helm,
  HelmNC: is('helm', 'circlet'),
  Circlet: is('circlet'),
  'Druid Helm': is('pelt'),
  'Barbarian Helm': is('primal'),
  'Non-Druid Helm': is('helm', 'circlet', 'primal'),
  'Non-Barbarian Helm': is('helm', 'circlet', 'pelt'),
  Shield: shield,
  ShieldNC: not(is('shield'), paladinShield),
  'Necromancer Shield': is('head'),
  'Paladin Shield': paladinShield,
  'Non-Necromancer Shield': is('shield'),
  'Non-Paladin Shield': not(shield, paladinShield),
  Gloves: is('gloves'),
  Boots: is('boots'),
  Belt: is('belt'),
  'Non-Gloves Armor': not(is('armorAny'), is('gloves')),
  Amulet: is('amulet'),
  Ring: is('ring'),
  Jewel: is('jewel'),
  'Small Charm': is('smallcharm'),
  'Large Charm': is('largecharm'),
  'Grand Charm': is('grandcharm'),
  Weapon: weapon,
  WeaponP: weaponP,
  WeaponPS: not(weapon, is('orb', 'wand')),
  'Melee Weapon': melee,
  'Melee WeaponP': not(melee, is('wand', 'staff')),
  'Non-Throwing Melee WeaponPS': not(not(melee, is('wand')), throwing),
  'Non-Scepter Melee WeaponP': not(melee, is('wand', 'staff', 'scepter')),
  'Missile Weapon': is('bow', 'crossbow'),
  'Non-Orb Weapon': not(weapon, is('orb')),
  'Non-Scepter WeaponP': not(weaponP, is('scepter')),
  'Non-Scepter Weapon': not(weapon, is('scepter')),
  'Non-Rod Weapon': not(weapon, is('staff', 'wand', 'scepter')),
  'Non-Throwing Weapon': not(weapon, throwing),
  'Non-Blunt Melee Weapon': not(melee, blunt),
  Orb: is('orb'),
  Staff: is('staff'),
  Wand: is('wand'),
  Scepter: is('scepter'),
  Rod: is('staff', 'wand', 'scepter'),
  'Non-Staff Rod': is('wand', 'scepter'),
  Club: sub('club'),
  Hammer: sub('hammer'),
  'Tipped Mace': sub('tippedMace'),
  Claw: is('claw'),
  Sword: is('sword'),
  'Crystal Sword': sub('crystalSword'),
  Dagger: is('dagger'),
  Knife: (b) => b.type === 'dagger' || SUBTYPES.throwingKnife.includes(b.id),
  'Throwing Knife': sub('throwingKnife'),
  'Throwing Axe': sub('throwingAxe'),
  Axe: (b) => b.type === 'axe' || SUBTYPES.throwingAxe.includes(b.id),
  Polearm: is('polearm'),
  Scythe: sub('scythe'),
  Spear: is('spear', 'javelin'),
  SpearNC: (b) => (b.type === 'spear' || b.type === 'javelin') && !onlyClass(b, 'amazon'),
  'Amazon Spear': (b) => b.type === 'spear' && onlyClass(b, 'amazon'),
  Javelin: is('javelin'),
  JavelinNC: (b) => b.type === 'javelin' && !onlyClass(b, 'amazon'),
  Quiver: is('quiver'),
  'Amazon Weapon': (b) => TYPE_GROUPS.weapon.includes(b.type) && onlyClass(b, 'amazon'),
};

/** Une base accepte-t-elle l'un de ces types ? (codes `d2:` d'ItemTypes.txt, noms du wiki, sinon types / groupes du jeu pour les anciens affixes) */
export function affixTypeMatches(b: ItemBase, refs: readonly string[]): boolean {
  for (const ref of refs) {
    if (ref.startsWith('d2:')) {
      if (d2TypeIs(b, ref.slice(3))) return true;
      continue;
    }
    const f = AFFIX_TYPES[ref];
    if (f ? f(b) : typeMatches(b.type, [ref])) return true;
  }
  return false;
}

/** Affixe autorisé sur cette base (types acceptés, exclusions ; sur un rare : affixe et type admis aux rares) */
export function affixAllowed(a: AffixDef, b: ItemBase, rare: boolean): boolean {
  if (!affixTypeMatches(b, a.types)) return false;
  if (a.excludeTypes && affixTypeMatches(b, a.excludeTypes)) return false;
  if (rare && (!a.rare || (a.rareTypes && !affixTypeMatches(b, a.rareTypes)))) return false;
  return true;
}

/** Table tirée : affixes de D2 (patchés par un mod) */
export const AFFIXES: AffixDef[] = D2_AFFIXES;

export const AFFIX_BY_ID: Record<string, AffixDef> = Object.fromEntries([...LEGACY_AFFIXES, ...AFFIXES].map((a) => [a.id, a]));
