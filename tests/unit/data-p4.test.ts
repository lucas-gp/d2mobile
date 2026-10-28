/** Données P4 : rune Hel / Mythe, sets D2 complets (Expansion = ligne vide, McAuley's Paragon), potions de jet */
import { describe, expect, it } from 'vitest';
import { BASE_BY_ID, BASES } from '../../src/data/items';
import { RUNE_BY_NAME, RUNES } from '../../src/data/items/runes';
import { D2_SETS, D2_SET_ITEMS } from '../../src/data/items/sets-d2';
import { RUNEWORDS } from '../../src/data/items/runewords';
import { Rng } from '../../src/core/rng';
import { requiredLevel } from '../../src/sim/itemstats';
import { validateItem } from '../../src/sim/loot/validate';
import { withoutPd2 } from '../needs-pd2';
import { generateItem, makeStack } from '../../src/sim/loot/itemgen';

describe('rune Hel et mots runiques', () => {
  it('Hel : niveau requis 0 (Runes.txt D2/PD2), toutes les autres runes au moins 1 et croissantes', () => {
    expect(RUNE_BY_NAME.hel.reqLvl).toBe(0);
    for (const r of RUNES) if (r.name !== 'Hel') expect(r.reqLvl, r.name).toBeGreaterThanOrEqual(11);
    const lvls = RUNES.filter((r) => r.name !== 'Hel').map((r) => r.reqLvl);
    expect([...lvls].sort((a, b) => a - b)).toEqual(lvls);
  });

  it('les mots runiques à Hel gardent un niveau requis propre (Mythe 25) et jamais inférieur à leurs autres runes − 8', () => {
    const withHel = RUNEWORDS.filter((rw) => rw.runes.includes(RUNE_BY_NAME.hel.id));
    expect(withHel.length).toBeGreaterThan(5);
    const myth = RUNEWORDS.find((rw) => rw.id === 'rw_myth')!;
    expect(myth.reqLvl).toBe(25);
    for (const rw of withHel) {
      const others = Math.max(...rw.runes.filter((r) => r !== RUNE_BY_NAME.hel.id).map((r) => RUNES.find((x) => x.id === r)!.reqLvl));
      expect(rw.reqLvl, rw.name).toBeGreaterThanOrEqual(others - 8);
    }
  });

  it('la rune Hel seule n’impose aucun niveau à l’objet (requiredLevel = max des autres sources)', () => {
    const rune = makeStack(new Rng(3), RUNE_BY_NAME.hel.id, 1);
    expect(requiredLevel(rune)).toBe(0);
  });
});

describe('sets D2 (32 sets, 127 pièces ; 128 avec l’Anneau mortel de Bul-Kathos du mod pd2)', () => {
  it('32 sets ; chaque pièce existe et pointe sur son set ; aucune pièce orpheline', () => {
    expect(D2_SETS.length).toBe(32);
    // 127 pièces D2 (SetItems.txt, hors ligne « Expansion ») ; le patch pd2 ajoute l'Anneau mortel (Death Band)
    expect(D2_SET_ITEMS.length).toBe(withoutPd2 ? 127 : 128);
    const ids = new Set(D2_SET_ITEMS.map((i) => i.id));
    for (const s of D2_SETS) {
      expect(s.items.length, s.id).toBeGreaterThanOrEqual(2);
      for (const id of s.items) expect(ids.has(id), `${s.id}/${id}`).toBe(true);
      expect(s.bonuses.length, s.id).toBeGreaterThan(0);
    }
    const inSets = D2_SETS.flatMap((s) => s.items);
    expect(new Set(inSets).size).toBe(inSets.length);
    expect(inSets.length).toBe(D2_SET_ITEMS.length);
    for (const it of D2_SET_ITEMS) expect(BASE_BY_ID[it.base], it.id).toBeTruthy();
  });

  it('« Expansion » n’est qu’un séparateur de SetItems.txt ; McAuley’s Paragon est présent (Parangon de Sander, Calotte)', () => {
    const p = D2_SET_ITEMS.find((i) => i.id === 's_sanders_paragon')!;
    expect(p.set).toBe('set_mcauleys_folly');
    expect(p.base).toBe('cap');
    expect(p.reqLvl).toBe(25);
    expect(D2_SETS.find((s) => s.id === 'set_mcauleys_folly')!.items.length).toBe(4);
  });
});

describe('potions de jet (weapons.txt, type tpot)', () => {
  const ids = ['fulminating_potion', 'strangling_gas_potion', 'exploding_potion', 'choking_gas_potion', 'oil_potion', 'rancid_gas_potion'];
  it('les 6 bases existent, ne s’équipent pas, tombent selon leur niveau, niveaux D2 croissants', () => {
    let prev = 0;
    for (const id of ids) {
      const b = BASE_BY_ID[id];
      expect(b, id).toBeTruthy();
      expect(b.type).toBe('tpot');
      expect(b.slot).toBeUndefined();
      expect(b.noRandomDrop).toBeFalsy(); // elles tombent via la TC des potions (drops.ts)
      expect(b.qlvl).toBeGreaterThan(prev);
      prev = b.qlvl;
    }
    expect(BASES.filter((b) => b.type === 'tpot').length).toBe(6);
  });

  it('un objet fabriqué sur une potion de jet passe validateItem', () => {
    const it = generateItem(new Rng(5), 'oil_potion', 28);
    expect(validateItem(it)).toEqual([]);
  });
});
