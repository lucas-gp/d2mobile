import { describe, expect, it } from 'vitest';
import '../../src/data/items/index';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { UNIQUE_BY_ID, UNIQUES } from '../../src/data/items/uniques';
import { SET_ITEM_BY_ID } from '../../src/data/items/sets';
import { RUNEWORD_BY_ID } from '../../src/data/items/runewords';
import { VALUE_BASES, VALUE_RUNEWORDS, VALUE_SET_ITEMS, VALUE_UNIQUES } from '../../src/data/items/loot-value';
import { RULES } from '../../src/mods/rules';
import { lootTier } from '../../src/sim/loot/filter';
import { recommendedHighlights } from '../../src/sim/loot/highlight';
import { rollTc } from '../../src/sim/loot/drops';
import { NO_BONUS } from '../../src/sim/loot/itemgen';
import type { Item } from '../../src/sim/item';
import { Rng } from '../../src/core/rng';
import { withoutPd2 } from '../needs-pd2';

let n = 0;
const mk = (o: Partial<Item> & { base: string; quality: Item['quality'] }): Item => ({ uid: `t${n++}`, ilvl: 85, sockets: 0, socketed: [], ...o });
const uni = (id: string): Item => mk({ base: UNIQUE_BY_ID[id].base, quality: 'unique', uniqueId: id });
const set = (id: string): Item => mk({ base: SET_ITEM_BY_ID[id].base, quality: 'set', setId: id });

describe('Catalogue de valeur du butin', () => {
  it.skipIf(withoutPd2)('tous les identifiants existent', () => {
    for (const id of Object.keys(VALUE_UNIQUES)) expect(UNIQUE_BY_ID[id], id).toBeTruthy();
    for (const id of Object.keys(VALUE_SET_ITEMS)) expect(SET_ITEM_BY_ID[id], id).toBeTruthy();
    for (const id of Object.keys(VALUE_RUNEWORDS)) expect(RUNEWORD_BY_ID[id], id).toBeTruthy();
    for (const id of Object.keys(VALUE_BASES)) expect(BASE_BY_ID[id], id).toBeTruthy();
    for (const [id, min] of Object.entries(VALUE_BASES)) expect(BASE_BY_ID[id].maxSockets ?? 0, id).toBeGreaterThanOrEqual(min);
  });

  it('objets recherchés : bon palier', () => {
    const exp: Record<string, number> = {
      u_griffons_eye: 5,
      u_highlords_wrath: 5,
      u_deathss_web: 5,
      u_harlequin_crest: 5,
      u_tyraels_might: 5,
      u_annihilus: 5,
      u_hellfire_torch: 5,
      u_the_stone_of_jordan: 4,
      u_raven_frost: 4,
      u_dwarf_star: 4,
      u_skullders_ire: 4,
      u_arachnid_mesh: 4,
      u_maras_kaleidoscope: 4,
      u_windforce: 4,
      u_stormshield: 4,
      u_ormus_robes: 4,
      u_the_oculus: 4,
      u_fathom: 4,
      u_nightwings_veil: 4,
      u_gheeds_fortune: 4,
      u_magefist: 3,
      u_metalgrid: 3,
      u_verdugos_hearty_cord: 3,
      u_eschutas_temper: 3,
    };
    for (const [id, t] of Object.entries(exp)) expect(lootTier(uni(id)), id).toBe(t);
    expect(lootTier(set('s_trang_ouls_girth'))).toBe(4);
    expect(lootTier(set('s_tal_rashas_adjudication'))).toBe(4);
    expect(lootTier(set('s_natalyas_shadow'))).toBe(4);
    expect(lootTier(set('s_civerbs_ward'))).toBe(0);
    const rw = (id: string, base: string, extra: Partial<Item> = {}) => mk({ base, quality: 'runeword', runeword: id, ...extra });
    expect(lootTier(rw('rw_enigma', 'archon_plate'))).toBe(4);
    expect(lootTier(rw('rw_infinity', 'colossus_voulge'))).toBe(4);
    expect(lootTier(rw('rw_spirit', 'monarch'))).toBe(3);
    expect(lootTier(rw('rw_fortitude', 'sacred_armor'))).toBe(4);
  });

  it('bases éthérées à châsses', () => {
    expect(lootTier(mk({ base: 'archon_plate', quality: 'normal', sockets: 4, ethereal: true }))).toBe(4);
    expect(lootTier(mk({ base: 'archon_plate', quality: 'normal', sockets: 4 }))).toBe(0);
    expect(lootTier(mk({ base: 'archon_plate', quality: 'normal', sockets: 2, ethereal: true }))).toBe(0);
    expect(lootTier(mk({ base: 'colossus_blade', quality: 'superior', sockets: 6 }))).toBe(3);
    expect(lootTier(mk({ base: 'colossus_blade', quality: 'superior', sockets: 6, ethereal: true }))).toBe(4);
  });

  it('modificateurs recherchés : amulette, anneau, charme', () => {
    const am = mk({
      base: 'amulet',
      quality: 'magic',
      affixes: [
        { id: 'sorc_skills_2', values: [2] },
        { id: 'of_the_magus', values: [20] },
      ],
    });
    expect(lootTier(am)).toBeGreaterThanOrEqual(3);
    expect(lootTier(mk({ base: 'ring', quality: 'magic', affixes: [{ id: 'of_the_jackal', values: [3] }] }))).toBe(0);
    expect(
      lootTier(
        mk({
          base: 'grand_charm',
          quality: 'magic',
          affixes: [
            { id: 'fire_tree_1', values: [1] },
            { id: 'of_the_tiger', values: [25] },
          ],
        }),
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it('uniques sans intérêt : aucun palier', () => {
    // hors du catalogue (de la base et du mod : règle loot.value)
    const junk = UNIQUES.filter((u) => RULES['loot.value']('unique', u.id) === undefined && BASE_BY_ID[u.base]?.tier !== 2);
    expect(junk.length).toBeGreaterThan(100);
    for (const u of junk) expect(lootTier(uni(u.id)), u.id).toBe(0);
    for (const id of ['u_the_gnasher', 'u_bladebone', 'u_tarnhelm']) expect(lootTier(uni(id))).toBe(0);
  });

  it.skipIf(withoutPd2)('runes et monnaies : inchangées', () => {
    expect(lootTier(mk({ base: 'r33', quality: 'normal' }))).toBe(5);
    expect(lootTier(mk({ base: 'r22', quality: 'normal' }))).toBe(4);
    expect(lootTier(mk({ base: 'worldstone_shard', quality: 'normal' }))).toBe(4);
  });

  it('liste recommandée : seulement les paliers >= 4', () => {
    const l = recommendedHighlights();
    expect(l).toContain('unique:u_raven_frost');
    expect(l).toContain('runeword:rw_enigma');
    expect(l).toContain('set:s_trang_ouls_girth');
    expect(l).not.toContain('unique:u_magefist');
    expect(new Set(l).size).toBe(l.length);
    expect(l.length).toBeLessThan(120);
  });

  it.skipIf(withoutPd2)(
    'butin simulé : le palier 4-5 reste rare (hors runes, or et monnaies)',
    () => {
      const rng = new Rng(777);
      const cnt: Record<number, number> = {};
      let total = 0;
      for (let i = 0; i < 20000; i++) {
        const r = rng.next();
        const tc = r < 0.72 ? 'normal' : r < 0.85 ? 'caster' : r < 0.95 ? 'champion' : 'unique';
        for (const it of rollTc({ rng, ilvl: 85, mf: 150, difficulty: 2, zoneKey: 'baal', mapTier: 2, bonus: NO_BONUS, gf: 0, quantity: 1 }, tc)) {
          const t = BASE_BY_ID[it.base]?.type;
          if (!t || t === 'rune' || t === 'currency' || t === 'map') continue;
          total++;
          const v = lootTier(it);
          cnt[v] = (cnt[v] ?? 0) + 1;
        }
      }
      console.log('loot-value sim', total, JSON.stringify(cnt));
      expect(((cnt[4] ?? 0) + (cnt[5] ?? 0)) / total).toBeLessThanOrEqual(0.03);
      expect((cnt[3] ?? 0) / total).toBeLessThanOrEqual(0.08);
    },
    120000,
  );
});
