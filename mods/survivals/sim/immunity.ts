/**
 * Rounds a build can solve (lot 282, S7). In Nightmare and Hell, Diablo II gives many monsters an immunity (resistance of 100 % or more) to
 * an element; in the base's open maps a single-element build walks past them (or lets its mercenary kill them), but a round of the mode is
 * a closed arena that keeps filling: a pool where most species are immune to the build's only element (fire immunes of the River of
 * Flame, cold immunes of the Frigid Highlands, lightning immunes of the Worldstone Keep) would be a round that cannot be won. The director
 * therefore keeps the live monsters immune to every element of the character's attacks to a share of the target (`IMMUNE_CAP`: the
 * species are drawn again, as for the archers and casters), and the round's named elites (mini-bosses, the midway super-unique, the
 * leaders of the elite waves: the Council in the Durance of Hate, Baal's minions) and its bosses never keep such an immunity: it is
 * brought down to 90 %, as Diablo II does for the seal guardians of the Chaos Sanctuary, whose death is mandatory. Measured (lot 282): in
 * Hell, a Council member of the Durance with Stone Skin (physical immunity) held a Whirlwind Barbarian's round. The monsters' own resistances and their D2 tables are not changed otherwise.
 */
import { effectiveMonsterRes, MONSTER_BY_ID, SKILL_BY_ID, type CharacterState, type Monster } from '../../../src/mods/sdk';

export type Element = 'phys' | 'fire' | 'cold' | 'light' | 'poison' | 'magic';

/** Share of the round's target that may be immune to every element of the character's attacks (one at least) */
export const IMMUNE_CAP = 0.15;
export const IMMUNE_MIN = 1;
/** Resistance left to a checkpoint boss that was immune to all of the character's elements (the seal guardians' cap in the base) */
export const BOSS_RES_CAP = 90;
/** A skill counts among the character's attacks from this share of the hard points of its best damaging skill */
const SHARE_OF_BEST = 0.25;

const NO_DAMAGE = new Set(['aura', 'curse', 'buff', 'shout', 'passive']);

/**
 * Elements the character hurts monsters with: those of its damaging skills (hard points at least a quarter of its best one's; summons
 * count as physical), physical for a weapon attack (melee strikes, or no damaging skill yet)
 */
export function attackElements(c: CharacterState): Element[] {
  const dmg = Object.entries(c.skills)
    .filter(([id, pts]) => pts > 0 && SKILL_BY_ID[id] && !SKILL_BY_ID[id].passive && !SKILL_BY_ID[id].buff && !NO_DAMAGE.has(SKILL_BY_ID[id].kind ?? ''))
    .map(([id, pts]) => ({ s: SKILL_BY_ID[id], pts }));
  const best = Math.max(0, ...dmg.map((x) => x.pts));
  const out = new Set<Element>();
  for (const { s, pts } of dmg) {
    if (pts < best * SHARE_OF_BEST) continue;
    if (s.kind === 'minion' || s.melee || s.kind === 'strike' || s.kind === 'charge' || s.kind === 'finisher') out.add('phys');
    if (s.kind !== 'minion') {
      out.add(s.element as Element);
      if (s.element2) out.add(s.element2 as Element);
    }
  }
  if (!out.size) out.add('phys');
  return [...out].sort();
}

/**
 * Immunity breakers of the character's gear, by element (`Player.d.sunder`): the content ruleset says what they do (`combat.monsterRes`:
 * pd2's sunder charms bring an immunity down to 95 %, Diablo II has none)
 */
export type Sunder = Readonly<Partial<Record<Element, boolean>>>;

/** Is a resistance an immunity for this character (the content ruleset's rule, its sunder charms counted)? */
function immuneAt(res: number, e: Element, sunder: Sunder | undefined): boolean {
  return res >= 100 && effectiveMonsterRes(res, 0, !!sunder?.[e]).immune;
}

/** Could a monster of this species be immune to all these elements at this difficulty (its D2 resistances, or one of its variants)? */
export function speciesImmune(id: string, els: readonly Element[], d: number, sunder?: Sunder): boolean {
  const def = MONSTER_BY_ID[id];
  if (!def || !els.length) return false;
  const sets = [def.res, ...(def.resVariants ?? [])] as Partial<Record<Element, [number, number, number]>>[];
  return els.every((e) => sets.some((r) => immuneAt(r[e]?.[d] ?? 0, e, sunder)));
}

/** Is this monster immune to all these elements (its resistances after its rank's modifiers, the character's sunder charms counted)? */
export function monsterImmune(m: Monster, els: readonly Element[], sunder?: Sunder): boolean {
  return els.length > 0 && els.every((e) => immuneAt(m.res[e] ?? 0, e, sunder));
}

/** A checkpoint boss immune to every element of the character: those immunities come down to `BOSS_RES_CAP` */
export function breakBossImmunity(m: Monster, els: readonly Element[], sunder?: Sunder): boolean {
  if (!monsterImmune(m, els, sunder)) return false;
  for (const e of els) m.res[e] = Math.min(m.res[e], BOSS_RES_CAP);
  return true;
}

/** Live monsters immune to all these elements may be `IMMUNE_CAP` of the target (`IMMUNE_MIN` at least) */
export function immuneCapOf(target: number): number {
  return Math.max(IMMUNE_MIN, Math.round(target * IMMUNE_CAP));
}
