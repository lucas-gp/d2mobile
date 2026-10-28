import { describe, expect, it } from 'vitest';
import { withoutPd2 } from '../needs-pd2';
import { modSetting } from '../../src/mods/settings';
import { DEFAULT_SETTINGS, withDefaultSettings } from '../../src/sim/save';
import { SETTINGS_CATS, SETTINGS_ENTRIES, catFields, entriesOf, normText, resetCategory, searchSettings, settingDefaults } from '../../src/ui/settings-catalog';

describe('catalogue des réglages', () => {
  it('chaque option est dans exactement une catégorie existante, identifiants uniques', () => {
    const ids = SETTINGS_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(SETTINGS_CATS.map((c) => c.id));
    for (const e of SETTINGS_ENTRIES) expect(cats.has(e.cat), e.id).toBe(true);
    // les options des réglages d'un mod (cartes, corruption : mod pd2) ne sont affichées qu'avec lui
    const modOnly = SETTINGS_ENTRIES.filter((e) => e.mod).map((e) => e.id);
    expect(modOnly).toEqual(['autoPickupMaps', 'confirmCorrupt', 'confirmMapUpgrade']);
    expect(SETTINGS_CATS.reduce((n, c) => n + entriesOf(c.id).length, 0)).toBe(SETTINGS_ENTRIES.length - (withoutPd2 ? modOnly.length : 0));
  });

  it('chaque champ de Settings proposé n’apparaît que dans une seule option', () => {
    const fields = SETTINGS_ENTRIES.flatMap((e) => e.fields ?? []);
    expect(new Set(fields).size).toBe(fields.length);
    // aucun réglage supprimé : tous les champs d'interface historiques restent proposés
    for (const k of [
      'sound',
      'music',
      'haptics',
      'quality',
      'showPerf',
      'showCollisions',
      'zoom',
      'leftHanded',
      'controls',
      'bigCells',
      'lootRate',
      'damageNumbers',
      'screenShake',
      'instantCast',
      'lighting',
      'tips',
      'autoPickupRunes',
      'autoPickupGems',
      'autoPickupPotions',
      'autoPickupMaterials',
      'autoPickupMaps',
      'beltRefill',
      'durability',
      'freeRespec',
      'potionUpgrade',
      'confirmCorrupt',
      'confirmMapUpgrade',
      'imageSharpen',
      'imageSmooth',
      'imageMood',
      'imageScale',
      'imageButton',
      'walkButton',
      'bigInventory',
    ])
      expect(fields, k).toContain(k);
  });

  it('recherche insensible aux accents et à la casse, tous les mots requis', () => {
    expect(normText('Netteté’')).toBe("nettete'");
    expect(searchSettings('NETTETE').map((e) => e.id)).toContain('imageSharpen');
    expect(searchSettings('netteté').map((e) => e.id)).toContain('imageSharpen');
    expect(searchSettings('ramassage runes').map((e) => e.id)).toEqual(['autoPickupRunes']);
    expect(searchSettings('pénombre')[0].id).toBe('lighting');
    expect(searchSettings('zzzz')).toEqual([]);
    expect(searchSettings('   ')).toEqual([]);
  });

  it('la recherche trouve aussi par la traduction', () => {
    const tr = (s: string) => (s === 'Netteté' ? 'Sharpness' : s);
    expect(searchSettings('sharpness', tr).map((e) => e.id)).toEqual(['imageSharpen']);
  });

  it('les défauts correspondent à ceux de l’application', () => {
    const app = withDefaultSettings(null, true) as unknown as Record<string, unknown>;
    const d = settingDefaults() as Record<string, unknown>;
    for (const [k, v] of Object.entries(app)) if (k !== 'tipsSeen' && k !== 'mods') expect(d[k], k).toEqual(v);
    // réglages des mods : à plat dans les défauts du catalogue, sous mods.<mod> dans les réglages
    for (const [, m] of Object.entries(app.mods ?? {})) for (const [k, v] of Object.entries(m as Record<string, unknown>)) expect(d[k], k).toEqual(v);
    expect(d.zoom).toBe(DEFAULT_SETTINGS.zoom);
  });

  it('rétablir une catégorie ne modifie que ses champs', () => {
    const st = withDefaultSettings(null, true);
    Object.assign(st, { sound: 0, music: 1, zoom: 1.2, imageSharpen: 3, autoPickupRunes: 'all', confirmCorrupt: false, lootRate: 'normal', tipsSeen: ['x'] });
    const before = JSON.parse(JSON.stringify(st));
    const changed = resetCategory(st, 'sound');
    expect(changed.sort()).toEqual(['music', 'sound']);
    expect(st.sound).toBe(0.8);
    expect(st.music).toBe(0.5);
    const after = JSON.parse(JSON.stringify(st));
    for (const k of Object.keys(before)) if (k !== 'sound' && k !== 'music') expect(after[k], k).toEqual(before[k]);
    resetCategory(st, 'display');
    expect(st.zoom).toBe(1);
    expect(st.imageSharpen).toBe(0);
    expect(st.lootRate).toBe('normal');
    expect(st.tipsSeen).toEqual(['x']);
    expect(catFields('account')).toEqual([]);
    expect(resetCategory(st, 'account')).toEqual([]);
  });

  it('réglages de mod : sous mods.<mod> avec le mod (repris de la racine), inexistants et intacts sans lui', () => {
    const s = withDefaultSettings({ confirmCorrupt: false } as never, true);
    if (withoutPd2) {
      expect(modSetting(s, 'confirmCorrupt')).toBeUndefined();
      expect(s.mods).toBeUndefined();
      expect((s as unknown as Record<string, unknown>).confirmCorrupt).toBe(false);
    } else {
      expect(modSetting(s, 'confirmCorrupt')).toBe(false);
      expect(s).not.toHaveProperty('confirmCorrupt');
      // les tables de la sauvegarde ne sont jamais partagées
      const src = { mods: { pd2: { confirmMapUpgrade: false } } };
      const t = withDefaultSettings(src, false);
      t.mods!.pd2.confirmMapUpgrade = true;
      expect(src.mods.pd2.confirmMapUpgrade).toBe(false);
    }
  });
});
