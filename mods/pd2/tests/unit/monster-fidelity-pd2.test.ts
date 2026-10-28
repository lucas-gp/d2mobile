/**
 * Provenance du patch PD2 de la fidélité des monstres (lot M6d) : la table du wiki PD2 (mods/pd2/tools/audit/monster-fidelity-pd2.ts),
 * appliquée par le générateur de la base aux MPQ du joueur, redonne la fidélité du jeu de règles pd2. Sauté sans les MPQ (D2_PRIVATE_DIR).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const MPQ = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/in/d2data.mpq`;

describe.skipIf(!existsSync(MPQ))('Fidélité des monstres PD2', () => {
  it('patch du mod = table du wiki PD2 appliquée aux tables de Diablo II', () => {
    const out = execFileSync(process.execPath, ['--import', 'tsx', `${ROOT}mods/pd2/tools/audit/monster-fidelity-pd2.ts`], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/fidélité pd2 identique/);
  }, 120_000);
});
