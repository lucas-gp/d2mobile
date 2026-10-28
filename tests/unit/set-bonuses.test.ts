/** Bonus de set (PD2) : actifs selon le nombre de pièces portées, pièces exigées (`with`), effet sur le personnage, infobulle. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { generateItem } from '../../src/sim/loot/itemgen';
import { setBonuses, partialActive, wornSetPieces } from '../../src/sim/itemstats';
import { SET_BY_ID, SET_ITEM_BY_ID } from '../../src/data/items/sets';
import { withoutPd2 } from '../needs-pd2';
import type { Item } from '../../src/sim/item';

function piece(id: string): Item {
  const d = SET_ITEM_BY_ID[id];
  const it = generateItem(new Rng(5), d.base, 40);
  it.quality = 'set';
  it.setId = id;
  return it;
}

describe('Bonus de set', () => {
  it.skipIf(!withoutPd2)('Civerb (D2 1.13c, Sets.txt) : le bonus de 2 pièces s’active à 2 pièces, celui de la panoplie complète à 3', () => {
    const two = setBonuses([piece('s_civerbs_ward'), piece('s_civerbs_icon')], 30);
    expect(two.stats.get('resFire')).toBe(15);
    expect(two.stats.get('resLight') ?? 0).toBe(0);
    const three = setBonuses([piece('s_civerbs_ward'), piece('s_civerbs_icon'), piece('s_civerbs_cudgel')], 30);
    expect(three.stats.get('resLight')).toBe(25);
    expect(three.stats.get('str')).toBe(15);
    expect(three.stats.get('dmgUndeadPct')).toBe(200);
  });

  it.skipIf(withoutPd2)('Civerb (PD2) : le bonus de 2 pièces s’active à 2 pièces, celui de la panoplie complète à 3', () => {
    const two = setBonuses([piece('s_civerbs_ward'), piece('s_civerbs_icon')], 30);
    expect(two.stats.get('resFire')).toBe(25);
    expect(two.stats.get('resLight') ?? 0).toBe(0);
    const three = setBonuses([piece('s_civerbs_ward'), piece('s_civerbs_icon'), piece('s_civerbs_cudgel')], 30);
    expect(three.stats.get('resLight')).toBe(25);
    expect(three.stats.get('str')).toBe(15);
  });

  it('un bonus lié à une pièce précise exige cette pièce', () => {
    const set = SET_BY_ID.set_civerbs_vestments;
    const worn = wornSetPieces([piece('s_civerbs_ward'), piece('s_civerbs_icon')], set.id);
    const p = { count: 2, with: ['s_civerbs_cudgel'] };
    expect(partialActive(p, worn)).toBe(false);
    expect(partialActive({ count: 2 }, worn)).toBe(true);
  });

  it('les bonus par niveau et les bonus locaux (défense, dégâts) sont convertis', () => {
    // Isenhart : défense par niveau en bonus de pièce
    const items = SET_BY_ID.set_isenharts_armory.items.map(piece);
    const r = setBonuses(items, 50);
    expect(r.local.defFlat + r.local.maxDmg + r.stats.size).toBeGreaterThan(0);
  });
});
