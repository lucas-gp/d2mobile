/**
 * Budget du chargement de départ : le module d'entrée `assets/index-*.js` d'un build et tous ses imports statiques (récursifs), bruts et
 * compressés (gzip 9). Les imports dynamiques (`import()`) ne comptent pas : ils sont chargés à la demande.
 *   node tools/ci/bundle-budget.mjs <dossier du build> [budget gzip en Ko]
 * Lu aussi par tests/build/public-build.test.ts (budget du build public).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Budget gzip (Ko) du chargement de départ du build public : mesuré à 462 Ko au lot 261, marge pour la croissance normale */
export const START_BUDGET_KB = 520;

export function startupSize(dist) {
  const dir = join(dist, 'assets');
  const entry = readdirSync(dir).find((f) => /^index-.*\.js$/.test(f));
  if (!entry) throw new Error(`pas de assets/index-*.js dans ${dist}`);
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !existsSync(join(dir, f))) continue;
    seen.add(f);
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) stack.push(m[1]);
  }
  let raw = 0;
  let gz = 0;
  for (const f of seen) {
    raw += statSync(join(dir, f)).size;
    gz += gzipSync(readFileSync(join(dir, f)), { level: 9 }).length;
  }
  return { chunks: [...seen].sort(), raw, gzip: gz };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] ?? 'dist';
  const budget = Number(process.argv[3] ?? START_BUDGET_KB);
  const s = startupSize(dist);
  console.log(`chargement de départ : ${s.chunks.length} fichiers, ${(s.raw / 1024).toFixed(0)} Ko bruts, ${(s.gzip / 1024).toFixed(0)} Ko gzip (budget ${budget} Ko)`);
  if (s.gzip > budget * 1024) process.exit(1);
}
