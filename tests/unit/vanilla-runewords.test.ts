/**
 * Mots runiques de la base = Diablo II LoD 1.13c (lot M10b, src/data/items/runewords-d2.ts : Runes.txt, lignes `complete`) ; le jeu pd2 les
 * remplace par son patch (mods/pd2/data/items/runewords.patch.ts, test vanilla-patch). La table est contrôlée contre les MPQ par
 * vanilla-mpq.test.ts.
 */
import { describe, expect, it } from 'vitest';
import '../../src/data/items/index';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { RUNEWORDS, RUNEWORD_BY_ID, runewordFits } from '../../src/data/items/runewords';
import { RUNE_BY_ID } from '../../src/data/items/runes';
import { withoutPd2 } from '../needs-pd2';

const base = (id: string) => BASE_BY_ID[id];

describe.skipIf(!withoutPd2)('Mots runiques D2 1.13c (jeu de règles d2)', () => {
  it('les 78 lignes complètes de Runes.txt, identifiant du nom affiché (Chaînes d’honneur, Chagrin)', () => {
    expect(RUNEWORDS.length).toBe(78);
    expect(RUNEWORD_BY_ID.rw_chains_of_honor.runes).toEqual(['r14', 'r22', 'r30', 'r24']);
    expect(RUNEWORD_BY_ID.rw_grief.types).toEqual(['d2:swor', 'd2:axe']);
    // lignes incomplètes de la table (Pattern, Plague…) absentes
    expect(RUNEWORD_BY_ID.rw_plague).toBeUndefined();
  });
  it('niveau requis : celui de la rune la plus haute', () => {
    for (const w of RUNEWORDS) expect(w.reqLvl, w.id).toBe(Math.max(...w.runes.map((r) => RUNE_BY_ID[r].reqLvl)));
  });
  it('types d’ItemTypes.txt : Esprit sur épée et bouclier (une seule ligne), Noir sur les masses contondantes', () => {
    const spirit = RUNEWORD_BY_ID.rw_spirit;
    expect(runewordFits(spirit, base('crystal_sword'))).toBe(true);
    expect(runewordFits(spirit, base('targe'))).toBe(true);
    expect(runewordFits(spirit, base('quilted_armor'))).toBe(false);
    expect(runewordFits(RUNEWORD_BY_ID.rw_black, base('club'))).toBe(true);
    expect(runewordFits(RUNEWORD_BY_ID.rw_black, base('short_sword'))).toBe(false);
  });
  it('propriétés du mot runique seules (les runes serties ajoutent les leurs) : Esprit +2 compétences, 89-112 de mana', () => {
    const m = RUNEWORD_BY_ID.rw_spirit.mods;
    expect(m.find((x) => x.stat === 'allSkills')?.min).toBe(2);
    expect(m.find((x) => x.stat === 'mana')).toMatchObject({ min: 89, max: 112 });
  });
});
