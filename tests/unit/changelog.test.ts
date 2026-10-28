/** Journal des modifications du jeu : trié, bilingue, sans entrée vide. */
import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../../src/ui/changelog';

describe('Changelog', () => {
  it('entrées triées du plus récent au plus ancien, dates valides', () => {
    for (const e of CHANGELOG) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('chaque entrée existe en français et en anglais, avec le même nombre de lignes', () => {
    for (const e of CHANGELOG) {
      expect(e.fr.length).toBeGreaterThan(0);
      expect(e.en.length).toBe(e.fr.length);
      for (const l of [...e.fr, ...e.en]) expect(l.trim().length).toBeGreaterThan(10);
    }
  });
});
