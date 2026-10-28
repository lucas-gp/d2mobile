// @vitest-environment happy-dom
/**
 * Lot 313 (the Run's Act I balanced again, the level-up cards inside a phone held upright): a zone's own factors on its mini-boss
 * (`FLOW.bossZone`, Blood Raven), the training's life and experience ranks smaller (`FORGE_FX`), the cards' column never wider than the
 * screen (a one-line link no longer widens it).
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const F = await import('../../sim/forge');
  return { ...env, RM, F };
}

describe('Survivals lot 313', () => {
  it('a zone’s mini-boss: its damage times the zone’s factor (Blood Raven in the Cold Plains), the other zones and FLOW.boss untouched', async () => {
    const { RM } = await setup();
    const base = RM.FLOW.boss;
    const before = JSON.stringify(base);
    const cold = RM.zoneBossPowers('a1r2');
    expect(cold.dmg.miniboss).toBeCloseTo((base.dmg.miniboss ?? 1) * (RM.FLOW.bossZone.a1r2?.dmg ?? 1));
    expect(cold.dmg.miniboss).toBeLessThan(base.dmg.miniboss);
    expect(cold.life.miniboss).toBe(base.life.miniboss);
    expect(cold.dmg.boss).toBe(base.dmg.boss);
    expect(RM.zoneBossPowers('a1r1')).toBe(base);
    expect(RM.zoneBossPowers('a1r7')).toBe(base);
    expect(JSON.stringify(RM.FLOW.boss)).toBe(before);
  });

  it('the training: life +1 % and experience +3 % a rank (lot 308: 4 % and 5 %), told so on the panel', async () => {
    const { F } = await setup();
    expect(F.FORGE_FX.life).toBe(0.01);
    expect(F.FORGE_FX.xp).toBe(0.03);
    expect(F.FORGE_BY_ID.life.effect(5)).toBe('+5 % de vie');
    expect(F.FORGE_BY_ID.xp.effect(1)).toBe('+3 % d’expérience');
    expect(F.FORGE_BY_ID.xp.effect(5)).toBe('+15 % d’expérience');
  });

  it('the level-up cards: one column of minmax(0, 1fr), a card free to shrink (its one-line link clipped, not widening the screen)', async () => {
    await setup();
    const D = await import('../../ui/dom');
    D.ensureStyle();
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    expect(css).toMatch(/\.sv-cards \{ display: grid; gap: 12px; grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/\.sv-card \{ min-width: 0; \}/);
  });
});
