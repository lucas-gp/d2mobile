/**
 * The "Run" mode of Survivals (lot 289, owner's decision: the default; the "Campaign" of lots 273-288 stays a choice at creation). A run
 * is ONE act in one difficulty: the hero starts again at the act's entry level (1 for Act I in Normal) with no skill, no stat point spent
 * and no quest reward, the act's zones chained one after the other without a town (a few seconds after each zone's mini-boss, the next
 * zone), until the act's boss falls (victory: the next act opens in that difficulty, Baal opens the next difficulty as in Diablo II) or
 * the hero dies. What a run leaves behind is the gear (worn, bag, stash: every item picked up is kept, on death too), the gold (spent at
 * the vendor of the hub between runs), the acts and difficulties opened and the records; since lot 308 the training's paid ranks too
 * (sim/forge.ts: small, the gear stays the progress).
 *
 * Gear has no requirement in Survivals (lot 290, owner's order, Run and Campaign alike: rules `char.equipNeedsReqs`,
 * `char.equipNeedsClass`): the hero, level 1 between runs, wears any item of its slot (level, strength, dexterity, class), active at once.
 * The gear of the late acts and difficulties is what makes the early acts quicker (lot 289's "asleep until its requirements" removed).
 *
 * Everything is kept in the character's milestones (numbers, keys `survivals:run:*`, `survivals:rec:*`): the save format (v7) does not
 * change, and a client without the mod keeps these characters greyed, untouched. Characters created before lot 289 (no `survivals:mode`)
 * play the Campaign.
 */
import { BASE_BY_ID, CLASSES, generateItem, itemName, REGISTRIES, Rng, TICK_HZ, XP_TABLE, type CharacterState, type Game, type ZoneDef } from '../../../src/mods/sdk';
import { ROUNDS, roundOfRun, runIdOf, type RoundDef } from '../data/chapters';
import type { ActFlow, PackSpec } from './director';
import { checkpointDone } from './checkpoints';
import { stateOf, type RunEnd } from './state';
import { pagesBlockRun, settleRunLoot } from './runloot';
import { applyForgeAtStart } from './forge';

/** Milestone of the mode chosen at creation: 1 Run, 2 Campaign; absent (characters before lot 289): Campaign */
export const MODE_KEY = 'survivals:mode';

export function isRunMode(c: CharacterState | null | undefined): boolean {
  return !!c && c.progression.milestones[MODE_KEY] === 1;
}

/** The creation screen's variant (`run` by default, `campaign`) */
export function setVariant(c: CharacterState, variant: string | undefined): void {
  c.progression.milestones[MODE_KEY] = variant === 'campaign' ? 2 : 1;
}

/**
 * Tuning of the Run mode (measured with the bots, see README "Run mode"): the timeline of a zone runs `pace` times its Campaign length (the
 * mini-boss at 8:00 × pace), the director keeps `pressure` of its population table at the zone's recommended level (+`perLevel` a level
 * above it, 1 at most, `floor` at least), the next zone `nextAfter` seconds after the mini-boss (the loot left is taken), the end of a won
 * run `endAfter` seconds after its boss; a run of a later act or difficulty starts `entryBelow` levels under its first zone's recommended
 * level (D2's level gap would leave a level-1 hero with almost no experience from Nightmare's monsters)
 */
export const RUN = {
  pace: 0.5,
  pressure: 0.2,
  perLevel: 0.02,
  floor: 0.15,
  /**
   * Lot 305 (owner: "when I kill Blood Raven I have only 5 seconds before the teleport to the next zone: 10 seconds between each zone"): a
   * zone ended on its time waits as long as one ended by its mini-boss (was 4 s); the act's clock does not count the wait (`FLOW.clockGap`)
   */
  nextAfter: 10,
  /**
   * Lot 300 (owner: "a 10-second countdown after a zone's boss before the next zone, to pick up its loot; a tap goes on at once"): the
   * seconds after a zone's mini-boss killed (a zone ended by its time keeps `nextAfter`)
   */
  bossWait: 10,
  endAfter: 4,
  entryBelow: 2,
  /** Monsters' damage, bosses' and elite packs' life, their resistance points lost (a run has no second try: no mercy from deaths) */
  mercy: { dmg: 0.25, bossLife: 0.3, res: 0, eliteDmg: 0.45 },
  /**
   * Act I in Normal's own (lot 290: ×0.4, ×0.45, ×0.6 with the gear active from level 1; lot 291: the act's timed flow, about 6 minutes, the
   * hero 7 levels lower when the fight thickens, measured with the bots: README "Run mode"). The other acts keep `mercy` (not tuned yet)
   */
  // lot 308: dmg 1 → 0.9 (lot 307's arenas of 90 units: the hero, once held within a screen of the 64-unit border half of his time, now
  // met the monsters from every side, about 3.9 sides of 8 around him against 3.5, killed 6 to 40 % fewer a second and lived 5 to 13 %
  // shorter at tiers 1 to 5; tools/tiers.ts back to lot 306's row: README "Training")
  mercyAct1: { dmg: 0.9, bossLife: 0.65, res: 0, eliteDmg: 0.2 },
  /** Act I in Nightmare and Hell (lot 292, the endgame farm: Act I's flow in every difficulty), measured with the bots: README "Endgame" */
  mercyAct1Endgame: { dmg: 0.06, bossLife: 0.3, res: 0, eliteDmg: 0.3 },
  /** Life and mana a kill gives back */
  heal: 0.02,
  /** Live archers and casters at most, share of the population (the Campaign's: 0.3) */
  rangedCap: 0.15,
  /** Life and mana given back every second */
  regen: 0.025,
  /** Experience of a kill, times Diablo II's (the run's level is never kept) */
  xp: 3,
  /** The elites met halfway after the first one (the Cow King in the Stony Field…) and the late champion packs: none in a run's shorter zones */
  extraElites: false,
  /** Gold of a pile against the Campaign's (a third of Diablo II's), and share of the vendor's price of an item turned into gold */
  gold: 0.5,
  sell: 0.35,
};

/** Population share kept by the director in a run, for a hero of `level` in a zone recommended at `rec` */
export function runPressure(level: number, rec: number): number {
  return Math.max(RUN.floor, Math.min(1, RUN.pressure + RUN.perLevel * (level - rec)));
}

const RK = (k: string): string => `survivals:run:${k}`;
/** Records of an act in a difficulty: `best` (fastest victory, seconds), `kills` (most kills in a run), `deep` (deepest zone reached), `wins`, `runs` */
export const recKey = (d: number, act: number, k: 'best' | 'kills' | 'deep' | 'wins' | 'runs' | 'surv'): string => `survivals:rec:${d}:${act}:${k}`;
/** Runs started by the character (also the salt of the level-up cards: each run draws its own) */
export const RUNS_KEY = 'survivals:runs';
/** Act and difficulty of the last run (the hub offers them again) */
const LAST_KEY = { act: 'survivals:last:act', d: 'survivals:last:d' };

export const actRounds = (act: number): RoundDef[] => ROUNDS.filter((r) => r.act === act);

/**
 * The zones a run of `act` in difficulty `d` plays, in order: Act I's flow (lot 292c, owner's note: "a mini-boss every 3 minutes")
 * plays `FLOW.zones` (the Blood Moor, the Cold Plains to Blood Raven, the Stony Field to Rakanishu, the Dark Wood to the Countess,
 * Andariel's lair), the other acts all their zones
 */
export function runZones(act: number, d: number): RoundDef[] {
  if (!flowActive(act, d)) return actRounds(act);
  return FLOW.zones.map(([id]) => ROUNDS.find((r) => r.id === id)).filter((r): r is RoundDef => !!r);
}
export const ACTS = [1, 2, 3, 4, 5] as const;

/** The act's boss beaten in difficulty `d` (its last zone's checkpoint) */
export function actBeaten(c: CharacterState, act: number, d: number): boolean {
  const zones = actRounds(act);
  return d >= 0 && d <= 2 && !!zones.length && checkpointDone(c, d, zones[zones.length - 1].id);
}

/**
 * Act `act` of difficulty `d` open, as in Diablo II: the previous act's boss beaten in it; Act I of a difficulty reached, the next
 * difficulty opened by Baal (Act V's boss) beaten in the one before. Lot 305 (owner: "I killed Andariel in Normal and it says Nightmare
 * is unlocked; Nightmare must open only when Baal is killed in Normal"): lot 292's shortcut (Andariel opening the next difficulty's Act I)
 * removed. Nothing is written: a save that played Nightmare through it keeps its records, its Nightmare comes back with Baal
 */
export function actUnlocked(c: CharacterState, act: number, d: number): boolean {
  if (d < 0 || d > 2 || act < 1 || act > 5) return false;
  if (act === 1) return d <= c.progression.highestDifficulty || actBeaten(c, 5, d - 1);
  return actBeaten(c, act - 1, d);
}

/** Why an act of a difficulty is still closed (lot 305: the hub's acts list), null when open */
export function lockReason(c: CharacterState, act: number, d: number): string | null {
  if (actUnlocked(c, act, d)) return null;
  const BOSS = ['Andariel', 'Duriel', 'Méphisto', 'Diablo', 'Baal'];
  const DIFF = ['Normal', 'Cauchemar', 'Enfer'];
  if (act === 1) return `Vaincre Baal en ${DIFF[d - 1]}`;
  return `Vaincre ${BOSS[act - 2]} (${DIFF[d]})`;
}

/** Every act open, by difficulty (Normal first) */
export function unlockedActs(c: CharacterState): { act: number; d: number }[] {
  const out: { act: number; d: number }[] = [];
  for (const d of [0, 1, 2]) for (const act of ACTS) if (actUnlocked(c, act, d)) out.push({ act, d });
  return out;
}

/** The hero's level at the start of a run of this act and difficulty (1 for Act I in Normal) */
export function entryLevel(act: number, d: number): number {
  if (act === 1 && d === 0) return 1;
  return Math.max(1, actRounds(act)[0].recLevel[d] - RUN.entryBelow);
}

/** The act and difficulty the hub offers: the last run's when still open, else Act I in Normal */
export function lastChoice(c: CharacterState): { act: number; d: number } {
  const m = c.progression.milestones;
  const act = m[LAST_KEY.act] ?? 1;
  const d = m[LAST_KEY.d] ?? 0;
  return actUnlocked(c, act, d) ? { act, d } : { act: 1, d: 0 };
}

export interface RunInfo {
  act: number;
  d: number;
  /** Index of the zone being played in the act (0: the first) */
  zone: number;
  /** Play time at the start (seconds) */
  start: number;
  kills: number;
  gold0: number;
  items: number;
  /** The hero died, or beat the act's boss */
  dead: boolean;
  won: boolean;
}

export function runActive(c: CharacterState): boolean {
  return isRunMode(c) && c.progression.milestones[RK('active')] === 1;
}

export function runInfo(c: CharacterState): RunInfo | null {
  if (!runActive(c)) return null;
  const m = c.progression.milestones;
  return {
    act: m[RK('act')] ?? 1,
    d: m[RK('d')] ?? 0,
    zone: m[RK('zone')] ?? 0,
    start: m[RK('start')] ?? 0,
    kills: m[RK('kills')] ?? 0,
    gold0: m[RK('gold0')] ?? 0,
    items: m[RK('items')] ?? 0,
    dead: m[RK('dead')] === 1,
    won: m[RK('won')] === 1,
  };
}

function clearRun(c: CharacterState): void {
  for (const k of Object.keys(c.progression.milestones)) if (k.startsWith('survivals:run:')) delete c.progression.milestones[k];
}

/**
 * The hero at `level` with nothing of a previous run: the class's attributes, no skill, the level's points (5 stat points and 1 skill
 * point a level, as Diablo II, one at level 1), no quest reward (they come again with the zones: `reward:*` forgotten), an empty hot bar.
 * The gear, the gold, the stash, the acts opened and the records stay
 */
export function resetHero(g: Game, level: number, points = true): void {
  const c = g.character;
  const lvl = Math.max(1, Math.min(99, Math.round(level)));
  c.level = lvl;
  c.xp = XP_TABLE[lvl - 1];
  c.base = { ...CLASSES[c.classId].base };
  c.statPoints = points ? 5 * (lvl - 1) : 0;
  c.skillPoints = points ? lvl : 0;
  c.skills = {};
  c.hotbar = { primary: 'attack', secondary: 'attack', slots: [null, null, null, null, null, null, null, null] };
  c.bonuses = {};
  c.progression.bonusSkillPoints = 0;
  c.progression.bonusStatPoints = 0;
  c.progression.rewards = c.progression.rewards.filter((r) => !r.startsWith('reward:'));
  g.offers.length = 0;
  if (g.world) {
    g.world.refreshPlayer();
    const p = g.world.player;
    p.hp = p.hpMax;
    p.mana = p.manaMax;
  }
}

/**
 * The class's starter kit (lot 292, the study: a melee hero starting without a weapon is a poor first impression): Diablo II's starting
 * weapons (the base's: a short staff, a hand axe, a short sword, a short bow, a katar, a wand) and its buckler for the one-handed melee
 * classes (Barbarian, Paladin, Assassin, as in Diablo II)
 */
export const STARTER_KIT: Record<string, { weapon: string; shield?: string }> = {
  sorceress: { weapon: 'short_staff' },
  druid: { weapon: 'short_staff' },
  barbarian: { weapon: 'hand_axe', shield: 'buckler' },
  paladin: { weapon: 'short_sword', shield: 'buckler' },
  amazon: { weapon: 'short_bow' },
  assassin: { weapon: 'katar', shield: 'buckler' },
  necromancer: { weapon: 'wand' },
};

/**
 * Every run starts with a weapon (lot 292): the starter weapon put back in an empty weapon hand (sold, or never had), and the class's
 * buckler in an empty shield hand beside a one-handed melee weapon. Returns the names of what was given
 */
export function ensureStarterKit(c: CharacterState): string[] {
  const kit = STARTER_KIT[c.classId];
  if (!kit) return [];
  const out: string[] = [];
  const eq = c.equipment;
  if (!eq.mainhand) {
    eq.mainhand = generateItem(new Rng(`sv-start:${c.classId}`), kit.weapon, 1, { forceQuality: 'normal' });
    out.push(itemName(eq.mainhand));
  }
  const main = BASE_BY_ID[eq.mainhand.base];
  if (kit.shield && !eq.offhand && main && !main.twoHanded && main.type !== 'bow' && main.type !== 'crossbow') {
    eq.offhand = generateItem(new Rng(`sv-start-off:${c.classId}`), kit.shield, 1, { forceQuality: 'normal' });
    out.push(itemName(eq.offhand));
  }
  return out;
}

/** Games whose run was started or played this session (a run still open in town at the first step is one interrupted by the app closed) */
const PLAYED = new WeakSet<object>();

/**
 * Starts a run of `act` in difficulty `d` from the hub: the hero reset to the act's entry level (the points above level 1 spent by the
 * stat profile and the class's build plan, `prepare`), the act's first zone, and a first card for the level's skill point. False if the
 * act is not open or the game refused the zone
 */
export function startRunMode(g: Game, act: number, d: number, prepare: (g: Game) => void = () => undefined): boolean {
  const c = g.character;
  // lot 293: no new run while the temporary pages hold too much of the last runs' loot (runloot.ts)
  // lot 305: also from the boss's zone of a run just won (its end screen: "Replay", "Next act"), the run over
  if (!isRunMode(c) || (g.mode === 'run' && runActive(c)) || !actUnlocked(c, act, d) || pagesBlockRun(c)) return false;
  const first = runZones(act, d)[0];
  if (!first) return false;
  ensureStarterKit(c);
  resetHero(g, entryLevel(act, d));
  // the points of the levels above 1 (later acts and difficulties): spent before the run, the last skill point left for the first card
  if (c.level > 1) {
    c.skillPoints -= 1;
    prepare(g);
    c.skillPoints += 1;
  }
  // lot 308: the training's life for the run (sim/forge.ts; its other ranks are read as the run goes)
  applyForgeAtStart(c);
  const m = c.progression.milestones;
  clearRun(c);
  m[RUNS_KEY] = (m[RUNS_KEY] ?? 0) + 1;
  m[recKey(d, act, 'runs')] = (m[recKey(d, act, 'runs')] ?? 0) + 1;
  m[LAST_KEY.act] = act;
  m[LAST_KEY.d] = d;
  m[RK('active')] = 1;
  m[RK('act')] = act;
  m[RK('d')] = d;
  m[RK('zone')] = 0;
  m[RK('start')] = Math.round(c.progression.playTime);
  m[RK('kills')] = 0;
  m[RK('gold0')] = c.gold;
  m[RK('items')] = 0;
  const st = stateOf(g);
  st.runItems = [];
  st.runEnd = null;
  st.endHere = null;
  PLAYED.add(g);
  if (!g.startRun(runIdOf(first), d as 0 | 1 | 2)) {
    clearRun(c);
    resetHero(g, 1, false);
    return false;
  }
  // the first card: the level's skill point (the cards' screen opens on a level-up)
  if (c.skillPoints > 0) g.world.events.push({ t: 'levelUp', level: c.level });
  return true;
}

/** An item picked up during a run (the run-end screen lists them) */
export function noteFound(g: Game, name: string): void {
  const c = g.character;
  if (!runActive(c)) return;
  c.progression.milestones[RK('items')] = (c.progression.milestones[RK('items')] ?? 0) + 1;
  const st = stateOf(g);
  if (st.runItems.length < 40) st.runItems.push(name);
}

/** A zone of the run cleared (its mini-boss or the act's boss killed): a portal taken then goes on to the next zone, the boss wins the run */
export function noteZoneCleared(c: CharacterState, round: RoundDef): void {
  if (!runActive(c)) return;
  const m = c.progression.milestones;
  m[RK('cleared')] = runZones(round.act, m[RK('d')] ?? 0).indexOf(round) + 1;
  if (round.boss) m[RK('won')] = 1;
}

/** The hero's death in a run's zone: the zone's kills counted, the run ends in town */
export function noteRunDeath(g: Game): void {
  const c = g.character;
  if (!runActive(c) || c.progression.milestones[RK('dead')] === 1) return;
  c.progression.milestones[RK('dead')] = 1;
  c.progression.milestones[RK('kills')] = (c.progression.milestones[RK('kills')] ?? 0) + g.world.stats.kills;
}

/**
 * Every step of a Run hero (from the autopilot): a zone cleared goes on to the next one after `RUN.nextAfter` s (the loot left taken by
 * `collect`), the act's boss killed ends the run in town after `RUN.endAfter` s, and in town a run still open ends (death, victory, or the
 * zone left from the pause)
 */
/** Act boss zones whose loot was taken at the boss's fall (lot 291) */
const VACUUMED = new WeakSet<object>();

/**
 * A run interrupted by the app closed (lot 298, owner: "launching a character must start a NEW run from 0, never resume where I stopped"):
 * its zones are never resumed (`resumeOnLoad` false in the Run, sim/rounds.ts); at the character's first step in town the run is ended as
 * left (its loot settled to the bag and the pages, its records kept, the hero back to level 1), without the run-end screen, and a new run
 * of the same act starts at once from its first zone, at 0:00 (the hub: `autoStart`). The acts opened stay (the checkpoints are the acts)
 */
export function abandonInterrupted(g: Game): boolean {
  const c = g.character;
  if (g.mode !== 'town' || !runActive(c) || PLAYED.has(g)) return false;
  PLAYED.add(g);
  endRun(g);
  const st = stateOf(g);
  st.runEnd = null;
  st.autoStart = true;
  return true;
}

export function runStep(g: Game, collect: (g: Game) => void): void {
  const c = g.character;
  if (g.mode === 'run') PLAYED.add(g);
  if (!runActive(c)) return;
  if (abandonInterrupted(g)) return;
  if (g.mode === 'town') {
    // a zone cleared left by its portal (the automatic control walks to it): the next zone, the run goes on
    const info = runInfo(c)!;
    const zones = runZones(info.act, info.d);
    if (!info.dead && !info.won && c.progression.milestones[RK('cleared')] === info.zone + 1 && zones[info.zone + 1]) {
      c.progression.milestones[RK('zone')] = info.zone + 1;
      g.startRun(runIdOf(zones[info.zone + 1]), info.d as 0 | 1 | 2);
      return;
    }
    endRun(g);
    return;
  }
  const w = g.world;
  const run = w.run;
  const round = roundOfRun(g.runDef?.id);
  if (!run?.completed || !round || w.player.dead) return;
  // the act boss's fall in Act I's flow (lot 291): the loot and the gold of the arena come to the hero at once
  if (round.boss && inFlow(w) && !VACUUMED.has(run)) {
    VACUUMED.add(run);
    collect(g);
  }
  // lot 305: no portal out of a cleared zone of a run (the automatic control walked into it 4-5 s after the mini-boss, cutting the
  // 10-second countdown short); the countdown, or a tap on it, goes on to the next zone
  if (run.completed && w.objects.some((o) => o.kind === 'portal' && o.ref === 'town')) w.objects = w.objects.filter((o) => !(o.kind === 'portal' && o.ref === 'town'));
  const wait = zoneWait(g);
  if (wait === null || (w.tick - run.completeTick < wait * TICK_HZ && !SKIPPED.has(run))) return;
  collect(g);
  const m = c.progression.milestones;
  m[RK('kills')] = (m[RK('kills')] ?? 0) + w.stats.kills;
  const info = runInfo(c)!;
  const zones = runZones(info.act, info.d);
  const next = zones[zones.indexOf(round) + 1];
  if (round.boss || !next) {
    m[RK('won')] = 1;
    // lot 305: the hero stays in the boss's zone, the end screen over it (ui/hud.ts), no town loaded; the screen's buttons leave it
    const end = endRun(g);
    if (end) {
      const st = stateOf(g);
      st.runEnd = null;
      st.endHere = end;
    }
    return;
  }
  m[RK('zone')] = zones.indexOf(next);
  g.startRun(runIdOf(next), info.d as 0 | 1 | 2);
  // a skill point kept on a card comes back as a card in the next zone
  if (c.skillPoints > 0 && !g.offers.length) g.world.events.push({ t: 'levelUp', level: c.level });
}

/**
 * The zone a run plays next without going through the town (rule `game.nextZone`, lot 300, owner: "I did not have the next zone's assets,
 * I got an error"): built as the run will build it (its arena, its species `monsterPool`), so that the app prepares its map, monsters and
 * effects during the current zone. Null out of a run, in the act's last zone
 */
const NEXT_ZONE = new WeakMap<object, ZoneDef | null>();
export function nextRunZone(g: Game): ZoneDef | null {
  const c = g.character;
  // lot 305 (owner: a run's start too long): in the hub between runs, the first zone of the act offered (the last run's) is prepared
  // while the player looks at his gear, so that "Start the run" builds it from what is ready
  // (a run still open in town, after a death or a run left, ends at the next step: its act is the one offered next)
  const hub = g.mode === 'town' && isRunMode(c);
  if (!hub && (g.mode !== 'run' || !runActive(c))) return null;
  const info = hub ? { ...lastChoice(c), zone: -1 } : runInfo(c)!;
  const round = hub ? undefined : roundOfRun(g.runDef?.id);
  const zones = runZones(info.act, info.d);
  const next = hub ? zones[0] : round ? zones[zones.indexOf(round) + 1] : undefined;
  if (!next) return null;
  const key = g.world;
  if (NEXT_ZONE.has(key)) return NEXT_ZONE.get(key) ?? null;
  const def = REGISTRIES.runs.get(runIdOf(next));
  let z: ZoneDef | null = null;
  try {
    z = def ? def.build(1, info.d as 0 | 1 | 2) : null;
  } catch {
    z = null;
  }
  NEXT_ZONE.set(key, z);
  return z;
}

/** Zones whose wait before the next one the player cut short (a tap on the countdown) */
const SKIPPED = new WeakSet<object>();

/** Seconds between a zone cleared and the next one (`RUN.bossWait` after its mini-boss, `nextAfter` on its time), null: not cleared */
export function zoneWait(g: Game): number | null {
  const run = g.mode === 'run' ? g.world.run : null;
  const round = roundOfRun(g.runDef?.id);
  if (!run?.completed || !round) return null;
  if (round.boss) return RUN.endAfter;
  const timedOut = !!(run.director as { endedByTime?: boolean } | undefined)?.endedByTime;
  return timedOut ? RUN.nextAfter : RUN.bossWait;
}

/** Seconds left before the next zone (the countdown's figure; null: none going on, or the act's boss) */
export function zoneWaitLeft(g: Game): number | null {
  const wait = zoneWait(g);
  const round = roundOfRun(g.runDef?.id);
  if (wait === null || !round || round.boss || !runActive(g.character) || g.world.player.dead || SKIPPED.has(g.world.run!)) return null;
  return Math.max(0, wait - (g.world.tick - g.world.run!.completeTick) / TICK_HZ);
}

/** The player taps the countdown: the next zone at the next step */
export function skipZoneWait(g: Game): boolean {
  if (zoneWaitLeft(g) === null) return false;
  SKIPPED.add(g.world.run!);
  return true;
}

/**
 * The end of a run (in town): its summary for the run-end screen (`SurvivalsState.runEnd`), the records, the hero back to level 1 with no
 * point (between runs, the hub shows the gear as it is at the start of a run)
 */
export function endRun(g: Game): RunEnd | null {
  const c = g.character;
  const info = runInfo(c);
  if (!info) return null;
  const m = c.progression.milestones;
  const sec = Math.max(0, Math.round(c.progression.playTime - info.start));
  const outcome = info.won ? 'victory' : info.dead ? 'death' : 'left';
  const zones = runZones(info.act, info.d);
  const deep = info.zone + 1;
  const records: string[] = [];
  const rec = (k: 'best' | 'kills' | 'deep' | 'surv', v: number, better: (old: number) => boolean) => {
    const key = recKey(info.d, info.act, k);
    const old = m[key];
    if (old === undefined || better(old)) {
      if (old !== undefined) records.push(k);
      m[key] = v;
    }
  };
  // the next difficulty opened by a first victory over Baal (lot 305: no longer by Andariel, lot 292's shortcut)
  const hadNext = info.d >= 2 || info.d + 1 <= Math.max(m[OPENED_KEY] ?? 0, c.progression.highestDifficulty);
  let bestTime = false;
  if (outcome === 'victory') {
    const old = m[recKey(info.d, info.act, 'best')];
    bestTime = old === undefined || sec < old;
    rec('best', Math.max(1, sec), (o) => sec < o);
    m[recKey(info.d, info.act, 'wins')] = (m[recKey(info.d, info.act, 'wins')] ?? 0) + 1;
  }
  rec('kills', info.kills, (old) => info.kills > old);
  rec('deep', deep, (old) => deep > old);
  // lot 296 (the other game's death screen: "New best time" on a death): the longest run, a death or a victory, the progress run after run
  const oldSurv = m[recKey(info.d, info.act, 'surv')];
  const bestSurvival = outcome !== 'left' && oldSurv !== undefined && sec > oldSurv;
  if (outcome !== 'left' && (oldSurv === undefined || sec > oldSurv)) m[recKey(info.d, info.act, 'surv')] = sec;
  // lot 293: the run's loot to the bag, the surplus to the temporary pages
  const settled = settleRunLoot(c);
  const st = stateOf(g);
  const nextAct = outcome === 'victory' && info.act < 5 && actUnlocked(c, info.act + 1, info.d) ? info.act + 1 : null;
  const end: RunEnd = {
    outcome,
    act: info.act,
    d: info.d,
    zone: zones[info.zone]?.name ?? '',
    zoneIndex: deep,
    zones: zones.length,
    sec,
    level: c.level,
    kills: info.kills,
    gold: c.gold - info.gold0,
    items: info.items,
    itemNames: [...st.runItems],
    killer: outcome === 'death' ? (st.lastDeath?.killer ?? null) : null,
    ...(outcome === 'death' && st.lastDeath?.burst ? { burst: st.lastDeath.burst } : {}),
    records,
    nextAct,
    nextDifficulty: outcome === 'victory' && !hadNext && actUnlocked(c, 1, info.d + 1),
    bestTime,
    bestSurvival,
    survival: m[recKey(info.d, info.act, 'surv')] ?? sec,
    purse: c.gold,
    pages: settled.pages,
  };
  st.runEnd = end;
  st.runItems = [];
  m[BEST_LEVEL] = Math.max(m[BEST_LEVEL] ?? 1, c.level);
  m[LAST_LEVEL] = c.level;
  m[OPENED_KEY] = Math.max(m[OPENED_KEY] ?? 0, ...[1, 2].filter((d) => actUnlocked(c, 1, d)));
  clearRun(c);
  resetHero(g, 1, false);
  // the hub's shop rolls a new stock at each run's end (sim/shop.ts, rule `shop.vendorStock`)
  vendorAtBest(g);
  return end;
}

/** Highest level reached in a run: the hub's vendor stocks items of that level (the hero is level 1 between runs) */
export const BEST_LEVEL = 'survivals:rec:level';
/** Highest difficulty whose Act I is open, as told at a run's end (lot 292: the run-end screen tells a difficulty newly opened) */
export const OPENED_KEY = 'survivals:opened';
/** Level reached in the last run (lot 292: the shop's stock is sized to it) */
export const LAST_LEVEL = 'survivals:last:level';

/**
 * The vendor's stall between runs (the hero is level 1: the base's stall would be a level-1 one): since lot 292 the shop's own stock, at
 * the level of the run (sim/shop.ts, rules `shop.vendorStock` and `shop.gambleStock`), rolled again at each run's end
 */
export function vendorAtBest(g: Game): void {
  g.refreshVendor();
  g.refreshGamble();
}

/** Easing of a run's monsters in a zone of `act` in difficulty `d` (`RUN.mercyAct1` in Act I in Normal, lot 290) */
export function runMercy(act: number, d: number, zone?: string): { dmg: number; bossLife: number; res: number; eliteDmg: number } {
  // lot 292: Act I's flow in every difficulty, its easing too
  if (!flowActive(act, d)) return RUN.mercy;
  const m = d > 0 ? RUN.mercyAct1Endgame : RUN.mercyAct1;
  // lot 294: a zone's own factor (Andariel's lair)
  const k = (zone && FLOW.zoneDmg[zone]) || 1;
  return k === 1 ? m : { ...m, dmg: m.dmg * k };
}

/**
 * Act I in Normal as one timed flow (lot 291, owner: closer to the other survivors game observed): about 6 minutes for the act,
 * each zone `zoneSec` seconds at most (its mini-boss killed earlier ends it sooner), a gentle start then the full field from 2:00
 * (`density`: live monsters by act second, linear in between, the mode's cap above), melee fodder only before `meleeUntil`, an elite every
 * 20 to 30 s announced by name `warn` s ahead (the zone's unique at `unique`, champions at `champions` from the second zone, an
 * encirclement from the third, its mini-boss at `miniboss`), Andariel `bossAt` s into her lair. The other acts keep the zones of lot 289
 */
export const FLOW = {
  /** Running speed: factor of the base's (the other game's hero runs about 4 units a second, Diablo II's 5.2) */
  speed: 4 / 5.2,
  /** The hero keeps walking while he casts */
  castWhileMoving: true,
  /**
   * Lot 298 (owner: "when a skill is cast another one cannot be"): a skill asked while another is cast goes off beside it (rule
   * `player.parallelCast`), each on its own floor (`minCast`); the rotation fires the learned skills that way
   */
  parallel: true,
  /**
   * Lot 301 (owner: "every spell independent, its own cooldown, cast at the same time as another"): every spell ready with a use goes off
   * at once beside the others (sim/autopilot.ts `castReady`); false: the brain's and the rotation's casts only (measures)
   */
  independent: true,
  /** Lot 301 (owner: "the monsters pop too close"): the monsters brought just beyond the screen (sim/view.ts); false: lot 300's ring */
  offscreen: true,
  /** Lot 301: a monster off the screen walks in this many times quicker (rule `ai.chaseSpeed`) */
  offscreenSpeed: 3,
  /**
   * Live monsters wanted more than `density` when they are brought beyond the screen (as many on their way meanwhile). Lot 301: 14 more at
   * any time; lot 306 (owner: "the monsters' density too high, compare with the other game"): a share of the curve, 15 % (the 14 more made
   * the first minute's field 20 to 30 alive for the other game's 5 to 15)
   */
  offscreenShare: 0.15,
  /**
   * Lot 301: the spells' floors (`minCast`, `spellMin`) times this: each spell now goes off on its own cooldown beside the others (lot
   * 298's one spell every 0.5 s gone), its own rhythm slower so that a build's spells together keep about lot 300's damage a second
   */
  spellScale: 2.5,
  /**
   * Lot 301: the class's own factor on its spells' cooldowns (1 when absent; measured with tools/tiers.ts, README "Lot 301"). Lot 302: the
   * Assassin's traps and the Druid's Fissure, Molten Boulder and Volcano held by their own floors (`minCast`) rather than by the class's
   * factor, the Sorceress's bolts a little quicker (README "Act I tightened")
   */
  classSpell: { amazon: 2.0, assassin: 1.3, druid: 1.7, sorceress: 0.85 } as Record<string, number>,
  /** Lot 298: the floor of a spell (`minCast`) never under this (seconds): no spell cast again and again faster than that */
  spellMin: 0.8,
  /**
   * Lot 309 (owner: "Charged Bolt seems to spam its spells too fast, check every spell"): a spell's cooldown never under this many times
   * its own cast animation (Diablo II's frames at the hero's cast rate, `castFrames`): nothing cast again before its gesture is played
   * twice over (the floors × `spellScale` already held every spell of the seven classes at 2.6 to 22 times it: a guard, `floorCast`)
   */
  animK: 2,
  /**
   * Lot 309: the missiles a second a several-missile skill fires at most (its cooldown × this, rule `skills.missileCount`, `flowMissiles`):
   * the bolts counted, not the casts (Charged Bolt's 7 bolts at 5 points every 2 s, 11 with +3 skills: a cloud of erratic sparks always
   * on the screen, 3.5 to 5.5 bolts a second; the other game's Teeth about 1.6 a second, a Sorceress's single bolts 2 to 3). The bolts
   * beyond it are folded into the others' damage (a cast's damage kept): fewer, heavier bolts
   */
  boltRate: 2,
  /** Frames of a strike or cast against Diablo II's (lot 292c: a quick, unbroken cadence) */
  cadence: 0.55,
  /**
   * The class's own factor on `cadence` (lot 294: without mana the costly multi-missile skills, Teeth's fan of bolts, fire as fast as a
   * single bolt; each class's survival measured with the starter kit, README "Act I as a gear roguelite")
   */
  classCadence: {} as Record<string, number>,
  /**
   * The class's own factor on the monsters' hits (lot 294, measured with tools/tiers.ts: the archer Amazon kills 3 monsters a second where
   * the others kill 5 to 9, and fell at 2:00 whatever her gear); 1 when absent. Lot 296: around 1 against Diablo II's own hits
   * (`mercyAct1.dmg` 1), the Druid without one, measured with tools/tiers.ts (README "The other game measured again"). Lot 298 (the
   * spells' floor at 0.8 s, one spell every 0.5 s, the skills beside a running cast): the casters' factors measured again (Assassin 0.95
   * → 0.8, Druid 0.9, Necromancer 0.9 → 1.05, Sorceress 1.5 → 1.1; README "Every skill on its own cooldown")
   */
  // lot 300 (levels to 30 by the act's end, stronger bosses, the ramp to ×5): measured again with tools/tiers.ts (README "Lot 300")
  // lot 302 (the threat carried by the clock, the late skills' floors): each class's no-gear survival brought to 2:30-3:35 (README "Act I tightened")
  /**
   * Lot 303: a class's signature skill in a Run, always among the level's cards while it can take a point (sim/offer.ts): the Paladin's
   * Zeal (required level 12) came by the cards' draw alone, at level 12 to 15 or never (his runs died in the Stony Field without it)
   */
  signature: { paladin: 'zeal' } as Record<string, string>,
  // lot 303 (the tiers of tools/tiers.ts recalibrated, a zone filling up slowly, the Paladin's Zeal and the Barbarian's plan): measured
  // again with `classTakenLate` for the classes whose survival was flat with their gear (README "Act I as a slope of gear tiers")
  // lot 313: the Sorceress 0.85 → 0.75 (her tier 1 died at the Cold Plains' end as her tier 0; the slowest to a first victory, runs 8
  // to 20 and one seed without), the Necromancer 1 → 0.85 (tiers 0 to 2
  // alike, no first victory in 25 runs for 4 seeds of 5); `classTakenLate` below (README "Lot 313")
  classTaken: { amazon: 0.4, assassin: 1.1, barbarian: 1.9, druid: 0.7, necromancer: 0.85, paladin: 1.2, sorceress: 0.75 } as Record<string, number>,
  /**
   * Seconds at least between two casts of a skill in Act I's flow (lot 294, owner: "Charged Bolt is spammed"; the other game's orders of
   * magnitude: a Sorceress's bolts every 0.3 to 0.6 s, Teeth every 1.2 s): a skill cast is cooled down until then (`p.cooldowns`, the
   * skills preview's fill), the weapon's attack and the melee strikes last that long at least (`skills.castFrames`). Without mana, the costly
   * skills (several missiles, an area) are held back by time instead. `default`: a skill absent from the table; `melee`: the weapon's
   * attack and the melee strikes absent from it. Measured by `tools/cadence.ts` (README "Cadence")
   */
  minCast: {
    default: 0.45,
    melee: 0.32,
    attack: 0.32,
    // lot 303: 0.4 → 0.6 (Zeal's two to five blows a swing, each one's splash wider, came at level 12 as a leap: the Paladin's survival
    // doubled from one gear tier to the next)
    zeal: 0.6,
    // lot 302: Sacrifice's swing (it costs the Paladin a share of the damage dealt) slower than his other strikes
    sacrifice: 1.2,
    fire_bolt: 0.4,
    ice_bolt: 0.4,
    charged_bolt: 0.6,
    fire_ball: 0.7,
    ice_blast: 0.6,
    lightning: 0.6,
    chain_lightning: 0.8,
    frost_nova: 1.2,
    nova: 1.2,
    static_field: 1.2,
    glacial_spike: 0.8,
    meteor: 1.5,
    blizzard: 1.8,
    frozen_orb: 1.2,
    teeth: 1.2,
    bone_spear: 0.8,
    bone_spirit: 1.0,
    corpse_explosion: 1.0,
    poison_nova: 1.5,
    magic_arrow: 0.4,
    fire_arrow: 0.45,
    cold_arrow: 0.45,
    multiple_shot: 1.0,
    exploding_arrow: 0.7,
    guided_arrow: 0.6,
    strafe: 1.0,
    immolation_arrow: 1.0,
    freezing_arrow: 1.0,
    jab: 0.5,
    power_strike: 0.5,
    charged_strike: 0.6,
    lightning_fury: 1.0,
    plague_javelin: 1.0,
    poison_javelin: 0.8,
    holy_bolt: 0.5,
    blessed_hammer: 0.6,
    fist_of_heavens: 1.2,
    charge: 2.5,
    leap: 2.5,
    leap_attack: 2.0,
    whirlwind: 0.5,
    double_throw: 0.5,
    psychic_hammer: 0.5,
    fire_blast: 0.6,
    // lot 309: the Werebear's stomp (a ring of eight shock waves, flagged a melee strike) swung at a strike's 0.36 s: 22 waves a second,
    // six times the next skill's damage on a pack; a stomp a 1.2 s at least (twice Diablo II's gesture)
    shock_wave: 1.2,
    // lot 302: a trap keeps firing for seconds (several alive at once): the traps and the Druid's lasting fires on floors of their own
    // (their share of an Assassin's or a Druid's damage 50 to 75 %: the act won from run 2 with the starter kit)
    shock_web: 1.6,
    charged_bolt_sentry: 2.0,
    wake_of_fire: 2.4,
    lightning_sentry: 2.0,
    wake_of_inferno: 2.6,
    death_sentry: 2.0,
    dragon_flight: 2.0,
    firestorm: 0.8,
    molten_boulder: 3.0,
    arctic_blast: 0.5,
    fissure: 1.2,
    eruption: 4.5,
    twister: 0.6,
    tornado: 0.8,
    volcano: 2.6,
    hurricane: 2.0,
    armageddon: 2.0,
  } as Record<string, number>,
  /**
   * Life of the normal monsters and minions, and the spawn ring's distance (units, just off the screen; lot 292c). Lot 306: 0.35 → 0.55
   * with the thinner field (fewer monsters, each a little sturdier: the gear tiers' survival kept)
   */
  normalLife: 0.55,
  /** Melee blows splash around their target (rule `combat.weaponSplash`) */
  splash: true,
  /**
   * Monsters the hero's missiles pass through after the first (rule `combat.missilePierce`, lot 294: the bow and the bolts clear the field
   * as the melee splash does; the archers and the Sorceress killed 1.4 to 1.9 monsters a second, the others 6 to 12)
   */
  pierce: 2,
  /** Arrows' own (the Amazon's bow: Diablo II's Pierce, without its points) */
  pierceArrows: 4,
  /**
   * The monsters' missiles aimed where the hero will be (rule `ai.missileLead`, lot 294, owner: "the ranged monsters never attack at
   * range"): they shot at the place he stood when their attack began, and missed a walking hero 98 % of the time (9 hits in 460 shots)
   */
  missileLead: 1,
  /** Their missiles' damage then (lot 294: aimed ahead, a tenth of the field's archers held a melee hero at the Dark Wood's entry) */
  missileDmg: 0.45,
  /**
   * Lot 303: a class's own factor on the monsters' missiles (1 when absent, over `missileDmg`): the Barbarian, a melee hero without a
   * ranged skill nor a trap, fell to the Dark Wood's archers (skeleton archers, rangers, spearwomen: 60 to 80 % of the damage he took
   * there) at 7:00 to 7:50 whatever his gear, tiers 3 to 5 alike
   */
  classMissile: { barbarian: 0.4, paladin: 0.4 } as Record<string, number>,
  /**
   * Lot 303: a melee class's factor on the monsters' hits at `lateAt` act seconds (`classTaken` at the act's start, linear in between,
   * `classTakenAt`): the Barbarian and the Paladin, in the crowd's midst, needed a high factor for their starter kit's death at 2:30-3:30
   * and with it fell in the Dark Wood whatever their gear (their survival flat from tier 2 to tier 5)
   */
  // lot 313: the Druid 0.5 (flat from tier 3 to 5, two seeds of five without a victory), the Necromancer 0.35 → 0.3, the Sorceress
  // 0.5 → 0.45, the Paladin 0.7 → 0.85 (a first victory at run 4 to 8, under the 8 to 20 wanted)
  classTakenLate: { barbarian: 0.4, paladin: 0.85, necromancer: 0.3, sorceress: 0.45, druid: 0.5 } as Record<string, number>,
  lateAt: 720,
  ring: 11,
  /** Monsters brought a second at most when the field thins */
  spawnRate: 16,
  /**
   * Lot 309 (owner: "the other game seems to bring the monsters in small packs rather than at random a little everywhere"): the field
   * brought in packs (sim/director.ts `fill`): a pack's size drawn from `sizes` ([size, weight]), one species, together just beyond the
   * screen's edge (within `spread` units of one point), waiting for a gap of half its size (`wait` s at most), one pack in `1 / lead` led
   * by a monster of another species of the zone; null: one monster at a time anywhere along the edge (lot 308)
   */
  packs: {
    // the other survivors game, observed for reference (lot 309, portrait, 3 minutes): first minute 23 packs mostly of 3-4, then about a third single monsters
    // and the rest 3 to 10; 32 of 51 groups one species; a new pack about 54 px across (1.5 units on our screen)
    sizes: [
      [1, 4],
      [2, 1],
      [3, 3],
      [4, 3],
      [5, 1],
      [6, 1],
      [8, 1],
    ],
    spread: 1.5,
    wait: 1.5,
    lead: 0.3,
  } as PackSpec | null,
  /** Life and mana a kill gives back, and every second (in place of `RUN.heal`, `RUN.regen`) */
  // lot 302: 0.004 → 0.003 (the quick killers healed 3 % of their life a second from their kills alone)
  heal: 0.003,
  /** Monsters' damage and life grow by this share a minute of the act (the gear, not the level, carries the hero) */
  // lot 300: steeper and higher (×4 at 6:00), the hero reaching level 30 by the act's end (`levels`)
  // lot 301: the monsters' damage a little steeper (0.5 → 0.6), the field brought beyond the screen
  // lot 302: steeper still at first (0.6 → 1, ×6 at most), then the late curves over it, the threat growing with the hero to the end:
  // `lifeAt` (×45 by Andariel: the hero's damage grows twentyfold from level 12 to 30), `dmgAt` (×2.6), `speedAt` (the monsters ×1.85
  // quicker: a hero who keeps his distance is caught up with); before, the ramp stopped at 5:00 and a hero past it won (README "Act I tightened")
  ramp: {
    dmg: 1,
    life: 0.4,
    max: 6,
    from: 0,
    // lot 303: the life's curve gentler late (×45 → ×16 by Andariel: the lair's monsters outgrew every hero's damage, tiers 3 to 5 died
    // there alike), the damage's climbing all through the Dark Wood and the lair instead (README "Act I as a slope of gear tiers")
    lifeAt: [
      [240, 1],
      [360, 2],
      [480, 4],
      [600, 8],
      [740, 16],
    ],
    dmgAt: [
      [360, 1],
      [450, 1.3],
      [540, 1.6],
      [640, 1.9],
      [740, 2.3],
    ],
    speedAt: [
      [150, 1],
      [450, 1.4],
      [740, 1.85],
    ],
  } as {
    dmg: number;
    life: number;
    max: number;
    from: number;
    lifeAt?: readonly (readonly [number, number])[];
    dmgAt?: readonly (readonly [number, number])[];
    speedAt?: readonly (readonly [number, number])[];
  },
  /**
   * A zone's population at most at its start, and more a second. Lot 303: [8, 4] → [12, 1.5], the field full after about 50 s instead
   * of 20 (a whole fresh field at once at every zone's entry: the deaths gathered 20 to 40 s into each zone, whatever the gear)
   */
  entry: [12, 1.5] as readonly [number, number],
  regen: 0.01,
  zoneSec: 60,
  /**
   * Act I's zones and their seconds (lot 292c, owner's note: "every 3 minutes a mini-boss: 3 min Blood Raven, 6 Rakanishu, 9 the Countess,
   * 12 Andariel"): each zone ends on its mini-boss (it comes `minibossBefore` s before the zone's end), the lair's boss at `bossAt`
   */
  zones: [
    ['a1r1', 90],
    ['a1r2', 90],
    ['a1r3', 180],
    ['a1r4', 180],
    ['a1r7', 180],
  ] as readonly (readonly [string, number])[],
  minibossBefore: 15,
  /**
   * Seconds the act's clock counts between two zones (the countdown's own length before lot 305): the ramps of the act (density, damage,
   * life) keep their measured times whatever the countdown lasts
   */
  clockGap: 4,
  /**
   * A zone's own factor on the monsters' damage (lot 294): Andariel's lair's monsters are 6 levels above the Dark Wood's (Levels.txt), and
   * every hero met them as a wall at 9:16, whatever his gear (none passed it in 84 runs of tools/tiers.ts)
   */
  // lot 302: the steps between zones smoothed (the Cold Plains +50 %, the Stony Field +40 %, the lair +50 % over the zone before)
  // lot 303: the Dark Wood 0.65 → 0.9 (it was the act's easy stretch: a hero past Rakanishu reached the lair)
  // lot 313: the Dark Wood 0.9 → 1 (tier 3's rares lived 74 % longer than tier 2's magic items, tiers 4-5 15 % and 8 % more)
  zoneDmg: { a1r2: 0.85, a1r3: 0.75, a1r4: 1, a1r7: 0.2 } as Record<string, number>,
  /**
   * Lot 302: a zone's own factor on its monsters' life (the elites' and the fodder's; not the act's boss): Diablo II's zones step up at
   * each entry (the Stony Field's fodder 40 % more life than the Cold Plains', the lair's four times the Dark Wood's), the steps smoothed
   * so that the clock (`ramp`) carries the threat
   */
  // lot 303: the Dark Wood 0.6 (its fodder had 60 % more life than the Stony Field's end), the lair 0.17 → 0.21
  zoneLife: { a1r3: 0.8, a1r4: 0.6, a1r7: 0.21 } as Record<string, number>,
  /**
   * Live monsters by act second around the hero (lot 292c: a dense field, the hero killing 4 to 5 a second in the thick of it), with
   * `offscreenShare` more on their way. Lot 306 (the owner: "too dense, compare with the other survivors game": about 5 on screen at 0:10, 10 at
   * 0:30, 15 at 1:00, 30 to 100 from 2:00-3:00; ours measured 21, 23, 29, 42 at 2:00, 73 at 3:00, two to three times the other game's
   * kills): the first three minutes thinner (alive about 6, 9, 15, 40 at 2:00, 57 at 3:00), the field full (the density setting's 90) by 6:00
   * as before (README "The act screen and a thinner field"). Lot 309 (owner: "I feel we cut the monsters too much"): the other game
   * measured in a phone's window held upright (counted on screen: 4 at 0:15-0:30, 8 at 1:00, 50 at 2:00, 67 at 3:00): 2:00 and 3:00
   * raised to it (37 → 45, 52 → 63), the first minute kept
   */
  density: [
    [0, 4],
    [30, 8],
    [60, 13],
    [120, 45],
    [180, 63],
    [240, 66],
    [360, 78],
    [720, 90],
  ] as readonly (readonly [number, number])[],
  meleeUntil: 30,
  softUntil: 60,
  warn: 2.5,
  unique: 25,
  champions: 12,
  encircle: 35,
  miniboss: 45,
  bossAt: 180,
  /** Experience of a kill, times Diablo II's (in place of `RUN.xp`: a 6-minute act) */
  xp: 2,
  /** Live monsters at most in the act boss's lair (the boss is the fight) */
  bossDensity: 45,
  /**
   * Lot 300 (owner: "the bosses and mini-bosses are too weak: make them real peaks of difficulty"): the zones' mini-bosses and Andariel,
   * their life and damage times these (over `RUN.mercyAct1`'s bossLife and eliteDmg), their whole escort, a call for `call` of their escort
   * every `callEvery` s, a fury under `enrage` of their life. Measured with tools/tiers.ts (README "Bosses as walls")
   */
  boss: { life: { miniboss: 3, boss: 2 } as Record<string, number>, dmg: { miniboss: 3, boss: 2 } as Record<string, number>, callEvery: 12, call: 3, enrage: 0.4, fury: 1.3 },
  /**
   * Lot 313: a zone's own factors on its mini-boss's life and damage (over `boss.life.miniboss`, `boss.dmg.miniboss`). Blood Raven
   * (the Cold Plains, 3:00) was the act's wall whatever the gear below rares: the Barbarian's runs of tiers 0 to 2 and the Paladin's of
   * tiers 0 and 1 died to her at 3:07-3:20 (17 of 30 and 11 of 20 in tools/tiers.ts) or went on to the Dark Wood and beyond, a curve in
   * two humps. Her life does not matter (the automatic aim strikes the nearest, her escort between): her arrows ×0.6 (README "Lot 313")
   */
  bossZone: { a1r2: { dmg: 0.6 } } as Record<string, { life?: number; dmg?: number }>,
  /** Levels of an elite's chest: a unique's, the zone's mini-boss's (lot 294, the other game's chests: 1 to 3 levels) */
  chest: { unique: 1, miniboss: 2 },
  /**
   * The hero's level by the act's second at least (lot 294, the owner's comparison with the other game: level 2 at 0:13-0:30, 3 at
   * 0:33-0:49, 4 at 0:48-1:00, 5 at 1:12-2:10, then a level every 30 to 60 s), linear between its points; `levelAhead` levels above it the
   * kills give Diablo II's experience only (`flowLevel`)
   */
  levels: [
    [0, 1],
    [10, 2],
    [20, 3],
    [32, 4],
    [45, 5],
    [60, 6],
    [100, 8],
    [150, 10],
    [210, 12],
    [300, 15],
    [390, 18],
    [540, 24],
    [690, 30],
  ] as readonly (readonly [number, number])[],
  /**
   * Lot 300 (owner: "in a run we do not climb high enough; reach the last skills before the end, fewer ranks a skill"): points a skill
   * may take in a run (the cards stop offering it; Diablo II's 20 before), the other game's evolutions being capped too
   */
  skillRank: 5,
  levelAhead: 2,
  /** Loot walked over within this distance (units), no gold taken from afar (the other game's: no vacuum but at the act boss's fall) */
  reach: 1.7,
};

/** The bosses' powers of a zone of Act I's flow: `FLOW.boss`, its mini-boss's life and damage times the zone's `FLOW.bossZone` (lot 313) */
export function zoneBossPowers(zone: string): (typeof FLOW)['boss'] {
  const k = FLOW.bossZone[zone];
  if (!k) return FLOW.boss;
  const b = FLOW.boss;
  return {
    ...b,
    life: { ...b.life, miniboss: (b.life.miniboss ?? 1) * (k.life ?? 1) },
    dmg: { ...b.dmg, miniboss: (b.dmg.miniboss ?? 1) * (k.dmg ?? 1) },
  };
}

/**
 * The class's factor on the monsters' hits at `actSec` seconds of Act I's flow (lot 303): `classTaken` at the act's start, towards
 * `classTakenLate` (when the class has one) by `lateAt`, linear in between
 */
export function classTakenAt(cls: string, actSec: number): number {
  const k0 = FLOW.classTaken[cls] ?? 1;
  const k1 = FLOW.classTakenLate[cls];
  if (k1 === undefined) return k0;
  const f = Math.min(1, Math.max(0, actSec / FLOW.lateAt));
  return k0 + (k1 - k0) * f;
}

/** Seconds of Act I's flow in a world of the flow (its director's clock; 0 without one) */
export function flowActSec(w: { run?: { director?: unknown } | null; tick: number }): number {
  const d = w.run?.director as { actSec?: (s: number) => number; sec?: (w: unknown) => number } | undefined;
  return d?.actSec && d.sec ? d.actSec(d.sec(w)) : 0;
}

/** Frames factor of a strike or cast in Act I's flow for the hero of `cls` */
export function flowCadence(cls: string): number {
  return FLOW.cadence * (FLOW.classCadence[cls] ?? 1);
}

/** Seconds at least between two casts of `id` in Act I's flow (`FLOW.minCast`); `melee`: a weapon strike */
export function minCastOf(id: string, melee: boolean): number {
  const t = FLOW.minCast[id] ?? (melee ? FLOW.minCast.melee : FLOW.minCast.default);
  // lot 298: a spell never quicker than `spellMin` (the weapon's attack and the melee strikes keep their swing's rhythm)
  // lot 301: every spell cast on its own cooldown beside the others (no more one spell every 0.5 s): the floors × `spellScale`
  return melee || id === 'attack' ? t : Math.max(t, FLOW.spellMin) * FLOW.spellScale;
}

/**
 * Frames of a strike or cast in Act I's flow (rule `skills.castFrames`): Diablo II's × the mode's cadence, a weapon strike (the attack, a
 * melee skill) lasting `minCastOf` at least (it has no cooldown: its frames are its rhythm)
 */
export function flowFrames(cls: string, id: string, frames: number, melee: boolean): number {
  const f = frames * flowCadence(cls);
  return melee ? Math.max(f, minCastOf(id, true) * TICK_HZ) : f;
}

/**
 * A skill the hero just cast in Act I's flow (rule `skills.onCast`, lot 298: the main cast or one beside it): cooled down `every` seconds
 * from now (its own floor `minCastOf` by default), so that it is not cast again sooner (the skills preview shows the wait); the weapon's
 * strikes are held by their frames instead (`flowFrames`). Lot 301 (owner: "a cast seems to push the others' cooldowns back; every skill
 * independent"): ONLY this skill's cooldown; lot 298's `castGap` (every other spell learned held 0.5 s after a spell) is gone
 */
export function floorCast(w: { tick: number; player: { cooldowns: Record<string, number> } }, id: string, melee: boolean, every = minCastOf(id, false), anim = 0): void {
  if (id === 'attack' || melee) return;
  const cd = w.player.cooldowns;
  // lot 309: never quicker than `animK` times its own cast animation (`anim`, seconds at the hero's cast rate)
  cd[id] = Math.max(cd[id] ?? 0, w.tick + Math.ceil(Math.max(every, minCastOf(id, false), FLOW.animK * anim) * TICK_HZ));
}

/** Seconds between two casts of a spell `id` of the class `cls` in Act I's flow (its floor and the class's factor, as `floorCast` sets it) */
export function spellCooldown(id: string, cls: string): number {
  return minCastOf(id, false) * Math.max(1, FLOW.classSpell[cls] ?? 1);
}

/**
 * Lot 309: the missiles a cast of a several-missile skill fires in Act I's flow (rule `skills.missileCount`, `n` Diablo II's): no more
 * than `boltRate` a second over its cooldown (`spellCooldown`), one at least; the base folds the others into their damage
 */
export function flowMissiles(cls: string, id: string, n: number): number {
  return Math.max(1, Math.min(n, Math.floor(FLOW.boltRate * spellCooldown(id, cls) + 1e-9)));
}

/** The hero's level at least at `actSec` seconds of Act I's flow (`FLOW.levels`, linear between its points; whole levels) */
export function flowLevel(actSec: number): number {
  return Math.floor(lerpPoints(FLOW.levels, actSec));
}

function lerpPoints(pts: readonly (readonly [number, number])[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, n1] = pts[i];
    const [t0, n0] = pts[i - 1];
    if (x <= t1) return n0 + ((n1 - n0) * (x - t0)) / (t1 - t0);
  }
  return pts[pts.length - 1][1];
}

/** Live monsters wanted at `actSec` seconds of the act's flow (`FLOW.density`, linear between its points) */
export function flowDensity(actSec: number): number {
  // lot 301: the monsters brought beyond the screen are on their way a few seconds: more of them alive for as many around the hero
  // lot 306: a share of the curve (14 more at any time before: the first minute's field twice the other game's)
  return densityCurve(actSec) * (FLOW.offscreen ? 1 + FLOW.offscreenShare : 1);
}

/** The field's curve (`FLOW.density`, linear between its points): the monsters wanted around the hero */
export function densityCurve(actSec: number): number {
  const pts = FLOW.density;
  if (actSec <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, n1] = pts[i];
    const [t0, n0] = pts[i - 1];
    if (actSec <= t1) return n0 + ((n1 - n0) * (actSec - t0)) / (t1 - t0);
  }
  return pts[pts.length - 1][1];
}

/** Is the world a zone of a Run played as an act's flow (Act I in Normal, lot 291)? */
export function inFlow(w: { run?: { runId: string } | null; difficulty: number; character: CharacterState }): boolean {
  const round = roundOfRun(w.run?.runId);
  return !!round && isRunMode(w.character) && flowActive(round.act, w.difficulty);
}

/** Is a zone of `act` in difficulty `d` played as the act's timed flow (lot 291: Act I in Normal)? */
export function flowActive(act: number, _d: number): boolean {
  // lot 292 (Act I focus, the endgame farm): Act I in every difficulty
  return act === 1;
}

/** The director's flow for the zone `index` (0-based) of `act` in difficulty `d`, or undefined (`flowActive`) */
export function actFlow(act: number, d: number, index: number, boss = false): ActFlow | undefined {
  if (!flowActive(act, d) || index < 0 || index >= FLOW.zones.length) return undefined;
  const secs = FLOW.zones[index][1];
  let actSec0 = 0;
  for (let i = 0; i < index; i++) actSec0 += FLOW.zones[i][1] + FLOW.clockGap;
  return {
    actSec0,
    zoneEnd: boss ? Infinity : secs,
    target: boss ? (t) => Math.min(FLOW.bossDensity, flowDensity(t)) : flowDensity,
    meleeUntil: FLOW.meleeUntil,
    warn: FLOW.warn,
    bossAt: FLOW.bossAt,
    softUntil: FLOW.softUntil,
    chest: FLOW.chest,
    gold: true,
    normalLife: FLOW.normalLife,
    ring: FLOW.ring,
    offscreen: FLOW.offscreen,
    spawnRate: FLOW.spawnRate,
    ...(FLOW.packs ? { packs: FLOW.packs } : {}),
    ramp: { ...FLOW.ramp, zoneLife: FLOW.zoneLife[FLOW.zones[index][0]] ?? 1 },
    entry: FLOW.entry,
    level: flowLevel,
    ahead: FLOW.levelAhead,
    boss: zoneBossPowers(FLOW.zones[index][0]),
    // a zone's events spread over its length (lot 292c): champions at a fifth, the zone's unique at two fifths, an encirclement at three
    // fifths (from the second zone), the mini-boss `minibossBefore` s before its end
    events: {
      champions: index >= 1 ? Math.round(secs * 0.2) : null,
      encircle: index >= 1 ? Math.round(secs * 0.6) : null,
      unique: Math.round(secs * 0.4),
      miniboss: secs - FLOW.minibossBefore,
    },
  };
}
