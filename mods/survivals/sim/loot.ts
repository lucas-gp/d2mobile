/**
 * Loot of the Survivals mode: Diablo II's tables (lot 283, S8) made fit for a survival game (lot 285, owner's test on his phone: "few loot,
 * never an inventory to sort during a run"):
 * - the first kill of an act boss in a difficulty drops its quest treasure class (`Andarielq` …, data/loot.ts) in place of its regular one,
 *   as Diablo II's quest kill; the super-uniques drop their own treasure class (`Act n Super x`, `Council`…) instead of a unique's;
 * - fewer and better drops (`thinDrops`): no potion, key nor tome (the mode has none: a kill gives back a little life and mana instead), no
 *   plain equipment (white, grey: about 9 drops in 10), the gold piles a third of Diablo II's (gold buys from the vendor between rounds);
 * - picked up by walking over it (`LOOT.reach`), the gold anywhere in the arena after a second: an item of the hero's class that fits an
 *   empty slot, or is clearly better than the one worn (lot 290, `autoSlotFor`), is equipped at once (no requirement in the mode), runes, gems, charms, jewels, uniques, sets and rares go to the
 *   bag (to the gold when it is full), the rest (magic items) is turned into gold at the vendor's price;
 * - the kill of a boss or a named elite tells what it dropped (one line, colored by the best item).
 */
import type { ModApi } from '../../../src/mods/api';
import {
  addToCharacter,
  BASE_BY_ID,
  BASES,
  TICK_HZ,
  canWear,
  generateItem,
  classCanUse,
  computeDerived,
  itemName,
  NO_BONUS,
  rollTc,
  targetSlot,
  type DerivedStats,
  type Game,
  type Item,
  type Monster,
  type World,
} from '../../../src/mods/sdk';
import { survivalsTcs } from '../data/loot';
import { roundOfRun } from '../data/chapters';
import { FLOW, inFlow, isRunMode, noteFound, RUN, runActive } from './runmode';
import { keepInRun, worthKeeping } from './runloot';
import { junkGold, runGold } from './economy';
import { forgeLuck, forgeReach } from './forge';

/** A monster's treasure class in place of the base's (set by the director: act boss's first kill, super-unique) */
export type LootMarked = Monster & { svTc?: string };

/** Loot rules of the mode (lot 285) */
export const LOOT = {
  /** Gold of a pile, against Diablo II's */
  gold: 1 / 3,
  /** Items picked up within this distance of the character (units): walking over them */
  reach: 1.5,
  /** Ticks a gold pile stays on the ground before it is picked up, wherever it is in the arena */
  goldAfter: 25,
  /** Life and mana given back by a kill, share of the maximum (the mode has no potion) */
  heal: 0.01,
};

/** Consumables the mode never drops nor sells: potions, throwing potions, keys, the portal tome */
export function noConsumable(baseId: string): boolean {
  const b = BASE_BY_ID[baseId];
  if (!b) return false;
  return b.type === 'potion' || b.type === 'tpot' || b.id === 'key' || b.id === 'tome_portal';
}

const GOOD_QUALITIES = new Set(['magic', 'rare', 'set', 'unique', 'crafted']);
/** Kept in the bag when picked up (else turned into gold): runes, gems, charms, jewels, and rare or better */
const KEEP_TYPES = new Set(['rune', 'gem', 'smallcharm', 'largecharm', 'grandcharm', 'jewel']);
const KEEP_QUALITIES = new Set(['rare', 'set', 'unique', 'crafted']);
/** Charms and jewels: kept apart with a run's loot (they would fill the bag) */
const CHARMS = new Set(['smallcharm', 'largecharm', 'grandcharm', 'jewel']);

/** Is a drop kept by the mode (gold, runes, gems, magic and better; no consumable, no plain equipment)? */
export function dropKept(item: Item): boolean {
  const b = BASE_BY_ID[item.base];
  if (!b) return true;
  if (noConsumable(b.id)) return false;
  if (b.id === 'gold' || b.type === 'rune' || b.type === 'gem' || b.type === 'currency') return true;
  return GOOD_QUALITIES.has(item.quality);
}

/**
 * A round's monster drops thinned: consumables and plain equipment out, a third of the gold. Measured (tools/loot.ts, 5 min of the Stony
 * Field at level 12): 57 items and 1,068 gold in Diablo II's drops (16 potions, 4 throwing potions, 33 white or grey items), 3 items (a
 * gem, a magic and a rare wand) and 277 gold with the mode's; the equipment vendor's stall costs 92 to 680 gold at that level
 */
export function thinDrops(items: Item[], goldShare = 1, w?: World): void {
  const kept = items.filter((it) => {
    if (!dropKept(it)) return false;
    // lot 292: in a run, a zone's gold counted fully up to a cap (economy.ts `runGold`)
    if (BASE_BY_ID[it.base]?.id === 'gold') {
      it.qty = runGold(w, Math.max(1, Math.round((it.qty ?? 1) * LOOT.gold * goldShare)));
      return it.qty > 0;
    }
    return true;
  });
  items.length = 0;
  items.push(...kept);
}

export function registerLoot(api: ModApi): void {
  for (const t of survivalsTcs((id) => api.treasureClasses.has(id))) api.treasureClasses.add(t);
  // over the content ruleset's own rule (pd2 replaces it too: its drops stay those of the monsters the mode does not mark)
  api.rules.set(
    'loot.monsterDrops',
    (prev) => (w, m, items) => {
      prev(w, m, items);
      if (!w.run?.runId.startsWith('survivals:')) return;
      const tc = (m as LootMarked).svTc;
      if (tc) {
        // the treasure class of the monster in place of the base's (the run adds nothing to a round's monsters: no extra drop is lost)
        items.length = 0;
        items.push(...rollTc({ rng: w.rng.loot, ilvl: m.mlvl, mf: w.player.d.mf, difficulty: w.difficulty, zoneKey: w.run.zoneKey, mapTier: 0, bonus: NO_BONUS, gf: w.player.d.gf, quantity: 1 }, tc));
      }
      // Run mode (lot 289): less gold again (a run's gold buys a few items at the hub's vendor, not its stall)
      thinDrops(items, isRunMode(w.character) ? RUN.gold : 1, w);
      // Act I's flow (lot 294): fewer drops from the fodder, a better one now and then
      if (inFlow(w)) flowDrops(w, m, items);
    },
    { override: true },
  );
}

/**
 * Act I's flow's drops (lot 294, owner: "too much loot"; lot 300, owner again: "far too many items on the ground; a few here and there on
 * the ordinary monsters, the loot guaranteed on the bosses and mini-bosses, as a survival game where the loot falls from the bosses";
 * the other game drops 2 to 5 items a minute in Act I, or fewer). Whatever the content's tables (pd2's fodder dropped 14 to 21 items a
 * minute, 40 to 57 runes an act, lot 299's code) and the build's kills a second:
 * - the fodder (normal monsters, minions) keeps its items within a budget of the act's time (`fodderRate` a minute, at most `fodderBank`
 *   waiting; a zone starts with `fodderStart`), its runes and gems within their own (`stoneRate`);
 * - a champion or a unique keeps one item at most, `eliteKeep` of the time;
 * - a zone's mini-boss and the act's boss (`runBoss`) drop at least `bossItems` items, the first rare at least (a set or a unique
 *   `bossBetter` of the time), and a rune `bossRune` of the time (El to Ith for a mini-boss, Tir to Tal for Andariel: `bossRuneRank`);
 * - a magic item kept is made rare `rareShare` of the time (the same base and item level, Diablo II's rare affixes);
 * - the gold of the fodder is pooled (`goldPile`: a pile only once that much has gathered, the same gold in fewer, larger piles); an elite
 *   or a boss drops the pool with its own. Measured with tools/drops.ts (README "Loot from the bosses")
 */
export const FLOW_LOOT = {
  fodderRate: 0.9,
  fodderBank: 2,
  fodderStart: 0.5,
  stoneRate: 0.12,
  eliteKeep: 0.5,
  rareShare: 0.35,
  bossItems: { miniboss: 2, boss: 4 } as Record<string, number>,
  bossBetter: { miniboss: 0.1, boss: 0.25 } as Record<string, number>,
  bossRune: { miniboss: 0.5, boss: 1 } as Record<string, number>,
  bossRuneRank: { miniboss: [1, 6], boss: [3, 7] } as Record<string, readonly [number, number]>,
  goldPile: 10,
  /** Gold piles closer than this on the ground make one (units) */
  goldMerge: 2.5,
};

/** The fodder's budgets of a zone (a world is a zone): items and stones in hand, at tick `at` */
const BUDGET = new WeakMap<object, { at: number; items: number; stones: number }>();
/** The fodder's gold pooled, by character (carried from zone to zone) */
const GOLD_POOL = new WeakMap<object, { gold: number }>();

function budgetOf(w: World): { at: number; items: number; stones: number } {
  let b = BUDGET.get(w);
  if (!b) BUDGET.set(w, (b = { at: w.tick, items: FLOW_LOOT.fodderStart, stones: 0 }));
  const min = (w.tick - b.at) / TICK_HZ / 60;
  b.at = w.tick;
  b.items = Math.min(FLOW_LOOT.fodderBank, b.items + min * FLOW_LOOT.fodderRate);
  b.stones = Math.min(1, b.stones + min * FLOW_LOOT.stoneRate);
  return b;
}

/** The gold pooled from the fodder of a character's run, not dropped yet */
export function goldPool(c: object): { gold: number } {
  let p = GOLD_POOL.get(c);
  if (!p) GOLD_POOL.set(c, (p = { gold: 0 }));
  return p;
}

/** An equipment item of a boss's chest (`bossItems`): a base of the hero's class half of the time, at the boss's level */
function bossItem(w: World, m: Monster, quality: 'rare' | 'set' | 'unique'): Item | null {
  return chestItem(w, m.mlvl, quality);
}

/**
 * An equipment item of a chest at item level `ilvl` (a boss's, lot 300; a point of interest's, lot 307: sim/poi.ts): a base of the hero's
 * class half of the time
 */
export function chestItem(w: World, level: number, quality: 'magic' | 'rare' | 'set' | 'unique'): Item | null {
  const rng = w.rng.loot;
  const ilvl = Math.max(1, Math.round(level));
  const pool = BASES.filter((b) => b.slot && !b.noRandomDrop && b.price > 0 && b.qlvl <= ilvl && b.type !== 'potion');
  if (!pool.length) return null;
  const own = pool.filter((b) => classCanUse(b, w.character.classId));
  const base = rng.pick(own.length && rng.chance(0.5) ? own : pool);
  const it = generateItem(rng, base.id, ilvl, { forceQuality: quality });
  // a set or unique the base cannot make (none of that base): a rare
  return it.quality === quality || quality === 'rare' || quality === 'magic' ? it : generateItem(rng, base.id, ilvl, { forceQuality: 'rare' });
}

export function flowDrops(w: World, m: Monster, items: Item[]): void {
  const boss = !!m.runBoss || m.rank === 'boss';
  const fodder = !boss && (m.rank === 'normal' || m.rank === 'minion');
  const kind = boss ? (roundOfRun(w.run?.runId)?.boss ? 'boss' : 'miniboss') : '';
  const rng = w.rng.loot;
  const budget = fodder ? budgetOf(w) : null;
  const pool = goldPool(w.character);
  const out: Item[] = [];
  let pile: Item | null = null;
  let eliteKept = false;
  for (const it of items) {
    const b = BASE_BY_ID[it.base];
    if (b?.id === 'gold') {
      // the fodder's gold pooled; an elite's, a boss's pile carries the pool
      pool.gold += it.qty ?? 0;
      if (!pile) pile = it;
      continue;
    }
    const stone = b?.type === 'rune' || b?.type === 'gem';
    if (budget) {
      const k = stone ? 'stones' : 'items';
      if (budget[k] < 1) continue;
      budget[k] -= 1;
    } else if (!boss) {
      if (eliteKept || !rng.chance(FLOW_LOOT.eliteKeep)) continue;
      eliteKept = true;
    }
    if (it.quality === 'magic' && b && !b.stack && rng.chance(FLOW_LOOT.rareShare)) {
      out.push(generateItem(rng, it.base, it.ilvl, { forceQuality: 'rare' }));
      continue;
    }
    out.push(it);
  }
  if (boss) {
    // the boss's chest: `bossItems` items at least, the first one rare or better
    const gear = (x: Item) => !!BASE_BY_ID[x.base]?.slot;
    const good = (x: Item) => gear(x) && (x.quality === 'rare' || x.quality === 'set' || x.quality === 'unique' || x.quality === 'crafted');
    if (!out.some(good)) {
      // lot 308: the training's boss fortune (sim/forge.ts) adds its chance of a set or unique
      const better = rng.chance((FLOW_LOOT.bossBetter[kind] ?? 0) + forgeLuck(w.character));
      const it = bossItem(w, m, better ? (rng.chance(0.5) ? 'set' : 'unique') : 'rare');
      if (it) out.push(it);
    }
    for (let n = out.filter(gear).length; n < (FLOW_LOOT.bossItems[kind] ?? 1); n++) {
      const it = bossItem(w, m, 'rare');
      if (it) out.push(it);
    }
    if (!out.some((x) => BASE_BY_ID[x.base]?.type === 'rune') && rng.chance(FLOW_LOOT.bossRune[kind] ?? 0)) {
      const [lo, hi] = FLOW_LOOT.bossRuneRank[kind] ?? [1, 3];
      const id = `r${String(lo + rng.int(hi - lo + 1)).padStart(2, '0')}`;
      if (BASE_BY_ID[id]) out.push(generateItem(rng, id, Math.max(1, m.mlvl)));
    }
  }
  // the gold: one pile once the pool holds `goldPile`, or with an elite or a boss
  if (pile && (pool.gold >= FLOW_LOOT.goldPile || !fodder)) {
    pile.qty = Math.round(pool.gold);
    pool.gold = 0;
    if (pile.qty > 0) out.unshift(pile);
  }
  items.length = 0;
  items.push(...out);
}

/** Gold piles lying close together made one (lot 300, owner: "the gold fills the screen"), every few steps of Act I's flow */
export function mergeGold(w: World): void {
  const golds = w.items.filter((gi) => BASE_BY_ID[gi.item.base]?.id === 'gold');
  if (golds.length < 2) return;
  const gone = new Set<object>();
  for (let i = 0; i < golds.length; i++) {
    const a = golds[i];
    if (gone.has(a)) continue;
    for (let j = i + 1; j < golds.length; j++) {
      const b = golds[j];
      if (gone.has(b) || Math.hypot(a.x - b.x, a.y - b.y) > FLOW_LOOT.goldMerge) continue;
      a.item.qty = (a.item.qty ?? 0) + (b.item.qty ?? 0);
      gone.add(b);
    }
  }
  if (gone.size) w.items = w.items.filter((gi) => !gone.has(gi));
}

const QUALITY_RANK: Record<string, number> = { unique: 5, set: 4, rare: 3, crafted: 3, magic: 2 };
export const QUALITY_COLOR: Record<string, string> = { unique: '#c8a060', set: '#30c030', rare: '#e8e060', crafted: '#e08030', magic: '#7080ff' };
const QUALITY_NAME: Record<string, string> = { unique: 'Unique', set: 'Ensemble', rare: 'Rare', crafted: 'Artisanal', magic: 'Magique' };

/** What a boss or a named elite just dropped (the items of this step around its body, gold aside). Returns the line told, or null */
export function dropReport(w: World, m: Monster, named: boolean): string | null {
  // a line for a boss or a named elite only (lot 285: a clean screen, no line for each champion or unique)
  if (!named && m.rank !== 'boss') return null;
  const items = w.items.filter((gi) => gi.dropTick === w.tick && Math.hypot(gi.x - m.x, gi.y - m.y) < 4 && BASE_BY_ID[gi.item.base]?.id !== 'gold');
  let best = '';
  for (const gi of items) {
    const q = gi.item.quality;
    if (QUALITY_RANK[q] && (!best || QUALITY_RANK[q] > QUALITY_RANK[best])) best = q;
  }
  if (!items.length) return null;
  const text = best ? `Butin de ${m.name} : ${items.length} objet(s) — meilleur : ${QUALITY_NAME[best]}` : `Butin de ${m.name} : ${items.length} objet(s)`;
  w.events.push({ t: 'message', text, color: best ? QUALITY_COLOR[best] : '#d8cbb0' });
  return text;
}

/** What the pickup did with the items of a game session (the end-of-round screen tells the round's; tools/loot.ts measures them) */
export interface PickupStats {
  equipped: number;
  kept: number;
  sold: number;
  /** Gold from the items turned into gold */
  soldGold: number;
  /** Gold picked up from the piles */
  gold: number;
}

const STATS = new WeakMap<object, PickupStats>();

export function pickupStats(g: Game): PickupStats {
  let s = STATS.get(g.character);
  if (!s) STATS.set(g.character, (s = { equipped: 0, kept: 0, sold: 0, soldGold: 0, gold: 0 }));
  return s;
}

/** What a hero gets from his gear, one simple number (auto-equipment of the loot walked over, lot 290: "clearly better") */
export function gearScore(d: DerivedStats): number {
  const res = d.res.fire + d.res.cold + d.res.light + d.res.poison;
  const dmg = (d.weaponDmg[0] + d.weaponDmg[1]) / 2 + (d.offDmg ? (d.offDmg[0] + d.offDmg[1]) / 4 : 0);
  let skills = 0;
  for (const k of Object.keys(d.skillLevels)) skills = Math.max(skills, (d.skillLevels[k] ?? 0) - (d.hardPoints[k] ?? 0));
  const elem = d.elemDmgPct.fire + d.elemDmgPct.cold + d.elemDmgPct.light;
  return d.lifeMax + d.manaMax * 0.5 + d.defense * 0.1 + res + dmg * 3 + skills * 30 + elem * 0.5 + d.fcr + d.ias + d.frw * 0.5 + d.fhr * 0.5 + d.mf * 0.1;
}

/** Share of the score a worn item is replaced for (and `AUTO_EQUIP.gain` points at least): clearly better, never a downgrade */
export const AUTO_EQUIP = { share: 0.05, gain: 8 };

/**
 * The slot an item walked over goes on at once (lot 285: an empty slot; lot 290: also in place of a worn item it is clearly better than,
 * `AUTO_EQUIP`, by `gearScore`): the hero's class's items only, no requirement (Survivals wears any gear: rules `char.equipNeedsReqs`,
 * `char.equipNeedsClass`), nothing freed (no two-handed weapon over a shield, no shield under one), never another kind of weapon in place
 * of the worn one (a bow for a javelin, a sword for a claw: the build's skills need theirs). Null: not put on
 */
export function autoSlotFor(g: Game, item: Item): string | null {
  const c = g.character;
  const b = BASE_BY_ID[item.base];
  if (!b?.slot || !classCanUse(b, c.classId)) return null;
  const d = computeDerived(c, 0);
  if (!canWear(c, item, { str: d.str, dex: d.dex }).ok) return null;
  const first = targetSlot(c, item);
  if (!first) return null;
  const main = c.equipment.mainhand ? BASE_BY_ID[c.equipment.mainhand.base] : undefined;
  const slots = b.slot === 'ring' ? ['ring1', 'ring2'] : [first];
  let best: string | null = null;
  let bestScore = 0;
  const before = gearScore(d);
  for (const slot of slots) {
    const worn = c.equipment[slot as keyof typeof c.equipment];
    if (!worn) {
      if (slot === 'offhand' && (main?.twoHanded || (b.dmg && !c.equipment.mainhand))) continue;
      if (slot === 'mainhand' && b.twoHanded && c.equipment.offhand) continue;
      return slot;
    }
    const wb = BASE_BY_ID[worn.base];
    if (!wb || ((slot === 'mainhand' || slot === 'offhand') && (wb.type !== b.type || !!wb.twoHanded !== !!b.twoHanded))) continue;
    const after = gearScore(computeDerived({ ...c, equipment: { ...c.equipment, [slot]: item } }, 0));
    if (after - before >= Math.max(AUTO_EQUIP.gain, before * AUTO_EQUIP.share) && after > bestScore) [best, bestScore] = [slot, after];
  }
  return best;
}

/**
 * Takes an item: worn at once in an empty slot it fits, else kept (runes, gems, charms, jewels, rare and better; gold when the bag is
 * full), else turned into gold at the vendor's price. Returns what was done
 */
export function takeItem(g: Game, item: Item): 'gold' | 'equipped' | 'kept' | 'sold' {
  const c = g.character;
  const b = BASE_BY_ID[item.base];
  const s = pickupStats(g);
  if (b?.id === 'gold') {
    // Run mode (lot 292): the pile's gold was capped as it dropped (`thinDrops`, economy.ts)
    const n = item.qty ?? 1;
    c.gold += n;
    s.gold += n;
    return 'gold';
  }
  const slot = autoSlotFor(g, item);
  if (slot && addToCharacter(c, item)) {
    const idx = c.inventory.indexOf(item);
    if (idx >= 0 && g.equip(idx, slot as never).ok) {
      s.equipped++;
      noteFound(g, itemName(item));
      return 'equipped';
    }
    if (idx >= 0) {
      s.kept++;
      noteFound(g, itemName(item));
      return 'kept';
    }
  }
  // Run mode (lot 293, the owner's note): the run's loot kept apart without limit (the class's magic equipment too, no longer turned into
  // gold; charms and jewels), moved to the bag at the run's end (runloot.ts)
  if (b && g.mode === 'run' && runActive(c) && (worthKeeping(c, item) || ((KEEP_QUALITIES.has(item.quality) || CHARMS.has(b.type)) && !!b.slot) || CHARMS.has(b.type))) {
    keepInRun(c, item);
    s.kept++;
    noteFound(g, itemName(item));
    return 'kept';
  }
  if (b && (KEEP_TYPES.has(b.type) || KEEP_QUALITIES.has(item.quality) || b.type === 'currency') && addToCharacter(c, item)) {
    s.kept++;
    noteFound(g, itemName(item));
    return 'kept';
  }
  // Run mode (lot 289): an item turned into gold gives a share of the vendor's price (lot 292: the shop's, and the zone's cap)
  const price = runGold(g.mode === 'run' ? g.world : null, junkGold(g, item));
  c.gold += price;
  s.sold++;
  s.soldGold += price;
  return 'sold';
}

/**
 * During a round, every 5 ticks: the items within `LOOT.reach` of the character (walked over), and the gold anywhere after a second on the
 * ground (design §6: no stop to pick up in a survival game). The items the base's loot filter hides are left on the ground.
 */
export function pickup(g: Game, w: World): void {
  if (w.tick % 5 !== 0 || !w.items.length) return;
  const p = w.player;
  // Act I's flow (lot 291): walked over only, gold too (the act boss's fall takes everything: runStep)
  const flow = inFlow(w);
  // lot 308: the training's pickup reach (sim/forge.ts, a Run's)
  const reach = (flow ? FLOW.reach : LOOT.reach) * forgeReach(g.character);
  if (flow) mergeGold(w);
  for (let i = w.items.length - 1; i >= 0; i--) {
    const gi = w.items[i];
    const b = BASE_BY_ID[gi.item.base];
    if (!b) continue;
    const age = w.tick - gi.dropTick;
    const far = Math.hypot(gi.x - p.x, gi.y - p.y) > reach;
    if (b.id === 'gold' && !flow ? age < LOOT.goldAfter : age < 8 || far) continue;
    if (b.id !== 'gold' && gi.show <= 0) continue;
    w.items.splice(i, 1);
    const before = g.character.gold;
    const done = takeItem(g, gi.item);
    if (done === 'gold' || done === 'sold') w.events.push({ t: 'goldPickup', amount: Math.max(0, g.character.gold - before) });
    else
      w.events.push({
        t: 'pickup',
        uid: gi.item.uid,
        name: done === 'equipped' ? `${itemName(gi.item)} (équipé)` : itemName(gi.item),
        kind: b.type === 'rune' ? 'rune' : 'item',
      });
  }
}

/** Everything still on the arena's ground taken at the end of a round (no list to sort): what was done, counted */
export function collectAll(g: Game): { equipped: string[]; kept: string[]; gold: number } {
  const out = { equipped: [] as string[], kept: [] as string[], gold: 0 };
  const w = g.world;
  for (let i = w.items.length - 1; i >= 0; i--) {
    const gi = w.items[i];
    if (gi.show <= 0 && BASE_BY_ID[gi.item.base]?.id !== 'gold') continue;
    w.items.splice(i, 1);
    const before = g.character.gold;
    const done = takeItem(g, gi.item);
    if (done === 'equipped') out.equipped.push(itemName(gi.item));
    else if (done === 'kept') out.kept.push(itemName(gi.item));
    else out.gold += g.character.gold - before;
  }
  return out;
}

/** A kill gives back `LOOT.heal` of the character's life and mana (the mode has no potion) */
export function killHeal(w: World, share = LOOT.heal): void {
  const p = w.player;
  if (p.dead) return;
  p.hp = Math.min(p.hpMax, p.hp + p.hpMax * share);
  p.mana = Math.min(p.manaMax, p.mana + p.manaMax * share);
}

/**
 * The mode has no potion nor key (lot 285): the belt and the throwing potions emptied (every step: characters from before the lot, the
 * base's starting belt), the keys and the portal tome of a new character taken out
 */
export function stripConsumables(c: Game['character'], created = false): void {
  for (const s of c.belt) if (s.qty) s.qty = 0;
  if (c.throwPots) for (const k of Object.keys(c.throwPots)) if (c.throwPots[k]) c.throwPots[k] = 0;
  if (!created) return;
  for (const id of ['key', 'tome_portal']) delete c.materials[id];
  c.inventory = c.inventory.map((it) => (it && noConsumable(it.base) ? null : it));
}
