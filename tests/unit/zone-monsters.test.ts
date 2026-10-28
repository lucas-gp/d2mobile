/**
 * Cohérence des monstres par zone (audit « incohérences de monstres, notamment à Méphisto », voir docs/internal/audit/monsters-par-zone.md) :
 * espèces conformes à Levels.txt, aucun monstre d'un autre acte hors exceptions documentées, boss et super-uniques présents une fois,
 * niveaux croissants avec la difficulté. Les contrôles sur les zones construites exigent les cartes D2 privées (ignorés sans elles).
 */
import fs from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { LEVEL_PLANS } from '../../src/data/levels';
import { MONSTER_BY_ID } from '../../src/data/monsters';
import { RUNS } from '../../src/data/runs';
import { SUPER_UNIQUE_ZONES } from '../../src/data/superunique-zones';

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

/** Actes où Levels.txt (colonnes mon / nmon / umon, patch 1.13) place la famille de chaque espèce ; « * » : jamais dans une zone ordinaire (boss, vagues, Pandémonium) */
const ACTS: Record<string, string> = {
  fallen: '1',
  fallen_shaman: '15',
  treasure_fallen: '1',
  zombie: '123',
  skeleton: '125',
  skeleton_archer: '125',
  skeleton_mage: '125',
  burning_dead: '125',
  ghoul: '123',
  goatman: '125',
  wraith: '1235',
  afflicted: '145',
  dark_stalker: '1356',
  quill_rat: '15',
  foul_crow: '1235',
  hell_bovine: '1',
  brute: '123',
  mummy: '235',
  unraveler: '235',
  scarab: '2356',
  sand_raider: '235',
  sand_maggot: '23456',
  claw_viper: '235',
  panther_woman: '25',
  slinger: '25',
  spear_cat: '25',
  vulture: '235',
  baboon: '235',
  night_marauder: '235',
  sand_leaper: '2345',
  bat_demon: '2345',
  locust: '236',
  arach: '1356',
  maggot_young: '2',
  maggot_queen: '2',
  fetish: '135',
  fetish_blow: '35',
  fetish_shaman: '35',
  bone_fetish: '35',
  soul_killer: '135',
  mosquito: '3',
  thornhulk: '35',
  frog_demon: '3',
  zealot: '3',
  cantor: '35',
  council_member: '35',
  ghoul_lord: '1235',
  blunderbore: '2345',
  willowisp: '345',
  water_watcher: '35',
  storm_caster: '45',
  oblivion_knight: '45',
  doom_knight: '4',
  abyss_knight: '4',
  vile_mother: '45',
  regurgitator: '45',
  venom_lord: '45',
  balrog: '456',
  flesh_beast: '4',
  blood_lord: '5',
  minion: '5',
  succubus: '56',
  succubus_witch: '56',
  putrid_defiler: '5',
  imp: '56',
  siege_beast: '5',
  death_mauler: '5',
  overseer: '56',
  snowy_yeti: '5',
  frozen_horror: '5',
  suicide_minion: '5',
  prowling_dead: '5',
  minion_destruction: '5',
  warped_shaman: '15',
  pain_worm: '5',
  dark_ranger: '1356',
  dark_spearwoman: '1356',
  baal_hydra: '5',
};
/** Acte d'une zone d'après son identifiant ; 0 : Pandémonium et zones à part (tous actes) */
const actOfZone = (id: string): number => {
  if (/^a(\d)_/.test(id)) return Number(id[1]);
  if (id.startsWith('uber_')) return 0;
  const m: Record<string, number> = { tristram: 1, countess: 1, andariel: 1, cows: 1, tombs: 2, mephisto: 3, river: 4, chaos: 4, eldritch: 5, pindleskin: 5, nihlathak: 5, ancients: 5, baal: 5 };
  return m[id] ?? 0;
};

/**
 * Exceptions documentées : espèce d'un autre acte tolérée dans une zone (clé : zone ; valeur : espèces). Aucune pour l'instant : les tables suivent
 * Levels.txt, qui mêle déjà les familles (le tableau ACTS ci-dessus liste tous les actes où chaque famille apparaît). Tristram Normal remplace les
 * Hommes-bouc par des Déchus et des Zombies (même acte).
 */
const EXCEPTIONS: Record<string, string[]> = {};

/**
 * Espèces des zones faites à la main d'après Levels.txt (colonnes mon / nmon, patch 1.13), indépendamment de LEVEL_PLANS pour que la table ne dérive pas en silence.
 * Méphisto : vampire4 = « Blood Lord » de l'Acte III, famille du Seigneur goule (le blood_lord du jeu est le bloodlord de l'Acte V).
 */
const EXPECTED: Record<string, string[]> = {
  mephisto: ['ghoul_lord'],
  a3_durance1: ['mummy', 'ghoul_lord', 'blunderbore', 'bone_fetish'],
  a3_durance2: ['mummy', 'ghoul_lord', 'blunderbore', 'bone_fetish'],
  a3_travincal: ['cantor', 'ghoul_lord'],
  countess: ['fallen', 'wraith', 'goatman', 'dark_stalker'],
  andariel: ['ghoul', 'afflicted'],
  tombs: ['wraith', 'scarab', 'mummy', 'unraveler', 'ghoul_lord', 'blunderbore'],
  cows: ['hell_bovine'],
  chaos: ['storm_caster', 'oblivion_knight', 'venom_lord'],
  pindleskin: ['prowling_dead'],
  river: ['blunderbore', 'storm_caster', 'oblivion_knight', 'venom_lord'],
};

describe('Plans de peuplement (Levels.txt)', () => {
  it("Méphisto : les vampires de la Durance, pas les Seigneurs de la mort de l'Acte V", () => {
    for (let d = 0; d < 3; d++) expect(LEVEL_PLANS.mephisto.mons[d].map((m) => m[0])).toEqual(['ghoul_lord']);
    expect(LEVEL_PLANS.a3_durance1.mons[0].map((m) => m[0])).not.toContain('blood_lord');
  });

  it('les zones faites à la main reprennent les espèces de Levels.txt', () => {
    for (const [zone, species] of Object.entries(EXPECTED)) {
      const plan = LEVEL_PLANS[zone];
      expect(plan, zone).toBeTruthy();
      for (let d = 0; d < 3; d++) expect([...new Set(plan.mons[d].map((m) => m[0]))].sort(), `${zone} difficulté ${d}`).toEqual([...species].sort());
    }
  });

  it('Hautes-Terres (Normal : Imps et Bêtes de siège seulement) et Halls de Vaught (Cauchemar : Arachnides, chamans fétiches, bêtes des dunes, vipères)', () => {
    expect(LEVEL_PLANS.eldritch.mons[0].map((m) => m[0]).sort()).toEqual(['imp', 'siege_beast']);
    for (const d of [1, 2]) for (const m of ['arach', 'fetish_shaman', 'baboon', 'claw_viper']) expect(LEVEL_PLANS.nihlathak.mons[d].map((x) => x[0])).toContain(m);
    expect(LEVEL_PLANS.nihlathak.mons[1].map((x) => x[0])).not.toContain('fallen_shaman');
  });

  it("chaque espèce d'une zone appartient à l'acte de la zone (exceptions documentées)", () => {
    const bad: string[] = [];
    for (const [zone, plan] of Object.entries(LEVEL_PLANS)) {
      const act = actOfZone(zone);
      if (!act) continue;
      for (let d = 0; d < 3; d++)
        for (const [mon] of plan.mons[d]) {
          const acts = ACTS[mon];
          if (!acts) bad.push(`${zone} : espèce « ${mon} » sans acte connu`);
          else if (acts !== '*' && !acts.includes(String(act)) && !(EXCEPTIONS[zone] ?? []).includes(mon)) bad.push(`${zone} (acte ${act}) : ${mon} vient de l'acte ${acts}`);
        }
    }
    expect([...new Set(bad)], [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('chaque espèce citée existe et a un nom', () => {
    for (const [zone, plan] of Object.entries(LEVEL_PLANS)) for (const mix of plan.mons) for (const [mon] of mix) expect(MONSTER_BY_ID[mon]?.name, `${zone} : ${mon}`).toBeTruthy();
  });

  it('super-uniques à zone unique : Beetleburst à la Far Oasis, Snapchip Shatter à la Icy Cellar', () => {
    expect(SUPER_UNIQUE_ZONES.beetleburst).toEqual(['a2_oasis']);
    expect(SUPER_UNIQUE_ZONES['snapchip shatter']).toEqual(['a5_glacial2']);
  });
});

describe.skipIf(!fs.existsSync(DIR))('Zones construites (cartes D2 privées)', () => {
  afterAll(() => clearD2Maps());
  it('espèces, boss, super-uniques et niveaux', { timeout: 300000 }, () => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
    const errs: string[] = [];
    for (const run of RUNS) {
      if (/_town$|^a4_fortress$|^a1_tower$|^a2_harem1$/.test(run.id)) continue;
      // niveaux croissants avec la difficulté
      const [n, c, h] = run.zoneLevel;
      if (!(n <= c && c <= h) && !/_town$/.test(run.id)) errs.push(`${run.id} : niveaux ${n}/${c}/${h} non croissants`);
      // Pandémonium (Anciens, Rathma, Lucion, Clone…) : compositions PD2 propres, volontairement laissées telles quelles
      const plan = run.id.startsWith('uber_') ? undefined : (LEVEL_PLANS[run.id] ?? LEVEL_PLANS[run.zoneKey]);
      const act = actOfZone(run.id);
      for (const d of [0, 1, 2] as const) {
        const z = run.build(7, d);
        const named = new Map<string, number>();
        const bosses = new Map<string, number>();
        for (const s of z.spawns) {
          if (s.uniqueName) named.set(s.uniqueName, (named.get(s.uniqueName) ?? 0) + 1);
          if (s.rank === 'boss') bosses.set(s.monster, (bosses.get(s.monster) ?? 0) + 1);
          // espèce propre à la zone : celle du plan, ses variantes, ou un monstre nommé / boss / vague / escorte de boss
          if (s.rank === 'boss' || s.uniqueName || s.wave || s.runBoss || s.seal) continue;
          const def = MONSTER_BY_ID[s.monster];
          const species = s.monster;
          const acts = ACTS[species];
          if (plan) {
            const allowed = new Set(plan.mons[d].flatMap(([m]) => [m, ...(MONSTER_BY_ID[m]?.alts?.map((a) => a[0]) ?? [])]));
            const pre = ['fallen', 'fallen_shaman', 'zombie', 'imp', 'minion'];
            const escort = z.spawns.some((o) => o.rank === 'boss' && o.trigger === 9) && s.trigger === 9;
            if (!allowed.has(species) && !pre.includes(species) && !escort) errs.push(`${run.id} d${d} : ${species} hors du plan`);
          }
          if (act && acts && !acts.includes(String(act)) && !(EXCEPTIONS[run.id] ?? []).includes(species) && !(plan?.mons[d] ?? []).some(([m]) => m === species))
            errs.push(`${run.id} d${d} : ${species} (${def?.name ?? ''}) d'un autre acte`);
        }
        for (const [name, k] of named) if (k > 1 && !/^Gardien/.test(name) && !/^Rival|^Rôdeur|^Héros|^Gardien/.test(name)) errs.push(`${run.id} d${d} : « ${name} » ×${k}`);
        for (const [mon, k] of bosses) if (k > 1) errs.push(`${run.id} d${d} : boss ${mon} ×${k}`);
        // le chef de run existe une seule fois
        const chiefs = z.spawns.filter((s) => s.runBoss);
        if (run.boss && chiefs.length && chiefs.filter((s) => s.monster === run.boss).length > 1 && run.id !== 'ancients') errs.push(`${run.id} d${d} : boss de run en double`);
        // gardien de tombeau : un seul par zone
        const guards = z.spawns.filter((s) => s.uniqueName?.startsWith('Gardien du tombeau'));
        if (guards.length > 1) errs.push(`${run.id} d${d} : ${guards.length} gardiens de tombeau`);
        // zone peuplée : des monstres ordinaires, pas seulement des uniques
        if (plan && plan.den > 0 && run.id !== 'pindleskin' && !z.spawns.some((s) => (s.rank ?? 'normal') === 'normal')) errs.push(`${run.id} d${d} : aucun monstre ordinaire`);
        // Méphisto : une fois, escorte et monstres de la famille des vampires
        if (run.id === 'mephisto' || run.id === 'a3_durance3') {
          expect(z.spawns.filter((s) => s.monster === 'mephisto').length, `${run.id} d${d} : Méphisto`).toBe(1);
          const foreign = [...new Set(z.spawns.filter((s) => s.monster !== 'mephisto').map((s) => s.monster))].filter((m) => m !== 'ghoul_lord');
          expect(foreign, `${run.id} d${d} : espèces étrangères à la Durance`).toEqual([]);
        }
        // super-uniques à zone unique
        for (const [preset, zones] of Object.entries(SUPER_UNIQUE_ZONES)) {
          const names: Record<string, string> = { beetleburst: 'Beetleburst', 'snapchip shatter': 'Snapchip Shatter' };
          if (z.spawns.some((s) => s.uniqueName === names[preset]) && !zones.includes(run.id)) errs.push(`${run.id} d${d} : ${names[preset]} hors de ${zones.join(', ')}`);
        }
      }
    }
    expect([...new Set(errs)], [...new Set(errs)].join('\n')).toEqual([]);
  });
});
