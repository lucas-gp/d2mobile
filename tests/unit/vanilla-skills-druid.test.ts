/**
 * Compétences du Druide de la base = Diablo II LoD 1.13c (lot M9g) : chiffres de Skills.txt (src/data/skills-d2.ts, contrôlé contre les
 * MPQ par `npm run vanilla`) confrontés aux valeurs documentées, règles de la base (src/mods/d2/skills.ts : SkillDruid.cpp de D2MOO),
 * et, sans le mod, comportement en jeu (jeu de règles `d2`).
 */
import { describe, expect, it } from 'vitest';
import { D2_SKILL_TREE } from '../../src/data/skills-d2';
import { lin, ramp, type Lin, type Ramp } from '../../src/data/ramp';
import { D2_DRUID } from '../../src/mods/d2/skills';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { addXp, xpToReach } from '../../src/sim/progression';
import { computeDerived } from '../../src/sim/character';
import { withoutPd2 } from '../needs-pd2';

const N = Object.fromEntries(D2_SKILL_TREE.map((t) => [t.id, t.n ?? {}]));
const at = (v: Lin | Ramp | undefined, L: number): number => (v && !Array.isArray(v) ? ramp(v, L) : lin(v, L));

describe('Druide de Diablo II : chiffres des tables', () => {
  it('élémentaire (Arreat Summit)', () => {
    // Rocher en fusion : 6-12 physiques et 6-12 de feu, 2 s de recharge ; Volcan : 4 s ; Armageddon et Ouragan : 10 s, 6 s de recharge
    expect([at(N.molten_boulder.min, 1), at(N.molten_boulder.max, 1), at(N.molten_boulder.min2, 1), at(N.molten_boulder.max2, 1)]).toEqual([6, 12, 6, 12]);
    expect(N.molten_boulder.cooldown).toBe(2);
    expect(N.volcano.cooldown).toBe(4);
    expect(lin(N.armageddon.duration, 1)).toBe(10);
    expect(N.hurricane.cooldown).toBe(6);
    // Armure cyclone : 40 (+12) ; Tempête de feu : trois langues ; Trombe : trois trombes, 0,4 s d'étourdissement
    expect(lin(N.cyclone_armor.value, 2)).toBe(52);
    expect(at(N.firestorm.count, 1)).toBe(3);
    expect(at(N.twister.count, 1)).toBe(3);
    expect(lin(N.twister.stun, 1)).toBeCloseTo(0.4, 6);
  });
  it('métamorphose et invocations', () => {
    // loup-garou : +21 % de vitesse d'attaque, +50 % de score d'attaque, +25 % de vie ; ours-garou : +55 % de dégâts, +25 % de défense, +75 % de vie
    expect(lin(N.werewolf.value2, 1)).toBe(21);
    expect(lin(N.werewolf.v3, 1)).toBe(50);
    expect(lin(N.werewolf.value, 1)).toBe(25);
    expect([lin(N.werebear.value, 1), lin(N.werebear.value2, 1), lin(N.werebear.v3, 1)]).toEqual([55, 25, 75]);
    // Furie : 2 coups au niveau 1, 5 au plus ; Rage sauvage et Mutilation : 3 charges, +1 tous les deux niveaux
    expect([at(N.fury.count, 1), at(N.fury.count, 20)]).toEqual([2, 5]);
    expect(Math.floor(at(N.maul.count, 3))).toBe(4);
    // corbeaux : un par niveau (5 au plus), 12 coups ; loups spirituels 5, redoutables 3 ; Sage du chêne +30 % de vie
    expect([at(N.raven.count, 1), at(N.raven.count, 9)]).toEqual([1, 5]);
    expect(at(N.summon_fenris.count, 9)).toBe(3);
    expect(lin(N.oak_sage.value, 1)).toBe(30);
    expect(lin(N.spirit_barbs.value, 1)).toBe(50);
  });
});

describe('Druide de Diablo II : règles de la base', () => {
  it('formes sans réduction de dégâts, Faim mordante, Griffes de feu sans tempête, une liane à la fois', () => {
    const nv = (id: string, f: string, L: number): number => lin(N[id]?.[f as 'value'], L);
    const wolf = D2_DRUID.form('werewolf', 1, 0, nv);
    expect([wolf.ias, wolf.arPct, wolf.lifePct, wolf.meleeDmgPct, wolf.drFlat]).toEqual([21, 50, 25, 0, 0]);
    const bear = D2_DRUID.form('werebear', 1, 1, nv);
    expect([bear.meleeDmgPct, bear.defPct, bear.lifePct, bear.splash]).toEqual([55, 25, 95, 0]);
    expect(D2_DRUID.hungerEatsCorpse).toBe(false);
    expect(D2_DRUID.fireClawsTendrils(20)).toBe(0);
    expect(D2_DRUID.vinesShareSlot).toBe(true);
    expect(D2_DRUID.spiritsUntouchable).toBe(false);
    expect(D2_DRUID.cycloneAbsorb(100, 50, 14, 0)).toBe(114);
  });
  it.skipIf(!withoutPd2)('sont celles du jeu d2', () => {
    expect(ruleOwner('skills.druid')).toBeUndefined();
    expect(RULES['skills.druid']()).toBe(D2_DRUID);
  });
});

describe.skipIf(!withoutPd2)('Druide de Diablo II : en jeu (jeu de règles d2)', () => {
  it('ours-garou : vie +75 %, dégâts +55 %', () => {
    const g = new Game(undefined, 'druid');
    addXp(g.character, xpToReach(30));
    g.character.skills = { werebear: 1 };
    const human = computeDerived(g.character, 0);
    const bear = computeDerived(g.character, 0, [{ id: 'werebear', level: 1, until: 1e9 }]);
    expect(Math.abs(bear.lifeMax - human.lifeMax * 1.75)).toBeLessThanOrEqual(2);
    expect(bear.meleeDmgPct - human.meleeDmgPct).toBe(55);
  });
});
