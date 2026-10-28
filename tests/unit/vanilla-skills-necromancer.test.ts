/**
 * Compétences du Nécromancien de la base = Diablo II LoD 1.13c (lot M9f) : chiffres de Skills.txt (src/data/skills-d2.ts, contrôlé contre
 * les MPQ par `npm run vanilla`) confrontés aux valeurs documentées, règles de la base (src/mods/d2/skills.ts : SkillNec.cpp de D2MOO),
 * et, sans le mod, comportement en jeu (jeu de règles `d2`).
 */
import { describe, expect, it } from 'vitest';
import { D2_SKILL_TREE } from '../../src/data/skills-d2';
import { lin, ramp, type Lin, type Ramp } from '../../src/data/ramp';
import { D2_NECROMANCER } from '../../src/mods/d2/skills';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { summonMinion, minionsOf } from '../../src/sim/minions';
import type { Monster } from '../../src/sim/actors';
import { withoutPd2 } from '../needs-pd2';

const N = Object.fromEntries(D2_SKILL_TREE.map((t) => [t.id, t.n ?? {}]));
const at = (v: Lin | Ramp | undefined, L: number): number => (v && !Array.isArray(v) ? ramp(v, L) : lin(v, L));

describe('Nécromancien de Diablo II : chiffres des tables', () => {
  it('sorts et malédictions (Arreat Summit)', () => {
    // Nova de poison : 50-90 de poison sur 2 s au niveau 1 ; Dents : 2 projectiles + 1 par niveau, 24 au plus
    expect([at(N.poison_nova.min, 1), Math.floor(at(N.poison_nova.max, 1))]).toEqual([50, 90]);
    expect(lin(N.poison_nova.duration, 1)).toBe(2);
    expect(at(N.teeth.count, 1)).toBe(2);
    expect(at(N.teeth.count, 40)).toBe(24);
    // Amplification des dégâts : +100 % de dégâts physiques, 8 s (+3) ; Affaiblissement −33 % ; Décrépitude −50 % ; Connexion vitale 50 %
    expect(lin(N.amplify_damage.value, 1)).toBe(100);
    expect(lin(N.amplify_damage.duration, 1)).toBe(8);
    expect(lin(N.weaken.value, 1)).toBe(33);
    expect(lin(N.decrepify.value2, 1)).toBe(50);
    expect(lin(N.life_tap.value, 1)).toBe(50);
    // Résistance amoindrie : 25 → 70 % ; Vierge de fer : 200 % (+25) renvoyés
    expect(lin(N.lower_resist.value, 1)).toBe(32);
    expect(lin(N.iron_maiden.value, 1)).toBe(200);
  });
  it('invocations', () => {
    // squelettes : 1, 2, 3 puis 2 + niveau / 3 ; morts ressuscités : un par niveau, 180 s
    expect([1, 2, 3, 4, 6].map((L) => Math.floor(at(N.raise_skeleton.count, L)))).toEqual([1, 2, 3, 3, 4]);
    expect(at(N.revive.count, 5)).toBe(5);
    expect(lin(N.revive.duration, 1)).toBe(180);
    // Maîtrise des squelettes : +8 de vie et +2 de dégâts par niveau ; Résistance des invocations 20 → 75 %
    expect(lin(N.skeleton_mastery.value, 3)).toBe(24);
    expect(lin(N.skeleton_mastery.value2, 3)).toBe(6);
    expect(lin(N.summon_resist.value, 1)).toBe(28);
    // Explosion de cadavre : 70 à 120 % de la vie du cadavre
    expect([lin(N.corpse_explosion.value, 1), lin(N.corpse_explosion.value2, 1)]).toEqual([70, 120]);
  });
});

describe('Nécromancien de Diablo II : règles de la base', () => {
  it('malédictions de leurs colonnes, sans réduction de difficulté ; Armure d’os jusqu’à épuisement ; pas de nuage de la Dague', () => {
    expect(D2_NECROMANCER.curseRadius('weaken', [3, 1], 2, 0, 0)).toBe(4);
    expect(D2_NECROMANCER.curseDurationMul('confuse', 2)).toBe(1);
    expect(D2_NECROMANCER.boneArmorPerEnergy).toBe(0);
    expect(D2_NECROMANCER.poisonDaggerClouds).toBe(false);
    expect(D2_NECROMANCER.corpseExplosionPct).toBe(true);
    expect(D2_NECROMANCER.mageCount([3, 1], 4, 0)).toBe(6);
    expect(D2_NECROMANCER.golemSynergies).toBe(false);
  });
  it.skipIf(!withoutPd2)('sont celles du jeu d2', () => {
    expect(ruleOwner('skills.necromancer')).toBeUndefined();
    expect(RULES['skills.necromancer']()).toBe(D2_NECROMANCER);
  });
});

function arena(skills: Record<string, number>): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'necromancer');
  addXp(g.character, xpToReach(40));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster: 'zombie', x: 14, y: 15, count: 1, r: 0 });
  b.spawn({ monster: 'zombie', x: 14.6, y: 15.4, count: 1, r: 0 });
  g.character.skills = { ...skills };
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const ms = g.world.monsters.filter((x) => !x.dead && !x.isSummon);
  g.world.player.mana = g.world.player.manaMax = 1e6;
  g.world.refreshPlayer();
  return { g, w: g.world, ms };
}

describe.skipIf(!withoutPd2)('Nécromancien de Diablo II : en jeu (jeu de règles d2)', () => {
  it('Résistance des invocations : résistances des créatures invoquées', () => {
    const { w } = arena({ clay_golem: 1, summon_resist: 10 });
    summonMinion(w, 'clay_golem', 1, w.player.x + 1, w.player.y);
    const golem = minionsOf(w, 'clay_golem')[0];
    expect(golem.res.fire).toBe(Math.min(90, lin(N.summon_resist.value, 10)));
  });
  it('Explosion de cadavre : un pourcentage de la vie du cadavre aux monstres voisins', () => {
    const { g, w, ms } = arena({ corpse_explosion: 1 });
    const [corpse, other] = ms;
    corpse.hpMax = 1000;
    w.killMonster(corpse, null);
    other.hp = other.hpMax = 1e5;
    other.res.fire = 0;
    other.res.phys = 0;
    w.player.cooldowns = {};
    w.player.mode = 'idle';
    w.input.cast = { skill: 'corpse_explosion', tx: corpse.x, ty: corpse.y, targetId: 0 };
    for (let i = 0; i < 30; i++) g.step(1);
    const lost = 1e5 - other.hp;
    expect(lost).toBeGreaterThanOrEqual(700 * 0.95);
    expect(lost).toBeLessThanOrEqual(1200 * 1.05);
  });
});
