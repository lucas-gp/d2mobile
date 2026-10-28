/** Carquois de mercenaire : l'Éclaireuse (arc / arbalète) porte un carquois dans l'emplacement secondaire. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { canMercEquip, mercDerived } from '../../../../src/sim/merc';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { Rng } from '../../../../src/core/rng';
import { MERC_BY_ID, mercSlotFor, mercSlots } from '../../../../src/data/mercs';
import { BASE_BY_ID } from '../../../../src/data/items';
import type { Item } from '../../../../src/sim/item';

function rogueGame(): Game {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(50));
  g.character.gold = 1e7;
  g.enterTown();
  expect(g.hireMerc('rogue', 'cold').ok).toBe(true);
  return g;
}
const item = (base: string): Item => generateItem(new Rng(`mq-${base}`), base, 40, { forceQuality: 'normal' });
const give = (g: Game, it: Item, idx: number): void => {
  g.character.inventory[idx] = it;
};

describe('Carquois de mercenaire', () => {
  it("seule l'Éclaireuse a un emplacement secondaire sans bouclier, et le carquois n'y va qu'en offhand", () => {
    const rogue = MERC_BY_ID.rogue;
    expect(mercSlots(rogue)).toContain('offhand');
    expect(mercSlotFor(rogue, BASE_BY_ID.sharp_arrows)).toBe('offhand');
    expect(mercSlotFor(rogue, BASE_BY_ID.heavy_bolts)).toBe('offhand');
    for (const id of ['desert', 'barbarian'] as const) {
      expect(mercSlotFor(MERC_BY_ID[id], BASE_BY_ID.sharp_arrows)).toBeNull();
      expect(mercSlots(MERC_BY_ID[id])).not.toContain('offhand');
    }
    // les mercenaires à bouclier n'acceptent pas non plus le carquois (réservé à l'arc)
    expect(mercSlotFor(MERC_BY_ID.ironwolf, BASE_BY_ID.sharp_arrows)).toBeNull();
  });

  it('refuse le carquois sans arme, avec la mauvaise munition, accepte avec la bonne', () => {
    const g = rogueGame();
    const arrows = item('sharp_arrows');
    const bolts = item('heavy_bolts');
    expect(canMercEquip(g.character, arrows).ok).toBe(false); // pas d'arc
    give(g, item('long_bow'), 0);
    expect(g.mercEquip(0).ok).toBe(true);
    expect(canMercEquip(g.character, bolts).ok).toBe(false); // carreaux avec un arc
    expect(canMercEquip(g.character, arrows)).toMatchObject({ ok: true, slot: 'offhand' });
  });

  it('un bouclier reste refusé à l’Éclaireuse', () => {
    const g = rogueGame();
    expect(canMercEquip(g.character, item('buckler')).ok).toBe(false);
  });

  it('équiper un carquois via « Donner au mercenaire » applique ses dégâts maximum à l’arc', () => {
    const g = rogueGame();
    give(g, item('long_bow'), 0);
    g.mercEquip(0);
    const before = mercDerived(g.character)!;
    give(g, item('razor_arrows'), 1); // +18 dégâts maximum
    expect(g.mercEquip(1).ok).toBe(true);
    expect(g.character.merc!.equipment.offhand?.base).toBe('razor_arrows');
    const after = mercDerived(g.character)!;
    expect(after.dmg[1]).toBeGreaterThan(before.dmg[1] + 15);
    expect(after.dmg[0]).toBeCloseTo(before.dmg[0], 5);
  });

  it('carreaux : résistance physique ennemie réduite uniquement avec une arbalète', () => {
    const g = rogueGame();
    give(g, item('crossbow'), 0);
    g.mercEquip(0);
    give(g, item('war_bolts'), 1);
    expect(g.mercEquip(1).ok).toBe(true);
    expect(mercDerived(g.character)!.pierceRes.phys).toBe(6);
    // on remplace l'arbalète par un arc : le carquois de carreaux devient inactif
    give(g, item('long_bow'), 2);
    expect(g.mercEquip(2).ok).toBe(true);
    expect(mercDerived(g.character)!.pierceRes.phys ?? 0).toBe(0);
  });

  it('retirer le carquois restitue l’objet et retire les bonus', () => {
    const g = rogueGame();
    give(g, item('long_bow'), 0);
    g.mercEquip(0);
    const base = mercDerived(g.character)!.dmg[1];
    give(g, item('razor_arrows'), 1);
    g.mercEquip(1);
    expect(g.mercUnequip('offhand').ok).toBe(true);
    expect(g.character.inventory.some((x) => x?.base === 'razor_arrows')).toBe(true);
    expect(mercDerived(g.character)!.dmg[1]).toBeCloseTo(base, 5);
  });

  it('classOnly respecté : un carquois ne se donne pas à un autre type de mercenaire', () => {
    const g = new Game(undefined, 'sorceress');
    addXp(g.character, xpToReach(50));
    g.character.gold = 1e7;
    g.enterTown();
    g.hireMerc('desert', 'defiance');
    expect(canMercEquip(g.character, item('sharp_arrows')).ok).toBe(false);
  });
});
