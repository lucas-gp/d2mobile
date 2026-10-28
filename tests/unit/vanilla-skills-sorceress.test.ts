/**
 * Compétences de la Sorcière de la base = Diablo II LoD 1.13c (lot M9b) : chiffres de Skills.txt et Missiles.txt (src/data/skills-d2.ts,
 * contrôlé contre les MPQ par `npm run vanilla` et vanilla-mpq.test.ts) confrontés aux valeurs documentées (Arreat Summit), règles de la
 * base (src/mods/d2/skills.ts : SkillSor.cpp de D2MOO), et, sans le mod, comportement en jeu (jeu de règles `d2`).
 */
import { describe, expect, it } from 'vitest';
import { D2_SKILL_TREE } from '../../src/data/skills-d2';
import { lin, ramp, type Lin, type Ramp } from '../../src/data/ramp';
import { D2_SORCERESS } from '../../src/mods/d2/skills';
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

describe('Sorcière de Diablo II : chiffres des tables', () => {
  it('dégâts et coûts documentés (Arreat Summit, niveaux 1 et 20)', () => {
    // Trait de feu : 3-6 au niveau 1, 2,5 de mana
    expect([at(N.fire_bolt.min, 1), at(N.fire_bolt.max, 1)]).toEqual([3, 6]);
    expect(lin(N.fire_bolt.mana, 1)).toBe(2.5);
    // Météore : 80-100, 17 de mana ; recharge de 1,2 s (delay 30 images)
    expect([at(N.meteor.min, 1), at(N.meteor.max, 1)]).toEqual([80, 100]);
    expect(lin(N.meteor.mana, 1)).toBe(17);
    expect(N.meteor.cooldown).toBe(1.2);
    // Éclair chargé : 3 éclairs + 1 par niveau, 24 au plus
    expect(at(N.charged_bolt.count, 1)).toBe(3);
    expect(at(N.charged_bolt.count, 30)).toBe(24);
    // Inferno : 6,25-12,5 de feu et 7 de mana par seconde au niveau 1
    expect(at(N.inferno.min, 1)).toBeCloseTo(6.25, 6);
    expect(at(N.inferno.max, 1)).toBeCloseTo(12.5, 6);
    expect(lin(N.inferno.mana, 1)).toBeCloseTo(7.03, 2);
    // Orbe gelé : 1 s de recharge ; Mur de feu : 23-31 par seconde au niveau 1, flamme de 3,6 s
    expect(N.frozen_orb.cooldown).toBe(1);
    expect(at(N.fire_wall.min, 1)).toBeCloseTo(23.44, 2);
    expect(at(N.fire_wall.max, 1)).toBeCloseTo(31.25, 2);
    expect(lin(N.fire_wall.duration, 1)).toBeCloseTo(3.6, 6);
  });

  it('armures, maîtrises, Champ statique, Tempête de foudre', () => {
    // Armure gelée : +30 % de défense, +5 par niveau ; 120 s, +12 par niveau ; gel de 1,2 s, +0,12 par niveau
    expect(lin(N.frozen_armor.value, 1)).toBe(30);
    expect(lin(N.frozen_armor.value, 2)).toBe(35);
    expect(lin(N.frozen_armor.duration, 1)).toBe(120);
    expect(lin(N.frozen_armor.chill, 1)).toBeCloseTo(1.2, 6);
    expect(lin(N.chilling_armor.duration, 1)).toBe(144);
    // Chaleur : +30 % de régénération du mana, +12 par niveau ; maîtrises
    expect(lin(N.warmth.value, 1)).toBe(30);
    expect(lin(N.fire_mastery.value, 1)).toBe(30);
    expect(lin(N.lightning_mastery.value, 1)).toBe(50);
    expect(lin(N.cold_mastery.value2, 1)).toBe(20);
    // Champ statique : 25 % des PV actuels, rayon 5 sous-cases (3,3 yards) + 1 par niveau
    expect(lin(N.static_field.value, 1)).toBe(25);
    expect(lin(N.static_field.radius, 1)).toBeCloseTo(5 / 3, 3);
    // Tempête de foudre : un éclair toutes les 110 images au niveau 1, 41 au niveau 20 (perdelay)
    expect(lin(N.thunder_storm.value, 1) * 25).toBeCloseTo(110, 6);
    expect(lin(N.thunder_storm.value, 20) * 25).toBeCloseTo(41, 6);
    expect(lin(N.thunder_storm.duration, 1)).toBe(32);
  });
});

describe('Sorcière de Diablo II : règles de la base', () => {
  it('Champ statique : plancher StaticFieldMin, aucune réduction de résistance', () => {
    expect([0, 1, 2].map((d) => D2_SORCERESS.staticFloor(d))).toEqual([0, 0.33, 0.5]);
    expect(D2_SORCERESS.staticStopsAtFloor).toBe(false);
    expect(D2_SORCERESS.staticLightRes(20)).toBe(0);
    expect(D2_SORCERESS.infernoFireRes(20)).toBe(0);
    expect(D2_SORCERESS.teleportPenaltyPct(1)).toBe(0);
  });
  it('cadence lente : Foudre et Éclair en chaîne ; hydres sans limite pratique, non perforantes', () => {
    expect([...D2_SORCERESS.slowCast].sort()).toEqual(['chain_lightning', 'lightning']);
    expect(D2_SORCERESS.maxHydras).toBe(99);
    expect(D2_SORCERESS.hydraPierce).toBe(false);
    expect(D2_SORCERESS.thunderStormTicks(N.thunder_storm.value, 1, 1)).toBe(110);
  });
  it.skipIf(!withoutPd2)('sont celles du jeu d2', () => {
    expect(ruleOwner('skills.sorceress')).toBeUndefined();
    expect(RULES['skills.sorceress']()).toBe(D2_SORCERESS);
  });
});

function arena(skills: Record<string, number>, spawns: { x: number; y: number }[] = [{ x: 13, y: 15 }]): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(40));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  g.character.skills = { ...skills };
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 2, zoneLevel: 30, character: g.character });
  g.world.populate();
  const ms = g.world.monsters.filter((x) => !x.dead && !x.isSummon);
  for (const x of ms) {
    x.hp = x.hpMax = 10000;
    x.defense = 0;
    x.res = { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0 };
    x.speed = 0;
    x.regen = 0;
  }
  g.world.player.mana = g.world.player.manaMax = 1e6;
  g.world.refreshPlayer();
  return { g, w: g.world, ms };
}
const cast = (g: Game, w: World, skill: string, tx: number, ty: number, steps = 30): void => {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill, tx, ty, targetId: 0 };
  for (let i = 0; i < steps; i++) g.step(1);
};

describe.skipIf(!withoutPd2)('Sorcière de Diablo II : en jeu (jeu de règles d2)', () => {
  it('Armure gelée : défense accrue, gèle l’attaquant au corps à corps', () => {
    const { g, w, ms } = arena({ frozen_armor: 5 }, [{ x: 10.8, y: 15 }]);
    const before = computeDerived(g.character, 2).defense;
    cast(g, w, 'frozen_armor', w.player.x, w.player.y, 20);
    expect(w.player.buffs.some((b) => b.id === 'frozen_armor')).toBe(true);
    expect(w.player.d.defense).toBeGreaterThan(before);
    const m = ms[0];
    m.dmgMin = m.dmgMax = 1;
    m.speed = 3;
    w.godMode = true;
    let frozen = false;
    for (let i = 0; i < 400 && !frozen; i++) {
      g.step(1);
      frozen = m.freezeT > 0;
    }
    expect(frozen, 'le zombie qui frappe est gelé').toBe(true);
  });

  it('Champ statique : 25 % des PV actuels en Enfer, jamais sous 50 %, sans réduire la résistance à la foudre', () => {
    const { g, w, ms } = arena({ static_field: 10 });
    const m = ms[0];
    cast(g, w, 'static_field', m.x, m.y);
    expect(m.hp).toBeCloseTo(7500, 0);
    expect(m.red.light).toBeUndefined();
    m.hp = 4900;
    cast(g, w, 'static_field', m.x, m.y);
    expect(m.hp).toBe(4900);
  });

  it('Trait de feu : pas d’explosion de zone (le voisin n’est pas touché)', () => {
    const { g, w, ms } = arena({ fire_bolt: 10 }, [
      { x: 16, y: 15 },
      { x: 16, y: 16.2 },
    ]);
    cast(g, w, 'fire_bolt', ms[0].x, ms[0].y, 40);
    expect(ms[0].hp).toBeLessThan(10000);
    expect(ms[1].hp).toBe(10000);
  });

  it('Inferno : brûle sans réduire la résistance au feu ; Téléportation sans malus', () => {
    const { g, w, ms } = arena({ inferno: 10, teleport: 1 });
    const m = ms[0];
    cast(g, w, 'inferno', m.x, m.y, 12);
    expect(m.hp).toBeLessThan(10000);
    expect(m.red.fire).toBeUndefined();
    cast(g, w, 'teleport', w.player.x, w.player.y + 3, 20);
    expect(w.player.tpPenaltyPct).toBe(0);
  });
});
