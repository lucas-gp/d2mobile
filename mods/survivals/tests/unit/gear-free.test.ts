/**
 * Gear without restriction in Survivals (lot 290, owner's order): in the Run and in the Campaign, on d2+survivals and pd2+survivals, any
 * item of a slot is worn whatever its level, strength, dexterity or class requirement, and counts at once; the loot walked over is put on
 * in an empty slot or in place of a clearly worse item of the same kind, never a downgrade. Without the mode, Diablo II's rules.
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup(ruleset = 'd2+survivals', extra: Parameters<typeof activate>[1] = []) {
  const env = await activate(ruleset, extra);
  const I = await import('../../../../src/sim/loot/itemgen');
  const IS = await import('../../../../src/sim/itemstats');
  const C = await import('../../../../src/sim/character');
  const L = await import('../../sim/loot');
  const { Rng } = await import('../../../../src/core/rng');
  const create = (variant: string, cls = 'sorceress') => {
    const g = new env.G.Game(undefined, cls as never);
    g.character.name = `Gear ${variant}`;
    for (const f of env.U.contributions('create.character')) f({ game: g, variant });
    return g;
  };
  /** A rare helm far above a level-1 hero: level, strength requirements */
  const heavyHelm = (seed = 'lot290') => {
    const rng = new Rng(seed);
    for (;;) {
      const it = I.generateItem(rng, 'great_helm', 70, { forceQuality: 'rare' });
      if (IS.requiredLevel(it) >= 30) return it;
    }
  };
  return { ...env, I, IS, C, L, Rng, create, heavyHelm };
}

describe('Survivals: gear without requirements (lot 290)', () => {
  for (const variant of ['run', 'campaign'])
    it(`${variant}: a level-1 hero wears a level-30+ helm needing 63 strength, active at once (its defense counted)`, async () => {
      const { C, IS, create, heavyHelm } = await setup();
      const g = create(variant);
      const c = g.character;
      expect(c.level).toBe(1);
      delete c.equipment.head;
      const helm = heavyHelm();
      expect(IS.requiredLevel(helm)).toBeGreaterThan(c.level);
      // Diablo II would refuse it (canEquip, the requirements counted)...
      expect(C.canEquip(c, helm).ok).toBe(false);
      // ...the mode does not
      expect(C.canWear(c, helm).ok).toBe(true);
      const before = C.computeDerived(c, 0).defense;
      c.inventory[0] = helm;
      expect(g.equip(0).ok).toBe(true);
      expect(c.equipment.head).toBe(helm);
      expect(C.activeItems(c)).toContain(helm);
      expect(C.computeDerived(c, 0).defense).toBeGreaterThan(before + 20);
      // a respec keeps it on (the base takes off what the attributes no longer allow)
      g.settings.freeRespec = true;
      expect(g.respec('stats')).toBe(true);
      expect(c.equipment.head).toBe(helm);
    });

  it("another class's item goes on (a Druid's pelt, an Amazon's bow on a Sorceress)", async () => {
    const { C, I, Rng, create } = await setup();
    const g = create('run');
    const c = g.character;
    const rng = new Rng('class');
    const pelt = I.generateItem(rng, 'wolf_head', 10, { forceQuality: 'magic' });
    const bow = I.generateItem(rng, 'short_bow', 10, { forceQuality: 'magic' });
    expect(C.canEquip(c, pelt).ok).toBe(false);
    expect(C.canWear(c, pelt).ok).toBe(true);
    expect(C.canWear(c, bow).ok).toBe(true);
    delete c.equipment.head;
    c.inventory[0] = pelt;
    expect(g.equip(0).ok).toBe(true);
    expect(C.activeItems(c)).toContain(pelt);
  });

  it('the loot walked over: an empty slot, a clearly better item of the same kind, never a downgrade nor another weapon kind', async () => {
    const { L, I, Rng, create, heavyHelm } = await setup();
    const g = create('run');
    const c = g.character;
    const rng = new Rng('auto');
    delete c.equipment.head;
    // empty slot: the heavy helm at level 1
    const helm = heavyHelm();
    expect(L.autoSlotFor(g, helm)).toBe('head');
    expect(L.takeItem(g, helm)).toBe('equipped');
    expect(c.equipment.head).toBe(helm);
    // a plain cap is no upgrade over it: never worn in its place
    const cap = I.generateItem(rng, 'cap', 5, { forceQuality: 'magic' });
    expect(L.autoSlotFor(g, cap)).toBeNull();
    // the other way round: a worse helm worn, the heavy one replaces it
    c.equipment.head = cap;
    expect(L.autoSlotFor(g, heavyHelm('again'))).toBe('head');
    // another class's item is not put on by itself (the player can)
    delete c.equipment.head;
    expect(L.autoSlotFor(g, I.generateItem(rng, 'wolf_head', 10, { forceQuality: 'magic' }))).toBeNull();
    // never another kind of weapon in place of the one worn
    const staff = c.equipment.mainhand;
    expect(staff).toBeTruthy();
    const sword = I.generateItem(rng, 'crystal_sword', 60, { forceQuality: 'rare' });
    expect(L.autoSlotFor(g, sword)).toBeNull();
  });

  it('pd2+survivals: the same (a level-1 hero wears the heavy helm, active)', async () => {
    const { C, create, heavyHelm } = await setup('pd2+survivals', 'all');
    const g = create('run', 'barbarian');
    const c = g.character;
    delete c.equipment.head;
    const helm = heavyHelm();
    c.inventory[0] = helm;
    expect(g.equip(0).ok).toBe(true);
    expect(C.activeItems(c)).toContain(helm);
  }, 60_000);

  it("without the mode: Diablo II's requirements and classes", async () => {
    const { C, I, Rng, heavyHelm, G } = await setup('d2');
    const g = new G.Game(undefined, 'sorceress');
    const c = g.character;
    delete c.equipment.head;
    expect(C.canWear(c, heavyHelm()).ok).toBe(false);
    expect(C.canWear(c, I.generateItem(new Rng('x'), 'wolf_head', 10, { forceQuality: 'magic' })).ok).toBe(false);
    c.inventory[0] = heavyHelm();
    expect(g.equip(0).ok).toBe(false);
  });
});
