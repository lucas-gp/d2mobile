// @vitest-environment happy-dom
/**
 * Lot 308: the Run's permanent training (sim/forge.ts, the hub's Skills tab): ranks bought with the character's gold (prices rising, the
 * button greyed when the purse cannot pay), kept in the milestones (a save from before the lot reads every rank at 0, odd values clamped),
 * a reset giving every gold piece back, nothing in the Campaign; each rank's effect in a run (life, experience, the first choice's fourth
 * card, the run's extra free rerolls and banishes across its zones, the pickup's reach, the gold, a boss's chest) and on the level-up
 * screen ("Reroll · 3 free").
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const F = await import('../../sim/forge');
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const H = await import('../../ui/hub6');
  const LU = await import('../../ui/levelup');
  const OF = await import('../../sim/offer');
  const SV = await import('../../../../src/sim/save');
  const create = (cls = 'sorceress', variant: 'run' | 'campaign' = 'run') => {
    const g = new env.G.Game(undefined, cls as never);
    g.character.name = 'Lot 308';
    for (const f of env.U.contributions('create.character')) f({ game: g, variant });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  const host = { message() {}, haptic() {}, itemSound() {}, openPanel() {} };
  const mount = (g: unknown) => {
    const ctx = { game: g, host, screen: { open: (n: HTMLElement) => (document.body.append(n), { close: () => n.remove() }) } };
    const draw = () => {
      document.body.replaceChildren();
      const root = H.hub6(ctx as never, () => undefined);
      document.body.append(root);
      return root;
    };
    return draw;
  };
  const maxAll = (c: { progression: { milestones: Record<string, number> } }) => {
    for (const f of F.FORGE) c.progression.milestones[`survivals:forge:${f.id}`] = f.costs.length;
  };
  return { ...env, F, RM, ST, H, LU, OF, SV, create, mount, maxAll, host };
}

describe('Survivals lot 308: the training’s ranks', () => {
  it('prices rise rank by rank; a rank costs its gold; greyed when poor; the last rank is the max; a reset gives every gold piece back', async () => {
    const { F, create } = await setup();
    for (const f of F.FORGE) {
      expect(f.costs.length).toBeGreaterThan(0);
      for (let k = 1; k < f.costs.length; k++) expect(f.costs[k]).toBeGreaterThan(f.costs[k - 1]);
      expect(f.effect(0)).not.toBe(f.effect(1));
    }
    // the cheapest ranks about an early run's gold, every rank together tens of runs of it
    expect(Math.min(...F.FORGE.map((f) => f.costs[0]))).toBeLessThanOrEqual(60);
    expect(F.FORGE_TOTAL).toBeGreaterThan(3000);
    const g = create();
    const c = g.character;
    c.gold = 0;
    expect(F.buyBlock(c, 'gold')).toMatch(/Il manque/);
    expect(F.buyRank(c, 'gold')).toBe(false);
    c.gold = 1000;
    expect(F.buyRank(c, 'gold')).toBe(true);
    expect(F.forgeRank(c, 'gold')).toBe(1);
    expect(c.gold).toBe(1000 - F.FORGE_BY_ID.gold.costs[0]);
    expect(F.buyRank(c, 'hand')).toBe(true);
    expect(F.nextCost(c, 'hand')).toBeNull();
    expect(F.buyBlock(c, 'hand')).toBe('Rang maximal');
    expect(F.buyRank(c, 'hand')).toBe(false);
    const spent = F.FORGE_BY_ID.gold.costs[0] + F.FORGE_BY_ID.hand.costs[0];
    expect(F.forgeSpent(c)).toBe(spent);
    expect(F.resetForge(c)).toBe(spent);
    expect(c.gold).toBe(1000);
    expect(F.FORGE.every((f) => F.forgeRank(c, f.id) === 0)).toBe(true);
  });

  it('kept in the milestones through a save; a save from before the lot reads 0; odd values clamped; the Campaign ignores them', async () => {
    const { F, SV, G, create } = await setup();
    const g = create();
    const c = g.character;
    expect(F.FORGE.every((f) => F.forgeRank(c, f.id) === 0)).toBe(true);
    c.gold = 5000;
    F.buyRank(c, 'xp');
    F.buyRank(c, 'xp');
    F.buyRank(c, 'life');
    const back = new G.Game(SV.deserialize(SV.serialize(g.toSave())), 'sorceress');
    expect(back.character.progression.milestones['survivals:forge:xp']).toBe(2);
    expect(F.forgeRank(back.character, 'xp')).toBe(2);
    expect(F.forgeRank(back.character, 'life')).toBe(1);
    expect(back.toSave().version).toBe(g.toSave().version);
    // odd values (a hand-edited or future save): clamped to the ranks
    c.progression.milestones['survivals:forge:reroll'] = 99;
    c.progression.milestones['survivals:forge:banish'] = -3;
    expect(F.forgeRank(c, 'reroll')).toBe(3);
    expect(F.forgeRank(c, 'banish')).toBe(0);
    // a Campaign character: no effect, no purchase
    const camp = create('sorceress', 'campaign');
    camp.character.gold = 5000;
    camp.character.progression.milestones['survivals:forge:xp'] = 5;
    expect(F.forgeOn(camp.character, 'xp')).toBe(0);
    expect(F.forgeXp(camp.character)).toBe(1);
    expect(F.buyRank(camp.character, 'gold')).toBe(false);
  });

  it('in a run: more life, more experience, a fourth card at the first choice, a wider reach, more gold, a better boss chest', async () => {
    const { F, RM, create, maxAll } = await setup();
    const plain = create();
    expect(RM.startRunMode(plain, 1, 0)).toBe(true);
    plain.step(1);
    const hp0 = plain.world.player.hpMax;
    expect(plain.currentOffer()!.ids.length).toBe(3);
    const g = create();
    maxAll(g.character);
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.step(1);
    const c = g.character;
    expect(c.bonuses.lifePct).toBe(5);
    expect(g.world.player.hpMax).toBeGreaterThan(hp0 * 1.03);
    // the first choice: four cards (and its rerolls), then three once a skill is taken
    expect(g.currentOffer()!.ids.length).toBe(4);
    expect(g.rerollOffer()).toBe(true);
    expect(g.currentOffer()!.ids.length).toBe(4);
    g.takeOffer(g.currentOffer()!.ids[0]);
    c.skillPoints += 1;
    expect(RM.startRunMode(g, 1, 0)).toBe(false);
    expect(F.openingCards(g, 3)).toBe(3);
    expect(F.forgeXp(c)).toBeCloseTo(1.15);
    expect(F.forgeReach(c)).toBeCloseTo(1.6);
    expect(F.forgeGold(c)).toBeCloseTo(0.25);
    expect(F.forgeLuck(c)).toBeCloseTo(0.12);
    // a new run starts again from the hub's reset: the life bonus is the training's only
    c.bonuses.lifePct = 5;
    // the chest's gold +25 %
    const ECO = await import('../../sim/economy');
    const before = c.gold;
    const n = ECO.chestGold(g.world, 'boss');
    expect(n).toBe(Math.round(ECO.ECON.chest.boss * 1.25));
    expect(c.gold - before).toBe(n);
  });

  it('the run’s extra free rerolls and banishes, after the zone’s own, last the whole run; a new run has them again', async () => {
    const { F, RM, LU, OF, create } = await setup();
    const g = create();
    const c = g.character;
    c.progression.milestones['survivals:forge:reroll'] = 2;
    c.progression.milestones['survivals:forge:banish'] = 1;
    c.gold = 0;
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.step(1);
    expect(LU.freeRerolls(g)).toBe(3);
    expect(LU.nextRerollCost(g)).toBe(0);
    expect(LU.payReroll(g)).toBe(true);
    expect(LU.rerollsOf(g).free).toBe(false);
    expect(LU.freeRerolls(g)).toBe(2);
    expect(LU.payReroll(g)).toBe(true);
    expect(LU.payReroll(g)).toBe(true);
    expect(LU.freeRerolls(g)).toBe(0);
    expect(LU.nextRerollCost(g)).toBeGreaterThan(0);
    expect(LU.payReroll(g)).toBe(false);
    // banishes: the zone's two, then the run's one
    expect(LU.banishesLeft(g)).toBe(OF.BANISHES + 1);
    const pool = OF.candidates(g);
    expect(OF.banish(g, pool[0])).toBe(true);
    expect(OF.banish(g, pool[1])).toBe(true);
    expect(LU.banishesLeft(g)).toBe(1);
    expect(OF.banish(g, pool[2])).toBe(true);
    expect(OF.banish(g, pool[3])).toBe(false);
    expect(LU.banishesLeft(g)).toBe(0);
    // the next zone: its own free reroll and banishes, the run's extra ones spent
    g.takeOffer(null);
    const run = g.world.run!;
    run.completed = true;
    run.completeTick = g.world.tick;
    const CP = await import('../../sim/checkpoints');
    CP.markCheckpoint(c, 0, 'a1r1');
    RM.noteZoneCleared(c, RM.actRounds(1)[0]);
    for (let t = 0; t < 11 * 25 && g.runDef?.id === 'survivals:a1r1'; t++) {
      g.world.godMode = true;
      g.step(1);
    }
    expect(g.runDef?.id).toBe('survivals:a1r2');
    g.step(1);
    expect(LU.freeRerolls(g)).toBe(1);
    expect(LU.banishesLeft(g)).toBe(OF.BANISHES);
    expect(F.forgeLeft(c, 'reroll')).toBe(0);
    // a new run: the training's again
    g.townPortal();
    for (let k = 0; k < 3 && g.mode === 'run'; k++) g.townPortal();
    g.step(1);
    expect(RM.runActive(c)).toBe(false);
    expect(F.forgeLeft(c, 'reroll')).toBe(2);
    expect(F.forgeLeft(c, 'banish')).toBe(1);
  });

  it('the level-up screen tells the free rerolls and banishes with the training’s, and the opening hand', async () => {
    vi.useFakeTimers();
    const { RM, LU, create, host } = await setup();
    const g = create();
    g.character.progression.milestones['survivals:forge:reroll'] = 2;
    g.character.progression.milestones['survivals:forge:banish'] = 3;
    g.character.progression.milestones['survivals:forge:hand'] = 1;
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.step(1);
    g.settings = { ...g.settings, mods: { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'manual' } } } as never;
    document.body.replaceChildren();
    const screen = { open: (n: HTMLElement) => (document.body.append(n), { close: () => n.remove() }) };
    LU.levelUpCards({ game: g, host, screen, level: 1 } as never);
    const q = (s: string) => document.body.querySelector<HTMLElement>(s);
    expect(document.body.querySelectorAll('.sv-card').length).toBe(4);
    expect(q('.sv-cards')!.classList.contains('four')).toBe(true);
    expect(q('[data-sv="opening-hand"]')!.textContent).toBe('Main d’ouverture : une carte de plus');
    expect(q('[data-sv="reroll"]')!.textContent).toBe('Relancer · 3 gratuites');
    expect(q('[data-sv="banish"]')!.textContent).toBe('Bannir · 5');
    vi.advanceTimersByTime(600);
    q('[data-sv="reroll"]')!.click();
    expect(q('[data-sv="reroll"]')!.textContent).toBe('Relancer · 2 gratuites');
    vi.useRealTimers();
  });

  it('the hub’s Skills tab: a row a rank, the effect now → next and the price, greyed when poor; a tap buys; the reset gives back', async () => {
    const { F, H, create, mount } = await setup();
    const g = create();
    const c = g.character;
    c.gold = 100;
    H.hubState(g).tab = 'skills';
    const draw = mount(g);
    let root = draw();
    const forge = root.querySelector<HTMLElement>('[data-part="forge"]')!;
    expect(forge.querySelector('.svh-ph')!.textContent).toBe('Entraînement');
    const rows = [...forge.querySelectorAll<HTMLElement>('[data-forge-row]')];
    expect(rows.map((r) => r.dataset.forgeRow)).toEqual(F.FORGE.map((f) => f.id));
    const gold = root.querySelector<HTMLElement>('[data-forge-row="gold"]')!;
    expect(gold.querySelector('.svh-ffx')!.textContent).toBe('Aucun bonus → +5 % d’or');
    expect(gold.querySelector<HTMLButtonElement>('[data-forge="gold"]')!.textContent).toBe(`${F.FORGE_BY_ID.gold.costs[0]} or`);
    // the purse cannot pay the opening hand: greyed, disabled
    const hand = root.querySelector<HTMLElement>('[data-forge-row="hand"]')!;
    expect(hand.classList.contains('poor')).toBe(true);
    expect(hand.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-sv="forge-reset"]')!.disabled).toBe(true);
    gold.querySelector<HTMLButtonElement>('button')!.click();
    expect(F.forgeRank(c, 'gold')).toBe(1);
    expect(c.gold).toBe(100 - F.FORGE_BY_ID.gold.costs[0]);
    root = draw();
    expect(root.querySelector('[data-forge-row="gold"] .svh-ffx')!.textContent).toBe('+5 % d’or → +10 % d’or');
    expect(root.querySelectorAll('[data-forge-row="gold"] .svh-pips i.on').length).toBe(1);
    root.querySelector<HTMLButtonElement>('[data-sv="forge-reset"]')!.click();
    expect(c.gold).toBe(100);
    expect(F.forgeRank(c, 'gold')).toBe(0);
  });
});
