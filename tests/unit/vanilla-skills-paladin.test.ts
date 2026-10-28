/**
 * Compétences du Paladin de la base = Diablo II LoD 1.13c (lot M9e) : chiffres de Skills.txt et Missiles.txt (src/data/skills-d2.ts,
 * contrôlé contre les MPQ par `npm run vanilla`) confrontés aux valeurs documentées, règles de la base (src/mods/d2/skills.ts : SkillPal.cpp
 * et MissMode.cpp de D2MOO), et, sans le mod, comportement en jeu (jeu de règles `d2`).
 */
import { describe, expect, it } from 'vitest';
import { D2_SKILL_TREE } from '../../src/data/skills-d2';
import { lin, ramp, type Lin, type Ramp } from '../../src/data/ramp';
import { D2_PALADIN } from '../../src/mods/d2/skills';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { computeDerived } from '../../src/sim/character';
import type { Monster } from '../../src/sim/actors';
import { withoutPd2 } from '../needs-pd2';

const N = Object.fromEntries(D2_SKILL_TREE.map((t) => [t.id, t.n ?? {}]));
const at = (v: Lin | Ramp | undefined, L: number): number => (v && !Array.isArray(v) ? ramp(v, L) : lin(v, L));

describe('Paladin de Diablo II : chiffres des tables', () => {
  it('attaques (Arreat Summit)', () => {
    // Sacrifice : +180 % de dégâts (+15), 8 % des dégâts en vie ; Zèle : 2 coups au niveau 1, 5 au niveau 4 ; aucun bonus de dégâts avant le niveau 5
    expect(at(N.sacrifice.wdmg, 1)).toBe(180);
    expect(lin(N.sacrifice.value, 1)).toBe(8);
    expect(at(N.zeal.count, 1)).toBe(2);
    expect(at(N.zeal.count, 4)).toBe(5);
    expect(at(N.zeal.wdmg, 4)).toBe(0);
    expect(at(N.zeal.wdmg, 6)).toBe(12);
    // Vengeance : +70 % de l'arme dans chaque élément au niveau 1 ; Conversion : 16 s, chance 0 → 50 %
    expect(lin(N.vengeance.value, 1)).toBe(70);
    expect(lin(N.conversion.duration, 1)).toBe(16);
    expect(lin(N.conversion.value, 1)).toBe(7);
    // Poing des cieux : 150-200 de foudre, Éclairs sacrés de 40-50, 6 cibles + 1 par niveau, 1 s de recharge
    expect([at(N.fist_of_the_heavens.min, 1), at(N.fist_of_the_heavens.max, 1)]).toEqual([150, 200]);
    expect([at(N.fist_of_the_heavens.min2, 1), at(N.fist_of_the_heavens.max2, 1)]).toEqual([40, 50]);
    expect(at(N.fist_of_the_heavens.count, 1)).toBe(6);
    expect(N.fist_of_the_heavens.cooldown).toBe(1);
  });

  it('auras', () => {
    // Puissance : +40 % de dégâts (+10) ; Feu sacré : 1-3 de feu, +6-18 aux attaques ; Fanatisme : +50 % de dégâts pour le Paladin, la moitié pour le groupe
    expect(lin(N.might.value, 1)).toBe(40);
    expect([at(N.holy_fire.min, 1), at(N.holy_fire.max, 1), at(N.holy_fire.min2, 1), at(N.holy_fire.max2, 1)]).toEqual([1, 3, 6, 18]);
    expect(lin(N.fanaticism.value, 1)).toBe(50);
    expect(lin(N.fanaticism.value2, 1)).toBe(25);
    // Conviction : −30 % de résistances (+5, 150 au plus) ; Rédemption : chance 10 → 100 %
    expect(lin(N.conviction.value2, 1)).toBe(30);
    expect(lin(N.conviction.value2, 60)).toBe(150);
    // Bouclier sacré : +25 % de défense (+15), 30 s (+25)
    expect(lin(N.holy_shield.value2, 1)).toBe(25);
    expect(lin(N.holy_shield.duration, 1)).toBe(30);
  });
});

describe('Paladin de Diablo II : règles de la base', () => {
  it('Éclairs sacrés pour les morts-vivants seulement, un par lancer ; Marteau béni +50 % ; pas d’explosion du Sacrifice', () => {
    expect(D2_PALADIN.holyUndeadOnly).toBe(true);
    expect(D2_PALADIN.holyBolts(30)).toBe(1);
    expect(D2_PALADIN.hammerUndeadMul).toBe(1.5);
    expect(D2_PALADIN.sacrificeExplodes).toBe(false);
    expect(D2_PALADIN.smiteKnockback).toBe(true);
    expect(D2_PALADIN.resistMax('resist_fire', 10, true)).toBe(15);
    expect(D2_PALADIN.resistMax('resist_fire', 10, false)).toBe(5);
  });
  it.skipIf(!withoutPd2)('sont celles du jeu d2', () => {
    expect(ruleOwner('skills.paladin')).toBeUndefined();
    expect(RULES['skills.paladin']()).toBe(D2_PALADIN);
  });
});

function arena(skills: Record<string, number>, monster: string): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'paladin');
  addXp(g.character, xpToReach(40));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster, x: 13, y: 15, count: 1, r: 0 });
  g.character.skills = { ...skills };
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const ms = g.world.monsters.filter((x) => !x.dead && !x.isSummon);
  for (const x of ms) {
    x.hp = x.hpMax = 1e6;
    x.defense = 0;
    x.speed = 0;
  }
  g.world.player.mana = g.world.player.manaMax = 1e6;
  g.world.refreshPlayer();
  return { g, w: g.world, ms };
}
const cast = (g: Game, w: World, skill: string, t: Monster, steps = 40): void => {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill, tx: t.x, ty: t.y, targetId: t.id };
  for (let i = 0; i < steps; i++) g.step(1);
};

describe.skipIf(!withoutPd2)('Paladin de Diablo II : en jeu (jeu de règles d2)', () => {
  it('Éclair sacré : traverse un monstre vivant sans le blesser, blesse un mort-vivant', () => {
    const live = arena({ holy_bolt: 10 }, 'hell_bovine');
    cast(live.g, live.w, 'holy_bolt', live.ms[0]);
    expect(live.ms[0].hp).toBe(1e6);
    const dead = arena({ holy_bolt: 10 }, 'zombie');
    cast(dead.g, dead.w, 'holy_bolt', dead.ms[0]);
    expect(dead.ms[0].hp).toBeLessThan(1e6);
  });
  it('Résistance au feu : +points durs de maximum quand l’aura est active, moitié en passif', () => {
    const g = new Game(undefined, 'paladin');
    addXp(g.character, xpToReach(30));
    g.character.skills = { resist_fire: 10 };
    const passive = computeDerived(g.character, 0).maxRes.fire;
    const active = computeDerived(g.character, 0, [{ id: 'aura_resist_fire', level: 10, until: 1e9 }]).maxRes.fire;
    expect(active - passive).toBe(10);
  });
});
