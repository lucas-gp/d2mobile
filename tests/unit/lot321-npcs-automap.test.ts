/**
 * Lot 321 (audit of the Campaign against Diablo II, lots I, J, K, L; d2 and pd2; Rush, endgame and Survivals untouched):
 * I. the Campaign's automap remembers what the hero has seen (no monster, no chest, no object never seen);
 * J. each trading NPC his own stall (Diablo II's vendor table), gambling at the gamblers with Diablo II's odds, repair at the smiths,
 *    potions of the NPC's tier at Diablo II's price, a town's captain hires his act's mercenaries, Qual-Kehk's free Barbarian;
 * K. pd2 no longer interrupts at every hit (covered by combat-systems and vanilla-combat), the rejuvenation potions by rule;
 * L. a weapon rack gives one weapon, an armour stand one armour.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { VENDORS, VENDOR_CLASS_TYPES, POTION_PRICES, vendorPotionTier } from '../../src/data/vendors';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { GAMBLE_ODDS, D2_REJUV, RULES } from '../../src/mods/rules';
import { Rng } from '../../src/core/rng';
import { potionTierAt } from '../../src/sim/potion-tier';
import { interactObject } from '../../src/sim/objects';
import { Fog, zoneFogIf, zoneFogOf } from '../../src/sim/fog';
import { AUTOMAP_KINDS, automapMemory, exploreAround } from '../../src/ui/hud';
import { CELL } from '../../src/sim/grid';
import { withoutPd2 } from '../needs-pd2';

const townGame = (cls: 'sorceress' | 'barbarian' = 'sorceress') => {
  const g = new Game(undefined, cls);
  g.character.level = 30;
  g.character.gold = 1e7;
  g.enterTown('act1');
  return g;
};

describe('lot 321 J: the vendors of Diablo II', () => {
  it("the table: gamblers, smiths who repair, healers' and alchemists' potions, no trade for Atma nor the captains", () => {
    const by = (k: keyof (typeof VENDORS)[string]) =>
      Object.entries(VENDORS)
        .filter(([, v]) => !!v[k] || (k === 'potionTier' && v.potionTier !== undefined))
        .map(([id]) => id)
        .sort();
    expect(by('gamble')).toEqual(['alkor', 'anya', 'elzix', 'gheed', 'jamella']);
    expect(by('repair')).toEqual(['charsi', 'fara', 'halbu', 'hratli', 'larzuk']);
    expect(by('potionTier')).toEqual(['akara', 'drognan', 'jamella', 'lysander', 'malah', 'ormus']);
    expect(by('tome')).toEqual(['akara', 'drognan', 'jamella', 'malah', 'ormus']);
    for (const id of ['atma', 'kashya', 'greiz', 'qual_kehk', 'warriv', 'cain']) expect(VENDORS[id]).toBeUndefined();
    // every type sold exists among the bases
    const types = new Set<string>(Object.values(BASE_BY_ID).map((b) => b.type));
    for (const v of Object.values(VENDORS)) for (const t of [...v.types, ...(v.classItems ? VENDOR_CLASS_TYPES[v.classItems] : [])]) expect(types.has(t), `${v.name}: ${t}`).toBe(true);
  });

  it("an NPC's stall holds his wares only, normal or magic, kept between visits; another NPC another stall; the generic one unchanged", () => {
    const g = townGame('barbarian');
    const generic = g.vendor.map((v) => v.item.uid);
    g.openVendor('charsi');
    expect(g.vendorNpc).toBe('charsi');
    const charsi = g.vendor.map((v) => v.item.uid);
    expect(charsi.length).toBeGreaterThan(5);
    const allowed = new Set([...VENDORS.charsi.types, ...VENDOR_CLASS_TYPES.melee]);
    for (const v of g.vendor) {
      expect(allowed.has(BASE_BY_ID[v.item.base].type), v.item.base).toBe(true);
      expect(['normal', 'magic']).toContain(v.item.quality);
    }
    // bought: gone at the next visit
    const bought = g.vendor[0].item.uid;
    expect(g.buy(0).ok).toBe(true);
    g.openVendor('akara');
    const akara = g.vendor.map((v) => v.item.uid);
    for (const v of g.vendor) expect(['wand', 'scepter', 'staff', 'orb', 'head']).toContain(BASE_BY_ID[v.item.base].type);
    expect(akara.some((u) => charsi.includes(u))).toBe(false);
    g.openVendor('charsi');
    expect(g.vendor.map((v) => v.item.uid)).toEqual(charsi.filter((u) => u !== bought));
    // no NPC (bots, game modes, a mod's panel): the generic stall, as rolled by the visit
    g.openVendor(null);
    expect(g.vendorNpc).toBe(null);
    expect(g.vendor.map((v) => v.item.uid)).toEqual(generic);
    // a new difficulty renews them
    g.difficulty = 1;
    g.openVendor('charsi');
    expect(g.vendor.map((v) => v.item.uid)).not.toEqual(charsi.filter((u) => u !== bought));
  });

  it('an NPC who sells no equipment has an empty stall (Lysander, Alkor, Anya); a gambler shows a new gamble stock at each visit', () => {
    const g = townGame();
    for (const id of ['lysander', 'alkor', 'anya']) {
      g.openVendor(id);
      expect(g.vendor, id).toEqual([]);
    }
    g.openVendor('gheed');
    const a = g.gambleStock;
    expect(a.length).toBeGreaterThan(0);
    g.openVendor('gheed');
    expect(g.gambleStock).not.toBe(a);
    // a stall that does not gamble leaves it as it was
    const b = g.gambleStock;
    g.openVendor('charsi');
    expect(g.gambleStock).toBe(b);
  });

  it("gambling: Diablo II's odds (about 0.05 % unique, 0.1 % set, 10 % rare)", () => {
    const g = townGame();
    const rng = new Rng('gamble-odds');
    const n = 40000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const q = RULES['shop.gambleRoll'](g, rng).quality;
      count[q] = (count[q] ?? 0) + 1;
    }
    expect(GAMBLE_ODDS).toEqual({ unique: 0.0005, set: 0.001, rare: 0.1 });
    expect((count.rare ?? 0) / n).toBeGreaterThan(0.09);
    expect((count.rare ?? 0) / n).toBeLessThan(0.11);
    expect(((count.unique ?? 0) + (count.set ?? 0)) / n).toBeLessThan(0.004);
    expect((count.magic ?? 0) / n).toBeGreaterThan(0.88);
  });

  it("potions of the NPC's tier at Diablo II's price; Nightmare Greater, Hell Super; without an NPC the old price", () => {
    expect(vendorPotionTier(VENDORS.akara, 0)).toBe(0);
    expect(vendorPotionTier(VENDORS.ormus, 0)).toBe(2);
    expect(vendorPotionTier(VENDORS.jamella, 0)).toBe(3);
    expect(vendorPotionTier(VENDORS.akara, 1)).toBe(3);
    expect(vendorPotionTier(VENDORS.akara, 2)).toBe(4);
    expect(vendorPotionTier(VENDORS.charsi, 0)).toBe(null);
    const g = townGame();
    g.character.belt.forEach((b) => (b.qty = 0));
    const gold = g.character.gold;
    expect(g.buyConsumable('hp_potion', 1, 'akara').ok).toBe(true);
    expect(gold - g.character.gold).toBe(POTION_PRICES.hp_potion[0]);
    const g2 = townGame();
    g2.character.belt.forEach((b) => (b.qty = 0));
    const gold2 = g2.character.gold;
    expect(g2.buyConsumable('hp_potion', 1).ok).toBe(true);
    expect(gold2 - g2.character.gold).toBe(Math.max(25, g2.character.level * 6));
    expect(potionTierAt(1)).toBe(0);
  });

  it("a town hires its act's mercenaries; Harrogath also those of the acts out of reach; Qual-Kehk offers a Barbarian after the rescue", () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 30;
    g.enterTown('act5');
    const acts = g.mercActsHere();
    expect(acts).not.toBeNull();
    expect(acts![0]).toBe(5);
    // a new hero: Acts II to IV not open, so their mercenaries are hired here too (a hero of the Rush)
    for (const a of [2, 3, 4]) expect(acts).toContain(a);
    g.startRun('a1_bloodmoor', 0);
    expect(g.mercActsHere()).toBeNull();
    g.enterTown('act5');
    expect(g.mercOffers().find((o) => o.type.act === 5)!.cost).toBeGreaterThan(0);
    g.completeQuest('rescue', 0);
    expect(g.mercOffers().find((o) => o.type.act === 5)!.cost).toBe(0);
  });
});

describe('lot 321 K: rejuvenation potions by rule', () => {
  it("Diablo II's 35 % and 100 % in the base; pd2's 35 % and 65 %, at most 2 000", () => {
    expect(D2_REJUV).toEqual({ small: 0.35, full: 1, cap: Infinity });
    const r = RULES['potion.rejuv']();
    if (withoutPd2) expect(r).toEqual(D2_REJUV);
    else expect(r).toEqual({ small: 0.35, full: 0.65, cap: 2000 });
    const g = townGame();
    g.startRun('a1_bloodmoor', 0);
    const p = g.world.player;
    p.hpMax = 1000;
    p.hp = 1;
    g.character.belt.push({ kind: 'rejuv', qty: 1, tier: 1 });
    expect(g.world.usePotion('rejuv')).toBe(true);
    expect(p.hp).toBe(Math.min(1000, 1 + Math.min(r.cap, 1000 * r.full)));
  });
});

describe('lot 321 L: weapon racks and armour stands', () => {
  it('a rack gives one weapon, a stand one armour', () => {
    const g = townGame();
    g.startRun('a1_bloodmoor', 0);
    const w = g.world;
    for (const variant of [undefined, 'armor'] as const) {
      for (let k = 0; k < 6; k++) {
        const before = w.items.length;
        const o = { id: w.newId(), kind: 'weaponrack', x: w.player.x, y: w.player.y, radius: 1, used: false, label: '', ...(variant ? { variant } : {}) };
        interactObject(w, o);
        const got = w.items.slice(before);
        expect(got.length).toBe(1);
        const b = BASE_BY_ID[got[0].item.base];
        if (variant) expect(b.slot).not.toBe('mainhand');
        else expect(b.slot).toBe('mainhand');
        expect(o.used).toBe(true);
      }
    }
  });
});

describe('lot 321 I: the automap remembers', () => {
  it('only in the Campaign (zones and towns), not in a Rush run', () => {
    const g = townGame();
    expect(automapMemory(g)).toBe(true);
    g.startRun('a1_bloodmoor', 0);
    expect(automapMemory(g)).toBe(true);
    g.startRun('andariel', 0);
    expect(automapMemory(g)).toBe(false);
  });

  it('the cells around the hero explored as he walks, kept with the zone; no chest nor barrel marked', () => {
    const g = townGame();
    g.startRun('a1_bloodmoor', 0);
    const w = g.world;
    expect(zoneFogIf(w)).toBeUndefined();
    exploreAround(w);
    const f = zoneFogOf(w, CELL);
    expect(f.isSeen(w.player.x, w.player.y)).toBe(true);
    const far = { x: w.player.x + 40, y: w.player.y };
    expect(f.isSeen(far.x, far.y)).toBe(false);
    const n = f.count;
    exploreAround(w);
    expect(f.count).toBe(n);
    expect(f).toBeInstanceOf(Fog);
    for (const k of ['waypoint', 'portal', 'shrine', 'npc']) expect(AUTOMAP_KINDS.has(k)).toBe(true);
    for (const k of ['chest', 'barrel', 'sarcophagus', 'weaponrack']) expect(AUTOMAP_KINDS.has(k)).toBe(false);
  });
});
