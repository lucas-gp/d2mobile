/**
 * Budget of the drawing (lot 284, S9, src/render/budget.ts): pool of display objects (reused, capped, forgotten when the zone's layers
 * are emptied), the newest entries kept under a cap (corpses, projectiles), the drawn rectangle, the limits given by a game mode made safe.
 */
import { describe, expect, it } from 'vitest';
import { inView, newestCut, safeLimits, ViewPool } from '../../src/render/budget';
import { BASE_RENDER_LIMITS } from '../../src/mods/rules';

describe('render budget: pool', () => {
  it('reuses what was given back, up to its size; the rest is destroyed', () => {
    const destroyed: number[] = [];
    let next = 0;
    const pool = new ViewPool<{ id: number; hidden?: boolean }>(2, (v) => destroyed.push(v.id));
    const make = () => ({ id: next++ });
    const a = pool.take(make, () => {});
    const b = pool.take(make, () => {});
    const c = pool.take(make, () => {});
    expect([a.id, b.id, c.id]).toEqual([0, 1, 2]);
    for (const v of [a, b, c]) pool.give(v, (x) => (x.hidden = true));
    expect(pool.size).toBe(2);
    expect(destroyed).toEqual([2]);
    expect(a.hidden && b.hidden).toBe(true);
    const resets: number[] = [];
    const d = pool.take(make, (x) => {
      x.hidden = false;
      resets.push(x.id);
    });
    expect(d.id).toBe(1);
    expect(d.hidden).toBe(false);
    expect(resets).toEqual([1]);
    expect({ made: pool.made, reused: pool.reused, destroyed: pool.destroyed }).toEqual({ made: 3, reused: 1, destroyed: 1 });
    pool.forget();
    expect(pool.size).toBe(0);
    expect(destroyed).toEqual([2]);
    pool.give(d, () => {});
    pool.clear();
    expect(destroyed).toEqual([2, 1]);
  });
});

describe('render budget: caps', () => {
  it('keeps the newest entries under a cap', () => {
    expect(newestCut([5, 1, 9, 3], 10)).toBe(-Infinity);
    expect(newestCut([5, 1, 9, 3], Infinity)).toBe(-Infinity);
    expect(newestCut([5, 1, 9, 3], 2)).toBe(5);
    expect(newestCut([5, 1, 9, 3], 0)).toBe(Infinity);
    const keys = [40, 10, 30, 20];
    const cut = newestCut(keys, 3);
    expect([40, 10, 30, 20].filter((k) => k >= cut)).toEqual([40, 30, 20]);
  });

  it('the drawn rectangle, with room for a sprite standing on its feet', () => {
    const r = { x0: 0, y0: 0, x1: 800, y1: 400 };
    expect(inView(null, -9999, 0)).toBe(true);
    expect(inView(r, 400, 200)).toBe(true);
    expect(inView(r, -100, 200)).toBe(true);
    expect(inView(r, -200, 200)).toBe(false);
    expect(inView(r, 400, 600)).toBe(true);
    expect(inView(r, 400, 700)).toBe(false);
    expect(inView(r, 400, -100)).toBe(false);
  });

  it('limits of a game mode made safe, the base unchanged', () => {
    expect(safeLimits(undefined, BASE_RENDER_LIMITS)).toEqual({ corpses: Infinity, missiles: Infinity, floaters: 40, particles: 1 });
    expect(safeLimits({ corpses: 30, missiles: -4, floaters: 0, particles: 3 }, BASE_RENDER_LIMITS)).toEqual({ corpses: 30, missiles: 0, floaters: 1, particles: 1 });
    expect(safeLimits({ corpses: Number.NaN, particles: 0.5 }, BASE_RENDER_LIMITS)).toEqual({ corpses: Infinity, missiles: Infinity, floaters: 40, particles: 0.5 });
    expect(Object.isFrozen(BASE_RENDER_LIMITS)).toBe(true);
  });
});
