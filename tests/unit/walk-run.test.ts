/** Allure marche / course : la course reste le défaut (bots, invocations), la marche suit D2 (6 yards/s, sans FRW). */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { WALK_RATIO } from '../../src/sim/world';
import { keyActionPc, keyActionTouch } from '../../src/input/mode';
import { DEFAULT_SETTINGS } from '../../src/sim/save';

describe('Marche / course', () => {
  it('par défaut : course (aucun réglage), vitesse inchangée', () => {
    const g = new Game();
    const w = g.world;
    expect(DEFAULT_SETTINGS.walkMode).toBeUndefined();
    expect(w.autoCfg?.walkMode).toBeUndefined();
    expect(w.playerSpeed()).toBeCloseTo(5.2 * (1 + (150 * w.player.d.frw) / (150 + w.player.d.frw) / 100), 6);
    expect(w.playerSpeed(false)).toBe(w.playerSpeed());
  });

  it('marche : 6/9 de la vitesse de base, sans la FRW', () => {
    const w = new Game().world;
    w.player.d.frw = 0;
    expect(w.playerSpeed(true)).toBeCloseTo(5.2 * (6 / 9), 6);
    const run0 = w.playerSpeed(false);
    w.player.d.frw = 60;
    expect(w.playerSpeed(true)).toBeCloseTo(5.2 * WALK_RATIO, 6);
    expect(w.playerSpeed(false)).toBeGreaterThan(run0);
    expect(w.playerSpeed(true)).toBeLessThan(w.playerSpeed(false));
  });

  it('le réglage walkMode du jeu choisit l’allure ; le gel (froid) s’applique aux deux', () => {
    const g = new Game();
    g.settings.walkMode = true;
    g.world.autoCfg = g.settings;
    const walk = g.world.playerSpeed();
    expect(walk).toBeCloseTo(5.2 * WALK_RATIO, 6);
    g.world.player.chillT = 100;
    g.world.player.chillPct = 0.5;
    expect(g.world.playerSpeed()).toBeCloseTo(walk * 0.5, 6);
    g.world.player.chillT = 0;
    g.settings.walkMode = false;
    expect(g.world.playerSpeed()).toBeGreaterThan(walk);
  });

  it('la touche R bascule l’allure en mode PC seulement', () => {
    expect(keyActionPc('KeyR')).toEqual({ t: 'walk' });
    expect(keyActionTouch('KeyR')).not.toEqual({ t: 'walk' });
  });
});
