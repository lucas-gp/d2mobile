/**
 * Modèle d'affixes PD2 (page wiki Item_Affixes) : table générée, types d'objets, nombre d'affixes des
 * rares / magiques selon l'ilvl, niveau magique des bases, staffmods (pointmods), châsses d'affixe.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import '../../../../src/data/items/index';
import { BASES, BASE_BY_ID } from '../../../../src/data/items/bases';
import { AFFIXES, AFFIX_BY_ID, AFFIX_SUBTYPES, LEGACY_AFFIXES, affixAllowed, affixTypeMatches } from '../../../../src/data/items/affixes';
import { SKILL_BY_ID } from '../../../../src/data/skills';
import { TREE_CLASS } from '../../../../src/data/classes';
import { baseAffixLevel, eligibleAffixes, generateItem, magicLevel, magicTwoAffixIlvl, rareAffixCount, rareName, rollStaffmods, setLootClass, staffmodPool } from '../../../../src/sim/loot/itemgen';
import { RARE_PREFIXES, RARE_SUFFIXES } from '../../../../src/data/items/rare-names';
import { validateItem } from '../../../../src/sim/loot/validate';
import { itemFinal, itemName, modLabel } from '../../../../src/sim/itemstats';
import type { Item } from '../../../../src/sim/item';

const base = (id: string) => BASE_BY_ID[id];

describe('table d’affixes PD2', () => {
  it('volume : ~1 100 lignes, préfixes et suffixes pour l’équipement, les joyaux et chaque taille de charme', () => {
    expect(AFFIXES.length).toBeGreaterThan(1000);
    for (const t of ['Small Charm', 'Large Charm', 'Grand Charm', 'Jewel', 'Ring', 'Amulet', 'Chest', 'WeaponP']) {
      for (const k of ['prefix', 'suffix'] as const)
        expect(
          AFFIXES.some((a) => a.kind === k && a.types.includes(t)),
          `${t} ${k}`,
        ).toBe(true);
    }
    // les anciens identifiants restent lisibles (objets sauvegardés), mais ne sont plus tirés
    expect(AFFIX_BY_ID.jagged).toBeTruthy();
    expect(LEGACY_AFFIXES.length).toBeGreaterThan(150);
    expect(AFFIXES.some((a) => a.id === 'jagged')).toBe(false);
  });

  it('affixes jusqu’ici absents : score d’attaque, dégâts min/max, poison, épines, procs, morts-vivants / démons, châsses', () => {
    const stats = new Set(AFFIXES.flatMap((a) => a.mods.map((m) => m.stat)));
    for (const s of [
      'attackRating',
      'minDmg',
      'maxDmg',
      'poisonDmg',
      'thornsFlat',
      'procHit',
      'procGetHit',
      'procCast',
      'arUndead',
      'arDemon',
      'dmgUndeadPct',
      'dmgDemonPct',
      'socketsAdded',
      'openWoundsDps',
      'magicDmgPct',
      'arPctPerLvl',
      'lifePerLvl',
      'pierceFire',
      'dr',
    ])
      expect(stats.has(s), s).toBe(true);
  });

  it('valeurs de référence du wiki', () => {
    const a = AFFIX_BY_ID.sturdy_p143;
    expect(a).toMatchObject({ kind: 'prefix', group: 'g101', level: 1, maxLevel: 41, reqLvl: 1, freq: 14, rare: true, types: ['Armor'] });
    expect(a.mods).toEqual([{ stat: 'defPct', min: 10, max: 20 }]);
    // Sharp : score d'attaque + dégâts améliorés, armes physiques
    expect(AFFIX_BY_ID.sharp_p257.mods.map((m) => m.stat)).toEqual(['attackRating', 'edPct']);
    expect(AFFIX_BY_ID.sharp_p257.types).toEqual(['WeaponP']);
    // Godly : +101-200 % de défense ; Jeweler's : 4 châsses
    expect(AFFIX_BY_ID.godly_p150.mods[0]).toMatchObject({ stat: 'defPct', min: 101, max: 200 });
    expect(AFFIX_BY_ID.jewelers_p422.mods[0]).toMatchObject({ stat: 'socketsAdded', min: 4, max: 4 });
  });

  it('types d’objets : sous-types et objets de classe', () => {
    for (const ids of Object.values(AFFIX_SUBTYPES)) for (const id of ids) expect(BASE_BY_ID[id], id).toBeTruthy();
    expect(affixTypeMatches(base('club'), ['Club'])).toBe(true);
    expect(affixTypeMatches(base('club'), ['Tipped Mace'])).toBe(false);
    expect(affixTypeMatches(base('flail'), ['Tipped Mace'])).toBe(true);
    expect(affixTypeMatches(base('throwing_knife'), ['Knife'])).toBe(true);
    expect(affixTypeMatches(base('throwing_axe'), ['Axe'])).toBe(true);
    expect(affixTypeMatches(base('eagle_orb'), ['WeaponP'])).toBe(false);
    expect(affixTypeMatches(base('eagle_orb'), ['Weapon'])).toBe(true);
    expect(affixTypeMatches(base('war_staff'), ['WeaponPS'])).toBe(true);
    expect(affixTypeMatches(base('short_bow'), ['Melee Weapon'])).toBe(false);
    expect(affixTypeMatches(base('circlet'), ['Helm'])).toBe(true);
    expect(affixTypeMatches(base('circlet'), ['Chest'])).toBe(false);
    expect(affixTypeMatches(base('targe'), ['ShieldNC'])).toBe(false);
    expect(affixTypeMatches(base('targe'), ['Paladin Shield'])).toBe(true);
  });

  it('affixes « magique seulement » refusés sur les rares', () => {
    const magicOnly = AFFIXES.find((a) => !a.rare && a.types.includes('Ring'))!;
    expect(magicOnly).toBeTruthy();
    expect(affixAllowed(magicOnly, base('ring'), false)).toBe(true);
    expect(affixAllowed(magicOnly, base('ring'), true)).toBe(false);
  });
});

describe('génération selon les règles PD2', () => {
  it('niveau magique : diadèmes, baguettes / bâtons / orbes non élites', () => {
    expect(magicLevel(base('circlet'))).toBe(3);
    expect(magicLevel(base('diadem'))).toBe(18);
    expect(magicLevel(base('eagle_orb'))).toBe(1);
    expect(magicLevel(base('dimensional_shard'))).toBe(0);
    expect(baseAffixLevel(base('tiara'), 77)).toBe(90);
    expect(baseAffixLevel(base('ring'), 50)).toBe(50);
  });

  it('rares : 3 à 6 affixes selon l’ilvl (12,5/37,5/37,5/12,5 % ; min 4 à 45, 5 à 65, 6 à 85) ; joyaux : 4', () => {
    const rng = new Rng('rares');
    const dist = (ilvl: number, n = 8000) => {
      const c = [0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) c[rareAffixCount(rng, base('ring'), ilvl)]++;
      return c.map((x) => x / n);
    };
    const low = dist(30);
    expect(low[3]).toBeCloseTo(0.125, 1);
    expect(low[4]).toBeCloseTo(0.375, 1);
    expect(low[5]).toBeCloseTo(0.375, 1);
    expect(low[6]).toBeCloseTo(0.125, 1);
    expect(dist(50)[3]).toBe(0);
    expect(dist(70)[4]).toBe(0);
    expect(dist(85)[6]).toBe(1);
    expect(rareAffixCount(rng, base('jewel'), 99)).toBe(4);
    // objets réels : une bague d'ilvl 85 a ses 6 affixes, un joyau rare 4
    for (let i = 0; i < 200; i++) {
      const it = generateItem(rng, 'ring', 85, { forceQuality: 'rare' });
      expect(it.affixes?.length).toBe(6);
      expect(generateItem(rng, 'jewel', 85, { forceQuality: 'rare' }).affixes?.length).toBe(4);
    }
  });

  it('magiques : préfixe et suffixe garantis à 65 (armes, armures), 85 (joyaux, bijoux), 90 (charmes)', () => {
    expect(magicTwoAffixIlvl(base('breast_plate'))).toBe(65);
    expect(magicTwoAffixIlvl(base('ring'))).toBe(85);
    expect(magicTwoAffixIlvl(base('grand_charm'))).toBe(90);
    const rng = new Rng('magiques');
    const count = (b: string, ilvl: number) => {
      let one = 0;
      for (let i = 0; i < 400; i++) if ((generateItem(rng, b, ilvl, { forceQuality: 'magic' }).affixes?.length ?? 0) === 1) one++;
      return one;
    };
    expect(count('breast_plate', 60)).toBeGreaterThan(100);
    expect(count('breast_plate', 65)).toBe(0);
    expect(count('ring', 80)).toBeGreaterThan(100);
    expect(count('ring', 85)).toBe(0);
    expect(count('grand_charm', 89)).toBeGreaterThan(100);
    expect(count('grand_charm', 90)).toBe(0);
  });

  it('staffmods : classe de la base, plafond rlvl + 7, 10/40/30/20 % de 0/1/2/3, niveaux 40/35/25 %', () => {
    // ilvl 13 : compétences de niveau 1 et 6 ; ilvl 12 : niveau 1 seulement
    expect(staffmodPool(base('eagle_orb'), 12).every((s) => s.reqLvl <= 1)).toBe(true);
    expect(staffmodPool(base('eagle_orb'), 13).some((s) => s.reqLvl === 6)).toBe(true);
    expect(staffmodPool(base('eagle_orb'), 37).some((s) => s.reqLvl === 30)).toBe(true);
    expect(staffmodPool(base('ring'), 99)).toEqual([]);
    const classOf = (id: string) => TREE_CLASS[SKILL_BY_ID[id].tree];
    for (const [b, cls] of [
      ['eagle_orb', 'sorceress'],
      ['war_staff', 'sorceress'],
      ['wand', 'necromancer'],
      ['scepter', 'paladin'],
      ['blood_spirit', 'druid'],
      ['club', 'druid'],
      ['jared_s_stone', 'sorceress'],
    ] as const) {
      if (!BASE_BY_ID[b]) continue;
      for (const s of staffmodPool(base(b), 99)) expect(classOf(s.id), `${b} ${s.id}`).toBe(cls);
    }
    expect(staffmodPool(base('dagger'), 99).some((s) => s.id === 'poison_dagger')).toBe(true);
    const rng = new Rng('staffmods');
    const n = [0, 0, 0, 0];
    const lv = [0, 0, 0, 0];
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const m = rollStaffmods(rng, base('eagle_orb'), 90);
      n[m.length]++;
      for (const x of m) lv[x.value]++;
      expect(new Set(m.map((x) => x.param)).size).toBe(m.length);
    }
    expect(n[0] / N).toBeCloseTo(0.1, 1);
    expect(n[1] / N).toBeCloseTo(0.4, 1);
    expect(n[2] / N).toBeCloseTo(0.3, 1);
    expect(n[3] / N).toBeCloseTo(0.2, 1);
    const tot = lv[1] + lv[2] + lv[3];
    expect(lv[1] / tot).toBeCloseTo(0.4, 1);
    expect(lv[3] / tot).toBeCloseTo(0.25, 1);
    // libellé « (Sorcière uniquement) »
    expect(modLabel({ stat: 'classSkill', value: 3, param: 'fire_ball' })).toMatch(/\+3 à .* \(.* uniquement\)/);
  });

  it('châsses d’affixe (« Socketed ») : bornées par la base', () => {
    const rng = new Rng('chasses');
    let seen = 0;
    for (let i = 0; i < 3000 && seen < 5; i++) {
      const it = generateItem(rng, 'breast_plate', 70, { forceQuality: 'magic' });
      const def = (it.affixes ?? []).map((a) => AFFIX_BY_ID[a.id]).find((d) => d.mods.some((m) => m.stat === 'socketsAdded'));
      if (!def) continue;
      seen++;
      expect(it.sockets).toBeGreaterThan(0);
      expect(it.sockets).toBeLessThanOrEqual(base('breast_plate').maxSockets);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('chaque objet magique / rare tiré respecte les règles (validateItem) sur toutes les bases', () => {
    setLootClass('sorceress');
    const rng = new Rng('validation');
    const errs: string[] = [];
    const bases = BASES.filter((b) => (b.slot || ['smallcharm', 'largecharm', 'grandcharm', 'jewel'].includes(b.type)) && !b.stack);
    for (const b of bases)
      for (const ilvl of [5, 30, 60, 90])
        for (const q of ['magic', 'rare'] as const) {
          if (ilvl < b.qlvl) continue;
          const it: Item = generateItem(rng, b.id, ilvl, { forceQuality: q });
          for (const e of validateItem(it)) errs.push(`${b.id} ${ilvl} ${q} : ${e}`);
          itemName(it);
          itemFinal(it, 60);
        }
    expect(errs.slice(0, 10)).toEqual([]);
  });

  it('la réserve d’affixes ne contient que des affixes permis (type, niveau, rareté)', () => {
    for (const b of ['ring', 'amulet', 'grand_charm', 'small_charm', 'jewel', 'circlet', 'eagle_orb', 'long_sword', 'breast_plate']) {
      const bb = base(b);
      if (!bb) continue;
      const alvl = baseAffixLevel(bb, 99);
      for (const k of ['prefix', 'suffix'] as const) {
        const rare = !bb.type.endsWith('charm'); // charmes : magiques seulement
        const pool = eligibleAffixes(bb, alvl, k, rare, new Set());
        expect(pool.length, `${b} ${k}`).toBeGreaterThan(0);
        for (const a of pool) expect((a.rare || !rare) && affixAllowed(a, bb, rare) && a.level <= alvl).toBe(true);
      }
    }
  });

  it('noms de rares D2 (46 préfixes, 155 suffixes) : suffixe propre au type de la base', () => {
    expect(RARE_PREFIXES.length).toBeGreaterThanOrEqual(45);
    expect(RARE_SUFFIXES.length).toBe(155);
    const rng = new Rng('noms');
    for (const b of BASES.filter((x) => (x.slot || x.type === 'jewel') && x.type !== 'quiver')) {
      const pool = RARE_SUFFIXES.filter(([, , t]) => affixTypeMatches(b, t.split('|')));
      expect(pool.length, b.id).toBeGreaterThan(0);
      const n = rareName(rng, b);
      expect(
        pool.some(([s]) => n.startsWith(`${s} `)),
        `${b.id} : ${n}`,
      ).toBe(true);
    }
    // une épée ne reçoit jamais un suffixe de casque (« Visière »)
    for (let i = 0; i < 300; i++) expect(rareName(rng, base('long_sword')).startsWith('Visière')).toBe(false);
  });
});
