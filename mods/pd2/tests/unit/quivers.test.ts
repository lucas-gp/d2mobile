/** Carquois PD2 (mods/pd2/data/items/quivers.ts) : bases, uniques, mots runiques, port avec l'arme. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { Rng } from '../../../../src/core/rng';
import { BASE_BY_ID } from '../../../../src/data/items';
import { QUIVER_BASES, QUIVER_UNIQUES } from '../../data/items/quivers';
import { RUNE_BY_NAME } from '../../../../src/data/items/runes';
import { activeItems, computeDerived, newCharacter } from '../../../../src/sim/character';
import { addToCharacter, equipFromInventory } from '../../../../src/sim/inventory';
import { generateItem, makeStack } from '../../../../src/sim/loot/itemgen';
import { validateItem } from '../../../../src/sim/loot/validate';
import { matchRuneword } from '../../../../src/sim/socket';
import { itemFinal } from '../../../../src/sim/itemstats';
import type { Item } from '../../../../src/sim/item';

Game.resumeOnLoad = true;

describe('Carquois PD2', () => {
  it('6 bases (N/E/É) avec automod, qlvl 1/25/45, 1-2 châsses', () => {
    expect(QUIVER_BASES).toHaveLength(6);
    expect(QUIVER_BASES.map((b) => b.qlvl)).toEqual([1, 25, 45, 1, 25, 45]);
    expect(BASE_BY_ID.razor_arrows.implicit).toEqual([{ stat: 'maxDmg', min: 18, max: 18 }]);
    expect(BASE_BY_ID.war_bolts.implicit).toEqual([{ stat: 'piercePhys', min: 6, max: 6 }]);
  });

  it('validateItem : toutes les bases, tous les ilvl, toutes les qualités', () => {
    const rng = new Rng(11);
    const errs: string[] = [];
    for (const b of QUIVER_BASES)
      for (let ilvl = 1; ilvl <= 99; ilvl += 7)
        for (const q of ['normal', 'magic', 'rare', 'unique'] as const) {
          for (let k = 0; k < 6; k++) {
            const it = generateItem(rng, b.id, ilvl, { forceQuality: q });
            errs.push(...validateItem(it).map((e) => `${b.id}/${ilvl}/${q}: ${e}`));
          }
        }
    expect(errs).toEqual([]);
  });

  it('les 12 uniques sont générables et valides', () => {
    expect(QUIVER_UNIQUES).toHaveLength(12);
    const rng = new Rng(5);
    for (const u of QUIVER_UNIQUES) {
      const it = generateItem(rng, u.base, 90, { forceUniqueId: u.id });
      expect(it.uniqueId).toBe(u.id);
      expect(validateItem(it)).toEqual([]);
    }
  });

  it('affixes réservés aux carquois (Pourpre, Mortel) tirés sur un carquois magique', () => {
    const rng = new Rng(2);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const a of generateItem(rng, 'razor_arrows', 80, { forceQuality: 'magic' }).affixes ?? []) seen.add(a.id);
    expect([...seen].some((id) => id.startsWith('deadly_') || id.startsWith('jagged_') || id.startsWith('vicious_'))).toBe(true);
  });

  it('mots runiques Écho, Écriture et Prescience sur un carquois à 2 châsses', () => {
    const mk = (runes: string[]): Item => {
      const rng = new Rng(3);
      const it = generateItem(rng, 'sharp_arrows', 30, { forceQuality: 'normal' });
      it.sockets = 2;
      it.socketed = runes.map((n) => makeStack(rng, RUNE_BY_NAME[n.toLowerCase()].id, 1));
      return it;
    };
    expect(matchRuneword(mk(['Tal', 'Ort']))).toBe('rw_ancients_scripture');
    expect(matchRuneword(mk(['Ral', 'Thul']))).toBe('rw_ancients_foresight');
    expect(matchRuneword(mk(['Sol', 'Dol']))).toBe('rw_echo_quiver');
  });

  it('équipement : seulement avec l’arc (flèches) ou l’arbalète (carreaux) ; l’arc garde le carquois', () => {
    const c = newCharacter('Ama', 'amazon');
    c.level = 60;
    c.base.dex = 200;
    c.base.str = 100;
    const rng = new Rng(9);
    const arrows = generateItem(rng, 'sharp_arrows', 40, { forceQuality: 'normal' });
    const bolts = generateItem(rng, 'heavy_bolts', 40, { forceQuality: 'normal' });
    const bow = generateItem(rng, 'long_battle_bow', 40, { forceQuality: 'normal' });
    for (const it of [arrows, bolts, bow]) addToCharacter(c, it);
    const idx = (it: Item) => c.inventory.indexOf(it);
    expect(equipFromInventory(c, idx(arrows)).ok).toBe(false); // sans arc
    expect(equipFromInventory(c, idx(bow)).ok).toBe(true);
    expect(equipFromInventory(c, idx(bolts)).ok).toBe(false); // carreaux avec un arc
    expect(equipFromInventory(c, idx(arrows)).ok).toBe(true);
    expect(c.equipment.mainhand).toBe(bow);
    expect(c.equipment.offhand).toBe(arrows);
    // l'automod +10 dégâts max s'ajoute à l'arc
    const noQ = computeDerived({ ...c, equipment: { mainhand: bow } }, 0).weaponDmg[1];
    expect(computeDerived(c, 0).weaponDmg[1]).toBeGreaterThanOrEqual(noQ + 10);
    expect(itemFinal(arrows).stats.get('maxDmg')).toBe(10);
    expect(activeItems(c)).toContain(arrows);
  });
});
