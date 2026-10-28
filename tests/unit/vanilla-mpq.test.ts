/**
 * Tables Diablo II vanilla de la base (lot M6) : exactement ce que donnent les MPQ du joueur (LoD 1.13c), régénérées par tools/vanilla/gen.ts
 * (`npm run vanilla`). Sauté sans les MPQ (D2_PRIVATE_DIR), comme en CI ; indépendant du jeu de règles (l'outil lit les fichiers de la base).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MPQ = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/in/d2data.mpq`;

describe.skipIf(!existsSync(MPQ))('Tables vanilla de la base contre les MPQ du joueur', () => {
  it('chaque table régénérée est identique au fichier de la base', () => {
    const out = execFileSync(process.execPath, ['--import', 'tsx', `${ROOT}tools/vanilla/gen.ts`], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/identiques aux MPQ/);
  }, 180_000);
});
