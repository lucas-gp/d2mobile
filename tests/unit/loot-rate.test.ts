import { describe, expect, it, afterAll } from 'vitest';
import { BASE_RATES, RATES, LOOT_RATE_IDS, applyLootPreset } from '../../src/data/rates';
import { withDefaultSettings, DEFAULT_SETTINGS } from '../../src/sim/save';
import { withoutPd2 } from '../needs-pd2';

const snap = () => JSON.stringify(RATES);

describe('taux de butin', () => {
  afterAll(() => applyLootPreset('normal'));

  it('le module est au palier Normal par défaut', () => {
    expect(snap()).toBe(JSON.stringify(BASE_RATES));
  });

  it('les paliers sont ordonnés', () => {
    const vals = LOOT_RATE_IDS.map((id) => {
      applyLootPreset(id);
      return { u: RATES.quality.unique, s: RATES.quality.set, r: RATES.quality.rare, ru: RATES.runes, g: RATES.gems, go: RATES.gold, nd: RATES.noDrop, hb: RATES.highRuneBias };
    });
    for (let i = 1; i < vals.length; i++) {
      // biais des runes hautes : absolu dans les paliers ; le palier Normal de la base D2 (1, sans biais) est hors de l'échelle des
      // conforts, calibrée sur le jeu pd2 (0,15 : runes ×10 compensées)
      for (const k of ['u', 's', 'r', 'ru', 'g', 'go', 'hb'] as const) if (k !== 'hb' || i > 1 || !withoutPd2) expect(vals[i][k]).toBeGreaterThanOrEqual(vals[i - 1][k]);
      expect(vals[i].nd).toBeLessThan(vals[i - 1].nd);
    }
  });

  it('applyLootPreset est idempotent et réversible', () => {
    applyLootPreset('abundant');
    const a = snap();
    applyLootPreset('abundant');
    expect(snap()).toBe(a);
    applyLootPreset('veryfast');
    applyLootPreset('fast');
    applyLootPreset('normal');
    expect(snap()).toBe(JSON.stringify(BASE_RATES));
    expect(RATES.xp).toBe(BASE_RATES.xp);
  });

  it('les sauvegardes migrent vers Abondant', () => {
    expect(DEFAULT_SETTINGS.lootRate).toBe('abundant');
    expect(withDefaultSettings({ sound: 0.3 }).lootRate).toBe('abundant');
    expect(withDefaultSettings({ lootRate: 'fast' }).lootRate).toBe('fast');
    expect(withDefaultSettings({ lootRate: 'bogus' as never }).lootRate).toBe('abundant');
  });
});
