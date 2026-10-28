// @vitest-environment happy-dom
/**
 * Lot 295 (the owner's note: a main menu in six tabs and three panels): the Run's hub shows, tab by tab, the owner's three panels (left,
 * centre, right), each drawn from the game's own systems; a tap selects an item and opens its sheet, whose actions are the game's
 * (equip, sell without a merchant, stash, Cube, craft, the hireling); the Craft tab runs Diablo II's crafting recipe, the Cube tab its
 * transmutation; the Mercenary tab hires one of Diablo II's hirelings at the best level reached (the hero is level 1 between runs), who
 * wears any item (no requirement in the mode), and follows the hero into the next run.
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const H = await import('../../ui/hub6');
  const RM = await import('../../sim/runmode');
  const RL = await import('../../sim/runloot');
  const ST = await import('../../sim/state');
  const I = await import('../../../../src/sim/loot/itemgen');
  const INV = await import('../../../../src/sim/inventory');
  const { D2_CRAFTS } = await import('../../../../src/data/cube-d2');
  const { Rng } = await import('../../../../src/core/rng');
  const create = (cls = 'barbarian') => {
    const g = new env.G.Game(undefined, cls as never);
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  const give = (g: { character: unknown }, base: string, q: 'magic' | 'rare' | 'normal' = 'magic', ilvl = 20) => {
    const it = I.generateItem(new Rng(`hub:${base}:${q}:${ilvl}`), base, ilvl, { forceQuality: q });
    INV.addToCharacter(g.character as never, it);
    return it;
  };
  const host = { message() {}, haptic() {}, itemSound() {}, openPanel() {} };
  /** The hub drawn into the page; `draw()` again after each action (the widget does it on the next frame) */
  const mount = (g: unknown) => {
    const ctx = { game: g, host, screen: { open: (n: HTMLElement) => (document.body.append(n), { close: () => n.remove() }) } };
    let root: HTMLElement;
    const draw = () => {
      root?.remove();
      root = H.hub6(ctx as never, () => undefined);
      document.body.append(root);
      return root;
    };
    draw();
    return { draw, q: <T extends Element = HTMLElement>(s: string) => draw().querySelector<T & HTMLElement>(s) };
  };
  return { ...env, H, RM, RL, I, INV, D2_CRAFTS, create, give, mount };
}

describe('Survivals: the hub in six tabs (lot 295)', () => {
  it('six tabs, each with the owner’s three panels, the run started from its bar', async () => {
    const { H, create, mount } = await setup();
    const g = create();
    const m = mount(g);
    expect([...m.draw().querySelectorAll<HTMLElement>('[data-sv="tabs"] [data-tab]')].map((b) => b.dataset.tab)).toEqual(['perso', 'coffre', 'skills', 'craft', 'cube', 'merco']);
    const want: Record<string, string[]> = {
      perso: ['equipment', 'bag', 'runs'],
      coffre: ['equipment', 'bag', 'stash'],
      skills: ['forge', 'stats', 'trees'],
      craft: ['bag', 'craft', 'stash'],
      cube: ['bag', 'cube', 'stash'],
      merco: ['merc', 'bag', 'stash'],
    };
    for (const t of Object.keys(want)) {
      m.q<HTMLButtonElement>(`[data-tab="${t}"]`)!.click();
      const r = m.draw();
      expect(r.dataset.tab).toBe(t);
      expect([...r.querySelectorAll<HTMLElement>('.svh-panel')].map((p) => `${p.dataset.pane}:${p.dataset.part}`)).toEqual(want[t].map((p, k) => `${['left', 'center', 'right'][k]}:${p}`));
    }
    expect(H.HUB_LAYOUT).toEqual(want);
    // the Character tab: the equipment's ten slots, the charms' grid, the runs; the bar's run button starts the picked act
    H.hubState(g).tab = 'perso';
    const r = m.draw();
    expect(r.querySelectorAll('[data-grid="equipment"] [data-slot]').length).toBe(10);
    expect(r.querySelector('[data-grid="charms"]')).not.toBeNull();
    expect(r.querySelector('[data-sv="acts"] [data-act="1"][data-diff="0"]')).not.toBeNull();
    expect(r.querySelector('[data-sv="reset"]')!.textContent).toMatch(/Roguelite/);
    r.querySelector<HTMLButtonElement>('[data-sv="play"]')!.click();
    expect(g.mode).toBe('run');
  });

  it('the bag: items placed by their size, a tap opens the sheet, equip and sell without a merchant, charms activated', async () => {
    const { H, create, give, mount } = await setup();
    const g = create();
    const c = g.character;
    const helm = give(g, 'great_helm', 'rare');
    const charm = give(g, 'grand_charm');
    const m = mount(g);
    const cell = m.q(`[data-grid="bag"] [data-uid="${helm.uid}"]`)!;
    // a 2 × 2 helm spans two columns and two rows of cells
    expect(cell.style.gridColumn).toMatch(/span 2/);
    expect(cell.style.gridRow).toMatch(/span 2/);
    cell.click();
    expect(m.q('[data-sv="detail"] .tip')).not.toBeNull();
    // worn at once, whatever its requirements (level 1 hero)
    m.q<HTMLButtonElement>('[data-sv="detail"] [data-act="equip"]')!.click();
    expect(c.equipment.head?.uid).toBe(helm.uid);
    expect(m.q(`[data-grid="equipment"] [data-uid="${helm.uid}"]`)).not.toBeNull();
    // a charm activated (the charms' grid), then sold from it: gold without a merchant
    // (a charm picked up goes straight to the charms' grid: back to the bag first)
    if (c.charmInv.some((x) => x?.uid === charm.uid)) {
      m.q(`[data-grid="charms"] [data-uid="${charm.uid}"]`)!.click();
      m.q<HTMLButtonElement>('[data-act="unstow"]')!.click();
    }
    expect(c.inventory.some((x) => x?.uid === charm.uid)).toBe(true);
    m.q(`[data-grid="bag"] [data-uid="${charm.uid}"]`)!.click();
    m.q<HTMLButtonElement>('[data-act="stow"]')!.click();
    expect(c.charmInv.some((x) => x?.uid === charm.uid)).toBe(true);
    const gold = c.gold;
    m.q(`[data-grid="charms"] [data-uid="${charm.uid}"]`)!.click();
    m.q<HTMLButtonElement>('[data-sv="detail"] [data-act="sell"]')!.click();
    expect(c.gold).toBeGreaterThan(gold);
    expect(c.charmInv.some((x) => x?.uid === charm.uid)).toBe(false);
    expect(H.hubState(g).note).toMatch(/Vendu/);
  });

  it('the Stash tab: the bag’s item to the stash’s page, back to the bag; the temporary pages in the bag panel', async () => {
    const { H, RL, I, create, give, mount } = await setup();
    const { Rng } = await import('../../../../src/core/rng');
    const g = create();
    const c = g.character;
    const ring = give(g, 'ring');
    H.hubState(g).tab = 'coffre';
    const m = mount(g);
    const page = H.hubState(g).stashTab;
    m.q(`[data-grid="bag"] [data-uid="${ring.uid}"]`)!.click();
    m.q<HTMLButtonElement>('[data-act="to-stash"]')!.click();
    expect(c.stash[page].some((x) => x?.uid === ring.uid)).toBe(true);
    m.q(`[data-grid="stash"] [data-uid="${ring.uid}"]`)!.click();
    m.q<HTMLButtonElement>('[data-act="unstash"]')!.click();
    expect(c.inventory.some((x) => x?.uid === ring.uid)).toBe(true);
    // the pager walks the stash's pages
    m.q<HTMLButtonElement>('[data-sv="stash-next"]')!.click();
    expect(H.hubState(g).stashTab).not.toBe(page);
    // the run's surplus: the temporary pages, sold from the bag panel; a run held while they are too full
    for (let i = 0; i < RL.RUN_LOOT.pagesMax + 2; i++) RL.lootPages(c).push(I.generateItem(new Rng(`tp${i}`), 'ring', 5, { forceQuality: 'magic' }));
    H.hubState(g).tab = 'perso';
    expect(m.q<HTMLButtonElement>('[data-sv="play"]')!.disabled).toBe(true);
    expect(m.q('[data-sv="pages"]')!.textContent).toMatch(/Pages temporaires pleines/);
    m.q<HTMLButtonElement>('[data-view="pages"]')!.click();
    const n = RL.lootPages(c).length;
    m.q('[data-sv="page-list"] .svh-prow')!.click();
    m.q<HTMLButtonElement>('[data-sv="detail"] [data-act="sell"]')!.click();
    expect(RL.lootPages(c).length).toBe(n - 1);
  });

  it('Craft: Diablo II’s Blood amulet (magic amulet, jewel, Amn, perfect ruby) made from the hub', async () => {
    const { H, D2_CRAFTS, create, give, mount } = await setup();
    const g = create();
    const c = g.character;
    const amulet = give(g, 'amulet');
    give(g, 'jewel');
    H.hubState(g).tab = 'craft';
    const m = mount(g);
    m.q<HTMLButtonElement>('[data-recipe="craft_blood"]')!.click();
    // the bag's items the recipe takes are lit, the others dimmed; nothing to make without the rune and the gem
    expect(m.q(`[data-grid="bag"] [data-uid="${amulet.uid}"]`)!.classList.contains('dim')).toBe(true);
    const craft = D2_CRAFTS.blood.amulet;
    c.materials[craft.rune] = 1;
    c.materials[craft.gem] = 1;
    expect(m.q(`[data-grid="bag"] [data-uid="${amulet.uid}"]`)!.classList.contains('fits')).toBe(true);
    m.q(`[data-grid="bag"] [data-uid="${amulet.uid}"]`)!.click();
    m.q<HTMLButtonElement>('[data-sv="detail"] .primary')!.click();
    const make = m.q<HTMLButtonElement>('[data-sv="craft"]')!;
    expect(make.disabled).toBe(false);
    make.click();
    expect(c.inventory.some((x) => x?.quality === 'crafted' && x.base === 'amulet')).toBe(true);
    expect(c.materials[craft.rune] ?? 0).toBe(0);
    expect(c.inventory.some((x) => x?.base === 'jewel')).toBe(false);
  });

  it('Cube: three runes from the stash’s tab into the Horadric Cube, transmuted into the next rune', async () => {
    const { H, create, give, mount } = await setup();
    const g = create();
    const c = g.character;
    c.materials.r01 = 3;
    H.hubState(g).tab = 'cube';
    const m = mount(g);
    for (let i = 0; i < 3; i++) m.q<HTMLButtonElement>('[data-sv="materials"] [data-mat="r01"]')!.click();
    expect(c.cube.filter(Boolean).length).toBe(3);
    m.q<HTMLButtonElement>('[data-sv="transmute"] [data-recipe="rune_r01"]')!.click();
    // the rune made goes to the stash's tab of runes, as in the base's Cube
    expect(c.cube.filter(Boolean)).toEqual([]);
    expect(c.materials.r02).toBe(1);
    // an item of the bag to the Cube, taken back
    const ring = give(g, 'ring');
    m.q(`[data-grid="bag"] [data-uid="${ring.uid}"]`)!.click();
    m.q<HTMLButtonElement>('[data-act="to-cube"]')!.click();
    expect(c.cube.some((x) => x?.uid === ring.uid)).toBe(true);
    m.q(`[data-grid="cube"] [data-uid="${ring.uid}"]`)!.click();
    m.q<HTMLButtonElement>('[data-act="from-cube"]')!.click();
    expect(c.inventory.some((x) => x?.uid === ring.uid)).toBe(true);
  });

  it('Mercenary: hired at the best level reached, any item worn (no requirement), with the hero in the next run', async () => {
    const { H, RM, create, give, mount } = await setup();
    const g = create();
    const c = g.character;
    c.gold = 5000;
    H.hubState(g).tab = 'merco';
    const m = mount(g);
    // the Rogue opens at level 5: closed to a level-1 hero who never reached it
    expect(m.q<HTMLButtonElement>('[data-merc^="rogue:"]')!.disabled).toBe(true);
    c.progression.milestones[RM.BEST_LEVEL] = 18;
    m.q<HTMLButtonElement>('[data-merc^="rogue:"]')!.click();
    expect(c.merc?.type).toBe('rogue');
    // a Great Helm (level 6, strength 63) on a level-1 hireling
    const helm = give(g, 'great_helm', 'rare');
    m.q(`[data-grid="bag"] [data-uid="${helm.uid}"]`)!.click();
    m.q<HTMLButtonElement>('[data-act="to-merc"]')!.click();
    expect(c.merc?.equipment.head?.uid).toBe(helm.uid);
    expect(m.q(`[data-grid="merc"] [data-uid="${helm.uid}"]`)).not.toBeNull();
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    expect(g.world.monsters.some((x) => x.pet === 'merc' && !x.dead)).toBe(true);
  });

  it('Skills: the class’s three trees read-only, a skill’s sheet; the stats panel', async () => {
    const { H, create, mount } = await setup();
    const g = create('sorceress');
    const learned = { ...g.character.skills };
    H.hubState(g).tab = 'skills';
    const m = mount(g);
    const r = m.draw();
    expect(r.querySelectorAll('[data-tree]').length).toBe(3);
    expect(r.querySelectorAll('[data-sv="tree"] [data-skill]').length).toBeGreaterThanOrEqual(10);
    r.querySelector<HTMLButtonElement>('[data-sv="tree"] [data-skill]')!.click();
    expect(m.q('[data-sv="skill-info"]')).not.toBeNull();
    expect(m.q('[data-sv="stats"]')!.textContent).toMatch(/Points de vie/);
    // read-only: a tap shows, never learns
    expect(g.character.skills).toEqual(learned);
  });
});
