/**
 * Lot 316 — the Campaign's zones kept for the session, as Diablo II keeps a game's levels until the game is left: a zone left by its
 * waypoint, stairs, an exit, a portal or a death is found again as it was (monsters killed, chests opened, items on the ground) when the
 * hero comes back; before, every visit built and populated it anew.
 *
 * Only the Campaign's zones (`isCampaignZone`) are kept (never a town, a Rush run, a game mode's round or an endgame map), keyed by zone
 * and difficulty, with the seed they were built from. The zones joined edge to edge alive together (src/sim/seam-worlds.ts) hand theirs
 * here when they leave the chain, and take them back from here when the hero walks toward them.
 *
 * Memory: at most `KEEP_MAX` worlds and about `KEEP_BYTES` (an estimate from their grids and entities); the zone left longest ago goes
 * first. `release` drops the oldest on demand (the application under memory pressure). The kept zones are not saved: after a reload
 * (as after leaving a Diablo II game) a zone is built again from its seed.
 */
import type { World } from './world';
import type { Difficulty } from '../data/types';

/** Worlds kept at most (besides the zone the hero is in and its joined neighbours) */
export const KEEP_MAX = 12;
/** About this many bytes at most (estimate, `worldBytes`) */
export const KEEP_BYTES = 96 * 2 ** 20;

/** Identifier ranges (`WorldOptions.idBase`): 2^24 apart, as the seam manager's */
export const ID_STEP = 2 ** 24;
/** Ranges available (2^24 × 120 < 2^31) */
export const ID_SLOTS = 120;

interface Kept {
  world: World;
  difficulty: Difficulty;
  seed: number;
  /** order of keeping (the oldest goes first) */
  at: number;
  bytes: number;
}

/** A rough size of a world in memory: its grid's typed arrays and flow field, its entities */
export function worldBytes(w: World): number {
  const cells = w.grid.cols * w.grid.rows;
  return cells * 24 + (w.monsters.length + w.items.length + w.objects.length) * 1500 + 64 * 1024;
}

export class ZoneKeep {
  private kept = new Map<string, Kept>();
  private seq = 0;

  private static key(id: string, d: Difficulty): string {
    return `${d}:${id}`;
  }

  /** Number of worlds kept (tests, measures) */
  get size(): number {
    return this.kept.size;
  }

  /** Estimated bytes kept */
  get bytes(): number {
    let n = 0;
    for (const k of this.kept.values()) n += k.bytes;
    return n;
  }

  /** The ids of the zones kept (tests) */
  ids(): string[] {
    return [...this.kept.keys()];
  }

  /** Keeps `w` as zone `id` (its run's: a tomb's map is the `tombs` zone) at its difficulty, built from its seed, replacing an older one */
  put(w: World, id: string): void {
    const k = ZoneKeep.key(id, w.difficulty);
    this.kept.set(k, { world: w, difficulty: w.difficulty, seed: w.seed, at: ++this.seq, bytes: worldBytes(w) });
    this.trim();
  }

  /** The kept world of zone `id` at difficulty `d` (taken out of the store), if it was built from `seed` (when given) */
  take(id: string, d: Difficulty, seed?: number): World | null {
    const k = ZoneKeep.key(id, d);
    const e = this.kept.get(k);
    if (!e) return null;
    this.kept.delete(k);
    if (seed !== undefined && e.seed >>> 0 !== seed >>> 0) return null;
    return e.world;
  }

  /** The kept world of zone `id` at difficulty `d`, left in the store (its zone's graphics prepared ahead) */
  peek(id: string, d: Difficulty): World | null {
    return this.kept.get(ZoneKeep.key(id, d))?.world ?? null;
  }

  /** Is zone `id` kept at difficulty `d`? */
  has(id: string, d: Difficulty): boolean {
    return this.kept.has(ZoneKeep.key(id, d));
  }

  /** Forgets `w` if it is kept (it was taken back another way: the portal to the zone of a death) */
  drop(w: World): void {
    for (const [k, e] of this.kept) if (e.world === w) this.kept.delete(k);
  }

  /** Forgets every zone (a new difficulty, the game left) */
  clear(): void {
    this.kept.clear();
  }

  /** Drops the `n` zones kept longest ago (all by default): memory pressure. Returns how many were dropped */
  release(n = Infinity): number {
    const old = [...this.kept.entries()].sort((a, b) => a[1].at - b[1].at);
    let k = 0;
    for (const [key] of old) {
      if (k >= n) break;
      this.kept.delete(key);
      k++;
    }
    return k;
  }

  /** The identifier ranges the kept worlds use */
  bases(): Set<number> {
    return new Set([...this.kept.values()].map((e) => e.world.idBase));
  }

  private trim(): void {
    while (this.kept.size > KEEP_MAX || (this.kept.size > 1 && this.bytes > KEEP_BYTES)) this.release(1);
  }
}

/** The lowest identifier range (0, ID_STEP, 2 ID_STEP…) not in `used` */
export function freeIdBase(used: Set<number>): number {
  for (let k = 0; k < ID_SLOTS; k++) if (!used.has(k * ID_STEP)) return k * ID_STEP;
  return 0;
}
