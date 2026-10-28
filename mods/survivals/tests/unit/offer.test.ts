/**
 * Skill offers of the Survivals mode (lot 276, S3): three cards among the skills the character can learn now (class, required level,
 * prerequisites of Skills.txt, cap of 20), weighted toward the skills already invested, deterministic, rerolls (free once a round, then
 * 500 × 1.5ⁿ × (difficulty + 1) gold), the tree read-only during a round, bots answering with their plan.
 */
import { describe, expect, it, vi } from 'vitest';
import { rerollCost } from '../../sim/offer';
import { activate } from './activate';

describe('Offer', () => {
  it('only learnable skills of the class: required level and prerequisites respected', async () => {
    const { G } = await activate();
    const { candidates, drawOffer } = await import('../../sim/offer');
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 6;
    g.character.skillPoints = 1;
    const ids = candidates(g);
    expect(ids).toContain('ice_bolt');
    expect(ids).toContain('frost_nova');
    // Ice Blast needs Ice Bolt (Skills.txt) and level 6
    expect(ids).not.toContain('ice_blast');
    expect(ids).not.toContain('meteor');
    expect(ids.every((id) => g.canLearn(id).ok)).toBe(true);
    for (let lvl = 2; lvl < 30; lvl++) {
      const o = drawOffer(g, lvl, 0)!;
      expect(o.length).toBe(3);
      expect(new Set(o).size).toBe(3);
      for (const id of o) expect(ids).toContain(id);
    }
    // no point: nothing to offer
    g.character.skillPoints = 0;
    expect(drawOffer(g, 7, 0)).toBeNull();
    vi.resetModules();
  });

  it('an invested skill is always among the cards, and the draw leans on the skills owned', async () => {
    const { G } = await activate();
    const { drawOffer, weightOf, WEIGHTS } = await import('../../sim/offer');
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 12;
    g.character.skillPoints = 1;
    g.character.skills = { ice_bolt: 3, fire_bolt: 1 };
    expect(weightOf(g, 'ice_bolt')).toBe(WEIGHTS.invested);
    // Frost Nova is a synergy of Ice Bolt (Skills.txt), Charged Bolt a new active, Warmth a passive
    expect(weightOf(g, 'warmth')).toBe(WEIGHTS.passive);
    expect(weightOf(g, 'charged_bolt')).toBe(WEIGHTS.active);
    expect(weightOf(g, 'frost_nova')).toBe(WEIGHTS.synergy);
    let invested = 0;
    for (let lvl = 2; lvl < 60; lvl++) {
      const o = drawOffer(g, lvl, 0)!;
      expect(o.some((id) => id === 'ice_bolt' || id === 'fire_bolt')).toBe(true);
      invested += o.filter((id) => id === 'ice_bolt' || id === 'fire_bolt').length;
    }
    expect(invested / 58).toBeGreaterThan(1.2);
    vi.resetModules();
  });

  it('deterministic, and a reroll draws again', async () => {
    const { G } = await activate();
    const { drawOffer } = await import('../../sim/offer');
    const g = new G.Game(undefined, 'necromancer');
    g.character.name = 'Det';
    g.character.level = 20;
    g.character.skillPoints = 1;
    expect(drawOffer(g, 20, 0)).toEqual(drawOffer(g, 20, 0));
    const draws = new Set([0, 1, 2, 3, 4, 5].map((r) => drawOffer(g, 20, r)!.join(',')));
    expect(draws.size).toBeGreaterThan(3);
    vi.resetModules();
  });

  it('reroll cost: 500 × 1.5ⁿ × (difficulty + 1)', () => {
    expect(rerollCost(0, 0)).toBe(500);
    expect(rerollCost(1, 0)).toBe(750);
    expect(rerollCost(2, 2)).toBe(3375);
  });

  it('in a round: a level gives an offer, the tree is read-only; in town the tree is free again', async () => {
    const { G, P } = await activate();
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r1', 0, 1);
    P.gainXp(g.world, P.xpToReach(3));
    g.step(1);
    expect(g.offers.map((o) => o.level)).toEqual([2, 3]);
    expect(g.offers[0].ids.length).toBe(3);
    expect(g.canLearnManually('ice_bolt').ok).toBe(false);
    expect(g.takeOffer(g.offers[0].ids[0])).toBe(true);
    expect(g.takeOffer(null)).toBe(true);
    expect(g.character.skillPoints).toBe(1);
    g.enterTown();
    expect(g.canLearnManually('ice_bolt').ok).toBe(true);
    vi.resetModules();
  });
});
