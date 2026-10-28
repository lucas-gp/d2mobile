// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Patch Project Diablo 2 (saison 13) des tables vanilla de la base (Diablo II LoD 1.13c, régénérées depuis les MPQ : tools/vanilla/gen.ts).
 * Généré par diff (mods/pd2/tools/vanilla-diff.ts : tables du jeu pd2 d'avant le lot M6 − tables vanilla). Appliqué par mods/pd2/index.ts
 * avant les autres ajouts du mod ; mods/pd2/tests/unit/vanilla-patch.test.ts vérifie qu'il reproduit les tables pd2 à l'identique. Une
 * valeur PD2 changée volontairement : l'éditer ici, puis `npx tsx mods/pd2/tools/vanilla-diff.ts --no-vanilla --ref` (patch remis en
 * forme, empreintes de référence ré-enregistrées).
 */
import type { MonsterFidelityEntry, TablePatch } from '../../../src/mods/api';

/** Registre `monsterFidelity` : 13 entrée(s) patchée(s) (dont 12 avec ordre des champs) */
export const PD2_MONSTER_FIDELITY_PATCH: TablePatch<MonsterFidelityEntry> = {
  patch: {
    countess: { res: { phys: [0, 0, 20], magic: [0, 0, 20], fire: [0, 0, 108], light: [0, 0, 33], cold: [0, 0, 130], poison: [0, 0, 20] }, drain: 100, hpD: [3.77, 2.53, 5.05] },
    andariel: { hpD: [26.97, 26.97, 15.45], dmgD: [2.04, 2.6, 2.86] },
    nihlathak: { res: { magic: [0, 0, 25], fire: [0, 0, 33], light: [0, 0, 33], cold: [70, 70, 70], poison: [70, 70, 70], phys: [0, 0, 0] }, drain: 100, hpD: [2.01, 2.01, 6.03] },
    izual: { drain: 50 },
    summoner: { res: { fire: [50, 50, 75], light: [50, 50, 75], cold: [50, 50, 75], phys: [0, 0, 0], magic: [0, 0, 0], poison: [0, 0, 0] }, drain: 50, hpD: [1.58, 1.32, 10.53] },
    blood_raven: { drain: 75, hpD: [3.4, 13.55, 18.65] },
    dclone: { res: { phys: [30, 30, 30], magic: [30, 30, 30], fire: [30, 30, 30], light: [30, 30, 30], cold: [30, 30, 30], poison: [30, 30, 30] }, drain: 5, hpD: [110.84, 110.84, 110.84] },
    uber_duriel: { res: { phys: [50, 50, 50], magic: [50, 50, 50], fire: [90, 90, 90], light: [90, 90, 90], cold: [90, 90, 90], poison: [95, 95, 95] }, drain: 100, hpD: [69.47, 69.47, 69.47] },
    uber_mephisto: {
      res: { phys: [40, 40, 40], magic: [40, 40, 40], fire: [60, 60, 60], light: [60, 60, 60], cold: [60, 60, 60], poison: [60, 60, 60] },
      regen: 0,
      drain: 0,
      hpD: [65.94, 65.94, 65.94],
    },
    uber_diablo: {
      res: { phys: [40, 40, 40], magic: [40, 40, 40], fire: [60, 60, 60], light: [60, 60, 60], cold: [60, 60, 60], poison: [60, 60, 60] },
      regen: 0,
      drain: 15,
      hpD: [74.42, 74.42, 74.42],
    },
    uber_baal: { res: { phys: [40, 40, 40], magic: [40, 40, 40], fire: [60, 60, 60], light: [60, 60, 60], cold: [60, 60, 60], poison: [60, 60, 60] }, regen: 0, drain: 20, hpD: [73.36, 73.36, 73.36] },
    lilith: { res: { phys: [50, 50, 50], magic: [50, 50, 50], fire: [90, 90, 90], light: [90, 90, 90], cold: [90, 90, 90], poison: [90, 90, 90] }, drain: 33, hpD: [69.47, 69.47, 69.47] },
    uber_izual: { res: { phys: [50, 50, 50], magic: [50, 50, 50], fire: [90, 90, 90], light: [90, 90, 90], cold: [90, 90, 90], poison: [95, 95, 95] }, drain: 50, hpD: [69.47, 69.47, 69.47] },
  },
  keyOrder: {
    countess: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
    nihlathak: ['d2', 'res', 'regen', 'drain', 'hpD'],
    izual: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
    summoner: ['d2', 'res', 'regen', 'drain', 'hpD'],
    blood_raven: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
    dclone: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
    uber_duriel: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
    uber_mephisto: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
    uber_diablo: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
    uber_baal: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
    lilith: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
    uber_izual: ['d2', 'res', 'regen', 'drain', 'hpD', 'dmgD'],
  },
};
