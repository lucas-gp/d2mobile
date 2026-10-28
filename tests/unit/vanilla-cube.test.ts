/**
 * Cube horadrique de la base = Diablo II LoD 1.13c (lot M10c) : recettes actives d'une partie solo de l'extension (CubeMain.txt : enabled, hors
 * ladder). L'amélioration des runes et l'artisanat sont générés (src/data/cube-d2.ts, contrôlé par vanilla-mpq.test.ts) ; les autres recettes
 * de la base, écrites dans src/data/cube.ts, sont comparées ici aux lignes de la table (sauté sans les MPQ). Le jeu pd2 les patche
 * (mods/pd2/data/cube.patch.ts, test vanilla-patch).
 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import '../../src/data/items/index';
import { CUBE_BY_ID, CUBE_RECIPES, type CubeRecipe } from '../../src/data/cube';
import { D2_CRAFTS, D2_RUNE_UPGRADES } from '../../src/data/cube-d2';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { RULES } from '../../src/mods/rules';
import { withoutPd2 } from '../needs-pd2';

const MPQ = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/in/d2data.mpq`;
const ids = (r: CubeRecipe): string[] => r.cost.flatMap((k) => Array<string>(k.n).fill(k.ids.join('|')));

describe.skipIf(!withoutPd2)('Cube D2 1.13c (jeu de règles d2)', () => {
  it('runes : 3:1 jusqu’à Dol, une gemme ébréchée en plus à partir de Thul ; au-delà, recettes ladder absentes', () => {
    const runes = CUBE_RECIPES.filter((r) => r.category === 'Runes');
    expect(runes.map((r) => r.id)).toEqual(D2_RUNE_UPGRADES.map((u) => `rune_${u.from}`));
    expect(ids(CUBE_BY_ID.rune_r10)).toEqual(['r10', 'r10', 'r10', 'gem_topaz_0']);
    expect(CUBE_BY_ID.rune_r14).toBeUndefined();
    expect(ids(CUBE_BY_ID.gem_ruby_3)).toEqual(['gem_ruby_3', 'gem_ruby_3', 'gem_ruby_3']);
  });
  it('artisanat : quatre familles, bases propres à chaque emplacement (Puissance : casque complet et ses versions supérieures)', () => {
    expect(Object.keys(D2_CRAFTS).sort()).toEqual(['blood', 'caster', 'hitpower', 'safety']);
    expect(CUBE_RECIPES.filter((r) => r.category === 'Artisanat').map((r) => r.id)).toEqual(['craft_blood', 'craft_caster', 'craft_hitpower', 'craft_safety']);
    expect(RULES['cube.craft']('hitpower', 'helm', BASE_BY_ID.full_helm)?.rune).toBe('r06');
    expect(RULES['cube.craft']('hitpower', 'helm', BASE_BY_ID.giant_conch)?.rune).toBe('r06');
    expect(RULES['cube.craft']('hitpower', 'helm', BASE_BY_ID.cap)).toBeNull();
    // arme de Sang : toute hache (type d'ItemTypes.txt), pas une épée
    expect(RULES['cube.craft']('blood', 'weapon', BASE_BY_ID.great_axe)?.rune).toBe('r09');
    expect(RULES['cube.craft']('blood', 'weapon', BASE_BY_ID.short_sword)).toBeNull();
    expect(RULES['cube.craft']('vampiric', 'helm', BASE_BY_ID.full_helm)).toBeNull();
  });
  it('recettes propres à Project Diablo 2 absentes de la base', () => {
    for (const id of ['repair_any', 'pandemonium_talisman', 'craft_vampiric', 'up_unique_weapon_2', 'rune_r20']) expect(CUBE_BY_ID[id], id).toBeUndefined();
    expect(CUBE_BY_ID.pandemonium_finale.cost.map((k) => k.ids[0])).toEqual(['organ_brain', 'organ_horn', 'organ_eye']);
  });
});

describe.skipIf(!withoutPd2 || !existsSync(MPQ))('Cube D2 1.13c contre CubeMain.txt (MPQ du joueur)', () => {
  it('chaque recette écrite à la main a sa ligne de CubeMain.txt (entrées, niveau du résultat)', async () => {
    const { cubeRows, gemId } = await import('../../tools/vanilla/cube');
    const rows = cubeRows();
    const byDesc = (re: RegExp) => {
      const r = rows.filter((x) => re.test(x.description));
      expect(r.length, String(re)).toBe(1);
      return r[0];
    };
    const MISC: Record<string, string> = {
      pk1: 'key_terror',
      pk2: 'key_hate',
      pk3: 'key_destruction',
      dhn: 'organ_horn',
      bey: 'organ_eye',
      mbr: 'organ_brain',
      tes: 'essence_twisted',
      ceh: 'essence_charged',
      bet: 'essence_burning',
      fed: 'essence_festering',
      leg: 'wirts_leg',
      tbk: 'tome_portal',
      msf: 'staff_of_kings',
      vip: 'viper_amulet',
      qf1: 'khalim_flail',
      qhr: 'khalim_heart',
      qey: 'khalim_eye',
      qbr: 'khalim_brain',
    };
    const GEN = ['gem0', 'gem1', 'gem2', 'gem3', 'gem4'];
    /** Entrées matériaux d'une ligne (runes, gemmes, objets précis), dans l'ordre de la table */
    const mats = (inputs: string[]): string[] =>
      inputs.flatMap((s) => {
        const [code, ...f] = s.split(',');
        const q = Number(f.find((x) => x.startsWith('qty='))?.slice(4) ?? 1);
        const g = GEN.indexOf(code);
        const id = g >= 0 ? `gem*${g}` : /^r\d\d$/.test(code) ? code : (gemId(code) ?? MISC[code]);
        return id ? Array<string>(q).fill(id) : [];
      });
    const ours = (r: CubeRecipe): string[] => r.cost.flatMap((k) => Array<string>(k.n).fill(k.ids.length > 1 ? `gem*${Number(k.ids[0].slice(-1))}` : k.ids[0]));
    const same = (id: string, row: ReturnType<typeof byDesc>) => expect([...ours(CUBE_BY_ID[id])].sort(), id).toEqual([...mats(row.inputs)].sort());
    // gemmes : chaque « 3 gemmes → grade supérieur »
    for (const row of rows.filter((x) => /^3 (chipped|flawed|standard|flawless) \w+ -> /.test(x.description))) {
      const from = gemId(row.inputs[0].split(',')[0])!;
      same(from, row);
      expect(CUBE_BY_ID[from].effect).toEqual({ kind: 'material', id: gemId(row.output), qty: 1 });
    }
    // châsses (1 à 6, objet normal sans châsse)
    for (const [id, re] of [
      ['sock_armor', /normal torso -> socketed torso/],
      ['sock_weapon', /normal weapon -> socketed weapon/],
      ['sock_helm', /normal helm -> socketed helm/],
      ['sock_shield', /normal shield -> socketed shield/],
    ] as const) {
      const row = byDesc(re);
      same(id, row);
      expect(row.mods).toEqual([{ code: 'sock', param: '', min: 1, max: 6 }]);
      expect(CUBE_BY_ID[id].effect).toMatchObject({ kind: 'addSockets', min: 1, max: 6 });
      expect(CUBE_BY_ID[id].items?.accept.qualities).toEqual(['normal']);
    }
    // armes magiques à châsses, relances, bijoux
    for (const [id, re, lvl] of [
      ['sock_magic_chipped', /3 chipped gems \+ 1 magic weapon/, 25],
      ['sock_magic_standard', /3 standard gems \+ 1 socketed weapon/, 30],
      ['sock_magic_flawless', /3 flawless gems \+ 1 magic weapon/, 30],
    ] as const) {
      const row = byDesc(re);
      same(id, row);
      expect(row.lvl).toBe(lvl);
      expect(CUBE_BY_ID[id].effect).toEqual({ kind: 'socketedMagic', ilvl: lvl });
    }
    same('reroll_magic', byDesc(/^3 perfect gems \+ 1 magic item/));
    expect(byDesc(/^3 perfect gems \+ 1 magic item/).ilvl).toBe(100);
    const rare = byDesc(/^6 perfect skulls \+ 1 rare item/);
    same('reroll_rare', rare);
    expect([rare.plvl, rare.ilvl]).toEqual([40, 40]);
    expect(byDesc(/^3 rings -> amulet/).plvl).toBe(75);
    expect(byDesc(/^3 amulets -> ring/).plvl).toBe(75);
    const prism = byDesc(/prismatic amulet/);
    same('prismatic_amulet', prism);
    expect([prism.lvl, prism.output]).toEqual([50, 'amu,mag,pre=331']);
    expect(CUBE_BY_ID.prismatic_amulet.effect).toEqual({ kind: 'prismatic', prefix: 'prismatic_p331' });
    // améliorations (unique et rare vers exceptionnel, rare vers élite)
    for (const [id, re] of [
      ['up_unique_weapon_1', /basic unique weapon -> exceptional/],
      ['up_unique_armor_1', /basic unique armor -> exceptional/],
      ['up_rare_weapon_1', /basic rare weapon -> exceptional/],
      ['up_rare_armor_1', /basic rare armor -> exceptional/],
      ['up_rare_weapon_2', /exceptional rare weapon -> elite/],
      ['up_rare_armor_2', /exceptional rare armor -> elite/],
    ] as const)
      same(id, byDesc(re));
    // réparations, châsses vidées (le parchemin de portail de la table n'existe pas dans le jeu)
    same('repair_weapon', byDesc(/^r09 \+ weapon -> repair$/));
    same('repair_armor', byDesc(/^r08 \+ armor -> repair$/));
    expect(mats(byDesc(/unsocket/).inputs)).toEqual(['r15']);
    same('unsocket', byDesc(/unsocket/));
    // Pandémonium, Jeton d'absolution, Vaches, quêtes
    same('pandemonium_keys', byDesc(/^Pandemonium key$/));
    same('pandemonium_finale', byDesc(/^Pandemonium Finale key$/));
    same('token_absolution', byDesc(/^Token of Absolution$/));
    same('cows_portal', byDesc(/portal to cow lvl/));
    same('quest_horadric_staff', byDesc(/Horadric Staff/));
    same('quest_khalim_will', byDesc(/Super Khalim Flail/));
  });
});
