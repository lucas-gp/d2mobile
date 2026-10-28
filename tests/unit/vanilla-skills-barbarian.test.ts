/**
 * Compétences du Barbare de la base = Diablo II LoD 1.13c (lot M9d) : chiffres de Skills.txt (src/data/skills-d2.ts, contrôlé contre les
 * MPQ par `npm run vanilla`) confrontés aux valeurs documentées, règles de la base (src/mods/d2/skills.ts : SkillBar.cpp de D2MOO,
 * Skills.txt), et, sans le mod, comportement en jeu (jeu de règles `d2`).
 */
import { describe, expect, it } from 'vitest';
import { D2_SKILL_TREE } from '../../src/data/skills-d2';
import { lin, ramp, type Lin, type Ramp } from '../../src/data/ramp';
import { D2_BARBARIAN, d2MasteryOf } from '../../src/mods/d2/skills';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { addXp, xpToReach } from '../../src/sim/progression';
import { computeDerived } from '../../src/sim/character';
import { weaponMastery } from '../../src/sim/melee';
import { withoutPd2 } from '../needs-pd2';

const N = Object.fromEntries(D2_SKILL_TREE.map((t) => [t.id, t.n ?? {}]));
const at = (v: Lin | Ramp | undefined, L: number): number => (v && !Array.isArray(v) ? ramp(v, L) : lin(v, L));

describe('Barbare de Diablo II : chiffres des tables', () => {
  it('attaques et cris (Arreat Summit)', () => {
    // Coup violent : +50 % de dégâts (+5 par niveau), +1 dégât par niveau, +20 % de précision (ToHitCalc 15 + 5 × niveau)
    expect(at(N.bash.wdmg, 1)).toBe(50);
    expect(at(N.bash.flat, 3)).toBe(3);
    expect(at(N.bash.ar, 1)).toBe(20);
    // Étourdissement : 1,2 s au niveau 1 ; Frénésie : +90 % de dégâts, effet de 6 s ; Berserk : +150 % de dégâts magiques
    expect(lin(N.stun.stun, 1)).toBeCloseTo(1.2, 6);
    expect(at(N.frenzy.wdmg, 1)).toBe(90);
    expect(lin(N.frenzy.duration, 1)).toBe(6);
    expect(at(N.berserk.wdmg, 1)).toBe(150);
    // Cri : +100 % de défense, 20 s ; Ordres de bataille : +35 % de vie et de mana, 30 s ; Commandement de bataille : 5 s + 10 par niveau
    expect(lin(N.shout.value, 1)).toBe(100);
    expect(lin(N.shout.duration, 1)).toBe(20);
    expect(lin(N.battle_orders.value, 1)).toBe(35);
    expect(lin(N.battle_orders.duration, 1)).toBe(30);
    expect(lin(N.battle_command.duration, 2)).toBe(15);
    // Cri de bataille : −50 % de défense, −25 % de dégâts, 12 s ; Provocation : −5 % de précision et de dégâts au niveau 1
    expect(lin(N.battle_cry.value, 1)).toBe(50);
    expect(lin(N.battle_cry.v3, 1)).toBe(25);
    expect(lin(N.battle_cry.duration, 1)).toBe(12);
    expect(lin(N.taunt.value2, 1)).toBe(5);
  });

  it('maîtrises et passifs', () => {
    // Maîtrise de l'épée : +28 % de précision (+8), +28 % de dégâts (+5), coup critique 0 → 35 % ; Maîtrise de la lance : 30 / 30
    expect(at(N.sword_mastery.ar, 1)).toBe(28);
    expect(at(N.sword_mastery.wdmg, 2)).toBe(33);
    expect(lin(N.sword_mastery.value, 1)).toBe(5);
    expect(at(N.spear_mastery.ar, 1)).toBe(30);
    // Endurance accrue +30 % (+15), Peau de fer +30 % (+10), Vitesse accrue 7 → 50 %, Résistance naturelle 0 → 80 %
    expect(lin(N.increased_stamina.value, 1)).toBe(30);
    expect(lin(N.iron_skin.value, 1)).toBe(30);
    expect(lin(N.increased_speed.value, 1)).toBe(13);
    expect(lin(N.natural_resistance.value, 1)).toBe(12);
  });
});

describe('Barbare de Diablo II : règles de la base', () => {
  it('une maîtrise par type d’arme', () => {
    expect(['sword', 'axe', 'mace', 'scepter', 'polearm', 'spear', 'thrown', 'javelin', 'claw', 'bow', 'staff'].map(d2MasteryOf)).toEqual([
      'sword_mastery',
      'axe_mastery',
      'mace_mastery',
      'mace_mastery',
      'pole_arm_mastery',
      'spear_mastery',
      'throwing_mastery',
      'throwing_mastery',
      'claw_mastery',
      undefined,
      undefined,
    ]);
  });
  it('Coup violent qui repousse toujours, Berserk magique sans défense, Frénésie sans charges, Commandement +1', () => {
    expect(D2_BARBARIAN.bashKnockChance).toBe(1);
    expect(D2_BARBARIAN.berserkMagic).toBe(true);
    expect(D2_BARBARIAN.berserkDefensePct).toBe(-100);
    expect(D2_BARBARIAN.frenzyMaxStacks).toBe(1);
    expect(D2_BARBARIAN.battleCommandSkills(20)).toBe(1);
    expect(D2_BARBARIAN.battleOrdersPct).toBe(true);
  });
  it.skipIf(!withoutPd2)('sont celles du jeu d2', () => {
    expect(ruleOwner('skills.barbarian')).toBeUndefined();
    expect(RULES['skills.barbarian']()).toBe(D2_BARBARIAN);
    expect(ruleOwner('skills.masteryOf')).toBeUndefined();
  });
});

describe.skipIf(!withoutPd2)('Barbare de Diablo II : en jeu (jeu de règles d2)', () => {
  it('Maîtrise de la masse : profite aux masses, pas aux épées', () => {
    const g = new Game(undefined, 'barbarian');
    addXp(g.character, xpToReach(30));
    g.character.skills = { mace_mastery: 10 };
    g.world.refreshPlayer();
    expect(weaponMastery(g.world, 'mace').dmg).toBe(at(N.mace_mastery.wdmg, 10));
    expect(weaponMastery(g.world, 'sword').dmg).toBe(0);
  });
  it('Ordres de bataille : vie et mana en pour cent ; Commandement de bataille : +1 aux compétences apprises', () => {
    const g = new Game(undefined, 'barbarian');
    addXp(g.character, xpToReach(30));
    g.character.skills = { battle_orders: 1, bash: 5 };
    const before = computeDerived(g.character, 0);
    const after = computeDerived(g.character, 0, [{ id: 'battle_orders', level: 1, until: 1e9 }]);
    expect(Math.abs(after.lifeMax - before.lifeMax * 1.35)).toBeLessThanOrEqual(1);
    const bc = computeDerived(g.character, 0, [{ id: 'battle_command', level: 1, until: 1e9 }]);
    expect(bc.skillLevels.bash).toBe(before.skillLevels.bash + 1);
  });
});
