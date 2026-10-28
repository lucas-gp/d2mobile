// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Classes jouables : caractéristiques de départ et progression D2 (vie, mana par niveau et par
 * point), arbres de compétences, statistique d'objet « +X aux compétences de la classe »,
 * paliers d'incantation et de récupération après coup (images à 25 images/s, tables D2).
 * Caractéristiques (départ, vie, mana, gains par niveau et par point, endurance) : CharStats.txt de
 * Diablo II LoD 1.13c, écrites à leur place par tools/vanilla/gen.ts (`npm run vanilla -- classes`) ;
 * valeurs Project Diablo 2 : patch du mod (registre `classes`, mods/pd2/data/classes.patch.ts).
 */
import type { ClassOnly, ItemBase, SkillTree } from './types';

export type ClassId = 'sorceress' | 'druid' | 'barbarian' | 'paladin' | 'amazon' | 'assassin' | 'necromancer';

export interface ClassDef {
  id: ClassId;
  name: string;
  /** Caractéristiques de départ D2 */
  base: { str: number; dex: number; vit: number; ene: number };
  life: number;
  mana: number;
  lifePerLevel: number;
  lifePerVit: number;
  manaPerLevel: number;
  manaPerEne: number;
  /**
   * Endurance (donnée seulement : la course et l'endurance ne sont pas simulées dans ce jeu) :
   * valeur au niveau 1 (CharStats ; PD2 : avec son bonus de départ, patch du mod), gain par niveau et
   * par point de vitalité, vitesse d'épuisement en course (RunDrain, 1/256 par image)
   */
  stamina: number;
  staminaPerLevel: number;
  staminaPerVit: number;
  runDrain: number;
  trees: [SkillTree, SkillTree, SkillTree];
  /** Statistique d'objet « +X aux compétences de <classe> » */
  classStat: string;
  /** Planche de sprites du personnage (forme humaine) */
  sprite: string;
  startSkill: string;
  /** Arbre ouvert par défaut dans le panneau de compétences */
  defaultTree: SkillTree;
  /** Paliers FCR et FHR [seuil %, images] */
  fcr: [number, number][];
  fhr: [number, number][];
  /** Images de récupération après blocage selon la vitesse de blocage (FBR) */
  fbr: [number, number][];
  /** Images de l'attaque de base à mains nues (0 % de vitesse d'attaque) ; les armes utilisent data/attack-anim.ts */
  attackFrames: number;
  /** Présentation (écran de choix du personnage) */
  desc: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  sorceress: {
    id: 'sorceress',
    name: 'Sorcière',
    base: { str: 10, dex: 25, vit: 10, ene: 35 },
    life: 40,
    mana: 35,
    lifePerLevel: 1,
    lifePerVit: 2,
    manaPerLevel: 2,
    manaPerEne: 2,
    stamina: 74,
    staminaPerLevel: 1,
    staminaPerVit: 1,
    runDrain: 20,
    trees: ['fire', 'cold', 'light'],
    classStat: 'sorcSkills',
    sprite: 'sorceress',
    startSkill: 'fire_bolt',
    defaultTree: 'cold',
    fcr: [
      [0, 13],
      [9, 12],
      [20, 11],
      [37, 10],
      [63, 9],
      [105, 8],
      [200, 7],
    ],
    fhr: [
      [0, 15],
      [5, 14],
      [9, 13],
      [14, 12],
      [20, 11],
      [30, 10],
      [42, 9],
      [60, 8],
      [86, 7],
      [142, 6],
      [280, 5],
    ],
    fbr: [
      [0, 9],
      [7, 8],
      [15, 7],
      [27, 6],
      [48, 5],
      [86, 4],
      [200, 3],
    ],
    attackFrames: 16,
    desc: "Magicienne des éléments : feu, froid et foudre, téléportation et bouclier d'énergie.",
  },
  druid: {
    id: 'druid',
    name: 'Druide',
    base: { str: 15, dex: 20, vit: 25, ene: 20 },
    life: 55,
    mana: 20,
    lifePerLevel: 1.5,
    lifePerVit: 2,
    manaPerLevel: 2,
    manaPerEne: 2,
    stamina: 84,
    staminaPerLevel: 1,
    staminaPerVit: 1,
    runDrain: 20,
    trees: ['elemental', 'shape', 'summon'],
    classStat: 'druidSkills',
    sprite: 'druid',
    startSkill: 'firestorm',
    defaultTree: 'elemental',
    fcr: [
      [0, 18],
      [4, 17],
      [10, 16],
      [19, 15],
      [30, 14],
      [46, 13],
      [68, 12],
      [99, 11],
      [163, 10],
    ],
    fhr: [
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
    ],
    fbr: [
      [0, 11],
      [6, 10],
      [13, 9],
      [20, 8],
      [32, 7],
      [52, 6],
      [86, 5],
      [174, 4],
      [600, 3],
    ],
    attackFrames: 16,
    desc: 'Gardien de la nature : tempêtes et volcans, loup-garou et ours-garou, loups, corbeaux et esprits.',
  },
  barbarian: {
    id: 'barbarian',
    name: 'Barbare',
    base: { str: 30, dex: 20, vit: 25, ene: 10 },
    life: 55,
    mana: 10,
    lifePerLevel: 2,
    lifePerVit: 4,
    manaPerLevel: 1,
    manaPerEne: 1,
    stamina: 92,
    staminaPerLevel: 1,
    staminaPerVit: 1,
    runDrain: 20,
    trees: ['bar_combat', 'bar_mastery', 'bar_warcry'],
    classStat: 'barSkills',
    sprite: 'barbarian',
    startSkill: 'bash',
    defaultTree: 'bar_combat',
    fcr: [
      [0, 13],
      [9, 12],
      [20, 11],
      [37, 10],
      [63, 9],
      [105, 8],
      [200, 7],
    ],
    fhr: [
      [0, 9],
      [7, 8],
      [15, 7],
      [27, 6],
      [48, 5],
      [86, 4],
      [200, 3],
    ],
    fbr: [
      [0, 7],
      [9, 6],
      [20, 5],
      [42, 4],
      [86, 3],
      [280, 2],
    ],
    attackFrames: 16,
    desc: 'Guerrier des montagnes : maîtrise de toutes les armes, tourbillon et frénésie, cris de guerre.',
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    base: { str: 25, dex: 20, vit: 25, ene: 15 },
    life: 55,
    mana: 15,
    lifePerLevel: 2,
    lifePerVit: 3,
    manaPerLevel: 1.5,
    manaPerEne: 1.5,
    stamina: 89,
    staminaPerLevel: 1,
    staminaPerVit: 1,
    runDrain: 20,
    trees: ['pal_combat', 'pal_defense', 'pal_offense'],
    classStat: 'palSkills',
    sprite: 'paladin',
    startSkill: 'sacrifice',
    defaultTree: 'pal_combat',
    fcr: [
      [0, 15],
      [9, 14],
      [18, 13],
      [30, 12],
      [48, 11],
      [75, 10],
      [125, 9],
    ],
    fhr: [
      [0, 9],
      [7, 8],
      [15, 7],
      [27, 6],
      [48, 5],
      [86, 4],
      [200, 3],
    ],
    fbr: [
      [0, 5],
      [13, 4],
      [32, 3],
      [86, 2],
      [600, 1],
    ],
    attackFrames: 15,
    desc: 'Chevalier de la Lumière : bouclier, auras protectrices et offensives, marteaux bénis.',
  },
  amazon: {
    id: 'amazon',
    name: 'Amazone',
    base: { str: 20, dex: 25, vit: 20, ene: 15 },
    life: 50,
    mana: 15,
    lifePerLevel: 2,
    lifePerVit: 3,
    manaPerLevel: 1.5,
    manaPerEne: 1.5,
    stamina: 84,
    staminaPerLevel: 1,
    staminaPerVit: 1,
    runDrain: 20,
    trees: ['amz_bow', 'amz_passive', 'amz_javelin'],
    classStat: 'amzSkills',
    sprite: 'amazon',
    startSkill: 'magic_arrow',
    defaultTree: 'amz_bow',
    fcr: [
      [0, 19],
      [7, 18],
      [14, 17],
      [22, 16],
      [32, 15],
      [48, 14],
      [68, 13],
      [99, 12],
      [152, 11],
    ],
    fhr: [
      [0, 11],
      [6, 10],
      [13, 9],
      [20, 8],
      [32, 7],
      [52, 6],
      [86, 5],
      [174, 4],
      [600, 3],
    ],
    fbr: [
      [0, 5],
      [13, 4],
      [32, 3],
      [86, 2],
      [600, 1],
    ],
    attackFrames: 15,
    desc: 'Chasseresse : arcs et javelots, flèches élémentaires, esquive, Valkyrie.',
  },
  assassin: {
    id: 'assassin',
    name: 'Assassin',
    base: { str: 20, dex: 20, vit: 20, ene: 25 },
    life: 50,
    mana: 25,
    lifePerLevel: 2,
    lifePerVit: 3,
    manaPerLevel: 1.5,
    manaPerEne: 1.75,
    stamina: 95,
    staminaPerLevel: 1.25,
    staminaPerVit: 1.25,
    runDrain: 15,
    trees: ['asn_martial', 'asn_shadow', 'asn_traps'],
    classStat: 'asnSkills',
    sprite: 'assassin',
    startSkill: 'tiger_strike',
    defaultTree: 'asn_martial',
    fcr: [
      [0, 15],
      [8, 14],
      [16, 13],
      [27, 12],
      [42, 11],
      [65, 10],
      [102, 9],
      [174, 8],
    ],
    fhr: [
      [0, 9],
      [7, 8],
      [15, 7],
      [27, 6],
      [48, 5],
      [86, 4],
      [200, 3],
    ],
    fbr: [
      [0, 5],
      [13, 4],
      [32, 3],
      [86, 2],
      [600, 1],
    ],
    attackFrames: 14,
    desc: "Tueuse du Vizjerei : griffes et arts martiaux à charges, pièges, disciplines de l'ombre.",
  },
  necromancer: {
    id: 'necromancer',
    name: 'Nécromancien',
    base: { str: 15, dex: 25, vit: 15, ene: 25 },
    life: 45,
    mana: 25,
    lifePerLevel: 1.5,
    lifePerVit: 2,
    manaPerLevel: 2,
    manaPerEne: 2,
    stamina: 79,
    staminaPerLevel: 1,
    staminaPerVit: 1,
    runDrain: 20,
    trees: ['nec_summon', 'nec_poison', 'nec_curse'],
    classStat: 'necSkills',
    sprite: 'necromancer',
    startSkill: 'teeth',
    defaultTree: 'nec_summon',
    fcr: [
      [0, 15],
      [9, 14],
      [18, 13],
      [30, 12],
      [48, 11],
      [75, 10],
      [125, 9],
    ],
    fhr: [
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
    ],
    fbr: [
      [0, 11],
      [6, 10],
      [13, 9],
      [20, 8],
      [32, 7],
      [52, 6],
      [86, 5],
      [174, 4],
      [600, 3],
    ],
    attackFrames: 16,
    desc: 'Maître des morts : squelettes, golems, os et poison, malédictions.',
  },
};

export const CLASS_IDS: ClassId[] = ['sorceress', 'druid', 'barbarian', 'paladin', 'amazon', 'assassin', 'necromancer'];

/** Arbres de compétences : classe, statistique d'objet « +X à l'arbre », nom affiché */
export const TREES: Record<SkillTree, { cls: ClassId; stat: string; name: string }> = {
  fire: { cls: 'sorceress', stat: 'fireSkills', name: 'Feu' },
  cold: { cls: 'sorceress', stat: 'coldSkills', name: 'Froid' },
  light: { cls: 'sorceress', stat: 'lightSkills', name: 'Foudre' },
  elemental: { cls: 'druid', stat: 'eleSkills', name: 'Élémentaire' },
  shape: { cls: 'druid', stat: 'shapeSkills', name: 'Métamorphose' },
  summon: { cls: 'druid', stat: 'summonSkills', name: 'Invocation' },
  bar_combat: { cls: 'barbarian', stat: 'barCombatSkills', name: 'Combat' },
  bar_mastery: { cls: 'barbarian', stat: 'barMasterySkills', name: 'Maîtrises' },
  bar_warcry: { cls: 'barbarian', stat: 'barWarcrySkills', name: 'Cris de guerre' },
  pal_combat: { cls: 'paladin', stat: 'palCombatSkills', name: 'Combat' },
  pal_defense: { cls: 'paladin', stat: 'palDefenseSkills', name: 'Auras défensives' },
  pal_offense: { cls: 'paladin', stat: 'palOffenseSkills', name: 'Auras offensives' },
  amz_bow: { cls: 'amazon', stat: 'amzBowSkills', name: 'Arc et arbalète' },
  amz_passive: { cls: 'amazon', stat: 'amzPassiveSkills', name: 'Passifs et magie' },
  amz_javelin: { cls: 'amazon', stat: 'amzJavelinSkills', name: 'Javelot et lance' },
  asn_martial: { cls: 'assassin', stat: 'asnMartialSkills', name: 'Arts martiaux' },
  asn_shadow: { cls: 'assassin', stat: 'asnShadowSkills', name: "Disciplines de l'ombre" },
  asn_traps: { cls: 'assassin', stat: 'asnTrapSkills', name: 'Pièges' },
  nec_summon: { cls: 'necromancer', stat: 'necSummonSkills', name: 'Invocation' },
  nec_poison: { cls: 'necromancer', stat: 'necPoisonSkills', name: 'Poison et os' },
  nec_curse: { cls: 'necromancer', stat: 'necCurseSkills', name: 'Malédictions' },
};

export const TREE_CLASS = Object.fromEntries(Object.entries(TREES).map(([k, v]) => [k, v.cls])) as Record<SkillTree, ClassId>;

/** Statistique d'objet « +X aux compétences de l'arbre » */
export const TREE_STAT = Object.fromEntries(Object.entries(TREES).map(([k, v]) => [k, v.stat])) as Record<SkillTree, string>;

export const TREE_NAMES = Object.fromEntries(Object.entries(TREES).map(([k, v]) => [k, v.name])) as Record<SkillTree, string>;

/** Statistiques d'objet propres à une classe (+compétences de classe et d'arbre) */
export const STAT_CLASS: Record<string, ClassId> = Object.fromEntries([...Object.values(CLASSES).map((c) => [c.classStat, c.id]), ...Object.values(TREES).map((t) => [t.stat, t.cls])]);

export function classOf(id: string | undefined): ClassDef {
  return CLASSES[(id as ClassId) ?? 'sorceress'] ?? CLASSES.sorceress;
}

/** Restrictions de classe d'une base d'objet (liste vide : tout le monde) */
export function classOnlyList(b: Pick<ItemBase, 'classOnly'>): ClassOnly[] {
  return b.classOnly === undefined ? [] : Array.isArray(b.classOnly) ? b.classOnly : [b.classOnly];
}

/** La classe jouable peut-elle porter cet objet ? */
export function classCanUse(b: Pick<ItemBase, 'classOnly'>, cls: ClassId): boolean {
  const l = classOnlyList(b);
  return l.length === 0 || l.includes(cls);
}

/** Objet exclusivement destiné aux mercenaires (arcs, armes d'hast de mercenaire) */
export function isMercOnly(b: Pick<ItemBase, 'classOnly'>): boolean {
  const l = classOnlyList(b);
  return l.length === 1 && l[0] === 'merc';
}

/** Un mercenaire peut porter les objets libres et ceux dont la liste contient « merc » */
export function mercCanUse(b: Pick<ItemBase, 'classOnly'>): boolean {
  const l = classOnlyList(b);
  return l.length === 0 || l.includes('merc');
}
