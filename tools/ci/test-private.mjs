/**
 * Tests qui lisent les fichiers Diablo II privés (archives, cartes exportées) : en CI, ils se sautent seuls (fichiers absents) et la CI
 * reste verte sans les avoir lancés. Ce script est le contrôle de fin de lot sur une machine qui a les fichiers :
 *   npm run test:private
 * Il ÉCHOUE si les fichiers manquent (au lieu de tout sauter), puis lance la suite unitaire deux fois : avec le mod pd2 (`MODS=pd2`) et
 * sans aucun mod (`MODS=`), car certains blocs ne tournent que sans le mod (tests/unit/vanilla-cube.test.ts : `MODS=` ET le MPQ).
 * Dossier : `D2_PRIVATE_DIR` (défaut ~/d2-private), avec `in/d2data.mpq`, `in/d2exp.mpq` et `out/game/maps`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private');
const NEEDED = [join(DIR, 'in', 'd2data.mpq'), join(DIR, 'in', 'd2exp.mpq'), join(DIR, 'out', 'game', 'maps')];
const missing = NEEDED.filter((p) => !existsSync(p));
if (missing.length) {
  console.error(`Fichiers privés absents (D2_PRIVATE_DIR=${DIR}) :\n  ${missing.join('\n  ')}\nCes tests se sauteraient : contrôle impossible.`);
  process.exit(1);
}

let failed = 0;
for (const [label, mods] of [
  ['avec le mod pd2', 'pd2'],
  ['sans mod', ''],
]) {
  console.log(`\n=== Suite unitaire ${label} (MODS=${mods}), fichiers privés : ${DIR} ===`);
  const r = spawnSync('npx', ['vitest', 'run', '--project', 'unit'], { stdio: 'inherit', env: { ...process.env, D2_PRIVATE_DIR: DIR, MODS: mods } });
  if (r.status !== 0) failed++;
}
if (failed) {
  console.error(`\n${failed} passe(s) en échec`);
  process.exit(1);
}
console.log('\nTests des fichiers privés : les deux passes réussissent.');
