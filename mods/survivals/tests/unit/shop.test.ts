// @vitest-environment happy-dom
/**
 * Lot 292 (the third study of another survivors game, Act I focus): the Run mode's economy (prices in runs, a fifth on a sale, a zone's
 * kill gold capped, the elites' chests), the hub's shop (a stock of the class at each run's end, sized to the run's level, kept after a
 * purchase and a reload; Diablo II's gamble odds; the buy-back), the starter kit (no hero without a weapon), the comparison's rows, the
 * long press, the character sheet's section, the run-end screen (the gold into the purse, the best buy, "Visit the shop") and the shop's
 * screen (tabs, buy, wear, sell, buy back, gamble).
 */
import { describe, expect, it } from 'vitest';
import type { Game } from '../../../../src/sim/game';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const EC = await import('../../sim/economy');
  const SH = await import('../../sim/shop');
  const ST = await import('../../sim/state');
  const CP = await import('../../sim/checkpoints');
  const L = await import('../../sim/loot');
  const S = await import('../../../../src/sim/save');
  const I = await import('../../../../src/sim/loot/itemgen');
  const { Rng } = await import('../../../../src/core/rng');
  const create = (cls = 'sorceress') => {
    const g = new env.G.Game(undefined, cls as never);
    g.character.name = `Shop ${cls}`;
    for (const f of env.U.contributions('create.character')) f({ game: g });
    stopAutoStart(g);
    return g;
  };
  const stopAutoStart = (g: Game) => {
    ST.stateOf(g).autoStart = false;
  };
  /** A run played and lost at once (the shop rolls at its end), the hero reaching `level` */
  const endRunAt = (g: Game, level: number) => {
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.takeOffer(null);
    g.character.level = level;
    RM.noteRunDeath(g);
    g.townPortal();
    g.step(1);
    return ST.stateOf(g).runEnd!;
  };
  return { ...env, RM, EC, SH, ST, CP, L, S, I, Rng, create, endRunAt };
}

describe('Survivals economy (lot 292)', () => {
  it('prices in runs: magic ≈ 1.4 runs, rare ≈ 3, gamble 6 to 8, a sale a fifth', async () => {
    const { EC, I, Rng } = await setup();
    const rng = new Rng('econ');
    const magic = I.generateItem(rng, 'ring', 15, { forceQuality: 'magic' });
    const rare = I.generateItem(rng, 'ring', 15, { forceQuality: 'rare' });
    expect(EC.buyPrice(magic)).toBe(140);
    expect(EC.buyPrice(rare)).toBe(300);
    expect(EC.sellPriceOf(magic, 999)).toBe(28);
    expect(EC.sellPriceOf(rare, 999) / EC.buyPrice(rare)).toBeCloseTo(0.2, 2);
    expect(EC.gamblePrice('ring', 15)).toBeGreaterThanOrEqual(560);
    expect(EC.gamblePrice('breast_plate', 15)).toBeLessThanOrEqual(800);
    // higher item levels cost more (Nightmare, Hell)
    expect(EC.buyPrice(I.generateItem(rng, 'ring', 60, { forceQuality: 'magic' }))).toBe(Math.round(140 * 1.45));
    // runes, gems, charms (no slot): a share of the base's own sale price
    const gem = I.generateItem(rng, 'small_charm', 10, { forceQuality: 'magic' });
    expect(EC.sellPriceOf(gem, 40)).toBe(10);
  });

  it('a zone counts its kills’ gold fully up to the cap, then a share (fractions kept); outside a run, all of it', async () => {
    const { EC, create, RM } = await setup();
    const g = create();
    expect(EC.runGold(g.world, 50)).toBe(50);
    RM.startRunMode(g, 1, 0);
    const w = g.world;
    const cap = EC.ECON.zoneCap;
    expect(EC.runGold(w, 5)).toBe(5);
    // the cap reached by a pile of `cap` (lot 296: 40 a zone)
    expect(EC.runGold(w, cap)).toBe(cap - 5 + Math.floor(5 * EC.ECON.over));
    let sum = 0;
    for (let i = 0; i < 100; i++) sum += EC.runGold(w, 10);
    expect(sum).toBeGreaterThanOrEqual(Math.floor(1000 * EC.ECON.over) - 1);
    expect(sum).toBeLessThanOrEqual(Math.ceil(1000 * EC.ECON.over) + 1);
  });

  it('the sale price is the shop’s in Run mode, the base’s in the Campaign', async () => {
    const { create, I, Rng, EC, G, U } = await setup();
    const g = create();
    const it = I.generateItem(new Rng('s'), 'ring', 15, { forceQuality: 'magic' });
    expect(g.sellPrice(it)).toBe(EC.sellPriceOf(it, 0));
    const camp = new G.Game(undefined, 'sorceress');
    for (const f of U.contributions('create.character')) f({ game: camp, variant: 'campaign' });
    expect(camp.sellPrice(it)).not.toBe(EC.sellPriceOf(it, 0));
  });

  it('an elite chest pays gold too in the act flow, and Andariel hers', async () => {
    const { EC } = await setup();
    const w = { character: { gold: 0 }, difficulty: 0 } as never;
    expect(EC.chestGold(w, 'miniboss')).toBe(EC.ECON.chest.miniboss);
    expect(EC.chestGold({ character: { gold: 0 }, difficulty: 2 } as never, 'boss')).toBe(Math.round(EC.ECON.chest.boss * 2.4));
  });
});

describe('Survivals hub shop (lot 292)', () => {
  it('a stock of the class at each run’s end, sized to the run’s level, the weapons of the kind worn', async () => {
    const { create, SH, endRunAt, Rng } = await setup();
    const g = create('barbarian');
    const s0 = SH.shopStock(g);
    endRunAt(g, 14);
    const s1 = SH.shopStock(g);
    expect(s1).not.toBe(s0);
    expect(g.vendor).toBe(s1);
    expect(s1.length).toBe(SH.SHOP.size);
    expect(SH.shopLevel(g.character)).toBe(14);
    for (const e of s1) {
      expect(e.item.ilvl).toBe(14);
      expect(['magic', 'rare']).toContain(e.item.quality);
      expect(e.price).toBeGreaterThan(100);
    }
    const { BASE_BY_ID } = await import('../../../../src/data/items/bases');
    const worn = BASE_BY_ID[g.character.equipment.mainhand!.base];
    const weapons = s1.filter((e) => BASE_BY_ID[e.item.base].slot === 'mainhand');
    expect(weapons.length).toBe(SH.SHOP.weapons);
    for (const e of weapons) expect([BASE_BY_ID[e.item.base].type, !!BASE_BY_ID[e.item.base].twoHanded]).toEqual([worn.type, !!worn.twoHanded]);
    // the base's refreshes keep the same stall
    g.refreshVendor();
    expect(g.vendor).toBe(s1);
    // a new run's end: another stock
    endRunAt(g, 16);
    expect(SH.shopStock(g)).not.toBe(s1);
    expect(SH.shopLevel(g.character)).toBe(16);
    void Rng;
  });

  it('a purchase stays bought after a reload; worn at once when it gains; the best buy is the purse’s', async () => {
    const { create, SH, endRunAt, S, G } = await setup();
    const g = create();
    endRunAt(g, 12);
    g.character.gold = 5000;
    const stock = SH.shopStock(g);
    const n = stock.length;
    const best = SH.bestBuy(g);
    expect(best).not.toBeNull();
    const item = stock[best!.idx].item;
    const r = SH.buyShop(g, best!.idx);
    expect(r.ok).toBe(true);
    expect(r.equipped).toBe(true);
    expect(Object.values(g.character.equipment)).toContain(item);
    expect(SH.shopStock(g).length).toBe(n - 1);
    const back = new G.Game(S.deserialize(S.serialize(g.toSave())), 'sorceress');
    const again = SH.shopStock(back);
    expect(again.length).toBe(n - 1);
    expect(again.some((e) => e.item.uid === item.uid)).toBe(false);
    // not enough gold
    g.character.gold = 0;
    expect(SH.buyShop(g, 0)).toMatchObject({ ok: false });
  });

  it('a sale goes to the buy-back at its price; the gamble follows Diablo II’s odds at the stall’s level', async () => {
    const { create, SH, endRunAt, I, Rng, EC } = await setup();
    const g = create();
    endRunAt(g, 20);
    const it = I.generateItem(new Rng('bb'), 'ring', 20, { forceQuality: 'rare' });
    g.character.inventory[0] = it;
    const price = g.sellPrice(it);
    expect(price).toBe(EC.sellPriceOf(it, 0));
    const gold = g.character.gold;
    expect(g.sell(0)).toBe(true);
    expect(g.character.gold).toBe(gold + price);
    expect(g.buyback[0]).toMatchObject({ item: it, price });
    expect(g.rebuy(0).ok).toBe(true);
    // gamble
    const stall = SH.gambleStock(g);
    expect(stall.length).toBe(SH.SHOP.gambles);
    expect(g.gambleStock).toBe(stall);
    g.character.gold = 1e6;
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const q = SH.gambleRoll(g.character, new Rng(`gq${i}`));
      counts[q.quality] = (counts[q.quality] ?? 0) + 1;
      expect(q.ilvl).toBeGreaterThanOrEqual(15);
      expect(q.ilvl).toBeLessThanOrEqual(24);
    }
    expect(counts.magic).toBeGreaterThan(330);
    expect(counts.rare).toBeGreaterThan(20);
    const r = SH.gambleShop(g, 0);
    expect(r.ok).toBe(true);
    expect(SH.gambleStock(g).length).toBe(SH.SHOP.gambles);
  });

  it('the endgame: Nightmare’s Act I opens the larger stock, more rares, the best level’s share', async () => {
    const { create, SH, CP, RM, endRunAt } = await setup();
    const g = create();
    endRunAt(g, 30);
    endRunAt(g, 10);
    expect(SH.shopLevel(g.character)).toBe(10);
    CP.markCheckpoint(g.character, 0, RM.actRounds(1)[6].id);
    expect(SH.endgameTier(g.character)).toBe(1);
    expect(SH.shopLevel(g.character)).toBe(RM.entryLevel(1, 1));
    endRunAt(g, 10);
    expect(SH.shopStock(g).length).toBe(SH.SHOP.sizeEndgame);
  });
});

describe('Survivals starter kit (lot 292)', () => {
  it('every class starts a run with a weapon; the one-handed melee classes with a buckler', async () => {
    const { create, RM } = await setup();
    for (const cls of ['sorceress', 'druid', 'barbarian', 'paladin', 'amazon', 'assassin', 'necromancer']) {
      const g = create(cls);
      delete g.character.equipment.mainhand;
      delete g.character.equipment.offhand;
      expect(RM.startRunMode(g, 1, 0)).toBe(true);
      const eq = g.character.equipment;
      expect(eq.mainhand?.base).toBe(RM.STARTER_KIT[cls].weapon);
      if (RM.STARTER_KIT[cls].shield) expect(eq.offhand?.base).toBe('buckler');
      else expect(eq.offhand).toBeUndefined();
    }
    // a weapon worn is never replaced
    const g = create('barbarian');
    const axe = g.character.equipment.mainhand!;
    RM.startRunMode(g, 1, 0);
    expect(g.character.equipment.mainhand).toBe(axe);
  });
});

describe('Survivals comparison, long press, sheet (lot 292)', () => {
  it('the comparison tells the weapon damage, the attack speed and the damage reduction; a long press acts', async () => {
    const { R, create, I, Rng } = await setup();
    const g = create('barbarian');
    const IT = await import('../../../../src/ui/itemtext');
    const axe = I.generateItem(new Rng('cmp'), 'double_axe', 20, { forceQuality: 'magic' });
    const rows = IT.compareDeltas(axe, g.character, 'mainhand');
    expect(rows[0].label).toBe('Dégâts (arme)');
    expect(rows[0].delta).toBeGreaterThan(0);
    expect(R.RULES['ui.holdToAct'](g)).toBe(true);
  });

  it('the character sheet’s section: life, resistances, damage reduction, damage, speeds, the tier', async () => {
    const { U, create } = await setup();
    const g = create();
    const [sheet] = U.contributions('character.sheet').map((f) => f({ game: g, host: { message() {}, haptic() {}, itemSound() {} } }));
    const text = sheet!.textContent!;
    for (const k of ['Vie', 'Résistances', 'Réduction des dégâts', "Dégâts de l'arme", "Vitesse d'attaque", 'Palier : Normal']) expect(text).toContain(k);
  });
});

describe('Survivals shop and run-end screens (lot 292)', () => {
  const ctxOf = (g: Game) => {
    const screens: HTMLElement[] = [];
    const msgs: string[] = [];
    return {
      screens,
      msgs,
      ctx: {
        game: g,
        host: { message: (t: string) => msgs.push(t), haptic() {}, itemSound() {} },
        screen: {
          open(n: HTMLElement) {
            screens.push(n);
            document.body.append(n);
            return { close: () => n.remove() };
          },
        },
      },
    };
  };

  it('the run-end screen: the gold into the purse, the best buy, “Visit the shop”, Rejouer', async () => {
    const { create, endRunAt } = await setup();
    const RH = await import('../../ui/runhub');
    const g = create();
    const end = endRunAt(g, 12);
    end.gold = 90;
    const { ctx, screens } = ctxOf(g);
    RH.runEndScreen(ctx as never, end);
    const node = screens[0];
    expect(node.querySelector('[data-sv="gold-flow"]')).not.toBeNull();
    expect(node.querySelector('[data-sv="again"]')).not.toBeNull();
    const visit = node.querySelector<HTMLButtonElement>('[data-sv="visit-shop"]')!;
    expect(visit).not.toBeNull();
    visit.click();
    expect(screens[1].dataset.svScreen).toBe('shop');
    expect(screens[1].querySelectorAll('[data-sv-item]').length).toBeGreaterThan(0);
  });

  it('the shop’s tabs: buy, bag (wear, sell), buy back, gamble', async () => {
    const { create, endRunAt, SH } = await setup();
    const UI = await import('../../ui/shop');
    const g = create();
    endRunAt(g, 15);
    g.character.gold = 5000;
    const { ctx, screens } = ctxOf(g);
    UI.openShop(ctx as never, 'buy');
    const node = screens[0];
    const n = SH.shopStock(g).length;
    node.querySelector<HTMLButtonElement>('[data-sv="buy"]')!.click();
    expect(SH.shopStock(g).length).toBe(n - 1);
    expect(node.querySelector('[data-sv="note"]')!.textContent).toMatch(/^Acheté/);
    node.querySelector<HTMLButtonElement>('[data-tab="bag"]')!.click();
    const sells = node.querySelectorAll<HTMLButtonElement>('[data-sv="sell"]');
    if (sells.length) {
      const gold = g.character.gold;
      sells[0].click();
      expect(g.character.gold).toBeGreaterThan(gold);
      node.querySelector<HTMLButtonElement>('[data-tab="back"]')!.click();
      expect(node.querySelectorAll('[data-sv-item]').length).toBe(g.buyback.length);
    }
    node.querySelector<HTMLButtonElement>('[data-tab="gamble"]')!.click();
    const bet = node.querySelector<HTMLButtonElement>('[data-sv="gamble"]')!;
    const gold = g.character.gold;
    bet.click();
    expect(g.character.gold).toBeLessThan(gold);
    expect(node.querySelector('[data-sv="note"]')!.textContent).toMatch(/^Révélé/);
    // a tap on a row shows its tooltip
    node.querySelector<HTMLButtonElement>('[data-tab="buy"]')!.click();
    node.querySelector<HTMLElement>('[data-sv-item]')!.click();
    expect(node.querySelector('.sv-itip')).not.toBeNull();
  });
});
