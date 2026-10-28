import { describe, expect, it } from 'vitest';
import { blockChance, effectiveMonsterRes, hitChance } from '../../src/sim/combat';
import { fcrFrames, fcrFramesLightning, fhrFrames } from '../../src/sim/breakpoints';
import { Game } from '../../src/sim/game';

describe('Formules de combat', () => {
  it('chance de toucher D2 bornée à 5-95 %', () => {
    expect(hitChance(100, 100, 10, 10)).toBeCloseTo(0.5, 5);
    expect(hitChance(100000, 1, 99, 1)).toBe(0.95);
    expect(hitChance(1, 100000, 1, 99)).toBe(0.05);
  });

  it('blocage plafonné à 75 %', () => {
    expect(blockChance(0, 100, 10)).toBe(0);
    expect(blockChance(75, 1000, 1)).toBe(0.75);
    // 30 % de bloc, 65 dex, niveau 25 : 30 × 50 / 50 = 30 %
    expect(blockChance(30, 65, 25)).toBeCloseTo(0.3, 5);
  });

  it('immunité : >= 100 %, non percée par la pénétration', () => {
    expect(effectiveMonsterRes(100, 50, false).immune).toBe(true);
    expect(effectiveMonsterRes(99, 0, false).immune).toBe(false);
  });

  it('paliers FCR/FHR de la Sorcière', () => {
    expect(fcrFrames(0)).toBe(13);
    expect(fcrFrames(62)).toBe(10);
    expect(fcrFrames(63)).toBe(9);
    expect(fcrFrames(105)).toBe(8);
    expect(fcrFrames(500)).toBe(7);
    expect(fcrFramesLightning(0)).toBe(19);
    expect(fcrFramesLightning(194)).toBe(11);
    expect(fhrFrames(86)).toBe(7);
  });
});

describe('Résistances du joueur par difficulté', () => {
  it('pénalité 0 / -40 / -100 et plafond 75 %', async () => {
    const g = new Game();
    const { computeDerived } = await import('../../src/sim/character');
    expect(computeDerived(g.character, 0).res.fire).toBe(0);
    expect(computeDerived(g.character, 1).res.fire).toBe(-40);
    expect(computeDerived(g.character, 2).res.fire).toBe(-100);
    g.character.bonuses.resAll = 500;
    expect(computeDerived(g.character, 2).res.fire).toBe(75);
  });
});

describe('Poison reçu par le joueur (D2)', () => {
  it('agit sur la durée et ne se cumule pas : le plus fort remplace', async () => {
    const { Game } = await import('../../src/sim/game');
    const { POISON_TICKS } = await import('../../src/sim/combat');
    const g = new Game();
    g.startRun('tristram', 0);
    const w = g.world;
    const p = w.player;
    p.d.res.poison = 0;
    p.hpMax = 1000;
    p.hp = 1000;
    const hp0 = p.hp;
    w.hurtPlayer(null, 'poison', 50, true);
    expect(p.hp).toBe(hp0);
    expect(p.poisonT).toBe(POISON_TICKS);
    // un second poison plus faible ne s'ajoute pas
    w.hurtPlayer(null, 'poison', 20, true);
    expect(p.poisonRate).toBeCloseTo(50 / POISON_TICKS);
    for (let i = 0; i < POISON_TICKS + 5; i++) w.step(1);
    expect(hp0 - p.hp).toBeGreaterThan(45);
    expect(hp0 - p.hp).toBeLessThan(55 + 1);
  });
});
