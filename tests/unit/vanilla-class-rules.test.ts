/**
 * Règles de classe de la base = Diablo II LoD 1.13c (lot M8d) : Bouclier d'énergie, Maîtrises, Chaleur, armures de la Sorcière, auras
 * périodiques du Paladin (cadence, Prière, Sanctuaire, Épines), esquive (règles skills.<classe> de src/mods/d2/skills.ts, d'après
 * SkillSor.cpp, SkillPal.cpp et Skills.cpp de D2MOO), et, sans le mod, effet en jeu (jeu de règles `d2`).
 */
import { describe, expect, it } from 'vitest';
import { D2_SKILL_TREE } from '../../src/data/skills-d2';
import { lin } from '../../src/data/ramp';
import { D2_AMAZON, D2_PALADIN, D2_SORCERESS } from '../../src/mods/d2/skills';
import { Game } from '../../src/sim/game';
import { addXp, xpToReach } from '../../src/sim/progression';
import { computeDerived } from '../../src/sim/character';
import { withoutPd2 } from '../needs-pd2';

const N = Object.fromEntries(D2_SKILL_TREE.map((t) => [t.id, t.n ?? {}]));

describe('Règles de classe de Diablo II (base)', () => {
  it('Sorcière : Bouclier d’énergie de la table, 2 mana par point moins 1/16 par point de Télékinésie ; Maîtrise du froid ; Chaleur sans score d’attaque', () => {
    const es = D2_SORCERESS.energyShield(1, 1, 0, N.energy_shield.value);
    expect(es.pct).toBe(lin(N.energy_shield.value, 1) / 100);
    expect(es.manaPerDmg).toBe(2);
    expect(D2_SORCERESS.energyShield(1, 1, 16, N.energy_shield.value).manaPerDmg).toBe(1);
    expect(D2_SORCERESS.masteryPierce('cold', 1, N.cold_mastery.value2)).toBe(20);
    expect(D2_SORCERESS.masteryPierce('fire', 20, undefined)).toBe(0);
    expect(D2_SORCERESS.warmthArFlat(10)).toBe(0);
    expect(D2_SORCERESS.armorExtras).toBe(false);
  });
  it('Paladin : auras toutes les 2 s, Prière / Purification / Méditation, Sanctuaire contre les morts-vivants, Épines en pour cent', () => {
    expect(D2_PALADIN.auraPulse).toEqual({ every: 50, mul: 1 });
    expect(D2_PALADIN.prayerHeal(10, 1000)).toBe(10);
    expect(D2_PALADIN.prayerLikeAuras).toEqual(['cleansing', 'meditation']);
    expect(D2_PALADIN.sanctuaryAllMonsters).toBe(false);
    expect(D2_PALADIN.sanctuaryUndeadDmgPct(2)).toBe(180);
    expect(D2_PALADIN.thornsPct).toBe(true);
    expect(D2_AMAZON.dodgeLockTicks).toBe(0);
  });
});

describe.skipIf(!withoutPd2)('Règles de classe de Diablo II : en jeu (jeu de règles d2)', () => {
  it('Épines : renvoie 250 % des coups reçus au niveau 1, sans épines fixes', () => {
    const g = new Game(undefined, 'paladin');
    addXp(g.character, xpToReach(30));
    g.character.skills = { thorns: 1 };
    const d = computeDerived(g.character, 0, [{ id: 'aura_thorns', level: 1, until: 1e9 }]);
    expect(d.thorns).toBe(250);
    expect(d.all.get('thornsFlat') ?? 0).toBe(0);
  });
  it('Maîtrise du froid : −20 % de résistance au froid ennemie au niveau 1 ; Maîtrise du feu : aucune réduction', () => {
    const g = new Game(undefined, 'sorceress');
    addXp(g.character, xpToReach(30));
    g.character.skills = { cold_mastery: 1, fire_mastery: 5 };
    const d = computeDerived(g.character, 0);
    expect(d.pierce.cold).toBe(20);
    expect(d.pierce.fire).toBe(0);
  });
});
