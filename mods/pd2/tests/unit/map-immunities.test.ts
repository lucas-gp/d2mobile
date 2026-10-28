/** Cartes : pas d'immunité non annoncée (immunités naturelles et variantes ramenées sous 100 %) */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { makeMap } from '../../sim/maps';
import { Rng } from '../../../../src/core/rng';
import { MAP_ZONES } from '../../../../src/data/maps';

const ELEM = ['phys', 'fire', 'cold', 'light', 'poison'] as const;
const KEY = { phys: 'physImmune', fire: 'fireImmune', cold: 'coldImmune', light: 'lightImmune', poison: 'poisonImmune' } as const;

describe('Immunités des cartes', () => {
  it('aucun monstre n’est immunisé à un élément que la carte n’annonce pas', () => {
    let checked = 0;
    for (const z of MAP_ZONES.slice(0, 12)) {
      const g = new Game(undefined, 'sorceress');
      g.character.level = 90;
      g.character.progression.highestDifficulty = 2;
      const item = makeMap(new Rng('imm:' + z.id), 3, 'rare', z.id);
      g.character.inventory[0] = item;
      g.character.materials.worldstone_shard = 0;
      if (!g.startMap({ invIndex: 0 }, 5).ok) continue;
      const w = g.world;
      for (const sp of [...w.pendingSpawns]) if (!sp.wave && !sp.seal) w.spawnGroup(sp.idx);
      const announced = new Set(w.mapMods.map((x) => x.id));
      for (const m of w.monsters) {
        for (const e of ELEM) {
          if (m.res[e] >= 100) expect(announced.has(KEY[e]), `${z.id} ${m.def.id} ${e}`).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});
