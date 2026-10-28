import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { makeMap } from '../../sim/maps';
import { Rng } from '../../../../src/core/rng';
import { MONSTERS_LEFT_CAP, mapMonstersLeft } from '../../../../src/ui/hud';

describe('Compteur de monstres restants (cartes)', () => {
  it('compte les vivants et les groupes pas encore apparus ; baisse quand on tue ; dépasse le plafond d’affichage au départ', () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 90;
    g.character.progression.highestDifficulty = 2;
    g.character.inventory[0] = makeMap(new Rng('left'), 3, 'rare', 'kyovashad');
    expect(g.startMap({ invIndex: 0 }, 5).ok).toBe(true);
    const w = g.world;
    const start = mapMonstersLeft(w);
    expect(start).toBeGreaterThan(MONSTERS_LEFT_CAP);
    for (const sp of [...w.pendingSpawns]) if (!sp.wave && !sp.seal) w.spawnGroup(sp.idx);
    const alive = mapMonstersLeft(w);
    expect(alive).toBeGreaterThan(MONSTERS_LEFT_CAP);
    const m = w.monsters.find((x) => !x.dead && !x.isSummon)!;
    m.dead = true;
    expect(mapMonstersLeft(w)).toBe(alive - 1);
  });
});
