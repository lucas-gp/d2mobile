/** Intégrité des cartes : toute run, toute graine, toute difficulté est entièrement parcourable. */
import { describe, expect, it } from 'vitest';
import { RUNS } from '../../src/data/runs';
import { PROP_BY_ID } from '../../src/data/props';
import { MONSTER_BY_ID } from '../../src/data/monsters';
import type { Difficulty } from '../../src/data/types';
import { buildGrid } from '../../src/sim/world';
import { findPath } from '../../src/sim/bot/pathfind';

describe('Cartes des runs', () => {
  // zones de campagne : cartes D2 obligatoires (testées en e2e), sauf le Chaos qui a sa version de secours
  for (const run of RUNS.filter((r) => !r.campaign || r.id === 'a4_chaos')) {
    it(`${run.id} : départ libre, chaque groupe, objet et boss atteignable (15 graines, difficultés alternées)`, () => {
      const errs: string[] = [];
      for (let seed = 1; seed <= 15; seed++) {
        for (const d of [(seed % 3) as Difficulty]) {
          const z = run.build(seed, d);
          for (const p of z.props) if (!PROP_BY_ID[p.prop]) errs.push(`${seed}/${d} : décor inconnu ${p.prop}`);
          for (const s of z.spawns) if (!MONSTER_BY_ID[s.monster]) errs.push(`${seed}/${d} : monstre inconnu ${s.monster}`);
          const g = buildGrid(z);
          // état de fin de run : les herses sont ouvertes
          for (const b of z.blockers) if (b.gate && b.rect) g.unblockRect(...b.rect);
          if (g.circleBlocked(z.start.x, z.start.y, 0.4)) errs.push(`${seed}/${d} : départ bloqué`);
          const targets = [...z.spawns.map((s) => ({ x: s.x, y: s.y, what: s.monster })), ...z.objects.map((o) => ({ x: o.x, y: o.y, what: o.kind }))];
          for (const t of targets) if (!findPath(g, z.start.x, z.start.y, t.x, t.y, 80000)) errs.push(`${seed}/${d} : ${t.what} inatteignable en (${t.x.toFixed(1)}, ${t.y.toFixed(1)})`);
          if (!z.spawns.some((s) => s.runBoss || s.monster === run.boss)) errs.push(`${seed}/${d} : aucun boss de run`);
        }
      }
      expect(errs.slice(0, 20), errs.slice(0, 20).join('\n')).toEqual([]);
    }, 60000);
  }
});
