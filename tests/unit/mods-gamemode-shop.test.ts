/**
 * Generic hooks of lot 292 (Survivals' economy and shop), inert without a game mode: rules `shop.sellPrice`, `shop.vendorStock`,
 * `shop.gambleStock`, `shop.gambleRoll` (the base's prices, stalls and gamble odds unchanged), `ui.compareRows` (the base's comparison
 * rows) and `ui.holdToAct` (no long press in the base). Lot 292b: `skills.manaCost` (Diablo II's cost) and `ai.directChase` (the flow
 * field beyond 10 units).
 */
import { describe, expect, it } from 'vitest';
import { RULES } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { Rng } from '../../src/core/rng';
import { baseOf } from '../../src/sim/itemstats';
import { generateItem } from '../../src/sim/loot/itemgen';
import { computeDerived } from '../../src/sim/character';

describe('Shop hooks of lot 292 are inert in the base', () => {
  it('the sell price is the base formula', () => {
    const g = new Game(undefined, 'barbarian');
    const it = generateItem(new Rng('sp'), 'hand_axe', 12, { forceQuality: 'magic' });
    const b = baseOf(it);
    expect(g.sellPrice(it)).toBe(Math.max(1, Math.floor((b.price * 1.6) / 4 + it.ilvl * 3)));
    expect(RULES['shop.sellPrice'](g, it, 77)).toBe(77);
  });

  it('the stalls are the ones rolled (same arrays)', () => {
    const g = new Game(undefined, 'sorceress');
    const stock = [{ item: generateItem(new Rng('v'), 'ring', 5, { forceQuality: 'magic' }), price: 10 }];
    expect(RULES['shop.vendorStock'](g, stock)).toBe(stock);
    const gs = [{ base: 'ring', price: 100 }];
    expect(RULES['shop.gambleStock'](g, gs)).toBe(gs);
    g.refreshVendor();
    expect(g.vendor.length).toBeGreaterThan(0);
    expect(g.gambleStock.length).toBeGreaterThan(0);
  });

  it("the gamble roll keeps the base's odds and draws (quality then level)", () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 20;
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const r1 = new Rng(seed);
      const roll = RULES['shop.gambleRoll'](g, r1);
      const r2 = new Rng(seed);
      const x = r2.float(0, 1);
      // lot 321: Diablo II's odds (GAMBLE_ODDS)
      const q = x < 0.0005 ? 'unique' : x < 0.0015 ? 'set' : x < 0.1015 ? 'rare' : 'magic';
      expect(roll).toEqual({ quality: q, ilvl: Math.max(1, 20 - 5 + r2.int(10)) });
      expect(r1.float(0, 1)).toBe(r2.float(0, 1));
    }
  });

  it('the comparison rows and the long press', () => {
    const g = new Game(undefined, 'sorceress');
    const d = computeDerived(g.character, 0);
    const rows = [{ label: 'Vie', delta: 3, unit: '' }];
    expect(RULES['ui.compareRows'](d, d, rows)).toBe(rows);
    expect(RULES['ui.holdToAct'](g)).toBe(false);
  });

  it('lot 292b: the mana cost and the chase are the base’s', () => {
    const g = new Game(undefined, 'sorceress');
    expect(RULES['skills.manaCost'](g.world, 'fire_bolt', 2.5)).toBe(2.5);
    expect(RULES['ai.directChase'](g.world, {} as never)).toBe(false);
    expect(RULES['skills.castFrames'](g.world, 'attack', 13)).toBe(13);
  });
});
