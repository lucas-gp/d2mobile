/**
 * The Normal campaign of the Survivals mode played by bots (lot 280, S6; the 7 classes from lot 282): the five acts, from the Rogue
 * Encampment to Baal, by a new character of each class in automatic control, from level 1, cards answered by its build plan, settings of
 * the application (durability off). Long test of the nightly job (CI `nightly`: about 15 minutes for the 7 classes on one core), not of
 * the normal suite (its smoke test is tests/unit/acts.test.ts). Thresholds: Baal killed within 40 h of play, every round in the order of the
 * campaign, each act's town reached, the live monster cap kept (cap + monsters born of others), Nightmare opened.
 *   npx vitest run --project bots mods/survivals/tests/bots/campaign.test.ts      (SV_CLASSES=sorceress,paladin to choose)
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from '../unit/activate';
import { playAct } from './harness';

const CLASSES = (process.env.SV_CLASSES ?? 'sorceress,paladin,barbarian,amazon,necromancer,druid,assassin').split(',') as 'sorceress'[];
const HOURS = 40;

describe('Survivals: the Normal campaign played by bots', () => {
  for (const cls of CLASSES) {
    it(
      `${cls}: new character, automatic control, Baal killed within ${HOURS} h of play`,
      async () => {
        const { G } = await activate();
        const { withDefaultSettings } = await import('../../../../src/sim/save');
        const { ROUNDS } = await import('../../data/chapters');
        const { BORN_SLACK } = await import('../../sim/director');
        (await import('../../../../src/sim/durability')).setDurabilityEnabled(false);
        const g = new G.Game(undefined, cls);
        g.character.name = `Bot ${cls}`;
        g.settings = withDefaultSettings({ mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
        const rep = await playAct(g, { maxSeconds: HOURS * 3600, lastRound: 'a5r7' });
        console.log(cls, JSON.stringify({ ...rep, checkpoints: rep.checkpoints.map((c) => `${c.round}@${c.minute}m/L${c.level}`).join(' '), hours: +(rep.seconds / 3600).toFixed(2) }));
        expect(rep.cleared, JSON.stringify({ ...rep, checkpoints: undefined })).toBe(true);
        expect(rep.checkpoints.map((c) => c.round)).toEqual(ROUNDS.map((r) => r.id));
        expect(rep.acts.map((a) => a.act)).toEqual([1, 2, 3, 4, 5, 5]);
        expect([...rep.towns].sort()).toEqual(['act1', 'act2', 'act3', 'act4', 'act5']);
        expect(rep.maxAlive).toBeLessThanOrEqual(90 + BORN_SLACK + 10);
        expect(g.character.progression.highestDifficulty).toBe(1);
        vi.resetModules();
      },
      60 * 60_000,
    );
  }
});
