import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { RUNS, rushRecLevel, RUN_BY_ID } from '../../src/data/runs';

describe('Menu Rush : niveaux minimaux', () => {
  it('Cauchemar : tout le contenu dès le niveau 40, Enfer dès le niveau 60, Normal inchangé', () => {
    for (const r of RUNS) {
      if (r.hidden || r.campaign) continue;
      expect(rushRecLevel(r, 0)).toBe(r.recLevel[0]);
      expect(rushRecLevel(r, 1)).toBeLessThanOrEqual(40);
      expect(rushRecLevel(r, 2)).toBeLessThanOrEqual(60);
      expect(rushRecLevel(r, 1)).toBe(Math.min(r.recLevel[1], 40));
    }
    expect(rushRecLevel(RUN_BY_ID.baal, 1)).toBe(40);
    expect(rushRecLevel(RUN_BY_ID.baal, 2)).toBe(60);
  });
  it('runOptions : une run de Cauchemar est disponible au niveau 40 si la difficulté est ouverte', () => {
    const g = new Game(undefined, 'sorceress');
    g.character.progression.highestDifficulty = 2;
    g.character.level = 40;
    const nm = g.runOptions().filter((o) => o.difficulty === 1 && !o.unlocked && o.reason?.startsWith('Niveau'));
    expect(nm).toEqual([]);
    const hell = g.runOptions().filter((o) => o.difficulty === 2 && o.unlocked);
    expect(hell.every((o) => rushRecLevel(o.run, 2) <= 40)).toBe(true);
    g.character.level = 60;
    expect(g.runOptions().filter((o) => o.difficulty === 2 && !o.unlocked)).toEqual([]);
  });
});
