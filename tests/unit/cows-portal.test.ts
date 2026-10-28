/** Portail des Vaches (recette du Cube) et Jambe de Wirt. Les carquois PD2 : mods/pd2/tests/unit/quivers.test.ts. */
import { describe, expect, it } from 'vitest';
import { RUN_BY_ID } from '../../src/data/runs';
import { Game } from '../../src/sim/game';

Game.resumeOnLoad = true;

describe('Portail des Vaches', () => {
  it('la run des vaches reste lançable depuis le menu, sans recette du Cube', () => {
    const g = new Game();
    expect(RUN_BY_ID.cows.hidden).toBeFalsy();
    expect(g.runOptions().some((o) => o.run.id === 'cows')).toBe(true);
  });
  it('refusée sans Baal tué, acceptée ensuite, difficulté la plus haute ouverte, fermée après le Roi des Vaches', () => {
    const g = new Game();
    const c = g.character;
    c.materials.wirts_leg = 3;
    c.materials.tome_portal = 3;
    expect(g.transmute('cows_portal', []).ok).toBe(false);
    c.progression.completions['baal:0'] = 1;
    c.progression.completions['baal:1'] = 1;
    const r = g.transmute('cows_portal', []);
    expect(r.ok).toBe(true);
    expect(r.run).toBe('cows');
    expect(c.materials.wirts_leg).toBe(2);
    expect(g.enterPandemonium('cows')).toBe(true);
    expect(g.difficulty).toBe(1);
    // Roi des Vaches tué en Cauchemar : ferme le portail de cette difficulté, retour à Normal
    c.progression.milestones['cowsclosed:1'] = 1;
    g.transmute('cows_portal', []);
    expect(c.progression.milestones['cows:open']).toBe(0);
    c.progression.milestones['cowsclosed:0'] = 1;
    expect(g.transmute('cows_portal', []).ok).toBe(false);
  });
});

describe('Jambe de Wirt (Rush)', () => {
  it('Tristram terminé en Rush rend la Jambe de Wirt (une seule)', () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    for (let i = 0; i < 2; i++) g.world.events.push({ t: 'runComplete', durationSec: 10 } as never);
    // le traitement des événements se fait au tick : on le déclenche directement
    (g as unknown as { handle(e: unknown): void }).handle({ t: 'runComplete', durationSec: 10 });
    (g as unknown as { handle(e: unknown): void }).handle({ t: 'runComplete', durationSec: 10 });
    expect(g.character.materials.wirts_leg).toBe(1);
  });
});
