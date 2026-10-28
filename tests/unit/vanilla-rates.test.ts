/**
 * Taux de la base = Diablo II LoD 1.13c (lot M8e, src/data/rates.ts) : aucun multiplicateur de butin ni d'expérience, mana rempli en
 * 120 s (ManaRegen de CharStats.txt, src/mods/d2/tables.ts), ni cartes, ni orbes, ni énigme, ni charmes de brisure ; le jeu pd2 donne
 * les siens par la règle `loot.rates` (conforts de D2 Mobile et taux PD2). Les paliers de butin du joueur s'appliquent par-dessus.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { BASE_RATES, RATES, applyLootPreset } from '../../src/data/rates';
import { D2_CLASS } from '../../src/mods/d2/tables';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { withoutPd2 } from '../needs-pd2';

describe('Taux D2 1.13c', () => {
  afterAll(() => applyLootPreset('normal'));
  it('règle `loot.rates` : la base rend les taux de D2, le mod pd2 les siens', () => {
    expect(ruleOwner('loot.rates')).toBe(withoutPd2 ? undefined : 'pd2');
    if (withoutPd2) {
      const d2 = BASE_RATES;
      expect(RULES['loot.rates'](d2)).toBe(d2);
      expect(d2.quality).toEqual({ unique: 1, set: 1, rare: 1, magic: 1 });
      expect([d2.runes, d2.good, d2.highRuneBias, d2.gems, d2.noDrop, d2.gold, d2.xp, d2.charms]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
      expect(d2.xpCurve).toEqual([[1, 1]]);
      expect([d2.maps, d2.orbs, d2.puzzle, d2.puzzleMob, Math.max(...d2.sunder)]).toEqual([0, 0, 0, 0, 0]);
    } else expect(BASE_RATES.quality.unique).toBe(3);
  });
  it('mana : ManaRegen de CharStats (120 s pour toutes les classes)', () => {
    for (const c of Object.values(D2_CLASS)) expect(c.manaRegen).toBe(120);
    if (withoutPd2) expect(BASE_RATES.manaRefillSeconds).toBe(120);
  });
  it('palier Normal = taux du jeu de règles ; un palier du joueur s’applique par-dessus puis se retire', () => {
    applyLootPreset('fast');
    expect(RATES.quality.unique).toBe(5);
    applyLootPreset('normal');
    expect(JSON.stringify(RATES)).toBe(JSON.stringify(BASE_RATES));
  });
});
