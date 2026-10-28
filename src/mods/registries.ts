/**
 * Registres de toutes les tables que la base et les mods peuvent étendre, posés sur les tables existantes de `src/data` (même tableau,
 * même index `*_BY_ID` : les importeurs actuels n'ont rien à changer). Les index secondaires (runes par nom) suivent les modifications.
 * Pas encore en registre (lots suivants du plan) : arbres de compétences, textes.
 */
import '../data/items/index';
import { BASE_REGISTRY } from '../data/items/bases';
import { AFFIXES, AFFIX_BY_ID } from '../data/items/affixes';
import { UNIQUES, UNIQUE_BY_ID } from '../data/items/uniques';
import { SETS, SET_BY_ID, SET_ITEMS, SET_ITEM_BY_ID } from '../data/items/sets';
import { GEMS, GEM_BY_ID, RUNES, RUNE_BY_ID, RUNE_BY_NAME } from '../data/items/runes';
import { RUNEWORDS, RUNEWORD_BY_ID } from '../data/items/runewords';
import { CUBE_BY_ID, CUBE_RECIPES } from '../data/cube';
import { RUNS, RUN_BY_ID } from '../data/runs';
import { SKILLS, SKILL_BY_ID } from '../data/skills';
import { MERCS, MERC_BY_ID } from '../data/mercs';
import { MONSTERS, MONSTER_BY_ID } from '../data/monsters';
import { MONSTER_FIDELITY, type MonsterFidelity } from '../data/monsters-fidelity';
import { MONSTER_TC } from '../data/treasure';
import { SHRINES, SHRINE_BY_ID } from '../data/shrines';
import { STATS } from '../data/stats';
import { MAP_AFFIXES, MAP_AFFIX_BY_ID, MAP_ZONES, MAP_ZONE_BY_ID } from '../data/maps';
import { CORRUPTION_TABLES } from '../data/corruption';
import { A1_LEVELS, type A1Level } from '../data/levels-a1';
import { A2_LEVELS } from '../data/levels-a2';
import { A3_LEVELS } from '../data/levels-a3';
import { A5_LEVELS } from '../data/levels-a5';
import { CLASSES, type ClassDef } from '../data/classes';
import { Registry } from './registry';

/** Fidélité d'un monstre à Diablo II (MonStats) ; `id` : l'identifiant du monstre, que les entrées ne portent pas (registre sans ordre, patch seulement) */
export type MonsterFidelityEntry = MonsterFidelity & { id: string };

/** Niveaux d'une zone (Levels.txt) ; `id` : la clé de la zone dans la table, que les entrées ne portent pas (registre sans ordre, patch seulement) */
export type ZoneLevel = A1Level & { id: string };
/** Index des niveaux de zone des quatre actes (mêmes objets que A1_LEVELS…A5_LEVELS : un patch y est visible) */
const ZONE_LEVELS = { ...A1_LEVELS, ...A2_LEVELS, ...A3_LEVELS, ...A5_LEVELS } as Record<string, ZoneLevel>;

export const REGISTRIES = {
  bases: BASE_REGISTRY,
  /** Affixes magiques : la table tirée, et l'index qui garde aussi les affixes historiques (lecture des anciens objets) */
  affixes: new Registry('affixes', AFFIXES, AFFIX_BY_ID),
  uniques: new Registry('uniques', UNIQUES, UNIQUE_BY_ID),
  sets: new Registry('sets', SETS, SET_BY_ID),
  setItems: new Registry('setItems', SET_ITEMS, SET_ITEM_BY_ID),
  runes: new Registry('runes', RUNES, RUNE_BY_ID, {
    index: (r, present) => {
      const k = r.name.toLowerCase();
      if (present) RUNE_BY_NAME[k] = r;
      else if (RUNE_BY_NAME[k] === r) delete RUNE_BY_NAME[k];
    },
    indexFields: ['name'],
  }),
  gems: new Registry('gems', GEMS, GEM_BY_ID),
  runewords: new Registry('runewords', RUNEWORDS, RUNEWORD_BY_ID),
  cubeRecipes: new Registry('cubeRecipes', CUBE_RECIPES, CUBE_BY_ID),
  runs: new Registry('runs', RUNS, RUN_BY_ID),
  skills: new Registry('skills', SKILLS, SKILL_BY_ID),
  mercs: new Registry('mercs', MERCS, MERC_BY_ID),
  /** Monstres : la table des monstres ; l'index contient aussi familiers et mercenaires */
  monsters: new Registry('monsters', MONSTERS, MONSTER_BY_ID),
  /** Fidélité des monstres à Diablo II (résistances, régénération, vie et dégâts des boss) : une entrée patchée est réappliquée à son monstre */
  monsterFidelity: new Registry('monsterFidelity', null, MONSTER_FIDELITY as Record<string, MonsterFidelityEntry>),
  treasureClasses: new Registry('treasureClasses', null, MONSTER_TC),
  shrines: new Registry('shrines', SHRINES, SHRINE_BY_ID),
  stats: new Registry('stats', null, STATS),
  mapZones: new Registry('mapZones', MAP_ZONES, MAP_ZONE_BY_ID),
  mapAffixes: new Registry('mapAffixes', MAP_AFFIXES, MAP_AFFIX_BY_ID),
  /** Niveaux des monstres par zone et difficulté, densité, uniques (Levels.txt) : zones des actes I, II, III et V */
  levels: new Registry('levels', null, ZONE_LEVELS),
  /** Classes jouables : caractéristiques de départ et gains par niveau et par point (CharStats.txt) ; registre sans ordre, patch seulement */
  classes: new Registry('classes', null, CLASSES as Record<string, ClassDef>),
  /** Tables de corruption par type d'objet (identifiant = type, lu par type : vide dans la base) */
  corruption: new Registry('corruption', null, CORRUPTION_TABLES),
};

export type RegistryName = keyof typeof REGISTRIES;
export type EntryOf<K extends RegistryName> = (typeof REGISTRIES)[K] extends Registry<infer T> ? T : never;
