import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { POTION_TIER_LEVELS, potionTierForLevel } from '../../src/sim/world';
import { APP_SETTINGS_DEFAULTS, withDefaultSettings } from '../../src/sim/save';

function drink(upgrade: boolean, level: number, tier: number): number {
  const g = new Game(undefined, 'sorceress');
  g.character.level = level;
  g.world.refreshPlayer();
  g.world.autoCfg = upgrade ? { potionUpgrade: true } : null;
  g.character.belt = [{ kind: 'heal', tier, qty: 3 } as never];
  const p = g.world.player;
  p.hp = 1;
  expect(g.world.usePotion('heal')).toBe(true);
  return (p.healPerTick * 25) / p.hpMax;
}

describe('Potions qui montent en gamme', () => {
  it('paliers selon le niveau', () => {
    expect(POTION_TIER_LEVELS).toHaveLength(5);
    expect(potionTierForLevel(1)).toBe(0);
    expect(potionTierForLevel(10)).toBe(1);
    expect(potionTierForLevel(35)).toBe(3);
    expect(potionTierForLevel(99)).toBe(4);
  });
  it('désactivée (module, tests, bots) : la potion garde son palier', () => {
    expect(drink(false, 99, 0)).toBeCloseTo(0.25, 5);
  });
  it('activée : la potion vaut au moins le palier du niveau, sans jamais rétrograder', () => {
    expect(drink(true, 99, 0)).toBeCloseTo(1, 5);
    expect(drink(true, 20, 0)).toBeCloseTo(0.5, 5);
    expect(drink(true, 1, 3)).toBeCloseTo(0.7, 5);
  });
  it('réglage activé par défaut dans l’application seulement', () => {
    expect(withDefaultSettings(undefined).potionUpgrade).toBeUndefined();
    expect(APP_SETTINGS_DEFAULTS.potionUpgrade).toBe(true);
  });
});
