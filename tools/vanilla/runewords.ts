/**
 * Mots runiques de Diablo II LoD 1.13c (Runes.txt) convertis dans les structures du jeu (lot M10b). Rien n'est écrit ici : voir gen.ts
 * (table `runewords`).
 *
 * Lignes retenues : `complete` (D2MOO, ITEMS_GetRunesTxtRecordFromItem : seule colonne lue pour reconnaître un mot runique ; la colonne
 * `server` n'y est pas lue). Identifiant : `rw_` + nom anglais affiché (string.tbl : clé `Name`, « Exile » et non « Exile's Path »), comme les
 * identifiants du jeu. Types : codes d'ItemTypes.txt préfixés `d2:` (itype1-6 ; etype1-3 : `excludeTypes`). Niveau requis : le plus haut
 * des runes (Misc.txt, levelreq). Propriétés T1Code1-7 converties comme celles des affixes (dégâts et défense selon l'objet qui les porte) ;
 * celles que la simulation n'applique pas sont ignorées (`unsupported`).
 */
import type { RunewordDef, StatRoll } from '../../src/data/types';
import { d2, rows } from '../audit/common';
import { convertProp, num } from './props';

const code = (s: string | undefined): string => (s ?? '').trim().slice(0, 4).trim();

/** Identifiant du jeu d'un nom anglais (« King's Grace » → rw_kings_grace) */
const slug = (s: string): string =>
  `rw_${s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}`;

/**
 * Mots runiques complets de Runes.txt (ordre de la table) ; `nameOf` : nom affiché repris du jeu par identifiant, sinon nom anglais ;
 * `runeLvl` : niveau requis de chaque rune du jeu (r01…r33)
 */
export function vanillaRunewords(nameOf: (id: string) => string | undefined, runeLvl: (id: string) => number): { runewords: RunewordDef[]; dropped: string[] } {
  const out: RunewordDef[] = [];
  const dropped: string[] = [];
  const strings = d2().strings;
  const seen = new Set<string>();
  for (const r of rows('runes')) {
    if (r.complete !== '1') continue;
    const en = (strings.get((r.Name ?? '').trim()) ?? r['Rune Name'] ?? '').replace(/ÿc./g, '').trim();
    const id = slug(en);
    if (seen.has(id)) throw new Error(`mot runique en double : ${id}`);
    seen.add(id);
    const runes = [1, 2, 3, 4, 5, 6].map((i) => (r[`Rune${i}`] ?? '').trim()).filter(Boolean);
    const mods: StatRoll[] = [];
    for (let i = 1; i <= 7; i++) {
      const c = (r[`T1Code${i}`] ?? '').trim();
      if (!c) continue;
      mods.push(...convertProp(c, (r[`T1Param${i}`] ?? '').trim(), num(r[`T1Min${i}`]), num(r[`T1Max${i}`]), c.startsWith('ac') ? 'armor' : 'weapon'));
    }
    if (!mods.length) {
      dropped.push(id);
      continue;
    }
    const types = [1, 2, 3, 4, 5, 6].map((i) => code(r[`itype${i}`])).filter(Boolean);
    const ex = [1, 2, 3].map((i) => code(r[`etype${i}`])).filter(Boolean);
    const w: RunewordDef = { id, name: nameOf(id) ?? en, runes, types: types.map((t) => `d2:${t}`), reqLvl: Math.max(...runes.map(runeLvl)), mods };
    if (ex.length) w.excludeTypes = ex.map((t) => `d2:${t}`);
    out.push(w);
  }
  return { runewords: out, dropped };
}
