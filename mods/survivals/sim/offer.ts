/**
 * Skill offer at each level (rule `skills.offer`): three cards drawn among the skills of the class the character can learn now
 * (`Game.canLearn`: class, required level, prerequisites, cap of 20), weighted so that a build takes shape (lesson of Dragon Ball
 * Survivors): a skill already invested 5, a new active skill 2, a new passive or a synergy of a skill owned 2.5, another new passive 1.2;
 * at least one card of an invested skill when there is one. Pure: character and seed in, identifiers out.
 */
import { REGISTRIES, Rng, type Game } from '../../../src/mods/sdk';
import { FLOW, isRunMode, RUNS_KEY } from './runmode';
import { forgeLeft, openingCards, useForge } from './forge';

export const OFFER_SIZE = 3;

export const WEIGHTS = { invested: 5, active: 2, synergy: 2.5, passive: 1.2 };

/** Weight of a candidate skill for this character */
export function weightOf(g: Game, id: string): number {
  const c = g.character;
  const s = REGISTRIES.skills.get(id)!;
  if ((c.skills[id] ?? 0) > 0) return WEIGHTS.invested;
  const owned = Object.keys(c.skills).filter((k) => (c.skills[k] ?? 0) > 0);
  const synergy = owned.some((o) => REGISTRIES.skills.get(o)?.synergies.some((x) => x.skill === id));
  if (synergy) return WEIGHTS.synergy;
  return s.passive ? WEIGHTS.passive : WEIGHTS.active;
}

/** Skills banished from the cards for the round being played (lot 288; none out of a round) */
export function banishedOf(g: Game): readonly string[] {
  const d = g.mode === 'run' ? (g.world?.run?.director as { banished?: unknown } | undefined) : undefined;
  return Array.isArray(d?.banished) ? (d.banished as string[]) : [];
}

/**
 * Banishes a skill from the cards for the rest of the round; at most `BANISHES` a round, then the run's extra ones of the training (lot
 * 308, sim/forge.ts: one used each time). Base: none out of a round
 */
export const BANISHES = 2;
export function banish(g: Game, id: string): boolean {
  const d = g.mode === 'run' ? (g.world?.run?.director as { banished?: unknown } | undefined) : undefined;
  if (!d || !Array.isArray(d.banished) || d.banished.includes(id)) return false;
  if (d.banished.length >= BANISHES && !useForge(g.character, 'banish')) return false;
  (d.banished as string[]).push(id);
  return true;
}

/** Banishes left now: the round's, then the run's extra ones of the training (null out of a round: no banishing in town) */
export function banishesLeftOf(g: Game): number | null {
  const d = g.mode === 'run' ? (g.world?.run?.director as { banished?: unknown } | undefined) : undefined;
  if (!d || !Array.isArray(d.banished)) return null;
  return Math.max(0, BANISHES - d.banished.length) + forgeLeft(g.character, 'banish');
}

/** Skills the character can take a point in now (but those banished for the round) */
export function candidates(g: Game): string[] {
  const out = banishedOf(g);
  // lot 300 (owner: "fewer ranks a skill in a run", the other game's evolutions capped): a skill of a Run at `FLOW.skillRank` points at most
  const cap = isRunMode(g.character) ? FLOW.skillRank : Infinity;
  return REGISTRIES.skills
    .all()
    .filter((s) => g.canLearn(s.id).ok && !out.includes(s.id) && (g.character.skills[s.id] ?? 0) < cap)
    .map((s) => s.id);
}

/**
 * Three cards (fewer if fewer skills can be learned; null if none: the point is kept for later). `reroll` changes the draw; the seed
 * depends on the character, the level and the points already spent, so a reload shows the same cards.
 */
export function drawOffer(g: Game, level: number, reroll: number): string[] | null {
  const pool = candidates(g);
  if (!pool.length) return null;
  const c = g.character;
  const spent = Object.values(c.skills).reduce((a, b) => a + (b ?? 0), 0);
  // Run mode (lot 289): each run draws its own cards (the Campaign's draw unchanged)
  const salt = isRunMode(c) ? `:run${c.progression.milestones[RUNS_KEY] ?? 0}` : '';
  const rng = new Rng(`survivals:offer:${c.name}:${c.classId}:${level}:${reroll}:${spent}${salt}`);
  const left = pool.map((id) => ({ id, w: weightOf(g, id) }));
  const out: string[] = [];
  // lot 303: a Run hero's signature skill (`FLOW.signature`: the Paladin's Zeal) always among the cards while it can take a point
  const sig = isRunMode(c) ? FLOW.signature[c.classId] : undefined;
  const sigAt = sig ? left.findIndex((x) => x.id === sig) : -1;
  if (sigAt >= 0) out.push(left.splice(sigAt, 1)[0].id);
  // at least one invested skill when there is one
  const invested = left.filter((x) => x.w === WEIGHTS.invested);
  if (invested.length && !(sigAt >= 0 && (c.skills[sig!] ?? 0) > 0)) {
    const first = invested[rng.int(invested.length)];
    out.push(first.id);
    left.splice(left.indexOf(first), 1);
  }
  // lot 308: the training's opening hand, one card more at the run's first choice (sim/forge.ts)
  const size = isRunMode(c) ? openingCards(g, OFFER_SIZE) : OFFER_SIZE;
  while (out.length < size && left.length) {
    const total = left.reduce((s, x) => s + x.w, 0);
    let r = rng.float(0, total);
    let i = 0;
    for (; i < left.length - 1; i++) {
      r -= left[i].w;
      if (r < 0) break;
    }
    out.push(left[i].id);
    left.splice(i, 1);
  }
  return out;
}

/** Gold cost of a reroll: the first of each round is free, then 500 × 1.5ⁿ × (difficulty + 1) */
export function rerollCost(paidRerolls: number, difficulty: number): number {
  return Math.round(500 * 1.5 ** paidRerolls * (difficulty + 1));
}
