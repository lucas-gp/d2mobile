/** Balayage de connexité des zones de campagne sur cartes D2 : objets, sorties et boss atteignables à pied depuis le départ (cartes privées requises) */
import fs from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { RUNS } from '../../src/data/runs';
import { buildGrid } from '../../src/sim/world';
import { findPath } from '../../src/sim/bot/pathfind';

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;
/** Zones atteignables seulement par téléportation (plateformes de l'Arcane) : par conception */
const BY_DESIGN = new Set(['a2_arcane']);

describe.skipIf(!fs.existsSync(DIR))('Zones de campagne : tout est atteignable à pied', () => {
  afterAll(() => clearD2Maps());
  it('objets, sorties et boss reliés au départ', () => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
    const errs: string[] = [];
    for (const run of RUNS.filter((r) => r.campaign && !BY_DESIGN.has(r.id))) {
      const z = run.build(1, 0);
      if (!z.d2Map) continue;
      const g = buildGrid(z);
      for (const b of z.blockers) if (b.gate && b.rect) g.unblockRect(...b.rect);
      const targets = [...z.objects.map((o) => ({ x: o.x, y: o.y, what: `objet ${o.kind}` })), ...(z.exits ?? []).map((o) => ({ x: o.x, y: o.y, what: `sortie ${o.kind ?? ''}` }))];
      for (const t of targets) if (!findPath(g, z.start.x, z.start.y, t.x, t.y, 200000)) errs.push(`${run.id} : ${t.what} (${t.x.toFixed(1)}, ${t.y.toFixed(1)})`);
    }
    expect(errs, errs.join('\n')).toEqual([]);
  }, 120000);
});
