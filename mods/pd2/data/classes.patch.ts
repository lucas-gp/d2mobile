// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Patch Project Diablo 2 (saison 13) des tables vanilla de la base (Diablo II LoD 1.13c, régénérées depuis les MPQ : tools/vanilla/gen.ts).
 * Généré par diff (mods/pd2/tools/vanilla-diff.ts : tables du jeu pd2 d'avant le lot M6 − tables vanilla). Appliqué par mods/pd2/index.ts
 * avant les autres ajouts du mod ; mods/pd2/tests/unit/vanilla-patch.test.ts vérifie qu'il reproduit les tables pd2 à l'identique. Une
 * valeur PD2 changée volontairement : l'éditer ici, puis `npx tsx mods/pd2/tools/vanilla-diff.ts --no-vanilla --ref` (patch remis en
 * forme, empreintes de référence ré-enregistrées).
 */
import type { ClassDef, TablePatch } from '../../../src/mods/api';

/** Registre `classes` : 7 entrée(s) patchée(s) */
export const PD2_CLASSES_PATCH: TablePatch<ClassDef> = {
  patch: {
    sorceress: { stamina: 149 },
    druid: { stamina: 159 },
    barbarian: { manaPerLevel: 1.5, stamina: 217 },
    paladin: { manaPerLevel: 2, stamina: 189 },
    amazon: { manaPerLevel: 2, stamina: 184 },
    assassin: { manaPerLevel: 2, stamina: 220 },
    necromancer: { stamina: 154 },
  },
};
