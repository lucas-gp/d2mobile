// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Mercenaires : un allié recruté en ville, qui suit le joueur, combat, et porte un casque, une armure et une arme propre à son acte (et
 * un bouclier pour le Loup de fer). Il meurt et se ressuscite contre de l'or. Déblocage : acte I au niveau 5, puis chaque acte au niveau
 * conseillé de sa run en Normal (Tombeaux, Vaches, Trône de Baal).
 *
 * Base : les mercenaires de Diablo II LoD 1.13c (Hireling.txt, lot M10d), quatre actes :
 * - acte I, Éclaireuse : Feu (Flèche de feu), Froid (Flèche de froid), avec Vision intérieure ;
 * - acte II, Garde du désert : Combat, Défensif, Offensif (Prière, Défi, Visée bénie en Normal et en Enfer ; Épines, Gel sacré, Puissance
 *   en Cauchemar : `hire`), Estoc ;
 * - acte III, Loup de fer : Feu (Inferno, Boule de feu), Froid (Pointe glaciale, Explosion de glace, Armure gelée), Foudre (Éclair chargé,
 *   Foudre) ;
 * - acte V, Barbare : Coup violent, Étourdissement.
 * Statistiques, niveaux et poids des compétences par niveau : modèle du jeu de règles (règle `merc.model`, src/mods/d2/mercs.ts, lignes de
 * src/data/mercs-d2.ts). Les types et 13 sous-types de Project Diablo 2 (acte IV compris), leurs tableaux et paliers du wiki sont dans le
 * mod (mods/pd2/data/mercs.patch.ts, mercs.gen.ts, rules/mercs.ts).
 */
import type { ClassOnly, ItemBase, ItemType } from './types';
import { RUN_BY_ID } from './runs';
import { RULES } from '../mods/rules';
import type { MercBaseStats } from '../mods/d2/mercs';

export type MercId = 'rogue' | 'desert' | 'ironwolf' | 'ascendant' | 'barbarian';
/** Auras natives des sous-types PD2 */
type MercAura = 'vigor' | 'meditation' | 'defiance' | 'blessed_aim' | 'thorns' | 'cleansing' | 'prayer' | 'holy_shock' | 'sanctuary' | 'might' | 'holy_freeze';
export type MercSlot = 'mainhand' | 'offhand' | 'head' | 'body' | 'gloves' | 'boots' | 'belt';
/** Compétences actives des mercenaires ('attack' : attaque de base) */
export type MercSkillId =
  | 'attack'
  | 'fire_arrow'
  | 'exploding_arrow'
  | 'cold_arrow'
  | 'freezing_arrow'
  | 'magic_arrow'
  | 'strafe'
  | 'slow_movement'
  | 'jab'
  | 'fire_ball'
  | 'meteor'
  | 'ice_blast'
  | 'blizzard'
  | 'lightning'
  | 'static_field'
  | 'amplify_damage'
  | 'teeth'
  | 'bone_spear'
  | 'bone_armor'
  | 'holy_bolt'
  | 'holy_light'
  | 'fist_of_the_heavens'
  | 'bash'
  | 'concentrate'
  | 'whirlwind'
  | 'battle_cry'
  | 'battle_orders'
  | 'inner_sight'
  | 'inferno'
  | 'glacial_spike'
  | 'frozen_armor'
  | 'charged_bolt'
  | 'stun';
/** Maîtrises passives (Loup de fer, Ascendant) : vie par victime, bonus de dégâts élémentaires */
type MercMastery = 'fire_mastery' | 'cold_mastery' | 'lightning_mastery' | 'mastery';

export interface MercVariant {
  id: string;
  name: string;
  desc: string;
  aura?: MercAura;
  /** Compétences tirées au sort à chaque attaque (probabilités du wiki, en %) */
  skills: { id: MercSkillId; pct: number }[];
  mastery?: MercMastery;
  /** Élément principal (IA du bot, interface) */
  elem: 'phys' | 'fire' | 'cold' | 'light' | 'magic';
  /** Difficultés d'embauche où il est proposé (0 à 2 ; absent : toutes) : sous-types de l'acte II de D2 */
  hire?: number[];
}

export interface MercType {
  id: MercId;
  act: 1 | 2 | 3 | 4 | 5;
  name: string;
  /** Titre court (« Éclaireuse de l'acte I ») */
  title: string;
  /** Niveau de personnage requis pour recruter : un niveau, ou une étape de campagne (son niveau conseillé) */
  unlock: number | string;
  /** Types d'armes autorisés (main droite) */
  weapons: ItemType[];
  /** Bouclier (Loup de fer) */
  shield: boolean;
  /** Restrictions de classe levées pour ce mercenaire (arcs d'Amazone, boucliers de Paladin…) */
  classItems: ClassOnly[];
  /** PD2 : armes à une main ×2 dégâts (Garde du désert, Barbare) */
  oneHandDouble: boolean;
  /** Attaque : mêlée, flèches, ou sorts (les lanceurs de sorts ne frappent jamais de leur arme) */
  style: 'melee' | 'bow' | 'caster';
  /** Portée d'engagement (unités) */
  range: number;
  /** Ticks entre deux attaques à vitesse nulle */
  atkTicks: number;
  speed: number;
  sprite: string;
  names: string[];
  variants: MercVariant[];
}

/** Niveau de personnage requis pour recruter ce mercenaire */
export function mercUnlockLevel(t: MercType): number {
  return typeof t.unlock === 'number' ? t.unlock : (RUN_BY_ID[t.unlock]?.recLevel[0] ?? 99);
}

/** Compétences tirées au sort du Garde du désert (poids du Normal ; le modèle du jeu de règles les recalcule par niveau) */
const DESERT_SKILLS: MercVariant['skills'] = [
  { id: 'attack', pct: 30 },
  { id: 'jab', pct: 70 },
];

export const MERCS: MercType[] = [
  {
    id: 'rogue',
    act: 1,
    name: 'Éclaireuse',
    title: "Éclaireuse de l'acte I",
    unlock: 5,
    weapons: ['bow'],
    shield: false,
    classItems: [],
    oneHandDouble: false,
    style: 'bow',
    range: 8,
    atkTicks: 22,
    speed: 4.4,
    sprite: 'merc_rogue',
    names: ['Aliza', 'Ampliza', 'Annor', 'Abhaya', 'Elly', 'Paige', 'Kyoko', 'Rozene', 'Sarina', 'Wuyi', 'Fiona', 'Bettine'],
    variants: [
      {
        id: 'fire',
        name: 'Feu',
        desc: 'Flèche de feu, Vision intérieure (défense des monstres réduite).',
        elem: 'fire',
        skills: [
          { id: 'attack', pct: 75 },
          { id: 'fire_arrow', pct: 25 },
          { id: 'inner_sight', pct: 10 },
        ],
      },
      {
        id: 'cold',
        name: 'Froid',
        desc: 'Flèche de froid, Vision intérieure (défense des monstres réduite).',
        elem: 'cold',
        skills: [
          { id: 'attack', pct: 75 },
          { id: 'cold_arrow', pct: 25 },
          { id: 'inner_sight', pct: 10 },
        ],
      },
    ],
  },
  {
    id: 'desert',
    act: 2,
    name: 'Garde du désert',
    title: "Garde du désert de l'acte II",
    unlock: 'tombs',
    weapons: ['polearm', 'spear'],
    shield: false,
    classItems: [],
    oneHandDouble: false,
    style: 'melee',
    range: 1.2,
    atkTicks: 20,
    speed: 4.3,
    sprite: 'merc_desert',
    names: ['Hazade', 'Alhizeer', 'Azrael', 'Ahsab', 'Chalan', 'Haseen', 'Razan', 'Emilio', 'Pratham', 'Fazel', 'Jemali', 'Kasim'],
    variants: [
      { id: 'prayer', name: 'Combat', desc: 'Aura Prière : soigne le groupe. Estoc.', aura: 'prayer', elem: 'phys', hire: [0, 2], skills: DESERT_SKILLS },
      { id: 'defiance', name: 'Défensif', desc: 'Aura Défi : défense augmentée pour le groupe. Estoc.', aura: 'defiance', elem: 'phys', hire: [0, 2], skills: DESERT_SKILLS },
      { id: 'blessed_aim', name: 'Offensif', desc: "Aura Visée bénie : score d'attaque augmenté pour le groupe. Estoc.", aura: 'blessed_aim', elem: 'phys', hire: [0, 2], skills: DESERT_SKILLS },
      { id: 'thorns', name: 'Combat', desc: 'Aura Épines : renvoie les coups de mêlée reçus. Estoc.', aura: 'thorns', elem: 'phys', hire: [1], skills: DESERT_SKILLS },
      { id: 'holy_freeze', name: 'Défensif', desc: 'Aura Gel sacré : froid et ralentissement des monstres proches. Estoc.', aura: 'holy_freeze', elem: 'phys', hire: [1], skills: DESERT_SKILLS },
      { id: 'might', name: 'Offensif', desc: 'Aura Puissance : dégâts augmentés pour le groupe. Estoc.', aura: 'might', elem: 'phys', hire: [1], skills: DESERT_SKILLS },
    ],
  },
  {
    id: 'ironwolf',
    act: 3,
    name: 'Loup de fer',
    title: "Loup de fer de l'acte III",
    unlock: 'cows',
    // épées à une main et bouclier ; il ne frappe jamais de son arme (le moteur : lanceur de sorts)
    weapons: ['sword'],
    shield: true,
    classItems: [],
    oneHandDouble: false,
    style: 'caster',
    range: 7,
    atkTicks: 26,
    speed: 4.2,
    sprite: 'merc_ironwolf',
    names: ['Jelani', 'Barani', 'Jabari', 'Devak', 'Raldin', 'Telash', 'Ajheed', 'Narphet', 'Khaleel', 'Phaet', 'Geshef', 'Vanji'],
    variants: [
      {
        id: 'fire',
        name: 'Feu',
        desc: 'Inferno, Boule de feu.',
        elem: 'fire',
        skills: [
          { id: 'attack', pct: 10 },
          { id: 'inferno', pct: 60 },
          { id: 'fire_ball', pct: 30 },
        ],
      },
      {
        id: 'cold',
        name: 'Froid',
        desc: 'Pointe glaciale, Explosion de glace ; Armure gelée.',
        elem: 'cold',
        skills: [
          { id: 'attack', pct: 10 },
          { id: 'glacial_spike', pct: 60 },
          { id: 'ice_blast', pct: 240 },
        ],
      },
      {
        id: 'light',
        name: 'Foudre',
        desc: 'Éclair chargé, Foudre.',
        elem: 'light',
        skills: [
          { id: 'attack', pct: 10 },
          { id: 'charged_bolt', pct: 60 },
          { id: 'lightning', pct: 30 },
        ],
      },
    ],
  },
  {
    id: 'barbarian',
    act: 5,
    name: 'Barbare',
    title: "Barbare de l'acte V",
    unlock: 38, // niveau conseillé historique du Trône de Baal (la run elle-même se débloque dès 25/40/60)
    weapons: ['sword'],
    shield: false,
    classItems: [],
    oneHandDouble: false,
    style: 'melee',
    range: 1,
    atkTicks: 20,
    speed: 4.4,
    sprite: 'merc_barbarian',
    names: ['Vardhaka', 'Beorn', 'Guthlaf', 'Hrothgar', 'Kormac', 'Ulf', 'Varaya', 'Wulfgar', 'Bjorn', 'Halvard', 'Thrain', 'Sigurd'],
    variants: [
      {
        id: 'bash',
        name: 'Combat',
        desc: 'Coup violent, Étourdissement.',
        elem: 'phys',
        skills: [
          { id: 'attack', pct: 50 },
          { id: 'bash', pct: 15 },
          { id: 'stun', pct: 15 },
        ],
      },
    ],
  },
];

export const MERC_BY_ID: Record<string, MercType> = Object.fromEntries(MERCS.map((m) => [m.id, m]));

/** Modèle des mercenaires du jeu de règles (règle merc.model : D2, src/mods/d2/mercs.ts ; un mod peut le remplacer) */
const model = (): ReturnType<(typeof RULES)['merc.model']> => RULES['merc.model']();

/** Sous-type d'un mercenaire (variantes d'anciennes sauvegardes converties par le modèle) */
export function mercVariant(t: MercType, id: string): MercVariant {
  const v = model().variantAlias(t.id, id);
  return t.variants.find((x) => x.id === v) ?? t.variants[0];
}

/** Sous-types proposés à l'embauche dans cette difficulté */
export function mercVariantsAt(t: MercType, difficulty: number): readonly MercVariant[] {
  return model().variantsAt(t.variants, difficulty);
}

/** Statistiques de base d'un mercenaire à un niveau (`variant`, `hire` : sous-type et difficulté d'embauche) */
export function mercBaseStats(t: MercType, lvl: number, variant = '', hire = 0): MercBaseStats {
  return model().baseStats(t, variant, hire, lvl);
}

/** Niveau « dur » d'une compétence ou d'une aura selon le niveau du mercenaire (0 : pas encore apprise) ; `t` : son type, s'il est connu */
export function mercSkillLevel(skill: string, mlvl: number, t: MercType | null = null, variant = '', hire = 0): number {
  return model().skillLevel(skill, mlvl, t, variant, hire);
}

/** Coût d'embauche (or) */
export function mercHireCost(clvl: number, act: number): number {
  return Math.round(150 + clvl * clvl * (1 + act * 0.1));
}

/** Coût de résurrection (or) : D2, plafonné */
export function mercResurrectCost(clvl: number): number {
  return Math.min(15000, Math.round(100 + clvl * clvl));
}

/** Emplacements d'équipement du mercenaire (modèle du jeu de règles) */
export function mercSlots(t: MercType): MercSlot[] {
  return model().slots(t);
}

/** Emplacement où ce mercenaire porte cette base (null : interdit) */
export function mercSlotFor(t: MercType, b: Pick<ItemBase, 'id' | 'type' | 'classOnly' | 'twoHanded'>): MercSlot | null {
  return model().slotFor(t, b);
}
