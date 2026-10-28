/**
 * The Run mode (lot 289): Run by default at creation (Campaign as a choice, Campaign for the characters made before), a run of one act
 * from its entry level with no skill, its zones chained without a town, the run's end on death or on the act's boss (records, the next act
 * opened), the hero back to level 1 between runs with his gear, gold and stash; gear above his level worn and active at once (lot 290);
 * each run its own cards; the save unchanged (milestones only).
 */
import { describe, expect, it } from 'vitest';
import type { Game } from '../../../../src/sim/game';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const CP = await import('../../sim/checkpoints');
  const S = await import('../../../../src/sim/save');
  const I = await import('../../../../src/sim/loot/itemgen');
  const IS = await import('../../../../src/sim/itemstats');
  const C = await import('../../../../src/sim/character');
  const { Rng } = await import('../../../../src/core/rng');
  const create = (variant?: string) => {
    const g = new env.G.Game(undefined, 'sorceress');
    g.character.name = `Run ${variant ?? 'x'}`;
    for (const f of env.U.contributions('create.character')) f({ game: g, ...(variant ? { variant } : {}) });
    return g;
  };
  /** The zone being played cleared (its mini-boss killed), as the director does */
  const clearZone = (g: Game) => {
    const run = g.world.run!;
    const round = RM.actRounds(1).find((r) => `survivals:${r.id}` === g.runDef!.id)!;
    CP.markCheckpoint(g.character, g.difficulty, round.id);
    RM.noteZoneCleared(g.character, round);
    run.completed = true;
    run.completeTick = g.world.tick;
  };
  const steps = (g: Game, seconds: number) => {
    for (let t = 0; t < seconds * 25; t++) {
      g.world.godMode = true;
      g.step(1);
    }
  };
  const highRing = () => {
    const rng = new Rng('lot289');
    for (;;) {
      const it = I.generateItem(rng, 'ring', 60, { forceQuality: 'rare' });
      if (IS.requiredLevel(it) > 10) return it;
    }
  };
  return { ...env, RM, ST, CP, S, C, IS, create, clearZone, steps, highRing };
}

describe('Survivals Run mode', () => {
  it('Run by default at creation, Campaign as a choice, Campaign for a character made before (no mark)', async () => {
    const { RM, create, G } = await setup();
    expect(RM.isRunMode(create().character)).toBe(true);
    expect(RM.isRunMode(create('run').character)).toBe(true);
    const camp = create('campaign');
    expect(RM.isRunMode(camp.character)).toBe(false);
    expect(RM.startRunMode(camp, 1, 0)).toBe(false);
    expect(RM.isRunMode(new G.Game(undefined, 'paladin').character)).toBe(false);
  });

  it('a run: level 1, no skill, a first card; zones chained without a town; death ends it, the gear and gold kept, level 1 again', async () => {
    const { RM, ST, create, clearZone, steps, highRing, C, IS } = await setup();
    const g = create();
    const c = g.character;
    // a previous run's hero and gear: a ring above his level worn from the hub, active at once (lot 290: no requirement)
    c.level = 20;
    c.skills = { fire_bolt: 5 };
    c.gold = 1000;
    RM.resetHero(g, 1, false);
    const ring = highRing();
    c.inventory[0] = ring;
    expect(g.equip(0).ok).toBe(true);
    expect(C.activeItems(c)).toContain(ring);
    g.step(1);
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    expect(g.mode).toBe('run');
    expect(g.runDef?.id).toBe('survivals:a1r1');
    expect(c.level).toBe(1);
    expect(c.skills).toEqual({});
    expect(c.skillPoints).toBe(1);
    g.step(1);
    // the first card (the level's skill point)
    expect(g.offers.length).toBe(1);
    expect(g.takeOffer(g.offers[0].ids[0])).toBe(true);
    // the zone cleared: the next zone a few seconds later, no town in between
    clearZone(g);
    steps(g, RM.RUN.bossWait + 1);
    expect(g.runDef?.id).toBe('survivals:a1r2');
    expect(RM.runInfo(c)?.zone).toBe(1);
    expect(C.activeItems(c)).toContain(ring);
    c.level = IS.requiredLevel(ring);
    const lvl = c.level;
    // death: back to town, the run's end
    g.world.godMode = false;
    g.world.player.hp = 0;
    g.world.player.dead = true;
    g.world.events.push({ t: 'playerDeath' });
    for (let t = 0; t < 5 * 25 && RM.runActive(c); t++) g.step(1);
    expect(RM.runActive(c)).toBe(false);
    const end = ST.stateOf(g).runEnd!;
    expect(end.outcome).toBe('death');
    expect(end.zoneIndex).toBe(2);
    expect(end.level).toBe(lvl);
    expect(c.level).toBe(1);
    expect(c.skills).toEqual({});
    expect(c.equipment).toHaveProperty(Object.entries(c.equipment).find(([, v]) => v === ring)![0]);
    expect(c.gold).toBeGreaterThanOrEqual(1000);
    expect(c.progression.milestones[RM.recKey(0, 1, 'deep')]).toBe(2);
    expect(c.progression.milestones[RM.recKey(0, 1, 'runs')]).toBe(1);
    // no portal back to the zone
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'run')).toBe(false);
  });

  it("the act's boss wins the run: records, Act II opened; the next run draws other cards", async () => {
    const { RM, ST, create, clearZone, steps } = await setup();
    const g = create();
    g.step(1);
    expect(RM.actUnlocked(g.character, 2, 0)).toBe(false);
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.step(1);
    const first = [...g.offers[0].ids];
    g.takeOffer(null);
    for (let i = 0; i < RM.runZones(1, 0).length - 1; i++) {
      clearZone(g);
      steps(g, RM.RUN.bossWait + 1);
    }
    expect(g.runDef?.id).toBe('survivals:a1r7');
    clearZone(g);
    for (let t = 0; t < (RM.RUN.endAfter + 2) * 25 && RM.runActive(g.character); t++) g.step(1);
    // lot 305: the end screen over the boss's zone (`endHere`), the hero left there, no town
    const end = ST.stateOf(g).endHere!;
    expect(ST.stateOf(g).runEnd).toBeNull();
    expect(end.outcome).toBe('victory');
    expect(end.nextAct).toBe(2);
    expect(RM.actUnlocked(g.character, 2, 0)).toBe(true);
    // lot 305 (owner): Andariel opens Act II only, Nightmare waits for Baal in Normal (lot 292's shortcut removed); a new best time
    expect(RM.unlockedActs(g.character)).toEqual([
      { act: 1, d: 0 },
      { act: 2, d: 0 },
    ]);
    expect(end.nextDifficulty).toBe(false);
    expect(end.bestTime).toBe(true);
    expect(end.purse).toBe(g.character.gold);
    expect(RM.actUnlocked(g.character, 1, 1)).toBe(false);
    expect(RM.actUnlocked(g.character, 2, 1)).toBe(false);
    expect(g.character.progression.milestones[RM.recKey(0, 1, 'wins')]).toBe(1);
    expect(g.character.progression.milestones[RM.recKey(0, 1, 'best')]).toBeGreaterThan(0);
    expect(g.mode).toBe('run');
    expect(g.runDef?.id).toBe('survivals:a1r7');
    // the next run (the end screen's "Replay Act I", from the boss's zone): other cards for the same first level
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    expect(ST.stateOf(g).endHere).toBeNull();
    g.step(1);
    expect(g.offers[0].ids).not.toEqual(first);
    // a later act starts at its entry level
    expect(RM.entryLevel(2, 0)).toBeGreaterThan(1);
  });

  it('a run left from the pause ends it; the save keeps the run (milestones) and stays version 7', async () => {
    const { RM, ST, S, G, create } = await setup();
    const g = create();
    g.step(1);
    RM.startRunMode(g, 1, 0);
    g.step(5);
    const save = g.toSave();
    expect(save.version).toBe(7);
    const back = new G.Game(S.deserialize(S.serialize(save)), 'sorceress');
    expect(RM.runActive(back.character)).toBe(true);
    // lot 298: never resumed (the hub starts a new run from 0: lot298.test.ts)
    expect(back.mode).toBe('town');
    g.townPortal();
    g.step(1);
    expect(ST.stateOf(g).runEnd?.outcome).toBe('left');
    expect(RM.runActive(g.character)).toBe(false);
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'run')).toBe(false);
  });

  it('no experience lost on death in a run; the Campaign keeps Diablo II’s', async () => {
    const { R, P, create } = await setup();
    const run = create().character;
    const camp = create('campaign').character;
    run.level = camp.level = 30;
    run.xp = camp.xp = P.xpToReach(30) + 500_000;
    expect(R.RULES['death.xpPenalty'](run, 2)).toBe(0);
    expect(R.RULES['death.xpPenalty'](camp, 2)).toBeGreaterThan(0);
  });
});

describe('Survivals Run mode on Project Diablo 2', () => {
  it('pd2+survivals: Run by default, a run of Act I from level 1 with PD2’s skills, its end on death', async () => {
    const env = await activate('pd2+survivals', 'all');
    const RM = await import('../../sim/runmode');
    const ST = await import('../../sim/state');
    const g = new env.G.Game(undefined, 'paladin');
    g.character.name = 'Pd2 run';
    for (const f of env.U.contributions('create.character')) f({ game: g });
    expect(RM.isRunMode(g.character)).toBe(true);
    g.step(1);
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.step(1);
    expect(g.character.level).toBe(1);
    expect(g.offers.length).toBe(1);
    expect(g.offers[0].ids.every((id) => g.canLearn(id).ok)).toBe(true);
    g.world.player.hp = 0;
    g.world.player.dead = true;
    g.world.events.push({ t: 'playerDeath' });
    for (let t = 0; t < 5 * 25 && RM.runActive(g.character); t++) g.step(1);
    expect(ST.stateOf(g).runEnd?.outcome).toBe('death');
    expect(g.character.level).toBe(1);
  });
});
