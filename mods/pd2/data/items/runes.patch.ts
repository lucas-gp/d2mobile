// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Patch Project Diablo 2 (saison 13) des tables vanilla de la base (Diablo II LoD 1.13c, régénérées depuis les MPQ : tools/vanilla/gen.ts).
 * Généré par diff (mods/pd2/tools/vanilla-diff.ts : tables du jeu pd2 d'avant le lot M6 − tables vanilla). Appliqué par mods/pd2/index.ts
 * avant les autres ajouts du mod ; mods/pd2/tests/unit/vanilla-patch.test.ts vérifie qu'il reproduit les tables pd2 à l'identique. Une
 * valeur PD2 changée volontairement : l'éditer ici, puis `npx tsx mods/pd2/tools/vanilla-diff.ts --no-vanilla --ref` (patch remis en
 * forme, empreintes de référence ré-enregistrées).
 */
import type { GemDef, RuneDef, StatRoll, TablePatch } from '../../../../src/mods/api';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

/** Registre `runes` : 17 entrée(s) patchée(s) */
export const PD2_RUNES_PATCH: TablePatch<RuneDef> = {
  patch: {
    r01: { weapon: [r('attackRating', 50), r('lightRadius', 1)], armor: [r('defFlat', 15), r('lightRadius', 1)], shield: [r('defFlat', 15), r('lightRadius', 1)] },
    r02: { weapon: [r('dmgUndeadPct', 75)] },
    r04: { shield: [r('defMissile', 50)] },
    r11: { armor: [r('thornsFlat', 20)], shield: [r('thornsFlat', 24)] },
    r12: { shield: [r('drFlat', 9)] },
    r14: { weapon: [r('edPct', 20), r('fleeChance', 25)], armor: [r('lifeRegen', 20)], shield: [r('lifeRegen', 30)] },
    r21: { weapon: [r('dmgDemonPct', 75), r('arDemon', 100)], armor: [r('defPct', 50)], shield: [r('defPct', 50)] },
    r22: { weapon: [r('openWounds', 10)] },
    r23: { shield: [r('mdr', 9)] },
    r24: { armor: [r('mf', 30)], shield: [r('mf', 30)] },
    r25: { weapon: [r('arPct', 50)], armor: [r('maxResPoison', 4)], shield: [r('maxResPoison', 4)] },
    r26: { armor: [r('maxResFire', 4)], shield: [r('maxResFire', 4)] },
    r27: { weapon: [r('edPct', 45)], armor: [r('maxResCold', 4)], shield: [r('maxResCold', 4)] },
    r28: { armor: [r('maxResLight', 4)], shield: [r('maxResLight', 4)] },
    r29: { weapon: [r('lifePerKill', 4)], shield: [r('mana', 75)] },
    r30: { armor: [r('dr', 6)], shield: [r('dr', 6)] },
    r31: { shield: [r('life', 75)] },
  },
};

/** Registre `gems` : 10 entrée(s) patchée(s) */
export const PD2_GEMS_PATCH: TablePatch<GemDef> = {
  patch: {
    gem_amethyst_0: { shield: [r('defense', 8)] },
    gem_amethyst_1: { shield: [r('defense', 12)] },
    gem_amethyst_2: { shield: [r('defense', 18)] },
    gem_amethyst_3: { shield: [r('defense', 24)] },
    gem_amethyst_4: { shield: [r('defense', 30)] },
    gem_skull_0: { weapon: [r('lifeLeech', 2), r('manaLeech', 1)] },
    gem_skull_1: { weapon: [r('lifeLeech', 2), r('manaLeech', 2)] },
    gem_skull_2: { weapon: [r('lifeLeech', 3), r('manaLeech', 2)] },
    gem_skull_3: { weapon: [r('lifeLeech', 3), r('manaLeech', 3)] },
    gem_skull_4: { weapon: [r('lifeLeech', 4), r('manaLeech', 3)] },
  },
};
