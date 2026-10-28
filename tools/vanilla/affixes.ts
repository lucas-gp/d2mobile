/**
 * Affixes magiques de Diablo II LoD 1.13c (MagicPrefix.txt, MagicSuffix.txt) et types d'objets (ItemTypes.txt) convertis dans les structures
 * du jeu (lot M10a). Rien n'est écrit ici : voir gen.ts (table `affixes`).
 *
 * Affixes retenus : ceux que le jeu peut tirer sur un objet de l'extension (D2MOO, ITEMS_RollMagicAffixesNew : `spawnable`, `frequency` non
 * nulle ; toutes les versions sont admises sur un objet de l'extension), dont au moins une propriété est appliquée par la simulation (les
 * autres propriétés de la ligne, comme les charges ou l'endurance, sont ignorées : `unsupported`). Identifiant : nom anglais sans « of » ni
 * « the » + `_p` / `_s` + numéro de ligne de la table (celui des tables du jeu, que Project Diablo 2 a gardé pour les lignes reprises).
 * Types : codes d'ItemTypes.txt préfixés `d2:` (`types` : itype1-7, `excludeTypes` : etype1-5), résolus par l'arbre `Equiv1/Equiv2`
 * (src/data/items/itemtypes-d2.ts). Noms affichés : ceux du jeu (`nameOf`), sinon string.tbl français des MPQ (forme masculine singulière), sinon
 * le nom anglais.
 */
import { existsSync } from 'node:fs';
import type { AffixDef, StatRoll } from '../../src/data/types';
import { Vfs } from '../d2import/vfs';
import { GameData } from '../d2import/data';
import { IN_DIR, PATCH, rows } from '../audit/common';
import { HAND_CODE, codeToBase } from './items';
import { convertProp, num } from './props';

/** Code d'ItemTypes.txt d'une colonne itype/etype : 4 caractères au plus, espaces retirés (« ring  », « staff » de la table → ring, staf) */
const code = (s: string | undefined): string => (s ?? '').trim().slice(0, 4).trim();

/** ItemTypes.txt : code → types dont il hérite (Equiv1, Equiv2) */
export function vanillaItemTypes(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of rows('itemtypes')) {
    const c = code(r.Code);
    if (c) out[c] = [code(r.Equiv1), code(r.Equiv2)].filter(Boolean);
  }
  return out;
}

/**
 * Type d'ItemTypes.txt de chaque base du jeu tirée des tables d'objets (Weapons.txt, Armor.txt, Misc.txt : anneaux, amulettes, charmes,
 * joyaux) : par le nom de la ligne (codeToBase), ou par son code pour les bases écrites à la main d'un autre identifiant (HAND_CODE)
 */
export function vanillaBaseItemTypes(bases: ReadonlySet<string>): Record<string, string> {
  const out: Record<string, string> = {};
  const map = codeToBase();
  const hand = new Map<string, string[]>();
  for (const [id, c] of Object.entries(HAND_CODE)) hand.set(c, [...(hand.get(c) ?? []), id]);
  for (const t of ['weapons', 'armor', 'misc'])
    for (const r of rows(t)) {
      const c = (r.code ?? '').trim();
      for (const id of [map.get(c)?.[0], ...(hand.get(c) ?? [])]) if (id !== undefined && bases.has(id) && out[id] === undefined) out[id] = code(r.type);
    }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Identifiant du jeu : nom anglais sans « of » / « the », comme les identifiants des affixes de Project Diablo 2 */
const slug = (s: string): string =>
  s
    .replace(/^of\s+(the\s+)?/i, '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

let fr: Map<string, string> | null = null;
/** Nom français d'un affixe (string.tbl français : forme masculine singulière, initiale du nom en capitale : « de Santé », « Solide ») */
function frName(en: string): string {
  if (!fr) {
    const s = new GameData(Vfs.open(IN_DIR, existsSync(PATCH) ? [PATCH] : []), 'fra', IN_DIR).strings;
    fr = s as unknown as Map<string, string>;
  }
  const raw = fr.get(en);
  if (!raw) return en;
  const s = raw.replace(/ÿc./g, '').trim();
  const ms = /\[ms\]([^[]*)/.exec(s)?.[1] ?? /\[fs\]([^[]*)/.exec(s)?.[1] ?? s.replace(/\[[a-z]{2}\]/g, '');
  const t = ms.trim();
  // « de santé » → « de Santé », « du lézard » → « du Lézard », « d'apprenti » → « d'Apprenti », « solide » → « Solide »
  const m = /^((?:de la |de l'|des |du |de |d'|l')?)(.*)$/i.exec(t)!;
  return m[1] + m[2].charAt(0).toUpperCase() + m[2].slice(1);
}

/** Propriétés d'une ligne : dégâts et défense convertis comme sur l'objet qui les porte (le jeu les rend locales ou globales selon la base) */
function affixMods(r: Record<string, string | undefined>): StatRoll[] {
  const out: StatRoll[] = [];
  for (let i = 1; i <= 3; i++) {
    const c = (r[`mod${i}code`] ?? '').trim();
    if (!c) continue;
    const kind = c.startsWith('ac') ? 'armor' : 'weapon';
    out.push(...convertProp(c, (r[`mod${i}param`] ?? '').trim(), num(r[`mod${i}min`]), num(r[`mod${i}max`]), kind));
  }
  // forme des jets des tables d'affixes du jeu : `param` absent plutôt qu'à undefined
  return out.map((s) => (s.param !== undefined ? { stat: s.stat, min: s.min, max: s.max, param: s.param } : { stat: s.stat, min: s.min, max: s.max }));
}

/**
 * Affixes de MagicPrefix.txt puis MagicSuffix.txt (ordre des tables) ; `dropped` : lignes tirables écartées (aucune propriété appliquée).
 * `nameOf` : nom affiché repris du jeu par identifiant (les noms ne dépendent pas du jeu de règles), sinon string.tbl français, sinon anglais.
 */
export function vanillaAffixes(nameOf: (id: string) => string | undefined = () => undefined): { affixes: AffixDef[]; dropped: string[] } {
  const affixes: AffixDef[] = [];
  const dropped: string[] = [];
  for (const [table, kind] of [
    ['magicprefix', 'prefix'],
    ['magicsuffix', 'suffix'],
  ] as const) {
    rows(table).forEach((r, row) => {
      const name = (r.Name ?? '').trim();
      if (!name || r.spawnable !== '1' || num(r.frequency) <= 0) return;
      const id = `${slug(name)}_${kind[0]}${row}`;
      const mods = affixMods(r);
      if (!mods.length) {
        dropped.push(id);
        return;
      }
      const types = [1, 2, 3, 4, 5, 6, 7].map((i) => code(r[`itype${i}`])).filter(Boolean);
      const ex = [1, 2, 3, 4, 5].map((i) => code(r[`etype${i}`])).filter(Boolean);
      const a: AffixDef = {
        id,
        name: nameOf(id) ?? frName(name),
        kind,
        group: `g${num(r.group)}`,
        level: num(r.level),
        reqLvl: Math.max(1, num(r.levelreq)),
        freq: num(r.frequency),
        types: types.map((t) => `d2:${t}`),
        mods,
        rare: r.rare === '1',
      };
      if (num(r.maxlevel)) a.maxLevel = num(r.maxlevel);
      if (ex.length) a.excludeTypes = ex.map((t) => `d2:${t}`);
      affixes.push(a);
    });
  }
  return { affixes, dropped };
}
