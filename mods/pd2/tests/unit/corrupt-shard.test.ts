/** Corruption directe par éclat : mêmes règles, même coût et même issue que la recette « corrompre » du Cube. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import { Game } from '../../../../src/sim/game';
import type { Item } from '../../../../src/sim/item';
import { corruptShardCheck, corruptWithShard, cubeTransmute } from '../../../../src/sim/cube';
import { corruptionOdds } from '../../../../src/sim/corruption';
import { matCount } from '../../../../src/sim/materials';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { makeMap } from '../../sim/maps';
import { withDefaultSettings } from '../../../../src/sim/save';

Game.resumeOnLoad = true;

function setup(base: string, quality: 'normal' | 'rare' | 'magic', shards = 3) {
  const g = new Game(undefined, 'sorceress');
  const c = g.character;
  c.materials.worldstone_shard = shards;
  const item = generateItem(new Rng('cs:' + base + quality), base, 80, { forceQuality: quality });
  c.inventory.fill(null);
  c.inventory[0] = item;
  return { g, c, item };
}

describe('corruption directe par éclat', () => {
  it.each([
    ['monarch', 'rare'],
    ['ring', 'rare'],
    ['long_sword', 'normal'],
    ['amulet', 'magic'],
  ] as const)('%s %s : même issue que le Cube à graine égale', (base, q) => {
    const a = setup(base, q);
    const b = setup(base, q);
    const ra = corruptWithShard(a.c, { from: 'inv', idx: 0 }, new Rng('seed-x'));
    const rb = cubeTransmute(b.c, new Rng('seed-x'), 'corrupt', [0]);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    expect(ra.note).toBe(rb.note);
    expect({ ...a.c.inventory[0]!, uid: '' }).toEqual({ ...b.c.inventory[0]!, uid: '' });
    expect(matCount(a.c, 'worldstone_shard')).toBe(2);
    expect(matCount(b.c, 'worldstone_shard')).toBe(2);
    expect(a.c.inventory[0]!.corrupted).toBeTruthy();
  });

  it('refus : sans éclat, déjà corrompu, objet non éligible, rien consommé', () => {
    const a = setup('monarch', 'rare', 0);
    expect(corruptShardCheck(a.c, a.item)).toMatchObject({ ok: false, reason: 'Aucun éclat', cost: 1, have: 0 });
    expect(corruptWithShard(a.c, { from: 'inv', idx: 0 }, new Rng('s')).ok).toBe(false);
    a.c.materials.worldstone_shard = 2;
    expect(corruptWithShard(a.c, { from: 'inv', idx: 0 }, new Rng('s')).ok).toBe(true);
    const again = corruptWithShard(a.c, { from: 'inv', idx: 0 }, new Rng('s'));
    expect(again).toMatchObject({ ok: false, reason: 'Déjà corrompu' });
    expect(matCount(a.c, 'worldstone_shard')).toBe(1);
    const p = setup('r01', 'normal');
    expect(corruptShardCheck(p.c, p.item).ok).toBe(false);
    expect(corruptWithShard(p.c, { from: 'inv', idx: 5 }, new Rng('s')).ok).toBe(false);
  });

  it('objet porté et objet du coffre : corruption sur place', () => {
    const a = setup('monarch', 'rare');
    const worn = a.c.inventory[0]!;
    a.c.inventory[0] = null;
    a.c.equipment.offhand = worn;
    expect(corruptWithShard(a.c, { from: 'eq', slot: 'offhand' }, new Rng('s')).ok).toBe(true);
    expect(a.c.equipment.offhand).toBe(worn);
    expect(worn.corrupted).toBeTruthy();
    const ring = generateItem(new Rng('r'), 'ring', 80, { forceQuality: 'rare' });
    a.c.stash[0][3] = ring;
    expect(corruptWithShard(a.c, { from: 'stash', tab: 0, idx: 3 }, new Rng('s')).ok).toBe(true);
    expect(a.c.stash[0][3]!.corrupted).toBeTruthy();
    expect(matCount(a.c, 'worldstone_shard')).toBe(1);
  });

  it('carte : toujours un modificateur, comme le Cube', () => {
    const a = setup('monarch', 'rare');
    const m: Item = makeMap(new Rng('m'), 2, 'rare');
    a.c.inventory[0] = m;
    expect(corruptionOdds(m)).toEqual({ sockets: 0, mod: 1, brick: 0, none: 0 });
    const r = corruptWithShard(a.c, { from: 'inv', idx: 0 }, new Rng('mm'));
    expect(r.ok).toBe(true);
    expect(m.map!.corruptMod).toBeTruthy();
    const b = setup('monarch', 'rare');
    const m2 = makeMap(new Rng('m'), 2, 'rare');
    b.c.inventory[0] = m2;
    cubeTransmute(b.c, new Rng('mm'), 'corrupt', [0]);
    expect(m2.map!.corruptMod).toEqual(m.map!.corruptMod);
  });

  it('probabilités affichées = règles de corruption.ts', () => {
    const rare = generateItem(new Rng('a'), 'monarch', 80, { forceQuality: 'rare' });
    rare.sockets = 0;
    expect(corruptionOdds(rare)).toEqual({ sockets: 0.25, mod: 0.5, brick: 0.25, none: 0 });
    const ring = generateItem(new Rng('b'), 'ring', 80, { forceQuality: 'rare' });
    expect(corruptionOdds(ring)).toEqual({ sockets: 0, mod: 0.75, brick: 0.25, none: 0 });
    const norm = generateItem(new Rng('c'), 'long_sword', 80, { forceQuality: 'normal' });
    expect(corruptionOdds(norm).sockets).toBe(0.5);
  });

  it('réglage de confirmation : absent = actif (module), vrai par défaut dans l’application', () => {
    expect(withDefaultSettings().mods).toBeUndefined();
    expect(withDefaultSettings(null, true).mods?.pd2).toEqual({ autoPickupMaps: 'all', confirmCorrupt: true, confirmMapUpgrade: true });
    // réglage d'avant les mods (à la racine) : repris sous mods.pd2
    expect(withDefaultSettings({ confirmCorrupt: false } as never, true).mods?.pd2?.confirmCorrupt).toBe(false);
  });

  it('Game.corruptItemWithShard : refusé hors de la ville', () => {
    const a = setup('monarch', 'rare');
    a.g.startRun('countess', 0, 7);
    expect(a.g.corruptItemWithShard({ from: 'inv', idx: 0 })).toMatchObject({ ok: false, reason: 'À faire en ville' });
  });
});
