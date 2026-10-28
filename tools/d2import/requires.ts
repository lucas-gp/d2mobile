/**
 * Mesure quelle archive requise (d2data / d2exp / d2char) chaque élément à générer exige : on fabrique l'élément avec toutes les archives,
 * puis sans chacune d'elles ; ceux qui échouent (exception ou aucun fichier écrit) EXIGENT l'archive retirée. Écrit
 * src/platform/d2requires.gen.json (utilisé par les Réglages et les écrans d'erreur : « Requis : d2xxx.mpq »).
 *   npx tsx tools/d2import/requires.ts <dossier des MPQ> [sortie.json]
 * Les cartes : `availableMaps` (le DS1 existe ou non). Les pièces d'équipement : une mesure par classe (même règle pour toutes ses pièces).
 */
import { mkdtempSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vfs } from './vfs';
import { GameData } from './data';
import { availableMaps, catalog, generateAsset } from './browser';

const IN = process.argv[2];
const OUT = process.argv[3] ?? join(import.meta.dirname, '../../src/platform/d2requires.gen.json');
const BASE = ['d2data.mpq', 'd2exp.mpq', 'd2char.mpq'] as const;
const CLASSES = ['sorceress', 'necromancer', 'paladin', 'barbarian', 'amazon', 'assassin', 'druid'];

function open(skip?: string): GameData {
  const dir = mkdtempSync(join(tmpdir(), 'd2req-'));
  for (const f of readdirSync(IN)) if (/\.mpq$/i.test(f) && f.toLowerCase() !== skip) symlinkSync(join(IN, f), join(dir, f));
  return new GameData(Vfs.open(dir), 'eng', '');
}

async function builds(data: GameData, id: string): Promise<boolean> {
  let n = 0;
  const sink = { write: async () => void n++, png: async () => (n++, 1) };
  try {
    await generateAsset(data, id, sink as never, ['lo']);
  } catch {
    return false;
  }
  return n > 0;
}

const full = open();
const cat = catalog(full);
const classOf = (id: string) => CLASSES.find((c) => id === c || id.startsWith(`${c}_`));
const sheets = [...cat.extras, ...cat.units.filter((u) => !classOf(u) || u === classOf(u)), ...cat.props, ...cat.grounds, ...cat.fx];
// une pièce par classe (hors corps déjà dans units)
const partSample = CLASSES.map((c) => cat.parts.find((p) => p.startsWith(`${c}_`))).filter((x): x is string => !!x);
const result: Record<string, { sheets: string[]; classes: string[]; maps: string[] }> = {};
for (const skip of BASE) {
  const d = open(skip);
  const need: string[] = [];
  for (const id of sheets) if (!(await builds(d, id))) need.push(id);
  const classes: string[] = [];
  for (const p of partSample) if (!(await builds(d, p))) classes.push(classOf(p)!);
  const have = new Set(availableMaps(d));
  result[skip] = { sheets: need, classes, maps: cat.maps.filter((m) => !have.has(m)) };
  console.log(skip, 'sheets', need.length, 'classes', classes.join(','), 'maps', result[skip].maps.length);
}
writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
console.log('écrit', OUT);
