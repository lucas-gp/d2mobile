/**
 * Formules de combat PD2 (règles `combat.*` du mod, mods/pd2/rules/combat.ts ; lot M8a : tests autrefois dans tests/unit/combat.test.ts,
 * fidelity-lot1.test.ts et stat-effects.test.ts) : immunités cassées à moitié, brisure, résistance négative divisée par deux, frappe
 * mortelle ×1,5 et son maximum, vol de vie PD2, dégâts de zone de toutes les armes de mêlée. La base (D2 1.13c) : tests/unit/vanilla-combat.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { strike, strikePacket } from '../../../../src/sim/melee';
import { effectiveMonsterRes } from '../../../../src/sim/combat';
import type { ClassId } from '../../../../src/data/classes';
import type { Monster } from '../../../../src/sim/actors';

/** Arène du lot de fidélité 1 : un zombie inoffensif à la vie énorme, niveau 60 */
function arenaL1(cls: 'barbarian' | 'amazon' | 'sorceress', difficulty: 0 | 1 | 2 = 0, count = 1): { g: Game; w: World; m: Monster } {
  const g = new Game(undefined, cls);
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster: 'zombie', x: 11.2, y: 15, count, r: count > 1 ? 1.2 : 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty, zoneLevel: 30, character: g.character });
  g.world.populate();
  for (const x of g.world.monsters) {
    x.hp = x.hpMax = 1e9;
    x.dmgMin = x.dmgMax = 0;
  }
  return { g, w: g.world, m: g.world.monsters.find((x) => !x.dead && !x.isSummon)! };
}

function game(cls: ClassId, level = 60): Game {
  const g = new Game(undefined, cls);
  addXp(g.character, xpToReach(level));
  g.enterTown();
  return g;
}

/** Arène avec un monstre inoffensif, joueur au corps à corps, difficulté Normal */
function arena(g: Game, monster = 'zombie', count = 1): { w: World; m: Monster } {
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster, x: 11.2, y: 15, count, r: count > 1 ? 1.2 : 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  for (const x of g.world.monsters) {
    x.hp = x.hpMax = 1e9;
    x.dmgMin = x.dmgMax = 0;
  }
  const m = g.world.monsters.find((x) => !x.dead && !x.isSummon)!;
  return { w: g.world, m };
}

const withStat = (g: Game, stat: string, v: number): void => {
  g.character.bonuses = { ...g.character.bonuses, [stat]: v };
  g.world?.refreshPlayer();
};

describe('Combat PD2 : résistances et immunités', () => {
  it('les réductions cassent une immunité à moitié (PD2)', () => {
    // Feu 110 %, réduction 21 → 10 → 100 % : toujours immunisé
    expect(effectiveMonsterRes(110, 0, false, 21).immune).toBe(true);
    // réduction 52 → 26 → 84 % : cassé, puis pénétration 20 → 64
    const r = effectiveMonsterRes(110, 20, false, 52);
    expect(r.immune).toBe(false);
    expect(r.res).toBe(64);
  });
  it('partie négative divisée par deux, plancher -100', () => {
    expect(effectiveMonsterRes(0, 40, false).res).toBe(-20);
    expect(effectiveMonsterRes(-50, 500, false).res).toBe(-100);
  });
  it('charme Sunder : immunité ramenée à 95 %', () => {
    const r = effectiveMonsterRes(150, 30, true);
    expect(r.immune).toBe(false);
    expect(r.res).toBe(65);
  });
});

describe('Combat PD2 : critiques, vol de vie, zone de mêlée', () => {
  it('frappe mortelle ×1,5 : dégâts moyens entre ×1,25 et ×1,5 à 75 %', () => {
    const { g, w, m } = arenaL1('barbarian');
    const avg = (): number => {
      let s = 0;
      for (let i = 0; i < 600; i++) {
        m.hp = m.hpMax;
        delete w.character.equipment.mainhand?.dur;
        s += strike(w, m, { sure: true, noSplash: true });
      }
      return s / 600;
    };
    const base = avg();
    g.character.bonuses = { deadlyStrike: 75 };
    w.refreshPlayer();
    const r = avg() / base;
    expect(r).toBeGreaterThan(1.25);
    expect(r).toBeLessThan(1.5);
  });
  it('le vol de vie est réduit en Cauchemar (÷ 2) et en Enfer (÷ 3)', () => {
    const gain = (diff: 0 | 1 | 2): number => {
      const { g, w, m } = arenaL1('barbarian', diff);
      g.character.bonuses = { lifeLeech: 2000 };
      w.refreshPlayer();
      w.player.hpMax = 1e9;
      w.player.hp = 1;
      let dealt = 0;
      for (let i = 0; i < 50; i++) {
        delete w.character.equipment.mainhand?.dur;
        dealt += strike(w, m, { sure: true, noSplash: true });
      }
      return (w.player.hp - 1) / dealt; // vie volée par point de dégâts (la résistance du monstre change selon la difficulté)
    };
    const n = gain(0);
    expect(n).toBeGreaterThan(0);
    expect(gain(1) / n).toBeCloseTo(0.5, 1);
    expect(gain(2) / n).toBeCloseTo(1 / 3, 1);
  });
  it('toutes les armes de mêlée frappent en zone, sans le vol de vie des voisins plein', () => {
    const { w, m, g } = arenaL1('barbarian', 0, 3);
    const other = w.monsters.find((x) => x !== m && !x.dead && !x.isSummon)!;
    other.x = m.x + 1;
    other.y = m.y;
    w.monsterHash.clear();
    for (const x of w.monsters) if (!x.dead) w.monsterHash.insert(x);
    const hp = other.hp;
    strike(w, m, { sure: true });
    expect(other.hp).toBeLessThan(hp);
    void g;
  });
  it('dégâts de zone (mêlée) touchent les voisins', () => {
    const g = game('barbarian');
    const { w, m } = arena(g, 'zombie', 3);
    const other = w.monsters.find((x) => x !== m && !x.dead && !x.isSummon)!;
    other.x = m.x + 1;
    other.y = m.y;
    w.monsterHash.clear();
    for (const x of w.monsters) if (!x.dead) w.monsterHash.insert(x);
    withStat(g, 'splashDmg', 1);
    const hp = other.hp;
    strike(w, m, { sure: true });
    expect(other.hp).toBeLessThan(hp);
  });
  it('multiplicateur et maximum de frappe mortelle', () => {
    const g = game('barbarian');
    const { w } = arena(g);
    const avg = (n = 600): number => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += strikePacket(w).phys;
      return sum / n;
    };
    withStat(g, 'deadlyStrike', 75);
    const base = avg();
    withStat(g, 'deadlyMult', 150);
    expect(avg()).toBeGreaterThan(base * 1.2);
    withStat(g, 'deadlyMult', 0);
    // maximum : 75 % plafonné, 95 % avec +20 % de maximum
    withStat(g, 'deadlyStrike', 95);
    const capped = avg();
    withStat(g, 'maxDeadly', 20);
    expect(avg()).toBeGreaterThan(capped * 1.08);
  });
});
