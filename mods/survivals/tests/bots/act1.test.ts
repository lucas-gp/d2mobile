/**
 * Vertical slice of the Survivals mode, played by bots (lot 277, S4): Act I in Normal, from the Rogue Encampment to Andariel, seven
 * rounds, by a new Sorceress, Paladin and Barbarian in automatic control, from level 1, cards answered by the brain's plan, settings of
 * the application (durability off). Measured on 12 characters (4 names × 3 classes, lot 277): 11 clear Act I, most in 3 to 6 h of play
 * with 35 to 75 deaths (one Barbarian 10 h 28 and 219 deaths); one Paladin stays stuck in the Jail and Cathedral round at level 20 (its
 * gold buys no potion; wraiths and skeleton archers). The bots of the base die often in Diablo II's early game too (MODS-RESIDUEL §6);
 * the balance of the mode by class is a later lot. Thresholds: Act I cleared within 12 h of play, every round in order, the live monster
 * cap kept, a character of Diablo II's level for Andariel.
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from '../unit/activate';
import { playAct } from './harness';

const CLASSES = ['sorceress', 'paladin', 'barbarian'] as const;

describe('Survivals: Act I Normal played by bots', () => {
  for (const cls of CLASSES) {
    it(
      `${cls}: new character, automatic control, Andariel killed within 12 h of play`,
      async () => {
        const { G } = await activate();
        const { withDefaultSettings } = await import('../../../../src/sim/save');
        // as in the application (durability off by default, `APP_SETTINGS_DEFAULTS`): the module keeps it on for the base's tests
        (await import('../../../../src/sim/durability')).setDurabilityEnabled(false);
        const g = new G.Game(undefined, cls);
        g.character.name = `Bot ${cls}`;
        g.settings = withDefaultSettings({ mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
        const rep = await playAct(g, { maxSeconds: 12 * 3600 });
        console.log(cls, JSON.stringify({ ...rep, hours: +(rep.seconds / 3600).toFixed(2) }));
        expect(rep.cleared, JSON.stringify(rep)).toBe(true);
        expect(rep.checkpoints.map((c) => c.round)).toEqual(['a1r1', 'a1r2', 'a1r3', 'a1r4', 'a1r5', 'a1r6', 'a1r7']);
        expect(rep.maxAlive).toBeLessThanOrEqual(96);
        expect(rep.level).toBeGreaterThanOrEqual(15);
        expect(g.character.progression.milestones['first:survivals:a1r7:0']).toBeGreaterThan(0);
        vi.resetModules();
      },
      20 * 60_000,
    );
  }
});
