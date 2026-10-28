/**
 * Mesures de qualité du code de `src/` et `api/` (fichiers générés `*.gen.*` exclus) : fonctions de plus de 100 et 200 lignes, fichiers
 * de plus de 700 lignes, composantes cycliques du graphe d'imports (valeur seule, puis types compris).
 *   npm run metrics            résumé
 *   npm run metrics -- --list  avec la liste des fonctions de plus de 100 lignes et des composantes cycliques
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cyclicComponents, functionLengths, relativeImports } from './metrics-lib';

const list = process.argv.includes('--list');
const files = execSync('git ls-files "src/**/*.ts" "src/*.ts" "api/**/*.ts"', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((f) => !f.includes('.gen.'));
const text = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const fns = files.flatMap((f) => functionLengths(f, text.get(f)!)).sort((a, b) => b.lines - a.lines);
const long = fns.filter((f) => f.lines > 100);
console.log(`fonctions : ${fns.length} ; > 100 lignes : ${long.length} ; > 200 lignes : ${fns.filter((f) => f.lines > 200).length}`);
const big = files.map((f) => [f, text.get(f)!.split('\n').length] as const).filter(([, n]) => n > 700);
console.log(`fichiers de plus de 700 lignes : ${big.length}`);
const known = new Set(files);
for (const types of [false, true]) {
  const graph = new Map(files.map((f) => [f, relativeImports(f, text.get(f)!, known, types)]));
  const comps = cyclicComponents(graph);
  console.log(`cycles d'imports ${types ? '(types compris)' : '(valeur)'} : ${comps.length} composante(s)${comps.length ? ` de ${comps.map((c) => c.length).join(', ')} fichiers` : ''}`);
  if (list) for (const c of comps) console.log(`  ${c.join(' ')}`);
}
if (list) {
  for (const f of long) console.log(`${String(f.lines).padStart(4)}  ${f.file}:${f.line}  ${f.name}`);
  for (const [f, n] of big.sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(5)}  ${f}`);
}
