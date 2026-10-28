/**
 * The Run mode's economy (lot 292, a third study of another survivors game, observed for reference only): the gold a run brings is
 * the same order for every class (about 100 gold an Act I run in Normal), and the hub's shop is priced in runs: a magic item about 1 to
 * 1.5 runs, a rare about 3, a gamble 6 to 8, a sale a fifth of the price. Our rules: Diablo II's items and gamble odds, no paid stat, no
 * potion, gear without requirements; the gold is the run's loot and its elites' chests.
 *
 * - **Prices** (`ECON`, rule `shop.sellPrice` and the mode's own stall, `sim/shop.ts`): an item's price is its quality's (`ECON.buy`)
 *   times `0.85 + ilvl / 100` (×1 at item level 15, the end of Act I in Normal; ×1.45 at 60), a sale `ECON.sell` of it; runes, gems,
 *   charms and jewels (no slot) `ECON.misc` of the base's sale price. A gamble `ECON.gamble` (a base of a higher level costs more).
 * - **Gold of a run** (`runGold`): the piles (Diablo II's treasure classes, no multiplier, then the mode's share, `RUN.gold`) and the
 *   items turned into gold (the shop's sale price × `RUN.sell`) count fully up to `ECON.zoneCap` gold a zone, then `ECON.over` of it
 *   (a build that kills three times more does not earn three times more), and every elite's chest pays (`ECON.chest`: a unique, the
 *   zone's mini-boss, the act's boss; × `ECON.chestDiff` in Nightmare and Hell, as Diablo II's gold grows with the monsters' level).
 * Measured with the bots (`tools/gold.ts`, README "Economy").
 */
import { BASE_BY_ID, type Game, type Item, type World } from '../../../src/mods/sdk';
import { isRunMode, RUN } from './runmode';
import { forgeGold } from './forge';

export const ECON = {
  /** Price by quality at item level 15 */
  buy: { low: 15, normal: 25, superior: 40, magic: 140, rare: 300, crafted: 320, set: 450, unique: 650, runeword: 800 } as Record<string, number>,
  /** Price factor: `at0 + ilvl × per` */
  at0: 0.85,
  per: 0.01,
  /** A sale: share of the price */
  sell: 0.2,
  /** Runes, gems, charms, jewels (no slot): share of the base's sale price */
  misc: 0.25,
  /** A gamble: `base + perQlvl × the item base's level`, times the stall level's factor */
  gamble: { base: 560, perQlvl: 6 },
  /** Gold of the kills (piles, items turned into gold) a zone counts fully, then this share of the rest (lot 296: 7 → 40, about 100 gold a run of 3 minutes) */
  zoneCap: 40,
  over: 0.03,
  /** Gold of an elite's chest (Act I's flow): a unique, the zone's mini-boss, the act's boss */
  chest: { unique: 2, miniboss: 5, boss: 15 },
  /** Chests' gold by difficulty (Normal, Nightmare, Hell) */
  chestDiff: [1, 1.6, 2.4] as readonly number[],
};

/** Price factor of an item level */
export const levelFactor = (ilvl: number): number => ECON.at0 + Math.max(1, ilvl) * ECON.per;

/** What the hub's shop asks for an item (its quality and level; runes, gems, charms: the sale price / `ECON.sell`) */
export function buyPrice(item: Item): number {
  const b = BASE_BY_ID[item.base];
  if (!b?.slot) return Math.max(1, Math.round(sellPriceOf(item, 0) / ECON.sell));
  const q = item.runeword ? ECON.buy.runeword : (ECON.buy[item.quality] ?? ECON.buy.normal);
  return Math.max(1, Math.round(q * levelFactor(item.ilvl)));
}

/** What the shop pays for an item: `ECON.sell` of its price (no slot: `ECON.misc` of the base's own sale price `basePrice`) */
export function sellPriceOf(item: Item, basePrice: number): number {
  const b = BASE_BY_ID[item.base];
  if (!b?.slot) return Math.max(1, Math.round(basePrice * ECON.misc));
  return Math.max(1, Math.round(buyPrice(item) * ECON.sell));
}

/** A gamble's price for a base at the stall's level */
export function gamblePrice(baseId: string, level: number): number {
  const b = BASE_BY_ID[baseId];
  return Math.round((ECON.gamble.base + ECON.gamble.perQlvl * (b?.qlvl ?? 1)) * levelFactor(level));
}

/** The gold of a run, by source (the bots' measure, `tools/gold.ts`) */
export interface GoldStats {
  chests: number;
  capped: number;
}
const GOLD = new WeakMap<object, GoldStats>();
export function goldStats(g: Game): GoldStats {
  let s = GOLD.get(g.character);
  if (!s) GOLD.set(g.character, (s = { chests: 0, capped: 0 }));
  return s;
}

/** Gold of the kills already counted in a zone (a world is a zone) */
const ZONE_GOLD = new WeakMap<object, { had: number; frac: number }>();

/**
 * Gold of the kills (a pile as it drops, an item turned into gold) in a zone of a run (`w`, a world is a zone): fully up to `ECON.zoneCap`
 * a zone, `ECON.over` beyond. Outside a run, the amount as it is
 */
export function runGold(w: World | null | undefined, amount: number): number {
  if (!w || !w.run || !isRunMode(w.character)) return amount;
  const z = ZONE_GOLD.get(w) ?? { had: 0, frac: 0 };
  const full = Math.max(0, Math.min(amount, ECON.zoneCap - z.had));
  // beyond the cap, the share is kept in fractions: many small piles give their share, not a gold piece each
  z.frac += (amount - full) * ECON.over;
  // lot 308: the training's gold (sim/forge.ts), a share of what counts, kept in fractions as the rest
  z.frac += (full + (amount - full) * ECON.over) * forgeGold(w.character);
  const extra = Math.floor(z.frac);
  z.frac -= extra;
  z.had += amount;
  ZONE_GOLD.set(w, z);
  const got = full + extra;
  const s = GOLD.get(w.character);
  if (s) s.capped += amount - got;
  return got;
}

/** An item of the run turned into gold: its sale price × `RUN.sell`, before the zone's cap */
export const junkGold = (g: Game, item: Item): number => Math.max(1, Math.round(g.sellPrice(item) * (isRunMode(g.character) ? RUN.sell : 1)));

/** An elite's chest's gold (Act I's flow): paid at once, told with the chest */
export function chestGold(w: World, kind: keyof typeof ECON.chest, g?: Game | null): number {
  const n = Math.round(ECON.chest[kind] * (ECON.chestDiff[w.difficulty] ?? 1) * (1 + forgeGold(w.character)));
  w.character.gold += n;
  if (g) goldStats(g).chests += n;
  return n;
}

/** The shop's prices at a level (the bots' measure and the README) */
export function shopPrices(g: Game, ilvl = 15): Record<string, number> {
  const it = (quality: string): Item => ({ base: 'ring', quality, ilvl }) as unknown as Item;
  return {
    magic: buyPrice(it('magic')),
    rare: buyPrice(it('rare')),
    unique: buyPrice(it('unique')),
    sellMagic: sellPriceOf(it('magic'), 0),
    gambleRing: gamblePrice('ring', ilvl),
    gambleArmor: gamblePrice('breast_plate', ilvl),
    gold: g.character.gold,
  };
}
