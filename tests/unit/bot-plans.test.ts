/**
 * Plans de compétences des bots du jeu de règles actif (règle `bots.profile`, lot M13 : base = Diablo II, src/mods/d2/bots.ts ; mod pd2 :
 * mods/pd2/bots) : chaque build a un plan, ses compétences existent dans l'arbre de sa classe, et les points dépensés niveau après niveau
 * atteignent chaque compétence du plan accessible tôt (un prérequis oublié, comme le Loup-garou de l'Ours-garou de D2, laisserait la
 * compétence à 0 et les points ailleurs).
 */
import { describe, expect, it } from 'vitest';
import { SKILL_BY_ID } from '../../src/data/skills';
import { TREE_CLASS } from '../../src/data/classes';
import { BotBrain, buildPlan, BUILD_CLASS, type BuildId } from '../../src/sim/bot/brain';
import { Game } from '../../src/sim/game';
import { addXp, xpToReach } from '../../src/sim/progression';
import { withoutPd2 } from '../needs-pd2';

const BUILDS = Object.keys(BUILD_CLASS) as BuildId[];

describe('plans de compétences des bots', () => {
  it('chaque build a un plan, dont chaque compétence existe dans son arbre de classe', () => {
    for (const build of BUILDS) {
      const plan = buildPlan(build);
      expect(plan.length, build).toBeGreaterThan(0);
      for (const [id] of plan) {
        expect(SKILL_BY_ID[id], `${build} : ${id}`).toBeDefined();
        expect(TREE_CLASS[SKILL_BY_ID[id].tree], `${build} : ${id}`).toBe(BUILD_CLASS[build]);
      }
    }
  });

  // plans de la base (Diablo II) ; ceux du jeu pd2 sont les plans historiques, mesurés par leurs bots (mods/pd2/bots)
  it.skipIf(!withoutPd2)('au niveau 35, chaque compétence ouverte au niveau 24 des 30 premiers points du plan a reçu au moins un point (prérequis présents)', () => {
    for (const build of BUILDS) {
      const g = new Game(undefined, BUILD_CLASS[build]);
      addXp(g.character, xpToReach(35));
      new BotBrain(g, { build }).spendSkillPoints();
      // compétences des 30 premiers points du plan (somme des paliers), ouvertes au niveau 24
      const seen: Record<string, number> = {};
      let spent = 0;
      const early: string[] = [];
      for (const [id, n] of buildPlan(build)) {
        spent += Math.max(0, n - (seen[id] ?? 0));
        seen[id] = Math.max(n, seen[id] ?? 0);
        if (spent > 30) break;
        if (SKILL_BY_ID[id].reqLvl <= 24) early.push(id);
      }
      const missing = early.filter((id) => !(g.character.skills[id] > 0));
      expect([...new Set(missing)], build).toEqual([]);
    }
  });
});
