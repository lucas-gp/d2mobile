/**
 * Bots du jeu pd2 (règle `bots.profile`, lot M13) : le profil du mod est actif, ses plans ne nomment que des compétences des arbres S13 et
 * gardent les choix mesurés à l'arène de classes (tools/bots/class-arena.ts).
 */
import { describe, expect, it } from 'vitest';
import { SKILL_BY_ID } from '../../../../src/data/skills';
import { ruleOwner } from '../../../../src/mods/rules';
import { botRules, buildPlan, BUILD_CLASS, type BuildId } from '../../../../src/sim/bot/brain';
import { TREE_CLASS } from '../../../../src/data/classes';

describe('bots du jeu pd2', () => {
  it('le profil des bots est celui du mod', () => {
    expect(ruleOwner('bots.profile')).toBe('pd2');
    expect(botRules().checks.progressionLevel).toBe(12);
  });

  it('chaque build a un plan, dont chaque compétence existe dans son arbre de classe', () => {
    for (const build of Object.keys(BUILD_CLASS) as BuildId[]) {
      const plan = buildPlan(build);
      expect(plan.length, build).toBeGreaterThan(0);
      for (const [id] of plan) {
        expect(SKILL_BY_ID[id], `${build} : ${id}`).toBeDefined();
        expect(TREE_CLASS[SKILL_BY_ID[id].tree], `${build} : ${id}`).toBe(BUILD_CLASS[build]);
      }
    }
  });

  it('Tourbillon : maîtrise des armes à une main (le kit tient deux armes), jamais à deux mains', () => {
    const ids = buildPlan('whirlwind').map(([s]) => s);
    expect(ids).toContain('one_hand_mastery');
    expect(ids).not.toContain('two_hand_mastery');
  });
});
