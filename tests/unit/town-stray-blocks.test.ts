/** Villes D2 : pas de « mur invisible » (case bloquée isolée sans aucun dessin autour), sans ouvrir de passage vers une zone fermée */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOWN_MAPS, dropStrayBlocks, parseD2Map } from '../../src/data/d2map';

/** Cartes de 20 × 20 sous-tuiles, entièrement libres sauf les cases données */
function fake(blockedCells: [number, number][], raw: Record<string, unknown> = {}) {
  const cols = 40;
  const rows = 40;
  const blocked = new Uint8Array(cols * rows);
  for (const [x, y] of blockedCells) blocked[y * cols + x] = 1;
  return { grid: { cols, rows, blocked }, raw: { places: [], decor: [], ...raw } };
}

describe('dropStrayBlocks', () => {
  it('libère une case isolée sans dessin autour', () => {
    const m = fake([[20, 20]]);
    expect(dropStrayBlocks(m.grid, m.raw)).toBe(1);
    expect(m.grid.blocked[20 * 40 + 20]).toBe(0);
  });
  it('garde une case à côté d’une structure dessinée ou d’un décor posé', () => {
    const a = fake([[20, 20]], { places: [[0, 0, 0, 4, 4, 0, 2]] }); // case D2 (4,4) = sous-tuiles 20..24
    expect(dropStrayBlocks(a.grid, a.raw)).toBe(0);
    const b = fake([[20, 20]], { decor: [['dec_2x_a5', 10, 10.5]] });
    expect(dropStrayBlocks(b.grid, b.raw)).toBe(0);
    // une simple ombre (orientation 13) ne justifie pas un obstacle
    const c = fake([[20, 20]], { places: [[0, 0, 0, 4, 4, 0, 13]] });
    expect(dropStrayBlocks(c.grid, c.raw)).toBe(1);
  });
  it('garde les gros amas (arbres, murs) et ne touche pas un grand amas dont un bout dépasse', () => {
    const m = fake([
      [10, 10],
      [11, 10],
      [10, 11],
      [11, 11],
      [12, 10],
      [12, 11],
    ]);
    expect(dropStrayBlocks(m.grid, m.raw)).toBe(0);
    const wall = fake(Array.from({ length: 12 }, (_, i) => [5 + i, 30] as [number, number]));
    expect(dropStrayBlocks(wall.grid, wall.raw)).toBe(0);
  });
});

const dir = path.join(process.env.D2_PRIVATE_DIR ?? path.join(os.homedir(), 'd2-private'), 'out/game/maps');
describe.skipIf(!fs.existsSync(path.join(dir, 'harrogath.json')))('villes importées (cartes locales)', () => {
  const load = (id: string, strip = false) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
    return strip ? parseD2Map({ ...j, id: `${id}-brut` }) : parseD2Map(j);
  };

  it('Harrogath : la case du bord de la mosaïque (58,5 ; 34,5), sans dessin, est libre', () => {
    const m = load('harrogath');
    expect(m.grid.blocked[69 * m.grid.cols + 117]).toBe(0);
    expect(load('harrogath', true).grid.blocked[69 * m.grid.cols + 117]).toBe(1);
  });

  it('chaque ville : plus de case isolée sans dessin, et aucune case jusque-là fermée ne devient atteignable', () => {
    for (const id of TOWN_MAPS) {
      const m = load(id);
      const raw = load(id, true);
      const g = m.grid;
      expect(dropStrayBlocks({ cols: g.cols, rows: g.rows, blocked: g.blocked.slice() }, m.raw), id).toBe(0);
      // composantes libres (4-connexes) : une case libérée doit rejoindre une composante qui existait déjà
      const comp = (blocked: Uint8Array) => {
        const c = new Int32Array(blocked.length).fill(-1);
        let n = 0;
        for (let s = 0; s < blocked.length; s++) {
          if (blocked[s] || c[s] >= 0) continue;
          const st = [s];
          c[s] = n;
          while (st.length) {
            const i = st.pop()!;
            const x = i % g.cols;
            for (const k of [x > 0 ? i - 1 : -1, x < g.cols - 1 ? i + 1 : -1, i - g.cols, i + g.cols])
              if (k >= 0 && k < blocked.length && !blocked[k] && c[k] < 0) {
                c[k] = n;
                st.push(k);
              }
          }
          n++;
        }
        return c;
      };
      const before = comp(raw.grid.blocked);
      const after = comp(g.blocked);
      const map = new Map<number, number>();
      for (let i = 0; i < before.length; i++) {
        if (before[i] < 0) continue;
        expect(after[i] >= 0, id).toBe(true);
        const prev = map.get(after[i]);
        if (prev === undefined) map.set(after[i], before[i]);
        else expect(prev, `${id} : deux zones séparées se rejoignent`).toBe(before[i]);
      }
    }
  });
});
