/** Restes de compétences : soin allié de l'Éclair sacré, explosions secondaires de la Flèche explosive, Tir multiple qui perd 20 % par perforation. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { SKILL_BY_ID, lin } from '../../src/data/skills';
import type { ClassId } from '../../src/data/classes';
import type { Monster } from '../../src/sim/actors';

function arena(cls: ClassId, spawns: { x: number; y: number }[]): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, cls);
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(5, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const ms = g.world.monsters.filter((x) => !x.dead && !x.isSummon);
  for (const x of ms) {
    x.hp = x.hpMax = 1e9;
    x.dmgMin = x.dmgMax = 0;
    x.defense = 0;
  }
  g.world.player.mana = g.world.player.manaMax = 1e6;
  return { g, w: g.world, ms };
}

const cast = (g: Game, w: World, skill: string, tx: number, ty: number): void => {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill, tx, ty, targetId: 0 };
};

describe('Éclair sacré : soin des alliés', () => {
  it('soigne une créature alliée touchée au lieu de la blesser', () => {
    const { g, w, ms } = arena('paladin', [{ x: 9, y: 15 }]);
    g.character.skills.holy_bolt = 10;
    w.refreshPlayer();
    const ally = ms[0];
    ally.isSummon = true;
    ally.pet = 'skeleton';
    ally.hpMax = 1000;
    ally.hp = 100;
    ally.dmgMin = ally.dmgMax = 0;
    cast(g, w, 'holy_bolt', ally.x, ally.y);
    for (let i = 0; i < 40; i++) g.step(1);
    expect(ally.hp).toBeGreaterThan(100);
    expect(ally.dead).toBe(false);
  });
});

describe('Flèche explosive : explosions secondaires', () => {
  it("déclenche les petites explosions de la table (PD2 : nombre selon le niveau) autour de l'impact", () => {
    const { g, w, ms } = arena('amazon', [{ x: 12, y: 15 }]);
    g.character.equipment.mainhand = generateItem(new Rng(2), 'short_bow', 30, { forceQuality: 'normal' });
    g.character.skills.exploding_arrow = 10;
    w.refreshPlayer();
    let sec = 0;
    cast(g, w, 'exploding_arrow', ms[0].x, ms[0].y);
    for (let i = 0; i < 80; i++) {
      for (const e of g.step(1)) if (e.t === 'impact' && e.kind === 'exploding_arrow_sec') sec++;
    }
    expect(sec).toBe(Math.floor(lin(SKILL_BY_ID.exploding_arrow.n.count!, w.player.d.skillLevels.exploding_arrow)));
  });
});

describe('Tir multiple : −20 % par perforation', () => {
  it('chaque perforation réduit les dégâts de la flèche de 20 %', () => {
    const { g, w, ms } = arena('amazon', [
      { x: 9, y: 15 },
      { x: 11, y: 15 },
      { x: 13, y: 15 },
    ]);
    g.character.equipment.mainhand = generateItem(new Rng(2), 'short_bow', 30, { forceQuality: 'normal' });
    g.character.skills.multiple_shot = 1;
    w.refreshPlayer();
    g.character.bonuses = { ...g.character.bonuses, pierceChance: 100, attackRating: 1e6 };
    w.refreshPlayer();
    // une seule flèche : niveau 1 → compte de départ (a minima 1) ; on ne garde que les dégâts du premier tir par cible
    const lost = (m: Monster): number => m.hpMax - m.hp;
    for (let k = 0; k < 8; k++) {
      cast(g, w, 'multiple_shot', 20, 15);
      for (let i = 0; i < 40; i++) g.step(1);
    }
    const [a, b, c] = ms.sort((p, q) => p.x - q.x).map(lost);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(a * 0.95);
    expect(c).toBeLessThan(b * 0.95);
  });
});
