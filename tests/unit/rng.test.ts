import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../../src/core/rng';

describe('Rng', () => {
  it('est déterministe pour une même graine', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });
  it('restaure son état', () => {
    const a = new Rng('x');
    a.next();
    const st = a.getState();
    const v = a.next();
    expect(Rng.fromState(st).next()).toBe(v);
  });
  it('produit une distribution uniforme raisonnable', () => {
    const r = new Rng(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) buckets[r.int(10)]++;
    for (const b of buckets) expect(Math.abs(b - 10000)).toBeLessThan(500);
  });
  it('tirage pondéré respecte les poids', () => {
    const r = new Rng(3);
    const c = [0, 0, 0];
    for (let i = 0; i < 60000; i++) c[r.weightedIndex([1, 2, 3])]++;
    expect(c[2] / c[0]).toBeGreaterThan(2.7);
    expect(c[2] / c[0]).toBeLessThan(3.3);
    expect(r.weightedIndex([0, 0])).toBe(-1);
  });
  it('hashSeed est stable', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });
});
