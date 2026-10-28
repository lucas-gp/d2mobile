// @vitest-environment happy-dom
/**
 * Lot 296, the other survivors game measured again (observation only): the Run's HUD shows the run's kills and gold, the run-end screen
 * the longest run (a record of survival, a death included), the gentle first minute and the quicker levels, a zone's gold, the bots
 * banishing a card off their plan.
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate';

const noop = () => undefined;
const host = { message: noop, haptic: noop, itemSound: noop };

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const create = (cls = 'barbarian') => {
    const g = new env.G.Game(undefined, cls as never);
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  return { ...env, RM, ST, create };
}

type G = InstanceType<Awaited<ReturnType<typeof activate>>['G']['Game']>;
const die = (g: G, RM: { runActive: (c: G['character']) => boolean }) => {
  g.world.player.hp = 0;
  g.world.player.dead = true;
  g.world.events.push({ t: 'playerDeath' });
  for (let t = 0; t < 5 * 25 && RM.runActive(g.character); t++) g.step(1);
};

describe('Survivals lot 296', () => {
  it('the HUD of a run: its kills and its gold', async () => {
    const { U, RM, create } = await setup();
    const g = create('sorceress');
    const scr = { open: (n: HTMLElement) => (document.body.append(n), { close: () => n.remove() }) };
    const [w] = U.contributions('hud').map((f) => f({ game: g, host: { ...host, openPanel: noop }, screen: scr })!);
    const now = vi.spyOn(performance, 'now');
    let t = 1000;
    now.mockImplementation(() => (t += 300));
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.takeOffer(null);
    g.step(1);
    g.world.stats.kills = 12;
    g.character.gold += 7;
    w.update!(g);
    expect(w.el.querySelector('[data-sv="kills"]')!.textContent).toBe('12 tués');
    expect(w.el.querySelector('[data-sv="gold"]')!.textContent).toBe('7 or');
    now.mockRestore();
  });

  it('the longest run: kept on a death, told when beaten, listed with the records', async () => {
    const { RM, ST, create } = await setup();
    const g = create('barbarian');
    const c = g.character;
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.takeOffer(null);
    c.progression.playTime += 100;
    die(g, RM);
    const first = ST.stateOf(g).runEnd!;
    expect(first.outcome).toBe('death');
    expect(first.bestSurvival).toBe(false);
    const k = RM.recKey(0, 1, 'surv');
    const s1 = c.progression.milestones[k]!;
    expect(s1).toBeGreaterThanOrEqual(100);
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.takeOffer(null);
    c.progression.playTime += 300;
    die(g, RM);
    const second = ST.stateOf(g).runEnd!;
    expect(second.bestSurvival).toBe(true);
    expect(c.progression.milestones[k]).toBeGreaterThan(s1);
    const { recordLines } = await import('../../ui/runhub');
    expect(recordLines(g, 1, 0).some((l) => /^Plus longue survie : \d+:\d\d$/.test(l))).toBe(true);
  });

  it('the first minute gentle, the levels of the other game, a zone’s gold worth a shop’s purchase in a few runs', async () => {
    const { RM } = await setup();
    expect(RM.densityCurve(10)).toBeLessThanOrEqual(8);
    expect(RM.densityCurve(60)).toBeLessThanOrEqual(20);
    expect(RM.flowLevel(90)).toBeGreaterThanOrEqual(6);
    expect(RM.flowLevel(140)).toBeGreaterThanOrEqual(8);
    const { ECON } = await import('../../sim/economy');
    // two zones' kills (about three minutes) bring more than half a magic item
    expect(2 * ECON.zoneCap).toBeGreaterThanOrEqual(ECON.buy.magic / 2);
  });

  it('the bots banish a card off their plan in a run (the plan’s skill not offered)', async () => {
    const { RM, create } = await setup();
    const g = create('amazon');
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    const { autoAnswer } = await import('../../ui/levelup');
    const { banishedOf } = await import('../../sim/offer');
    // levels gained: the cards answered by the bow plan until every point is spent
    for (let n = 0; n < 8; n++) {
      g.character.level += 1;
      g.character.skillPoints += 1;
      g.world.events.push({ t: 'levelUp', level: g.character.level });
      g.step(1);
      autoAnswer(g);
    }
    expect(g.offers.length).toBe(0);
    expect(banishedOf(g).length).toBeGreaterThan(0);
  });
});
