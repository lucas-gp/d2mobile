import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';

describe('dernière ville visitée', () => {
  it('un nouveau personnage commence dans le Camp (Acte I)', () => {
    expect(new Game().lastTown).toBe('act1');
  });
  it('est sauvegardée et restaurée ; une ancienne sauvegarde reste à Harrogath', () => {
    const g = new Game();
    g.enterTown('act3');
    const save = g.toSave();
    expect(save.town).toBe('act3');
    expect(new Game(save).lastTown).toBe('act3');
    expect(new Game({ ...save, town: undefined }).lastTown).toBe('act5');
  });
});
