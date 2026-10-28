/**
 * Director of a round: a target population of live monsters by time segment (the model of Dragon Ball Survivors), filled every half second
 * on a ring around the player, plus timed events (champions, encirclement, unique, mini-boss) and the recycling of monsters left far
 * behind. Monster scaling stays Diablo II's: the number of monsters, their ranks and +0 to +3 levels over the round rise, never their
 * life or damage tables (so experience and loot keep D2's level and treasure classes). Deterministic: seeded by the run. A boss round
 * plays guards, the act's elite waves (Mephisto's Council, the seals of the Chaos Sanctuary, Baal's minions), then the boss(es). Its state
 * is kept in the save (`snapshot` / `restore`): a round in progress is resumed when the app is opened again.
 */
import { gainXp, MONSTER_BY_ID, REGISTRIES, Rng, simHooks, SUPER_UNIQUE_DEFS, TICK_HZ, XP_TABLE, xpForKill, type Monster, type RunDirector, type RunState, type World } from '../../../src/mods/sdk';
import type { BossDef, Elite, RoundDef } from '../data/chapters';
import type { ArenaBox } from './arena';
import { breakBossImmunity, immuneCapOf, monsterImmune, speciesImmune, type Element, type Sunder } from './immunity';
import { questTcId, superUniqueTcId } from '../data/loot';
import { checkpointDone } from './checkpoints';
import { chestItem, dropReport, killHeal, type LootMarked } from './loot';
import { Pois, stripPois } from './poi';
import { exploreStep } from './fog';
import { forgeXp } from './forge';
import { chestGold } from './economy';
import { currentGame } from './state';
import { zonePool } from './zones';
import { edgeAt, onScreen } from './view';

export { zonePool };

/** A time segment: from `t0` to `t1` seconds the target goes from `from` to `to` live monsters, at `rate` spawns per second at most */
export interface Segment {
  t0: number;
  t1: number;
  from: number;
  to: number;
  rate: number;
  /** Monster levels above the zone's */
  lvl: number;
  /** The round's other zones join the pool */
  mix?: boolean;
}

/** Regular round: 9 minutes to the mini-boss (DESIGN §1.2) */
export const ROUND_SEGMENTS: Segment[] = [
  { t0: 0, t1: 3, from: 0, to: 0, rate: 0, lvl: 0 },
  { t0: 3, t1: 60, from: 12, to: 30, rate: 2, lvl: 0 },
  { t0: 60, t1: 150, from: 30, to: 50, rate: 3, lvl: 0 },
  { t0: 150, t1: 180, from: 50, to: 50, rate: 3, lvl: 0 },
  { t0: 180, t1: 300, from: 45, to: 45, rate: 3, lvl: 0 },
  { t0: 300, t1: 330, from: 25, to: 25, rate: 2, lvl: 0 },
  { t0: 330, t1: 450, from: 50, to: 80, rate: 5, lvl: 1, mix: true },
  { t0: 450, t1: 480, from: 80, to: 80, rate: 5, lvl: 1, mix: true },
  { t0: 480, t1: Infinity, from: 40, to: 40, rate: 3, lvl: 1, mix: true },
];
/** Boss round: guards, then the boss alone at 1:30 */
export const BOSS_SEGMENTS: Segment[] = bossSegments(90, 1);

/** Guards of a boss round until `until` seconds (the boss, or the first elite wave), `share` of the table (0: none) */
export function bossSegments(until: number, share: number): Segment[] {
  const n = (x: number) => Math.round(x * share);
  return [
    { t0: 0, t1: 3, from: 0, to: 0, rate: 0, lvl: 0 },
    { t0: 3, t1: Math.max(3, until), from: n(20), to: n(40), rate: share > 0 ? 3 : 0, lvl: 0, mix: true },
    { t0: Math.max(3, until), t1: Infinity, from: 0, to: 0, rate: 0, lvl: 0 },
  ];
}

/** Seconds between an elite wave killed and the next one (Baal's call), and between the last one and the boss */
export const WAVE_GAP = 4;
export const BOSS_AFTER_WAVES = 5;
/** An elite wave not killed after this long: the next one comes anyway (a monster stuck out of reach never blocks the round) */
export const WAVE_MAX = 180;

/** Leader and escort of an elite (super-unique or boss monster), resolved against the game's tables; null if unknown */
export function eliteSpec(e: Elite): { monster: string; uniqueName?: string; name?: string; escort: string; count: number } | null {
  const su = SUPER_UNIQUE_DEFS[e.ref];
  if (su && MONSTER_BY_ID[su.monster]) {
    // a boss species (Radament, Nihlathak) never escorts itself: only an escort given by the round
    const own = MONSTER_BY_ID[su.monster].boss ? 0 : su.grp[0];
    return { monster: su.monster, uniqueName: su.name, name: e.name, escort: e.escort?.[0] ?? su.monster, count: e.escort?.[1] ?? own };
  }
  if (MONSTER_BY_ID[e.ref]) return { monster: e.ref, name: e.name, escort: e.escort?.[0] ?? e.ref, count: e.escort?.[1] ?? 0 };
  return null;
}

/** Mini-bosses of a round (one, or several killed together) */
export const minibossesOf = (r: RoundDef): Elite[] => (!r.miniboss ? [] : Array.isArray(r.miniboss) ? r.miniboss : [r.miniboss]);
/** Elites met halfway through a round (`RoundDef.midboss`), in order */
export const midbossesOf = (r: RoundDef): Elite[] => (!r.midboss ? [] : Array.isArray(r.midboss) ? r.midboss : [r.midboss]);
/** Seconds between two elites met halfway through a round */
export const MIDBOSS_GAP = 45;

/** Seconds of the round's events */
export const EVENTS = {
  champions: 150,
  encircle: 180,
  unique: 270,
  lateChampions: [345, 400],
  miniboss: 480,
  boss: 90,
  /** Life of the monsters until then: ×0.7 (gentler first contact) */
  softUntil: 45,
};

/** Population target at `sec` seconds of a segment table (0 before the first) */
export function targetAt(segs: readonly Segment[], sec: number): { target: number; seg: Segment } {
  const seg = segs.find((s) => sec >= s.t0 && sec < s.t1) ?? segs[segs.length - 1];
  const span = seg.t1 - seg.t0;
  const k = Number.isFinite(span) && span > 0 ? (sec - seg.t0) / span : 0;
  return { target: Math.round(seg.from + (seg.to - seg.from) * k), seg };
}

/** Overtime after the checkpoint: the density rises without end (×(1 + 0.15 per minute), at most ×2), one champion pack every 45 s */
export function overtimeTarget(base: number, minutes: number): number {
  return Math.round(base * Math.min(2, 1 + 0.15 * minutes));
}

/** Spawns per half second: the missing monsters, at the segment's rate (doubled below half the target), 8 at most */
/** Lot 309: the field's packs (`ActFlow.packs`) */
export interface PackSpec {
  sizes: readonly (readonly [number, number])[];
  spread: number;
  wait: number;
  lead: number;
}

/** A pack's size drawn from `sizes` ([size, weight] pairs) */
export function drawPackSize(rng: { float(a: number, b: number): number }, sizes: PackSpec['sizes']): number {
  const total = sizes.reduce((a, [, wt]) => a + wt, 0);
  let r = rng.float(0, total);
  for (const [n, wt] of sizes) {
    r -= wt;
    if (r < 0) return n;
  }
  return sizes[sizes.length - 1][0];
}

/**
 * Lot 309: the points of a pack of `n` brought at `at` beyond the screen, the hero at (`hx`, `hy`): the pack's centre `spread` units
 * further out along the hero's ray, the first member on it, the others on a sunflower spiral within `spread` of it (no two on one spot)
 */
export function packPoints(rng: { float(a: number, b: number): number }, n: number, at: { x: number; y: number }, hx: number, hy: number, spread: number): { x: number; y: number }[] {
  const a = Math.atan2(at.y - hy, at.x - hx);
  const cx = at.x + Math.cos(a) * spread;
  const cy = at.y + Math.sin(a) * spread;
  const out = [{ x: cx, y: cy }];
  const turn = rng.float(0, Math.PI * 2);
  for (let i = 1; i < n; i++) {
    const r = spread * Math.sqrt(i / Math.max(1, n - 1));
    const b = turn + i * 2.39996;
    out.push({ x: cx + Math.cos(b) * r, y: cy + Math.sin(b) * r });
  }
  return out;
}

export function spawnBurst(missing: number, rate: number, alive: number, target: number): number {
  if (missing <= 0 || rate <= 0) return 0;
  return Math.max(1, Math.min(missing, Math.round(rate * 0.5 * (alive < target / 2 ? 2 : 1)), 8));
}

/** Settings read by the director: the population cap of the mode (`density`), the pressure of this round for this character */
export interface DirectorOpts {
  cap: number;
  /** Live cap now (adaptive density, sim/adaptive.ts: lower while the frames are slow); none: `cap` */
  liveCap?: () => number;
  /** Share of the target table (0.2 to 1): see `pressureOf` */
  pressure: number;
  /** Deaths already suffered in this round (not cleared yet): they weaken its monsters and bosses, see `mercyOf` */
  deaths?: number;
  /**
   * Elements of the character's attacks (`attackElements`): live monsters immune to all of them stay under `IMMUNE_CAP` of the target, and
   * the checkpoint bosses lose such an immunity (immunity.ts). None: no limit (tests, tools)
   */
  elements?: readonly Element[];
  /** Pace of a regular round's timeline in place of the deaths' (`paceOf`): the Run mode's shorter zones (lot 289) */
  pace?: number;
  /** Line told when the hero dies (none: the Campaign's "round lost, it starts again from the waypoint") */
  deathText?: string;
  /**
   * Easing of the monsters in place of the deaths' (`mercyOf`), told to nobody: the Run mode's, a run having no second try (lot 289): damage
   * factor of every monster, life factor of the bosses and elite packs, resistance points they lose
   */
  mercy?: { dmg: number; bossLife: number; res: number; eliteDmg?: number };
  /** Share of the life and mana a kill gives back (none: `LOOT.heal`) */
  heal?: number;
  /** Live archers and casters at most, share of the target (none: `RANGED_CAP`) */
  rangedCap?: number;
  /** Share of the life and mana given back every second (none: 0; the Run mode's, a run having no potion nor town) */
  regen?: number;
  /**
   * Experience of a kill, times the base's (none: 1, Diablo II's): the Run mode's, a hero starting again at level 1 each run (lot 289);
   * the level is the run's, never kept, so the shared stash and the content rulesets see no difference
   */
  xp?: number;
  /** The elites met halfway after the first one (Coldcrow, the Cow King…) and the late champion packs: false leaves them out (the Run mode's shorter zones) */
  extraElites?: boolean;
  /** The act played as one timed flow (lot 291, the Run's Act I in Normal after the study of another survivors game): see `ActFlow` */
  flow?: ActFlow;
  /** Lot 307: the arena's points of interest in play (sim/poi.ts; the Run's); false: taken out of the world (the Campaign's rounds) */
  pois?: boolean;
}

/**
 * An act played as one timed flow (lot 291): each zone lasts `zoneEnd` seconds at most (its mini-boss killed earlier ends it sooner), the
 * population follows the act's clock (`target`: a gentle first minute, the full field from 2:00), only melee monsters before `meleeUntil`
 * (act seconds), the elites announced by name `warn` seconds ahead, the act's boss at `bossAt` seconds of its zone
 */
export interface ActFlow {
  /** Seconds of the act played before this zone */
  actSec0: number;
  zoneEnd: number;
  target: (actSec: number) => number;
  meleeUntil: number;
  warn: number;
  bossAt: number;
  /** Life of the monsters ×0.7 until this act second (in place of `EVENTS.softUntil`) */
  softUntil: number;
  /** Levels an elite's chest gives (lot 291: the other game's champion and unique chests, 1 to 3 levels): a unique, the zone's mini-boss */
  chest: { unique: number; miniboss: number };
  /** Elites' chests pay gold too (lot 292, economy.ts `ECON.chest`), and the act's boss */
  gold?: boolean;
  /** Life of the normal monsters and minions, factor (lot 292c: quick kills in a dense field) */
  normalLife?: number;
  /** Distance of the spawn ring (units; `RING` without) */
  ring?: number;
  /** Lot 301: the monsters brought just beyond the screen (sim/view.ts) instead of on the ring */
  offscreen?: boolean;
  /** Monsters brought a second at most (`spawnBurst`'s rate; the population table's without) */
  spawnRate?: number;
  /**
   * Lot 309 (owner: "the other game brings the monsters in small packs rather than at random all over"): the field brought in packs
   * (`FLOW.packs`): a pack's size drawn by weight (`sizes`), one species, around one point just beyond the screen's edge (members within
   * `spread` units of it, beyond the edge); a pack larger than the field's gap waits for it `wait` s at most; `lead`: share of the packs
   * led by one monster of another species of the zone
   */
  packs?: PackSpec;
  /** Monsters' damage and life grow by this share a minute of the act (lot 292c) */
  ramp?: {
    dmg: number;
    life: number;
    max?: number;
    from?: number;
    lifeAt?: readonly (readonly [number, number])[];
    dmgAt?: readonly (readonly [number, number])[];
    speedAt?: readonly (readonly [number, number])[];
    zoneLife?: number;
  };
  /**
   * The hero's level by the act's second (lot 294, the owner: levels as in the other game, level 2 at 0:13-0:30, 5 at 1:12-2:10, then one
   * every 30 to 60 s): a hero below it is given the experience to reach it (checked every second); `ahead` levels above it, a kill gives
   * Diablo II's experience only (no mode's share): the fast killers do not run away with the levels
   */
  level?: (actSec: number) => number;
  ahead?: number;
  /** A zone's population at most at its start, and more a second (lot 292c) */
  entry?: readonly [number, number];
  /** Seconds of the zone's events (null: none in this zone) */
  events: { champions: number | null; encircle: number | null; unique: number | null; miniboss: number };
  /**
   * Lot 300 (owner: "the bosses and mini-bosses are too weak"): the zone's mini-boss and the act's boss made the run's peaks of difficulty
   * (sim/runmode.ts `FLOW.boss`): their life and damage times these (on top of the run's easing), their whole escort, a call for
   * `call` monsters of their escort every `callEvery` s, and a fury under `enrage` of their life (damage ×`fury`, speed ×1.2)
   */
  boss?: { life: Record<string, number>; dmg: Record<string, number>; callEvery: number; call: number; enrage: number; fury: number };
}

/**
 * A round a player keeps losing gets easier (the first try is Diablo II's): for each death already suffered in it, every monster of the
 * round deals ×0.92 damage (5 % at least, after 36 deaths; 15 % before lot 282) and its bosses (mini-bosses, elite wave leaders, the act's
 * boss) have ×0.85 life (3 % at least, after 22 deaths; 10 % before lot 282), on top of the smaller population (`pressureOf`), the groups of the packs and the mini-bosses'
 * escort scaled by it (no longer half of them at least), fewer monsters born of others (`bornSlackOf`), a quicker timeline (`paceOf`)
 * and fewer elite events (`eventsOn`: no late champion packs after 6 deaths, no champion pack nor unique after 15; measured in lot 282:
 * Nightmare's champion packs of Act V killed a level-63 Barbarian 400 times in the Frigid Highlands, and one of level 31 without a weapon of
 * its class kept dying to the Council of Travincal at 15 % damage and 10 % life). Measured with the bots (lot 280): with the population
 * alone, a level-27 Barbarian died 7,900 times to Duriel in 30 h of play, a level-24 Sorceress 500 times, and characters of the base's bots kept
 * dying to the few ranged monsters left in the Jail, the Far Oasis or Kurast (hundreds of deaths, no progress).
 */
export const MERCY = { dmg: 0.92, dmgFloor: 0.05, bossLife: 0.85, bossLifeFloor: 0.03, lateChampionsAfter: 6, elitesAfter: 15, resPerDeath: 3 };

/**
 * Pace of a regular round lost again and again: its timeline (population table, champions, encirclement, unique, mini-boss) runs ×1/0.96
 * faster a death, 2.5 times at most (the mini-boss at 3:12 instead of 8:00). Measured (lot 282): a Barbarian of the base's bots, without
 * potions or a weapon of its class, died 287 times in Travincal around 4:30, worn down before the Council members came at 8:00 (only 14
 * damage in its last 3 seconds: the round's monsters were already at their floors)
 */
export const PACE = { perDeath: 0.96, floor: 0.4 };

export function paceOf(deaths: number): number {
  return Math.max(PACE.floor, PACE.perDeath ** Math.max(0, deaths));
}

/**
 * Mercy of a round lost `deaths` times: damage factor of its monsters, life factor of its bosses and elite packs, and the resistance points
 * its bosses and elite packs lose (`resPerDeath` a death, never below 0; lot 283: Mephisto's 75 % in Hell left an Amazon of level 54 with a
 * quarter of her lightning and poison, and Baal's 50 % halved a Barbarian's blows)
 */
export function mercyOf(deaths: number): { dmg: number; bossLife: number; res: number } {
  const n = Math.max(0, deaths);
  return { dmg: Math.max(MERCY.dmgFloor, MERCY.dmg ** n), bossLife: Math.max(MERCY.bossLifeFloor, MERCY.bossLife ** n), res: MERCY.resPerDeath * n };
}

/**
 * Pressure of a round: the share of the target table the director keeps, by the character's level against the round's recommended level
 * (25 % at that level, + 5 points a level above it, all of it 15 levels above) and the deaths already suffered in this round (×0.8
 * each), 10 % at least. Measured with the bots (lots 276-277): at the recommended level, Diablo II's monsters of Act I kill a character of
 * the base's bots in one to three minutes past 10 to 15 live monsters (casters of the Cold Plains), so the table of Dragon Ball Survivors
 * is reached only by a stronger character; the deaths ease a round a player keeps losing (his level, gear and checkpoints are kept).
 */
export const PRESSURE = { base: 0.25, perLevel: 0.05, mercy: 0.8, floor: 0.1 };

export function pressureOf(level: number, recLevel: number, deaths: number): number {
  return Math.max(PRESSURE.floor, Math.min(1, PRESSURE.base + PRESSURE.perLevel * (level - recLevel)) * PRESSURE.mercy ** deaths);
}

export interface DirectorState {
  /** Seconds since the round began */
  sec: number;
  target: number;
  alive: number;
  /** Checkpoint reached (mini-boss or boss killed) */
  checkpoint: boolean;
  /** Next announced event, and its time (seconds) */
  next: { what: string; at: number; name?: string } | null;
  spawned: number;
}

/** Share of the ranged monsters drawn that are kept (the others are drawn again, up to three times) */
export const RANGED_SHARE = 0.25;
/**
 * Live archers and casters at most: 30 % of the target (2 at least); beyond, the director draws another species or spawns nothing. Measured
 * (lot 280): Travincal's pool has casters only (cantors, ghoul lords), where three classes of bots died 400 to 700 times each, even with
 * the population at a tenth of the table and their damage cut to 30 %
 */
export const RANGED_CAP = 0.3;
export const RANGED_MIN = 2;
/** Archers and casters of an act's flow (lot 292b): share of the target, and at least */
export const FLOW_RANGED = { share: 0.1, min: 3 };

/** Live hostile archers and casters */
export function liveRanged(w: World): number {
  let n = 0;
  for (const m of w.monsters) if (!m.dead && m.team === 1 && !m.pet && !m.isSummon && isRanged(m.def.id)) n++;
  return n;
}

/** Archer or caster (keeps its distance and shoots) */
export function isRanged(id: string): boolean {
  const ai = MONSTER_BY_ID[id]?.ai;
  return ai === 'caster' || ai === 'ranged';
}

const RING = 14;
/** An act's encirclement (lot 292b): at least this many monsters, this far (units) */
export const ENCIRCLE = { min: 28, r: 9 };

/** Species whose bodies a live monster can raise ('*': any) */
function reviversOf(w: World): Set<string> {
  const out = new Set<string>();
  for (const m of w.monsters) if (!m.dead && m.team === 1) for (const a of m.def.attacks) if (a.kind === 'summon' && a.revive && a.summon) out.add(a.summon);
  return out;
}
const RECYCLE = 30;
/** Lot 307: units from the hero a boss of a boss round comes at most (the base's leash is 45) */
const BOSS_FAR = 30;
/** Lot 301: units beyond the screen's edge a monster is brought at most (`spawnPoint`), and left behind before it is brought back ahead */
const OFF_DEPTH = 1.5;
/** Lot 301: share of the spawns ahead of a moving hero when brought beyond the screen (lot 300: 40 %) */
const FLOW_AHEAD = 0.6;
const RECYCLE_OFF = 5;
/** Monsters born of others kept above the cap (see `trimBorn`) */
export const BORN_SLACK = 10;
export const BORN_SLACK_MIN = 2;

/**
 * Monsters born of others kept above the round's target, eased like the population by the deaths already suffered in the round (×0.8 a
 * death, 2 at least). Measured (lot 282): in the Plains of Despair in Nightmare, the flesh beasts of the flesh spawners (a dozen around the
 * character, 20 allowed) killed a level-65 Barbarian 792 times with the rest of the round already at its floor
 */
export function bornSlackOf(deaths: number): number {
  return Math.max(BORN_SLACK_MIN, Math.round(BORN_SLACK * PRESSURE.mercy ** Math.max(0, deaths)));
}

/** State of a director kept in the save (`SaveData.run.modState`), version 1; ticks are the world's (restored with it) */
export interface DirectorSnapshot {
  v: 1;
  start: number;
  nextBurst: number;
  fired: string[];
  spawned: number;
  checkpoint: boolean;
  checkpointSec: number;
  /** Next overtime champion pack (seconds), -1: none yet */
  overtimeChampions: number;
  bosses: number[];
  rng: { a: number; b: number; c: number; d: number };
  deathTold: boolean;
  /** Boss round: elite waves called, when the current one began and was killed, when the boss comes (-1: not yet) */
  wave: number;
  waveSec: number;
  waveIds: number[];
  waveKilled: number;
  bossAt: number;
  rerolls: { free: boolean; paid: number };
  /** Skills banished from the cards for the round (lot 288) */
  banished?: string[];
  /** Named elites out so far (mini-bosses, elites met halfway, leaders of the elite waves, bosses): HUD bars, loot told (lot 283) */
  elites?: number[];
}

/**
 * Species a round may bring: its pool and their sister species, its named elites (mini-bosses, the midway ones: their species and
 * escort; lot 300: Blood Raven, Rakanishu's Fallen, Griswold were drawn before their sheets were prepared), its boss and those fought with it
 */
export function roundSpecies(pool: readonly [string, number][], round: RoundDef): string[] {
  const out = new Set<string>();
  for (const [id] of pool) {
    out.add(id);
    for (const [alt] of MONSTER_BY_ID[id]?.alts ?? []) if (MONSTER_BY_ID[alt]) out.add(alt);
  }
  for (const e of [...minibossesOf(round), ...midbossesOf(round)]) {
    const spec = eliteSpec(e);
    for (const id of spec ? [spec.monster, spec.escort] : []) if (MONSTER_BY_ID[id]) out.add(id);
  }
  for (const id of [round.boss?.monster, ...(round.boss?.with ?? [])]) if (id && MONSTER_BY_ID[id]) out.add(id);
  return [...out];
}

export class Director implements RunDirector {
  rng: Rng;
  start: number;
  private nextBurst = 0;
  /** Lot 309: the next pack's size (drawn once, kept until it comes), the tick of the last pack */
  private nextPack = 0;
  private lastPack = 0;
  /** Packs brought (lot 309: their sizes, for the tools and tests) */
  packLog: number[] = [];
  private fired = new Set<string>();
  spawned = 0;
  checkpoint = false;
  /** Lot 300: the zone ended on its time, not on its mini-boss (sim/runmode.ts `zoneWait`) */
  endedByTime = false;
  checkpointSec = -1;
  private overtimeChampions = Infinity;
  /** Identifiers of the mini-boss(es) or boss(es) once they are out: the checkpoint is the death of the last one */
  bossIds: number[] = [];
  /** Named elites out so far (see `DirectorSnapshot.elites`) */
  eliteIds: number[] = [];
  private reach: Uint8Array;
  private pools: { main: [string, number][]; mixed: [string, number][] };
  readonly zoneLevel: number;
  readonly segments: readonly Segment[];
  /** Boss round: elite waves called so far, start (seconds) and leaders and escorts of the current one, time of the boss (-1: unknown) */
  wave = 0;
  private waveSec = -1;
  private waveIds: number[] = [];
  /** When the current elite wave was killed (seconds; -1: not yet) */
  private waveKilled = -1;
  bossAt = -1;
  /** Rerolls of the level-up cards in this round: the free one unused, paid ones made */
  rerolls = { free: true, paid: 0 };
  /** Skills banished from the level-up cards for the rest of the round (lot 288: `BANISHES` a round) */
  banished: string[] = [];
  private deathTold = false;
  /** First step done; state given back from the save (a resumed round is not a new attempt) */
  private begun = false;
  private restored = false;

  constructor(
    private readonly w: World,
    readonly run: RunState,
    readonly round: RoundDef,
    readonly box: ArenaBox,
    readonly opts: DirectorOpts,
    /** Called once when the checkpoint is reached */
    readonly onCheckpoint: (w: World) => void = () => undefined,
    /** Called once when the player dies in the round */
    readonly onDeath: (w: World) => void = () => undefined,
    /**
     * Called at the first step of a new attempt (`fresh`: not a round resumed from the save; the director's settings it returns replace
     * these, a previous attempt left being a round lost: see checkpoints.ts, `takeAbandoned`), then every 5 s of the round until the
     * checkpoint
     */
    readonly onAttempt: (w: World, sec: number, fresh: boolean) => Partial<DirectorOpts> | void = () => undefined,
  ) {
    this.rng = new Rng(`survivals:director:${round.id}:${w.seed}`);
    this.start = w.tick;
    this.zoneLevel = w.zoneLevel;
    const d = w.difficulty;
    const main = zonePool(round.zones[0], d);
    const mixed = round.zones.flatMap((z) => zonePool(z, d));
    this.pools = { main: main.length ? main : mixed, mixed: mixed.length ? mixed : main };
    // the species that may come (and their sister species), told to the renderer: their sheets load with the arena (lot 285: without
    // spawn entries the arena's monsters were drawn without a sheet, invisible, on a device with the Diablo II files)
    w.zone.monsterPool = roundSpecies(this.pools.mixed, round);
    this.reach = reachableCells(w, box);
    // lot 307: the points of interest (the Run's), else out of the world
    if (opts.pois) this.pois = new Pois(w, this.poiHost());
    else stripPois(w);
    const b = round.boss;
    this.segments = b ? bossSegments(b.waves?.length ? (b.wavesAt ?? 60) : (b.at ?? EVENTS.boss), b.guards ?? 1) : ROUND_SEGMENTS;
    if (b && !b.waves?.length) this.bossAt = opts.flow?.bossAt ?? b.at ?? EVENTS.boss;
  }

  /** Lot 307: the arena's points of interest in play (the Run's rounds; null in the Campaign's) */
  readonly pois: Pois | null = null;

  /** What the points of interest ask of the director: a champion pack at a point, a chest's item and gold, a banner */
  private poiHost() {
    return {
      packAt: (w: World, at: { x: number; y: number }, count: number) => {
        const sec = this.sec(w);
        const near = this.nearestReachable(w, at.x, at.y) ?? at;
        const p = this.pack(w, this.pickPack(w, false, sec), 'champion', count, sec, undefined, near, undefined, true);
        return p ? [p.leader.id, ...p.group.map((m) => m.id)] : [];
      },
      item: (w: World, q: 'magic' | 'rare') => chestItem(w, Math.max(1, this.zoneLevel + this.levelBonus(this.sec(w))), q),
      gold: (w: World, kind: 'unique' | 'miniboss') => (this.opts.flow?.gold ? chestGold(w, kind, currentGame()) : 0),
      announce: (w: World, text: string) => this.announce(w, text),
    };
  }

  /** Seconds of the act at `sec` seconds of this zone (its flow; the zone's own seconds without one) */
  actSec(sec: number): number {
    return (this.opts.flow?.actSec0 ?? 0) + sec;
  }

  /** The mini-boss (or first boss) of the round once it is out and alive */
  get boss(): Monster | null {
    return this.bossMonsters()[0] ?? null;
  }

  /** Mini-bosses or bosses of the round still alive */
  bossMonsters(): Monster[] {
    return this.w.monsters.filter((m) => !m.dead && this.bossIds.includes(m.id));
  }

  /** Named elites and bosses of the round alive, the round's bosses first (HUD bars) */
  namedMonsters(): Monster[] {
    const out = this.w.monsters.filter((m) => !m.dead && (this.bossIds.includes(m.id) || this.eliteIds.includes(m.id)));
    return out.sort((a, b) => Number(this.bossIds.includes(b.id)) - Number(this.bossIds.includes(a.id)));
  }

  snapshot(): DirectorSnapshot {
    return {
      v: 1,
      start: this.start,
      nextBurst: this.nextBurst,
      fired: [...this.fired],
      spawned: this.spawned,
      checkpoint: this.checkpoint,
      checkpointSec: this.checkpointSec,
      overtimeChampions: Number.isFinite(this.overtimeChampions) ? this.overtimeChampions : -1,
      bosses: [...this.bossIds],
      rng: this.rng.getState(),
      deathTold: this.deathTold,
      wave: this.wave,
      waveSec: this.waveSec,
      waveIds: [...this.waveIds],
      waveKilled: this.waveKilled,
      bossAt: this.bossAt,
      rerolls: { ...this.rerolls },
      banished: [...this.banished],
      elites: [...this.eliteIds],
    };
  }

  restore(state: unknown): void {
    const s = state as Partial<DirectorSnapshot> | null;
    if (!s || s.v !== 1) return;
    this.restored = true;
    const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is number => typeof i === 'number') : []);
    this.start = num(s.start, this.start);
    this.nextBurst = num(s.nextBurst, 0);
    this.fired = new Set(Array.isArray(s.fired) ? s.fired.filter((k): k is string => typeof k === 'string') : []);
    this.spawned = num(s.spawned, 0);
    this.checkpoint = s.checkpoint === true;
    this.checkpointSec = num(s.checkpointSec, -1);
    const ot = num(s.overtimeChampions, -1);
    this.overtimeChampions = ot < 0 ? Infinity : ot;
    this.bossIds = ids(s.bosses);
    this.eliteIds = ids(s.elites);
    if (s.rng && typeof s.rng === 'object') this.rng = Rng.fromState(s.rng);
    this.deathTold = s.deathTold === true;
    this.wave = num(s.wave, 0);
    this.waveSec = num(s.waveSec, -1);
    this.waveIds = ids(s.waveIds);
    this.waveKilled = num(s.waveKilled, -1);
    this.bossAt = num(s.bossAt, this.bossAt);
    if (s.rerolls && typeof s.rerolls === 'object') this.rerolls = { free: s.rerolls.free !== false, paid: num(s.rerolls.paid, 0) };
    this.banished = Array.isArray(s.banished) ? s.banished.filter((k): k is string => typeof k === 'string') : [];
    // the bosses keep their mark (`runBoss` is saved with the monsters): nothing else to do
  }

  /** Pace of a regular round's timeline (1; quicker in a round already lost: `paceOf`) */
  get pace(): number {
    return this.round.boss ? 1 : (this.opts.pace ?? paceOf(this.opts.deaths ?? 0));
  }

  /** Time of a regular round's event: its act flow's (lot 291; null: none in this zone), else `EVENTS`' at this round's pace */
  evt(k: 'champions' | 'encircle' | 'unique' | 'miniboss'): number {
    const f = this.opts.flow?.events;
    if (f && k in f) return f[k] ?? Infinity;
    return this.ev(EVENTS[k]);
  }

  /** Time of an event of a regular round at this round's pace */
  ev(t: number): number {
    return Math.round(t * this.pace);
  }

  /** Second of the population table at this round's pace */
  private segSec(sec: number): number {
    return this.checkpoint ? sec : sec / this.pace;
  }

  /** Seconds of the round */
  sec(w: World): number {
    return (w.tick - this.start) / TICK_HZ;
  }

  state(w: World): DirectorState {
    const sec = this.sec(w);
    return { sec, target: this.target(sec), alive: liveHostiles(w), checkpoint: this.checkpoint, next: this.nextEvent(sec), spawned: this.spawned };
  }

  /** Live monsters at most now: the density setting, lowered by the adaptive density */
  get cap(): number {
    return Math.min(this.opts.cap, this.opts.liveCap?.() ?? Infinity);
  }

  /** Population target now (cap of the mode included) */
  target(sec: number): number {
    if (this.checkpoint) {
      const after = sec - this.checkpointSec;
      if (after < 10) return 0;
      return Math.min(this.cap, Math.round(overtimeTarget(50, (after - 10) / 60) * this.opts.pressure));
    }
    const f = this.opts.flow;
    // lot 292c: each zone of the flow fills up over its first seconds (`entry`), never all at once around the hero as he arrives
    if (f) return Math.min(this.cap, Math.round(f.target(this.actSec(sec))), f.entry ? Math.round(f.entry[0] + f.entry[1] * sec) : Infinity);
    return Math.min(this.cap, Math.round(targetAt(this.segments, this.segSec(sec)).target * this.opts.pressure));
  }

  private levelBonus(sec: number): number {
    if (!this.checkpoint) return targetAt(this.segments, this.segSec(sec)).seg.lvl;
    const after = sec - this.checkpointSec;
    return after > 180 ? 3 : 2;
  }

  /**
   * Elite events of a regular round: all of them the first time; a round lost `lateChampionsAfter` times no longer has the two late
   * champion packs, one lost `elitesAfter` times neither the first pack nor the unique (the encirclement and the mini-boss stay)
   */
  eventsOn(): { champions: boolean; late: boolean; unique: boolean } {
    const n = this.opts.deaths ?? 0;
    // the Run mode's shorter zones: no late champion packs (`extraElites` false)
    return { champions: n < MERCY.elitesAfter, late: n < MERCY.lateChampionsAfter && this.opts.extraElites !== false, unique: n < MERCY.elitesAfter };
  }

  /** Next announced event (HUD) */
  nextEvent(sec: number): { what: string; at: number; name?: string } | null {
    if (this.checkpoint) return null;
    const b = this.round.boss;
    if (b) {
      if (this.bossAt >= 0) return this.bossIds.length ? null : { what: 'boss', at: this.bossAt };
      const first = b.wavesAt ?? 60;
      return this.wave === 0 && sec < first ? { what: 'wave', at: first } : null;
    }
    const on = this.eventsOn();
    const list: [string, number, string?][] = [
      ...(on.champions ? [['champions', this.evt('champions')] as [string, number]] : []),
      ['encircle', this.evt('encircle')],
      ...(on.unique ? [['unique', this.evt('unique'), this.eliteName(midbossesOf(this.round)[0])] as [string, number, string?]] : []),
      ...this.extraMidbosses().map(([e, t]): [string, number, string?] => ['unique', this.ev(t), this.eliteName(e)]),
      ...(on.late ? EVENTS.lateChampions.map((t, i): [string, number] => [`champions${i + 2}`, this.ev(t)]) : []),
      [
        'miniboss',
        this.evt('miniboss'),
        minibossesOf(this.round)
          .map((e) => this.eliteName(e))
          .filter(Boolean)
          .join(', ') || undefined,
      ],
    ];
    list.sort((a, b) => a[1] - b[1]);
    const n = list.find(([, at]) => at > sec && Number.isFinite(at));
    return n ? { what: n[0].replace(/\d+$/, ''), at: n[1], ...(n[2] ? { name: n[2] } : {}) } : null;
  }

  /** Elites met halfway after the first one, with their time (none after `MERCY.lateChampionsAfter` deaths in the round) */
  extraMidbosses(): [Elite, number][] {
    if (!this.eventsOn().late) return [];
    return midbossesOf(this.round)
      .slice(1)
      .map((e, i): [Elite, number] => [e, EVENTS.unique + MIDBOSS_GAP * (i + 1)]);
  }

  /** Name shown of an elite (the round's, else its super-unique's) */
  eliteName(e: Elite | undefined): string | undefined {
    if (!e) return undefined;
    const spec = eliteSpec(e);
    return spec?.name ?? spec?.uniqueName;
  }

  tick(w: World): void {
    const sec = this.sec(w);
    this.nowSec = sec;
    if (!this.begun) {
      this.begun = true;
      const o = this.onAttempt(w, sec, !this.restored);
      if (o && !this.restored) Object.assign(this.opts, o);
      // the round's banner at its start (lot 288): the act and the zone, in the middle of the screen
      if (!this.restored) this.announce(w, `Acte ${this.round.act} — ${this.round.name}`);
    } else if (!this.checkpoint && !w.player.dead && w.tick % (5 * TICK_HZ) === 0) this.onAttempt(w, sec, false);
    if (w.player.dead) {
      // the round is lost (`RunDef.abandonOnDeath`): no portal back to the horde
      if (!this.deathTold) {
        w.events.push({ t: 'message', text: this.opts.deathText ?? 'Manche perdue : elle reprend au début, depuis le point de passage.', color: '#e06a6a' });
        this.onDeath(w);
      }
      this.deathTold = true;
      return;
    }
    this.timeline(w, sec);
    this.trimBorn(w, sec);
    // lot 307: the arena explored around the hero (the automap's fog), the points of interest found and used by walking over them
    exploreStep(w, this.box);
    this.pois?.tick(w);
    if ((this.opts.deaths ?? 0) > 0 || this.opts.mercy) for (const m of w.monsters) if (!m.dead) this.ease(m);
    if (w.tick >= this.nextBurst) {
      this.nextBurst = w.tick + TICK_HZ / 2;
      this.fill(w, sec);
      this.recycle(w);
    }
    if (w.tick % TICK_HZ === 0) this.bringBosses(w);
    if (w.tick % TICK_HZ === 0) this.bossPowers(w, sec);
    if (this.opts.regen && w.tick % TICK_HZ === 0) killHeal(w, this.opts.regen);
    // an act's flow (lot 294): the hero's level kept up with the act's clock
    const lf = this.opts.flow?.level;
    if (lf && w.tick % TICK_HZ === 0 && !w.player.dead) {
      const want = Math.min(XP_TABLE.length, Math.floor(lf(this.actSec(sec))));
      const c = w.character;
      if (c.level < want) gainXp(w, Math.max(0, (XP_TABLE[want - 1] ?? c.xp) - c.xp));
    }
    // bodies leave after 3 s (the base keeps them 12 s): fewer views to draw at 100 kills a minute
    // lot 292b: a body a live monster can raise (the Fallen Shamans' resurrection) stays its 10 s
    if (w.tick % TICK_HZ === 0) {
      const raisable = reviversOf(w);
      w.monsters = w.monsters.filter((m) => !m.dead || m.pet || m.isSummon || w.tick - m.deathTick < (raisable.has(m.def.id) || raisable.has('*') ? 10 : 3) * TICK_HZ);
    }
  }

  onKill(w: World, m: Monster): void {
    // the mode has no potion: a kill gives back a little life and mana (loot.ts)
    if (m.team === 1 && !m.pet && !m.isSummon) killHeal(w, this.opts.heal);
    // the Run mode's experience: the share above Diablo II's, given on top of the base's
    const lf = this.opts.flow?.level;
    const ahead = !!lf && w.character.level >= Math.floor(lf(this.actSec(this.sec(w)))) + (this.opts.flow?.ahead ?? Infinity);
    // lot 308: the training's experience (sim/forge.ts, a Run's), on the whole kill's
    const xpK = (this.opts.xp ?? 1) * forgeXp(w.character);
    if (xpK > 1 && !ahead && m.team === 1 && !m.pet && !m.isSummon && !w.player.dead) gainXp(w, Math.floor(xpForKill(w, m) * (xpK - 1)));
    // an act's flow (lot 291): an elite's chest, levels at once (a unique, the zone's mini-boss)
    const f = this.opts.flow;
    if (f && m.team === 1 && !w.player.dead && !this.checkpoint) {
      const mini = this.bossIds.includes(m.id) && !this.round.boss;
      const n = mini ? f.chest.miniboss : m.rank === 'unique' ? f.chest.unique : 0;
      // lot 292: the chest's gold too (economy.ts), and the act boss's
      const gold = f.gold && (mini ? chestGold(w, 'miniboss', currentGame()) : m.rank === 'unique' ? chestGold(w, 'unique', currentGame()) : 0);
      if (n > 0) this.chest(w, n, gold || 0);
      if (f.gold && this.round.boss && this.bossIds.includes(m.id) && !w.monsters.some((o) => o !== m && !o.dead && this.bossIds.includes(o.id)))
        this.announce(w, `Coffre de ${m.name} : +${chestGold(w, 'boss', currentGame())} or`);
    }
    // what a boss, a named elite, a unique or a champion dropped (loot.ts)
    if (m.rank !== 'normal' && m.rank !== 'minion') dropReport(w, m, this.eliteIds.includes(m.id) || this.bossIds.includes(m.id));
    if (this.checkpoint || !this.bossIds.includes(m.id)) return;
    // the last of the round's bosses (the three Ancients, the Council of Travincal)
    if (w.monsters.some((o) => o !== m && !o.dead && this.bossIds.includes(o.id))) return;
    this.checkpoint = true;
    this.checkpointSec = this.sec(w);
    this.overtimeChampions = this.checkpointSec + 55;
    this.onCheckpoint(w);
  }

  /** The powers of the bosses of an act's flow (lot 300): by boss id, its kind, escort species, the second it came, its last call, its fury */
  private powers = new Map<number, { kind: string; escort: string; at: number; called: number; fury: boolean }>();

  /** A zone's mini-boss or the act's boss of an act's flow made stronger (`ActFlow.boss`), once */
  private empower(m: Monster, kind: 'miniboss' | 'boss', escort: string, sec: number): void {
    const b = this.opts.flow?.boss;
    const mm = m as Monster & { svPower?: number };
    if (!b || mm.svPower) return;
    const life = b.life[kind] ?? 1;
    const dmg = b.dmg[kind] ?? 1;
    mm.svPower = life;
    m.hpMax = Math.max(1, Math.round(m.hpMax * life));
    m.hp = m.hpMax;
    if (m.regen) m.regen *= life;
    m.dmgMin *= dmg;
    m.dmgMax *= dmg;
    this.powers.set(m.id, { kind, escort: MONSTER_BY_ID[escort] ? escort : m.def.id, at: sec, called: sec, fury: false });
  }

  /** Every second: a living boss of the flow calls its escort every `callEvery` s, and falls into a fury under `enrage` of its life */
  private bossPowers(w: World, sec: number): void {
    const b = this.opts.flow?.boss;
    if (!b || !this.powers.size || w.player.dead) return;
    for (const [id, st] of this.powers) {
      const m = w.monsters.find((x) => x.id === id);
      if (!m || m.dead) {
        this.powers.delete(id);
        continue;
      }
      if (b.call > 0 && sec - st.called >= b.callEvery) {
        st.called = sec;
        let n = 0;
        for (let i = 0; i < b.call; i++) {
          const a = this.rng.float(0, Math.PI * 2);
          // lot 301: beside the boss when it is off the screen, else just beyond the screen's edge on its side
          const p = w.player;
          const near = this.nearestReachable(w, m.x + Math.cos(a) * 2, m.y + Math.sin(a) * 2);
          const at = near && !onScreen(near.x - p.x, near.y - p.y) ? near : (this.spawnPoint(w, 10, 12, Math.atan2(m.y - p.y, m.x - p.x)) ?? near);
          if (at && this.spawn(w, st.escort, at.x, at.y, { rank: 'minion', leader: m.id, inheritMods: m.mods }, sec)) n++;
        }
        if (n) this.announce(w, `${m.name} appelle des renforts !`);
      }
      if (!st.fury && m.hp < m.hpMax * b.enrage) {
        st.fury = true;
        m.dmgMin *= b.fury;
        m.dmgMax *= b.fury;
        m.speed *= 1.2;
        this.announce(w, `${m.name} entre en furie !`);
      }
    }
  }

  /** An elite's chest (lot 291): the experience of `levels` levels at once (the cards follow, one a level), told in the middle */
  private chest(w: World, levels: number, gold = 0): void {
    const c = w.character;
    const to = Math.min(XP_TABLE.length, c.level + levels);
    const need = (XP_TABLE[to - 1] ?? c.xp) - c.xp;
    const or = gold > 0 ? `+${gold} or` : null;
    if (need <= 0) {
      if (gold > 0) this.announce(w, `Coffre d’élite : +${gold} or`);
      return;
    }
    gainXp(w, need);
    this.announce(w, [levels > 1 ? `Coffre d’élite : +${levels} niveaux` : 'Coffre d’élite : +1 niveau', or].filter(Boolean).join(' · '));
  }

  /**
   * The zone's time is up in an act's flow (lot 291): the zone ends as if its mini-boss were killed (the next zone comes, the run's
   * `nextAfter` later); the elites still alive stay behind
   */
  private endZone(w: World, sec: number): void {
    // lot 300: the next zone after `RUN.nextAfter` (no boss's loot to pick up: the countdown is for a mini-boss killed)
    this.endedByTime = true;
    this.checkpoint = true;
    this.checkpointSec = sec;
    this.overtimeChampions = Infinity;
    this.onCheckpoint(w);
    const run = w.run;
    if (run && !run.completed) {
      run.completed = true;
      run.completeTick = w.tick;
    }
  }

  private once(key: string, at: number, sec: number, f: () => void): void {
    if (sec >= at && !this.fired.has(key)) {
      this.fired.add(key);
      f();
    }
  }

  private announce(w: World, text: string): void {
    w.events.push({ t: 'mapEvent', text });
  }

  private timeline(w: World, sec: number): void {
    if (this.checkpoint) {
      // overtime: a champion pack every 45 s
      if (sec >= this.overtimeChampions) {
        this.overtimeChampions = sec + 45;
        this.champions(w, sec);
      }
      return;
    }
    if (this.round.boss) {
      // an act's flow (lot 292c): the lair's three minutes before its boss bring champions and an encirclement too
      const fl = this.opts.flow;
      if (fl && this.bossAt > 0) {
        this.once('ch-warn', fl.events.champions !== null ? fl.events.champions - 2 : Infinity, sec, () => this.announce(w, 'Des champions approchent !'));
        this.once('ch', fl.events.champions ?? Infinity, sec, () => this.champions(w, sec));
        this.once('enc-warn', fl.events.encircle !== null ? fl.events.encircle - 3 : Infinity, sec, () => this.announce(w, 'Encerclement !'));
        this.once('enc', fl.events.encircle ?? Infinity, sec, () => this.encircle(w, sec));
      }
      this.bossTimeline(w, sec, this.round.boss);
      return;
    }
    const f = this.opts.flow;
    if (f && sec >= f.zoneEnd) {
      this.endZone(w, sec);
      return;
    }
    const ev = this.eventsOn();
    if (f) {
      // the elites announced by name a little ahead (lot 291: "X approaches", 2.5 s)
      const uni = this.eliteName(midbossesOf(this.round)[0]);
      if (ev.unique && uni) this.once('uni-warn', this.evt('unique') - f.warn, sec, () => this.announce(w, `${uni} approche…`));
      const mb = minibossesOf(this.round)
        .map((e) => this.eliteName(e))
        .filter(Boolean)
        .join(', ');
      this.once('mb-warn', this.evt('miniboss') - f.warn, sec, () => this.announce(w, mb ? `${mb} approche…` : 'Un monstre redoutable approche…'));
    }
    if (ev.champions) {
      this.once('ch-warn', this.evt('champions') - 2, sec, () => this.announce(w, 'Des champions approchent !'));
      this.once('ch', this.evt('champions'), sec, () => this.champions(w, sec));
    }
    this.once('enc-warn', this.evt('encircle') - 3, sec, () => this.announce(w, 'Encerclement !'));
    this.once('enc', this.evt('encircle'), sec, () => this.encircle(w, sec));
    if (ev.unique) this.once('uni', this.evt('unique'), sec, () => this.unique(w, sec));
    for (const [e, t] of this.extraMidbosses()) {
      const key = `uni:${e.ref}`;
      this.once(`${key}-warn`, this.ev(t) - 3, sec, () => this.announce(w, `${this.eliteName(e) ?? ''} approche…`));
      this.once(key, this.ev(t), sec, () => {
        this.elitePack(w, e, sec, this.spawnPoint(w, RING - 2, RING + 2), false);
      });
    }
    if (ev.late) for (const t of EVENTS.lateChampions) this.once(`ch:${t}`, this.ev(t), sec, () => this.champions(w, sec));
    if (!f) this.once('mb-warn', this.evt('miniboss') - 5, sec, () => this.announce(w, 'Un monstre redoutable approche…'));
    this.once('mb', this.evt('miniboss'), sec, () => this.spawnMiniboss(w, sec));
  }

  /**
   * Boss round: the elite waves one after the other (the first at `wavesAt`, each next one `WAVE_GAP` s after the previous one is killed,
   * or after `WAVE_MAX` s), then the boss `BOSS_AFTER_WAVES` s after the last one; without waves, the boss at its time
   */
  private bossTimeline(w: World, sec: number, b: BossDef): void {
    const waves = b.waves ?? [];
    if (waves.length && this.bossAt < 0) {
      const first = b.wavesAt ?? 60;
      if (this.wave === 0) {
        this.once('wave-warn', first - 3, sec, () => this.announce(w, 'Une vague d’élite approche…'));
        if (sec >= first) this.callWave(w, sec, waves);
        return;
      }
      if (this.waveKilled < 0 && !this.waveIds.some((id) => w.monsters.some((m) => m.id === id && !m.dead))) this.waveKilled = sec;
      const late = sec - this.waveSec > WAVE_MAX;
      if (late && this.waveKilled < 0) this.withdrawWave(w);
      if (this.wave >= waves.length) {
        // the last wave killed: the boss comes
        if (this.waveKilled >= 0 || late) this.bossAt = (this.waveKilled >= 0 ? this.waveKilled : sec) + BOSS_AFTER_WAVES;
        return;
      }
      if ((this.waveKilled >= 0 && sec >= this.waveKilled + WAVE_GAP) || late) this.callWave(w, sec, waves);
      return;
    }
    if (this.bossAt < 0) return;
    this.once('boss-warn', this.bossAt - (this.opts.flow?.warn ?? 5), sec, () => this.announce(w, b.warn ?? 'Le maître des lieux arrive…'));
    this.once('boss', this.bossAt, sec, () => this.spawnBoss(w, sec, b));
  }

  /**
   * An elite wave not killed after `WAVE_MAX` s in a round already lost: its survivors withdraw (they leave the arena without loot), so
   * that the next wave or the boss is not fought with them. Measured (lot 283): in Hell, Baal's waves called late piled up around a
   * Barbarian of level 63 (wave 3's council members still there when Lister came), and Mephisto's Council held an Amazon of level 53
   */
  private withdrawWave(w: World): void {
    if ((this.opts.deaths ?? 0) <= 0) return;
    const ids = new Set(this.waveIds);
    const before = w.monsters.length;
    w.monsters = w.monsters.filter((m) => m.dead || !ids.has(m.id));
    if (w.monsters.length < before) this.announce(w, 'La vague d’élite se retire');
  }

  /** Next elite wave: its packs around the player */
  private callWave(w: World, sec: number, waves: Elite[][]): void {
    const packs = waves[this.wave];
    this.wave++;
    this.waveSec = sec;
    this.waveKilled = -1;
    this.waveIds = [];
    this.announce(w, `Vague d’élite ${this.wave} / ${waves.length}`);
    for (const e of packs) {
      const ids = this.elitePack(w, e, sec, this.spawnPoint(w, 9, 13), false);
      this.waveIds.push(...ids);
    }
  }

  /** Completes the population up to the target */
  private fill(w: World, sec: number): void {
    const target = this.target(sec);
    const alive = liveHostiles(w);
    const seg = targetAt(this.segments, this.segSec(sec)).seg;
    // an act's flow (lot 292c): the field refills as quickly as it falls
    const rate = this.checkpoint ? 4 : (this.opts.flow?.spawnRate ?? seg.rate);
    const n = spawnBurst(target - alive, rate, alive, target);
    let ranged = n > 0 ? liveRanged(w) : 0;
    // lot 292b (owner: "the ranged monsters never shoot, I never see the red Shamans"): in an act's flow a quarter of the field at most,
    // three at least once its melee start is over
    const rangedCap = this.opts.flow ? Math.max(FLOW_RANGED.min, Math.round(target * FLOW_RANGED.share)) : Math.max(RANGED_MIN, Math.round(target * (this.opts.rangedCap ?? RANGED_CAP)));
    const els = this.opts.elements ?? [];
    let immune = n > 0 && els.length ? this.liveImmune(w) : 0;
    const immuneCap = immuneCapOf(target);
    // enough archers and casters alive (a pool of casters only: Travincal), or enough monsters immune to the build (a species seen immune
    // in this round): another species
    // an act's flow (lot 291): melee monsters only in its first seconds
    const meleeOnly = !!this.opts.flow && this.actSec(sec) < this.opts.flow.meleeUntil;
    const unwanted = (id: string) => ((meleeOnly || ranged >= rangedCap) && isRanged(id)) || (immune >= immuneCap && this.immuneSeen.get(id) === true);
    const packs = this.opts.flow?.packs;
    if (packs && n > 0) {
      // lot 309: whole packs while the burst's share lasts (the last one finished), each waiting for a gap of half its size or `wait` s
      let left = n;
      let missing = target - alive;
      while (left > 0 && missing > 0) {
        // a pack never more than half the field wanted (two packs at least around the hero: a thin field never all in one group)
        const size = Math.min((this.nextPack ||= drawPackSize(this.rng, packs.sizes)), Math.max(2, Math.ceil(target / 2)));
        if (missing < Math.ceil(size / 2) && w.tick - this.lastPack < packs.wait * TICK_HZ) break;
        const ring = this.opts.flow?.ring ?? RING;
        const at = this.spawnPoint(w, ring, ring + 3);
        if (!at) break;
        let id = this.pick(seg.mix || this.checkpoint);
        for (let k = 0; k < 6 && unwanted(id); k++) id = this.pickOne(seg.mix || this.checkpoint);
        if (unwanted(id)) break;
        // a pack of archers or casters within the field's share of them
        const count = isRanged(id) ? Math.max(1, Math.min(size, rangedCap - ranged)) : size;
        let lead: string | null = null;
        if (count > 1 && this.rng.float(0, 1) < packs.lead) {
          const x = this.pickOne(seg.mix || this.checkpoint);
          if (x !== id && !unwanted(x)) lead = x;
        }
        const p = w.player;
        const pts = packPoints(this.rng, count, at, p.x, p.y, packs.spread);
        let made = 0;
        for (let i = 0; i < pts.length; i++) {
          const q = this.inside(pts[i].x, pts[i].y) && this.reachableAt(w, pts[i].x, pts[i].y) ? this.offScreen(w, pts[i].x, pts[i].y) : at;
          const sp = i === 0 && lead ? lead : id;
          const m = this.spawn(w, sp, q.x, q.y, { rank: 'normal' }, sec);
          if (!m) continue;
          if (els.length) {
            const imm = monsterImmune(m, els, this.sunder());
            this.immuneSeen.set(sp, imm);
            if (imm && immune >= immuneCap) {
              w.monsters.splice(w.monsters.indexOf(m), 1);
              continue;
            }
            if (imm) immune++;
          }
          if (isRanged(sp)) ranged++;
          made++;
        }
        this.packLog.push(made);
        this.nextPack = 0;
        this.lastPack = w.tick;
        left -= Math.max(1, made);
        missing -= Math.max(1, made);
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      const ring = this.opts.flow?.ring ?? RING;
      const at = this.spawnPoint(w, ring, ring + 3);
      if (!at) break;
      let id = this.pick(seg.mix || this.checkpoint);
      for (let k = 0; k < 6 && unwanted(id); k++) id = this.pickOne(seg.mix || this.checkpoint);
      // none found: no spawn this time
      if (unwanted(id)) continue;
      const m = this.spawn(w, id, at.x, at.y, { rank: 'normal' }, sec);
      if (!m) continue;
      if (els.length) {
        // D2 draws a species' resistance variant once for the round's monsters: what this one has, the next ones of its species have
        const imm = monsterImmune(m, els, this.sunder());
        this.immuneSeen.set(id, imm);
        if (imm && immune >= immuneCap) {
          // one immune too many: not kept (never drawn), another species next time
          w.monsters.splice(w.monsters.indexOf(m), 1);
          continue;
        }
        if (imm) immune++;
      }
      if (isRanged(id)) ranged++;
    }
  }

  /**
   * Monster of the pool; a ranged one (archers, casters) is kept only 25 % of the time: in an open arena they shoot from every side of the
   * ring, which the bots measured as the cause of nearly every death from the Cold Plains on (lots 276-277)
   */
  private pick(mixed: boolean | undefined): string {
    let id = this.pickOne(mixed);
    for (let i = 0; i < 3 && isRanged(id) && this.rng.float(0, 1) >= RANGED_SHARE; i++) id = this.pickOne(mixed);
    return id;
  }

  /** Live hostile monsters immune to every element of the character's attacks */
  liveImmune(w: World): number {
    const els = this.opts.elements ?? [];
    if (!els.length) return 0;
    let n = 0;
    for (const m of w.monsters) if (!m.dead && m.team === 1 && !m.pet && !m.isSummon && monsterImmune(m, els, this.sunder())) n++;
    return n;
  }

  /**
   * Species of a pack or of the encirclement: as `pick`, drawn again (up to 6 times) while the live monsters immune to the build are at
   * their cap (`IMMUNE_CAP`): species seen immune in this round, or that may be (their D2 resistances or one of their variants)
   */
  private pickPack(w: World, mixed: boolean | undefined, sec: number): string {
    let id = this.pick(mixed);
    const els = this.opts.elements ?? [];
    const immune = (x: string) => this.immuneSeen.get(x) ?? speciesImmune(x, els, w.difficulty, this.sunder());
    if (!els.length || !immune(id) || this.liveImmune(w) < immuneCapOf(this.target(sec))) return id;
    for (let k = 0; k < 6 && immune(id); k++) id = this.pickOne(mixed);
    return id;
  }

  /** Species seen immune (or not) to the character's elements in this round (D2 draws a species' resistance variant once for the round) */
  private immuneSeen = new Map<string, boolean>();

  /** The character's immunity breakers (pd2's sunder charms): a monster they break is not immune to the build */
  private sunder(): Sunder | undefined {
    return this.w.player?.d?.sunder;
  }

  /** Monster drawn from the pool (Levels.txt weights), then one of its sister species as the zones do (`MonsterDef.alts`) */
  private pickOne(mixed: boolean | undefined): string {
    const pool = mixed ? this.pools.mixed : this.pools.main;
    if (!pool.length) return 'zombie';
    const total = pool.reduce((s, [, wt]) => s + wt, 0);
    let r = this.rng.float(0, total);
    let id = pool[pool.length - 1][0];
    for (const [x, wt] of pool) {
      r -= wt;
      if (r < 0) {
        id = x;
        break;
      }
    }
    const alts = MONSTER_BY_ID[id]?.alts;
    if (!alts?.length) return id;
    let a = this.rng.float(0, 1 + alts.reduce((s, [, wt]) => s + wt, 0)) - 1;
    if (a < 0) return id;
    for (const [alt, wt] of alts) {
      a -= wt;
      if (a < 0) return MONSTER_BY_ID[alt] ? alt : id;
    }
    return id;
  }

  /**
   * One monster at the round's level (+ the segment's bonus), aggressive at once; its life is softened in the first 45 s. Returns null if
   * no free spot was found.
   */
  private spawn(
    w: World,
    id: string,
    x: number,
    y: number,
    opts: { rank: 'normal' | 'champion' | 'unique' | 'minion' | 'boss'; uniqueName?: string; leader?: number; inheritMods?: string[] },
    sec: number,
  ): Monster | null {
    const bonus = this.levelBonus(sec);
    // the base computes a monster's level from the world's zone level: raised for the time of the spawn only
    const ww = w as { zoneLevel: number };
    ww.zoneLevel = this.zoneLevel + bonus;
    let m: Monster | null;
    try {
      m = simHooks.spawnMonster(w, id, x, y, opts, `surv:${this.spawned}`);
    } finally {
      ww.zoneLevel = this.zoneLevel;
    }
    if (!m) return null;
    this.spawned++;
    m.aggro = true;
    this.ease(m);
    if ((this.opts.flow ? this.actSec(sec) < this.opts.flow.softUntil : sec < EVENTS.softUntil) && m.rank === 'normal') {
      m.hpMax = Math.max(1, Math.round(m.hpMax * 0.7));
      m.hp = Math.min(m.hp, m.hpMax);
    }
    // an act's flow (lot 292c): the fodder falls quickly (a dense field, 4 to 5 kills a second in the thick of it), every monster's life
    // grows with the act's clock (`ramp`)
    const nl = (this.opts.flow?.normalLife ?? 1) * this.ramp('life');
    const fodder = m.rank === 'normal' || m.rank === 'minion';
    const lf = fodder ? nl : this.ramp('life');
    if (lf !== 1) {
      m.hpMax = Math.max(1, Math.round(m.hpMax * lf));
      m.hp = Math.min(m.hp, m.hpMax);
    }
    // lot 302: the monsters walk quicker as the act goes on (`ramp.speedAt`): a hero who keeps his distance is caught up with in time
    const sp = this.opts.flow?.ramp?.speedAt;
    if (sp?.length) m.speed *= lerpAt(sp, this.actSec(sec));
    return m;
  }

  /**
   * A pack: leader then its group (champions: 3 or 4 of the same; unique: minions sharing its modifiers, of its species or the escort's)
   */
  private pack(
    w: World,
    id: string,
    rank: 'champion' | 'unique',
    count: number,
    sec: number,
    uniqueName?: string,
    at = this.spawnPoint(w, RING - 2, RING + 2),
    escort = id,
    /** Lot 307: the group around its leader even on the screen (a cursed chest's, a lair's pack) */
    here = false,
  ): { leader: Monster; group: Monster[] } | null {
    if (!at) return null;
    const leader = this.spawn(w, id, at.x, at.y, { rank, uniqueName }, sec);
    if (!leader) return null;
    const els = this.opts.elements ?? [];
    const group: Monster[] = [];
    for (let i = 0; i < count; i++) {
      const a = this.rng.float(0, Math.PI * 2);
      const r = this.rng.float(0.8, 2.5);
      const e = here ? (this.nearestReachable(w, at.x + Math.cos(a) * r, at.y + Math.sin(a) * r) ?? at) : this.offScreen(w, at.x + Math.cos(a) * r, at.y + Math.sin(a) * r);
      const m = this.spawn(w, escort, e.x, e.y, { rank: rank === 'unique' ? 'minion' : 'champion', leader: leader.id, inheritMods: leader.mods }, sec);
      if (!m) continue;
      // an escort immune to the build beyond the round's cap of immunes is not kept (never drawn), as the population's (`fill`)
      if (els.length && monsterImmune(m, els, this.sunder()) && this.liveImmune(w) > immuneCapOf(this.target(sec))) {
        w.monsters.splice(w.monsters.indexOf(m), 1);
        continue;
      }
      group.push(m);
    }
    // a round already lost: the whole pack has less life, as its leader (`weaken`)
    if (this.eased) for (const m of [leader, ...group]) this.weaken(m);
    return { leader, group };
  }

  /** An elite (super-unique or boss monster) and its escort; `boss`: marked as a boss of the round. Identifiers of the pack */
  private elitePack(w: World, e: Elite, sec: number, at: { x: number; y: number } | null, boss: boolean, scaleEscort = true): number[] {
    const spec = eliteSpec(e);
    if (!spec) return [];
    const p = this.pack(w, spec.monster, 'unique', scaleEscort ? (spec.count ? this.scaled(spec.count) : 0) : spec.count, sec, spec.uniqueName, at, spec.escort);
    if (!p) return [];
    const m = p.leader;
    if (spec.name) m.name = spec.name;
    this.eliteIds.push(m.id);
    // its own treasure class of Diablo II (SuperUniques.txt), not a unique's (data/loot.ts)
    const tc = superUniqueTcId(e.ref, w.difficulty, (id) => REGISTRIES.treasureClasses.has(id));
    if (tc && m.rank === 'unique') (m as LootMarked).svTc = tc;
    this.weaken(m);
    // the round's named elites (mini-bosses, the midway super-unique, the leaders of the elite waves) are never immune to the build
    this.breakImmunity(m);
    if (boss) {
      m.runBoss = true;
      this.bossIds.push(m.id);
      this.empower(m, 'miniboss', spec.escort, sec);
    }
    w.events.push({ t: 'bossSpawn', id: m.id, name: m.name });
    return [m.id, ...p.group.map((x) => x.id)];
  }

  /** Group size scaled by the pressure (one at least; half the group at least in a round not lost yet) */
  private scaled(n: number): number {
    return Math.max(1, Math.round(n * ((this.opts.deaths ?? 0) > 0 ? this.opts.pressure : Math.max(0.5, this.opts.pressure))));
  }

  private champions(w: World, sec: number): void {
    const p = this.pack(w, this.pickPack(w, this.segSec(sec) >= 330 || !!this.round.boss, sec), 'champion', this.scaled(2 + this.rng.int(2)), sec);
    // lot 307: the pack killed leaves an elite chest at times (sim/poi.ts)
    if (p) this.pois?.watchPack([p.leader.id, ...p.group.map((m) => m.id)], p.leader.x, p.leader.y);
  }

  /**
   * 25 to 40 monsters in a ring around the player, 9 to 11 units away (just off the screen's shorter side). Lot 292b (owner: "the circle
   * is not a whole circle"): in an act's flow at least `ENCIRCLE.min` of them, whatever the population's pressure (an event above the
   * target), evenly spread; a point beyond the arena or in a wall is pulled in along its ray (or the nearest open cell), never dropped
   */
  private encircle(w: World, sec: number): void {
    const want = Math.round((25 + this.rng.int(16)) * this.opts.pressure);
    const n = Math.min(this.opts.flow ? Math.max(ENCIRCLE.min, want) : want, Math.max(0, this.cap + (this.opts.flow ? ENCIRCLE.min : 0) - liveHostiles(w)));
    const p = w.player;
    const a0 = this.rng.float(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      // lot 301: in an act's flow just beyond the screen's edge along its ray (a ring shaped as the screen), pulled in no nearer
      const edge = this.opts.flow?.offscreen ? edgeAt(a) : 0;
      const r = (edge ? edge : ENCIRCLE.r) + this.rng.float(0, 1.5);
      let at: { x: number; y: number } | null = null;
      for (let k = r; k >= Math.max(5, edge) && !at; k -= 0.75) {
        const x = p.x + Math.cos(a) * k;
        const y = p.y + Math.sin(a) * k;
        if (this.inside(x, y) && this.reachableAt(w, x, y)) at = { x, y };
      }
      if (!this.opts.flow && !at) continue;
      // lot 301: a ray the arena cuts on the screen: the nearest angle off the screen instead
      if (!at && edge) at = this.spawnPoint(w, 0, 1.5, a);
      at ??= this.nearestReachable(w, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      if (at) this.spawn(w, this.pickPack(w, false, sec), at.x, at.y, { rank: 'normal' }, sec);
    }
  }

  /** A unique and its minions (a super-unique of the zone halfway through, when the round has one) */
  private unique(w: World, sec: number): void {
    const mid = midbossesOf(this.round)[0];
    if (mid && eliteSpec(mid)) {
      this.elitePack(w, mid, sec, this.spawnPoint(w, RING - 2, RING + 2), false);
      return;
    }
    const p = this.pack(w, this.pickPack(w, false, sec), 'unique', this.scaled(3 + this.rng.int(3)), sec);
    if (!p) return;
    this.eliteIds.push(p.leader.id);
    w.events.push({ t: 'bossSpawn', id: p.leader.id, name: p.leader.name });
  }

  /**
   * The round's super-unique(s) with their guard; their arrival kills the ordinary monsters within 8 units of the player (their loot
   * falls), which clears room for the duel. The death of the last one is the checkpoint.
   */
  private spawnMiniboss(w: World, sec: number): void {
    const p = w.player;
    for (const m of w.monsters) if (!m.dead && m.team === 1 && !m.pet && !m.isSummon && m.rank === 'normal' && Math.hypot(m.x - p.x, m.y - p.y) < 8) w.killMonster(m, p);
    const list = minibossesOf(this.round).filter((e) => eliteSpec(e));
    // their full escort the first time (Diablo II's), scaled like the packs once the round has been lost
    // lot 300: in an act's flow the mini-boss comes with its whole escort (Diablo II's), the run's peak of difficulty
    for (const e of list) this.elitePack(w, e, sec, this.spawnPoint(w, 10, 12), true, this.eased && !this.opts.flow?.boss);
    if (this.bossIds.length) return;
    // no super-unique for this round (or none known): a unique of the pool with four minions
    const pk = this.pack(w, this.pickPack(w, true, sec), 'unique', 4, sec, undefined, this.spawnPoint(w, 10, 12));
    if (!pk) return;
    pk.leader.runBoss = true;
    this.breakImmunity(pk.leader);
    this.weaken(pk.leader);
    this.empower(pk.leader, 'miniboss', pk.leader.def.id, sec);
    this.bossIds.push(pk.leader.id);
    w.events.push({ t: 'bossSpawn', id: pk.leader.id, name: pk.leader.name });
  }

  /**
   * The act's boss (and those fought with it), on the far side of the arena. In a round already lost, the guards and what is left of the
   * elite waves withdraw when it comes (without loot): the boss is fought alone, as Baal in the Worldstone Chamber. Measured (lot 283):
   * in Hell, the guards left alive took the blows of the bots' Amazon (level 54) and Barbarian (level 63), Mephisto and Baal next to them
   * losing 40 life a minute
   */
  private spawnBoss(w: World, sec: number, b: BossDef): void {
    const p = w.player;
    if (this.eased) {
      const before = liveHostiles(w);
      w.monsters = w.monsters.filter((m) => m.dead || m.team !== 1 || m.pet || m.isSummon);
      if (before > 0) this.announce(w, 'Les gardes se retirent');
    }
    const cx = (this.box.x0 + this.box.x1) / 2;
    const cy = (this.box.y0 + this.box.y1) / 2;
    let x = cx + (cx - p.x) * 0.6;
    let y = cy + (cy - p.y) * 0.6;
    // lot 307: never beyond `BOSS_FAR` units of the hero (the larger arenas put the far side past the base's leash, 45 units: Andariel
    // stood idle across her lair while the hero held a corner, tools/tiers.ts's runs lasting up to 2 h)
    const far = Math.hypot(x - p.x, y - p.y);
    if (far > BOSS_FAR) {
      x = p.x + ((x - p.x) * BOSS_FAR) / far;
      y = p.y + ((y - p.y) * BOSS_FAR) / far;
    }
    const ids = [b.monster, ...(b.with ?? [])];
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2;
      const off = ids.length > 1 ? 3 : 0;
      const at = this.nearestReachable(w, x + Math.cos(a) * off, y + Math.sin(a) * off) ?? this.spawnPoint(w, 10, 14);
      if (!at) return;
      const m = simHooks.spawnMonster(w, id, at.x, at.y, { rank: 'boss' }, `surv:boss:${i}`);
      if (!m) return;
      this.spawned++;
      m.aggro = true;
      m.runBoss = true;
      // the first kill in this difficulty: Diablo II's quest drop (data/loot.ts)
      const quest = checkpointDone(w.character, w.difficulty, this.round.id) ? undefined : questTcId(id, w.difficulty);
      if (quest) (m as LootMarked).svTc = quest;
      this.breakImmunity(m);
      this.ease(m);
      this.weaken(m);
      this.empower(m, 'boss', this.pickPack(w, true, sec), sec);
      this.bossIds.push(m.id);
      w.events.push({ t: 'bossSpawn', id: m.id, name: m.name });
    });
    void sec;
  }

  /**
   * Every monster of a round already lost deals less damage (`mercyOf`): its base damage is lowered once (the monster is marked, the mark is
   * saved with it), whoever made it (the director, or a monster: the Council's hydras, raised skeletons, vile children)
   */
  /** A round eased: lost before (Campaign), or a run's zone (Run mode: packs and escorts scaled and weakened, the guards leave for the boss) */
  get eased(): boolean {
    return (this.opts.deaths ?? 0) > 0 || !!this.opts.mercy;
  }

  /** Easing of this round's monsters: the Run mode's, else the deaths' */
  get mercy(): { dmg: number; bossLife: number; res: number; eliteDmg?: number } {
    return this.opts.mercy ?? mercyOf(this.opts.deaths ?? 0);
  }

  private ease(m: Monster): void {
    const k = this.mercy.dmg * this.ramp('dmg');
    const mm = m as Monster & { svEased?: number };
    if (k === 1 || mm.svEased || m.team !== 1 || m.pet || m.isSummon) return;
    mm.svEased = k;
    m.dmgMin *= k;
    m.dmgMax *= k;
  }

  /**
   * An act's flow (lot 292c, the owner's target: a roguelite whose progress is the gear): the monsters grow stronger with the act's clock,
   * damage and life ×(1 + `ramp` a minute), so that the hero's level alone does not carry him: his gear decides how far he goes
   */
  private ramp(k: 'dmg' | 'life'): number {
    const r = this.opts.flow?.ramp;
    if (!r) return 1;
    const t = this.actSec(this.nowSec);
    // lot 302: a late curve over the linear ramp (act second → factor, linear between its points): the threat keeps growing with the hero
    const late = k === 'life' ? r.lifeAt : r.dmgAt;
    const zone = k === 'life' ? (r.zoneLife ?? 1) : 1;
    return Math.min(r.max ?? Infinity, 1 + (r[k] * Math.max(0, t - (r.from ?? 0))) / 60) * (late?.length ? lerpAt(late, t) : 1) * zone;
  }
  /** Seconds of the zone at the last step (the ramp's clock) */
  private nowSec = 0;

  /** The round's named elites and bosses are never immune to the build (immunity.ts); in a round already lost, the mercy's resistance points come off after */
  private breakImmunity(m: Monster): void {
    if (!breakBossImmunity(m, this.opts.elements ?? [], this.sunder()) || !(m as Monster & { svWeak?: number }).svWeak) return;
    const k = this.mercy;
    for (const e of this.opts.elements ?? []) m.res[e] = Math.max(0, m.res[e] - k.res);
  }

  /**
   * A boss of a round already lost, or a member of its elite packs (escorts of the mini-bosses and of the elite waves, champions, a unique's
   * minions): less life (`mercyOf`), once (the monster is marked, the mark is saved with it), told once. Measured (lot 283): in Hell, the
   * escorts kept their full life while their leaders were at 3 %: two Council members held an Amazon of level 53 for 25 minutes in the
   * Durance (her 700 damage a minute under their regeneration), and Lister's minions killed a Barbarian 154 times at Baal
   */
  private weaken(m: Monster): void {
    const k = this.mercy;
    const mm = m as Monster & { svWeak?: number };
    if (k.bossLife >= 1 || mm.svWeak) return;
    mm.svWeak = k.bossLife;
    // the Run mode's elites and bosses also hit softer (on top of every monster's `dmg`)
    if (k.eliteDmg !== undefined && k.eliteDmg < 1) {
      m.dmgMin *= k.eliteDmg;
      m.dmgMax *= k.eliteDmg;
    }
    m.hpMax = Math.max(1, Math.round(m.hpMax * k.bossLife));
    m.hp = Math.min(m.hp, m.hpMax);
    // its regeneration (a share of its life a second in Diablo II) with it
    if (m.regen) m.regen *= k.bossLife;
    for (const e of Object.keys(m.res) as Element[]) if (m.res[e] > 0) m.res[e] = Math.max(0, m.res[e] - k.res);
    if (!this.fired.has('mercy') && !this.opts.mercy) {
      this.fired.add('mercy');
      this.w.events.push({
        t: 'message',
        text: `Vos défaites affaiblissent les monstres de la manche : boss −${Math.round((1 - k.bossLife) * 100)} % de vie, dégâts −${Math.round((1 - k.dmg) * 100)} %`,
        color: '#e8b04a',
      });
    }
  }

  /**
   * Monsters born of others (summoned, hatched or raised: no loot) beyond the round's target plus `BORN_SLACK` (the cap of the mode at
   * most; fewer in a round already lost, `bornSlackOf`) are not kept, the newest first, in the step they appear (never drawn). Measured (lot 280): 170 live monsters for a cap of 90
   * with the vile mothers of the Plains of Despair, and a hundred maggot young of the Far Oasis around a Barbarian whose deaths had eased
   * the round to 5 monsters (600 deaths there)
   */
  private trimBorn(w: World, sec: number): void {
    const slack = bornSlackOf(this.opts.deaths ?? 0);
    const limit = Math.min(this.cap, Math.max(this.target(sec), slack)) + slack;
    let alive = liveHostiles(w);
    for (let i = w.monsters.length - 1; i >= 0 && alive > limit; i--) {
      const m = w.monsters[i];
      if (m.dead || m.team !== 1 || m.pet || m.isSummon || !m.noLoot || this.bossIds.includes(m.id)) continue;
      w.monsters.splice(i, 1);
      alive--;
    }
  }

  /** Life of each boss at its last check and since when it has not changed (`bringBosses`) */
  private bossWatch = new Map<number, { hp: number; since: number }>();

  /**
   * A boss that has not lost life for 45 s while more than 6 units away is brought back close to the player (a boss stuck behind an obstacle,
   * or keeping away from a melee character, would otherwise hold the round for ever: measured with a Barbarian and Shenk, lot 280)
   */
  private bringBosses(w: World): void {
    const p = w.player;
    for (const m of this.bossMonsters()) {
      const seen = this.bossWatch.get(m.id);
      if (!seen || m.hp < seen.hp - 0.5) {
        this.bossWatch.set(m.id, { hp: m.hp, since: w.tick });
        continue;
      }
      if (w.tick - seen.since < 45 * TICK_HZ || Math.hypot(m.x - p.x, m.y - p.y) <= 6) continue;
      const at = this.spawnPoint(w, 4, 6);
      if (!at) continue;
      m.x = m.px = at.x;
      m.y = m.py = at.y;
      // lot 307: hunting again (a boss left beyond the base's leash had gone back to idle)
      m.aggro = true;
      this.bossWatch.set(m.id, { hp: m.hp, since: w.tick });
    }
  }

  /** Monsters left more than 30 units behind come back ahead of the player */
  private recycle(w: World): void {
    const p = w.player;
    let moved = 0;
    for (const m of w.monsters) {
      if (moved >= 4 || m.dead || m.team !== 1 || m.pet || m.isSummon || this.bossIds.includes(m.id)) continue;
      // lot 301: never one just brought beyond the screen (in portrait its far side is 35 units away): `RECYCLE_OFF` beyond its edge
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (this.opts.flow?.offscreen ? d <= edgeAt(Math.atan2(m.y - p.y, m.x - p.x)) + RECYCLE_OFF : d <= RECYCLE) continue;
      const at = this.spawnPoint(w, RING, RING + 4);
      if (!at) return;
      m.x = m.px = at.x;
      m.y = m.py = at.y;
      m.facing = Math.atan2(p.y - m.y, p.x - m.x);
      // lot 307: hunting again (left beyond the base's 45-unit leash in a 90-unit arena, it had gone back to idle)
      m.aggro = true;
      moved++;
    }
  }

  private inside(x: number, y: number): boolean {
    const b = this.box;
    return x > b.x0 + 1 && y > b.y0 + 1 && x < b.x1 - 1 && y < b.y1 - 1;
  }

  private reachableAt(w: World, x: number, y: number): boolean {
    const cx = Math.floor(x / 0.5);
    const cy = Math.floor(y / 0.5);
    return cx >= 0 && cy >= 0 && cx < w.grid.cols && cy < w.grid.rows && this.reach[cy * w.grid.cols + cx] === 1;
  }

  private nearestReachable(w: World, x: number, y: number): { x: number; y: number } | null {
    for (let r = 0; r <= 12; r += 1)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (this.inside(px, py) && this.reachableAt(w, px, py)) return { x: px, y: py };
        if (r === 0) break;
      }
    return null;
  }

  /**
   * Spawn point on a ring around the player, inside the arena and reachable from it, never closer than 10 units (along the border the
   * ring is pulled back inside); 40 % of the spawns in front of a moving player. Lot 301 (owner: "the monsters pop too close to the
   * hero"): in an act's flow, beyond the screen's edge along its angle (`edgeAt`: the window and zoom the app told, sim/view.ts) and
   * never on the screen (a point the arena's border pulls back into view is drawn again); `toward`: an angle wished (± 0.6)
   */
  spawnPoint(w: World, r0: number, r1: number, toward?: number): { x: number; y: number } | null {
    const p = w.player;
    const vx = p.x - p.px;
    const vy = p.y - p.py;
    const moving = Math.hypot(vx, vy) > 0.01;
    const ahead = Math.atan2(vy, vx);
    const minD = Math.min(10, r0);
    const flow = !!this.opts.flow?.offscreen;
    let fallback: { x: number; y: number } | null = null;
    for (let tries = 0; tries < (flow ? 24 : 16); tries++) {
      const a =
        toward !== undefined && tries < 8
          ? toward + this.rng.float(-0.6, 0.6)
          : moving && this.rng.float(0, 1) < (flow ? FLOW_AHEAD : 0.4)
            ? ahead + this.rng.float(-0.6, 0.6)
            : this.rng.float(0, Math.PI * 2);
      const r = flow ? edgeAt(a) + this.rng.float(0, OFF_DEPTH) : this.rng.float(r0, r1);
      let x = p.x + Math.cos(a) * r;
      let y = p.y + Math.sin(a) * r;
      const b = this.box;
      x = Math.min(b.x1 - 2, Math.max(b.x0 + 2, x));
      y = Math.min(b.y1 - 2, Math.max(b.y0 + 2, y));
      if (!flow && Math.hypot(x - p.x, y - p.y) < minD) continue;
      if (!this.reachableAt(w, x, y)) continue;
      if (flow && onScreen(x - p.x, y - p.y)) {
        fallback ??= { x, y };
        continue;
      }
      return { x, y };
    }
    return fallback;
  }

  /** Lot 301: a pack's member at (x, y) drawn on the screen is pushed out along the hero's ray to just beyond its edge (an act's flow) */
  offScreen(w: World, x: number, y: number): { x: number; y: number } {
    const p = w.player;
    if (!this.opts.flow?.offscreen || !onScreen(x - p.x, y - p.y)) return { x, y };
    const a = Math.atan2(y - p.y, x - p.x);
    const r = edgeAt(a);
    const nx = p.x + Math.cos(a) * r;
    const ny = p.y + Math.sin(a) * r;
    return this.inside(nx, ny) && this.reachableAt(w, nx, ny) ? { x: nx, y: ny } : { x, y };
  }
}

/** Live hostile monsters (not the player's or the mercenary's creatures) */
export function liveHostiles(w: World): number {
  let n = 0;
  for (const m of w.monsters) if (!m.dead && m.team === 1 && !m.pet && !m.isSummon) n++;
  return n;
}

/** Open cells of the arena reachable from the player's start (4-connected), on the world's collision grid */
function reachableCells(w: World, box: ArenaBox): Uint8Array {
  const g = w.grid;
  const out = new Uint8Array(g.cols * g.rows);
  const cx0 = Math.max(0, Math.floor(box.x0 / 0.5));
  const cy0 = Math.max(0, Math.floor(box.y0 / 0.5));
  const cx1 = Math.min(g.cols - 1, Math.ceil(box.x1 / 0.5) - 1);
  const cy1 = Math.min(g.rows - 1, Math.ceil(box.y1 / 0.5) - 1);
  const sx = Math.floor(w.player.x / 0.5);
  const sy = Math.floor(w.player.y / 0.5);
  if (sx < cx0 || sy < cy0 || sx > cx1 || sy > cy1 || g.blocked[sy * g.cols + sx]) return out;
  const stack = [sy * g.cols + sx];
  out[stack[0]] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % g.cols;
    const y = (c - x) / g.cols;
    if (x > cx0 && !out[c - 1] && !g.blocked[c - 1]) ((out[c - 1] = 1), stack.push(c - 1));
    if (x < cx1 && !out[c + 1] && !g.blocked[c + 1]) ((out[c + 1] = 1), stack.push(c + 1));
    if (y > cy0 && !out[c - g.cols] && !g.blocked[c - g.cols]) ((out[c - g.cols] = 1), stack.push(c - g.cols));
    if (y < cy1 && !out[c + g.cols] && !g.blocked[c + g.cols]) ((out[c + g.cols] = 1), stack.push(c + g.cols));
  }
  return out;
}

/** A curve's value at `x` (points `[x, value]`, linear between them, flat beyond) */
function lerpAt(pts: readonly (readonly [number, number])[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, v1] = pts[i];
    const [x0, v0] = pts[i - 1];
    if (x <= x1) return v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}
