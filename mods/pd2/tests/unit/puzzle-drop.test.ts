/** Pièces d'énigme de Larzuk : lâchées par les boss de carte, selon le palier de butin */
import { afterAll, describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { makeMap } from '../../sim/maps';
import { rollMonsterDrops } from '../../../../src/sim/loot/drops';
import { Rng } from '../../../../src/core/rng';
import { applyLootPreset, RATES } from '../../../../src/data/rates';

function bossWorld() {
  const g = new Game(undefined, 'sorceress');
  g.character.level = 90;
  g.character.progression.highestDifficulty = 2;
  g.character.inventory[0] = makeMap(new Rng('pz'), 3, 'rare', 'kyovashad');
  expect(g.startMap({ invIndex: 0 }, 5).ok).toBe(true);
  const w = g.world;
  for (const sp of [...w.pendingSpawns]) if (!sp.wave && !sp.seal) w.spawnGroup(sp.idx);
  const boss = w.monsters.find((m) => m.mapBoss)!;
  expect(boss).toBeTruthy();
  return { w, boss };
}
const pieces = (items: { base: string }[]) => items.filter((i) => i.base === 'puzzlepiece').length;

describe('Pièces d’énigme de Larzuk', () => {
  afterAll(() => applyLootPreset('normal'));
  it('le boss de carte en lâche selon le palier de butin (Normal ≈ 10 %, Abondant ≈ 35 %)', () => {
    const { w, boss } = bossWorld();
    const rate = (id: Parameters<typeof applyLootPreset>[0]) => {
      applyLootPreset(id);
      let n = 0;
      const N = 1500;
      for (let i = 0; i < N; i++) {
        boss.id = 100000 + i;
        n += pieces(rollMonsterDrops(w, boss)) > 0 ? 1 : 0;
      }
      return n / N;
    };
    const normal = rate('normal');
    const abundant = rate('abundant');
    expect(normal).toBeGreaterThan(0.06);
    expect(normal).toBeLessThan(0.15);
    expect(abundant).toBeGreaterThan(0.28);
    expect(abundant).toBeLessThan(0.42);
    expect(RATES.puzzle).toBe(0.35);
  });
  it('un monstre ordinaire en lâche rarement (≈ 0,8 % à Abondant)', () => {
    applyLootPreset('abundant');
    const { w } = bossWorld();
    const m = w.monsters.find((x) => !x.mapBoss && x.rank === 'normal')!;
    let n = 0;
    for (let i = 0; i < 500; i++) {
      m.id = 200000 + i;
      n += pieces(rollMonsterDrops(w, m));
    }
    // Abondant : table « divers » (~0,17 %) + 0,6 % par monstre ⇒ ~0,8 % (≈ 4 pour 500, large marge)
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(15);
  });
});
