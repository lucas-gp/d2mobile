/**
 * Quelle archive Diablo II produit quoi. Les archives REQUISES (d2data, d2exp, d2char) sont MESURÉES (tools/d2import/requires.ts) : un élément
 * exige l'archive dont le retrait le fait échouer. Les archives FACULTATIVES viennent du code : sons (d2sfx, d2speech, d2xtalk, d2music :
 * tools/d2import/audio-build.ts), Patch_D2.mpq (monpreset.txt : monstres posés sur les cartes, tools/d2import/browser.ts `mapTables`).
 * Sans dépendance au navigateur : testé seul.
 */
import gen from './d2requires.gen.json';

export const BASE_ARCHIVES = ['d2data.mpq', 'd2exp.mpq', 'd2char.mpq'] as const;
type Gen = Record<string, { sheets: string[]; classes: string[]; maps: string[] }>;
const G = gen as Gen;
const SETS = new Map<string, { sheets: Set<string>; classes: Set<string>; maps: Set<string> }>(
  Object.entries(G).map(([k, v]) => [k, { sheets: new Set(v.sheets), classes: new Set(v.classes), maps: new Set(v.maps) }]),
);
const CLASSES = ['sorceress', 'necromancer', 'paladin', 'barbarian', 'amazon', 'assassin', 'druid'];
const classOfId = (id: string): string | undefined => CLASSES.find((c) => id === c || id.startsWith(`${c}_`));

/** Archives requises par UN élément (planche, sol, lot, `map:<id>`) */
export function requiredFor(id: string): string[] {
  const out: string[] = [];
  for (const a of BASE_ARCHIVES) {
    const s = SETS.get(a);
    if (!s) continue;
    const c = classOfId(id);
    const hit = id.startsWith('map:') ? s.maps.has(id.slice(4)) : c ? s.classes.has(c) : s.sheets.has(id);
    if (hit) out.push(a);
  }
  return out;
}

/** Archives requises par un ensemble d'éléments (ordre d2data, d2exp, d2char) */
export function requiredForAll(ids: readonly string[]): string[] {
  const set = new Set<string>();
  for (const id of ids) for (const a of requiredFor(id)) set.add(a);
  return BASE_ARCHIVES.filter((a) => set.has(a));
}

/** Archives facultatives qui enrichissent cet ensemble (nom, ce qu'elles apportent) */
export function optionalFor(kind: string): { name: string; gives: string }[] {
  if (kind === 'maps') return [{ name: 'Patch_D2.mpq', gives: 'monstres posés sur les cartes' }];
  if (kind === 'sounds')
    return [
      { name: 'd2sfx.mpq', gives: 'effets sonores' },
      { name: 'd2speech.mpq', gives: 'voix des PNJ (Actes I à IV)' },
      { name: 'd2xtalk.mpq', gives: 'voix de l’extension (Acte V)' },
      { name: 'd2music.mpq', gives: 'musiques' },
    ];
  if (kind === 'units' || kind === 'decor') return [{ name: 'Patch_D2.mpq', gives: 'tables du patch 1.10+' }];
  return [];
}

/** Parmi `required`, celles qui ne sont pas dans les fichiers connus (comparaison sans casse) */
export function missingOf(required: readonly string[], known: readonly string[]): string[] {
  const have = new Set(known.map((n) => n.toLowerCase()));
  return required.filter((a) => !have.has(a.toLowerCase()));
}
