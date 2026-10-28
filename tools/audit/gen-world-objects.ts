/**
 * Génère src/data/worldobjects.ts : objets interactifs de Diablo II (coffres, urnes, cadavres, sanctuaires, puits, objets de quête).
 * - DS1 : la table obj.txt (acte, identifiant de DS1 → ligne d'objects.txt ; table de Diablo II redistribuée par Riiablo, non couverte par sa licence Apache-2.0, lue depuis `<entrée>/obj.txt`,
 *   jamais dans le dépôt) donne la ligne d'objects.txt de chaque objet posé ; on n'en garde que le genre (OperateFn, Parm0).
 * - objgroup.txt et Levels.txt (ObjGrp0-7 / ObjPrb0-7) : groupes d'objets semés pièce par pièce dans chaque zone.
 * Usage : npx tsx tools/audit/gen-world-objects.ts
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IN_DIR, num, rows } from './common';

/** Genre d'un objet d'objects.txt d'après sa fonction d'ouverture (OperateFn) et, pour les sanctuaires, Parm0 */
function kindOf(r: Record<string, string>): string | null {
  const op = num(r.OperateFn);
  const id = num(r.Id);
  const QUEST: Record<number, string> = {
    21: 'q_malus',
    24: 'q_viper_altar',
    25: 'q_orifice',
    28: 'q_lam_esen',
    31: 'q_gidbinn',
    42: 'q_journal',
    49: 'q_hellforge',
    53: 'q_compelling_orb',
    12: 'q_inifuss',
    33: 'q_wirt',
  };
  const QCHEST: Record<number, string> = { 39: 'qchest_cube', 40: 'qchest_scroll', 41: 'qchest_staff', 57: 'qchest_heart', 58: 'qchest_eye', 59: 'qchest_brain' };
  if (QUEST[op]) return QUEST[op];
  if (QCHEST[op]) return QCHEST[op];
  if (r.Selectable0 !== '1') return null;
  if (op === 1) return id === 28 ? 'corpse' : num(r.SubClass) === 128 ? 'corpse' : 'sarcophagus';
  if (op === 2) return num(r.Parm0) === 1 ? 'shrine_health' : num(r.Parm0) === 2 ? 'shrine_mana' : 'shrine';
  if (op === 3 || op === 68) return 'urn';
  if (op === 4 || op === 30) return 'chest';
  if (op === 5 || op === 7) return 'barrel';
  if (op === 14) return 'corpse';
  if (op === 19) return 'armor';
  if (op === 20) return 'rack';
  if (op === 22) return 'well';
  return null;
}

const objects = rows('objects');
const kindById = new Map<number, string>();
for (const r of objects) {
  if (!/^\d+$/.test(r.Id ?? '')) continue;
  const k = kindOf(r);
  if (k) kindById.set(num(r.Id), k);
}

// obj.txt : (acte, id DS1) → objects.txt
const ds1: Record<string, string> = {};
const objTxt = join(IN_DIR, 'obj.txt');
if (existsSync(objTxt)) {
  for (const line of readFileSync(objTxt, 'utf8').split(/\r?\n/).slice(1)) {
    const c = line.split('\t');
    if (c.length < 4 || !/^\d+$/.test(c[0])) continue;
    const k = kindById.get(Number(c[3]));
    if (k) ds1[`${c[0]}:${c[1]}`] = k;
  }
} else console.warn('obj.txt absent : aucun objet de DS1');

// groupes d'objets (objgroup.txt)
const groups: Record<number, { ids: [string, number][]; density: number }> = {};
for (const r of rows('objgroup')) {
  const off = num(r.Offset);
  const ids: [string, number][] = [];
  let density = 0;
  for (let i = 0; i < 8; i++) {
    const id = num(r[`ID${i}`]);
    const pr = num(r[`PROB${i}`]);
    const k = kindById.get(id);
    if (!id || !pr || !k) continue;
    ids.push([k, pr]);
    density = Math.max(density, num(r[`DENSITY${i}`]));
  }
  if (ids.length) groups[off] = { ids, density };
}

// zones du jeu → ligne de Levels.txt
const LEVEL_ZONES: Record<number, string[]> = {
  2: ['a1_bloodmoor'],
  3: ['a1_coldplains'],
  4: ['a1_stonyfield'],
  5: ['a1_darkwood'],
  6: ['a1_blackmarsh'],
  7: ['a1_tamoe'],
  8: ['a1_den'],
  9: ['a1_cave1'],
  10: ['a1_underpass1'],
  11: ['a1_hole1'],
  12: ['a1_pit1'],
  13: ['a1_cave2'],
  14: ['a1_underpass2'],
  15: ['a1_hole2'],
  16: ['a1_pit2'],
  17: ['a1_burial'],
  18: ['a1_crypt'],
  19: ['a1_mausoleum'],
  21: ['a1_cellar1'],
  22: ['a1_cellar2'],
  23: ['a1_cellar3'],
  24: ['a1_cellar4'],
  25: ['countess'],
  26: ['a1_monastery'],
  27: ['a1_cloister'],
  28: ['a1_barracks'],
  29: ['a1_jail1'],
  30: ['a1_jail2'],
  31: ['a1_jail3'],
  32: ['a1_inner'],
  33: ['a1_cathedral'],
  34: ['a1_cata1'],
  35: ['a1_cata2'],
  36: ['a1_cata3'],
  37: ['andariel'],
  39: ['cows'],
  41: ['a2_rocky'],
  42: ['a2_dryhills'],
  43: ['a2_oasis'],
  44: ['a2_lostcity'],
  45: ['a2_valley'],
  46: ['a2_canyon'],
  47: ['a2_sewer1'],
  48: ['a2_sewer2'],
  49: ['a2_sewer3'],
  51: ['a2_harem2'],
  52: ['a2_cellar1'],
  53: ['a2_cellar2'],
  54: ['a2_cellar3'],
  55: ['a2_stony1'],
  56: ['a2_halls1'],
  57: ['a2_halls2'],
  58: ['a2_viper1'],
  59: ['a2_stony2'],
  60: ['a2_halls3'],
  61: ['a2_viper2'],
  62: ['a2_maggot1'],
  63: ['a2_maggot2'],
  64: ['a2_maggot3'],
  65: ['a2_tunnels'],
  66: ['tombs'],
  74: ['a2_arcane'],
  76: ['a3_spider'],
  77: ['a3_marsh'],
  78: ['a3_jungle'],
  79: ['a3_lower'],
  80: ['a3_bazaar'],
  81: ['a3_upper'],
  82: ['a3_causeway'],
  83: ['a3_travincal'],
  84: ['a3_cave1'],
  85: ['a3_cave2'],
  86: ['a3_pit1'],
  87: ['a3_pit2'],
  88: ['a3_flayer1'],
  89: ['a3_flayer2'],
  90: ['a3_pit3'],
  91: ['a3_flayer3'],
  92: ['a3_sewer1'],
  93: ['a3_sewer2'],
  94: ['a3_temple1'],
  95: ['a3_temple2'],
  96: ['a3_temple3'],
  97: ['a3_temple4'],
  98: ['a3_temple5'],
  99: ['a3_temple6'],
  100: ['a3_durance1'],
  101: ['a3_durance2'],
  102: ['mephisto'],
  104: ['a4_steppes'],
  105: ['a4_plains'],
  106: ['a4_city'],
  107: ['a4_river', 'river'],
  110: ['a5_foothills'],
  111: ['a5_highlands', 'eldritch'],
  112: ['a5_plateau'],
  113: ['a5_crystal1'],
  114: ['a5_river'],
  115: ['a5_crystal2'],
  116: ['a5_echo'],
  117: ['a5_tundra'],
  118: ['a5_glacial1'],
  119: ['a5_glacial2'],
  121: ['pindleskin'],
  122: ['a5_anguish'],
  123: ['a5_death'],
  124: ['nihlathak'],
  125: ['a5_abaddon'],
  126: ['a5_acheron'],
  127: ['a5_infernal'],
  128: ['a5_keep1'],
  129: ['a5_keep2'],
  130: ['a5_keep3'],
  131: ['baal'],
};
const zoneGroups: Record<string, [number, number][]> = {};
for (const r of rows('levels')) {
  const zones = LEVEL_ZONES[num(r.Id)];
  if (!zones) continue;
  const g: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const grp = num(r[`ObjGrp${i}`]);
    const pr = num(r[`ObjPrb${i}`]);
    if (grp && pr && groups[grp]) g.push([grp, pr]);
  }
  for (const z of zones) zoneGroups[z] = g;
}
const usedGroups = new Set(Object.values(zoneGroups).flatMap((g) => g.map(([n]) => n)));

const j = (v: unknown) =>
  JSON.stringify(v)
    .replace(/"([a-z_0-9]+)":/g, '$1:')
    .replace(/"/g, "'");
const out = `/**
 * Objets interactifs de Diablo II. Généré par tools/audit/gen-world-objects.ts (objects.txt, objgroup.txt, Levels.txt du patch 1.13 ; obj.txt : table de Diablo II redistribuée par Riiablo, non couverte par sa licence Apache-2.0).
 * Genres : chest, sarcophagus, barrel, urn (urnes, jarres, paniers), corpse (cadavres, caisses, cachettes, nids, cocons), rack / armor (râteliers),
 * shrine (sanctuaire « magique »), shrine_health, shrine_mana, well (puits), q_… (objets de quête), qchest_… (coffres dorés des quêtes).
 */

/** Objets posés par les DS1 : « acte:identifiant » → genre */
export const DS1_OBJECTS: Record<string, string> = ${j(ds1)};

/** Groupes d'objects (objgroup.txt) : genres pondérés et densité */
export const OBJ_GROUPS: Record<number, { ids: [string, number][]; density: number }> = ${j(Object.fromEntries(Object.entries(groups).filter(([k]) => usedGroups.has(Number(k)))))};

/** Groupes semés dans chaque zone (Levels.txt ObjGrp / ObjPrb : chance par pièce, en %) */
export const ZONE_OBJ_GROUPS: Record<string, [number, number][]> = ${j(zoneGroups)};
`;
writeFileSync('src/data/worldobjects.ts', out);
execSync('npx prettier --write src/data/worldobjects.ts');
console.log(`DS1 : ${Object.keys(ds1).length} objets, groupes : ${usedGroups.size}, zones : ${Object.keys(zoneGroups).length}`);
