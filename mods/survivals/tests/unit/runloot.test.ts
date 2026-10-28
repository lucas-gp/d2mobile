// @vitest-environment happy-dom
/**
 * Lot 293 (the owner's note): a run's loot kept apart without limit, moved to the bag at its end (a death too), the surplus in temporary
 * pages; no new run while they hold more than `RUN_LOOT.pagesMax` items; the shop's bag sells them or moves them to the bag; saved with the
 * character.
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const RL = await import('../../sim/runloot');
  const L = await import('../../sim/loot');
  const ST = await import('../../sim/state');
  const S = await import('../../../../src/sim/save');
  const I = await import('../../../../src/sim/loot/itemgen');
  const { Rng } = await import('../../../../src/core/rng');
  const create = () => {
    const g = new env.G.Game(undefined, 'sorceress');
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  return { ...env, RM, RL, L, ST, S, I, Rng, create };
}

describe('Survivals: a run’s loot (lot 293)', () => {
  it('kept apart during the run (magic of the class too), to the bag at its end, the surplus in pages that block a new run', async () => {
    const { RM, RL, L, ST, I, Rng, create } = await setup();
    const g = create();
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.takeOffer(null);
    const rng = new Rng('rl');
    const c = g.character;
    // rings walked over: the clearly better ones worn (the worn one to the bag), the others kept apart
    const items = Array.from({ length: 120 }, () => I.generateItem(rng, 'ring', 5, { forceQuality: 'magic' }));
    const before = c.inventory.filter(Boolean).length;
    let kept = 0;
    for (const it of items) if (L.takeItem(g, it) === 'kept') kept++;
    expect(kept).toBeGreaterThan(100);
    // lot 300: in the bag while it has room (the pause's inventory shows them), apart beyond
    const inBag = c.inventory.filter(Boolean).length - before;
    expect(inBag).toBeGreaterThan(0);
    expect(RL.runLoot(c).length).toBeGreaterThan(0);
    expect(RL.runLoot(c).length + inBag).toBeGreaterThanOrEqual(kept);
    // the run ends (a death): the bag fills, the rest to the pages
    RM.noteRunDeath(g);
    g.townPortal();
    g.step(1);
    const end = ST.stateOf(g).runEnd!;
    expect(RL.runLoot(c).length).toBe(0);
    expect(RL.lootPages(c).length).toBeGreaterThan(RL.RUN_LOOT.pagesMax);
    expect(end.pages).toBe(RL.lootPages(c).length);
    expect(RL.pagesBlockRun(c)).toBe(true);
    expect(RM.startRunMode(g, 1, 0)).toBe(false);
    // sold from the pages: the run may start
    const gold = c.gold;
    while (RL.lootPages(c).length > RL.RUN_LOOT.pagesMax) RL.sellFromPages(g, 0);
    expect(c.gold).toBeGreaterThan(gold);
    expect(g.buyback.length).toBeGreaterThan(0);
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
  });

  it('the loot and the pages are saved with the character (a resumed run keeps its loot)', async () => {
    const { RM, RL, L, S, G, I, Rng, create } = await setup();
    const g = create();
    RM.startRunMode(g, 1, 0);
    g.takeOffer(null);
    const it = I.generateItem(new Rng('sv'), 'ring', 5, { forceQuality: 'rare' });
    RL.runLoot(g.character).push(it);
    void L;
    RL.lootPages(g.character).push(I.generateItem(new Rng('pg'), 'amulet', 5, { forceQuality: 'magic' }));
    const back = new G.Game(S.deserialize(S.serialize(g.toSave())), 'sorceress');
    expect(RL.runLoot(back.character).map((x) => x.uid)).toEqual([it.uid]);
    expect(RL.lootPages(back.character).length).toBe(1);
    expect(back.toSave().version).toBe(7);
  });

  it('the shop’s bag shows the pages: to the bag, or sold; the hub tells and holds the run', async () => {
    const { RL, I, Rng, create } = await setup();
    const UI = await import('../../ui/shop');
    const RH = await import('../../ui/hub6');
    const g = create();
    const c = g.character;
    for (let i = 0; i < RL.RUN_LOOT.pagesMax + 3; i++) RL.lootPages(c).push(I.generateItem(new Rng(`p${i}`), 'ring', 5, { forceQuality: 'magic' }));
    const ctx = {
      game: g,
      host: { message() {}, haptic() {}, itemSound() {}, openPanel() {} },
      screen: {
        open(n: HTMLElement) {
          document.body.append(n);
          return { close: () => n.remove() };
        },
      },
    };
    RH.hubState(g).tab = 'perso';
    const hub = RH.hub6(ctx as never, () => undefined);
    expect(hub.querySelector<HTMLButtonElement>('[data-sv="play"]')!.disabled).toBe(true);
    expect(hub.querySelector('[data-sv="pages"]')!.textContent).toMatch(/Pages temporaires pleines/);
    UI.openShop(ctx as never, 'bag');
    const node = document.body.lastElementChild as HTMLElement;
    const n = RL.lootPages(c).length;
    node.querySelector<HTMLButtonElement>('[data-sv="page-sell"]')!.click();
    expect(RL.lootPages(c).length).toBe(n - 1);
    node.querySelector<HTMLButtonElement>('[data-sv="page-bag"]')!.click();
    expect(RL.lootPages(c).length).toBe(n - 2);
    expect(c.inventory.some((x) => x && x.base === 'ring')).toBe(true);
  });
});
