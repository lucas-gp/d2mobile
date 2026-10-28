/**
 * Adaptive density and drawing caps (lot 284, sim/adaptive.ts): slow frames raise the load level (fewer live monsters, fewer things
 * drawn), quick ones bring it back down after a while; pauses are not measures; no measure, no change (tools, bots).
 */
import { describe, expect, it } from 'vitest';
import { adaptiveCap, FrameGovernor, LOAD_LEVELS, MIN_ADAPTIVE_CAP, RECOVER_S, roundLimits } from '../../sim/adaptive';

const run = (g: FrameGovernor, t0: number, ms: number, seconds: number) => {
  let t = t0;
  while (t < t0 + seconds * 1000) g.frame((t += ms));
  return t;
};

describe('Adaptive density', () => {
  it('slow frames: one level up at a time; quick frames for a while: back down', () => {
    const g = new FrameGovernor();
    let t = run(g, 0, 16, 5);
    expect(g.level).toBe(0);
    t = run(g, t, 40, 3);
    expect(g.level).toBe(1);
    t = run(g, t, 40, 30);
    expect(g.level).toBe(LOAD_LEVELS.length - 1);
    t = run(g, t, 16, RECOVER_S - 2);
    expect(g.level).toBe(LOAD_LEVELS.length - 1);
    t = run(g, t, 16, 4);
    expect(g.level).toBe(LOAD_LEVELS.length - 2);
    // a pause (a panel open, the tab hidden) is not a slow frame
    g.reset();
    run(g, t, 600, 20);
    expect(g.level).toBe(0);
  });

  it('caps: the density setting at level 0, lowered after, never below 40 live monsters', () => {
    expect(adaptiveCap(90, 0)).toBe(90);
    expect(adaptiveCap(120, 1)).toBe(102);
    expect(adaptiveCap(120, 3)).toBe(66);
    expect(adaptiveCap(60, 3)).toBe(MIN_ADAPTIVE_CAP);
    expect(adaptiveCap(30, 3)).toBe(30);
    expect(roundLimits(false, 2)).toBeNull();
    expect(roundLimits(true, 0)).toEqual({ corpses: 12, missiles: 120, floaters: 10, particles: 0.6 });
    expect(roundLimits(true, 9)?.corpses).toBe(LOAD_LEVELS[LOAD_LEVELS.length - 1].corpses);
  });
});
