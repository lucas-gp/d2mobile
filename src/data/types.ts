/** Schémas des fichiers de données (contenu du jeu). */
import type { Element } from './stats';

/** Classe jouable ou « merc » (mercenaires) */
export type ClassOnly = 'sorceress' | 'druid' | 'barbarian' | 'paladin' | 'amazon' | 'assassin' | 'necromancer' | 'merc';

export type Difficulty = 0 | 1 | 2;
export const DIFF_NAMES = ['Normal', 'Cauchemar', 'Enfer'] as const;

/* ------------------------------------------------------------------ */
/* Objets                                                              */
/* ------------------------------------------------------------------ */

export type Slot = 'head' | 'body' | 'mainhand' | 'offhand' | 'gloves' | 'boots' | 'belt' | 'amulet' | 'ring1' | 'ring2';
export const SLOTS: Slot[] = ['head', 'amulet', 'mainhand', 'body', 'offhand', 'ring1', 'gloves', 'belt', 'ring2', 'boots'];

export type ItemType =
  | 'pelt'
  | 'primal'
  | 'head'
  | 'staff'
  | 'orb'
  | 'wand'
  | 'sword'
  | 'dagger'
  | 'mace'
  | 'axe'
  | 'bow'
  | 'polearm'
  | 'spear'
  | 'javelin'
  | 'claw'
  | 'scepter'
  | 'crossbow'
  | 'quiver'
  | 'thrown'
  | 'circlet'
  | 'helm'
  | 'armor'
  | 'shield'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring'
  | 'smallcharm'
  | 'largecharm'
  | 'grandcharm'
  | 'jewel'
  | 'rune'
  | 'gem'
  | 'potion'
  | 'tpot'
  | 'map'
  | 'currency'
  | 'key';

/** Groupes de types, utilisés par les affixes, runewords et recettes. */
export const TYPE_GROUPS: Record<string, ItemType[]> = {
  weapon: ['staff', 'orb', 'wand', 'sword', 'dagger', 'mace', 'axe', 'bow', 'polearm', 'spear', 'javelin', 'claw', 'scepter', 'crossbow', 'thrown'],
  melee: ['sword', 'dagger', 'mace', 'axe', 'polearm', 'spear', 'claw', 'scepter'],
  caster: ['staff', 'orb', 'wand'],
  helmAny: ['circlet', 'helm', 'pelt', 'primal'],
  /** Boucliers et têtes réduites du Nécromancien (main gauche) */
  shield: ['shield', 'head'],
  /** Les peaux du Druide sont des casques (affixes, mots runiques, Cube) */
  helm: ['helm', 'pelt', 'primal'],
  armorAny: ['armor', 'helm', 'circlet', 'pelt', 'primal', 'shield', 'head', 'gloves', 'boots', 'belt'],
  jewelry: ['amulet', 'ring'],
  charm: ['smallcharm', 'largecharm', 'grandcharm'],
  equip: [
    'quiver',
    'staff',
    'orb',
    'wand',
    'sword',
    'dagger',
    'mace',
    'axe',
    'bow',
    'polearm',
    'spear',
    'javelin',
    'claw',
    'scepter',
    'crossbow',
    'thrown',
    'circlet',
    'helm',
    'pelt',
    'primal',
    'armor',
    'shield',
    'head',
    'gloves',
    'boots',
    'belt',
    'amulet',
    'ring',
  ],
};

export function typeMatches(t: ItemType, refs: readonly string[]): boolean {
  for (const r of refs) {
    if (r === t) return true;
    const g = TYPE_GROUPS[r];
    if (g && g.includes(t)) return true;
  }
  return false;
}

export interface StatRoll {
  stat: string;
  min: number;
  max: number;
  /** Paramètre (ex. identifiant de compétence pour `oskill`) */
  param?: string;
}

export interface ItemBase {
  id: string;
  name: string;
  type: ItemType;
  /** 0 normal, 1 exceptionnel, 2 élite */
  tier: 0 | 1 | 2;
  qlvl: number;
  reqLvl: number;
  reqStr: number;
  reqDex: number;
  dmg?: [number, number];
  /** Dégâts lancés (javelots, couteaux et haches de jet) quand ils diffèrent des dégâts de mêlée */
  missileDmg?: [number, number];
  twoHanded?: boolean;
  defense?: [number, number];
  block?: number;
  maxSockets: number;
  /** Châsses maximales PD2 selon l'ilvl (1-25, 26-40, 41+), quand elles varient ; sinon maxSockets partout */
  socketTiers?: [number, number, number];
  /** Stats implicites (ex. orbes : +mana) */
  implicit?: StatRoll[];
  /** Icône d'interface */
  icon: string;
  /** Poids relatif de drop dans son groupe */
  rarity: number;
  stack?: number;
  /** Valeur marchande de base (or) */
  price: number;
  /** Ne tombe pas au hasard (runes, gemmes, maps ont leurs propres classes) */
  noRandomDrop?: boolean;
  /** Emplacement(s) d'équipement */
  slot?: Slot | 'ring';
  /** Généré d'après les tables D2 (sans unique ni set dédié pour l'instant : hors compensation de couverture) */
  generated?: boolean;
  /** Réservé à une ou plusieurs classes (orbes : Sorcière ; peaux : Druide ; arcs : Amazone et mercenaires…) */
  classOnly?: ClassOnly | ClassOnly[];
}

export interface AffixDef {
  id: string;
  name: string;
  kind: 'prefix' | 'suffix';
  group: string;
  /** Niveau d'affixe (alvl minimal) */
  level: number;
  maxLevel?: number;
  reqLvl: number;
  freq: number;
  types: string[];
  excludeTypes?: string[];
  mods: StatRoll[];
  /** Autorisé sur les rares (sinon magique seulement) */
  rare: boolean;
  /** Sur un rare, seulement sur ces types (PD2 : un même affixe peut être « magique seulement » sur certains types) */
  rareTypes?: string[];
}

export interface UniqueDef {
  id: string;
  name: string;
  base: string;
  lvl: number;
  reqLvl: number;
  rarity: number;
  mods: StatRoll[];
  /** Jamais tiré au hasard : source dédiée (charmes de brisure : boss de cartes) */
  noRandomDrop?: boolean;
}

export interface SetItemDef {
  id: string;
  name: string;
  set: string;
  base: string;
  lvl: number;
  reqLvl: number;
  rarity: number;
  mods: StatRoll[];
  /** Bonus partiels portés par l'objet selon le nombre de pièces (2, 3…) */
  partial?: SetPartial[];
}

/** Bonus d'une pièce de set : actif quand `count` pièces du set sont portées (et, si `with`, que ces pièces précises en font partie) */
interface SetPartial {
  count: number;
  with?: string[];
  mods: StatRoll[];
}

export interface SetDef {
  id: string;
  name: string;
  items: string[];
  bonuses: { count: number; mods: StatRoll[] }[];
}

export interface RuneDef {
  id: string;
  name: string;
  /** Rang 1 (El) à 33 (Zod) */
  rank: number;
  reqLvl: number;
  /** Niveau de la rune (Misc.txt) quand il diffère du niveau requis (Hel : 33, aucun niveau requis) */
  qlvl?: number;
  weapon: StatRoll[];
  armor: StatRoll[];
  shield: StatRoll[];
}

export interface GemDef {
  id: string;
  name: string;
  kind: string;
  grade: number; // 0 ébréchée .. 4 parfaite
  weapon: StatRoll[];
  armor: StatRoll[];
  shield: StatRoll[];
}

export interface RunewordDef {
  id: string;
  name: string;
  runes: string[];
  /** Types du jeu, ou codes `d2:<code>` d'ItemTypes.txt (mots runiques de D2) */
  types: string[];
  reqLvl: number;
  mods: StatRoll[];
  /** Source PD2 si la version diffère de LoD */
  note?: string;
  /** Sous-types PD2 (marteaux, gourdins, épées à deux mains, boucliers de Paladin…) : bases autorisées pour un type */
  only?: Partial<Record<ItemType, string[]>>;
  /** Types exclus (D2 : etype1-3 de Runes.txt, codes `d2:` d'ItemTypes.txt) */
  excludeTypes?: string[];
}

/* ------------------------------------------------------------------ */
/* Monstres                                                            */
/* ------------------------------------------------------------------ */

type MonsterAi = 'melee' | 'ranged' | 'caster' | 'swarm' | 'charger' | 'boss';
export type MonsterRank = 'normal' | 'champion' | 'unique' | 'minion' | 'boss';

export interface MonsterAttack {
  /** curse : malédiction lancée sur le joueur (`curse`) ; heal : soigne les alliés proches (Soin zakarum, Vortex de soin) */
  kind: 'melee' | 'missile' | 'nova' | 'charge' | 'summon' | 'breath' | 'curse' | 'heal' | 'cast';
  range: number;
  /** Temps d'animation (ticks à 25 Hz) */
  frames: number;
  /** Trame d'application du coup */
  hitFrame: number;
  element: Element;
  /** Multiplicateur de dégâts de cette attaque */
  dmgMul: number;
  cooldown: number;
  missile?: string;
  radius?: number;
  weight: number;
  summon?: string;
  /** Résurrection (D2 : Chaman déchu) : relève un cadavre récent de l'espèce `summon` au lieu d'en créer un */
  revive?: boolean;
  /** Malédiction lancée (amplify, weaken, decrepify, defense_curse, lower_resist) */
  curse?: string;
  /** Étourdissement du joueur au coup (ticks ; D2 Smite) */
  stun?: number;
  /** cast : compétence de boss à zone télégraphiée (Mur de feu, Blizzard, Éclair en chaîne, Éclairs en éventail, Prison d'os, Tentacules) */
  pattern?: 'firewall' | 'blizzard' | 'chain' | 'fan' | 'prison' | 'tentacle';
  /** cast : nombre de murs de feu / d'éclairs / de tentacules */
  shots?: number;
}

export interface MonsterDef {
  id: string;
  name: string;
  family: string;
  sprite: string;
  radius: number;
  /** Échelle d'affichage relative au modèle */
  scale: number;
  speed: number;
  ai: MonsterAi;
  /** Multiplicateurs relatifs aux courbes (1 = monstre standard) */
  hp: number;
  dmg: number;
  xp: number;
  attacks: MonsterAttack[];
  /** Résistances par difficulté [N, C, E] */
  res: Partial<Record<Element, [number, number, number]>>;
  /** Variantes de résistances (D2 : même famille, immunité différente selon la variante) ;
   *  un groupe entier tire la même variante, qui complète `res` */
  resVariants?: Partial<Record<Element, [number, number, number]>>[];
  /** Rayon d'aggro */
  aggro: number;
  tint?: number;
  boss?: boolean;
  /** Niveau de boss PD2 par difficulté (MonStats) : remplace le niveau de zone */
  bossLevel?: [number, number, number];
  /** Aura passive Holy Freeze (Duriel) : ralentit le joueur proche */
  holyFreeze?: boolean;
  /** Ne peut pas être gelé / ralenti fortement */
  noFreeze?: boolean;
  /** Classe de trésor propre à ce boss (TreasureClassEx : Countess, Andariel, Mephisto) ; suffixe de difficulté ajouté */
  tc?: string;
  /** Distance que le monstre garde (tireurs) */
  keepDistance?: number;
  /** Fuit le joueur tant qu'il est proche (Déchu au trésor) */
  coward?: boolean;
  /** Boss : vie et dégâts par difficulté (monstats, monsters-fidelity.ts) ; remplacent hp / dmg */
  hpD?: [number, number, number];
  dmgD?: [number, number, number];
  /** Régénération D2 (DamageRegen) */
  regen?: number;
  /** Efficacité du vol de vie / mana sur ce monstre (%, PD2 « Drain ») */
  drain?: number;
  /** Aura permanente (D2 : Conviction d'Uber Méphisto, Fanatisme des chamans fétiches…) : [aura, niveau ; 0 = mlvl/7] */
  aura?: [string, number];
  /** Se relève une fois après sa mort (D2 : Self-resurrect des guerriers souillés) */
  selfRes?: boolean;
  /** Espèces sœurs tirées par groupe à la place de celle-ci [espèce, poids ; celle-ci pèse 1] (Levels.txt mêle ces familles
   *  que la table des zones rapporte à une seule : Rôdeur sombre / Archère / Lancière…) */
  alts?: [string, number][];
}

/* ------------------------------------------------------------------ */
/* Compétences                                                         */
/* ------------------------------------------------------------------ */

export type SkillTree =
  | 'fire'
  | 'cold'
  | 'light'
  | 'elemental'
  | 'shape'
  | 'summon'
  | 'bar_combat'
  | 'bar_mastery'
  | 'bar_warcry'
  | 'pal_combat'
  | 'pal_defense'
  | 'pal_offense'
  | 'amz_bow'
  | 'amz_passive'
  | 'amz_javelin'
  | 'asn_martial'
  | 'asn_shadow'
  | 'asn_traps'
  | 'nec_summon'
  | 'nec_poison'
  | 'nec_curse';

type TargetRule = 'nearest' | 'densest' | 'self' | 'strongest' | 'direction';

export interface SkillDef {
  id: string;
  name: string;
  tree: SkillTree;
  /** Rangée dans l'arbre (1..6) et colonne (0..2) */
  row: number;
  col: number;
  reqLvl: number;
  prereqs: string[];
  passive?: boolean;
  /** Buff de durée (armures, bouclier d'énergie…) */
  buff?: boolean;
  element: Element;
  /** Second élément (Rocher en fusion, Volcan, Armageddon : physique + feu) */
  element2?: Element;
  /** Attaque de mêlée (Druide métamorphosé) : animation d'attaque, test de toucher, arme */
  melee?: boolean;
  /** Forme exigée par l'attaque (le Druide s'y transforme en la lançant) ; 'any' : l'une ou l'autre */
  form?: 'werewolf' | 'werebear' | 'any';
  target: TargetRule;
  /** Portée en unités de monde */
  range: number;
  icon: string;
  desc: string;
  synergies: { skill: string; pct: number; what: 'dmg' | 'duration' | 'other' }[];
  /** Archétype de la compétence (moteur générique des classes D2) */
  kind?: SkillKind;
}

type SkillKind = 'strike' | 'ranged' | 'aura' | 'curse' | 'trap' | 'minion' | 'buff' | 'shout' | 'charge' | 'finisher' | 'spell' | 'passive';
