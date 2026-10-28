/** Ramassage automatique des cartes : jamais dans le sac quand le coffre de cartes est plein */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { makeMap } from '../../sim/maps';
import { Rng } from '../../../../src/core/rng';
import { MAP_STASH_MAX } from '../../../../src/sim/mapstash';
import { tryAutoPickup } from '../../../../src/sim/inventory';
import { shouldAutoPickupCfg } from '../../../../src/sim/loot/filter';

function setup(stashCount: number) {
  const g = new Game(undefined, 'sorceress');
  g.character.level = 80;
  g.character.progression.highestDifficulty = 2;
  g.character.mapStash = Array.from({ length: stashCount }, (_, i) => makeMap(new Rng(`s${i}`), 1));
  g.character.inventory[0] = makeMap(new Rng('go'), 3, 'rare', 'kyovashad');
  expect(g.startMap({ invIndex: 0 }, 5).ok).toBe(true);
  const w = g.world;
  w.autoCfg = { mods: { pd2: { autoPickupMaps: 'all' } } };
  const item = makeMap(new Rng('drop'), 2);
  w.items.push({ id: 987654, item, x: w.player.x, y: w.player.y, dropTick: -100 } as never);
  return { g, w, item };
}
const inBag = (c: { inventory: (unknown | null)[] }, uid: string) => c.inventory.some((x) => (x as { uid?: string } | null)?.uid === uid);

describe('Ramassage automatique des cartes', () => {
  it('coffre de cartes non plein : la carte y va', () => {
    const { g, w, item } = setup(10);
    tryAutoPickup(w);
    expect(g.character.mapStash!.some((m) => m.uid === item.uid)).toBe(true);
    expect(inBag(g.character, item.uid)).toBe(false);
  });
  it('coffre de cartes plein : la carte reste au sol, rien dans le sac', () => {
    const { g, w, item } = setup(MAP_STASH_MAX);
    expect(shouldAutoPickupCfg(g.character, item, { mods: { pd2: { autoPickupMaps: 'all' } } })).toBe(false);
    for (let i = 0; i < 20; i++) {
      w.tick = 100 + i * 5;
      tryAutoPickup(w);
    }
    expect(w.items.some((x) => x.item.uid === item.uid)).toBe(true);
    expect(inBag(g.character, item.uid)).toBe(false);
    expect(g.character.mapStash!.length).toBe(MAP_STASH_MAX);
  });
});
