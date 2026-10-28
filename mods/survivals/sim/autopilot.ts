/**
 * Controls of the Survivals mode (rule `game.autopilot`, called before each simulation step, after the player's controls):
 * - (lot 290, owner: no skill button, every skill automatic: the manual control is gone, a saved one plays the semi-automatic)
 * - semi-automatic (default): the joystick moves; standing still, the character keeps its buffs, auras and summons up and attacks on its
 *   own with its most profitable skill (`attack`) at a target in reach; walking, it still strikes a target in reach every `WALK_ATTACK.gap` ticks
 *   (lot 288, after the owner's comparison with another survivors game: one thumb on the joystick must fight too; the attack roots the
 *   character for its swing, as in Diablo II, then the walk goes on);
 * - automatic: the bot's brain plays (skills, buffs, potions, loot) with a survival movement on top (leave the pack when life is low or
 *   when surrounded, keep away from the arena's border).
 * Also spends the stat points of each level by the character's profile (bot spending, all in vitality, or by hand), and picks up the
 * loot walked over and the gold of the arena (loot.ts, `pickup`).
 */
import { FLOW, flowCadence, inFlow, isRunMode, minCastOf } from './runmode';
import { autoAim, BotBrain, buildPlan, canCast, hasBuff, REGISTRIES, TICK_HZ, type BuildId, type Game, type Monster, type World } from '../../../src/mods/sdk';
import { roundOfRun } from '../data/chapters';
import { boxOf } from './arena';
import { pickup } from './loot';
import { setting, stateOf } from './state';

/**
 * Bot build that drives a class in automatic mode and spends the "balanced" stat points. Sorceress: fire (lot 280: in Diablo II's rules the
 * fire plan of the bots clears 11 of 12 test rounds of Acts II and III where the cold one clears 4)
 */
export const CLASS_BUILD: Record<string, BuildId> = {
  sorceress: 'fire',
  amazon: 'javazon',
  barbarian: 'whirlwind',
  paladin: 'zealot',
  necromancer: 'bonemancer',
  druid: 'fissure',
  assassin: 'trapsin',
};

/**
 * Builds of a Run hero (lot 289): the run starts with the gear of the hub, not one bought for the build in town; the Amazon's starting
 * bow makes her a bow Amazon (the javelin plan, Jab first, left her without a spear: 0 kills). Lot 294: the Sorceress a lightning one
 * (Charged Bolt's fan of bolts; the fire plan's single Fire Bolt killed 2.5 monsters a second in Act I's dense flow, the lightning one 6 to 9,
 * her starter kit's survival 155 s → 550 s before the recalibration)
 */
export const RUN_BUILD: Partial<Record<string, BuildId>> = { amazon: 'bowazon', sorceress: 'light' };

/**
 * Lot 302: a Run hero's own plan where the base's does not fit Act I's flow: the zealot Paladin's plan put 5 points in Sacrifice before
 * Zeal, a strike costing the hero a share of the damage dealt, and in the flow's quick cadence (a swing every 0.3 s on fodder) it was his
 * killer (tools/tiers.ts, Sacrifice's cost removed for the measure: no gear 151 → 232 s, the best tier 232 → 743 s): one point, its
 * prerequisite, then Zeal
 */
type SkillPlan = ReturnType<typeof buildPlan>;
export const RUN_PLAN: Partial<Record<string, SkillPlan>> = {
  paladin: [
    ['might', 5],
    ['smite', 1],
    ['sacrifice', 1],
    ['zeal', 5],
    ['prayer', 2],
    ['defiance', 2],
    ['blessed_aim', 3],
    ['concentration', 5],
    ['charge', 1],
    ['vigor', 3],
    ['fanaticism', 5],
    ['holy_shield', 3],
    ['defiance', 5],
    ['prayer', 5],
  ],
  /**
   * Lot 303: the whirlwind Barbarian's plan is the Campaign's (two swords, Whirlwind at level 30, Sword Mastery to 20, shouts): in a Run
   * he wields the starter's hand axe to the end (the bots keep the kind of weapon worn), five points a skill at most, and the cards spent
   * the rest on Howl, Leap and Taunt; Howl (a fear) and Leap (a knockback) sent the field away from a melee hero who then walked after it
   * (55 % of his time walking, 30 to 45 damage a second at level 15, 3 kills a second): Axe Mastery, Double Swing, Concentrate (level 18),
   * Iron Skin, Berserk, never Howl nor Leap (`RUN_AVOID`)
   */
  barbarian: [
    ['bash', 1],
    ['double_swing', 3],
    ['axe_mastery', 3],
    ['double_swing', 5],
    ['axe_mastery', 5],
    ['stun', 1],
    ['concentrate', 5],
    ['iron_skin', 3],
    ['increased_stamina', 1],
    ['increased_speed', 3],
    ['berserk', 3],
    ['natural_resistance', 3],
    ['iron_skin', 5],
    ['whirlwind', 5],
  ],
};

/** Lot 302: skills a Run hero's cards take beyond its plan only when nothing else is offered (Sacrifice's cost, lot 303 the Barbarian's Howl and Leap: see `RUN_PLAN`) */
export const RUN_AVOID: Partial<Record<string, readonly string[]>> = { paladin: ['sacrifice'], barbarian: ['howl', 'leap'] };

/** The skill plan the cards follow (the Run's own when it has one) */
export function planOf(g: Game): SkillPlan {
  return (isRunMode(g.character) ? RUN_PLAN[g.character.classId] : undefined) ?? buildPlan(buildOf(g));
}

/** The build plan of the character (the Run mode's when it differs) */
export function buildOf(g: Game): BuildId {
  const cls = g.character.classId;
  return (isRunMode(g.character) ? RUN_BUILD[cls] : undefined) ?? CLASS_BUILD[cls] ?? 'cold';
}

export type ControlMode = 'semi' | 'auto';

/** The character's brain (automatic mode, buffs and stat spending), made once per game */
export function brainOf(g: Game): BotBrain {
  const s = stateOf(g);
  s.brain ??= new BotBrain(g, { build: buildOf(g), greedy: true });
  return s.brain;
}

/** Is the game in a Survivals round? */
export function inRound(g: Game): boolean {
  return g.mode === 'run' && !!roundOfRun(g.runDef?.id);
}

export function autopilot(g: Game): void {
  spendStats(g);
  if (!inRound(g)) return;
  const w = g.world;
  const p = w.player;
  if (p.dead) return;
  pickup(g, w);
  const mode = setting(g, 'control') as ControlMode;
  // lot 294 (owner: "I learned Leap and it is never cast"): in Act I's flow every active skill learned comes in turn (`rotation`)
  const flow = inFlow(w);
  if (!flow) return controls(g, w, mode, false);
  // lot 301 (owner: "every skill independent, its own cooldown, cast at the same time as another"): every spell ready with a use goes
  // off now, beside the others (`castReady`); the hero's cast animation it starts never holds a strike (`liftCosmetic`)
  if (FLOW.independent) castReady(g, w);
  const lifted = liftCosmetic(w);
  controls(g, w, mode, true);
  if (lifted && !mainOnly(w.input.cast?.skill)) {
    p.mode = 'cast';
    p.cast = lifted;
  }
}

function controls(g: Game, w: World, mode: ControlMode, flow: boolean): void {
  if (flow && rotation(g, w)) return;
  if (mode === 'auto') {
    const brain = brainOf(g);
    const melee = brain.melee();
    // melee characters: the arena's own fighter (the brain's melee, made to explore a map, measured stuck behind monsters that keep their
    // distance); casters and archers: the brain
    if (melee) meleeFight(g, w);
    else brain.tick();
    survivalMove(w, melee, stateOf(g), flow ? () => void attack(g, w, true) : undefined);
    return;
  }
  semiAuto(g, w);
}

/**
 * Seconds between two casts of a skill the brain does not choose by itself (lot 294, owner: Leap learned and never cast): every active
 * skill learned comes in turn, at most this often (or its own floor `minCastOf`, when longer), when it has a use (`rotationTarget`)
 */
export const ROTATE_EVERY = 4;
/** Skills never cast by the rotation: teleport (an escape, the brain's), the toggled auras and the summons (the brain keeps them up) */
const NO_ROTATE = new Set(['attack', 'teleport']);
/** Kinds of the skills that strike or deal damage (the rotation casts them on their own floor, lot 298; the traps too, lot 301) */
const DAMAGING = new Set(['strike', 'ranged', 'spell', 'charge', 'finisher', 'trap']);
/** Skills that need a corpse near the hero */
const CORPSE_SKILLS = new Set(['corpse_explosion', 'raise_skeleton', 'raise_skeletal_mage', 'revive', 'find_potion', 'find_item', 'grim_ward', 'death_sentry']);

/**
 * Last tick each skill was cast by the hero, and the last cast of any skill (rule `skills.onCast`: the main cast or one beside it), BY
 * WORLD (lot 300, owner: "my fire spell is no longer cast when I have 3 spells"): a zone is a new world whose tick starts again at 0; the
 * log kept by character held the ticks of the zone before, so a skill cast late in a zone looked cast "in the future" in the next one and
 * the rotation left it out for a whole zone (90 to 180 s) while the brain's own choice took the casts
 */
const LAST_CAST = new WeakMap<object, { any: number; at: Record<string, number> }>();

export function castLog(w: World): { any: number; at: Record<string, number> } {
  let l = LAST_CAST.get(w);
  if (!l) LAST_CAST.set(w, (l = { any: -Infinity, at: {} }));
  return l;
}

/** A skill the hero cast in Act I's flow (any control: the brain, the semi-automatic, the rotation; rule `skills.onCast`) */
export function noteCast(w: World, id: string): void {
  const l = castLog(w);
  l.at[id] = w.tick;
  l.any = w.tick;
}

/** Active skills learned, as the rotation sees them (passives, auras and summons left to the brain) */
export function rotationSkills(g: Game): string[] {
  const out: string[] = [];
  for (const [id, n] of Object.entries(g.character.skills)) {
    const s = REGISTRIES.skills.get(id);
    if (!(n && n > 0) || !s || s.passive || NO_ROTATE.has(id) || s.kind === 'aura' || s.kind === 'minion' || s.kind === 'passive') continue;
    out.push(id);
  }
  return out;
}

/**
 * Where a skill of the rotation is of use now, or null: a buff not active on the hero (cast on him); a shout or an area around the hero
 * with a monster within 4 units; a corpse skill near a corpse; else the densest group in its reach (3 monsters within 3 units of one, for a
 * leap or a charge), the nearest monster in reach otherwise
 */
export function rotationTarget(w: World, id: string): { x: number; y: number; targetId: number } | null {
  const p = w.player;
  const s = REGISTRIES.skills.get(id);
  if (!s) return null;
  const foes = w.monstersNear(p.x, p.y, Math.max(4, s.range + 1)).filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon);
  if (s.buff || s.kind === 'buff') {
    // one armour of a tree at a time (the Sorceress's three cold armours replace one another)
    const same = p.buffs.some((b) => b.id !== id && REGISTRIES.skills.get(b.id)?.tree === s.tree && REGISTRIES.skills.get(b.id)?.buff);
    return hasBuff(w, id) || same || !foes.length ? null : { x: p.x, y: p.y, targetId: 0 };
  }
  if (CORPSE_SKILLS.has(id)) {
    const corpse = w.monsters.find((m) => m.dead && !m.isSummon && Math.hypot(m.x - p.x, m.y - p.y) < Math.max(4, s.range));
    return corpse ? { x: corpse.x, y: corpse.y, targetId: 0 } : null;
  }
  if (s.target === 'self' || s.kind === 'shout') return foes.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < 4) ? { x: p.x, y: p.y, targetId: 0 } : null;
  const reach = Math.max(2.2, s.range);
  const inReach = foes.filter((m) => Math.hypot(m.x - p.x, m.y - p.y) <= reach + m.radius + p.radius);
  if (!inReach.length) return null;
  let best = inReach[0];
  let bestN = -1;
  for (const m of inReach) {
    const n = foes.filter((o) => Math.hypot(o.x - m.x, o.y - m.y) < 3).length;
    if (n > bestN) [best, bestN] = [m, n];
  }
  // lot 301: the Assassin's charge-ups (kind `charge`, Tiger Strike...) are strikes, not dashes (they were held for a pack of 3)
  const jump = id === 'charge' || id === 'leap' || id === 'leap_attack' || id === 'whirlwind' || id === 'dragon_flight';
  if (jump && bestN < 3) return null;
  return { x: best.x, y: best.y, targetId: best.id };
}

/** Skills that move the hero or swing his weapon: cast as the main cast only (their animation is their effect), never beside another */
const MOVE_SKILLS = new Set(['leap', 'leap_attack', 'whirlwind', 'dragon_flight', 'teleport', 'charge']);

/** Is `id` the weapon's attack or a melee strike (its frames are its rhythm, no cooldown; a bow's or a throw's skill is not)? */
export function swingOf(id: string): boolean {
  const s = REGISTRIES.skills.get(id);
  return id === 'attack' || (!!s?.melee && s.kind !== 'ranged');
}

/** Does `id` need the hero's own body (the weapon's attack, a melee strike, a leap or a charge)? */
export function mainOnly(id: string | undefined): boolean {
  if (!id) return false;
  if (id === 'attack' || MOVE_SKILLS.has(id)) return true;
  const s = REGISTRIES.skills.get(id);
  // a bow's or a throw's skill (`ranged`, flagged melee for its weapon) goes off beside the others (`World.sideCast`)
  return !!s && ((!!s.melee && s.kind !== 'ranged') || s.kind === 'charge');
}

/**
 * Seconds between two casts of a skill of the rotation (lot 301, its OWN cooldown, set at its cast by rule `skills.onCast` and shown by
 * the skills preview): a damaging skill its floor (`minCastOf`), a buff, a curse, a shout `ROTATE_EVERY` at least
 */
export function rotationEvery(id: string): number {
  const sk = REGISTRIES.skills.get(id);
  // a bow's or a throw's skill is a spell here (its floor, not its swing's)
  const melee = swingOf(id);
  const damaging = !!sk && !sk.buff && (sk.kind === undefined || DAMAGING.has(sk.kind));
  const rotated = !!sk && !NO_ROTATE.has(id) && sk.kind !== 'aura' && sk.kind !== 'minion' && sk.kind !== 'passive' && !sk.passive;
  return damaging || !rotated ? minCastOf(id, melee) : Math.max(ROTATE_EVERY, minCastOf(id, melee));
}

/** Cast animations started by `castReady` (no effect of their own: the spells went off at once) */
const COSMETIC = new WeakSet<object>();

/**
 * Lot 301 (owner: "when a spell is cast it seems to push the others' cooldown back, so they are never cast together; every skill must be
 * independent"): every spell learned (the rotation's skills that do not need the hero's body, `mainOnly`) whose own cooldown is over
 * (`canCast`) and that has a use now (`rotationTarget`) goes off THIS tick, beside the others (`World.sideCast`: its effect at once,
 * several in the same tick). No global cap, no turn, no priority between them: a cast sets only its own cooldown (`floorCast`). The hero
 * free, a short cast animation is played for the eye (no effect; a strike asked lifts it, `liftCosmetic`). Returns the skills cast
 */
export function castReady(g: Game, w: World): string[] {
  const p = w.player;
  const out: string[] = [];
  if (p.dead || p.freezeT > 0) return out;
  for (const id of rotationSkills(g)) {
    if (mainOnly(id) || !canCast(w, id).ok) continue;
    const t = rotationTarget(w, id);
    if (!t || w.sideCast(id, t.x, t.y, t.targetId) !== 'cast') continue;
    out.push(id);
    if (p.mode !== 'cast' && p.mode !== 'attack') {
      if (t.x !== p.x || t.y !== p.y) p.facing = Math.atan2(t.y - p.y, t.x - p.x);
      p.mode = 'cast';
      p.modeT = 0;
      p.modeLen = Math.max(4, Math.round(13 * flowCadence(g.character.classId)));
      p.cast = { skill: id, tx: t.x, ty: t.y, targetId: t.targetId, released: true, releaseAt: 0 };
      COSMETIC.add(p.cast);
    }
  }
  return out;
}

/** The hero's running cast animation if it is one of `castReady`'s (ended for the controls' choice, to be put back unless a strike is asked) */
function liftCosmetic(w: World): NonNullable<World['player']['cast']> | null {
  const p = w.player;
  const c = p.cast;
  if (p.mode !== 'cast' || !c || !COSMETIC.has(c)) return null;
  p.mode = 'idle';
  p.cast = null;
  return c;
}

/**
 * The rotation (lot 294): the learned skill cast the longest ago, when its turn has come (`ROTATE_EVERY`) and it has a use now, is cast
 * instead of the brain's choice; true if a cast was asked. A skill never cast yet comes first
 */
export function rotation(g: Game, w: World): boolean {
  const p = w.player;
  // lot 298: while a cast goes on, a skill of the rotation goes off beside it (`FLOW.parallel`); lot 301: the strikes and leaps only
  const busy = p.mode === 'cast' || p.mode === 'attack';
  if (p.dead || p.mode === 'hit' || w.input.cast || (busy && !FLOW.parallel)) return false;
  const log = castLog(w);
  let pick: { id: string; last: number; t: { x: number; y: number; targetId: number } } | null = null;
  for (const id of rotationSkills(g)) {
    // lot 301: the spells are cast on their own by `castReady`; the rotation keeps the skills that need the hero's body
    if (FLOW.independent && !mainOnly(id)) continue;
    const melee = !!REGISTRIES.skills.get(id)?.melee;
    // beside a running cast: never the same skill, never a melee strike (it keeps its swing)
    if (busy && (melee || p.cast?.skill === id)) continue;
    const last = log.at[id] ?? -Infinity;
    // lot 298: beside a running cast, a damaging skill on its own floor (every skill learned of use, each on its own cooldown); as the
    // main cast (the hero free) and for the other skills, every `ROTATE_EVERY` (the brain's choice keeps the main cast)
    const sk = REGISTRIES.skills.get(id);
    const damaging = !!sk && !sk.buff && (sk.kind === undefined || DAMAGING.has(sk.kind));
    // lot 301: a damaging strike on its own floor whenever the hero is free (no more `ROTATE_EVERY` turn); one body, one swing at a time
    const every = (damaging ? minCastOf(id, melee) : Math.max(ROTATE_EVERY, minCastOf(id, melee))) * TICK_HZ;
    if (w.tick - last < every || (pick && last >= pick.last) || !canCast(w, id).ok) continue;
    // lot 303: a strike that costs the hero life (Sacrifice) only while he is well (`SELF_HARM_ABOVE`): the rotation swung it on its
    // floor whatever his life, a geared Paladin (a weapon of 30 damage, 8 % of it a swing) bled to 1 life point by 2:10
    if (SELF_HARM.has(id) && p.hp < p.hpMax * SELF_HARM_ABOVE) continue;
    const t = rotationTarget(w, id);
    if (t) pick = { id, last, t };
  }
  if (!pick) return false;
  w.input.cast = { skill: pick.id, tx: pick.t.x, ty: pick.t.y, targetId: pick.t.targetId };
  return true;
}

/** Stat points of the levels: bot spending (equipment requirements, then vitality), all in vitality, or left to the player */
export function spendStats(g: Game): void {
  const c = g.character;
  if (c.statPoints <= 0 || !g.world) return;
  const profile = setting(g, 'stats');
  if (profile === 'manual') return;
  if (profile === 'vitality') g.allocateStat('vit', c.statPoints);
  else brainOf(g).spendStatPoints();
}

/**
 * Attacks while walking in semi-automatic (lot 288): at most one every `gap` ticks (0.8 s), only at a target already in reach (never a
 * detour). `Infinity`: the stop-to-shoot of lots 274-287 (measures: tools/walk.ts)
 */
export const WALK_ATTACK = { gap: 20 };

function semiAuto(g: Game, w: World): void {
  const p = w.player;
  const inp = w.input;
  potion(w);
  if (p.mode === 'cast' || p.mode === 'attack' || p.mode === 'hit' || inp.cast) return;
  const moving = Math.hypot(inp.moveX, inp.moveY) > 0.1;
  if (moving) {
    const st = stateOf(g);
    // Act I's flow (lot 291): the hero walks while he casts, at the nearest monster in any direction, as soon as he can
    const flow = inFlow(w);
    // lot 294: walking in the flow, the buffs, auras and summons are kept up too (the hero casts while he walks)
    if (flow && brainOf(g).maintain(w.monstersNear(p.x, p.y, 13).some((m) => m.aggro && !m.dead && m.team === 1))) return;
    if (!st.autoAttack || w.tick - st.walkAttackAt < (flow ? 0 : WALK_ATTACK.gap)) return;
    if (attack(g, w, flow)) st.walkAttackAt = w.tick;
    return;
  }
  const threats = w.monstersNear(p.x, p.y, 13).filter((m) => m.aggro && !m.dead && m.team === 1);
  // buffs, auras, summons: when standing still (they root the character for a moment, like an attack)
  if (brainOf(g).maintain(threats.length > 0)) return;
  if (!stateOf(g).autoAttack || !threats.length) return;
  attack(g, w);
}

/**
 * Attack of the semi-automatic control at a target in reach (no walking: the player moves). Lot 290 (owner: no skill button, everything
 * automatic): the skill the brain finds the most profitable against the monsters around (its damage, their resistances, the mana), cast
 * at its target when in reach; else the main attack at the automatically aimed target
 */
export function attack(g: Game, w: World, nearest = false): boolean {
  const p = w.player;
  const threats = w.monstersNear(p.x, p.y, 13).filter((m) => m.aggro && !m.dead && m.team === 1 && !m.pet && !m.isSummon);
  const pick = threats.length ? brainOf(g).attackChoice(threats) : null;
  if (pick) {
    // `nearest` (lot 291): at the nearest monster, wherever it is (behind the hero walking away too)
    let t = pick.target;
    if (nearest) for (const m of threats) if (Math.hypot(m.x - p.x, m.y - p.y) < Math.hypot(t.x - p.x, t.y - p.y)) t = m;
    if (Math.hypot(t.x - p.x, t.y - p.y) <= attackReachOf(pick.skill) + t.radius + p.radius) {
      stateOf(g).targetId = t.id;
      w.input.cast = { skill: pick.skill, tx: t.x, ty: t.y, targetId: t.id };
      return true;
    }
  }
  let skill = g.character.hotbar.primary || 'attack';
  if (skill !== 'attack' && !canCast(w, skill).ok) skill = 'attack';
  const s = stateOf(g);
  const aim = autoAim(w, skill, { joy: null, currentId: s.targetId, lockedId: 0 });
  if (!aim.targetId) return false;
  const t = w.monsters.find((m) => m.id === aim.targetId);
  if (!t) return false;
  const reach = attackReachOf(skill);
  if (Math.hypot(t.x - p.x, t.y - p.y) > reach + t.radius + p.radius) return false;
  s.targetId = aim.targetId;
  w.input.cast = { skill, tx: aim.x, ty: aim.y, targetId: aim.targetId };
  return true;
}

/** Reach of a skill: its range (8 units when unknown), at least a melee swing's */
function attackReachOf(skill: string): number {
  if (skill === 'attack') return 2.2;
  return Math.max(2.2, REGISTRIES.skills.get(skill)?.range ?? 8);
}

/** A healing potion (rejuvenation below 25 %) below 35 % of life */
function potion(w: World): void {
  const p = w.player;
  if (p.potionCd > 0 || p.healT > 0 || p.hp >= p.hpMax * 0.35) return;
  const belt = w.character.belt;
  const has = (k: string) => belt.some((b) => b.kind === k && b.qty > 0);
  if (p.hp < p.hpMax * 0.25 && has('rejuv')) w.input.potion = 'rejuv';
  else if (has('heal')) w.input.potion = 'heal';
}

/** Seconds a melee fighter keeps closing in on a target without getting nearer before it gives up on it for 8 s */
const CHASE_GIVE_UP = 3;

/** Strikes that cost the striker life (Sacrifice: 8 % of the damage, D2): not used below 60 % of life */
const SELF_HARM = new Set(['sacrifice']);
/** Lot 303: share of his life the hero keeps at least to swing such a strike (as the base's bots: 70 %) */
export const SELF_HARM_ABOVE = 0.7;

/**
 * Best melee attack of the character now: the strike it has put the most points in (its main attack on a tie), else a swing. Measured
 * (lot 282): taking the main attack first, a level-63 Barbarian with 20 points in Whirlwind kept bashing with its first skill (the main
 * attack is the first skill learned until the player changes it), and could not kill Baal's minions in Nightmare
 */
export function meleeSkill(g: Game, w: World): string {
  const c = g.character;
  const hurt = w.player.hp < w.player.hpMax * SELF_HARM_ABOVE;
  const ok = (id: string) => {
    const s = REGISTRIES.skills.get(id);
    if (hurt && SELF_HARM.has(id)) return false;
    return !!s && !s.passive && (s.melee || (s.range ?? 8) < 3) && s.target !== 'self' && (c.skills[id] ?? 0) > 0 && canCast(w, id).ok;
  };
  let best = c.hotbar.primary && ok(c.hotbar.primary) ? c.hotbar.primary : 'attack';
  let lvl = best === 'attack' ? 0 : (c.skills[best] ?? 0);
  for (const [id, n] of Object.entries(c.skills)) if ((n ?? 0) > lvl && ok(id)) [best, lvl] = [id, n ?? 0];
  return best;
}

/**
 * Melee fighter of the automatic mode: buffs, auras and potions by the brain; the nearest monster it can walk to (those within 3 units
 * first), struck when in reach, walked to (around the obstacles) otherwise; a target it does not get nearer to in 3 s is left alone 8 s.
 */
export function meleeFight(g: Game, w: World): void {
  const p = w.player;
  const inp = w.input;
  inp.moveX = 0;
  inp.moveY = 0;
  potion(w);
  if (p.dead || p.mode === 'cast' || p.mode === 'attack' || p.mode === 'hit') return;
  const st = stateOf(g);
  const near = w.monstersNear(p.x, p.y, 16).filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon && (st.banned.get(m.id) ?? 0) <= w.tick);
  if (brainOf(g).maintain(near.some((m) => m.aggro))) return;
  if (!near.length) return;
  let t = near[0];
  let td = Infinity;
  for (const m of near) {
    const d = Math.hypot(m.x - p.x, m.y - p.y) - (d0(m, p) ? 4 : 0);
    if (d < td) [t, td] = [m, d];
  }
  const d = Math.hypot(t.x - p.x, t.y - p.y);
  const skill = meleeSkill(g, w);
  const reach = Math.max(1.3, skill === 'attack' ? 1.3 : (REGISTRIES.skills.get(skill)?.range ?? 1.3)) + t.radius + p.radius;
  if (d <= reach) {
    st.chase = null;
    inp.cast = { skill, tx: t.x, ty: t.y, targetId: t.id };
    return;
  }
  // closing in: give up a target that keeps away
  if (!st.chase || st.chase.id !== t.id) st.chase = { id: t.id, best: d, since: w.tick };
  else if (d < st.chase.best - 0.3) st.chase = { id: t.id, best: d, since: w.tick };
  else if (w.tick - st.chase.since > CHASE_GIVE_UP * 25) {
    st.banned.set(t.id, w.tick + 8 * 25);
    st.chase = null;
    return;
  }
  const dir = w.steer(t.x, t.y);
  if (!dir) {
    st.banned.set(t.id, w.tick + 8 * 25);
    return;
  }
  inp.moveX = dir.x;
  inp.moveY = dir.y;
}

/** Monster within 3 units (struck first) */
const d0 = (m: Monster, p: { x: number; y: number }) => Math.hypot(m.x - p.x, m.y - p.y) < 3;

/** Ticks of a survival escape, then ticks before the next one (the brain fights in between) */
const FLEE_TICKS = 30;
const FLEE_PAUSE = 25;

/**
 * Survival movement of the automatic mode, over the brain's decision: walk out of a crowd (each monster weighted by 1/d²), pulled back
 * toward the middle near the arena's border, for 1.2 s at most, then 1 s of fight. A ranged character leaves when three monsters touch
 * it, or with life below 40 % and a monster close; a melee one only when six touch it, or three with life below 40 % (it must stay in
 * contact to kill). `shoot` (lot 294, Act I's flow: the hero casts while he walks): an attack at the nearest monster as he gets away.
 */
export function survivalMove(w: World, melee = false, st: { fleeUntil: number; fleeBlock: number } = { fleeUntil: 0, fleeBlock: 0 }, shoot?: () => void): void {
  const p = w.player;
  if (p.mode === 'cast' || p.mode === 'attack') return;
  const near: Monster[] = w.monstersNear(p.x, p.y, 6).filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon);
  const touching = near.filter((m) => Math.hypot(m.x - p.x, m.y - p.y) < 2.5).length;
  const low = p.hp < p.hpMax * 0.4;
  const crowd = melee ? touching >= 6 || (low && touching >= 3) : touching >= 3 || (low && near.length > 0);
  const fleeing = w.tick < st.fleeUntil;
  if (!fleeing) {
    if (!crowd || w.tick < st.fleeBlock) return;
    st.fleeUntil = w.tick + FLEE_TICKS;
    st.fleeBlock = st.fleeUntil + FLEE_PAUSE;
  }
  if (!near.length) return;
  let ex = 0;
  let ey = 0;
  for (const m of near) {
    const d = Math.max(0.5, Math.hypot(p.x - m.x, p.y - m.y));
    ex += (p.x - m.x) / (d * d);
    ey += (p.y - m.y) / (d * d);
  }
  const box = boxOf(w.zone);
  if (box) {
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const edge = Math.min(p.x - box.x0, box.x1 - p.x, p.y - box.y0, box.y1 - p.y);
    if (edge < 6) {
      const l = Math.hypot(cx - p.x, cy - p.y) || 1;
      const k = ((6 - edge) / 6) * 1.5 * Math.hypot(ex, ey);
      ex += ((cx - p.x) / l) * k;
      ey += ((cy - p.y) / l) * k;
    }
  }
  const base = Math.atan2(ey, ex);
  for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
    const a = base + off;
    if (w.grid.walkLine(p.x, p.y, p.x + Math.cos(a) * 3, p.y + Math.sin(a) * 3, 0.35)) {
      w.input.cast = null;
      w.input.moveX = Math.cos(a);
      w.input.moveY = Math.sin(a);
      // lot 294: in Act I's flow the hero keeps shooting while he gets away (he casts while he walks)
      shoot?.();
      return;
    }
  }
}
