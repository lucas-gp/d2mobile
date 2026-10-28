/**
 * Patch PD2 des tables vanilla (lot M6) : la base contient Diablo II LoD 1.13c régénérée depuis les MPQ (tools/vanilla/gen.ts), le mod un
 * patch généré par diff (mods/pd2/tools/vanilla-diff.ts). Test permanent : base + patch ≡ tables pd2 d'avant le lot M6, à l'identique
 * (entrées, ordre des entrées, des index et des champs, champs à undefined) : empreintes enregistrées dans vanilla-patch.ref.json.
 * La base elle-même est contrôlée contre les MPQ du joueur par tests/unit/vanilla-mpq.test.ts (`npm run vanilla`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGISTRIES } from '../../../../src/mods/registries';
import { TABLES, snapshotTables, tableHash } from '../../tools/vanilla-snap';

const REF: Record<string, { entries: string; index: string }> = JSON.parse(readFileSync(new URL('./vanilla-patch.ref.json', import.meta.url), 'utf8'));

describe('Patch PD2 des tables vanilla', () => {
  it('base vanilla + patch = tables pd2 d’avant le lot M6, à l’identique', () => {
    const names = Object.keys(REF);
    expect(names.length).toBeGreaterThan(0);
    const snap = snapshotTables(names);
    for (const n of names) expect(tableHash(snap[n]), n).toEqual(REF[n]);
  });

  it('les entrées ajoutées par le patch appartiennent au mod, les entrées patchées à la base', async () => {
    for (const t of TABLES.filter((x) => REF[x.reg] && !('verifyOnly' in x))) {
      const p = (await import(`../../${t.file}`))[t.name] as { patch: Record<string, unknown>; add?: { entry: { id: string } }[] };
      const reg = REGISTRIES[t.reg];
      for (const a of p.add ?? []) expect(reg.ownerOf(a.entry.id), `${t.reg} ${a.entry.id}`).toBe('pd2');
      for (const id of Object.keys(p.patch)) expect(reg.ownerOf(id), `${t.reg} ${id}`).toBe('base');
    }
  });
});
