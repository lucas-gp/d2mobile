import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { Game } from '../../src/sim/game';
import { refillBelt } from '../../src/sim/inventory';
import { makeStack } from '../../src/sim/loot/itemgen';
import { beltCapacity } from '../../src/sim/character';
import { withDefaultSettings, type Settings } from '../../src/sim/save';
import { withoutPd2 } from '../needs-pd2';

const rng = new Rng('auto-pickup');

function setup(s: Partial<Settings> = {}, appDefaults = true): Game {
  const g = new Game();
  g.settings = withDefaultSettings(s, appDefaults);
  g.startRun('tristram', 0);
  return g;
}
const drop = (g: Game, base: string, dx = 0.5, qty?: number) => g.world.dropItem(makeStack(rng, base, qty), g.world.player.x + dx, g.world.player.y);
const left = (g: Game) => g.world.items.map((i) => i.item.base);

describe('Ramassage automatique', () => {
  it('runes sous Pul ramassées, Pul et au-dessus non', () => {
    const g = setup();
    drop(g, 'r01');
    drop(g, 'r20');
    drop(g, 'r21');
    drop(g, 'r33');
    g.step(40);
    expect(g.character.materials.r01).toBe(1);
    expect(g.character.materials.r20).toBe(1);
    expect(left(g).sort()).toEqual(['r21', 'r33']);
  });

  it('seuil Vex et Toutes', () => {
    const g = setup({ autoPickupRunes: 'vex' });
    drop(g, 'r21');
    drop(g, 'r26');
    g.step(40);
    expect(g.character.materials.r21).toBe(1);
    expect(left(g)).toEqual(['r26']);
    const h = setup({ autoPickupRunes: 'all' });
    drop(h, 'r33');
    h.step(40);
    expect(h.character.materials.r33).toBe(1);
  });

  it('hors de portée : rien', () => {
    const g = setup();
    drop(g, 'r01', 6);
    g.step(40);
    expect(left(g)).toEqual(['r01']);
  });

  it('en ville : rien', () => {
    const g = new Game();
    g.settings = withDefaultSettings({}, true);
    g.world.dropItem(makeStack(rng, 'r01'), g.world.player.x + 0.5, g.world.player.y);
    g.step(40);
    expect(g.world.items.length).toBe(1);
  });

  it('le filtre de butin n’empêche pas le ramassage automatique (rune, gemme et potion masquées)', () => {
    const g = setup();
    g.setFilter({ hideLowRunes: 5, minGemGrade: 3, showPotions: false });
    drop(g, 'r02');
    drop(g, 'gem_ruby_1');
    drop(g, 'r06');
    drop(g, 'gem_ruby_3');
    g.step(40);
    expect(left(g)).toEqual([]);
    expect(g.character.materials.r02).toBe(1);
    expect(g.character.materials.gem_ruby_1).toBe(1);
    expect(g.character.materials.r06).toBe(1);
    expect(g.character.materials.gem_ruby_3).toBe(1);
  });

  it('gemmes selon le seuil', () => {
    for (const [mode, min] of [
      ['all', 0],
      ['normal', 2],
      ['flawless', 3],
      ['none', 5],
    ] as const) {
      const g = setup({ autoPickupGems: mode });
      for (let q = 0; q < 5; q++) drop(g, `gem_ruby_${q}`);
      g.step(40);
      for (let q = 0; q < 5; q++) expect(g.character.materials[`gem_ruby_${q}`] ?? 0).toBe(q >= min ? 1 : 0);
    }
  });

  it('potions : seulement si la ceinture a de la place', () => {
    const g = setup();
    const belt = g.character.belt;
    belt.find((s) => s.kind === 'heal')!.qty = beltCapacity(g.character) - 1;
    belt.find((s) => s.kind === 'mana')!.qty = beltCapacity(g.character);
    drop(g, 'hp_potion');
    drop(g, 'hp_potion', 0.6);
    drop(g, 'mp_potion');
    g.step(40);
    expect(belt.find((s) => s.kind === 'heal')!.qty).toBe(beltCapacity(g.character));
    expect(left(g).sort()).toEqual(['hp_potion', 'mp_potion']);
  });

  it("réglages « Aucune » et neutres : seul l'or est ramassé", () => {
    const g = setup({ autoPickupRunes: 'none', autoPickupGems: 'none', autoPickupPotions: false });
    drop(g, 'r01');
    drop(g, 'gem_ruby_4');
    drop(g, 'hp_potion');
    g.step(40);
    expect(g.world.items.length).toBe(3);
    const n = setup({}, false);
    drop(n, 'r01');
    n.step(40);
    expect(n.world.items.length).toBe(1);
  });

  it('remplissage de la ceinture depuis le sac, sans perte ni duplication', () => {
    const g = setup();
    const c = g.character;
    const heal = c.belt.find((s) => s.kind === 'heal')!;
    heal.qty = 1;
    const cap = beltCapacity(c);
    c.inventory[0] = makeStack(rng, 'hp_potion', 5);
    c.inventory[1] = makeStack(rng, 'hp_potion');
    c.inventory[2] = makeStack(rng, 'hp_potion');
    const total = 1 + 5 + 1 + 1;
    expect(refillBelt(c)).toBe(Math.min(cap, total) - 1);
    const inBag = c.inventory.reduce((n, it) => n + (it && it.base === 'hp_potion' ? (it.qty ?? 1) : 0), 0);
    expect(heal.qty + inBag).toBe(total);
    expect(heal.qty).toBe(Math.min(cap, total));
    // ceinture pleine : rien ne bouge
    heal.qty = cap;
    const before = c.inventory.map((i) => i?.qty ?? (i ? 1 : 0));
    expect(refillBelt(c)).toBe(0);
    expect(c.inventory.map((i) => i?.qty ?? (i ? 1 : 0))).toEqual(before);
  });

  it('remplissage en jeu, désactivable', () => {
    const g = setup();
    g.character.belt.find((s) => s.kind === 'mana')!.qty = 0;
    g.character.inventory[3] = makeStack(rng, 'mp_potion', 2);
    g.step(60);
    expect(g.character.belt.find((s) => s.kind === 'mana')!.qty).toBe(2);
    const h = setup({ beltRefill: false });
    h.character.belt.find((s) => s.kind === 'mana')!.qty = 0;
    h.character.inventory[3] = makeStack(rng, 'mp_potion', 2);
    h.step(60);
    expect(h.character.belt.find((s) => s.kind === 'mana')!.qty).toBe(0);
  });

  it("migration : anciens réglages -> défauts neutres au module, défauts joueur dans l'application", () => {
    const old = { sound: 0.3 } as Partial<Settings>;
    expect(withDefaultSettings(old).autoPickupRunes).toBeUndefined();
    expect(withDefaultSettings(old).beltRefill).toBeUndefined();
    const app = withDefaultSettings(old, true);
    expect([app.autoPickupRunes, app.autoPickupGems, app.autoPickupPotions, app.beltRefill]).toEqual(['pul', 'all', true, true]);
    expect(withDefaultSettings({ autoPickupRunes: 'none' }, true).autoPickupRunes).toBe('none');
    expect(withDefaultSettings({ autoPickupRunes: 'zzz' as never }, true).autoPickupRunes).toBe('pul');
  });
});

describe('Ramassage automatique des composants', () => {
  it.skipIf(withoutPd2)('éclats de Pierre-Monde, orbes et clés sont ramassés ; l’or garde son circuit ; réglage désactivable', () => {
    const g = setup();
    drop(g, 'worldstone_shard');
    drop(g, 'orb_arcane');
    drop(g, 'key');
    g.step(40);
    expect(left(g)).toEqual([]);
    expect(g.character.materials.worldstone_shard).toBe(1);
    expect(g.character.materials.orb_arcane).toBe(1);
    expect(g.character.materials.key).toBe(1);
    const h = setup({ autoPickupMaterials: false });
    drop(h, 'worldstone_shard');
    h.step(40);
    expect(left(h)).toEqual(['worldstone_shard']);
  });
  it.skipIf(withoutPd2)('neutre par défaut du module (tests, bots)', () => {
    const g = setup({}, false);
    drop(g, 'worldstone_shard');
    g.step(40);
    expect(left(g)).toEqual(['worldstone_shard']);
  });
});
