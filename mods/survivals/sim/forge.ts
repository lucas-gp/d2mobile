/**
 * Lot 308: permanent training of the Run mode (owner: "the gold for permanent upgrades: more skill rerolls, better experience, etc."; the
 * idea of a hub's paid ranks after two other survivors games, adapted, nothing copied). Ranks bought with the character's gold in the
 * hub (the Skills tab's "Entraînement" panel, ui/hub6.ts), kept between runs, every effect small so that the gear stays the run's
 * progress (the difficulty's slope of tools/tiers.ts measured with every rank bought: README "Training").
 *
 * - **Kept** in the character's milestones (`survivals:forge:<id>` = the rank; absent = 0): the save format (v7) does not change, a save
 *   from before the lot reads every rank at 0. The gold is the character's (as the shop's), so are its ranks.
 * - **Reset** at no cost: every rank back to 0 and the gold they cost given back in full (the current prices).
 * - **Run only**: the Campaign's rounds ignore them (`isRunMode`).
 * - Per-run counters (the extra rerolls and banishes used) are run milestones `survivals:run:forge:*`, cleared with the run.
 */
import type { CharacterState, Game } from '../../../src/mods/sdk';
import { isRunMode } from './runmode';

export type ForgeId = 'reroll' | 'banish' | 'hand' | 'xp' | 'reach' | 'luck' | 'gold' | 'life';

export interface ForgeDef {
  id: ForgeId;
  /** Name (French source text, translated by i18n/en.json) */
  name: string;
  /** Prices of each rank (gold), the first rank first: its length is the ranks' count */
  costs: readonly number[];
  /** The effect at a rank (0: none), as told on the panel */
  effect: (rank: number) => string;
  /** The row's picture: an item base's inventory image (the game's own art, `itemIconOf`) */
  icon: string;
}

const pct = (n: number) => `+${Math.round(n)} %`;

/**
 * The ranks, their prices and effects. Prices (lot 308, `SV_SHOP=1 SV_FORGE=1 tools/campaign.ts --run`: a run of the first ten brings
 * about 100 to 150 gold, a won one 400 to 500, 9,300 to 17,500 gold in 40 runs): the cheapest ranks about one early run each, the dearest
 * several won runs, every rank bought around the 30th-40th run with the shop's buys beside (README "Training")
 */
export const FORGE: readonly ForgeDef[] = [
  { id: 'reroll', name: 'Relances', costs: [80, 680, 1530], effect: (r) => (r ? `+${r} gratuite${r > 1 ? 's' : ''} par run` : 'Aucune'), icon: 'tome_portal' },
  { id: 'banish', name: 'Bannissements', costs: [60, 510, 1190], effect: (r) => (r ? `+${r} par run` : 'Aucun'), icon: 'key' },
  { id: 'hand', name: 'Main d’ouverture', costs: [900], effect: (r) => (r ? '4 cartes au 1er choix' : '3 cartes'), icon: 'small_charm' },
  { id: 'xp', name: 'Savoir', costs: [50, 260, 510, 850, 1280], effect: (r) => (r ? `${pct(100 * FORGE_FX.xp * r)} d’expérience` : 'Aucun bonus'), icon: 'amulet' },
  { id: 'reach', name: 'Ramassage', costs: [50, 340, 760], effect: (r) => (r ? `${pct(20 * r)} de portée` : 'Aucun bonus'), icon: 'boots' },
  { id: 'luck', name: 'Fortune des boss', costs: [150, 850, 1700], effect: (r) => (r ? `${pct(4 * r)} d’objet d’ensemble ou unique` : 'Aucun bonus'), icon: 'grand_charm' },
  { id: 'gold', name: 'Avarice', costs: [40, 200, 420, 710, 1100], effect: (r) => (r ? `${pct(5 * r)} d’or` : 'Aucun bonus'), icon: 'gold' },
  { id: 'life', name: 'Vigueur', costs: [60, 340, 680, 1100, 1620], effect: (r) => (r ? `${pct(100 * FORGE_FX.life * r)} de vie` : 'Aucun bonus'), icon: 'rejuv_potion' },
];
export const FORGE_BY_ID = Object.fromEntries(FORGE.map((f) => [f.id, f])) as Record<ForgeId, ForgeDef>;

/** Effects by rank (the panel's text above and the rules below read these) */
export const FORGE_FX = {
  /**
   * Life: share a rank (the character's `lifePct` bonus, set at each run's start). Lot 313: 4 → 1 % (every rank bought was worth about
   * half a gear tier early, tools/tiers.ts `SV_FORGE=max`: +24 % of survival with no gear, +14 % at tier 1; the life alone the most of
   * it, a few hit points more carrying a hero over the Cold Plains' end: +10 % of life, +15 % of survival with no gear; README "Lot 313")
   */
  life: 0.01,
  /** Experience of a kill: share a rank (lot 313: 5 → 3 %) */
  xp: 0.03,
  /** Gold of a run (piles, items turned into gold, chests): share a rank */
  gold: 0.05,
  /** Pickup reach: share a rank */
  reach: 0.2,
  /** A boss's or mini-boss's chest: chance a rank more of a set or unique (over `FLOW_LOOT.bossBetter`) */
  luck: 0.04,
};

const KEY = (id: ForgeId): string => `survivals:forge:${id}`;
const RUN_KEY = (k: 'reroll' | 'banish'): string => `survivals:run:forge:${k}`;

/** The rank of an upgrade (0 when never bought; a save from before lot 308 reads 0), within its ranks */
export function forgeRank(c: CharacterState, id: ForgeId): number {
  const def = FORGE_BY_ID[id];
  const r = c.progression.milestones[KEY(id)];
  return typeof r === 'number' && r > 0 ? Math.min(def.costs.length, Math.floor(r)) : 0;
}

/** The rank in effect: a Run character's (the Campaign ignores the training) */
export function forgeOn(c: CharacterState | null | undefined, id: ForgeId): number {
  return c?.progression && isRunMode(c) ? forgeRank(c, id) : 0;
}

/** Price of the next rank (null: every rank bought) */
export function nextCost(c: CharacterState, id: ForgeId): number | null {
  return FORGE_BY_ID[id].costs[forgeRank(c, id)] ?? null;
}

/** Gold the ranks bought cost (what a reset gives back) */
export function forgeSpent(c: CharacterState): number {
  let n = 0;
  for (const f of FORGE) n += f.costs.slice(0, forgeRank(c, f.id)).reduce((a, b) => a + b, 0);
  return n;
}

/** Gold every rank costs together */
export const FORGE_TOTAL = FORGE.reduce((a, f) => a + f.costs.reduce((x, y) => x + y, 0), 0);

/** Why the next rank cannot be bought now (null: it can) */
export function buyBlock(c: CharacterState, id: ForgeId): string | null {
  if (!isRunMode(c)) return 'Le mode Run seulement';
  const cost = nextCost(c, id);
  if (cost === null) return 'Rang maximal';
  if (c.gold < cost) return `Il manque ${cost - c.gold} or`;
  return null;
}

/** Buys the next rank (its gold taken); false if it cannot be bought */
export function buyRank(c: CharacterState, id: ForgeId): boolean {
  if (buyBlock(c, id)) return false;
  const cost = nextCost(c, id)!;
  c.gold -= cost;
  c.progression.milestones[KEY(id)] = forgeRank(c, id) + 1;
  return true;
}

/** Every rank back to 0, their gold given back in full; returns the gold given back */
export function resetForge(c: CharacterState): number {
  const back = forgeSpent(c);
  for (const f of FORGE) delete c.progression.milestones[KEY(f.id)];
  c.gold += back;
  return back;
}

/** At a run's start (after the hero's reset, sim/runmode.ts `startRunMode`): the life's rank as the character's bonus for the run */
export function applyForgeAtStart(c: CharacterState): void {
  const r = forgeOn(c, 'life');
  if (r > 0) c.bonuses.lifePct = (c.bonuses.lifePct ?? 0) + Math.round(FORGE_FX.life * 100 * r);
}

/** Extra rerolls or banishes of the run left (the training's ranks, less those used in this run) */
export function forgeLeft(c: CharacterState, k: 'reroll' | 'banish'): number {
  const r = forgeOn(c, k);
  return Math.max(0, r - (c.progression.milestones[RUN_KEY(k)] ?? 0));
}

/** One of the run's extra rerolls or banishes used; false if none is left */
export function useForge(c: CharacterState, k: 'reroll' | 'banish'): boolean {
  if (forgeLeft(c, k) <= 0) return false;
  c.progression.milestones[RUN_KEY(k)] = (c.progression.milestones[RUN_KEY(k)] ?? 0) + 1;
  return true;
}

/** Cards of the run's first choice (the opening hand's rank: one more) */
export function openingCards(g: Game, base: number): number {
  const c = g.character;
  const spent = Object.values(c.skills).reduce((a, b) => a + (b ?? 0), 0);
  return spent === 0 && forgeOn(c, 'hand') > 0 ? base + 1 : base;
}

/** Factor on a kill's experience, the run's gold, the pickup's reach; the boss chest's extra chance */
export const forgeXp = (c: CharacterState): number => 1 + FORGE_FX.xp * forgeOn(c, 'xp');
export const forgeGold = (c: CharacterState): number => FORGE_FX.gold * forgeOn(c, 'gold');
export const forgeReach = (c: CharacterState): number => 1 + FORGE_FX.reach * forgeOn(c, 'reach');
export const forgeLuck = (c: CharacterState): number => FORGE_FX.luck * forgeOn(c, 'luck');
