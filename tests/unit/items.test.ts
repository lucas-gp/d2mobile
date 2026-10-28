import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { affixLevel, effectiveMf, generateItem, qualityChance, maxSocketsForIlvl } from '../../src/sim/loot/itemgen';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { AFFIX_BY_ID } from '../../src/data/items/affixes';
import { itemFinal, itemName, requiredLevel } from '../../src/sim/itemstats';
import { pickRune } from '../../src/sim/loot/drops';
import { withoutPd2 } from '../needs-pd2';
import { RUNES } from '../../src/data/items/runes';
import { RATES } from '../../src/data/rates';

describe('Génération d’objets', () => {
  it('alvl suit la formule D2', () => {
    // qlvl 60, ilvl 85 : 85 ≥ 99 − 30 → 2×85 − 99 = 71
    expect(affixLevel(85, 60)).toBe(71);
    // qlvl 60, ilvl 65 : 65 < 69 → 65 − 30 = 35
    expect(affixLevel(65, 60)).toBe(35);
    // ilvl 99, qlvl 1 : 99 ≥ 99 − 0 → 2×99 − 99 = 99
    expect(affixLevel(99, 1)).toBe(99);
    // qlvl > ilvl : ilvl remonté au qlvl
    expect(affixLevel(10, 30)).toBe(15);
    expect(affixLevel(20, 10, 3)).toBe(23);
  });

  it('rendements décroissants du MF', () => {
    expect(effectiveMf(300, 'magic')).toBe(300);
    expect(effectiveMf(300, 'unique')).toBeCloseTo(136.36, 1);
    expect(effectiveMf(300, 'set')).toBeCloseTo(187.5, 1);
    expect(effectiveMf(300, 'rare')).toBeCloseTo(200, 1);
  });

  it('chance d’unique : exemple chiffré de l’étude (avant multiplicateur solo)', () => {
    // qlvl 60, mlvl 85, MF 300, monstre normal → ~0,63 % × multiplicateur de rates.ts (jeu pd2 : ×3 ; base D2 : ×1)
    const p = qualityChance('unique', 85, 60, 300, 0, false) / RATES.quality.unique;
    expect(p).toBeGreaterThan(0.0063 * 0.67);
    expect(p).toBeLessThan(0.0063 * 1.33);
  });

  it('un objet magique a 1 ou 2 affixes de groupes distincts', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 2000; i++) {
      const it = generateItem(rng, 'arcane_orb', 40, { forceQuality: 'magic' });
      expect(it.quality).toBe('magic');
      const a = it.affixes ?? [];
      expect(a.length).toBeGreaterThanOrEqual(1);
      expect(a.length).toBeLessThanOrEqual(2);
      const groups = a.map((x) => AFFIX_BY_ID[x.id].group);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it('un rare a au plus 3 préfixes et 3 suffixes', () => {
    const rng = new Rng(12);
    for (let i = 0; i < 2000; i++) {
      const it = generateItem(rng, 'circlet', 70, { forceQuality: 'rare' });
      const a = it.affixes ?? [];
      const pre = a.filter((x) => AFFIX_BY_ID[x.id].kind === 'prefix').length;
      const suf = a.length - pre;
      expect(pre).toBeLessThanOrEqual(3);
      expect(suf).toBeLessThanOrEqual(3);
    }
  });

  it('les châsses respectent la base et l’ilvl', () => {
    expect(maxSocketsForIlvl(BASE_BY_ID.archon_plate, 20)).toBe(3);
    expect(maxSocketsForIlvl(BASE_BY_ID.archon_plate, 30)).toBe(4);
    expect([20, 30, 60].map((l) => maxSocketsForIlvl(BASE_BY_ID.pike, l))).toEqual([3, 4, 6]);
  });

  it.skipIf(withoutPd2)('châsses PD2 (wiki Item_Bases) : orbe d’aigle 2 au plus', () => {
    expect(maxSocketsForIlvl(BASE_BY_ID.eagle_orb, 90)).toBe(2);
  });

  it.skipIf(!withoutPd2)('châsses vanilla (Weapons.txt, ItemTypes.txt) : orbe d’aigle 2 jusqu’à l’ilvl 25, 3 au-delà', () => {
    expect([20, 30, 90].map((l) => maxSocketsForIlvl(BASE_BY_ID.eagle_orb, l))).toEqual([2, 3, 3]);
  });

  it('dégâts/défense améliorés sont locaux à l’objet', () => {
    const rng = new Rng(3);
    const it = generateItem(rng, 'war_staff', 30, { forceQuality: 'normal' });
    it.superiorPct = 10;
    const f = itemFinal(it);
    expect(f.dmg![1]).toBe(Math.floor(28 * 1.1));
    expect(f.stats.get('edPct')).toBeUndefined();
  });

  it('noms et niveau requis', () => {
    const rng = new Rng(5);
    const it = generateItem(rng, 'shako', 90, { forceUniqueId: 'u_harlequin_crest' });
    expect(itemName(it)).toBe("Crête d'Arlequin");
    expect(requiredLevel(it)).toBe(62);
  });
});

describe('Runes', () => {
  it('rareté relative : El bien plus fréquente que Ber, Zod rarissime', () => {
    const rng = new Rng(99);
    const counts = new Map<string, number>();
    const N = 400000;
    for (let i = 0; i < N; i++) {
      const r = pickRune(rng, 17);
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    const el = counts.get(RUNES[0].id) ?? 0;
    const ber = counts.get(RUNES[29].id) ?? 0;
    const zod = counts.get(RUNES[32].id) ?? 0;
    expect(el).toBeGreaterThan(ber * 10);
    expect(zod).toBeLessThan(ber);
    // les runes hautes (Vex+) restent un événement : < 1 % des tirages Runes 17
    let high = 0;
    for (let k = 25; k < 33; k++) high += counts.get(RUNES[k].id) ?? 0;
    expect(high / N).toBeLessThan(0.02);
  });

  it('un TC bas ne donne jamais de rune haute', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 20000; i++) {
      const id = pickRune(rng, 3);
      const rank = RUNES.findIndex((r) => r.id === id) + 1;
      expect(rank).toBeLessThanOrEqual(6);
    }
  });
});
