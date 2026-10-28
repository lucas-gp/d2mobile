/**
 * Registres : toutes les valeurs exportées par les modules de `src/data` (tables d'objets, d'affixes, d'uniques, de sets, de runes, de mots
 * runiques, du Cube, des runs, des compétences, des mercenaires, des monstres, des niveaux de zone, des TC, des cartes…), sérialisées
 * entièrement. Une entrée par élément (identifiant `id` ou indice) et une par ordre de la table : un ajout, un retrait, un champ modifié
 * ou un ordre changé est localisé. Les fonctions exportées ne sont pas hachées (les sections de comportement les couvrent).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { serData, sha1, type SectionResult } from '../lib';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function files(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (f.endsWith('.ts') && !f.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const keyOf = (x: unknown, i: number): string => (x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' ? (x as { id: string }).id : String(i));

export async function run(): Promise<SectionResult> {
  // catalogue complet d'abord (les bases annexes s'enregistrent à l'import), comme dans le jeu
  await import(pathToFileURL(join(ROOT, 'src/data/items/index.ts')).href);
  const out: SectionResult = {};
  // tous les modules d'abord, puis la sérialisation : certains modules complètent les entrées d'un autre au chargement (calage des
  // animations des monstres dans monsters.ts), l'état haché est celui du jeu chargé, indépendant de l'ordre des fichiers
  // puis les données des mods actifs (`mods/<id>/data`, clés `<id>:<fichier>`) : un contenu déplacé de la base vers un mod garde ses
  // empreintes d'élément sous un nouveau nom de fichier, et les tables du jeu (où le mod l'enregistre) gardent les leurs
  const { activeModIds } = (await import(pathToFileURL(join(ROOT, 'src/mods/activate.ts')).href)) as { activeModIds: () => readonly string[] };
  const dirs: [string, string][] = [['', join(ROOT, 'src/data')], ...activeModIds().map((m): [string, string] => [`${m}:`, join(ROOT, 'mods', m, 'data')])];
  const mods: [string, Record<string, unknown>][] = [];
  for (const [prefix, dir] of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of files(dir)) mods.push([prefix + relative(dir, f).replace(/\.ts$/, ''), (await import(pathToFileURL(f).href)) as Record<string, unknown>]);
  }
  for (const [name, mod] of mods) {
    for (const exp of Object.keys(mod).sort()) {
      const v = mod[exp];
      if (typeof v === 'function') continue;
      // registres de src/mods (BASE_REGISTRY…) : enveloppes des tables, déjà hachées elles-mêmes
      if (v && typeof v === 'object' && v.constructor?.name === 'Registry') continue;
      const k = `${name}:${exp}`;
      if (Array.isArray(v)) {
        const keys = v.map(keyOf);
        out[`${k}#order`] = sha1(keys.join('\n'));
        v.forEach((x, i) => (out[`${k}[${keys[i]}${keys.indexOf(keys[i]) !== i ? '~' + i : ''}]`] = sha1(serData(x))));
      } else if (v && typeof v === 'object' && !(v instanceof Map) && !(v instanceof Set) && !ArrayBuffer.isView(v)) {
        const keys = Object.keys(v);
        out[`${k}#keys`] = sha1(keys.join('\n'));
        for (const kk of keys) out[`${k}.${kk}`] = sha1(serData((v as Record<string, unknown>)[kk]));
      } else out[k] = sha1(serData(v));
    }
  }
  return out;
}
