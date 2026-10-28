/**
 * The Run mode (lot 289) played by bots: for each of the 7 classes, a new character runs Act I in Normal from level 1, again and again
 * with the gear it keeps from run to run (automatic control, cards by the class's plan, no shopping), as `tools/campaign.ts --run` does.
 * Measured at lot 289 (README, "Run mode": 2 names × 6 runs a class): every class wins runs, the 7 classes together most of them. The
 * thresholds: each class wins at least one of its 6 runs, and the classes together at least 60 %.
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from '../unit/activate';
import { playRuns, type RunReport } from './harness';

const CLASSES = ['sorceress', 'paladin', 'barbarian', 'amazon', 'necromancer', 'druid', 'assassin'] as const;
const RUNS = 6;

describe('Survivals Run mode: Act I in Normal played by bots, from level 1', () => {
  const all: RunReport[] = [];
  for (const cls of CLASSES) {
    it(
      `${cls}: ${RUNS} runs, at least one victory`,
      async () => {
        const { G } = await activate();
        const { withDefaultSettings } = await import('../../../../src/sim/save');
        (await import('../../../../src/sim/durability')).setDurabilityEnabled(false);
        const RM = await import('../../sim/runmode');
        const g = new G.Game(undefined, cls);
        g.character.name = `Run ${cls}`;
        RM.setVariant(g.character, 'run');
        g.settings = withDefaultSettings({ mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
        const reps = await playRuns(g, { runs: RUNS });
        console.log(cls, JSON.stringify(reps.map((r) => `${r.outcome[0]}${r.zone}/L${r.level}/${Math.round(r.seconds / 60)}m`)));
        all.push(...reps);
        expect(
          reps.some((r) => r.outcome === 'victory'),
          JSON.stringify(reps),
        ).toBe(true);
        // every run ends (no run left hanging), at the act's boss or before
        expect(reps.every((r) => r.outcome === 'victory' || r.outcome === 'death')).toBe(true);
        vi.resetModules();
      },
      30 * 60_000,
    );
  }
  it('the classes together win at least 60 % of their runs', () => {
    const wins = all.filter((r) => r.outcome === 'victory').length;
    expect(all.length).toBe(CLASSES.length * RUNS);
    expect(wins / all.length).toBeGreaterThanOrEqual(0.6);
  });
});
