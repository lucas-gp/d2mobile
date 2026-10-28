/**
 * Progression de la base = Diablo II LoD 1.13c (lot M8f, src/mods/d2/progression.ts) : part de l'expérience d'un monstre selon l'écart
 * de niveau, d'après SUNITDMG_ComputeExperienceGain (D2MOO) : facteurs sur 256 sous le personnage, et au-dessus pour un personnage de
 * niveau inférieur à 25 ; à partir du niveau 25, niveau du personnage / niveau du monstre dès que le monstre est plus haut.
 */
import { describe, expect, it } from 'vitest';
import { xpLevelFactor } from '../../src/mods/d2/progression';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { withoutPd2 } from '../needs-pd2';

describe('Expérience D2 1.13c selon l’écart de niveau', () => {
  it('monstre de niveau inférieur ou égal : pleine jusqu’à 5 niveaux, puis 207, 159, 110, 61 et 13 / 256', () => {
    for (let d = 0; d <= 5; d++) expect(xpLevelFactor(40, 40 - d)).toBe(1);
    expect([6, 7, 8, 9, 10, 30].map((d) => xpLevelFactor(60, 60 - d) * 256)).toEqual([207, 159, 110, 61, 13, 13]);
  });
  it('monstre plus haut, personnage sous le niveau 25 : pleine jusqu’à 5 niveaux, puis 225, 174, 92, 38 et 5 / 256', () => {
    for (let d = 1; d <= 5; d++) expect(xpLevelFactor(10, 10 + d)).toBe(1);
    expect([6, 7, 8, 9, 10, 40].map((d) => xpLevelFactor(10, 10 + d) * 256)).toEqual([225, 174, 92, 38, 5, 5]);
  });
  it('monstre plus haut, personnage de niveau 25 ou plus : niveau du personnage / niveau du monstre, dès un niveau d’écart', () => {
    expect(xpLevelFactor(25, 26)).toBe(25 / 26);
    expect(xpLevelFactor(30, 32)).toBe(30 / 32);
    expect(xpLevelFactor(80, 85)).toBe(80 / 85);
  });
  it('sans mod, la règle est celle de D2 ; avec pd2, celle du mod', () => {
    expect(ruleOwner('xp.levelFactor')).toBe(withoutPd2 ? undefined : 'pd2');
    expect(RULES['xp.levelFactor'](30, 32)).toBe(withoutPd2 ? 30 / 32 : 1);
  });
});
