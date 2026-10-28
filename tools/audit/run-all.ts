/**
 * Relance tous les audits D2 et écrit les sorties brutes dans tools/audit/out/*.txt (non commité).
 * Usage : npx tsx tools/audit/run-all.ts   (lecture seule ; MPQ : $D2_PRIVATE_DIR/in + patch/Patch_D2.mpq,
 * variables D2_IN, D2_PATCH, D2_NOPATCH=1 pour comparer aux tables 1.00 sans patch)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'out');
mkdirSync(out, { recursive: true });
for (const s of ['bases', 'runes', 'uniques', 'monsters', 'treasure', 'skills', 'formulas']) {
  const args = ['tsx', join(dir, `${s}.ts`)].concat(s === 'skills' ? ['--all'] : []);
  const r = spawnSync('npx', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(out, `${s}.txt`), (r.stdout ?? '') + (r.stderr ?? ''));
  console.log(`${s}: ${r.status === 0 ? 'ok' : 'ERREUR'} -> tools/audit/out/${s}.txt`);
}
