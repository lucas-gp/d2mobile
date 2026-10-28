/**
 * Adaptive density and drawing caps of a round (lot 284, S5): a hundred monsters coming, dying and shooting cost more to draw than to
 * simulate (the simulation of 120 live monsters costs about 0.4 ms a step on a 16-core machine; a frame in software rendering 30 to 50 ms). The mode
 * therefore:
 * - caps what is drawn during a round (rule `render.limits`): corpses, projectiles and damage numbers drawn at most, share of the particles,
 *   by load level; the simulation keeps every monster, missile and hit;
 * - measures the frames shown (the HUD's `update`, called on every frame) and, when they stay slow (`SLOW_MS` at the 75th percentile over
 *   about 2 s), goes up a load level: fewer live monsters (`capShare` of the "density" setting, 40 at least) and fewer things drawn; when they
 *   are quick again for `RECOVER_S` seconds, back down a level. Setting "Adaptive density" (on by default).
 * Only the application measures frames: in the tools, tests and bots the level stays 0 (the density setting alone, deterministic).
 */
import type { RenderLimits } from '../../../src/mods/api';

/** Load levels: share of the density setting kept as live monsters, and the drawing caps */
/**
 * Lot 285 (owner: "a clean screen, the monsters and the danger readable at a glance"): even at level 0, few corpses (12), damage numbers
 * (10) and particles (60 %); the projectiles, the danger, keep their cap
 */
export const LOAD_LEVELS: readonly (RenderLimits & { capShare: number })[] = [
  { capShare: 1, corpses: 12, missiles: 120, floaters: 10, particles: 0.6 },
  { capShare: 0.85, corpses: 10, missiles: 80, floaters: 8, particles: 0.45 },
  { capShare: 0.7, corpses: 8, missiles: 56, floaters: 6, particles: 0.3 },
  { capShare: 0.55, corpses: 6, missiles: 40, floaters: 5, particles: 0.2 },
];

/** Live monsters at least, whatever the load (a round still a horde) */
export const MIN_ADAPTIVE_CAP = 40;
/** A frame this slow or slower at the 75th percentile: one level up (≈ 36 frames a second) */
export const SLOW_MS = 28;
/** A frame this quick or quicker at the 75th percentile for `RECOVER_S` seconds: one level down (≈ 50 frames a second) */
export const QUICK_MS = 20;
export const RECOVER_S = 8;
/** Frames measured before a decision, and seconds between two changes */
const WINDOW = 120;
const COOLDOWN_S = 4;

/** Frame governor: frame intervals in, load level out (pure: the clock is given) */
export class FrameGovernor {
  level = 0;
  private times: number[] = [];
  private last = -1;
  private changedAt = -Infinity;
  private quickSince = -1;

  /** A frame shown at `nowMs`; returns the new level when it changes, else null */
  frame(nowMs: number): number | null {
    const dt = this.last < 0 ? -1 : nowMs - this.last;
    this.last = nowMs;
    // a pause, a hidden tab, a panel open: not a measure of the drawing
    if (dt <= 0 || dt > 250) return null;
    this.times.push(dt);
    if (this.times.length > WINDOW) this.times.shift();
    if (this.times.length < WINDOW / 2 || nowMs - this.changedAt < COOLDOWN_S * 1000) return null;
    const p75 = [...this.times].sort((a, b) => a - b)[Math.floor(this.times.length * 0.75)];
    if (p75 >= SLOW_MS && this.level < LOAD_LEVELS.length - 1) return this.set(this.level + 1, nowMs);
    if (p75 <= QUICK_MS && this.level > 0) {
      if (this.quickSince < 0) this.quickSince = nowMs;
      if (nowMs - this.quickSince >= RECOVER_S * 1000) return this.set(this.level - 1, nowMs);
    } else this.quickSince = -1;
    return null;
  }

  /** Out of a round: measures forgotten, the level kept for the next round (the same device) */
  pause(): void {
    this.last = -1;
    this.times = [];
    this.quickSince = -1;
  }

  reset(): void {
    this.pause();
    this.level = 0;
    this.changedAt = -Infinity;
  }

  private set(level: number, nowMs: number): number {
    this.level = level;
    this.changedAt = nowMs;
    this.times = [];
    this.quickSince = -1;
    return level;
  }
}

/** The governor of this session (the application's frames; level 0 in the tools) */
export const governor = new FrameGovernor();

/** Load level in effect for a game (0 when the setting "Adaptive density" is off) */
export function loadLevel(adaptive: boolean): number {
  return adaptive ? governor.level : 0;
}

/** Live monsters at most for a density setting at a load level */
export function adaptiveCap(cap: number, level: number): number {
  const share = LOAD_LEVELS[Math.max(0, Math.min(LOAD_LEVELS.length - 1, level))].capShare;
  return share >= 1 ? cap : Math.min(cap, Math.max(MIN_ADAPTIVE_CAP, Math.round(cap * share)));
}

/** Drawing caps of a game: those of the load level during a round, the base's otherwise (`null`) */
export function roundLimits(inRound: boolean, level: number): RenderLimits | null {
  if (!inRound) return null;
  const { corpses, missiles, floaters, particles } = LOAD_LEVELS[Math.max(0, Math.min(LOAD_LEVELS.length - 1, level))];
  return { corpses, missiles, floaters, particles };
}
