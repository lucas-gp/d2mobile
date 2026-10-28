/**
 * Compétences de l'Amazone de la base = Diablo II LoD 1.13c (lot M9c) : chiffres de Skills.txt et Missiles.txt (src/data/skills-d2.ts,
 * contrôlé contre les MPQ par `npm run vanilla`) confrontés aux valeurs documentées, règles de la base (src/mods/d2/skills.ts : SkillAma.cpp
 * de D2MOO, Skills.txt), et, sans le mod, comportement en jeu (jeu de règles `d2`).
 */
import { describe, expect, it } from 'vitest';
import { D2_SKILL_TREE } from '../../src/data/skills-d2';
import { lin, ramp, type Lin, type Ramp } from '../../src/data/ramp';
import { D2_AMAZON } from '../../src/mods/d2/skills';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { computeDerived } from '../../src/sim/character';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { durabilityOf } from '../../src/sim/durability';
import type { Monster } from '../../src/sim/actors';
import { withoutPd2 } from '../needs-pd2';
import { fightArena } from '../../src/sim/bot/arena';

const N = Object.fromEntries(D2_SKILL_TREE.map((t) => [t.id, t.n ?? {}]));
const at = (v: Lin | Ramp | undefined, L: number): number => (v && !Array.isArray(v) ? ramp(v, L) : lin(v, L));

describe('Amazone de Diablo II : chiffres des tables', () => {
  it('flèches et javelots (Arreat Summit)', () => {
    // Flèche magique : +1 de dégâts par niveau, 1 % de conversion en magie par niveau, +10 % de précision, 1,5 de mana
    expect(at(N.magic_arrow.flat, 1)).toBe(1);
    expect(at(N.magic_arrow.flat, 10)).toBe(10);
    expect(lin(N.magic_arrow.value, 10)).toBe(10);
    expect(at(N.magic_arrow.ar, 1)).toBe(10);
    expect(lin(N.magic_arrow.mana, 1)).toBe(1.5);
    // Tir multiple : 2 flèches + 1 par niveau, 24 au plus
    expect(at(N.multiple_shot.count, 1)).toBe(2);
    expect(at(N.multiple_shot.count, 40)).toBe(24);
    // Javelot empoisonné : 25-37 de poison sur 8 s au niveau 1
    expect([at(N.poison_javelin.min, 1), at(N.poison_javelin.max, 1)]).toEqual([25, 37.5]);
    expect(lin(N.poison_javelin.duration, 1)).toBe(8);
    // Javelot de peste : recharge de 4 s ; Flèche d'immolation : 1 s, sol en feu de 4 s ; Valkyrie : 6 s
    expect(N.plague_javelin.cooldown).toBe(4);
    expect(N.immolation_arrow.cooldown).toBe(1);
    expect(lin(N.immolation_arrow.duration, 1)).toBe(4);
    expect(N.valkyrie.cooldown).toBe(6);
    // Mitraille : 4 cibles + 1 par niveau, 10 au plus ; +5 % de dégâts par niveau (5 au niveau 1)
    expect(at(N.strafe.count, 1)).toBe(4);
    expect(at(N.strafe.count, 20)).toBe(10);
    expect(at(N.strafe.wdmg, 1)).toBe(5);
  });

  it('passifs, Empaler, Vision intérieure, Ralentir les missiles', () => {
    // rendements décroissants : Coup critique 5 → 80 %, Esquive 10 → 65 %, Évitement 15 → 75 %
    expect(lin(N.critical_strike.value, 1)).toBe(16);
    expect(lin(N.dodge.value, 1)).toBe(18);
    expect(lin(N.avoid.value, 1)).toBe(24);
    expect(lin(N.avoid.value, 60)).toBeLessThanOrEqual(75);
    expect(lin(N.penetrate.value, 1)).toBe(35);
    // Empaler : +300 % de dégâts, +25 par niveau ; +100 % de précision ; 50 % de chances de perdre de la durabilité au niveau 1
    expect(at(N.impale.wdmg, 1)).toBe(300);
    expect(at(N.impale.ar, 1)).toBe(100);
    expect(lin(N.impale.value, 1)).toBe(46);
    // Vision intérieure : −40 de défense ennemie au niveau 1 ; Ralentir les missiles : projectiles ralentis à 33 %
    expect(lin(N.inner_sight.value, 1)).toBe(40);
    expect(lin(N.slow_movement.value2, 1)).toBe(67);
  });
});

describe('Amazone de Diablo II : règles de la base', () => {
  it('une flèche, toute l’arme ; Tir multiple et Mitraille aux trois quarts ; aucune perforation propre à PD2', () => {
    expect(D2_AMAZON.arrowWeaponPct).toEqual({});
    expect(D2_AMAZON.magicArrowPierce).toBe(false);
    expect(D2_AMAZON.multiShotPct).toBe(0.75);
    expect(D2_AMAZON.multiShotPierceDecay).toBe(0);
    expect(D2_AMAZON.strafePct).toBe(0.75);
    expect(D2_AMAZON.guidedArrowPierce).toBe(0);
    expect(D2_AMAZON.lightningFuryPierce).toBe(0);
    expect(D2_AMAZON.dodgeMissiles).toBe(false);
  });
  it.skipIf(!withoutPd2)('sont celles du jeu d2', () => {
    expect(ruleOwner('skills.amazon')).toBeUndefined();
    expect(RULES['skills.amazon']()).toBe(D2_AMAZON);
  });
});

function arena(skills: Record<string, number>, weapon: string): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'amazon');
  addXp(g.character, xpToReach(40));
  g.enterTown();
  g.character.equipment.mainhand = generateItem(new Rng('w'), weapon, 30, { forceQuality: 'normal' });
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster: 'zombie', x: 11.2, y: 15, count: 1, r: 0 });
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

describe.skipIf(!withoutPd2)('Amazone de Diablo II : en jeu (jeu de règles d2)', () => {
  it('Valkyrie : ni coup critique de l’Amazone ni Frappe puissante (lot M13 : la Frappe PD2 arrêtait la simulation)', () => {
    expect(D2_AMAZON.valkyrieStrikes).toBe(false);
    // bot de l'arène : Amazone à l'arc du niveau 75 (Valkyrie dans son plan) contre trois zombies, sans erreur
    const r = fightArena({ monster: 'zombie', rank: 'normal', count: 3, level: 75, difficulty: 0, build: 'bowazon', maxSec: 30 });
    expect(r.casts?.valkyrie ?? 0).toBeGreaterThan(0);
  });

  it('Évitement : évite les projectiles à l’arrêt ; l’Esquive seule ne les évite pas', () => {
    const g = new Game(undefined, 'amazon');
    addXp(g.character, xpToReach(40));
    g.character.skills = { dodge: 10 };
    expect(computeDerived(g.character, 0).dodgeMissile).toBe(0);
    g.character.skills = { dodge: 10, avoid: 10 };
    const d = computeDerived(g.character, 0);
    expect(d.dodgeMissile).toBe(lin(N.avoid.value, 10));
    expect(d.dodgeMelee).toBe(lin(N.dodge.value, 10));
  });

  it('Empaler : blesse la cible et use l’arme', () => {
    const { g, w, ms } = arena({ impale: 1 }, 'spear');
    const it0 = g.character.equipment.mainhand!;
    const d0 = durabilityOf(it0);
    let casts = 0;
    for (let i = 0; i < 40; i++) {
      w.player.cooldowns = {};
      w.player.mode = 'idle';
      w.input.cast = { skill: 'impale', tx: ms[0].x, ty: ms[0].y, targetId: ms[0].id };
      for (let k = 0; k < 25; k++) g.step(1);
      casts++;
    }
    expect(ms[0].hp).toBeLessThan(1e6);
    expect(casts).toBe(40);
    expect(durabilityOf(it0)).toBeLessThan(d0);
  });
});
