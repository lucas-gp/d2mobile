/** Runes, gemmes et matériaux : rangés d'office dans les onglets du coffre ; Cube en grille alimenté depuis ces onglets. */
import { describe, expect, it } from 'vitest';
import { withoutPd2 } from '../needs-pd2';
import { Game } from '../../src/sim/game';
import { addToCharacter } from '../../src/sim/inventory';
import { makeStack } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { CUBE_COLS, CUBE_ROWS, cubeFromTab, cubeItems, cubeRemove, matCount, matTake, stashLooseItems, withdrawFromTab } from '../../src/sim/materials';
import { cubeMatches } from '../../src/sim/cube';

const rune = (id: string, n = 1) => makeStack(new Rng('r'), id, n);

describe('Onglets du coffre', () => {
  it('une rune, une gemme ou une clé ramassée va directement dans son onglet, sans prendre de case', () => {
    const c = new Game().character;
    for (const id of ['r01', 'gem_ruby_2', 'key']) expect(addToCharacter(c, rune(id, 2))).toBe(true);
    expect(c.materials.r01).toBe(2);
    expect(c.materials.gem_ruby_2).toBe(2);
    expect(c.materials.key).toBe(2);
    expect(c.inventory.filter(Boolean).length).toBe(0);
  });

  it('anciennes sauvegardes : les runes et gemmes physiques rejoignent les onglets', () => {
    const c = new Game().character;
    c.inventory[0] = { ...rune('r03'), uid: 'a' };
    c.stash[0][5] = { ...rune('gem_topaz_1'), uid: 'b' };
    expect(stashLooseItems(c)).toBe(2);
    expect(c.materials.r03).toBe(1);
    expect(c.materials.gem_topaz_1).toBe(1);
    expect(c.inventory.filter(Boolean).length).toBe(0);
  });

  it('sortir de l’onglet : une case d’inventaire par unité ; matTake refuse sans rien changer s’il en manque', () => {
    const c = new Game().character;
    c.materials.r01 = 3;
    expect(withdrawFromTab(c, 'r01', 2)).toBe(2);
    expect(c.inventory.filter(Boolean).length).toBe(2);
    expect(matTake(c, 'r01', 9)).toBe(false);
    expect(matCount(c, 'r01')).toBe(3);
    expect(matTake(c, 'r01', 1)).toBe(true);
    expect(matCount(c, 'r01')).toBe(2);
  });
});

describe('Cube en grille (3 × 4, alimenté depuis les onglets)', () => {
  it('dimensions de D2R', () => {
    expect([CUBE_COLS, CUBE_ROWS]).toEqual([3, 4]);
  });

  it('trois runes (et une clé, PD2) donnent la rune suivante, et la recette exacte se propose', () => {
    const g = new Game();
    const c = g.character;
    c.materials.key = 1;
    c.materials.r01 = 3;
    expect(cubeMatches(c)).toEqual([]);
    for (let i = 0; i < 3; i++) expect(cubeFromTab(c, 'r01')).toBe(true);
    expect(cubeItems(c).length).toBe(3);
    expect(c.materials.r01 ?? 0).toBe(0);
    expect(g.cubeMatches().map((r) => r.id)).toContain('rune_r01');
    const res = g.transmuteGrid('rune_r01');
    expect(res.ok).toBe(true);
    expect(cubeItems(c).length).toBe(0);
    expect(matCount(c, 'r01')).toBe(0);
    expect(matCount(c, 'r02')).toBe(1);
    // D2 : 3 El donnent Eld sans clé ; PD2 : avec une clé
    expect(c.materials.key ?? 0).toBe(withoutPd2 ? 1 : 0);
  });

  it('un contenu en trop ne correspond à aucune recette (comme Diablo II : tout est utilisé)', () => {
    const g = new Game();
    const c = g.character;
    c.materials.key = 1;
    c.materials.r01 = 4;
    for (let i = 0; i < 4; i++) cubeFromTab(c, 'r01');
    expect(g.cubeMatches().map((r) => r.id)).not.toContain('rune_r01');
  });

  it('reprendre une rune du Cube la rend à son onglet ; une recette refusée remet tout dans le Cube', () => {
    const g = new Game();
    const c = g.character;
    c.materials.key = 1;
    c.materials.r01 = 3;
    for (let i = 0; i < 3; i++) cubeFromTab(c, 'r01');
    const r = g.transmuteGrid('rune_inconnue');
    expect(r.ok).toBe(false);
    expect(cubeItems(c).length).toBe(3);
    const slot = c.cube.findIndex(Boolean);
    expect(cubeRemove(c, slot)).toBe(true);
    expect(c.materials.r01).toBe(1);
    expect(cubeItems(c).length).toBe(2);
  });
});
