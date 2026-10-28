/**
 * State of the mode for a game session (not saved: the brain, the automatic attack switch, the controls' timers) and the mode's settings
 * (`Settings.mods.survivals`, declared in index.ts, saved with the game's settings). The progress itself (checkpoints) is in the
 * character's milestones (see checkpoints.ts); a round in progress is kept in the save by its director (director.ts, `snapshot`).
 */
import type { BotBrain, Game } from '../../../src/mods/sdk';

export interface SurvivalsState {
  brain: BotBrain | null;
  /** Semi-automatic: automatic attack on (always since lot 290: no switch nor attack button; tools/bench.ts turns it off) */
  autoAttack: boolean;
  /** Target kept by the automatic aim (hysteresis) */
  targetId: number;
  /** Automatic mode: survival escape in progress until this tick, none before that one */
  fleeUntil: number;
  fleeBlock: number;
  /** Automatic melee: target being closed in on (best distance, since when), targets given up until a tick */
  chase: { id: number; best: number; since: number } | null;
  banned: Map<number, number>;
  /** Run seen last (a new one resets the timers above) */
  run: unknown;
  /** Rerolls of the level-up cards out of a round (in town): those of a round are its director's, kept in the save with it */
  townRerolls: { free: boolean; paid: number };
  /** A character just created: the hub starts its first round at once (ui/hub.ts) */
  autoStart: boolean;
  /** Semi-automatic: tick of the last attack made while walking (lot 288) */
  walkAttackAt: number;
  /** Last hit taken in a round (lot 288: the lost round's screen names the killer): monster, kind, damage, element, tick */
  lastHurt: { monster: string; kind: string; amount: number; elem: string; tick: number } | null;
  /** Hits taken in the last `BURST_SECONDS` (lot 291: the death screen tells the damage of the last 3 s) */
  hurts: { tick: number; amount: number }[];
  /** The last round lost (lot 288): shown by the hub until the next round starts */
  lastDeath: LostRound | null;
  /** Run mode (lot 289): names of the items picked up in the run in progress, and the last run's end (the run-end screen, once) */
  runItems: string[];
  runEnd: RunEnd | null;
  /**
   * Lot 305 (owner: "the act's boss killed teleports straight to town; to avoid that loading, leave the hero in the zone, paused, and
   * show the same end screen"): the won run's end shown over the boss's zone, kept until the player leaves it (shop closed: shown again)
   */
  endHere: RunEnd | null;
}

/** The end of a run (lot 289, Run mode): what the run-end screen tells */
export interface RunEnd {
  outcome: 'victory' | 'death' | 'left';
  act: number;
  d: number;
  /** Zone reached: name, its rank in the act (1-based) and the act's zones */
  zone: string;
  zoneIndex: number;
  zones: number;
  sec: number;
  level: number;
  kills: number;
  gold: number;
  items: number;
  itemNames: string[];
  killer: LostRound['killer'];
  /** Damage taken in the last 3 s before the death (lot 291) */
  burst?: number;
  /** Records beaten (`best`, `kills`, `deep`; a first run sets them without telling) */
  records: string[];
  /** Act opened by the victory (null: none), difficulty opened (Baal) */
  nextAct: number | null;
  nextDifficulty: boolean;
  /** A victory faster than every one before, the first included (lot 292: "New best time") */
  bestTime?: boolean;
  /** Lot 296: the longest run of the act and difficulty (seconds, this one included), and whether this run beat it */
  survival?: number;
  bestSurvival?: boolean;
  /** The gold in the purse at the run's end (lot 292: the run's gold flows into it on the run-end screen) */
  purse?: number;
  /** Items of the run left in the temporary pages, the bag full (lot 293) */
  pages?: number;
}

/** A round lost: where, when, by whom (lot 288) */
export interface LostRound {
  round: string;
  name: string;
  sec: number;
  level: number;
  kills: number;
  killer: { monster: string; kind: string; amount: number; elem: string } | null;
  /** Damage taken in the last 3 s before the death (lot 291) */
  burst?: number;
}

const STATES = new WeakMap<Game, SurvivalsState>();

export function stateOf(g: Game): SurvivalsState {
  let s = STATES.get(g);
  if (!s) {
    s = {
      brain: null,
      autoAttack: true,
      targetId: 0,
      fleeUntil: 0,
      fleeBlock: 0,
      chase: null,
      banned: new Map(),
      run: null,
      townRerolls: { free: true, paid: 0 },
      autoStart: false,
      walkAttackAt: -1e9,
      lastHurt: null,
      hurts: [],
      lastDeath: null,
      runItems: [],
      runEnd: null,
      endHere: null,
    };
    STATES.set(g, s);
  }
  // a new round
  const run = g.world?.run ?? null;
  if (run && run !== s.run) {
    s.run = run;
    // ticks start again with each world: the timers of the previous round mean nothing here
    s.banned.clear();
    s.chase = null;
    s.fleeUntil = 0;
    s.fleeBlock = 0;
    s.targetId = 0;
    s.walkAttackAt = -1e9;
    s.lastHurt = null;
    s.hurts = [];
    s.lastDeath = null;
  }
  return s;
}

/** Settings of the mode: defaults when the player has none (tests, tools) */
export const SETTINGS = {
  /** Lot 290: no manual control (no skill nor attack button in the mode); a saved 'manual' reads as the default */
  control: { app: 'semi', values: ['semi', 'auto'] },
  density: { app: 90, values: [60, 90, 120] },
  stats: { app: 'balanced', values: ['balanced', 'vitality', 'manual'] },
  cards: { app: 'choose', values: ['choose', 'auto'] },
  /** Fewer live monsters and fewer things drawn while the frames stay slow (sim/adaptive.ts) */
  adaptive: { app: 'on', values: ['on', 'off'] },
  /** Floating joystick (lot 287): automatic (the centre in portrait, the thumb's side in landscape), left, centre or right (ui/controls.ts) */
  joystick: { app: 'auto', values: ['auto', 'left', 'center', 'right'] },
} as const;

export type SettingName = keyof typeof SETTINGS;

export function setting(g: Game, key: SettingName): string | number {
  const v = g.settings.mods?.survivals?.[key];
  const spec = SETTINGS[key];
  return v !== undefined && (spec.values as readonly (string | number)[]).includes(v as string | number) ? (v as string | number) : spec.app;
}

export function setSetting(g: Game, key: SettingName, v: string | number): void {
  const s = g.settings;
  s.mods ??= {};
  s.mods.survivals = { ...(s.mods.survivals ?? {}), [key]: v };
}

/** The game whose step is running (set by the autopilot before each step): the director reads its settings */
let current: Game | null = null;
export function setCurrentGame(g: Game): void {
  current = g;
}
export function currentGame(): Game | null {
  return current;
}

/** Is this world a round of the mode (a run `survivals:*`)? */
export function inRoundWorld(w: { run?: { runId: string } | null }): boolean {
  return !!w.run?.runId.startsWith('survivals:');
}

/**
 * Mana in a round (lot 292b, owner's test: "the mana goes down too fast; in the other game it never shows"): a skill costs `share` of
 * Diablo II's cost (a Whirlwind of 25 mana: 3.75), the kills and the regeneration of the mode giving the rest back. Lot 294 (owner: no mana
 * at all, as the other survivors game): in Act I's flow of the Run (`inFlow`) a skill costs `flow` of it (none), the hero's mana is kept
 * full (Energy Shield absorbs its share of every hit, never drained) and the HUD shows no mana gauge
 */
export const MANA = { share: 0.15, flow: 0 };
