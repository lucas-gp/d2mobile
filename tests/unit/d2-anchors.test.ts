/** Repères d'une carte D2 : entrée (tuiles spéciales) et place du boss (emplacements de monstres du DS1) */
import { describe, expect, it } from 'vitest';
import type { D2MapData } from '../../src/data/d2map';
import { d2Anchors } from '../../src/data/zones/d2anchors';

const map = (id: string, landmarks: D2MapData['landmarks'], presets: [string, number, number][]): D2MapData => ({
  id,
  cases: [20, 20],
  units: [50, 50],
  grid: { cols: 100, rows: 100, blocked: new Uint8Array(10000), opaque: new Uint8Array(10000) },
  objects: [],
  landmarks,
  raw: { presets },
});

describe('repères de carte D2', () => {
  it("l'entrée est la moyenne des tuiles spéciales d'orientation 11, le boss sa place dans monpreset", () => {
    const a = d2Anchors(
      map(
        'andariel',
        {
          special11: [
            [8, 20],
            [10, 20],
          ],
        },
        [
          ['place_fallen', 5, 5],
          ['andariel', 23, 23],
        ],
      ),
    );
    expect(a.boss).toEqual({ x: 23, y: 23 });
    expect(a.entry!.x).toBeCloseTo(((8.5 + 10.5) / 2) * 2.5);
    expect(a.entry!.y).toBeCloseTo(20.5 * 2.5);
  });

  it("sans tuile d'orientation 11, l'entrée est la tuile 10 la plus éloignée du boss ; les Anciens : milieu des statues", () => {
    const a = d2Anchors(
      map(
        'ancients',
        {
          special10: [
            [9, 5],
            [11, 25],
          ],
        },
        [
          ['ancientstatue1', 24, 33.5],
          ['ancientstatue2', 18.5, 38.5],
          ['ancientstatue3', 29, 38.5],
        ],
      ),
    );
    expect(a.boss!.x).toBeCloseTo(23.83, 1);
    expect(a.entry!.y).toBeCloseTo(25.5 * 2.5);
  });

  it('carte inconnue : aucun repère (les heuristiques prennent le relais)', () => {
    expect(d2Anchors(map('tombs', {}, []))).toEqual({ entry: undefined, boss: undefined });
  });
});
