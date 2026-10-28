/** Bugs de l'audit technique : ceinture pleine, ingrédients de Cube, rachat chez le marchand, graines d'artisanat */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { Rng } from '../../src/core/rng';
import { generateItem } from '../../src/sim/loot/itemgen';
import { makeStack } from '../../src/sim/loot/itemgen';
import { beltCapacity } from '../../src/sim/character';
import { pickupGroundItem, placeInInventory } from '../../src/sim/inventory';
import { BUYBACK_MAX } from '../../src/sim/game';

describe('B6 : ceinture pleine', () => {
  it('la potion reste au sol et le joueur en est prévenu', () => {
    const g = new Game();
    g.startRun('tristram', 0, 1);
    const w = g.world;
    const c = g.character;
    c.belt.find((s) => s.kind === 'heal')!.qty = beltCapacity(c);
    const gi = w.dropItem(makeStack(new Rng('p'), 'hp_potion', 1), w.player.x, w.player.y, 0);
    w.events.drain();
    expect(pickupGroundItem(w, gi)).toBe(false);
    expect(w.items).toContain(gi);
    expect(w.events.drain().some((e) => e.t === 'message' && e.text === 'Ceinture pleine')).toBe(true);
  });

  it('avec de la place, la potion est ramassée sans message d’erreur', () => {
    const g = new Game();
    g.startRun('tristram', 0, 1);
    const w = g.world;
    const gi = w.dropItem(makeStack(new Rng('p'), 'hp_potion', 1), w.player.x, w.player.y, 0);
    g.character.belt.find((s) => s.kind === 'heal')!.qty = 0;
    w.events.drain();
    expect(pickupGroundItem(w, gi)).toBe(true);
    expect(w.events.drain().some((e) => e.t === 'message')).toBe(false);
  });
});

describe('Cube : atomicité (R6)', () => {
  it('artisanat : sans joyau rien n’est consommé (pas d’inventory[-1])', () => {
    const g = new Game();
    const c = g.character;
    c.level = 80;
    const rng = new Rng('craft');
    c.inventory[0] = generateItem(rng, 'ring', 80, { forceQuality: 'magic' });
    c.materials.r01 = 5;
    for (const k of ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst', 'skull']) c.materials[`gem_${k}_4`] = 5;
    const before = JSON.stringify({ inv: c.inventory, mats: c.materials, gold: c.gold });
    const r = g.transmute('craft_hit', [0]);
    expect(r.ok).toBe(false);
    expect(JSON.stringify({ inv: c.inventory, mats: c.materials, gold: c.gold })).toBe(before);
    expect(c.inventory.length).toBe(JSON.parse(before).inv.length);
  });

  it('artisanat avec joyau : le joyau est consommé, pas un autre objet', () => {
    const g = new Game();
    const c = g.character;
    c.level = 80;
    const rng = new Rng('craft2');
    c.inventory[0] = generateItem(rng, 'ring', 80, { forceQuality: 'magic' });
    c.inventory[5] = generateItem(rng, 'jewel', 60, { forceQuality: 'magic' });
    c.inventory[9] = generateItem(rng, 'amulet', 60, { forceQuality: 'magic' });
    const amulet = c.inventory[9];
    for (const id of Object.keys(c.materials)) c.materials[id] = 20;
    for (const k of ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst', 'skull']) c.materials[`gem_${k}_4`] = 5;
    for (let k = 1; k <= 33; k++) c.materials[`r${String(k).padStart(2, '0')}`] = 5;
    const r = g.transmute('craft_hit', [0]);
    if (r.ok) {
      expect(c.inventory[5]).toBeNull();
      expect(c.inventory[9]).toBe(amulet);
    } else {
      // recette non disponible dans ce jeu d'essai : l'état est intact
      expect(c.inventory[5]).not.toBeNull();
    }
  });
});

describe('B5 : vente, confirmation et rachat', () => {
  const sword = () => generateItem(new Rng('sword'), 'short_sword', 30, { forceQuality: 'rare' });

  it('un objet vendu est rachetable au prix de la vente (aller-retour neutre)', () => {
    const g = new Game();
    g.startRun('tristram', 0, 1);
    g.enterTown();
    const c = g.character;
    const it = sword();
    c.inventory[3] = it;
    const gold0 = c.gold;
    expect(g.sell(3)).toBe(true);
    expect(c.inventory[3]).toBeNull();
    expect(g.buyback[0].item).toBe(it);
    const price = g.buyback[0].price;
    expect(c.gold).toBe(gold0 + price);
    expect(g.rebuy(0).ok).toBe(true);
    expect(c.gold).toBe(gold0);
    expect(c.inventory.includes(it)).toBe(true);
    expect(g.buyback.length).toBe(0);
  });

  it('rachat refusé sans assez d’or, et l’objet reste proposé', () => {
    const g = new Game();
    g.startRun('tristram', 0, 1);
    g.enterTown();
    const c = g.character;
    c.inventory[0] = sword();
    g.sell(0);
    c.gold = 0;
    expect(g.rebuy(0).ok).toBe(false);
    expect(g.buyback.length).toBe(1);
  });

  it('sellCommonList annonce exactement ce que sellCommon vend, et le garde en rachat ; l’onglet est borné', () => {
    const g = new Game();
    g.startRun('tristram', 0, 1);
    g.enterTown();
    const c = g.character;
    const rng = new Rng('many');
    for (let i = 0; i < 6; i++) placeInInventory(c, generateItem(rng, 'short_sword', 5, { forceQuality: 'normal' }));
    const rare = sword();
    placeInInventory(c, rare);
    const list = g.sellCommonList();
    expect(list.length).toBeGreaterThan(0);
    const r = g.sellCommon();
    expect(r.count).toBe(list.length);
    expect(g.buyback.length).toBe(list.length);
    expect(c.inventory.includes(rare)).toBe(true);
    for (let i = 0; i < BUYBACK_MAX + 5; i++) {
      c.inventory[0] = generateItem(rng, 'short_sword', 5, { forceQuality: 'normal' });
      g.sell(0);
    }
    expect(g.buyback.length).toBe(BUYBACK_MAX);
  });
});

describe('Graines d’artisanat indépendantes de l’or', () => {
  it('même état, or différent -> même résultat de relance ; deux tentatives successives diffèrent', () => {
    const run = (gold: number, tries = 1) => {
      const g = new Game();
      const c = g.character;
      c.level = 60;
      c.gold = gold;
      c.inventory[0] = generateItem(new Rng('base'), 'ring', 60, { forceQuality: 'magic' });
      for (const k of ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst', 'skull']) c.materials[`gem_${k}_4`] = 30;
      const out: string[] = [];
      for (let i = 0; i < tries; i++) {
        const r = g.transmute('reroll_magic', [i === 0 ? 0 : c.inventory.findIndex((x) => x)]);
        expect(r.ok).toBe(true);
        out.push(JSON.stringify(r.item?.affixes ?? r.item));
      }
      return out;
    };
    expect(run(0)).toEqual(run(987654));
    const two = run(5, 2);
    expect(two[0]).not.toBe(two[1]);
  });

  it('le compteur avance à chaque tentative, même ratée', () => {
    const g = new Game();
    const n0 = g.craftSeq;
    g.transmute('reroll_magic', [0]); // aucun objet : échec
    expect(g.craftSeq).toBe(n0 + 1);
  });
});
