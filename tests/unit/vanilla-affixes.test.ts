/**
 * Affixes de la base = Diablo II LoD 1.13c (lot M10a, src/data/items/affixes-d2.ts : MagicPrefix.txt, MagicSuffix.txt ; types d'ItemTypes.txt,
 * itemtypes-d2.ts) ; le jeu pd2 les remplace par son patch (mods/pd2/data/items/affixes.patch.ts, test vanilla-patch). La table elle-même est
 * contrôlée contre les MPQ par vanilla-mpq.test.ts.
 */
import { describe, expect, it } from 'vitest';
import '../../src/data/items/index';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { AFFIXES, AFFIX_BY_ID, affixAllowed, d2TypeIs } from '../../src/data/items/affixes';
import { D2_BASE_TYPES, D2_ITEM_TYPES } from '../../src/data/items/itemtypes-d2';
import { UNIQUE_BY_ID } from '../../src/data/items/uniques';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { withoutPd2 } from '../needs-pd2';

const base = (id: string) => BASE_BY_ID[id];

describe('Types d’objets d’ItemTypes.txt', () => {
  it('chaque base tirée des tables de D2 a son type, et l’arbre Equiv1 / Equiv2 le rattache aux types parents', () => {
    expect(D2_BASE_TYPES.short_sword).toBe('swor');
    expect(D2_ITEM_TYPES.swor).toEqual(['mele']);
    expect(d2TypeIs(base('short_sword'), 'weap')).toBe(true);
    expect(d2TypeIs(base('short_sword'), 'miss')).toBe(false);
    // orbe : arme de la Sorcière (orb → weap, sorc → clas)
    expect(['weap', 'sorc', 'clas'].every((c) => d2TypeIs(base('eagle_orb'), c))).toBe(true);
    // diadème : casque (circ → helm → armo)
    expect(d2TypeIs(base('circlet'), 'armo')).toBe(true);
    // grand charme : lcha (charme « large » de D2)
    expect(D2_BASE_TYPES.grand_charm).toBe('lcha');
    // bases écrites à la main d'un autre identifiant (code de leur ligne)
    expect(D2_BASE_TYPES.chain_gloves).toBe('glov');
  });
});

describe.skipIf(!withoutPd2)('Affixes D2 1.13c (jeu de règles d2)', () => {
  it('lignes tirables de MagicPrefix / MagicSuffix, identifiant = nom + numéro de ligne', () => {
    expect(AFFIXES.length).toBe(837);
    expect(AFFIXES.filter((a) => a.kind === 'prefix').length).toBe(479);
    // la Sturdy de la ligne 1 (version 0, fréquence 0) n'est pas tirable ; celle de la ligne 143 l'est
    expect(AFFIX_BY_ID.sturdy_p1).toBeUndefined();
    expect(AFFIX_BY_ID.sturdy_p143).toMatchObject({ kind: 'prefix', group: 'g101', level: 1, reqLvl: 1, freq: 9, rare: true, types: ['d2:armo'] });
    expect(AFFIX_BY_ID.sturdy_p143.mods).toEqual([{ stat: 'defPct', min: 10, max: 20 }]);
    // Godly : magique seulement (colonne rare vide)
    expect(AFFIX_BY_ID.godly_p150.rare).toBe(false);
    // affixes sans propriété appliquée (charges, endurance) écartés
    expect(AFFIXES.some((a) => a.id.startsWith('tireless_'))).toBe(false);
  });
  it('types acceptés et exclus (itype / etype) : Jagged sur les armes et les diadèmes, ni bâton, ni baguette, ni orbe', () => {
    const j = AFFIX_BY_ID.jagged_p186;
    expect(j.excludeTypes).toEqual(['d2:staf', 'd2:wand', 'd2:orb']);
    expect(affixAllowed(j, base('short_sword'), false)).toBe(true);
    expect(affixAllowed(j, base('circlet'), false)).toBe(true);
    expect(affixAllowed(j, base('short_staff'), false)).toBe(false);
    expect(affixAllowed(j, base('eagle_orb'), false)).toBe(false);
    expect(affixAllowed(AFFIX_BY_ID.godly_p150, base('quilted_armor'), true)).toBe(false);
  });
  it('les objets magiques tirent leurs affixes dans la table de D2', () => {
    const rng = new Rng('d2-affixes');
    for (let i = 0; i < 200; i++) {
      const it = generateItem(rng, 'short_sword', 30, { forceQuality: 'magic' } as never);
      for (const a of it.affixes ?? []) {
        expect(AFFIX_BY_ID[a.id]?.types.every((t) => t.startsWith('d2:'))).toBe(true);
        expect(affixAllowed(AFFIX_BY_ID[a.id], base('short_sword'), false)).toBe(true);
      }
    }
  });
  it('score d’attaque par niveau : moitié du paramètre (op param 1 d’ItemStatCost.txt), Corne d’aigle +6 par niveau', () => {
    expect(UNIQUE_BY_ID.u_eaglehorn.mods.find((m) => m.stat === 'attackRatingPerLvl')?.min).toBe(6);
  });
});
