/** Tests de l'importeur D2 sur des données synthétiques (aucun fichier du jeu requis) */
import { describe, expect, it } from 'vitest';
import { mpqHash } from '../../tools/d2import/mpq';
import { directionOrder } from '../../tools/d2import/directions';
import { pack } from '../../tools/d2import/atlas';
import { encodePng } from '../../tools/d2import/png';
import { parsePalette } from '../../tools/d2import/formats/palette';
import { parseTxt } from '../../tools/d2import/formats/txt';
import { parseCof } from '../../tools/d2import/formats/cof';

describe('importeur D2', () => {
  it('hachage MPQ : clés de chiffrement des tables (valeurs de la spécification)', () => {
    expect(mpqHash('(hash table)', 3)).toBe(0xc3af3770);
    expect(mpqHash('(block table)', 3)).toBe(0xec83b3a3);
  });

  it('ordre des directions : permutation complète, sens horaire depuis « bas »', () => {
    for (const n of [8, 16]) {
      const o = directionOrder(n);
      expect([...o.rows.map((r) => r.source)].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(o.rows[0].label).toBe('down');
      expect(o.rows[n / 2].label).toBe('up');
      expect(o.rows[n / 4].label).toBe('left');
    }
    // les 8 directions sont les positions paires des 16
    expect(
      directionOrder(16)
        .rows.filter((_, i) => i % 2 === 0)
        .map((r) => r.source),
    ).toEqual(directionOrder(8).rows.map((r) => r.source));
  });

  it('atlas : aucun chevauchement, tout tient dans les pages', () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ w: 20 + (i % 37), h: 10 + (i % 53) }));
    const { placements, pages } = pack(items, 256, 256);
    placements.forEach((p, i) => {
      expect(p.x + items[i].w).toBeLessThanOrEqual(pages[p.page].w);
      expect(p.y + items[i].h).toBeLessThanOrEqual(pages[p.page].h);
      for (let j = 0; j < i; j++) {
        const q = placements[j];
        if (q.page !== p.page) continue;
        const sep = p.x >= q.x + items[j].w || q.x >= p.x + items[i].w || p.y >= q.y + items[j].h || q.y >= p.y + items[i].h;
        expect(sep, `${i}/${j}`).toBe(true);
      }
    });
  });

  it('PNG : signature et taille de l’en-tête', () => {
    const png = encodePng(2, 2, new Uint8Array(16).fill(255));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(2);
  });

  it('palette BGR → RGB, table Excel et COF', () => {
    const raw = new Uint8Array(768);
    raw.set([10, 20, 30]);
    expect([...parsePalette(raw).subarray(0, 3)]).toEqual([30, 20, 10]);
    const t = parseTxt('a\tb\ta\r\n1\t2\t3\r\n');
    expect(t.rows[0]).toEqual({ a: '1', b: '2', 'a#1': '3' });
    // COF minimal : 1 calque, 2 trames, 1 direction
    const cof = new Uint8Array(28 + 9 + 2 + 2);
    cof.set([1, 2, 1], 0);
    cof.set([5, 1, 1, 0, 0, 0x31, 0x68, 0x73, 0], 28);
    cof.set([5, 5], 28 + 9 + 2);
    const c = parseCof(cof);
    expect(c.layers[0]).toMatchObject({ dir: 'rh', weaponClass: '1hs' });
    expect(c.order[0]).toEqual([[5], [5]]);
  });
});
