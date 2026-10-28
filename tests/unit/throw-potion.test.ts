/** Potions de jet (D2) : réserve, lancer, feu de zone, gaz, sécurité (joueur, alliés, ville), butin et boutique. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { addToCharacter } from '../../src/sim/inventory';
import { makeStack } from '../../src/sim/loot/itemgen';
import { validateItem } from '../../src/sim/loot/validate';
import { spawnMonster } from '../../src/sim/spawn';
import { addThrowPotions, throwPotion, throwSelected, throwTotal } from '../../src/sim/throwpotion';
import { THROW_STACK_MAX } from '../../src/data/throwpotions';
import { keyActionPc } from '../../src/input/mode';
import { rollTc } from '../../src/sim/loot/drops';
import { NO_BONUS } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import type { Monster } from '../../src/sim/actors';

function arena(): { g: Game; w: World; near: Monster; far: Monster } {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(5, 15);
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  const w = g.world;
  w.populate();
  const mk = (x: number) => {
    const m = spawnMonster(w, 'zombie', x, 15, { rank: 'normal' }, `t:${x}`)!;
    m.hp = m.hpMax = 1e9;
    m.dmgMin = m.dmgMax = 0;
    m.def = { ...m.def, speed: 0 } as never;
    return m;
  };
  const near = mk(14);
  const far = mk(25);
  return { g, w, near, far };
}

const hpOf = (m: Monster) => m.hpMax - m.hp;

describe('Potions de jet', () => {
  it('empile par type jusqu’à 25 et range le reste dans le sac', () => {
    const g = new Game(undefined, 'sorceress');
    const c = g.character;
    expect(addToCharacter(c, makeStack(new Rng('a'), 'oil_potion', 20))).toBe(true);
    expect(addToCharacter(c, makeStack(new Rng('b'), 'oil_potion', 10))).toBe(true);
    expect(c.throwPots!.oil_potion).toBe(THROW_STACK_MAX);
    expect(c.inventory.some((i) => i?.base === 'oil_potion' && i.qty === 5)).toBe(true);
    addThrowPotions(c, 'exploding_potion', 2);
    expect(throwSelected(c)).toBe('exploding_potion');
    expect(throwTotal(c)).toBe(27);
  });

  it('un lancer consomme 1 ; quantité 0 : rien ; recharge d’une seconde', () => {
    const { w } = arena();
    expect(throwPotion(w, 14, 15)).toBe(false);
    addThrowPotions(w.character, 'exploding_potion', 2);
    expect(throwPotion(w, 14, 15)).toBe(true);
    expect(w.character.throwPots!.exploding_potion).toBe(1);
    expect(throwPotion(w, 14, 15)).toBe(false); // recharge
    w.step(26);
    expect(throwPotion(w, 14, 15)).toBe(true);
    expect(w.character.throwPots!.exploding_potion).toBeUndefined();
  });

  it('le feu blesse les monstres dans le rayon, pas ceux au-delà', () => {
    const { w, near, far } = arena();
    addThrowPotions(w.character, 'oil_potion', 1);
    expect(throwPotion(w, 14, 15)).toBe(true);
    w.step(60);
    expect(hpOf(near)).toBeGreaterThan(10);
    expect(hpOf(far)).toBe(0);
  });

  it('le gaz empoisonne dans le temps, nuage compris', () => {
    const { w, near, far } = arena();
    addThrowPotions(w.character, 'rancid_gas_potion', 1);
    throwPotion(w, 14, 15);
    w.step(30);
    const early = hpOf(near);
    expect(early).toBeGreaterThan(0);
    w.step(100);
    expect(hpOf(near)).toBeGreaterThan(early * 2);
    expect(hpOf(far)).toBe(0);
  });

  it('ne blesse ni le joueur ni ses alliés', () => {
    const { w } = arena();
    const ally = spawnMonster(w, 'zombie', 8, 15, { rank: 'normal' }, 'ally')!;
    ally.isSummon = true;
    ally.pet = 'merc';
    ally.hp = ally.hpMax = 1000;
    ally.dmgMin = ally.dmgMax = 0;
    const hp0 = w.player.hp;
    addThrowPotions(w.character, 'oil_potion', 1);
    addThrowPotions(w.character, 'choking_gas_potion', 1);
    w.character.throwSel = 'oil_potion';
    throwPotion(w, w.player.x, w.player.y);
    w.step(30);
    w.character.throwSel = 'choking_gas_potion';
    throwPotion(w, ally.x, ally.y);
    w.step(100);
    expect(w.player.hp).toBeGreaterThanOrEqual(hp0);
    expect(ally.hp).toBe(1000);
  });

  it('interdit en ville', () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown();
    addThrowPotions(g.character, 'oil_potion', 3);
    expect(g.world.zone.town).toBe(true);
    expect(throwPotion(g.world, 10, 10)).toBe(false);
    expect(g.character.throwPots!.oil_potion).toBe(3);
  });

  it('les potions de jet tombent avec la TC des potions, selon le niveau', () => {
    const rng = new Rng(11);
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++)
      for (const it of rollTc({ rng, ilvl: 10, mf: 0, difficulty: 0, zoneKey: 'tristram', mapTier: 0, bonus: NO_BONUS, gf: 0, quantity: 1 }, 'potion')) {
        expect(validateItem(it)).toEqual([]);
        if (!['hp_potion', 'mp_potion', 'rejuv_potion'].includes(it.base)) seen.add(it.base);
      }
    expect([...seen].sort()).toEqual(['fulminating_potion', 'strangling_gas_potion']);
  });

  it('butin valide, touche G, boutique', () => {
    const it = makeStack(new Rng('v'), 'fulminating_potion', 3);
    expect(validateItem(it)).toEqual([]);
    expect(keyActionPc('KeyG')).toEqual({ t: 'throw' });
    const g = new Game(undefined, 'sorceress');
    g.character.gold = 1000;
    g.character.level = 30;
    expect(g.buyConsumable('exploding_potion', 5).ok).toBe(true);
    expect(g.character.throwPots!.exploding_potion).toBe(5);
    expect(g.character.gold).toBe(1000 - 80 * 5);
    g.character.level = 1;
    expect(g.buyConsumable('rancid_gas_potion', 5).ok).toBe(false);
  });
});
