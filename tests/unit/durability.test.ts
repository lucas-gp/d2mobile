/** Durabilité : usure, objet brisé sans effet, réparation payante. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { computeDerived } from '../../src/sim/character';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { durabilityOf, isBroken, maxDurability, repairAllCost, wear } from '../../src/sim/durability';
import { withoutPd2 } from '../needs-pd2';

describe('Durabilité', () => {
  it('les armes et armures ont leur durabilité de base D2 ; les bijoux n’en ont pas', () => {
    const sword = generateItem(new Rng(1), 'long_sword', 20, { forceQuality: 'normal' });
    expect(maxDurability(sword)).toBe(44);
    expect(maxDurability(generateItem(new Rng(1), 'ring', 20, { forceQuality: 'normal' }))).toBe(0);
  });

  it('une armure brisée n’apporte plus de défense ; la réparation la rend', () => {
    const g = new Game();
    const c = g.character;
    const armor = generateItem(new Rng(2), 'breast_plate', 40, { forceQuality: 'normal' });
    c.equipment.body = armor;
    c.gold = 1e6;
    const before = computeDerived(c, 0).defense;
    wear(armor, 1000);
    expect(isBroken(armor)).toBe(true);
    expect(computeDerived(c, 0).defense).toBeLessThan(before);
    expect(repairAllCost(c)).toBeGreaterThan(0);
    expect(g.repairEquipment()).toBe(true);
    expect(durabilityOf(armor)).toBe(maxDurability(armor));
    expect(computeDerived(c, 0).defense).toBe(before);
    expect(c.gold).toBeLessThan(1e6);
  });

  it('refuse de réparer sans assez d’or', () => {
    const g = new Game();
    const c = g.character;
    const armor = generateItem(new Rng(3), 'breast_plate', 40, { forceQuality: 'normal' });
    c.equipment.body = armor;
    wear(armor, 1000);
    c.gold = 0;
    expect(g.repairEquipment()).toBe(false);
    expect(isBroken(armor)).toBe(true);
  });
});

describe('Jeu d’argent', () => {
  it.skipIf(withoutPd2)('le marchand propose aussi des armes et des carquois (types tirés au sort)', () => {
    const g = new Game(undefined, 'amazon');
    g.character.level = 60;
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      g.refreshGamble();
      for (const e of g.gambleStock) seen.add(BASE_BY_ID[e.base].type);
    }
    expect(seen.has('quiver')).toBe(true);
    expect(seen.has('bow')).toBe(true);
  });
  it('neuf objets proposés ; l’achat débite l’or et révèle un objet', () => {
    const g = new Game();
    g.character.gold = 1e6;
    g.refreshGamble();
    expect(g.gambleStock.length).toBeGreaterThanOrEqual(6);
    const n = g.gambleStock.length;
    const price = g.gambleStock[0].price;
    const r = g.gamble(0);
    expect(r.ok).toBe(true);
    expect(r.item).toBeTruthy();
    expect(g.character.gold).toBe(1e6 - price);
    expect(g.gambleStock.length).toBe(n - 1);
  });
  it('refuse sans assez d’or', () => {
    const g = new Game();
    g.character.gold = 0;
    g.refreshGamble();
    expect(g.gamble(0).ok).toBe(false);
  });
});
