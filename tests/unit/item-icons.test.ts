import { describe, expect, it } from 'vitest';
import { pickItemIconKey } from '../../src/ui/itemicon';

const atlas = new Set(['small_charm', 'small_charm#1', 'small_charm#2', 'ring', 'u_annihilus', 'sword']);
const has = (k: string): boolean => atlas.has(k);

describe('image d’inventaire des objets', () => {
  it('est déterministe pour un même uid', () => {
    const it = { uid: 'abc-123', base: 'small_charm' };
    expect(pickItemIconKey(it, has)).toBe(pickItemIconKey({ ...it }, has));
  });
  it('couvre toutes les variantes selon l’uid', () => {
    const seen = new Set<string | null>();
    for (let i = 0; i < 200; i++) seen.add(pickItemIconKey({ uid: `u${i}`, base: 'small_charm' }, has));
    expect(seen).toEqual(new Set([null, 'small_charm#1', 'small_charm#2']));
  });
  it('replie sur la base (frame 0) sans variantes ou sans atlas', () => {
    expect(pickItemIconKey({ uid: 'x', base: 'ring' }, has)).toBeNull();
    expect(pickItemIconKey({ uid: 'x', base: 'small_charm' }, () => false)).toBeNull();
  });
  it('utilise l’image propre d’un unique quand elle existe', () => {
    expect(pickItemIconKey({ uid: 'x', base: 'small_charm', uniqueId: 'u_annihilus' }, has)).toBe('u_annihilus');
    expect(pickItemIconKey({ uid: 'x', base: 'sword', uniqueId: 'u_inconnu' }, has)).toBeNull();
  });
});
