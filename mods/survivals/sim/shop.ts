/**
 * The hub's shop of the Run mode (lot 292, a third study of another survivors game, observed for reference only; our rules): a new
 * stock at each run's end, sized to the level the run reached and leaning on the best level ever reached once the endgame is open
 * (`shopLevel`), 6 items of the hero's class (8 once Nightmare's Act I is open), two of them weapons of the kind worn; a gamble stall of
 * Diablo II's rules (an unknown item of a base, revealed when bought: rare 1 in 10, set 1 in 1,000, unique 1 in 2,000, its level the
 * stall's −5 to +4), the base's buy-back (the items sold in the session, at their sale price). Prices: `sim/economy.ts`.
 *
 * The stall is the base's vendor's (rules `shop.vendorStock`, `shop.gambleStock`: the base's refreshes keep the mode's stall, the same
 * array); what was bought from a stock is kept in the character's milestones (`survivals:shop:*`), so a reload does not sell it again.
 */
import { addToCharacter, BASE_BY_ID, BASES, classCanUse, computeDerived, generateItem, Rng, targetSlot, type CharacterState, type Game, type Item, type Quality } from '../../../src/mods/sdk';
import { buyPrice, gamblePrice } from './economy';
import { gearScore } from './loot';
import { actBeaten, BEST_LEVEL, entryLevel, isRunMode, LAST_LEVEL, RUNS_KEY } from './runmode';

export const SHOP = {
  /** Items of a stock, and once Nightmare's Act I is open */
  size: 6,
  sizeEndgame: 8,
  /** Weapons of the kind worn among them */
  weapons: 2,
  /** Rare share of the stock, and more by Act I difficulty beaten (the endgame's bias) */
  rare: 0.25,
  rareTier: 0.1,
  /** Bases at most this many levels under the stall's level (older ones only when none) */
  span: 20,
  /** Gamble stall: unknown items offered */
  gambles: 6,
  /** Once the endgame is open, the stall's level leans on the best level reached: this share of it at least */
  bestShare: 0.85,
};

/** Diablo II's gamble odds (Arreat Summit: about 1 in 2,000 unique, 1 in 1,000 set, 1 in 10 rare; magic otherwise) */
export const GAMBLE_ODDS = { unique: 1 / 2000, set: 1 / 1000, rare: 0.1 };

const KEY = { seed: 'survivals:shop:seed', bought: 'survivals:shop:bought' };

/** Act I difficulties beaten: 0 (none, or Normal only open), 1 (Nightmare open), 2 (Hell open), 3 (Hell beaten): the endgame tier */
export function endgameTier(c: CharacterState): number {
  let t = 0;
  for (const d of [0, 1, 2]) if (actBeaten(c, 1, d)) t = d + 1;
  return t;
}

/**
 * The stall's level: the last run's level; once the endgame is open, at least `SHOP.bestShare` of the best level reached and the entry
 * level of the highest Act I open (Nightmare's 34, Hell's 65: the gear to farm it, a weapon build's first need)
 */
export function shopLevel(c: CharacterState): number {
  const m = c.progression.milestones;
  const last = m[LAST_LEVEL] ?? m[BEST_LEVEL] ?? 1;
  const best = m[BEST_LEVEL] ?? last;
  const tier = endgameTier(c);
  if (tier < 1) return Math.max(1, last);
  return Math.max(1, last, Math.round(best * SHOP.bestShare), entryLevel(1, Math.min(2, tier)));
}

type Base = (typeof BASES)[number];

/** Bases of a slot the hero's class may use, of a level the stall sells (the most recent ones first) */
function basesFor(c: CharacterState, lvl: number, keep: (b: Base) => boolean): Base[] {
  const all = BASES.filter((b) => b.slot && !b.noRandomDrop && b.price > 0 && b.qlvl <= Math.max(1, lvl) && classCanUse(b, c.classId) && keep(b));
  const recent = all.filter((b) => b.qlvl >= lvl - SHOP.span);
  return recent.length ? recent : all;
}

/** Slots of the stock besides the weapons: the armour, the jewels, a shield (or the class's off-hand) beside a one-handed weapon */
function stockSlots(c: CharacterState): string[] {
  const main = c.equipment.mainhand ? BASE_BY_ID[c.equipment.mainhand.base] : undefined;
  const out = ['head', 'body', 'gloves', 'boots', 'belt', 'ring', 'amulet'];
  if (!main?.twoHanded && main?.type !== 'bow' && main?.type !== 'crossbow') out.push('offhand');
  return out;
}

/** The weapons the stock offers: the kind worn, its handedness (the build's skills need theirs); any of the class's without one */
function weaponBases(c: CharacterState, lvl: number): Base[] {
  const main = c.equipment.mainhand ? BASE_BY_ID[c.equipment.mainhand.base] : undefined;
  return basesFor(c, lvl, (b) => b.slot === 'mainhand' && !!b.dmg && (!main || (b.type === main.type && !!b.twoHanded === !!main.twoHanded)));
}

/** A new stock (deterministic: the runs played, the class, the stall's level) */
export function rollStock(c: CharacterState, seed: number): Item[] {
  const lvl = shopLevel(c);
  const tier = endgameTier(c);
  const rng = new Rng(`svshop:${seed}:${c.classId}:${lvl}`);
  const n = tier >= 1 ? SHOP.sizeEndgame : SHOP.size;
  const rare = SHOP.rare + SHOP.rareTier * tier;
  const out: Item[] = [];
  const make = (b: Base | undefined) => {
    if (!b) return;
    const q: Quality = rng.chance(rare) ? 'rare' : 'magic';
    out.push(generateItem(rng, b.id, lvl, { forceQuality: q }));
  };
  const weapons = weaponBases(c, lvl);
  for (let i = 0; i < SHOP.weapons && weapons.length; i++) make(rng.pick(weapons));
  const slots = stockSlots(c);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  for (let i = 0; out.length < n && i < slots.length * 2; i++) {
    const slot = slots[i % slots.length];
    const pool = basesFor(c, lvl, (b) => b.slot === slot);
    if (pool.length) make(rng.pick(pool));
  }
  return out;
}

interface ShopCache {
  seed: number;
  orig: Item[];
  stock: { item: Item; price: number }[];
  gamble: { base: string; price: number }[];
  gambles: number;
}
const CACHE = new WeakMap<CharacterState, ShopCache>();

/**
 * The stock's seed: the runs started and the stall's level (a new stock at each run's end, the same one between two runs and after a
 * reload; one rolled during a run, when the base refreshes its vendor, is replaced at the run's end)
 */
const seedOf = (c: CharacterState): number => (c.progression.milestones[RUNS_KEY] ?? 0) * 1000 + shopLevel(c);

/** Items of the stock bought (bits of `survivals:shop:bought`), noted from the stall's array (bought here or at the base's vendor) */
function syncBought(c: CharacterState, s: ShopCache): void {
  const m = c.progression.milestones;
  let bits = m[KEY.seed] === s.seed ? (m[KEY.bought] ?? 0) : 0;
  s.orig.forEach((it, i) => {
    if (!s.stock.some((e) => e.item === it)) bits |= 1 << i;
  });
  m[KEY.seed] = s.seed;
  m[KEY.bought] = bits;
}

function cacheOf(c: CharacterState): ShopCache {
  const seed = seedOf(c);
  let s = CACHE.get(c);
  if (s && s.seed === seed) {
    syncBought(c, s);
    return s;
  }
  const orig = rollStock(c, seed);
  const m = c.progression.milestones;
  const bits = m[KEY.seed] === seed ? (m[KEY.bought] ?? 0) : 0;
  s = { seed, orig, stock: orig.filter((_, i) => !(bits & (1 << i))).map((item) => ({ item, price: buyPrice(item) })), gamble: [], gambles: 0 };
  s.gamble = rollGamble(c, seed, 0);
  CACHE.set(c, s);
  syncBought(c, s);
  return s;
}

/** The shop's stall (rule `shop.vendorStock` in Run mode): the same array until the next run's end */
export function shopStock(g: Game): { item: Item; price: number }[] {
  return cacheOf(g.character).stock;
}

/** The gamble stall (rule `shop.gambleStock` in Run mode) */
export function gambleStock(g: Game): { base: string; price: number }[] {
  return cacheOf(g.character).gamble;
}

/** Bases offered to gamble: rings, amulets, the armour, a weapon of the kind worn, a shield beside a one-handed weapon (the class's) */
function rollGamble(c: CharacterState, seed: number, k: number, count = SHOP.gambles): { base: string; price: number }[] {
  const lvl = shopLevel(c);
  const rng = new Rng(`svgamble:${seed}:${c.classId}:${lvl}:${k}`);
  const slots = [...stockSlots(c), 'mainhand'];
  const out: { base: string; price: number }[] = [];
  for (let i = 0; out.length < count && i < 40; i++) {
    const slot = rng.pick(slots);
    const pool = slot === 'mainhand' ? weaponBases(c, lvl) : basesFor(c, lvl, (b) => b.slot === slot);
    if (!pool.length) continue;
    const b = rng.pick(pool);
    if (out.some((e) => e.base === b.id) && i < 30) continue;
    out.push({ base: b.id, price: gamblePrice(b.id, lvl) });
  }
  return out;
}

/** Quality and level of a gambled item (rule `shop.gambleRoll` in Run mode): Diablo II's odds, the stall's level −5 to +4 */
export function gambleRoll(c: CharacterState, rng: Rng): { quality: Quality; ilvl: number } {
  const r = rng.float(0, 1);
  const quality: Quality = r < GAMBLE_ODDS.unique ? 'unique' : r < GAMBLE_ODDS.unique + GAMBLE_ODDS.set ? 'set' : r < GAMBLE_ODDS.unique + GAMBLE_ODDS.set + GAMBLE_ODDS.rare ? 'rare' : 'magic';
  return { quality, ilvl: Math.max(1, shopLevel(c) - 5 + rng.int(10)) };
}

/** What an item would add to the hero's gear (`gearScore`), in its best slot; null when it is not equipment */
export function gainOf(g: Game, item: Item): number | null {
  const c = g.character;
  const b = BASE_BY_ID[item.base];
  if (!b?.slot) return null;
  const before = gearScore(computeDerived(c, 0));
  const main = c.equipment.mainhand ? BASE_BY_ID[c.equipment.mainhand.base] : undefined;
  const slots = b.slot === 'ring' ? ['ring1', 'ring2'] : [targetSlot(c, item) ?? b.slot];
  let best: number | null = null;
  for (const slot of slots) {
    if (slot === 'offhand' && main?.twoHanded) continue;
    const eq: Record<string, Item | undefined> = { ...c.equipment, [slot]: item };
    if (b.twoHanded) delete eq.offhand;
    const after = gearScore(computeDerived({ ...c, equipment: eq as CharacterState['equipment'] }, 0));
    if (best === null || after - before > best) best = after - before;
  }
  return best === null ? null : Math.round(best);
}

/** The best slot to wear an item in (a ring: the one it gains the most in) */
export function bestSlotOf(g: Game, item: Item): string | null {
  const c = g.character;
  const b = BASE_BY_ID[item.base];
  if (!b?.slot) return null;
  if (b.slot !== 'ring') return targetSlot(c, item) ?? b.slot;
  const score = (slot: string) => gearScore(computeDerived({ ...c, equipment: { ...c.equipment, [slot]: item } }, 0));
  return !c.equipment.ring1 ? 'ring1' : !c.equipment.ring2 ? 'ring2' : score('ring1') >= score('ring2') ? 'ring1' : 'ring2';
}

/** The stock's best buy: the largest gain the purse can pay, else the largest gain (null: nothing gains) */
export function bestBuy(g: Game): { idx: number; gain: number; price: number; affordable: boolean } | null {
  const stock = shopStock(g);
  let best: { idx: number; gain: number; price: number; affordable: boolean } | null = null;
  stock.forEach((e, idx) => {
    const gain = gainOf(g, e.item) ?? 0;
    if (gain <= 0) return;
    const affordable = e.price <= g.character.gold;
    if (!best || (affordable && !best.affordable) || (affordable === best.affordable && gain > best.gain)) best = { idx, gain, price: e.price, affordable };
  });
  return best;
}

/** Buys item `idx` of the stock; worn at once when it gains (the worn one to the bag). Returns what was done */
export function buyShop(g: Game, idx: number): { ok: boolean; reason?: string; equipped?: boolean } {
  const c = g.character;
  const s = cacheOf(c);
  const e = s.stock[idx];
  if (!e) return { ok: false };
  if (c.gold < e.price) return { ok: false, reason: 'Pas assez d’or' };
  if (!addToCharacter(c, e.item)) return { ok: false, reason: 'Inventaire plein' };
  c.gold -= e.price;
  s.stock.splice(idx, 1);
  syncBought(c, s);
  const equipped = (gainOf(g, e.item) ?? 0) > 0 && equipFromBag(g, c.inventory.indexOf(e.item));
  g.world.refreshPlayer();
  return { ok: true, equipped };
}

/** Wears the bag's item `idx` in its best slot (no requirement in the mode); the worn one goes to the bag */
export function equipFromBag(g: Game, idx: number): boolean {
  const it = g.character.inventory[idx];
  if (!it) return false;
  const slot = bestSlotOf(g, it);
  return !!slot && g.equip(idx, slot as never).ok;
}

/** Gambles item `i` of the stall (the base's `Game.gamble`, Diablo II's odds by rule); another base takes its place */
export function gambleShop(g: Game, i: number): { ok: boolean; item?: Item; reason?: string } {
  const s = cacheOf(g.character);
  const r = g.gamble(i);
  if (r.ok) {
    s.gambles++;
    const [next] = rollGamble(g.character, s.seed, s.gambles, 1);
    if (next) s.gamble.splice(i, 0, next);
    g.world.refreshPlayer();
  }
  return r;
}

/** Rules of the shop (index.ts): the mode's stalls and gamble odds in Run mode, the base's otherwise */
export const shopRules = {
  vendorStock: (g: Game, stock: { item: Item; price: number }[]) => (isRunMode(g.character) ? shopStock(g) : stock),
  gambleStock: (g: Game, stock: { base: string; price: number }[]) => (isRunMode(g.character) ? gambleStock(g) : stock),
};
