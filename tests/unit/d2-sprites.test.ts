/** Repli des sprites : l'import D2 ne remplace que les planches qu'il fournit */
import { describe, expect, it } from 'vitest';
import { mergeManifest, type Manifest } from '../../src/render/assets';

const entry = (gpu: number) => ({ hi: { bytes: 1, gpu }, lo: { bytes: 1, gpu: gpu / 4 }, kind: 'actor' });
const base: Manifest = { version: 5, sheets: { paladin: entry(10), fallen: entry(5), prop_tree: { ...entry(1), kind: 'prop' } }, tiles: {} };

describe('sprites importés de Diablo II', () => {
  it('sans import : manifeste inchangé, aucune planche remplacée', () => {
    for (const none of [null, undefined, {}, { sheets: {} }]) {
      const r = mergeManifest(base, none);
      expect(r.replaced.size).toBe(0);
      expect(r.manifest.sheets).toEqual(base.sheets);
    }
  });

  it('avec import : seules les planches fournies sont remplacées, les autres gardent le sprite actuel', () => {
    const r = mergeManifest(base, { sheets: { paladin: entry(99) } });
    expect([...r.replaced]).toEqual(['paladin']);
    expect(r.manifest.sheets.paladin.hi.gpu).toBe(99);
    expect(r.manifest.sheets.fallen).toBe(base.sheets.fallen);
    expect(r.manifest.sheets.prop_tree).toBe(base.sheets.prop_tree);
    // le manifeste d'origine n'est pas modifié
    expect(base.sheets.paladin.hi.gpu).toBe(10);
  });

  it('planche importée au nom d’un monstre (modèle propre dans D2) : ajoutée sans toucher à la planche commune', () => {
    const r = mergeManifest(base, { sheets: { council_member: entry(7) } });
    expect([...r.replaced]).toEqual(['council_member']);
    expect(r.manifest.sheets.council_member.hi.gpu).toBe(7);
    expect(r.manifest.sheets.fallen).toBe(base.sheets.fallen);
    expect('council_member' in base.sheets).toBe(false);
  });

  it('sols importés : fusionnés dans « tiles », y compris un sol propre à une zone', () => {
    const tiles = { ground_snow: { hi: { bytes: 1, gpu: 4 }, lo: { bytes: 1, gpu: 1 } } };
    const withTiles: Manifest = { ...base, tiles };
    const d2 = { hi: { bytes: 2, gpu: 8 }, lo: { bytes: 2, gpu: 2 } };
    const r = mergeManifest(withTiles, { tiles: { ground_snow: d2, 'ground_snow.harrogath': d2 } });
    expect([...r.replaced].sort()).toEqual(['ground_snow', 'ground_snow.harrogath']);
    expect(r.manifest.tiles.ground_snow.hi.gpu).toBe(8);
    expect(tiles.ground_snow.hi.gpu).toBe(4);
  });

  it('une entrée importée incomplète est ignorée', () => {
    const bad = { hi: { bytes: 1, gpu: 1 } } as unknown as Manifest['sheets'][string];
    const r = mergeManifest(base, { sheets: { fallen: bad } });
    expect(r.replaced.size).toBe(0);
    expect(r.manifest.sheets.fallen).toBe(base.sheets.fallen);
  });
});

describe('arme portée', () => {
  it("choisit la pièce d'arme selon la classe d'arme du corps", async () => {
    const { weaponPartId } = await import('../../src/render/weapon-look');
    const all = () => true;
    expect(weaponPartId('barbarian', 'barbarian', 'hand_axe', all)).toBe('barbarian_rh_hax');
    expect(weaponPartId('barbarian', 'barbarian', 'hand_axe', () => false)).toBe('barbarian_rh_ssd');
    expect(weaponPartId('sorceress', 'sorceress', 'eagle_orb', all)).toBeNull();
    expect(weaponPartId('sorceress', 'sorceress', 'short_sword', all)).toBeNull();
    expect(weaponPartId('amazon', 'amazon', 'spear', all)).toBeNull();
    expect(weaponPartId('amazon', 'amazon', 'short_bow', all)).toMatch(/^amazon_lh_/);
    expect(weaponPartId('druid', 'druid', 'short_staff', all)).toBeNull();
  });
});
