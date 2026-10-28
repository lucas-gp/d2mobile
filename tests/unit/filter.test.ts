import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { FILTER_PRESETS } from '../../src/sim/character';
import { Game } from '../../src/sim/game';
import type { Item } from '../../src/sim/item';
import { lootFilterDecision, SHOW_HIDDEN, SHOW_NORMAL, SHOW_VALUABLE, shouldAutoPickup } from '../../src/sim/loot/filter';
import { generateItem, makeStack } from '../../src/sim/loot/itemgen';
import { withoutPd2 } from '../needs-pd2';

const rng = new Rng('filtre');
const gen = (base: string, q: Item['quality'], extra: Partial<Item> = {}) => Object.assign(generateItem(rng, base, 85, { forceQuality: q }), extra);

describe('Filtre de butin', () => {
  it('les préréglages vont du plus permissif au plus strict', () => {
    const g = new Game();
    const samples = [
      gen('wand', 'normal', { sockets: 1 }), // base à châsses : montrée en montée de niveau
      gen('wand', 'magic'),
      gen('tomb_wand', 'magic'),
      gen('dusk_shroud', 'rare'),
      makeStack(rng, 'r03'),
      makeStack(rng, 'gem_ruby_2'),
      makeStack(rng, 'hp_potion'),
    ];
    const shown: number[] = [];
    for (const p of ['leveling', 'standard', 'endgame', 'strict'] as const) {
      g.setFilter({ preset: p });
      expect(g.character.filter.preset).toBe(p);
      shown.push(samples.filter((it) => lootFilterDecision(g.character, it) > SHOW_HIDDEN).length);
    }
    for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeLessThanOrEqual(shown[i - 1]);
    expect(shown[0]).toBe(samples.length);
    expect(shown[3]).toBeLessThan(shown[0]);
  });

  it('un réglage modifié à la main passe en personnalisé (sauf ramassage et révélation)', () => {
    const g = new Game();
    g.setFilter({ preset: 'endgame' });
    g.setFilter({ revealHidden: true, autoPickupGems: false });
    expect(g.character.filter.preset).toBe('endgame');
    g.setFilter({ minGemGrade: 0 });
    expect(g.character.filter.preset).toBe('custom');
    expect(g.character.filter.minQuality).toBe(FILTER_PRESETS.endgame.minQuality);
  });

  it.skipIf(withoutPd2)('palier des bases, avec exceptions pour les bases à châsses et éthérées', () => {
    const g = new Game();
    g.setFilter({ preset: 'strict' });
    const c = g.character;
    expect(lootFilterDecision(c, gen('tomb_wand', 'magic'))).toBe(SHOW_HIDDEN);
    expect(lootFilterDecision(c, gen('archon_plate', 'normal', { sockets: 4 }))).toBe(SHOW_NORMAL);
    g.setFilter({ showEthereal: true });
    expect(lootFilterDecision(c, gen('mage_plate', 'normal', { ethereal: true }))).toBe(SHOW_NORMAL);
    // sets, uniques, cartes et orbes restent toujours visibles
    expect(lootFilterDecision(c, gen('grim_shield', 'unique'))).toBeGreaterThanOrEqual(SHOW_VALUABLE);
    expect(lootFilterDecision(c, makeStack(rng, 'orb_arcane'))).toBeGreaterThanOrEqual(SHOW_VALUABLE);
  });

  it("gemmes et potions : masquées par le filtre ; seul l'or est ramassé automatiquement", () => {
    const g = new Game();
    g.setFilter({ minGemGrade: 3, showPotions: false });
    const c = g.character;
    expect(lootFilterDecision(c, makeStack(rng, 'gem_ruby_2'))).toBe(SHOW_HIDDEN);
    expect(lootFilterDecision(c, makeStack(rng, 'gem_ruby_3'))).toBeGreaterThan(SHOW_HIDDEN);
    const pot = makeStack(rng, 'hp_potion');
    expect(lootFilterDecision(c, pot)).toBe(SHOW_HIDDEN);
    expect(shouldAutoPickup(c, pot)).toBe(false);
    expect(shouldAutoPickup(c, makeStack(rng, 'gold', 50))).toBe(true);
    expect(shouldAutoPickup(c, makeStack(rng, 'gem_ruby_3'))).toBe(false);
  });

  it('changer le filtre refiltre les objets déjà au sol', () => {
    const g = new Game();
    g.startRun('tristram', 0);
    const w = g.world;
    w.dropItem(gen('wand', 'normal', { sockets: 0 }), w.player.x + 1, w.player.y);
    const gi = w.items[w.items.length - 1];
    g.setFilter({ preset: 'all' });
    expect(gi.show).toBeGreaterThan(SHOW_HIDDEN);
    const v = w.filterVersion;
    g.setFilter({ preset: 'strict' });
    expect(gi.show).toBe(SHOW_HIDDEN);
    expect(w.filterVersion).toBeGreaterThan(v);
  });

  it('montée de niveau : masque l’équipement d’une autre classe et l’équipement dépassé, garde les bases à châsses', () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 60;
    g.setFilter({ preset: 'leveling' });
    const c = g.character;
    // griffes d'Assassin pour une Sorcière : masquées ; baguette magique de bas niveau : dépassée
    const claw = gen('katar', 'rare', { sockets: 0 });
    expect(lootFilterDecision(c, claw)).toBe(SHOW_HIDDEN);
    const old = gen('wand', 'magic', { sockets: 0 });
    expect(lootFilterDecision(c, old)).toBe(SHOW_HIDDEN);
    const socketed = gen('wand', 'normal', { sockets: 3 });
    expect(lootFilterDecision(c, socketed)).toBeGreaterThan(SHOW_HIDDEN);
    g.setFilter({ preset: 'all' });
    expect(lootFilterDecision(c, claw)).toBeGreaterThan(SHOW_HIDDEN);
  });

  it('chasse aux runes : plus d’équipement ordinaire, les runes restent', () => {
    const g = new Game();
    g.setFilter({ preset: 'runehunt' });
    expect(lootFilterDecision(g.character, gen('wand', 'rare', { sockets: 0 }))).toBe(SHOW_HIDDEN);
    expect(lootFilterDecision(g.character, makeStack(rng, 'r20'))).toBeGreaterThan(SHOW_HIDDEN);
  });
});
