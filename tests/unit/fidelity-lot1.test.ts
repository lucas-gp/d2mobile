/** Premier lot de fidélité D2/PD2 (audit du 2026-10-06) : montée de niveau, potions, esquive, critiques, vol de vie, dégâts de zone, résistances, bonus d'arme, niveaux de zone. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, gainXp, xpToReach } from '../../src/sim/progression';
import { computeDerived } from '../../src/sim/character';
import { addToCharacter } from '../../src/sim/inventory';
import { generateItem, makeStack } from '../../src/sim/loot/itemgen';
import { damagePlayer } from '../../src/sim/combat';
import { emptyPacket } from '../../src/sim/actors';
import { CLASSES } from '../../src/data/classes';
import { A1_LEVELS } from '../../src/data/levels-a1';
import { RUN_BY_ID } from '../../src/data/runs';
import { Rng } from '../../src/core/rng';
import type { Monster } from '../../src/sim/actors';
import { withoutPd2 } from '../needs-pd2';

function arena(cls: 'barbarian' | 'amazon' | 'sorceress', difficulty: 0 | 1 | 2 = 0, count = 1): { g: Game; w: World; m: Monster } {
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

describe('Fidélité : lot 1', () => {
  it('la montée de niveau rend toute la vie et tout le mana', () => {
    const { w } = arena('barbarian');
    w.player.hp = 1;
    w.player.mana = 0;
    gainXp(w, xpToReach(w.character.level + 1) - w.character.xp + 1);
    expect(w.player.hp).toBe(w.player.hpMax);
    expect(w.player.mana).toBe(w.player.manaMax);
  });

  it('une potion de haut niveau ne relève pas tout le tas de la ceinture', () => {
    const g = new Game();
    const c = g.character;
    const heal = c.belt.find((b) => b.kind === 'heal')!;
    heal.qty = 3;
    heal.tier = 0;
    const hi = makeStack(new Rng('p'), 'hp_potion', 1);
    hi.ilvl = 85;
    addToCharacter(c, hi);
    expect(heal.qty).toBe(4);
    expect(heal.tier).toBeLessThanOrEqual(1);
  });

  // lot 321: rule `potion.rejuv` (pd2: 65 %, at most 2 000; Diablo II without the mod: 100 %, no cap)
  it('potion de rajeunissement : 65 % de la vie et du mana, 2 000 au plus (pd2) ; 100 % (Diablo II)', () => {
    const { w } = arena('sorceress');
    const slot = w.character.belt.find((b) => b.kind === 'rejuv')!;
    slot.qty = 2;
    slot.tier = 1;
    w.player.hp = 1;
    w.player.mana = 1;
    w.player.potionCd = 0;
    expect(w.usePotion('rejuv')).toBe(true);
    const pct = withoutPd2 ? 1 : 0.65;
    const cap = withoutPd2 ? Infinity : 2000;
    expect(w.player.hp).toBeCloseTo(Math.min(w.player.hpMax, Math.min(cap, w.player.hpMax * pct) + 1), 0);
    expect(slot.qty).toBe(1);
  });

  it.skipIf(withoutPd2)('l’esquive de l’Amazone évite des coups de mêlée immobile', () => {
    const { g, w, m } = arena('amazon');
    g.character.skills.dodge = 20;
    w.refreshPlayer();
    m.ar = 1e6;
    m.mlvl = 30;
    w.player.mode = 'idle';
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      w.player.hp = w.player.hpMax = 1e9;
      const p = emptyPacket(false);
      p.phys = 10;
      if (damagePlayer(w, w.player, p, m) > 0) hits++;
    }
    expect(w.player.d.dodgeMelee).toBeGreaterThan(0);
    expect(hits).toBeLessThan(400 * (1 - w.player.d.dodgeMelee / 100) * 1.15);
  });

  // règle `char.maxResCap` : PD2 90 %, D2 95 %
  it('les résistances maximum plafonnent à 90 % (PD2 ; D2 : 95 %)', () => {
    const g = new Game();
    g.character.bonuses = { resFire: 300, maxResFire: 50 };
    expect(computeDerived(g.character, 0).res.fire).toBe(withoutPd2 ? 95 : 90);
  });

  it('dégâts d’arme : l’arc suit la Dextérité', () => {
    const g = new Game(undefined, 'amazon');
    g.character.equipment.mainhand = generateItem(new Rng(3), 'short_bow', 20, { forceQuality: 'normal' });
    const d0 = computeDerived(g.character, 0);
    g.character.base.dex += 100;
    const d1 = computeDerived(g.character, 0);
    expect(d1.weaponDmg[1] / d0.weaponDmg[1]).toBeGreaterThan(1.3);
    g.character.base.dex -= 100;
    g.character.base.str += 100;
    const d2 = computeDerived(g.character, 0);
    expect(d2.weaponDmg[1]).toBeCloseTo(d0.weaponDmg[1], 5);
  });

  it('mana par niveau PD2 : Amazone, Assassin, Paladin 2 ; Barbare 1,5 (1,5 et 1 en D2 1.13c, CharStats.txt)', () => {
    expect([CLASSES.amazon.manaPerLevel, CLASSES.assassin.manaPerLevel, CLASSES.paladin.manaPerLevel, CLASSES.barbarian.manaPerLevel]).toEqual(withoutPd2 ? [1.5, 1.5, 1.5, 1] : [2, 2, 2, 1.5]);
  });

  it('niveaux de zone : Burial Grounds en Enfer à 85, Comtesse et Andariel à 85 (PD2 ; 80, 79 et 73 en D2 1.13c, Levels.txt)', () => {
    expect(A1_LEVELS.a1_burial.lvl[2]).toBe(withoutPd2 ? 80 : 85);
    expect(RUN_BY_ID.countess.zoneLevel[2]).toBe(withoutPd2 ? 79 : 85);
    expect(RUN_BY_ID.andariel.zoneLevel[2]).toBe(withoutPd2 ? 73 : 85);
  });
});
