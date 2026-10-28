import { afterEach, describe, expect, it } from 'vitest';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { isBroken, repairCost, setDurabilityEnabled, wear, durabilityEnabled } from '../../src/sim/durability';
import { APP_SETTINGS_DEFAULTS, withDefaultSettings } from '../../src/sim/save';

afterEach(() => setDurabilityEnabled(true));

describe('Réglage de durabilité', () => {
  it('activée par défaut dans le module (tests, bots), désactivée par défaut dans l’application', () => {
    expect(durabilityEnabled()).toBe(true);
    expect(withDefaultSettings(undefined).durability).toBeUndefined();
    expect(APP_SETTINGS_DEFAULTS.durability).toBe(false);
    expect(withDefaultSettings(undefined, true).durability).toBe(false);
    expect(withDefaultSettings({ durability: true }, true).durability).toBe(true);
  });
  it('désactivée : aucune usure, plus d’objet brisé, plus de réparation à payer', () => {
    const it0 = generateItem(new Rng('dur'), 'long_sword', 30, { forceQuality: 'normal' });
    it0.dur = 0;
    expect(isBroken(it0)).toBe(true);
    expect(repairCost(it0)).toBeGreaterThan(0);
    setDurabilityEnabled(false);
    expect(isBroken(it0)).toBe(false);
    expect(repairCost(it0)).toBe(0);
    const it1 = generateItem(new Rng('dur2'), 'long_sword', 30, { forceQuality: 'normal' });
    const before = it1.dur;
    expect(wear(it1, 5)).toBe(false);
    expect(it1.dur).toBe(before);
  });
});
