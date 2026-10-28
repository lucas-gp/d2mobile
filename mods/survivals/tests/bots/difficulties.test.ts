/**
 * Nightmare and Hell of the Survivals mode played by bots (lot 282, S7): a new character, automatic control, cards answered by its build
 * plan, plays the Normal campaign to Baal, then the Nightmare one to Baal (Hell opened), then Hell until Andariel. Long test of the nightly
 * job (about 6 minutes a class on one core), not of the normal suite (its smoke tests: tests/unit/difficulties.test.ts). The balance of
 * the 7 classes in the three difficulties is measured with `mods/survivals/tools/campaign.ts` (README, "Balance").
 *   npx vitest run --project bots mods/survivals/tests/bots/difficulties.test.ts      (SV_CLASSES=druid,necromancer to choose)
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from '../unit/activate';
import { playAct } from './harness';

const CLASSES = (process.env.SV_CLASSES ?? 'druid,necromancer').split(',');
/** Hours of play allowed: Normal, Nightmare (the owner's goal: under 60 h), Hell's first act */
const HOURS = [40, 60, 20];

describe('Survivals: Nightmare and Hell played by bots', () => {
  for (const cls of CLASSES) {
    it(
      `${cls}: Normal then Nightmare cleared (Hell opened), Andariel killed in Hell`,
      async () => {
        const { G } = await activate();
        const { withDefaultSettings } = await import('../../../../src/sim/save');
        const { BORN_SLACK } = await import('../../sim/director');
        (await import('../../../../src/sim/durability')).setDurabilityEnabled(false);
        const g = new G.Game(undefined, cls as never);
        g.character.name = `Bot ${cls}`;
        g.settings = withDefaultSettings({ mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
        const normal = await playAct(g, { maxSeconds: HOURS[0] * 3600, difficulty: 0, lastRound: 'a5r7' });
        expect(normal.cleared, JSON.stringify({ ...normal, checkpoints: undefined })).toBe(true);
        expect(g.character.progression.highestDifficulty).toBe(1);
        const nm = await playAct(g, { maxSeconds: HOURS[1] * 3600, difficulty: 1, lastRound: 'a5r7' });
        console.log(cls, 'nightmare', JSON.stringify({ hours: +(nm.seconds / 3600).toFixed(2), deaths: nm.deaths, level: nm.level, acts: nm.acts }));
        expect(nm.cleared, JSON.stringify({ ...nm, checkpoints: undefined })).toBe(true);
        expect(g.character.progression.highestDifficulty).toBe(2);
        expect(nm.maxAlive).toBeLessThanOrEqual(90 + BORN_SLACK + 10);
        const hell = await playAct(g, { maxSeconds: HOURS[2] * 3600, difficulty: 2, lastRound: 'a1r7' });
        console.log(cls, 'hell', JSON.stringify({ hours: +(hell.seconds / 3600).toFixed(2), deaths: hell.deaths, level: hell.level, acts: hell.acts }));
        expect(hell.cleared, JSON.stringify({ ...hell, checkpoints: undefined })).toBe(true);
        // checkpoints kept by difficulty
        expect(g.character.progression.milestones['survivals:cp:1:a5r7']).toBeGreaterThan(0);
        expect(g.character.progression.milestones['survivals:cp:2:a1r7']).toBeGreaterThan(0);
        vi.resetModules();
      },
      60 * 60_000,
    );
  }
});
