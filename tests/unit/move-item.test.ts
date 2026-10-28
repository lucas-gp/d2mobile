/** Glisser-déposer : déplacer un objet dans le sac, entre sac et coffre, échange avec un autre objet. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { INV_COLS, moveItem } from '../../src/sim/inventory';

const item = (base: string, seed: number) => generateItem(new Rng(seed), base, 20, { forceQuality: 'normal' });

describe('moveItem', () => {
  it('déplace dans le sac sur une case libre', () => {
    const c = new Game().character;
    c.inventory.fill(null);
    const a = item('amulet', 1);
    c.inventory[0] = a;
    expect(moveItem(c, { grid: 'inv' }, 0, { grid: 'inv' }, 5 + INV_COLS)).toBe(true);
    expect(c.inventory[0]).toBeNull();
    expect(c.inventory[5 + INV_COLS]).toBe(a);
  });

  it('sac → coffre et coffre → sac', () => {
    const c = new Game().character;
    c.inventory.fill(null);
    const a = item('amulet', 2);
    c.inventory[3] = a;
    expect(moveItem(c, { grid: 'inv' }, 3, { grid: 'stash', tab: 1 }, 12)).toBe(true);
    expect(c.stash[1][12]).toBe(a);
    expect(moveItem(c, { grid: 'stash', tab: 1 }, 12, { grid: 'inv' }, 7)).toBe(true);
    expect(c.inventory[7]).toBe(a);
    expect(c.stash[1][12]).toBeNull();
  });

  it('échange avec un seul objet gênant ; refuse si plusieurs gênent ou si rien ne tient', () => {
    const c = new Game().character;
    c.inventory.fill(null);
    const a = item('amulet', 3);
    const b = item('ring', 4);
    c.inventory[0] = a;
    c.inventory[1] = b;
    expect(moveItem(c, { grid: 'inv' }, 0, { grid: 'inv' }, 1)).toBe(true);
    expect(c.inventory[1]).toBe(a);
    expect(c.inventory[0]).toBe(b);
    // hors grille
    expect(moveItem(c, { grid: 'inv' }, 0, { grid: 'inv' }, 9999)).toBe(false);
    expect(c.inventory[0]).toBe(b);
  });

  it('un objet de plusieurs cases ne dépasse pas de la grille', () => {
    const c = new Game().character;
    c.inventory.fill(null);
    const big = item('long_sword', 5);
    c.inventory[0] = big;
    expect(moveItem(c, { grid: 'inv' }, 0, { grid: 'inv' }, INV_COLS - 1)).toBe(false);
    expect(c.inventory[0]).toBe(big);
  });
});
