/**
 * Instantané des tables patchées par le mod sur la base vanilla (lot M6) : entrées dans l'ordre (propriétaire compris), ordre des clés des
 * index, sérialisation qui garde les champs à `undefined`. Partagé par l'outil de diff (vanilla-diff.ts) et par le test permanent
 * (tests/unit/vanilla-patch.test.ts). À appeler une fois le jeu de règles activé.
 */
import { createHash } from 'node:crypto';
import { REGISTRIES } from '../../../src/mods/registries';
import { BASE_BY_ID } from '../../../src/data/items/bases';
import { GEM_BY_ID, RUNE_BY_ID, RUNE_BY_NAME } from '../../../src/data/items/runes';
import { UNIQUE_BY_ID } from '../../../src/data/items/uniques';
import { SET_BY_ID, SET_ITEM_BY_ID } from '../../../src/data/items/sets';
import { A1_LEVELS } from '../../../src/data/levels-a1';
import { A2_LEVELS } from '../../../src/data/levels-a2';
import { A3_LEVELS } from '../../../src/data/levels-a3';
import { A5_LEVELS } from '../../../src/data/levels-a5';
import { RUN_BY_ID } from '../../../src/data/runs';
import { MONSTER_TC } from '../../../src/data/treasure';
import { MONSTER_FIDELITY } from '../../../src/data/monsters-fidelity';
import { MONSTER_BY_ID } from '../../../src/data/monsters';
import { CLASSES } from '../../../src/data/classes';
import { AFFIX_BY_ID } from '../../../src/data/items/affixes';
import { RUNEWORD_BY_ID } from '../../../src/data/items/runewords';
import { CUBE_BY_ID } from '../../../src/data/cube';
import { SKILL_BY_ID } from '../../../src/data/skills';
import { MERC_BY_ID } from '../../../src/data/mercs';

/**
 * Tables patchées : registre, index exportés (le premier : `*_BY_ID`), fichier et export du patch, type des entrées, table de tools/vanilla/gen.ts ;
 * `verifyOnly` : table dérivée d'une autre (monstres : fidélité réappliquée), vérifiée à l'identique sans patch propre
 */
export const TABLES = [
  { reg: 'bases', index: { BASE_BY_ID }, file: 'data/items/bases.patch.ts', name: 'PD2_BASES_PATCH', type: 'ItemBase', gen: 'bases' },
  { reg: 'runes', index: { RUNE_BY_ID, RUNE_BY_NAME }, file: 'data/items/runes.patch.ts', name: 'PD2_RUNES_PATCH', type: 'RuneDef', gen: 'runes' },
  { reg: 'gems', index: { GEM_BY_ID }, file: 'data/items/runes.patch.ts', name: 'PD2_GEMS_PATCH', type: 'GemDef', gen: 'runes' },
  { reg: 'uniques', index: { UNIQUE_BY_ID }, file: 'data/items/uniques.patch.ts', name: 'PD2_UNIQUES_PATCH', type: 'UniqueDef', gen: 'uniques' },
  { reg: 'setItems', index: { SET_ITEM_BY_ID }, file: 'data/items/sets.patch.ts', name: 'PD2_SET_ITEMS_PATCH', type: 'SetItemDef', gen: 'sets' },
  { reg: 'sets', index: { SET_BY_ID }, file: 'data/items/sets.patch.ts', name: 'PD2_SETS_PATCH', type: 'SetDef', gen: 'sets' },
  { reg: 'levels', index: { A1_LEVELS, A2_LEVELS, A3_LEVELS, A5_LEVELS }, file: 'data/levels.patch.ts', name: 'PD2_LEVELS_PATCH', type: 'ZoneLevel', gen: 'levels' },
  // étapes de campagne : niveaux de zone recopiés au chargement de runs.ts (zoneLevel, recLevel)
  { reg: 'runs', index: { RUN_BY_ID }, file: 'data/levels.patch.ts', name: 'PD2_RUNS_PATCH', type: 'RunDef', gen: 'levels' },
  { reg: 'treasureClasses', index: { MONSTER_TC }, file: 'data/treasure.patch.ts', name: 'PD2_TREASURE_PATCH', type: 'TreasureClass', gen: 'treasure' },
  { reg: 'monsterFidelity', index: { MONSTER_FIDELITY }, file: 'data/monsters.patch.ts', name: 'PD2_MONSTER_FIDELITY_PATCH', type: 'MonsterFidelityEntry', gen: 'monsters' },
  { reg: 'classes', index: { CLASSES }, file: 'data/classes.patch.ts', name: 'PD2_CLASSES_PATCH', type: 'ClassDef', gen: 'classes' },
  { reg: 'affixes', index: { AFFIX_BY_ID }, file: 'data/items/affixes.patch.ts', name: 'PD2_AFFIXES_PATCH', type: 'AffixDef', gen: 'affixes' },
  { reg: 'runewords', index: { RUNEWORD_BY_ID }, file: 'data/items/runewords.patch.ts', name: 'PD2_RUNEWORDS_PATCH', type: 'RunewordDef', gen: 'runewords' },
  { reg: 'cubeRecipes', index: { CUBE_BY_ID }, file: 'data/cube.patch.ts', name: 'PD2_CUBE_PATCH', type: 'CubeRecipe', gen: 'cube' },
  // arbres de compétences (lot M9) : patch vers l'état d'avant les chiffres et synergies du wiki (`api.skills.patchNumbers`, `patchSynergies`, appliqués ensuite)
  { reg: 'skills', index: { SKILL_BY_ID }, file: 'data/skills.patch.ts', name: 'PD2_SKILLS_PATCH', type: 'SkillEntry', gen: 'skills' },
  // mercenaires (lot M10d) : types et sous-types de Hireling.txt dans la base, ceux de PD2 (cinq actes, 13 sous-types) dans le patch
  { reg: 'mercs', index: { MERC_BY_ID }, file: 'data/mercs.patch.ts', name: 'PD2_MERCS_PATCH', type: 'MercType', gen: 'mercs' },
  // monstres : vérifiés seulement (la fidélité patchée leur est réappliquée), sans patch propre
  { reg: 'monsters', index: { MONSTER_BY_ID }, file: '', name: '', type: 'MonsterDef', gen: 'monsters', verifyOnly: true },
] as const;
export type TableName = (typeof TABLES)[number]['reg'];

const UNDEF = '\u0000undefined';
/** JSON qui garde les champs à `undefined` (un champ absent et un champ à undefined diffèrent pour le jeu et les empreintes) */
export const pack = (v: unknown): string => JSON.stringify(v, (_k, x) => (x === undefined ? UNDEF : x));
function revive(v: unknown): unknown {
  if (v === UNDEF) return undefined;
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) o[k] = revive(o[k]);
  }
  return v;
}
export const unpack = (s: string): unknown => revive(JSON.parse(s));

export interface Snap {
  /** entrées de la table, dans l'ordre, avec leur propriétaire (`base` ou un mod) */
  list: { id: string; owner: string; entry: string }[];
  /** ordre des clés de chaque index */
  index: Record<string, string[]>;
}

/** Instantané des tables `names` dans le jeu de règles actif */
export function snapshotTables(names: readonly string[]): Record<string, Snap> {
  const res: Record<string, Snap> = {};
  for (const t of TABLES) {
    if (!names.includes(t.reg)) continue;
    const reg = REGISTRIES[t.reg];
    res[t.reg] = {
      list: reg.ids().map((id: string) => ({ id, owner: reg.ownerOf(id) ?? '?', entry: pack(reg.get(id)) })),
      index: Object.fromEntries(Object.entries(t.index).map(([k, v]) => [k, Object.keys(v)])),
    };
  }
  return res;
}

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex');
/** Empreinte d'une table : entrées (identifiant et contenu, dans l'ordre) et ordre de chaque index (le propriétaire n'en fait pas partie) */
export function tableHash(s: Snap): { entries: string; index: string } {
  return { entries: sha1(s.list.map((e) => `${e.id}\t${e.entry}`).join('\n')), index: sha1(JSON.stringify(s.index)) };
}
