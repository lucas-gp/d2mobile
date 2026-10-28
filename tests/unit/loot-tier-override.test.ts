import { describe, expect, it } from 'vitest';
import '../../src/data/items/index';
import { UNIQUE_BY_ID } from '../../src/data/items/uniques';
import { newCharacter } from '../../src/sim/character';
import { lootTier, lootTierFor, lootFilterDecision, tierOf } from '../../src/sim/loot/filter';
import { MAX_TIER_OVERRIDES, sanitizeTierOverride, withTierOverrides } from '../../src/sim/loot/tiers';
import { migrate, SAVE_VERSION } from '../../src/sim/save';
import type { Item } from '../../src/sim/item';

let n = 0;
const mk = (o: Partial<Item> & { base: string; quality: Item['quality'] }): Item => ({ uid: `o${n++}`, ilvl: 85, sockets: 0, socketed: [], ...o });
const soj = mk({ base: UNIQUE_BY_ID.u_the_stone_of_jordan.base, quality: 'unique', uniqueId: 'u_the_stone_of_jordan' });
const rune = mk({ base: 'r15', quality: 'normal' });
const plain = mk({ base: 'archon_plate', quality: 'normal', sockets: 4, ethereal: true });
const mkc = () => newCharacter(undefined, 'sorceress');

describe('Paliers de butin réaffectés', () => {
  it('sans override : identique à lootTier', () => {
    const c = mkc();
    for (const it of [soj, rune, plain]) expect(lootTierFor(c, it)).toBe(lootTier(it));
    c.filter.tierOverride = [];
    expect(lootTierFor(c, soj)).toBe(lootTier(soj));
  });
  it('override prioritaire, palier 0 compris', () => {
    const c = mkc();
    expect(lootTier(soj)).toBe(4);
    c.filter.tierOverride = [{ id: 'unique:u_the_stone_of_jordan', tier: 5 }];
    expect(lootTierFor(c, soj)).toBe(5);
    c.filter.tierOverride = [{ id: 'unique:u_the_stone_of_jordan', tier: 0 }];
    expect(lootTierFor(c, soj)).toBe(0);
    expect(tierOf(c, 'unique:u_the_stone_of_jordan')).toBe(0);
    expect(tierOf(mkc(), 'unique:u_the_stone_of_jordan')).toBe(4);
  });
  it('unique plus précis que la base, la base ne touche pas les uniques', () => {
    const c = mkc();
    c.filter.tierOverride = [{ id: `base:${soj.base}`, tier: 5 }];
    expect(lootTierFor(c, soj)).toBe(4);
    c.filter.tierOverride.push({ id: 'unique:u_the_stone_of_jordan', tier: 3 });
    expect(lootTierFor(c, soj)).toBe(3);
    c.filter.tierOverride = [{ id: 'base:r15', tier: 5 }];
    expect(lootTierFor(c, rune)).toBe(5);
    expect(tierOf(c, 'base:r15')).toBe(5);
  });
  it('ne rend jamais visible un objet masqué', () => {
    const c = mkc();
    c.filter.hideLowRunes = 20;
    c.filter.tierOverride = [{ id: 'base:r15', tier: 5 }];
    expect(lootFilterDecision(c, rune)).toBe(0);
    c.filter.hideLowRunes = 0;
    expect(lootFilterDecision(c, rune)).toBe(5);
  });
  it('assainissement, plafond, mise à jour', () => {
    expect(sanitizeTierOverride('x')).toBeUndefined();
    expect(sanitizeTierOverride([{ id: 'base:r1', tier: 4 }, { id: 'base:r1', tier: 5 }, { id: 'zz:r1', tier: 4 }, { id: 'base:a', tier: 2 }, null, { id: 'set:s', tier: 3 }])).toEqual([
      { id: 'base:r1', tier: 4 },
      { id: 'set:s', tier: 3 },
    ]);
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `base:b${i}`, tier: 3 }));
    expect(sanitizeTierOverride(many)!.length).toBe(MAX_TIER_OVERRIDES);
    const r = withTierOverrides(sanitizeTierOverride(many), ['base:new'], 5);
    expect(r.skipped).toBe(1);
    const a = withTierOverrides(undefined, ['base:a', 'base:b'], 4);
    expect(withTierOverrides(a.list, ['base:a'], 5).list).toEqual([
      { id: 'base:a', tier: 5 },
      { id: 'base:b', tier: 4 },
    ]);
    expect(withTierOverrides(a.list, ['base:a'], null).list).toEqual([{ id: 'base:b', tier: 4 }]);
  });
  it('aller-retour de sauvegarde', () => {
    const c = mkc();
    c.filter.tierOverride = [{ id: 'unique:u_the_stone_of_jordan', tier: 5 }, { id: 'bad', tier: 9 } as never];
    const out = migrate({ version: SAVE_VERSION, character: JSON.parse(JSON.stringify(c)), settings: {} });
    expect(out.character.filter.tierOverride).toEqual([{ id: 'unique:u_the_stone_of_jordan', tier: 5 }]);
  });
});
