/**
 * Lot 299: the two Survivals modes apart (`d2+survivals`, `pd2+survivals`): each list holds only its own ruleset's characters; an
 * unreadable Survivals ruleset read under its canonical id, else as "Diablo II (original) — Survivals".
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate('d2+survivals', 'all');
  const CS = await import('../../../../src/ui/charselect-core');
  return { ...env, CS };
}

describe('Survivals lot 299: the modes apart', () => {
  it('each Survivals list holds only its own ruleset’s characters', async () => {
    const { CS, A } = await setup();
    const modes = CS.launchModes({
      contents: A.playableRulesets().map((r) => ({ id: r.id, name: r.name })),
      modes: A.gameModes().map((m) => ({ id: m.id, name: m.name, rulesets: m.rulesets })),
    });
    expect(modes.map((m) => m.id)).toEqual(expect.arrayContaining(['d2+survivals', 'pd2+survivals']));
    const chars = [
      { name: 'a', ruleset: 'd2+survivals' },
      { name: 'b', ruleset: 'pd2+survivals' },
      { name: 'c', ruleset: A.repairRuleset('survivals') },
      { name: 'd', ruleset: 'pd2' },
    ];
    const names = (mode: string) => CS.charsForMode(chars, mode, modes, (r) => A.rulesetProblem(r)).map((c) => c.name);
    expect(names('d2+survivals')).toEqual(['a', 'c']);
    expect(names('pd2+survivals')).toEqual(['b']);
    expect(names('pd2')).toEqual(['d']);
  });

  it('an unreadable Survivals ruleset goes to its canonical id, else to Diablo II (original) — Survivals; the rest is kept', async () => {
    const { A } = await setup();
    expect(A.repairRuleset('d2+survivals')).toBe('d2+survivals');
    expect(A.repairRuleset('pd2+survivals')).toBe('pd2+survivals');
    expect(A.repairRuleset('survivals+pd2')).toBe('pd2+survivals');
    expect(A.repairRuleset('survivals')).toBe('d2+survivals');
    expect(A.repairRuleset('survivals+survivals')).toBe('d2+survivals');
    // a mod absent from this version, two contents, no mode: kept as they are (greyed, never changed)
    expect(A.repairRuleset('pd2+zz')).toBe('pd2+zz');
    expect(A.repairRuleset('d2+pd2+survivals')).toBe('d2+pd2+survivals');
    expect(A.repairRuleset('zz')).toBe('zz');
  });
});
