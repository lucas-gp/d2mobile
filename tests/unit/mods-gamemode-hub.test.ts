/**
 * Generic hooks of lot 295 (Survivals' hub in six tabs), inert without a game mode: rule `merc.hireLevel` (the hirelings opened and priced
 * by the character's level), the hireling's requirements under `char.equipNeedsReqs` (the base keeps them), and the SDK's item images
 * moved to `src/ui/itemicon.ts` (same keys as the HUD's).
 */
import { describe, expect, it } from 'vitest';
import { RULES } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { Rng } from '../../src/core/rng';
import { generateItem } from '../../src/sim/loot/itemgen';
import { addToCharacter } from '../../src/sim/inventory';
import { itemIconOf as hudIcon, itemIconId } from '../../src/ui/hud';
import { itemIconOf } from '../../src/mods/sdk';

describe('Hub hooks of lot 295 are inert in the base', () => {
  it('the hirelings open and cost by the character’s level', () => {
    const g = new Game(undefined, 'sorceress');
    const c = g.character;
    expect(RULES['merc.hireLevel'](c)).toBe(c.level);
    const rogue = g.mercOffers().find((o) => o.type.id === 'rogue')!;
    expect(rogue.unlocked).toBe(c.level >= 5);
    expect(rogue.cost).toBe(Math.round(150 + c.level * c.level * 1.1));
  });

  it('a hireling’s item needs its requirements in the base', () => {
    const g = new Game(undefined, 'sorceress');
    const c = g.character;
    c.gold = 10000;
    c.level = 5;
    expect(g.hireMerc('rogue', g.mercOffers().find((o) => o.type.id === 'rogue')!.variants[0].id).ok).toBe(true);
    const helm = generateItem(new Rng('mh'), 'great_helm', 30, { forceQuality: 'magic' });
    addToCharacter(c, helm);
    const idx = c.inventory.findIndex((x) => x?.uid === helm.uid);
    const r = g.mercEquip(idx);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/requis/);
  });

  it('the item images are the HUD’s', () => {
    for (const base of ['ring', 'great_helm', 'r08', 'gem_ruby_4', 'gold', 'hand_axe']) {
      const it = { uid: `u-${base}`, base };
      expect(itemIconOf(it)).toBe(hudIcon(it));
    }
    expect(itemIconId('r08')).toBeTypeOf('string');
  });
});

describe('Hub hooks of lot 295 under a game mode', () => {
  it('a mode opens the hirelings at its own level and lifts the hireling’s requirements', () => {
    const hire = RULES['merc.hireLevel'];
    const reqs = RULES['char.equipNeedsReqs'];
    try {
      RULES['merc.hireLevel'] = () => 18;
      RULES['char.equipNeedsReqs'] = () => false;
      const g = new Game(undefined, 'sorceress');
      const c = g.character;
      c.gold = 10000;
      const rogue = g.mercOffers().find((o) => o.type.id === 'rogue')!;
      expect(rogue.unlocked).toBe(true);
      expect(rogue.cost).toBe(Math.round(150 + 18 * 18 * 1.1));
      expect(g.hireMerc('rogue', rogue.variants[0].id).ok).toBe(true);
      const helm = generateItem(new Rng('mh'), 'great_helm', 30, { forceQuality: 'magic' });
      addToCharacter(c, helm);
      expect(g.mercEquip(c.inventory.findIndex((x) => x?.uid === helm.uid)).ok).toBe(true);
      expect(c.merc?.equipment.head?.uid).toBe(helm.uid);
    } finally {
      RULES['merc.hireLevel'] = hire;
      RULES['char.equipNeedsReqs'] = reqs;
    }
  });
});
