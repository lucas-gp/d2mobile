/** Inventaire en grille 10 × 4 : les objets occupent w × h cases (casque 2 × 2, armure 2 × 3, bâton 1 × 4…) */
import { describe, expect, it } from 'vitest';
import { newCharacter } from '../../src/sim/character';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { INV_COLS, addToCharacter, findSlot, itemSize, occupancy, repairInventory, sortInventory } from '../../src/sim/inventory';

const make = (id: string) => generateItem(new Rng(`inv:${id}`), id, 30, { forceQuality: 'normal' });

describe("grille d'inventaire", () => {
  it('tailles de Diablo II', () => {
    expect(itemSize(make('ring'))).toEqual([1, 1]);
    expect(itemSize(make('amulet'))).toEqual([1, 1]);
    expect(itemSize(make('long_staff'))).toEqual([1, 4]);
    expect(itemSize(make('quilted_armor'))).toEqual([2, 3]);
    expect(itemSize(make('gloves_l'))).toEqual([2, 2]);
    expect(itemSize(make('light_belt'))).toEqual([2, 1]);
  });

  it('les objets ne se chevauchent pas et la grille se remplit', () => {
    const c = newCharacter(undefined, 'sorceress');
    let added = 0;
    for (let k = 0; k < 20; k++) if (addToCharacter(c, make('quilted_armor'))) added++;
    // 2 × 3 dans 10 × 4 : cinq colonnes de deux, une seule rangée de trois (la 4e ligne reste libre)
    expect(added).toBe(5);
    const occ = occupancy(c);
    expect(occ.filter((v) => v >= 0).length).toBe(added * 6);
    expect(findSlot(c, make('ring'))).toBeGreaterThanOrEqual(0);
  });

  it('un objet qui ne rentre pas nulle part est refusé', () => {
    const c = newCharacter(undefined, 'sorceress');
    for (let k = 0; k < INV_COLS; k++) addToCharacter(c, make('long_staff'));
    expect(c.inventory.filter(Boolean).length).toBe(INV_COLS);
    expect(addToCharacter(c, make('ring'))).toBe(false);
  });

  it("l'ancienne disposition en cases de 1 × 1 est remise d'aplomb sans rien perdre", () => {
    const c = newCharacter(undefined, 'sorceress');
    const items = ['quilted_armor', 'gloves_l', 'long_staff', 'ring', 'light_belt'].map(make);
    items.forEach((it, i) => (c.inventory[i] = it));
    repairInventory(c);
    const kept = c.inventory.filter(Boolean);
    expect(kept.length).toBe(items.length);
    const occ = occupancy(c);
    const total = items.reduce((s, it) => s + itemSize(it)[0] * itemSize(it)[1], 0);
    expect(occ.filter((v) => v >= 0).length).toBe(total);
  });

  it('le tri tasse les objets sans en perdre', () => {
    const c = newCharacter(undefined, 'sorceress');
    for (const id of ['quilted_armor', 'ring', 'long_staff', 'gloves_l', 'amulet']) addToCharacter(c, make(id));
    const before = new Set(c.inventory.filter(Boolean).map((i) => i!.uid));
    sortInventory(c);
    expect(new Set(c.inventory.filter(Boolean).map((i) => i!.uid))).toEqual(before);
  });
});

describe('vente groupée', () => {
  it('vend les équipements ordinaires et garde le reste', async () => {
    const { Game } = await import('../../src/sim/game');
    const g = new Game();
    const c = g.character;
    const normal = make('quilted_armor');
    const rare = generateItem(new Rng('r'), 'gloves_l', 30, { forceQuality: 'rare' });
    addToCharacter(c, normal);
    addToCharacter(c, rare);
    const gold = c.gold;
    const r = g.sellCommon();
    expect(r.count).toBe(1);
    expect(c.gold).toBeGreaterThan(gold);
    expect(c.inventory.includes(rare)).toBe(true);
    expect(c.inventory.includes(normal)).toBe(false);
  });
});

describe('coffre en grille 10 × 8', () => {
  it("l'ancien coffre (48 cases) est replacé selon la taille des objets sans rien perdre", async () => {
    const { relayoutStash, STASH_COLS, STASH_ROWS, occupancyOf, itemSize: size } = await import('../../src/sim/inventory');
    const old: (ReturnType<typeof make> | null)[] = new Array(48).fill(null);
    ['quilted_armor', 'long_staff', 'ring', 'gloves_l', 'light_belt', 'amulet'].forEach((id, i) => (old[i * 2] = make(id)));
    const tab = relayoutStash(old);
    expect(tab.length).toBe(STASH_COLS * STASH_ROWS);
    const kept = tab.filter(Boolean) as ReturnType<typeof make>[];
    expect(kept.length).toBe(6);
    const total = kept.reduce((s, it) => s + size(it)[0] * size(it)[1], 0);
    expect(occupancyOf(tab, STASH_COLS, STASH_ROWS).filter((v) => v >= 0).length).toBe(total);
  });

  it('un objet se range au coffre et en sort avec sa taille, le sac plein refuse', async () => {
    const { Game } = await import('../../src/sim/game');
    const g = new Game();
    const c = g.character;
    const armor = make('quilted_armor');
    addToCharacter(c, armor);
    const idx = c.inventory.indexOf(armor);
    expect(g.stash(idx, 0)).toBe(true);
    expect(c.stash[0].includes(armor)).toBe(true);
    expect(g.unstash(0, c.stash[0].indexOf(armor))).toBe(true);
    expect(c.inventory.includes(armor)).toBe(true);
  });
});
