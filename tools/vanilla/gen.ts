/**
 * Tables Diablo II vanilla (LoD 1.13c) de la base, régénérées depuis les MPQ du joueur (lot M6) : contrôle (défaut) ou écriture.
 *
 *   npm run vanilla                      contrôle : chaque table de la base est-elle exactement ce que donnent les MPQ ? (code 1 sinon)
 *   npm run vanilla -- --write           réécrit les tables de la base depuis les MPQ
 *   npm run vanilla -- runes,bases       tables choisies (runes, bases, uniques, sets, levels, treasure, monsters, rules, classes, affixes, runewords, cube, skills, mercs)
 *
 * Tables : `runes` (lignes RUNES de runes.ts et effets des gemmes GEM_MODS), `bases` (bases-classes.ts en entier ; valeurs D2 des bases écrites à la main de bases.ts,
 * uniques.ts, sets.ts : niveaux, prérequis, dégâts, défense, blocage, châsses), `uniques` (uniques-d2.ts), `sets` (sets-d2.ts), `levels`
 * (levels-a{1,2,3,5}.ts et superuniques.ts, par les générateurs tools/audit/gen-levels-a*.ts : Levels.txt, SuperUniques.txt ; blocs
 * générés des niveaux des runs de runs.ts et des étapes de zones/act1.ts, tools/vanilla/levels.ts), `treasure`
 * (bloc généré de treasure.ts : classes de trésor de TreasureClassEx.txt dans le modèle du moteur, tools/vanilla/treasure.ts), `monsters`
 * (monsters-fidelity.ts et monsters-d2.ts, par les générateurs tools/audit/gen-monster-fidelity.ts et gen-monsters-d2.ts : MonStats.txt,
 * MonUMod.txt, SuperUniques.txt), `rules` (constantes des règles de la base, src/mods/d2/tables.ts : DifficultyLevels.txt, colonnes de
 * combat de MonStats.txt, facteurs de CharStats.txt, tools/vanilla/rules.ts), \`classes\` (caractéristiques des classes de
 * src/data/classes.ts écrites à leur place : CharStats.txt), `affixes` (affixes-d2.ts et itemtypes-d2.ts : MagicPrefix.txt, MagicSuffix.txt,
 * ItemTypes.txt, tools/vanilla/affixes.ts), `runewords` (runewords-d2.ts : Runes.txt, tools/vanilla/runewords.ts), `cube`
 * (cube-d2.ts : amélioration des runes et artisanat de CubeMain.txt, tools/vanilla/cube.ts), `skills` (skills-d2.ts : arbres des 7 classes de
 * Skills.txt et SkillDesc.txt, tools/vanilla/skills.ts), `mercs` (mercs-d2.ts : lignes d'embauche de Hireling.txt, lot M10d). Ce qui
 * n'est pas D2 (noms affichés, icônes, prix, implicites, poids) est repris du fichier tel quel. Les valeurs Project Diablo 2 sont un patch
 * du mod (mods/pd2/data/**.patch.ts, mods/pd2/tools/vanilla-diff.ts). Sans MPQ (D2_PRIVATE_DIR), l'outil s'arrête sans rien faire.
 * Les données produites sont des tables dérivées de Diablo II (en-tête SPDX LicenseRef-D2-Derived-Data, LICENSE-DATA.md) ; les fichiers
 * .txt des MPQ ne sont jamais écrits.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { D2_HEADER, IN_DIR } from '../audit/common';
import type { StatRoll } from '../../src/data/types';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ITEMS = join(ROOT, 'src/data/items');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ALL = ['runes', 'bases', 'uniques', 'sets', 'levels', 'treasure', 'monsters', 'rules', 'classes', 'affixes', 'runewords', 'cube', 'skills', 'mercs'];
const only = args.find((a) => !a.startsWith('--'));
const tables = only ? only.split(',') : ALL;
for (const t of tables) if (!ALL.includes(t)) throw new Error(`table inconnue : ${t} (${ALL.join(', ')})`);

if (!existsSync(join(IN_DIR, 'd2data.mpq'))) {
  console.log(`MPQ absents (${IN_DIR}) : rien à contrôler`);
  process.exit(0);
}

// les modules du jeu : contenu de la base (aucun jeu de règles activé : les tables sont celles des fichiers)
const { D2_UNIQUES } = await import('../../src/data/items/uniques-d2');
const { D2_SETS, D2_SET_ITEMS } = await import('../../src/data/items/sets-d2');
const { CLASS_BASES } = await import('../../src/data/items/bases-classes');
const { BASE_BY_ID } = await import('../../src/data/items/index');
const { QUEST_BASES } = await import('../../src/data/items/quest');
const V = await import('./items');
const VT = await import('./treasure');
const { JEWELRY_TC } = await import('../../src/data/treasure');
const { unsupported } = await import('./props');

const n = (v: number): string => String(Math.round(v * 1000) / 1000);
const q = (s: string): string => JSON.stringify(s);
/** `r(stat, min[, max][, param])` (uniques, sets) ou `f(stat, v[, param])` (runes) */
const roll = (s: StatRoll, fn: 'r' | 'f' = 'r'): string =>
  fn === 'f'
    ? `f(${q(s.stat)}, ${n(s.min)}${s.param ? `, ${q(s.param)}` : ''})`
    : `r(${q(s.stat)}, ${n(s.min)}${s.max !== s.min || s.param ? `, ${n(s.max)}` : ''}${s.param ? `, ${q(s.param)}` : ''})`;
const rolls = (l: StatRoll[], fn: 'r' | 'f' = 'r'): string => `[${l.map((s) => roll(s, fn)).join(', ')}]`;
/** Littéral d'une valeur simple (nombre, chaîne, booléen, tableau de nombres ou de chaînes) */
const lit = (v: unknown): string => (Array.isArray(v) ? `[${v.map(lit).join(', ')}]` : typeof v === 'string' ? q(v) : String(v));

async function fmt(file: string, text: string): Promise<string> {
  const cfg = (await prettier.resolveConfig(file)) ?? {};
  return prettier.format(text, { ...cfg, filepath: file });
}

const out = new Map<string, string>();
/** Texte (re)généré d'un fichier, formaté */
async function put(file: string, text: string): Promise<void> {
  out.set(file, await fmt(file, text));
}
const cur = (file: string): string => out.get(file) ?? readFileSync(file, 'utf8');

/** Bases d'objets du jeu, hors objets de quête (le Bâton horadrique, le Fléau de Khalim… ne sont pas des uniques du jeu) */
const quest = new Set(QUEST_BASES.map((b) => b.id));
const baseIds = new Set(Object.keys(BASE_BY_ID).filter((id) => !quest.has(id)));

if (tables.includes('uniques')) {
  const names = new Map(D2_UNIQUES.map((u) => [u.id, u.name]));
  const list = V.vanillaUniques(names, baseIds);
  const body = list.map((u) => `  { id: ${q(u.id)}, name: ${q(u.name)}, base: ${q(u.base)}, lvl: ${u.lvl}, reqLvl: ${u.reqLvl}, rarity: ${u.rarity}, mods: ${rolls(u.mods)} },`);
  await put(
    join(ITEMS, 'uniques-d2.ts'),
    `${D2_HEADER}/**
 * Objets uniques de Diablo II LoD 1.13c (UniqueItems.txt, ordre de la table). Généré par tools/vanilla/gen.ts (\`npm run vanilla -- --write\`)
 * depuis les MPQ du joueur : ne pas modifier à la main. Seules les propriétés appliquées par la simulation sont conservées ; les noms
 * affichés sont ceux du jeu. Valeurs Project Diablo 2 : patch du mod (mods/pd2/data/items/uniques.patch.ts).
 */
import type { StatRoll, UniqueDef } from '../types';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

export const D2_UNIQUES: UniqueDef[] = [
${body.join('\n')}
];
`,
  );
}

if (tables.includes('sets')) {
  const names = new Map<string, string>([...D2_SET_ITEMS.map((s) => [s.id, s.name] as const), ...D2_SETS.map((s) => [s.id, s.name] as const)]);
  const { items, sets } = V.vanillaSets(names, baseIds);
  const it = items.map((s) => {
    const p = s.partial ? `, partial: [${s.partial.map((x) => `{ count: ${x.count}${x.with ? `, with: ${lit(x.with)}` : ''}, mods: ${rolls(x.mods)} }`).join(', ')}]` : '';
    return `  { id: ${q(s.id)}, name: ${q(s.name)}, set: ${q(s.set)}, base: ${q(s.base)}, lvl: ${s.lvl}, reqLvl: ${s.reqLvl}, rarity: ${s.rarity}, mods: ${rolls(s.mods)}${p} },`;
  });
  const st = sets.map((s) => `  { id: ${q(s.id)}, name: ${q(s.name)}, items: ${lit(s.items)}, bonuses: [${s.bonuses.map((b) => `{ count: ${b.count}, mods: ${rolls(b.mods)} }`).join(', ')}] },`);
  await put(
    join(ITEMS, 'sets-d2.ts'),
    `${D2_HEADER}/**
 * Sets de Diablo II LoD 1.13c (Sets.txt, SetItems.txt, ordre des tables). Généré par tools/vanilla/gen.ts (\`npm run vanilla -- --write\`)
 * depuis les MPQ du joueur : ne pas modifier à la main. Seules les propriétés appliquées par la simulation sont conservées ; les noms
 * affichés sont ceux du jeu. Valeurs Project Diablo 2 : patch du mod (mods/pd2/data/items/sets.patch.ts).
 */
import type { SetDef, SetItemDef, StatRoll } from '../types';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

export const D2_SET_ITEMS: SetItemDef[] = [
${it.join('\n')}
];

export const D2_SETS: SetDef[] = [
${st.join('\n')}
];
`,
  );
}

if (tables.includes('affixes')) {
  // affixes magiques (MagicPrefix.txt, MagicSuffix.txt) et types d'objets qu'ils citent (ItemTypes.txt, type de chaque base du jeu)
  const VA = await import('./affixes');
  const { AFFIX_BY_ID } = await import('../../src/data/items/affixes');
  // noms affichés : ceux du jeu par identifiant, sinon ceux d'un affixe du jeu de même nom anglais (identifiant sans numéro de ligne)
  const byId = new Map(Object.values(AFFIX_BY_ID).map((a) => [a.id, a.name]));
  const bySlug = new Map<string, string>();
  for (const a of Object.values(AFFIX_BY_ID)) {
    const s = a.id.replace(/_[ps]\d+$/, '');
    if (s !== a.id && !bySlug.has(s)) bySlug.set(s, a.name);
  }
  const { affixes, dropped } = VA.vanillaAffixes((id) => byId.get(id) ?? bySlug.get(id.replace(/_[ps]\d+$/, '')));
  const t = (l: readonly string[] | undefined): string => q((l ?? []).map((x) => x.replace(/^d2:/, '')).join('|'));
  const body = affixes.map(
    (a) =>
      `  A(${q(a.id)}, ${q(a.name)}, '${a.kind[0]}', ${a.group.slice(1)}, ${a.level}, ${a.maxLevel ?? 0}, ${a.reqLvl}, ${a.freq}, ${a.rare ? 1 : 0}, ${t(a.types)}, ${t(a.excludeTypes)}, [${a.mods
        .map((m) => `r(${q(m.stat)}, ${n(m.min)}, ${n(m.max)}${m.param ? `, ${q(m.param)}` : ''})`)
        .join(', ')}]),`,
  );
  await put(
    join(ITEMS, 'affixes-d2.ts'),
    `${D2_HEADER}/**
 * Affixes magiques de Diablo II LoD 1.13c (MagicPrefix.txt puis MagicSuffix.txt, ordre des tables) : ceux qu'un objet de l'extension peut
 * tirer (\`spawnable\`, fréquence non nulle) et dont la simulation applique au moins une propriété. Généré par tools/vanilla/gen.ts
 * (\`npm run vanilla -- affixes --write\`) depuis les MPQ du joueur : ne pas modifier à la main. Valeurs Project Diablo 2 : patch du mod
 * (mods/pd2/data/items/affixes.patch.ts).
 * A(id, nom, p|s, groupe, alvl min, alvl max (0 : aucun), rlvl, fréquence, rare (1 : aussi sur les rares, 0 : magique seulement),
 *   types (itype : codes d'ItemTypes.txt, itemtypes-d2.ts), types exclus (etype), propriétés)
 * Lignes tirables écartées (aucune propriété appliquée : charges, endurance, réparation, quantité…) : ${dropped.length}.
 */
import type { AffixDef, StatRoll } from '../types';

const r = (stat: string, min: number, max: number, param?: string): StatRoll => (param ? { stat, min, max, param } : { stat, min, max });
const d2 = (types: string): string[] => (types ? types.split('|').map((x) => \`d2:\${x}\`) : []);
function A(id: string, name: string, k: 'p' | 's', group: number, level: number, maxLevel: number, reqLvl: number, freq: number, rare: 0 | 1, types: string, exclude: string, mods: StatRoll[]): AffixDef {
  const a: AffixDef = { id, name, kind: k === 'p' ? 'prefix' : 'suffix', group: \`g\${group}\`, level, reqLvl, freq, types: d2(types), mods, rare: rare === 1 };
  if (maxLevel) a.maxLevel = maxLevel;
  if (exclude) a.excludeTypes = d2(exclude);
  return a;
}

export const D2_AFFIXES: AffixDef[] = [
${body.join('\n')}
];
`,
  );
  const types = VA.vanillaItemTypes();
  const baseTypes = VA.vanillaBaseItemTypes(new Set(Object.keys(BASE_BY_ID)));
  await put(
    join(ITEMS, 'itemtypes-d2.ts'),
    `${D2_HEADER}/**
 * Types d'objets de Diablo II LoD 1.13c (ItemTypes.txt) : chaque code et les types dont il hérite (Equiv1, Equiv2), et le type de chaque base
 * du jeu tirée des tables d'objets (Weapons.txt, Armor.txt, Misc.txt). Résout les types des affixes vanilla (\`d2:<code>\`, affixes.ts).
 * Généré par tools/vanilla/gen.ts (\`npm run vanilla -- affixes --write\`) depuis les MPQ du joueur : ne pas modifier à la main. Module feuille.
 */

/** Code d'ItemTypes.txt → types parents (Equiv1, Equiv2) */
export const D2_ITEM_TYPES: Record<string, readonly string[]> = {
${Object.entries(types)
  .map(([k, v]) => `  ${/^[a-z_]\w*$/.test(k) ? k : q(k)}: ${lit(v)},`)
  .join('\n')}
};

/** Base du jeu → code d'ItemTypes.txt (colonne \`type\` de sa ligne de Weapons.txt, Armor.txt ou Misc.txt) */
export const D2_BASE_TYPES: Record<string, string> = {
${Object.entries(baseTypes)
  .map(([k, v]) => `  ${k}: ${q(v)},`)
  .join('\n')}
};
`,
  );
}

if (tables.includes('runewords')) {
  // mots runiques complets de Runes.txt ; noms affichés : ceux du jeu par identifiant
  const VW = await import('./runewords');
  const { RUNEWORD_BY_ID } = await import('../../src/data/items/runewords');
  const { RUNE_BY_ID } = await import('../../src/data/items/runes');
  const { runewords, dropped } = VW.vanillaRunewords(
    (id) => RUNEWORD_BY_ID[id]?.name,
    (id) => {
      const r = RUNE_BY_ID[id];
      if (!r) throw new Error(`rune inconnue : ${id}`);
      return r.reqLvl;
    },
  );
  const t = (l: readonly string[] | undefined): string => q((l ?? []).map((x) => x.replace(/^d2:/, '')).join('|'));
  const body = runewords.map((w) => `  rw(${q(w.id)}, ${q(w.name)}, ${q(w.runes.join(' '))}, ${t(w.types)}, ${t(w.excludeTypes)}, ${w.reqLvl}, ${rolls(w.mods)}),`);
  await put(
    join(ITEMS, 'runewords-d2.ts'),
    `${D2_HEADER}/**
 * Mots runiques de Diablo II LoD 1.13c (Runes.txt, lignes \`complete\`, ordre de la table). Généré par tools/vanilla/gen.ts
 * (\`npm run vanilla -- runewords --write\`) depuis les MPQ du joueur : ne pas modifier à la main. Seules les propriétés appliquées par la
 * simulation sont conservées${dropped.length ? ` (mots runiques sans aucune : ${dropped.join(', ')})` : ''} ; noms affichés : ceux du jeu. Valeurs Project Diablo 2 : patch du
 * mod (mods/pd2/data/items/runewords.patch.ts).
 * rw(id, nom, runes (r01 … r33, dans l'ordre), types (itype : codes d'ItemTypes.txt, itemtypes-d2.ts), types exclus (etype), niveau requis
 *   (celui de la rune la plus haute), propriétés)
 */
import type { RunewordDef, StatRoll } from '../types';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });
const d2 = (types: string): string[] => (types ? types.split('|').map((x) => \`d2:\${x}\`) : []);
function rw(id: string, name: string, runes: string, types: string, exclude: string, reqLvl: number, mods: StatRoll[]): RunewordDef {
  const w: RunewordDef = { id, name, runes: runes.split(' '), types: d2(types), reqLvl, mods };
  if (exclude) w.excludeTypes = d2(exclude);
  return w;
}

export const D2_RUNEWORDS: RunewordDef[] = [
${body.join('\n')}
];
`,
  );
}

if (tables.includes('cube')) {
  // amélioration des runes et artisanat de CubeMain.txt (recettes d'une partie solo de l'extension)
  const VC = await import('./cube');
  const { craftSlot } = await import('../../src/data/cube');
  const { TYPE_GROUPS } = await import('../../src/data/types');
  const ups = VC.vanillaRuneUpgrades();
  const crafts = VC.vanillaCrafts((id) => {
    const b = BASE_BY_ID[id];
    return b ? craftSlot(b.type, TYPE_GROUPS.weapon.includes(b.type)) : null;
  });
  await put(
    join(ROOT, 'src/data/cube-d2.ts'),
    `${D2_HEADER}/**
 * Recettes du Cube horadrique de Diablo II LoD 1.13c construites depuis CubeMain.txt (recettes actives d'une partie solo de l'extension :
 * \`enabled\`, hors \`ladder\`) : amélioration des runes et artisanat. Généré par tools/vanilla/gen.ts (\`npm run vanilla -- cube --write\`)
 * depuis les MPQ du joueur : ne pas modifier à la main. Les recettes de la base (src/data/cube.ts) en sont construites ; les autres recettes
 * de la base sont contrôlées contre la table par tests/unit/vanilla-cube.test.ts. Module feuille.
 */
import type { StatRoll } from './types';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

/** Amélioration des runes : rune, nombre, gemme en plus (à partir de Thul), rune obtenue */
export const D2_RUNE_UPGRADES: readonly { from: string; n: number; gem?: string; to: string }[] = [
${ups.map((u) => `  { from: ${q(u.from)}, n: ${u.n}, ${u.gem ? `gem: ${q(u.gem)}, ` : ''}to: ${q(u.to)} },`).join('\n')}
];

/**
 * Artisanat : famille → emplacement → rune et gemme parfaite de la recette, objets acceptés (bases du jeu : celle de la recette et ses
 * versions exceptionnelle et élite ; ou codes \`d2:\` d'ItemTypes.txt), propriétés fixes de l'objet d'artisan
 */
export const D2_CRAFTS: Readonly<Record<string, Readonly<Record<string, { rune: string; gem: string; accept: readonly string[]; mods: readonly StatRoll[] }>>>> = {
${Object.entries(crafts)
  .map(
    ([fam, slots]) =>
      `  ${fam}: {\n${Object.entries(slots)
        .map(([slot, c]) => `    ${slot}: { rune: ${q(c.rune)}, gem: ${q(c.gem)}, accept: ${lit(c.accept)}, mods: ${rolls(c.mods)} },`)
        .join('\n')}\n  },`,
  )
  .join('\n')}
};
`,
  );
}

if (tables.includes('runes')) {
  const file = join(ITEMS, 'runes.ts');
  const text = cur(file);
  const start = text.indexOf('export const RUNES: RuneDef[] = [\n');
  const end = text.indexOf('\n];\n', start);
  if (start < 0 || end < 0) throw new Error('runes.ts : table RUNES introuvable');
  const body = V.vanillaRunes().map(
    (r) =>
      `  { id: ${q(r.id)}, name: ${q(r.name)}, rank: ${r.rank}, ${r.qlvl !== undefined ? `qlvl: ${r.qlvl}, ` : ''}reqLvl: ${r.reqLvl}, weapon: ${rolls(r.weapon, 'f')}, armor: ${rolls(r.armor, 'f')}, shield: ${rolls(r.shield, 'f')} },`,
  );
  let next = `${text.slice(0, start)}export const RUNES: RuneDef[] = [\n${body.join('\n')}${text.slice(end)}`;
  // gemmes : table GEM_MODS (identifiant → effets par emplacement)
  const gs = next.indexOf('const GEM_MODS: Record<');
  const gb = next.indexOf('= {\n', gs) + 4;
  const ge = next.indexOf('\n};\n', gb);
  if (gs < 0 || ge < 0) throw new Error('runes.ts : table GEM_MODS introuvable');
  const gems = Object.entries(V.vanillaGems()).map(([id, g]) => `  ${id}: { weapon: ${rolls(g.weapon, 'f')}, armor: ${rolls(g.armor, 'f')}, shield: ${rolls(g.shield, 'f')} },`);
  next = `${next.slice(0, gb)}${gems.join('\n')}${next.slice(ge)}`;
  await put(file, next);
}

if (tables.includes('bases')) {
  const classIds = new Set(CLASS_BASES.map((b) => b.id));
  const hand = new Set([...baseIds].filter((id) => !classIds.has(id)));
  const names = new Map(CLASS_BASES.map((b) => [b.id, b.name]));
  const list = V.vanillaClassBases(names, hand);
  const KEYS = [
    'id',
    'name',
    'type',
    'classOnly',
    'tier',
    'qlvl',
    'reqLvl',
    'reqStr',
    'reqDex',
    'dmg',
    'twoHanded',
    'missileDmg',
    'defense',
    'block',
    'maxSockets',
    'socketTiers',
    'icon',
    'generated',
  ];
  const body = list.map((b) => {
    const rec = b as unknown as Record<string, unknown>;
    for (const k of Object.keys(rec)) if (!KEYS.includes(k)) throw new Error(`base ${b.id} : champ ${k} non prévu`);
    return `  mk({ ${KEYS.filter((k) => rec[k] !== undefined)
      .map((k) => `${k}: ${lit(rec[k])}`)
      .join(', ')} }),`;
  });
  const file = join(ITEMS, 'bases-classes.ts');
  await put(
    file,
    `${D2_HEADER}/**
 * Bases d'objets de Diablo II LoD 1.13c pour toutes les classes (Weapons.txt puis Armor.txt, hors bases écrites à la main de bases.ts) :
 * armes (épées, haches, masses, sceptres, dagues, armes de jet, javelots, lances, armes d'hast, arcs, arbalètes, griffes), casques
 * primitifs du Barbare, boucliers auriques du Paladin, têtes du Nécromancien et armures des trois paliers ; châsses par palier d'ilvl
 * d'ItemTypes.txt. Généré par tools/vanilla/gen.ts (\`npm run vanilla -- --write\`) depuis les MPQ du joueur : ne pas modifier à la main.
 * Valeurs Project Diablo 2 : patch du mod (mods/pd2/data/items/bases.patch.ts).
 */
import type { ItemBase } from '../types';
import { mk } from './bases-make';

export const CLASS_BASES: ItemBase[] = [
${body.join('\n')}
];
`,
  );
  // bases écrites à la main : seules les valeurs D2 sont réécrites, à leur place (un champ absent est ajouté à la fin de l'entrée)
  for (const f of ['bases.ts', 'uniques.ts', 'sets.ts']) {
    const path = join(ITEMS, f);
    let text = cur(path);
    for (const id of hand) {
      const at = text.indexOf(`id: '${id}',`);
      if (at < 0) continue;
      const b = BASE_BY_ID[id];
      const fields = V.vanillaHandFields(id, !!b.twoHanded);
      if (!fields) continue;
      // bloc de l'entrée : jusqu'à l'entrée suivante ou à la fin de la table
      const ends = [text.indexOf('\n  mk(', at), text.indexOf('\n  {\n', at), text.indexOf('\n  /*', at), text.indexOf('\n];', at)].filter((e) => e > 0);
      const end = Math.min(...ends);
      let block = text.slice(at, end);
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        const re = new RegExp(`\\b${k}: (\\[[^\\]]*\\]|-?\\d+)`);
        if (re.test(block)) block = block.replace(re, `${k}: ${lit(v)}`);
        else {
          // ajout : après les châsses, ou en fin d'objet (avant « }) » de mk ou « } » d'un littéral)
          const ms = /\bmaxSockets: -?\d+/.exec(block);
          if (k === 'socketTiers' && ms) {
            const pos = ms.index + ms[0].length;
            block = `${block.slice(0, pos)}, ${k}: ${lit(v)}${block.slice(pos)}`;
          } else {
            const close = block.lastIndexOf('}');
            block = `${block.slice(0, close).replace(/[\s,]+$/, '')}, ${k}: ${lit(v)} ${block.slice(close)}`;
          }
        }
      }
      text = text.slice(0, at) + block + text.slice(end);
    }
    await put(path, text);
  }
}

if (tables.includes('levels')) {
  // niveaux de zone et super-uniques : générateurs tools/audit/gen-levels-a{1,2,3,5}.ts, lancés vers un dossier temporaire
  const tmp = mkdtempSync(join(process.env.FP_TMP ?? tmpdir(), 'vanilla-levels-'));
  try {
    for (const a of [1, 2, 3, 5]) execFileSync(process.execPath, ['--import', 'tsx', join(ROOT, `tools/audit/gen-levels-a${a}.ts`), tmp], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    for (const f of ['levels-a1.ts', 'levels-a2.ts', 'levels-a3.ts', 'levels-a5.ts', 'superuniques.ts']) await put(join(ROOT, 'src/data', f), readFileSync(join(tmp, f), 'utf8'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  // niveaux écrits dans le code des runs et des étapes construites à part : blocs générés de runs.ts et zones/act1.ts
  const VL = await import('./levels');
  for (const [file, name, ids] of [
    ['src/data/runs.ts', 'D2_ZONE_LVL', VL.RUN_LEVEL_IDS],
    ['src/data/zones/act1.ts', 'D2_LVL', VL.A1_LEVEL_IDS],
  ] as const) {
    const path = join(ROOT, file);
    const text = cur(path);
    const head = `const ${name}: Record<string, [number, number, number]> = {\n`;
    const start = text.indexOf(head);
    const end = text.indexOf('\n};\n/* ---- fin du bloc généré ---- */', start);
    if (start < 0 || end < 0) throw new Error(`${file} : bloc ${name} introuvable`);
    const lv = VL.vanillaZoneLevels(ids);
    await put(
      path,
      `${text.slice(0, start + head.length)}${Object.entries(lv)
        .map(([k, l]) => `  ${k}: [${l.join(', ')}],`)
        .join('\n')}${text.slice(end)}`,
    );
  }
}

if (tables.includes('monsters')) {
  // fidélité des monstres, monstres ajoutés des zones de farm : générateurs tools/audit/gen-monster-fidelity.ts et gen-monsters-d2.ts
  const tmp = mkdtempSync(join(process.env.FP_TMP ?? tmpdir(), 'vanilla-monsters-'));
  try {
    for (const g of ['gen-monster-fidelity.ts', 'gen-monsters-d2.ts'])
      execFileSync(process.execPath, ['--import', 'tsx', join(ROOT, 'tools/audit', g), tmp], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    for (const f of ['monsters-fidelity.ts', 'monsters-d2.ts']) await put(join(ROOT, 'src/data', f), readFileSync(join(tmp, f), 'utf8'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (tables.includes('treasure')) {
  const file = join(ROOT, 'src/data/treasure.ts');
  const text = cur(file);
  const START = '/** Poids de récursion des TC de runes';
  const END = '\n/* ---- fin du bloc généré ---- */';
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 || end < 0) throw new Error('treasure.ts : bloc généré introuvable');
  const { tcs, absent } = VT.vanillaTreasure(new Set(Object.keys(BASE_BY_ID)), new Set(D2_UNIQUES.map((u) => u.id)));
  const { good, jewelry } = VT.vanillaGood();
  const rr = VT.vanillaRuneRecursion();
  // TC « Jewelry » : poids de la table, dans l'ordre des entrées du fichier (l'ordre d'une table pondérée ne change pas sa loi)
  const jw = new Map(jewelry.map((e) => [e.ref, e.weight]));
  if (jw.size !== JEWELRY_TC.length || JEWELRY_TC.some((e) => !jw.has(e.ref))) throw new Error('treasure.ts : JEWELRY_TC ne contient pas les objets de « Jewelry C »');
  const entry = (e: { ref: string; weight: number }): string => `{ ref: ${q(e.ref)}, weight: ${e.weight} }`;
  const tc = (t: (typeof tcs)[number]): string =>
    `  ${t.id}: { id: ${q(t.id)}, picks: ${t.picks}, noDrop: ${t.noDrop}, ${t.mods ? `mods: { unique: ${t.mods.unique}, set: ${t.mods.set}, rare: ${t.mods.rare}, magic: ${t.mods.magic} }, ` : ''}entries: [${t.entries.map(entry).join(', ')}] },`;
  const block = `${START} (Runes N → Runes N−1), 1.13 */
export const RUNE_TC_RECURSION = [${rr.recursion.join(', ')}];
export const RUNES17_ZOD = ${rr.zod};
export const RUNES17_RECURSION = ${rr.rec17};

/** Contenu du TC « Good » (Act 5 (H) Good : bijoux, gemmes, runes ; gemmes et runes détaillées par GOOD_GEMS et ZONE_RUNE_TC) */
export const GOOD_TC = { jewelry: ${good.jewelry}, gems: ${good.gems}, runes: ${good.runes} };
/** Contenu du TC « Jewelry » */
export const JEWELRY_TC: TcEntry[] = [${JEWELRY_TC.map((e) => entry({ ref: e.ref, weight: jw.get(e.ref)! })).join(', ')}];

/**
 * Classes de trésor par clé : rangs (structure de l'Enfer de l'Acte V), boss (clé + difficulté : TC propre de MonStats ou du super-unique),
 * TC partagées du moteur (junk, misc, magic, cpot). Objets D2 absents du jeu (entrées \`d2:…\`, sans objet) : ${[...absent].sort().join(', ')}.
 */
export const MONSTER_TC: Record<string, TreasureClass> = {
${tcs.map(tc).join('\n')}
};
`;
  await put(file, text.slice(0, start) + block + text.slice(end));
}

if (tables.includes('rules')) {
  // constantes des règles vanilla de la base (lot M8) : DifficultyLevels.txt, Drain et coldeffect de MonStats.txt par monstre du jeu
  const VR = await import('./rules');
  const { MONSTER_FIDELITY } = await import('../../src/data/monsters-fidelity');
  const dl = VR.difficultyLevels();
  const mc = VR.monsterCombat(MONSTER_FIDELITY);
  const cs = VR.classStats();
  const tri = (t: number[]): string => `[${t.join(', ')}]`;
  await put(
    join(ROOT, 'src/mods/d2/tables.ts'),
    `${D2_HEADER}/**
 * Constantes des règles de la base (Diablo II LoD 1.13c, src/mods/d2) : colonnes de DifficultyLevels.txt, colonnes de combat de
 * MonStats.txt et facteurs de CharStats.txt. Généré par tools/vanilla/gen.ts (\`npm run vanilla -- rules --write\`) depuis les MPQ du joueur : ne pas modifier à la main.
 * Module feuille.
 */
type Tri = readonly [number, number, number];

/** DifficultyLevels.txt : une valeur par difficulté (Normal, Cauchemar, Enfer) */
export const D2_DIFFICULTY = {
${Object.entries(dl)
  .map(([k, v]) => `  ${k}: ${tri(v)},`)
  .join('\n')}
} as const satisfies Record<string, Tri>;

/**
 * MonStats.txt, par monstre du jeu (sa ligne principale, \`MonsterFidelity.d2\`) et par difficulté : \`drain\` (Drain : efficacité du vol de
 * vie et de mana, %), \`cold\` (coldeffect : ralentissement du froid, % négatif ; 0 ou plus : ni ralenti ni gelé), \`boss\` (drapeau boss :
 * coup écrasant au huitième, jamais gelé, dégâts réduits du mercenaire)
 */
export const D2_MONSTER_COMBAT: Record<string, { drain: Tri; cold: Tri; boss?: true }> = {
${Object.entries(mc)
  .map(([k, v]) => `  ${k}: { drain: ${tri(v.drain)}, cold: ${tri(v.cold)}${v.boss ? ', boss: true' : ''} },`)
  .join('\n')}
};

/**
 * CharStats.txt, par classe : \`toHitFactor\` (ajouté au score d'attaque), \`blockFactor\` (ajouté au blocage avec un bouclier),
 * \`manaRegen\` (secondes pour remplir la réserve de mana sans bonus)
 */
export const D2_CLASS: Record<string, { toHitFactor: number; blockFactor: number; manaRegen: number }> = {
${Object.entries(cs)
  .map(([k, v]) => `  ${k}: { toHitFactor: ${v.toHitFactor}, blockFactor: ${v.blockFactor}, manaRegen: ${v.manaRegen} },`)
  .join('\n')}
};
`,
  );
}

if (tables.includes('classes')) {
  // caractéristiques des classes (CharStats.txt) écrites à leur place dans src/data/classes.ts : départ, vie, mana, gains par niveau et par
  // point, endurance ; le reste du fichier (arbres, paliers, présentation) est repris tel quel
  const VR = await import('./rules');
  const file = join(ROOT, 'src/data/classes.ts');
  let text = cur(file);
  for (const [id, v] of Object.entries(VR.classStats())) {
    const start = text.indexOf(`\n  ${id}: {\n`);
    if (start < 0) throw new Error(`classes.ts : classe ${id} absente`);
    const end = text.indexOf('\n    trees:', start);
    let block = text.slice(start, end);
    const set = (k: string, val: string): void => {
      const re = new RegExp(`(\\n    ${k}: )[^\\n]*,`);
      if (!re.test(block)) throw new Error(`classes.ts : ${id}.${k} absent`);
      block = block.replace(re, `$1${val},`);
    };
    set('base', `{ str: ${v.str}, dex: ${v.dex}, vit: ${v.vit}, ene: ${v.ene} }`);
    for (const k of ['life', 'mana', 'lifePerLevel', 'lifePerVit', 'manaPerLevel', 'manaPerEne', 'stamina', 'staminaPerLevel', 'staminaPerVit', 'runDrain'] as const) set(k, n(v[k]));
    text = text.slice(0, start) + block + text.slice(end);
  }
  await put(file, text);
}

if (tables.includes('skills')) {
  // arbres de compétences des 7 classes (Skills.txt, SkillDesc.txt) : identité, place dans l'arbre, prérequis, synergies
  const VS = await import('./skills');
  const list = VS.vanillaSkills();
  /** Chiffre écrit : `[base, par niveau]`, `R(…)` (paliers de D2), `T([…])` (table), ou un nombre */
  /** 4 décimales (tiers d'unité des rayons, fractions de 1/256 des dégâts) */
  const n4 = (v: number): string => String(Math.round(v * 1e4) / 1e4);
  const num = (v: import('./skills-numbers').NumVal): string =>
    'lin' in v ? `[${v.lin.map(n4).join(', ')}]` : 'ramp' in v ? `R(${v.ramp.map(n4).join(', ')})` : 'tab' in v ? `T([${v.tab.map(n4).join(', ')}])` : n4(v.scalar);
  const body = list.map(
    (s) =>
      `  { id: ${q(s.id)}, d2Id: ${s.d2Id}, tree: ${q(s.tree)}, row: ${s.row}, col: ${s.col}, reqLvl: ${s.reqLvl}, prereqs: ${lit(s.prereqs)}, synergies: [${s.synergies.map((x) => `{ skill: ${q(x.skill)}, pct: ${n(x.pct)}, what: ${q(x.what)} }`).join(', ')}]${
        s.n
          ? `, n: { ${Object.entries(s.n)
              .map(([k, v]) => `${k}: ${num(v)}`)
              .join(', ')} }`
          : ''
      } },`,
  );
  await put(
    join(ROOT, 'src/data/skills-d2.ts'),
    `${D2_HEADER}/**
 * Arbres de compétences de Diablo II LoD 1.13c : les 210 compétences des 7 classes (Skills.txt, ordre de la table ; SkillDesc.txt).
 * Généré par tools/vanilla/gen.ts (\`npm run vanilla -- --write skills\`, tools/vanilla/skills.ts) depuis les MPQ du joueur : ne pas
 * modifier à la main. \`d2Id\` : ligne \`Id\` de Skills.txt (indice des compétences d'un fichier .d2s) ; \`col\` : SkillColumn − 1 ;
 * synergies : lignes de SkillDesc.txt que la simulation applique (dégâts, absorption, durée du gel), valeur par point investi ; \`n\` :
 * chiffres par niveau de Skills.txt et Missiles.txt dans les unités du moteur (tools/vanilla/skills-numbers.ts : sources, unités).
 * Le reste de chaque compétence (nom affiché, description, cible, portée, chiffres) est dans les fichiers de classe (skills-<classe>.ts,
 * skills.ts) ; arbres Project Diablo 2 : patch du mod (mods/pd2/data/skills.patch.ts).
 */
import type { SkillDef, SkillTree } from './types';
import type { SkillNumbers } from './skill-types';
import { R, T } from './ramp';

/** Place d'une compétence de Diablo II dans l'arbre de sa classe, et ses chiffres par niveau (classes faites, lots M9b à M9h) */
export interface D2SkillTree {
  id: string;
  d2Id: number;
  tree: SkillTree;
  row: number;
  col: number;
  reqLvl: number;
  prereqs: string[];
  synergies: SkillDef['synergies'];
  n?: Partial<SkillNumbers>;
}

void R;
void T;

export const D2_SKILL_TREE: D2SkillTree[] = [
${body.join('\n')}
];
`,
  );
}

if (tables.includes('mercs')) {
  // mercenaires : lignes d'embauche de l'extension (Version 100) de Hireling.txt, une par sous-type, difficulté et palier de niveau
  const { rows: txt, num: nn } = await import('../audit/common');
  const VS = await import('./skills');
  const byD2 = new Map(VS.vanillaSkills().map((s) => [s.d2Id, s.id]));
  const skillId = new Map(txt('Skills').map((r) => [r.skill!.toLowerCase(), byD2.get(nn(r.Id))]));
  const AURAS = new Set(['prayer', 'defiance', 'blessed_aim', 'thorns', 'holy_freeze', 'might']);
  const variantOf = (r: Record<string, string | undefined>, skills: string[]): string => {
    const act = nn(r.Act);
    if (act === 2) return skills.find((x) => AURAS.has(x))!;
    if (act === 5) return 'bash';
    const st = (r.SubType ?? '').toLowerCase();
    return st.startsWith('fire') ? 'fire' : st.startsWith('ice') || st.startsWith('cold') ? 'cold' : 'light';
  };
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const r of txt('Hireling')) {
    if (r.Version !== '100') continue;
    const skills: string[] = [];
    const sk: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const name = r[`Skill${i}`];
      if (!name) continue;
      const id = skillId.get(name.toLowerCase());
      if (!id) throw new Error(`Hireling.txt : compétence inconnue ${name}`);
      skills.push(id);
      sk.push(
        `{ id: ${q(id)}, mode: ${nn(r[`Mode${i}`])}, chance: ${nn(r[`Chance${i}`])}, chancePerLvl: ${nn(r[`ChancePerLvl${i}`])}, level: ${nn(r[`Level${i}`])}, lvlPerLvl: ${nn(r[`LvlPerLvl${i}`])} }`,
      );
    }
    const variant = variantOf(r, skills);
    const difficulty = nn(r.Difficulty) - 1;
    // Barbares : deux sous-types identiques par difficulté (épée à une ou deux mains, même ligne) : le premier seulement
    const key = `${r.Act}/${variant}/${difficulty}/${r.Level}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const f = (k: string): number => nn(r[k]);
    lines.push(
      `  { id: ${f('Id')}, act: ${f('Act')}, variant: ${q(variant)}, difficulty: ${difficulty}, level: ${f('Level')}, gold: ${f('Gold')}, hp: ${f('HP')}, hpLvl: ${f('HP/Lvl')}, def: ${f('Defense')}, defLvl: ${f('Def/Lvl')}, str: ${f('Str')}, strLvl: ${f('Str/Lvl')}, dex: ${f('Dex')}, dexLvl: ${f('Dex/Lvl')}, ar: ${f('AR')}, arLvl: ${f('AR/Lvl')}, dmin: ${f('Dmg-Min')}, dmax: ${f('Dmg-Max')}, dmgLvl: ${f('Dmg/Lvl')}, res: ${f('Resist')}, resLvl: ${f('Resist/Lvl')}, defaultChance: ${f('DefaultChance')}, skills: [${sk.join(', ')}] },`,
    );
  }
  await put(
    join(ROOT, 'src/data/mercs-d2.ts'),
    `${D2_HEADER}/**
 * Mercenaires de Diablo II LoD 1.13c : lignes d'embauche de l'extension de Hireling.txt (Version 100), une par sous-type, difficulté
 * d'embauche et palier de niveau (lot M10d). Généré par tools/vanilla/gen.ts (\`npm run vanilla -- --write mercs\`) depuis les MPQ du
 * joueur : ne pas modifier à la main. \`id\` : colonne Id (ligne d'embauche) ; \`variant\` : sous-type du moteur (aura de l'acte II,
 * élément des actes I et III, \`bash\` à l'acte V : les deux sous-types identiques des Barbares n'en font qu'un) ; \`difficulty\` : 0 à 2 ;
 * gains par niveau : Str/Lvl, Dex/Lvl, Dmg/Lvl en huitièmes, Resist/Lvl en quarts, ChancePerLvl en quarts, LvlPerLvl en 32es
 * (MONSTERAI_UpdateMercStatsAndSkills de MonsterAI.cpp, AITHINK_Fn061_Hireable de AiThink.cpp, D2MOO).
 */

/** Ligne d'embauche de Hireling.txt */
export interface D2HirelingRow {
  id: number;
  act: number;
  variant: string;
  difficulty: number;
  level: number;
  gold: number;
  hp: number;
  hpLvl: number;
  def: number;
  defLvl: number;
  str: number;
  strLvl: number;
  dex: number;
  dexLvl: number;
  ar: number;
  arLvl: number;
  dmin: number;
  dmax: number;
  dmgLvl: number;
  res: number;
  resLvl: number;
  defaultChance: number;
  skills: { id: string; mode: number; chance: number; chancePerLvl: number; level: number; lvlPerLvl: number }[];
}

export const D2_HIRELINGS: D2HirelingRow[] = [
${lines.join('\n')}
];
`,
  );
}

let diff = 0;
for (const [file, text] of out) {
  const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (old === text) continue;
  diff++;
  if (WRITE) writeFileSync(file, text);
  else {
    const a = old.split('\n');
    const b = text.split('\n');
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    console.log(`${file.slice(ROOT.length)} : diffère des MPQ dès la ligne ${i + 1}\n  fichier : ${a[i] ?? '(fin)'}\n  MPQ     : ${b[i] ?? '(fin)'}`);
  }
}
if (args.includes('--report'))
  console.log(
    'propriétés D2 non converties :',
    [...unsupported].sort((x, y) => y[1] - x[1]),
  );
console.log(
  WRITE ? `${diff} fichier(s) réécrit(s) sur ${out.size}` : diff ? `${diff} fichier(s) sur ${out.size} différent(s) des MPQ` : `${out.size} fichier(s) identiques aux MPQ (${tables.join(', ')})`,
);
if (diff && !WRITE) process.exit(1);
