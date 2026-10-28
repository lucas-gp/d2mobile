/** Données d'objets PD2 (lot 2) : valeurs S13 des uniques, uniques PD2 ajoutés, exclusivités de boss. */
import { describe, expect, it } from 'vitest';
import { UNIQUES, UNIQUE_BY_ID } from '../../../../src/data/items/uniques';
import { DCLONE_EXCLUSIVES, RATHMA_EXCLUSIVES } from '../../data/items/uniques';
import { BASE_BY_ID } from '../../../../src/data/items';
import { STATS } from '../../../../src/data/stats';
import { RUNEWORDS, RUNEWORD_BY_ID } from '../../../../src/data/items/runewords';
import { RUNE_BY_NAME } from '../../../../src/data/items/runes';
import { Rng } from '../../../../src/core/rng';
import { canBeEthereal, generateItem, makeStack } from '../../../../src/sim/loot/itemgen';
import { itemFinal } from '../../../../src/sim/itemstats';
import { matchRuneword } from '../../../../src/sim/socket';
import type { Item } from '../../../../src/sim/item';

const mod = (uid: string, stat: string, param?: string) => {
  const m = UNIQUE_BY_ID[uid].mods.find((x) => x.stat === stat && (param === undefined || x.param === param));
  return m ? [m.min, m.max] : undefined;
};

function socketed(base: string, runes: string[]): Item {
  const rng = new Rng(3);
  const it = generateItem(rng, base, 30);
  it.quality = 'normal';
  it.affixes = undefined;
  it.sockets = runes.length;
  it.socketed = runes.map((n) => makeStack(rng, RUNE_BY_NAME[n.toLowerCase()].id, 1));
  return it;
}

describe('Mots runiques PD2 (wiki Runewords)', () => {
  it('les 19 mots runiques PD2 manquants existent (hors carquois)', () => {
    for (const id of [
      'wisdom',
      'flickering_flame',
      'ferocity',
      'hustle',
      'innocence',
      'epiphany',
      'shattered_wall',
      'neophyte',
      'purity',
      'rampage',
      'echo',
      'unbending_will',
      'loyalty',
      'rapture',
      'mist',
      'dominion',
      'asylum',
      'obsession',
      'zenith',
    ])
      expect(RUNEWORD_BY_ID[`rw_${id}`], id).toBeDefined();
    expect(RUNEWORDS.length).toBe(107); // 104 + 3 mots runiques de carquois
    for (const r of RUNEWORDS) for (const m of r.mods) expect(STATS[m.stat], `${r.id} : ${m.stat}`).toBeDefined();
  });

  it('valeurs S13 : Dernier vœu ED 375-425 et aura de Puissance 20 ; Énigme DR 6 % ; Infini −40-50 %', () => {
    const lw = RUNEWORD_BY_ID.rw_last_wish.mods;
    expect(lw.find((m) => m.stat === 'edPct')).toMatchObject({ min: 375, max: 425 });
    expect(lw.find((m) => m.stat === 'itemAura' && m.param === 'might')).toMatchObject({ min: 20 });
    expect(RUNEWORD_BY_ID.rw_enigma.mods.find((m) => m.stat === 'dr')).toMatchObject({ min: 6, max: 6 });
    expect(RUNEWORD_BY_ID.rw_infinity.mods.find((m) => m.stat === 'pierceLight')).toMatchObject({ min: 40, max: 50 });
  });

  it('sous-types : Extase sur marteau seulement, Asile sur épée à deux mains seulement', () => {
    const rapture = ['Vex', 'Jah', 'Lo', 'Ral', 'Ko', 'Mal'];
    expect(matchRuneword(socketed('thunder_maul', rapture))).toBe('rw_rapture');
    expect(matchRuneword(socketed('devil_star', rapture))).toBeNull();
    const asylum = ['Gul', 'Cham', 'Hel', 'Jah', 'Dol', 'Um'];
    expect(matchRuneword(socketed('colossus_blade', asylum))).toBe('rw_asylum');
    expect(matchRuneword(socketed('crystal_sword', asylum))).toBeNull();
  });

  it('« Casques » couvre les peaux de Druide et casques de Barbare, « Boucliers » les têtes de Nécromancien', () => {
    expect(matchRuneword(socketed('wolf_head', ['Lem', 'Ist', 'Io']))).toBe('rw_delirium');
    expect(matchRuneword(socketed('gargoyle_head', ['Tal', 'Thul', 'Ort', 'Amn']))).toBe('rw_spirit_shield');
  });
});

describe('Runes PD2 (wiki Runes)', () => {
  const v = (name: string, slot: 'weapon' | 'armor' | 'shield', stat: string) => RUNE_BY_NAME[name].weapon && RUNE_BY_NAME[name][slot].find((m) => m.stat === stat)?.min;
  it('effets PD2 par emplacement', () => {
    expect(v('gul', 'weapon', 'arPct')).toBe(50);
    expect(v('gul', 'armor', 'maxResPoison')).toBe(4);
    expect(v('ohm', 'weapon', 'edPct')).toBe(45);
    expect(v('ber', 'armor', 'dr')).toBe(6);
    expect(v('amn', 'shield', 'thornsFlat')).toBe(24);
    expect(v('dol', 'armor', 'lifeRegen')).toBe(20);
    expect(v('sur', 'weapon', 'lifePerKill')).toBe(4);
    expect(v('jah', 'shield', 'life')).toBe(75);
    expect(v('nef', 'shield', 'defMissile')).toBe(50);
  });

  it('Hel : niveau requis 0 (D2 Runes.txt, PD2), Mythe reste au niveau 25', () => {
    expect(RUNE_BY_NAME.hel.reqLvl).toBe(0);
    const it = socketed('breast_plate', ['Hel', 'Amn', 'Nef']);
    expect(matchRuneword(it)).toBe('rw_myth');
    expect(Math.max(...it.socketed.map((s) => BASE_BY_ID[s.base].reqLvl))).toBe(25);
  });
});

describe('Éthéré (D2/PD2)', () => {
  it('1 arme ou armure lâchée sur 20 environ ; jamais un arc, un bijou ni un objet de marchand', () => {
    const rng = new Rng(11);
    let eth = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (generateItem(rng, 'war_scythe', 60, { rollEthereal: true }).ethereal) eth++;
    expect(eth / n).toBeGreaterThan(0.035);
    expect(eth / n).toBeLessThan(0.065);
    for (let i = 0; i < 400; i++) {
      expect(generateItem(rng, 'hydra_bow', 85, { rollEthereal: true }).ethereal).toBeFalsy();
      expect(generateItem(rng, 'ring', 85, { rollEthereal: true }).ethereal).toBeFalsy();
      expect(generateItem(rng, 'war_scythe', 60).ethereal).toBeFalsy();
    }
    expect(canBeEthereal(BASE_BY_ID.phase_blade)).toBe(false);
    expect(canBeEthereal(BASE_BY_ID.archon_plate)).toBe(true);
  });

  it('PD2 : dégâts et défense de base ×1,25, Force et Dextérité requises −10', () => {
    const it = generateItem(new Rng(2), 'war_scythe', 60, { forceQuality: 'normal' });
    const plain = itemFinal(it);
    const eth = itemFinal({ ...it, ethereal: true });
    expect(eth.dmg![1]).toBe(Math.floor(BASE_BY_ID.war_scythe.dmg![1] * 1.25 * (1 + (it.superiorPct ?? 0) / 100)));
    expect(eth.reqStr).toBe(plain.reqStr - 10);
  });
});

describe('Bases PD2 (wiki Item_Bases)', () => {
  it('dégâts d’armes PD2 : exceptionnelles +≈40 %, élites +≈25 %', () => {
    expect(BASE_BY_ID.hatchet.dmg).toEqual([15, 30]);
    expect(BASE_BY_ID.tabar.dmg).toEqual([35, 99]);
    expect(BASE_BY_ID.ancient_axe.dmg).toEqual([62, 122]);
    expect(BASE_BY_ID.archon_staff.dmg).toEqual([104, 124]);
    expect(BASE_BY_ID.colossal_sword.dmg).toEqual([76, 151]);
  });

  it('arcs : saison 11 (+20 %) ; jet : dégâts de lancer et de mêlée distincts', () => {
    expect(BASE_BY_ID.hydra_bow.dmg).toEqual([14, 100]);
    expect(BASE_BY_ID.long_bow.dmg).toEqual([6, 12]);
    expect(BASE_BY_ID.war_javelin.missileDmg).toEqual([18, 40]);
    expect(BASE_BY_ID.war_javelin.dmg).toEqual([7, 24]);
  });

  it('défenses d’armures PD2', () => {
    expect(BASE_BY_ID.lacquered_plate.defense).toEqual([573, 664]);
    expect(BASE_BY_ID.chain_mail.defense).toEqual([70, 71]);
    expect(BASE_BY_ID.aegis.defense).toEqual([215, 241]);
  });
});

describe('Uniques PD2 (valeurs S13 du wiki)', () => {
  it('Crête d’Arlequin : DR 4-6 %, MF 25-50, +1 vie et mana par niveau', () => {
    expect(mod('u_harlequin_crest', 'dr')).toEqual([4, 6]);
    expect(mod('u_harlequin_crest', 'mf')).toEqual([25, 50]);
    expect(mod('u_harlequin_crest', 'lifePerLvl')).toEqual([1, 1]);
    expect(mod('u_harlequin_crest', 'manaPerLvl')).toEqual([1, 1]);
  });

  it('Leçon de Mang Song : FCR 75, pénétrations 12-20, régénération 20-30, Affaiblissement des résistances au lancer', () => {
    expect(mod('u_mang_songs_lesson', 'fcr')).toEqual([75, 75]);
    expect(mod('u_mang_songs_lesson', 'pierceFire')).toEqual([12, 20]);
    expect(mod('u_mang_songs_lesson', 'manaRegenPct')).toEqual([20, 30]);
    expect(mod('u_mang_songs_lesson', 'procCast')).toBeDefined();
  });

  it('Force du vent : IAS 40, ED 275-350, Force 20 ; Maille arachnide : FCR 10, ralentit 20 %', () => {
    expect(mod('u_windforce', 'ias')).toEqual([40, 40]);
    expect(mod('u_windforce', 'edPct')).toEqual([275, 350]);
    expect(mod('u_windforce', 'str')).toEqual([20, 20]);
    expect(mod('u_arachnid_mesh', 'fcr')).toEqual([10, 10]);
    expect(mod('u_arachnid_mesh', 'slowTarget')).toEqual([20, 20]);
  });

  it('niveaux requis PD2 (Plainte d’Atma 41, Œil de la tempête 30)', () => {
    expect(UNIQUE_BY_ID.u_atmas_wail.reqLvl).toBe(41);
    expect(UNIQUE_BY_ID.u_stormeye.reqLvl).toBe(30);
  });

  it('uniques PD2 ajoutés, sur des bases existantes, avec des statistiques connues', () => {
    for (const id of ['u_wraithskin', 'u_odium', 'u_hadriels_hand', 'u_shatterblade', 'u_brimstone_rain', 'u_fenris', 'u_war_bonnet', 'u_cerebus']) expect(UNIQUE_BY_ID[id], id).toBeDefined();
    for (const u of UNIQUES) {
      expect(BASE_BY_ID[u.base], `${u.id} : base ${u.base}`).toBeDefined();
      for (const m of u.mods) expect(STATS[m.stat], `${u.id} : ${m.stat}`).toBeDefined();
      expect(u.reqLvl).toBeLessThanOrEqual(Math.max(u.lvl, u.reqLvl));
    }
    expect(new Set(UNIQUES.map((u) => u.id)).size).toBe(UNIQUES.length);
    expect(UNIQUES.length).toBeGreaterThanOrEqual(430);
  });

  it('les 8 Facettes arc-en-ciel (4 éléments × mort / passage de niveau)', () => {
    const f = UNIQUES.filter((u) => u.id.startsWith('u_rainbow_facet'));
    expect(f).toHaveLength(8);
    expect(f.filter((u) => u.mods.some((m) => m.stat === 'procLevelUp'))).toHaveLength(4);
  });

  it('exclusivités du Clone de Diablo et de Rathma : jamais tirées au hasard', () => {
    for (const id of [...DCLONE_EXCLUSIVES, ...RATHMA_EXCLUSIVES]) expect(UNIQUE_BY_ID[id]?.noRandomDrop, id).toBe(true);
  });

  it('pas de carquois (autre lot) ni de Morsure de Cerbère sur une mauvaise base', () => {
    expect(UNIQUE_BY_ID.u_cerebus.base).toBe('blood_spirit');
    expect(UNIQUE_BY_ID.u_radimants_sphere.base).toBe('ancient_shield');
  });
});

describe('Catalogue de valeur du butin du mod (règle loot.value, lot M10f)', () => {
  it('ses identifiants existent et priment sur la base', async () => {
    const V = await import('../../data/loot-value');
    const { SET_ITEM_BY_ID } = await import('../../../../src/data/items/sets');
    const { RULES } = await import('../../../../src/mods/rules');
    for (const id of Object.keys(V.VALUE_UNIQUES)) expect(UNIQUE_BY_ID[id], id).toBeTruthy();
    for (const id of Object.keys(V.VALUE_SET_ITEMS)) expect(SET_ITEM_BY_ID[id], id).toBeTruthy();
    for (const id of Object.keys(V.VALUE_RUNEWORDS)) expect(RUNEWORD_BY_ID[id], id).toBeTruthy();
    expect(RULES['loot.value']('unique', 'u_sunder_cold')).toBe(4);
    expect(RULES['loot.value']('runeword', 'rw_spirit_shield')).toEqual([3, 3]);
    expect(RULES['loot.value']('unique', 'u_harlequin_crest')).toBe(5);
  });
});
