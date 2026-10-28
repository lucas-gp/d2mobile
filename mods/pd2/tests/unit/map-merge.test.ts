/** Fusion en lot des cartes du coffre de cartes : mêmes recettes que le Cube (map_cartographer, map_three). */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import { Game } from '../../../../src/sim/game';
import { cubeTransmute, stashBagMaps } from '../../../../src/sim/cube';
import { mergeMapsFromStash, mergeMapsPreview } from '../../sim/mapops';
import { matCount } from '../../../../src/sim/materials';
import { makeMap } from '../../sim/maps';
import { MAP_STASH_MAX } from '../../../../src/sim/mapstash';
import type { Quality } from '../../../../src/sim/item';

Game.resumeOnLoad = true;

function setup(spec: [number, Quality, number][], orbs = 10) {
  const g = new Game(undefined, 'sorceress');
  const c = g.character;
  c.materials.orb_cartographer = orbs;
  c.inventory.fill(null);
  c.mapStash = [];
  let k = 0;
  for (const [tier, q, n] of spec) for (let i = 0; i < n; i++) c.mapStash.push(makeMap(new Rng(`mm${k++}`), tier, q));
  return { g, c };
}
const tiers = (c: ReturnType<typeof setup>['c']) =>
  c
    .mapStash!.map((m) => `${m.map!.tier}${m.quality[0]}`)
    .sort()
    .join(',');

describe('fusion de cartes en lot', () => {
  it('lots complets seulement, coût en orbes, T1 -> T2', () => {
    const { c } = setup([[1, 'normal', 14]]);
    const r = mergeMapsFromStash(c, { tier: 1, mode: 'upgrade' }, new Rng('a'));
    expect(r).toMatchObject({ ok: true, lots: 4, consumed: 12, produced: 4, orbsUsed: 4, toTier: 2 });
    expect(c.mapStash).toHaveLength(6);
    expect(tiers(c)).toBe('1n,1n,2n,2n,2n,2n');
    expect(matCount(c, 'orb_cartographer')).toBe(6);
  });

  it('arrêt quand les orbes manquent, maxLots, aperçu cohérent', () => {
    const { c } = setup([[1, 'normal', 14]], 2);
    const pv = mergeMapsPreview(c, { tier: 1, mode: 'upgrade' });
    expect(pv).toMatchObject({ ok: true, lots: 2, orbsNeeded: 2, orbsHave: 2, consumed: 6, eligible: 14 });
    const r = mergeMapsFromStash(c, { tier: 1, mode: 'upgrade' }, new Rng('a'));
    expect(r).toMatchObject({ lots: pv.lots, consumed: pv.consumed, orbsUsed: pv.orbsNeeded });
    expect(matCount(c, 'orb_cartographer')).toBe(0);
    expect(mergeMapsFromStash(c, { tier: 1, mode: 'upgrade' }, new Rng('b'))).toMatchObject({ ok: false, reason: 'Aucun orbe' });
    const d = setup([[1, 'normal', 14]]);
    expect(mergeMapsFromStash(d.c, { tier: 1, mode: 'upgrade', maxLots: 1 }, new Rng('c')).lots).toBe(1);
  });

  it('mode « même palier » : gratuit, 3 -> 1, T3 permis, pas de T3 -> T4', () => {
    const { c } = setup([[3, 'normal', 7]], 0);
    expect(mergeMapsFromStash(c, { tier: 3, mode: 'upgrade' }, new Rng('a'))).toMatchObject({ ok: false, reason: 'Paliers 1 et 2 seulement' });
    const r = mergeMapsFromStash(c, { tier: 3, mode: 'same' }, new Rng('a'));
    expect(r).toMatchObject({ ok: true, lots: 2, consumed: 6, produced: 2, orbsUsed: 0, toTier: 3 });
    expect(c.mapStash).toHaveLength(3);
  });

  it('qualités consommées : jamais rare, unique, corrompue ; normales d’abord', () => {
    const { c } = setup([
      [1, 'normal', 2],
      [1, 'magic', 4],
      [1, 'rare', 6],
      [1, 'unique', 3],
    ]);
    c.mapStash![0].corrupted = { outcome: 'mod', mods: [] };
    c.mapStash!.find((m) => m.quality === 'magic')!.map!.fortified = true;
    expect(mergeMapsPreview(c, { tier: 1, mode: 'upgrade' })).toMatchObject({ ok: false, reason: 'Moins de 3 cartes éligibles' });
    const pv = mergeMapsPreview(c, { tier: 1, mode: 'upgrade', quality: 'normalmagic' });
    expect(pv).toMatchObject({ lots: 1, consumed: 3, byQuality: { normal: 1, magic: 2 } });
    const rare = c.mapStash!.filter((m) => m.quality === 'rare').length;
    mergeMapsFromStash(c, { tier: 1, mode: 'upgrade', quality: 'normalmagic' }, new Rng('q'));
    expect(c.mapStash!.filter((m) => m.quality === 'rare')).toHaveLength(rare);
    expect(c.mapStash!.filter((m) => m.quality === 'unique')).toHaveLength(3);
    expect(c.mapStash!.some((m) => m.corrupted)).toBe(true);
    expect(c.mapStash!.some((m) => m.map!.fortified)).toBe(true);
    // « notrare » prend aussi la fortifiée
    const p2 = mergeMapsPreview(c, { tier: 1, mode: 'same', quality: 'notrare' });
    expect(p2.eligible).toBeGreaterThan(mergeMapsPreview(c, { tier: 1, mode: 'same', quality: 'normalmagic' }).eligible);
  });

  it('un lot : même issue que le Cube à graine égale', () => {
    const a = setup([[1, 'normal', 3]]);
    const b = setup([[1, 'normal', 3]]);
    b.c.mapStash!.forEach((m) => b.c.inventory.push(m));
    b.c.inventory = b.c.inventory.filter(Boolean);
    b.c.mapStash = [];
    mergeMapsFromStash(a.c, { tier: 1, mode: 'upgrade' }, new Rng('same'));
    const rb = cubeTransmute(b.c, new Rng('same'), 'map_cartographer', [0, 1, 2]);
    expect(rb.ok).toBe(true);
    const made = b.c.inventory.find((x) => x?.map)!;
    expect({ ...a.c.mapStash![0], uid: '' }).toEqual({ ...made, uid: '' });
    expect(matCount(a.c, 'orb_cartographer')).toBe(matCount(b.c, 'orb_cartographer'));
  });

  it('refus sans consommer ; ville seulement ; plafond du coffre', () => {
    const { g, c } = setup([[1, 'normal', 2]]);
    const before = JSON.stringify(c);
    expect(mergeMapsFromStash(c, { tier: 1, mode: 'upgrade' }, new Rng('x')).ok).toBe(false);
    expect(JSON.stringify(c)).toBe(before);
    for (let i = 0; i < 3; i++) c.mapStash!.push(makeMap(new Rng('z' + i), 1, 'normal'));
    (g as unknown as { mode: string }).mode = 'run';
    expect(g.mergeMaps({ tier: 1, mode: 'upgrade' })).toMatchObject({ ok: false, reason: 'À faire en ville' });
    expect(c.mapStash).toHaveLength(5);
    (g as unknown as { mode: string }).mode = 'town';
    expect(g.mergeMaps({ tier: 1, mode: 'upgrade' }).ok).toBe(true);
    // coffre plein : la fusion libère de la place
    const f = setup([[1, 'normal', MAP_STASH_MAX]], 100);
    const r = mergeMapsFromStash(f.c, { tier: 1, mode: 'upgrade' }, new Rng('f'));
    expect(r.ok).toBe(true);
    expect(f.c.mapStash!.length).toBeLessThanOrEqual(MAP_STASH_MAX);
  });

  it('ranger les cartes du sac', () => {
    const { c } = setup([]);
    c.inventory[0] = makeMap(new Rng('s1'), 1, 'normal');
    c.inventory[5] = makeMap(new Rng('s2'), 2, 'rare');
    expect(stashBagMaps(c)).toBe(2);
    expect(c.mapStash).toHaveLength(2);
    expect(c.inventory.some((x) => x?.map)).toBe(false);
  });
});
