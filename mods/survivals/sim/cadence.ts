/**
 * Cadence of the hero's attacks and skills in Act I's flow (lot 294, owner: "Charged Bolt is spammed"): the skill cast again as soon as it
 * can at a sandbag, the seconds between two casts and the damage a second measured. Used by `tools/cadence.ts` (the table of the README)
 * and the unit test of the floors (`FLOW.minCast`: no skill cast quicker than its floor).
 */
import { canCast, CLASSES, REGISTRIES, simHooks, TICK_HZ, type Game } from '../../../src/mods/sdk';
import { stateOf } from './state';

/** The class's skills measured: its active skills open by `level` that strike or deal damage (no aura, buff, curse, summon, trap), and the weapon's attack */
export function measuredSkills(cls: string, level: number): string[] {
  const out = ['attack'];
  const trees = new Set<string>(CLASSES[cls as keyof typeof CLASSES].trees);
  for (const s of REGISTRIES.skills.all()) {
    if (!trees.has(s.tree) || s.passive || s.buff || s.reqLvl > level) continue;
    if (!['strike', 'ranged', 'spell', 'charge', 'finisher', undefined].includes(s.kind)) continue;
    out.push(s.id);
  }
  return out;
}

/** Is the weapon's attack of this class a melee strike (the archers' and casters' is a shot or a staff's swing at range)? */
export function meleeAttack(cls: string, id: string): boolean {
  return id === 'attack' ? cls !== 'amazon' && cls !== 'sorceress' && cls !== 'necromancer' : !!REGISTRIES.skills.get(id)?.melee;
}

export interface CadenceRow {
  skill: string;
  /** Seconds between two casts (first to last cast, over the casts), null if fewer than two */
  every: number | null;
  casts: number;
  /** Hero's missiles a cast */
  missiles: number;
  /** Damage a second on the sandbag (its life restored every step) */
  dps: number;
}

/**
 * Casts `id` (at `points` points, no other skill) again as soon as the hero can for `seconds`, in a run's zone of Act I's flow already
 * started (`g`), at a zombie 3 units away (1 for a melee strike) whose life is restored every step; the mode's step runs (its floors)
 */
export function castEvery(g: Game, id: string, points: number, seconds: number): CadenceRow | null {
  const c = g.character;
  const w = g.world;
  c.skills = id === 'attack' ? {} : { [id]: points };
  w.refreshPlayer();
  if (id !== 'attack' && !canCast(w, id).ok) return null;
  const melee = meleeAttack(c.classId, id);
  stateOf(g).autoAttack = false;
  for (const m of w.monsters) m.dead = true;
  w.godMode = true;
  const p = w.player;
  const bag = simHooks.spawnMonster(w, 'zombie', p.x + (melee ? 1 : 3), p.y, { rank: 'normal' }, `bag:${id}:${w.tick}`);
  if (!bag) return null;
  bag.hpMax = bag.hp = 2000;
  bag.speed = 0;
  bag.atkCd = bag.atkCd.map(() => 1e9);
  const missiles = new Set<number>();
  const at: number[] = [];
  let dealt = 0;
  for (let t = 0; t < seconds * TICK_HZ; t++) {
    if (p.mode !== 'cast' && p.mode !== 'attack' && !w.input.cast) w.input.cast = { skill: id, tx: bag.x, ty: bag.y, targetId: bag.id };
    const before = w.stats.casts;
    g.step(1);
    if (w.stats.casts > before) at.push(t);
    dealt += Math.max(0, bag.hpMax - bag.hp);
    bag.hp = bag.hpMax;
    bag.dead = false;
    bag.x = p.x + (melee ? 1 : 3);
    bag.y = p.y;
    for (const ms of w.missiles) if (ms.team === 0) missiles.add(ms.id);
  }
  bag.dead = true;
  bag.hpMax = bag.hp = 1;
  return {
    skill: id,
    every: at.length > 1 ? (at[at.length - 1] - at[0]) / (at.length - 1) / TICK_HZ : null,
    casts: at.length,
    missiles: at.length ? missiles.size / at.length : 0,
    dps: dealt / seconds,
  };
}

/**
 * Lot 309: the class's skills a Run can offer up to `level` that deal damage (strikes, shots, spells, charges, finishers, traps; no aura,
 * buff, curse, summon), and the weapon's attack
 */
export function auditedSkills(cls: string, level: number): string[] {
  const out = ['attack'];
  const trees = new Set<string>(CLASSES[cls as keyof typeof CLASSES].trees);
  for (const s of REGISTRIES.skills.all()) {
    if (!trees.has(s.tree) || s.passive || s.buff || s.reqLvl > level) continue;
    if (!['strike', 'ranged', 'spell', 'charge', 'finisher', 'trap', undefined].includes(s.kind)) continue;
    out.push(s.id);
  }
  return out;
}

/** What `castPack` measured: `CadenceRow` and the damage a second on the first sandbag alone (`dps1`; `dps` on the five) */
export interface PackRow extends CadenceRow {
  dps1: number;
}

/**
 * Lot 309: `castEvery` at a pack of five sandbags (the first 3 units away, 1 for a melee strike, four more around it within 1.5 units,
 * their life restored every step, held in place), the hero's cast rate `fcr` % faster (a gear's FCR; a strike keeps the kit's speed). The
 * skill is cast by the mode's own path: the main cast asked whenever the hero is free and its cooldown over
 */
export function castPack(g: Game, id: string, points: number, seconds: number, fcr = 0): PackRow | null {
  const c = g.character;
  const w = g.world;
  c.skills = id === 'attack' ? {} : { [id]: points };
  w.refreshPlayer();
  if (fcr) w.player.d.fcr += fcr;
  if (id !== 'attack' && !canCast(w, id).ok) return null;
  const melee = meleeAttack(c.classId, id);
  stateOf(g).autoAttack = false;
  for (const m of w.monsters) m.dead = true;
  w.godMode = true;
  const p = w.player;
  const d0 = melee ? 1 : 3;
  const offs = [
    [0, 0],
    [0.9, 0.6],
    [0.9, -0.6],
    [-0.4, 1.1],
    [-0.4, -1.1],
  ];
  const bags = offs.map(([dx, dy], i) => simHooks.spawnMonster(w, 'zombie', p.x + d0 + dx, p.y + dy, { rank: 'normal' }, `pack:${id}:${i}:${w.tick}`));
  const live = bags.filter((b): b is NonNullable<typeof b> => !!b);
  if (live.length !== bags.length) return null;
  for (const b of live) {
    b.hpMax = b.hp = 5000;
    b.speed = 0;
    b.atkCd = b.atkCd.map(() => 1e9);
  }
  const missiles = new Set<number>();
  const at: number[] = [];
  let dealt = 0;
  let dealt1 = 0;
  const first = live[0];
  // the damage dealt to the sandbags as the game tells it (its hit events: the life lost by other ways, a zone's easing, is not counted)
  const ids = new Set(live.map((b) => b.id));
  const off = g.onEvent((e) => {
    if (e.t !== 'hit' || e.toPlayer || !ids.has(e.target)) return;
    dealt += e.amount;
    if (e.target === first.id) dealt1 += e.amount;
  });
  let t = 0;
  // within the zone (its end changes the world)
  for (; t < seconds * TICK_HZ && g.world === w; t++) {
    if (p.mode !== 'cast' && p.mode !== 'attack' && !w.input.cast) w.input.cast = { skill: id, tx: first.x, ty: first.y, targetId: first.id };
    const before = w.stats.casts;
    g.step(1);
    if (w.stats.casts > before) at.push(t);
    live.forEach((b, i) => {
      b.hp = b.hpMax;
      b.dead = false;
      b.x = p.x + d0 + offs[i][0];
      b.y = p.y + offs[i][1];
    });
    for (const ms of w.missiles) if (ms.team === 0) missiles.add(ms.id);
  }
  off();
  for (const b of live) {
    b.dead = true;
    b.hpMax = b.hp = 1;
  }
  const sec = Math.max(1, t) / TICK_HZ;
  return {
    skill: id,
    every: at.length > 1 ? (at[at.length - 1] - at[0]) / (at.length - 1) / TICK_HZ : null,
    casts: at.length,
    missiles: at.length ? missiles.size / at.length : 0,
    dps: dealt / sec,
    dps1: dealt1 / sec,
  };
}

/** What `playRate` measured: the casts a second (all skills, each skill), the hero's missiles a second, the casts beside a running one */
export interface RateRow {
  seconds: number;
  /** Casts a second, every skill and the weapon's attack together */
  casts: number;
  /** Casts a second by skill */
  bySkill: Record<string, number>;
  /** Skills cast at least once */
  distinct: number;
  /** Learned active skills (the rotation's) never cast */
  unused: string[];
  /** Hero's missiles a second (the visual effects that fly) */
  missiles: number;
  /** Casts beside a running one (rule `player.parallelCast`), a second */
  side: number;
  /** Most casts of one skill within any second */
  burst: number;
  /** Windows of 1 s where two different skills or more went off (share of the seconds) */
  overlap: number;
  /** Longest run of the same skill cast again and again with nothing else between (casts) */
  streak: number;
}

/**
 * Plays `seconds` of a run's zone already started (`g`, Act I's flow) in god mode with the mode's own control (`step` the game's step
 * with the autopilot; `walk`: the joystick held on a slow circle), and counts every cast of the hero (the cast events: what the player sees go off), by skill, a second
 */
export function playRate(g: Game, seconds: number, learned: string[], walk = false): RateRow {
  const w = () => g.world;
  w().godMode = true;
  const casts: { t: number; skill: string; side: boolean }[] = [];
  const missiles = new Set<number>();
  let step: string[] = [];
  const off = g.onEvent((e) => {
    if (e.t === 'cast' && e.id === w().player.id) step.push(e.skill);
  });
  const t0 = w().tick;
  for (let t = 0; t < seconds * TICK_HZ; t++) {
    // a cast beside a running one: the same cast goes on over the step (not the one that started in it)
    const before = w().player.cast;
    step = [];
    // walking: the joystick held on a slow circle (a player kiting the horde)
    if (walk) {
      w().input.moveX = Math.cos(t / 60);
      w().input.moveY = Math.sin(t / 60);
    }
    g.step(1);
    const kept = !!before && w().player.cast === before;
    for (const skill of step) casts.push({ t: w().tick, skill, side: kept && skill !== before.skill });
    for (const ms of w().missiles) if (ms.team === 0) missiles.add(ms.id);
    if (w().player.dead) w().player.dead = false;
  }
  off();
  const sec = (w().tick - t0) / TICK_HZ;
  const bySkill: Record<string, number> = {};
  for (const c of casts) bySkill[c.skill] = (bySkill[c.skill] ?? 0) + 1;
  for (const k of Object.keys(bySkill)) bySkill[k] = +(bySkill[k] / sec).toFixed(2);
  let burst = 0;
  let overlap = 0;
  for (let s = 0; s < Math.floor(sec); s++) {
    const inS = casts.filter((c) => c.t - t0 >= s * TICK_HZ && c.t - t0 < (s + 1) * TICK_HZ);
    const per: Record<string, number> = {};
    for (const c of inS) per[c.skill] = (per[c.skill] ?? 0) + 1;
    burst = Math.max(burst, ...Object.values(per), 0);
    if (Object.keys(per).length >= 2) overlap++;
  }
  let streak = 0;
  for (let i = 0, n = 0; i < casts.length; i++) {
    n = i && casts[i].skill === casts[i - 1].skill ? n + 1 : 1;
    streak = Math.max(streak, n);
  }
  return {
    seconds: +sec.toFixed(1),
    casts: +(casts.length / sec).toFixed(2),
    bySkill,
    distinct: Object.keys(bySkill).length,
    unused: learned.filter((id) => !bySkill[id]),
    missiles: +(missiles.size / sec).toFixed(1),
    side: +(casts.filter((c) => c.side).length / sec).toFixed(2),
    burst,
    overlap: +(overlap / Math.max(1, Math.floor(sec))).toFixed(2),
    streak,
  };
}

/** The hero at `level` with every active skill of his trees open at that level learned at `points` points (the rotation's skills) */
export function learnForRate(g: Game, level: number, points: number): void {
  const c = g.character;
  c.level = level;
  const trees = new Set<string>(CLASSES[c.classId as keyof typeof CLASSES].trees);
  c.skills = {};
  for (const s of REGISTRIES.skills.all()) if (trees.has(s.tree) && !s.passive && s.reqLvl <= level) c.skills[s.id] = points;
  g.offers.length = 0;
  g.world.refreshPlayer();
}
