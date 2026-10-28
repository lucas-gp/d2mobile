/** Onglets Runes / Gemmes du coffre : prendre dans le sac, sertir (bouton ou glisser), mot runique, glisser vers une case du sac (l'info-bulle est contrôlée par tools/e2e/stash-runes.mjs). */
import { describe, expect, it } from 'vitest';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { RUNEWORDS, runewordFits } from '../../src/data/items/runewords';
import { Game } from '../../src/sim/game';
import type { Item } from '../../src/sim/item';

Game.resumeOnLoad = true;

const sword = (sockets: number): Item => ({ uid: 'sw1', base: 'short_sword', quality: 'normal', ilvl: 20, sockets, socketed: [], qty: 1 });

function setup() {
  const g = new Game();
  const c = g.character;
  c.inventory = c.inventory.map(() => null);
  c.materials = {};
  return { g, c };
}

describe('coffre : runes et gemmes', () => {
  it('prendre dans le sac : une unité, puis tout ; l’onglet se vide', () => {
    const { g, c } = setup();
    c.materials = { r01: 3 };
    expect(g.withdrawRune('r01', 1)).toBe(1);
    expect(c.materials.r01).toBe(2);
    expect(g.withdrawRune('r01', 5)).toBe(2);
    expect(c.materials.r01).toBeUndefined();
    expect(c.inventory.filter((x) => x?.base === 'r01')).toHaveLength(3);
  });

  it('glisser une rune sur une case vide du sac la pose à cette case', () => {
    const { g, c } = setup();
    c.materials = { gem_ruby_2: 2 };
    expect(g.withdrawRuneTo('gem_ruby_2', 15)).toBe(true);
    expect(c.inventory[15]?.base).toBe('gem_ruby_2');
    expect(c.materials.gem_ruby_2).toBe(1);
    // case prise : repli sur la première place libre
    expect(g.withdrawRuneTo('gem_ruby_2', 15)).toBe(true);
    expect(c.inventory.filter((x) => x?.base === 'gem_ruby_2')).toHaveLength(2);
    expect(g.withdrawRuneTo('gem_ruby_2', 0)).toBe(false);
  });

  it('sertir une rune du coffre dans un objet du sac (action « Sertir dans… ») ; l’onglet seul est débité', () => {
    const { g, c } = setup();
    c.materials = { r01: 1 };
    c.inventory[0] = { uid: 'el-sac', base: 'r01', quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty: 1 };
    const it = sword(2);
    c.inventory[5] = it;
    const r = g.socket({ invIndex: 5 }, { material: 'r01', fromTab: true });
    expect(r.ok).toBe(true);
    expect(it.socketed.map((x) => x.base)).toEqual(['r01']);
    expect(c.materials.r01).toBeUndefined();
    expect(c.inventory[0]?.base).toBe('r01'); // la rune du sac n'a pas été touchée
  });

  it('la séquence complète forme le mot runique ; châsses pleines ou objet sans châsse : refus sans consommer', () => {
    const { g, c } = setup();
    const rw = RUNEWORDS.find((r) => r.runes.length === 2 && runewordFits(r, BASE_BY_ID.short_sword))!;
    c.materials = { [rw.runes[0]]: 1, [rw.runes[1]]: 1, r33: 1 };
    const it = sword(2);
    c.inventory[2] = it;
    expect(g.socket({ invIndex: 2 }, { material: rw.runes[0], fromTab: true }).runeword).toBeUndefined();
    const r = g.socket({ invIndex: 2 }, { material: rw.runes[1], fromTab: true });
    expect(r.runeword).toBe(rw.id);
    expect(it.runeword).toBe(rw.id);
    // plus de châsse libre
    const bad = g.socket({ invIndex: 2 }, { material: 'r33', fromTab: true });
    expect(bad.ok).toBe(false);
    expect(c.materials.r33).toBe(1);
    c.inventory[3] = sword(0);
    expect(g.socket({ invIndex: 3 }, { material: 'r33', fromTab: true }).ok).toBe(false);
    expect(c.materials.r33).toBe(1);
  });

  it('gemmes : sertir depuis l’onglet, dans un objet équipé', () => {
    const { g, c } = setup();
    c.materials = { gem_ruby_2: 2 };
    const it = sword(1);
    c.equipment.mainhand = it;
    const r = g.socket({ slot: 'mainhand' }, { material: 'gem_ruby_2', fromTab: true });
    expect(r.ok).toBe(true);
    expect(it.socketed[0].base).toBe('gem_ruby_2');
    expect(c.materials.gem_ruby_2).toBe(1);
  });
});
