/**
 * Budget of the drawing (lot 284, S9), pure logic without Pixi (tested: tests/unit/render-budget.test.ts):
 * - `ViewPool`: display objects kept for reuse instead of destroyed and created again (a monster that dies and a new one that comes, a
 *   projectile that ends and the next one), up to a size;
 * - `newestCut`: what to keep of a list capped at its newest entries (corpses, projectiles: rule `render.limits`);
 * - `inView`: an actor's sprite position inside the drawn rectangle (actors outside are hidden, not animated).
 */
import type { RenderLimits } from '../mods/rules';

export type { RenderLimits };

/** Display objects released for reuse, at most `max` (the others are destroyed); `made` and `reused` count for the measures */
export class ViewPool<T> {
  private free: T[] = [];
  made = 0;
  reused = 0;
  destroyed = 0;
  constructor(
    private readonly max: number,
    private readonly destroy: (v: T) => void,
  ) {}

  /** A released object (reset by `reset`), or a new one */
  take(make: () => T, reset: (v: T) => void): T {
    const v = this.free.pop();
    if (v !== undefined) {
      this.reused++;
      reset(v);
      return v;
    }
    this.made++;
    return make();
  }

  /** Released: kept for the next `take` while there is room, else destroyed */
  give(v: T, hide: (v: T) => void): void {
    if (this.free.length < this.max) {
      hide(v);
      this.free.push(v);
    } else {
      this.destroyed++;
      this.destroy(v);
    }
  }

  /** Objects waiting for reuse */
  get size(): number {
    return this.free.length;
  }

  /** Every object released is destroyed */
  clear(): void {
    for (const v of this.free) this.destroy(v);
    this.free = [];
  }

  /** Every object released is forgotten without being destroyed (the zone changes: their layers were emptied and destroyed with them) */
  forget(): void {
    this.free = [];
  }
}

/**
 * Lowest key kept when only the `limit` highest keys are (keys: death ticks, identifiers: the newest), -Infinity when everything is kept.
 * `keys` is sorted in place.
 */
export function newestCut(keys: number[], limit: number): number {
  if (!(limit < keys.length)) return -Infinity;
  if (limit <= 0) return Infinity;
  keys.sort((a, b) => b - a);
  return keys[limit - 1];
}

/** Rectangle drawn, in the scene's coordinates (before the camera), with a margin */
export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A sprite anchored at (sx, sy) in the scene can show in the rectangle (its height above its feet counted) */
export function inView(r: ViewRect | null, sx: number, sy: number): boolean {
  if (!r) return true;
  return sx > r.x0 - 160 && sx < r.x1 + 160 && sy > r.y0 - 80 && sy < r.y1 + 260;
}

/** Limits as given by the rule, made safe (numbers, at least the base's floor of 1 damage number and no negative cap) */
export function safeLimits(l: Partial<RenderLimits> | null | undefined, base: Readonly<RenderLimits>): RenderLimits {
  const n = (v: unknown, d: number, lo: number) => (typeof v === 'number' && !Number.isNaN(v) ? Math.max(lo, v) : d);
  return {
    corpses: n(l?.corpses, base.corpses, 0),
    missiles: n(l?.missiles, base.missiles, 0),
    floaters: n(l?.floaters, base.floaters, 1),
    particles: Math.min(1, n(l?.particles, base.particles, 0)),
  };
}
