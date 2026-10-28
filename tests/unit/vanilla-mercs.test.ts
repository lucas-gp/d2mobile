/**
 * Règles des mercenaires de la base = Diablo II LoD 1.13c (lot M8b, src/mods/d2/mercs.ts) : usure de l'équipement (D2MOO,
 * SUNITDMG_DrainItemDurability : jamais pour un mercenaire) et dégâts contre les boss (HireableBossDamagePercent de DifficultyLevels.txt,
 * 50 / 35 / 25 %). Le dernier test vérifie que ce sont les règles du jeu `d2`, et celles du mod avec pd2.
 */
import { describe, expect, it } from 'vitest';
import { bossDamagePct, itemWear } from '../../src/mods/d2/mercs';
import { D2_DIFFICULTY } from '../../src/mods/d2/tables';
import { RULES, ruleOwner } from '../../src/mods/rules';
import type { Monster } from '../../src/sim/actors';
import type { World } from '../../src/sim/world';
import { withoutPd2 } from '../needs-pd2';

const world = (difficulty: 0 | 1 | 2): World => ({ difficulty }) as unknown as World;
const monster = (id: string, rank = 'normal'): Monster => ({ def: { id }, rank }) as unknown as Monster;

describe('Mercenaires D2 1.13c', () => {
  it('l’équipement du mercenaire ne s’use jamais', () => {
    expect(itemWear()).toBe(false);
  });
  it('dégâts contre un boss de MonStats : 50 / 35 / 25 % (DifficultyLevels.txt), pleins sinon', () => {
    expect(D2_DIFFICULTY.HireableBossDamagePercent).toEqual([50, 35, 25]);
    expect([0, 1, 2].map((d) => bossDamagePct(world(d as 0 | 1 | 2), monster('andariel', 'boss')))).toEqual([50, 35, 25]);
    expect(bossDamagePct(world(2), monster('duriel'))).toBe(25);
    expect(bossDamagePct(world(2), monster('zombie'))).toBe(100);
    // super-unique (Bishibosh) : pas un boss pour D2
    expect(bossDamagePct(world(2), monster('fallen_shaman', 'unique'))).toBe(100);
  });
  it('sans mod, les règles des mercenaires sont celles de D2 ; avec pd2, celles du mod', () => {
    for (const r of ['merc.itemWear', 'merc.bossDamagePct'] as const) expect(ruleOwner(r)).toBe(withoutPd2 ? undefined : 'pd2');
    if (withoutPd2) expect(RULES['merc.bossDamagePct']).toBe(bossDamagePct);
    else expect(RULES['merc.bossDamagePct'](world(2), monster('andariel', 'boss'))).toBe(100);
  });
});
