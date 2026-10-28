/** Amélioration directe d'une carte : mêmes recettes, coûts et issues que le Cube. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import { Game } from '../../../../src/sim/game';
import { cubeTransmute, type MapRef } from '../../../../src/sim/cube';
import { MAP_OPS, mapOpCheck, upgradeMapWith, type MapOpId } from '../../sim/mapops';
import { matCount } from '../../../../src/sim/materials';
import { makeMap } from '../../sim/maps';
import type { Quality } from '../../../../src/sim/item';

Game.resumeOnLoad = true;

const MAT: Record<MapOpId, string> = {
  arcane: 'orb_arcane',
  zakarum: 'orb_zakarum',
  angelic: 'orb_angelic',
  horadrim: 'orb_horadrim',
  destruction: 'orb_destruction',
  fortification: 'orb_fortification',
  catalyst: 'catalyst_shard',
  heroes: 'standard_heroes',
  scarab: 'horadrim_scarab',
  corrupt: 'worldstone_shard',
};
const RECIPE = (op: MapOpId) => MAP_OPS.find((o) => o.id === op)!.recipe;

function setup(q: Quality, tier = 1) {
  const g = new Game(undefined, 'sorceress');
  const c = g.character;
  for (const m of Object.values(MAT)) c.materials[m] = 3;
  c.inventory.fill(null);
  c.inventory[0] = makeMap(new Rng('mu:' + q + tier), tier, q);
  return { g, c };
}
const strip = (x: unknown) => ({ ...(x as object), uid: '' });

describe('amélioration de carte', () => {
  const cases: [MapOpId, Quality, number][] = [
    ['arcane', 'normal', 1],
    ['arcane', 'magic', 1],
    ['zakarum', 'normal', 1],
    ['angelic', 'magic', 2],
    ['horadrim', 'rare', 1],
    ['destruction', 'rare', 1],
    ['fortification', 'magic', 1],
    ['catalyst', 'rare', 1],
    ['heroes', 'magic', 1],
    ['scarab', 'normal', 3],
    ['corrupt', 'rare', 2],
  ];
  it.each(cases)('%s sur carte %s (T%i) : même issue que le Cube à graine égale, 1 ingrédient consommé', (op, q, tier) => {
    const a = setup(q, tier);
    const b = setup(q, tier);
    const ra = upgradeMapWith(a.c, { from: 'inv', idx: 0 }, op, new Rng('seed-m'));
    const rb = cubeTransmute(b.c, new Rng('seed-m'), RECIPE(op), [0]);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    expect(ra.note).toBe(rb.note);
    expect(strip(a.c.inventory.find((x) => x?.map))).toEqual(strip(b.c.inventory.find((x) => x?.map)));
    expect(matCount(a.c, MAT[op])).toBe(2);
    expect(matCount(b.c, MAT[op])).toBe(2);
  });

  it('refus sans rien consommer (mauvaise qualité, sans stock, déjà corrompue)', () => {
    const a = setup('rare');
    const ref: MapRef = { from: 'inv', idx: 0 };
    const before = JSON.stringify(a.c);
    expect(upgradeMapWith(a.c, ref, 'zakarum', new Rng('x'))).toMatchObject({ ok: false, reason: 'Carte normale requise' });
    expect(upgradeMapWith(a.c, ref, 'scarab', new Rng('x')).ok).toBe(false);
    expect(JSON.stringify(a.c)).toBe(before);
    a.c.materials.orb_horadrim = 0;
    expect(upgradeMapWith(a.c, ref, 'horadrim', new Rng('x'))).toMatchObject({ ok: false, reason: 'Aucun orbe' });
    expect(upgradeMapWith(a.c, ref, 'corrupt', new Rng('x')).ok).toBe(true);
    expect(upgradeMapWith(a.c, ref, 'destruction', new Rng('x'))).toMatchObject({ ok: false, reason: 'Déjà corrompue' });
    expect(mapOpCheck(a.c, a.c.inventory[0], 'corrupt')).toMatchObject({ ok: false, reason: 'Déjà corrompue' });
    expect(matCount(a.c, 'orb_destruction')).toBe(3);
    // catalyseur déjà posé
    const b = setup('rare');
    expect(upgradeMapWith(b.c, { from: 'inv', idx: 0 }, 'catalyst', new Rng('y')).ok).toBe(true);
    expect(upgradeMapWith(b.c, { from: 'inv', idx: 0 }, 'catalyst', new Rng('y'))).toMatchObject({ ok: false, reason: 'Carte déjà infusée' });
    expect(matCount(b.c, 'catalyst_shard')).toBe(2);
  });

  it('qualités successives normale → magique → rare → corrompue', () => {
    const { c } = setup('normal');
    const ref: MapRef = { from: 'inv', idx: 0 };
    expect(upgradeMapWith(c, ref, 'arcane', new Rng('1')).ok).toBe(true);
    expect(c.inventory[0]!.quality).toBe('magic');
    expect(upgradeMapWith(c, ref, 'angelic', new Rng('2')).ok).toBe(true);
    expect(c.inventory[0]!.quality).toBe('rare');
    expect(c.inventory[0]!.map!.mods.length).toBeGreaterThanOrEqual(4);
    expect(upgradeMapWith(c, ref, 'destruction', new Rng('3')).ok).toBe(true);
    expect(c.inventory[0]!.quality).toBe('normal');
    expect(c.inventory[0]!.map!.mods.length).toBe(0);
    expect(upgradeMapWith(c, ref, 'corrupt', new Rng('4')).ok).toBe(true);
    expect(c.inventory[0]!.map!.corruptMod).toBeTruthy();
  });

  it('cartes du coffre et du coffre de cartes ; le scarabée remplace la carte sur place', () => {
    const { c } = setup('normal', 3);
    c.inventory[0] = null;
    c.stash[0][5] = makeMap(new Rng('st'), 1, 'normal');
    c.mapStash = [makeMap(new Rng('ms'), 3, 'normal')];
    expect(upgradeMapWith(c, { from: 'stash', tab: 0, idx: 5 }, 'zakarum', new Rng('a')).ok).toBe(true);
    expect(c.stash[0][5]!.quality).toBe('rare');
    expect(upgradeMapWith(c, { from: 'mapstash', idx: 0 }, 'scarab', new Rng('b')).ok).toBe(true);
    expect(c.mapStash).toHaveLength(1);
    expect(c.mapStash[0].map!.tier).toBe(4);
    expect(upgradeMapWith(c, { from: 'mapstash', idx: 3 }, 'zakarum', new Rng('c')).ok).toBe(false);
  });

  it('Game.upgradeMap : ville seulement', () => {
    const { g, c } = setup('normal');
    (g as unknown as { mode: string }).mode = 'run';
    expect(g.upgradeMap({ from: 'inv', idx: 0 }, 'arcane')).toMatchObject({ ok: false, reason: 'À faire en ville' });
    expect(matCount(c, 'orb_arcane')).toBe(3);
    (g as unknown as { mode: string }).mode = 'town';
    expect(g.upgradeMap({ from: 'inv', idx: 0 }, 'arcane').ok).toBe(true);
    expect(c.inventory[0]!.quality).toBe('magic');
    expect(matCount(c, 'orb_arcane')).toBe(2);
  });
});
