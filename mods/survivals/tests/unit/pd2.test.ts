/**
 * `pd2+survivals` (lot 284, S9): the mode on the Project Diablo 2 overhaul. Offered at character creation next to `d2+survivals`; the
 * content stays PD2's (its rules, skills, monsters, zone levels, loot), the mode only adds its hooks over them (its drops wrap PD2's own);
 * the guild is pd2's, the stash its own (lot 299); the save keeps its version and its ruleset. Loot: a treasure class the overhaul does not have is never
 * rolled (PD2 has neither Diablo II's potion class `cpot` nor Griswold's: the super-uniques drop PD2's potions, Griswold PD2's drop); the
 * immunity guard counts PD2's sunder charms (an immunity they break is not one).
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate';

async function pd2(ruleset = 'pd2+survivals') {
  return activate(ruleset, 'all');
}

describe('pd2+survivals: rulesets and creation', () => {
  it('offered at creation with d2+survivals; PD2 rules kept, the mode over them; guild of pd2, its own stash (lot 299); save v7', async () => {
    const { A, R, G } = await pd2();
    expect(A.activeModIds()).toEqual(['pd2', 'survivals']);
    expect(A.rulesetProblem('pd2+survivals')).toBeNull();
    expect(A.rulesetProblem('d2+survivals')).toBeNull();
    expect(A.gameModesFor('pd2').map((m) => m.id)).toEqual(['survivals']);
    const CS = await import('../../../../src/ui/charselect-core');
    const modes = CS.launchModes({
      contents: A.playableRulesets().map((r) => ({ id: r.id, name: r.name })),
      modes: A.gameModes().map((m) => ({ id: m.id, name: m.name, rulesets: m.rulesets })),
    });
    expect(modes.map((m) => m.id)).toEqual(['pd2', 'd2', 'pd2+survivals', 'd2+survivals']);
    // PD2's content rules stay PD2's; the mode replaces only its own hooks, its drops wrap PD2's
    for (const r of ['combat.monsterRes', 'loot.ref', 'loot.rates', 'xp.levelFactor', 'world.tick'] as const) expect(R.ruleOwner(r)).toBe('pd2');
    for (const r of ['ui.orientation', 'render.zoom', 'render.limits', 'game.autopilot', 'skills.offer', 'loot.monsterDrops'] as const) expect(R.ruleOwner(r)).toBe('survivals');
    expect(A.contentRuleset('pd2+survivals')).toBe('pd2');
    const P = await import('../../../../src/platform/platform');
    // lot 299: each mode its own stash (first a copy of its content's: platform.test.ts)
    expect(P.sharedKeyOf('pd2+survivals')).not.toBe(P.sharedKeyOf('pd2'));
    expect(P.sharedKeyOf('d2+survivals')).not.toBe(P.sharedKeyOf('d2'));
    expect(P.sharedKeyOf('pd2+survivals')).not.toBe(P.sharedKeyOf('d2+survivals'));
    const S = await import('../../../../src/sim/save');
    const g = new G.Game(undefined, 'sorceress');
    expect(g.ruleset).toBe('pd2+survivals');
    const save = JSON.parse(S.serialize(g.toSave()));
    expect(save).toMatchObject({ version: 7, ruleset: 'pd2+survivals' });
    vi.resetModules();
  });
});

describe('pd2+survivals: rounds on PD2 content', () => {
  it("a round plays on PD2's zone levels, with the director, cards of PD2's tree and the mode's HUD state", async () => {
    const { G } = await pd2();
    const Z = await import('../../sim/zones');
    const CH = await import('../../data/chapters');
    const OF = await import('../../sim/offer');
    const D = await import('../../sim/director');
    // PD2's Canyon of the Magi is a level higher in Hell than Diablo II's (mods/pd2/data/levels.patch.ts)
    expect(Z.roundLevels(CH.ROUND_BY_ID.a2r6)[2]).toBe(80);
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 6;
    g.character.skillPoints = 1;
    // PD2's tree: the cards are skills PD2 lets this character learn
    const offer = OF.drawOffer(g, 6, 0) ?? [];
    expect(offer.length).toBe(3);
    for (const id of offer) expect(g.canLearn(id).ok).toBe(true);
    expect(g.startRun('survivals:a1r1', 0, 1)).toBe(true);
    for (let t = 0; t < 25 * 40; t++) {
      g.world.godMode = true;
      g.step(1);
    }
    const d = g.world.run?.director;
    expect(d).toBeInstanceOf(D.Director);
    const st = (d as InstanceType<typeof D.Director>).state(g.world);
    // (lot 290: the semi-automatic control casts its skills on its own, the hero kills more of them)
    expect(st.alive).toBeGreaterThan(5);
    expect(st.sec).toBeGreaterThan(35);
    vi.resetModules();
  }, 60_000);

  it("loot: no treasure class the overhaul lacks (PD2's potions for the super-uniques, PD2's own drop for Griswold)", async () => {
    await pd2();
    const SDK = await import('../../../../src/mods/sdk');
    const DL = await import('../../data/loot');
    const has = (id: string) => SDK.REGISTRIES.treasureClasses.has(id);
    expect(has('cpot')).toBe(false);
    const sup = SDK.REGISTRIES.treasureClasses.get('survivals:super')!;
    expect(sup.entries.map((e) => e.ref)).toEqual(['uitem', 'potion']);
    expect(DL.superUniqueTcId('griswold', 1, has)).toBeUndefined();
    expect(DL.superUniqueTcId('rakanishu', 1, has)).toBe('survivals:super');
    expect(DL.superUniqueTcId('ismail vilehand', 2, has)).toBe('survivals:council2');
    const items = SDK.rollTc({ rng: new SDK.Rng('pd2-super'), ilvl: 40, mf: 0, difficulty: 1, zoneKey: 'tristram', mapTier: 0, bonus: SDK.NO_BONUS, gf: 0, quantity: 1 }, 'survivals:super');
    expect(items.some((it) => SDK.BASE_BY_ID[it.base]?.type === 'potion')).toBe(true);
    expect(DL.survivalsTcs(has).flatMap((t) => t.entries.map((e) => e.ref))).not.toContain('cpot');
    vi.resetModules();
  });

  it("the immunity guard counts PD2's sunder charms (Diablo II has none)", async () => {
    await pd2();
    const I = await import('../../sim/immunity');
    const m = { res: { cold: 120, fire: 0 } } as never;
    expect(I.monsterImmune(m, ['cold'])).toBe(true);
    expect(I.monsterImmune(m, ['cold'], { cold: true })).toBe(false);
    vi.resetModules();
    await activate('d2+survivals');
    const I2 = await import('../../sim/immunity');
    expect(I2.monsterImmune(m, ['cold'], { cold: true })).toBe(true);
    vi.resetModules();
  });
});
