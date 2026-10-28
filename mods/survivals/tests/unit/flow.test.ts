/**
 * Act I's timed flow in the Run (lot 291, after a second look at another survivors game): zones of 60 s at most, a gentle
 * start then the full field from 2:00, melee fodder only in the first 30 s, elites announced by name, chests of levels, the hero at about
 * 4 units a second walking while he casts, the loot walked over only (no gold from afar), the act boss's fall taking the arena's loot, the
 * damage of the last 3 s told at a death. Act II and the Campaign keep lot 289's zones.
 */
import { describe, expect, it } from 'vitest';
import type { Game } from '../../../../src/sim/game';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const D = await import('../../sim/director');
  const L = await import('../../sim/loot');
  const LO = await import('../../sim/lost');
  const ST = await import('../../sim/state');
  const create = (variant = 'run') => {
    const g = new env.G.Game(undefined, 'sorceress');
    g.character.name = `Flow ${variant}`;
    for (const f of env.U.contributions('create.character')) f({ game: g, variant });
    return g;
  };
  const steps = (g: Game, seconds: number, god = true) => {
    for (let t = 0; t < seconds * 25; t++) {
      g.world.godMode = god;
      if (g.offers.length) g.takeOffer(g.offers[0].ids[0]) || g.takeOffer(null);
      g.step(1);
    }
  };
  return { ...env, RM, D, L, LO, ST, create, steps };
}

describe("Survivals: Act I's timed flow in the Run (lot 291)", () => {
  it('the density by act second, the events of a zone, Act I only (every difficulty since lot 292)', async () => {
    const { RM } = await setup();
    // lot 292c: a dense field, the act's twelve minutes; lot 296: the other game's gentle first minute (5 at 0:10, 10 at 0:30, 15 at 1:00)
    // lot 306: thinner over the first three minutes (the other game's field)
    expect(RM.densityCurve(0)).toBe(4);
    // lot 301: as many more alive as are on their way from beyond the screen; lot 306: a share of the curve
    expect(RM.flowDensity(0)).toBeCloseTo(4 * (1 + RM.FLOW.offscreenShare));
    expect(RM.densityCurve(30)).toBe(8);
    expect(RM.densityCurve(60)).toBe(13);
    expect(RM.densityCurve(120)).toBe(45);
    expect(RM.densityCurve(240)).toBe(66);
    expect(RM.densityCurve(1000)).toBe(RM.FLOW.density[RM.FLOW.density.length - 1][1]);
    expect(RM.flowActive(1, 0)).toBe(true);
    expect(RM.flowActive(2, 0)).toBe(false);
    expect(RM.flowActive(1, 1)).toBe(true);
    expect(RM.flowActive(1, 2)).toBe(true);
    expect(RM.flowActive(3, 2)).toBe(false);
    // lot 292c (owner's note): a mini-boss every 3 minutes: Blood Raven at 3:00, Rakanishu at 6:00, the Countess at 9:00, Andariel at 12:00
    expect(RM.runZones(1, 0).map((r) => r.id)).toEqual(['a1r1', 'a1r2', 'a1r3', 'a1r4', 'a1r7']);
    expect(RM.runZones(2, 0).length).toBe(RM.actRounds(2).length);
    const z0 = RM.actFlow(1, 0, 0)!;
    expect(z0.events.champions).toBeNull();
    expect(z0.events.encircle).toBeNull();
    expect(z0.zoneEnd).toBe(90);
    const ends: number[] = [];
    for (let i = 0; i < 4; i++) {
      const z = RM.actFlow(1, 0, i)!;
      ends.push(z.actSec0 + z.zoneEnd);
      expect(z.events.miniboss).toBe(z.zoneEnd - RM.FLOW.minibossBefore);
    }
    expect(ends.map((e) => Math.round(e / 60))).toEqual([2, 3, 6, 9]);
    const lair = RM.actFlow(1, 0, 4, true)!;
    expect(Math.round((lair.actSec0 + lair.bossAt) / 60)).toBe(12);
    expect(lair.target(1000)).toBe(RM.FLOW.bossDensity);
    expect(RM.actFlow(2, 0, 0)).toBeUndefined();
  });

  it('a run of Act I: a gentle first minute with melee monsters, its zone ends on time, the next one at once; speed and walking casts', async () => {
    const { RM, D, R, create, steps } = await setup();
    const g = create();
    g.step(1);
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    const w = () => g.world;
    expect(RM.inFlow(w())).toBe(true);
    // about 4 units a second, the hero walking while he casts
    expect(R.RULES['player.speed'](w(), 5.2)).toBeCloseTo(4, 1);
    expect(R.RULES['player.castWhileMoving'](w())).toBe(true);
    steps(g, 3);
    const d = w().run!.director as InstanceType<typeof D.Director>;
    // the zone fills up over its first seconds (lot 292c), melee only at first
    expect(d.state(w()).target).toBeLessThanOrEqual(RM.FLOW.entry[0] + RM.FLOW.entry[1] * 3 + 1);
    steps(g, 17);
    const ranged = w().monsters.filter((m) => !m.dead && m.team === 1 && D.isRanged(m.def.id)).length;
    expect(ranged).toBe(0);
    // the zone's time is up (or its mini-boss killed just before: lot 300's countdown of `RUN.bossWait`): the next zone
    steps(g, 75);
    for (let t = 0; t < RM.RUN.bossWait * 25 && g.runDef?.id === 'survivals:a1r1'; t++) g.step(1);
    expect(g.runDef?.id).toBe('survivals:a1r2');
    expect(RM.runInfo(g.character)?.zone).toBe(1);
  }, 120_000);

  it('the Campaign and Act II keep their zones (no flow, the base speed; walking while casting in every round, lot 292b)', async () => {
    const { RM, R, create } = await setup();
    const g = create('campaign');
    expect(g.startRun('survivals:a1r1', 0, 1)).toBe(true);
    expect(RM.inFlow(g.world)).toBe(false);
    expect(R.RULES['player.speed'](g.world, 5.2)).toBe(5.2);
    expect(R.RULES['player.castWhileMoving'](g.world)).toBe(true); // lot 292b: in every round of the mode
  });

  it("an elite's chest gives levels; the loot walked over only; the damage of the last 3 s at a death", async () => {
    const { RM, L, LO, ST, SDK, create, steps } = await setup().then(async (e) => ({ ...e, SDK: await import('../../../../src/mods/sdk') }));
    const g = create();
    g.step(1);
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    steps(g, 2);
    const w = g.world;
    const lvl = g.character.level;
    // a unique killed: its chest's gold (lot 292c: no level any more; the zone's mini-boss gives one)
    const m = w.monsters.find((x) => !x.dead && x.team === 1)!;
    m.rank = 'unique';
    const gold0 = g.character.gold;
    w.killMonster(m, w.player);
    expect(g.character.level).toBe(lvl + RM.FLOW.chest.unique);
    expect(g.character.gold).toBeGreaterThan(gold0);
    // gold out of reach stays on the ground (no vacuum in the flow)
    const gold = SDK.makeStack(new SDK.Rng('g'), 'gold', 50);
    w.items.push({ id: w.newId(), item: gold, x: w.player.x + 8, y: w.player.y, dropTick: w.tick - 100, show: 1 } as never);
    const g0 = g.character.gold;
    for (let t = 0; t < 10; t++) L.pickup(g, w);
    expect(g.character.gold).toBe(g0);
    // the damage of the last 3 s
    expect(
      LO.burstOf(
        [
          { tick: 0, amount: 30 },
          { tick: 60, amount: 40.4 },
          { tick: 100, amount: 12 },
        ],
        100,
      ),
    ).toBe(52);
    expect(LO.burstParts(52)).toEqual(['52', 'dégâts reçus en 3 s']);
    expect(LO.burstParts(0)).toEqual([]);
    const st = ST.stateOf(g);
    st.hurts = [{ tick: w.tick, amount: 25 }];
    st.lastHurt = { monster: 'zombie', kind: 'coup', amount: 25, elem: 'phys', tick: w.tick };
    LO.noteEvent(g, { t: 'playerDeath' } as never);
    expect(st.lastDeath?.burst).toBe(25);
  }, 120_000);

  it('a new character of the mode: no damage numbers nor screen shake by default', async () => {
    const { create } = await setup();
    const g = create();
    expect(g.settings.damageNumbers).toBe(false);
    expect(g.settings.screenShake).toBe(0);
  });
});
