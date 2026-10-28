// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Patch Project Diablo 2 (saison 13) des tables vanilla de la base (Diablo II LoD 1.13c, régénérées depuis les MPQ : tools/vanilla/gen.ts).
 * Généré par diff (mods/pd2/tools/vanilla-diff.ts : tables du jeu pd2 d'avant le lot M6 − tables vanilla). Appliqué par mods/pd2/index.ts
 * avant les autres ajouts du mod ; mods/pd2/tests/unit/vanilla-patch.test.ts vérifie qu'il reproduit les tables pd2 à l'identique. Une
 * valeur PD2 changée volontairement : l'éditer ici, puis `npx tsx mods/pd2/tools/vanilla-diff.ts --no-vanilla --ref` (patch remis en
 * forme, empreintes de référence ré-enregistrées).
 */
import type { SetDef, SetItemDef, StatRoll, TablePatch } from '../../../../src/mods/api';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

/** Registre `setItems` : 117 entrée(s) patchée(s), 3 ajoutée(s), 2 retirée(s) */
export const PD2_SET_ITEMS_PATCH: TablePatch<SetItemDef> = {
  patch: {
    s_civerbs_ward: {
      mods: [r('block', 30), r('defFlat', 30, 60)],
      partial: [
        { count: 2, with: ['s_civerbs_icon'], mods: [r('dr', 10)] },
        { count: 2, with: ['s_civerbs_cudgel'], mods: [r('resPoison', 25, 26)] },
      ],
    },
    s_civerbs_icon: { mods: [r('lifeRegen', 10, 20), r('manaRegenPct', 40)], partial: [{ count: 2, mods: [r('resCold', 25)] }] },
    s_civerbs_cudgel: { mods: [r('maxDmg', 17, 23), r('maxDmgPerLvl', 1), r('attackRating', 75), r('dmgUndeadPct', 50)], partial: [{ count: 2, mods: [r('dmgUndeadPct', 100)] }] },
    s_hsarus_iron_heel: { mods: [r('frw', 20), r('resFire', 25)] },
    s_hsarus_iron_fist: { mods: [r('str', 20), r('drFlat', 2)] },
    s_hsarus_iron_stay: { mods: [r('life', 20), r('resCold', 20)] },
    s_cleglaws_pincers: { mods: [r('poisonDmg', 15), r('slowTarget', 25), r('knockback', 1)] },
    s_irathas_collar: {
      mods: [r('resPoison', 30), r('poisonLength', 25)],
      partial: [
        { count: 2, mods: [r('resAll', 10)] },
        { count: 3, mods: [r('amzSkills', 1)] },
      ],
    },
    s_irathas_cuff: { mods: [r('resCold', 20), r('pierceChance', 20), r('halfFreeze', 1)] },
    s_irathas_coil: {
      mods: [r('resLight', 30), r('resFire', 30)],
      partial: [
        { count: 2, mods: [r('defPerLvl', 2)] },
        { count: 3, mods: [r('amzSkills', 1)] },
      ],
    },
    s_irathas_cord: {
      mods: [r('minDmg', 5), r('defFlat', 25)],
      partial: [
        { count: 2, mods: [r('dex', 10)] },
        { count: 3, mods: [r('maxDmg', 10)] },
      ],
    },
    s_isenharts_lightbrand: { mods: [r('ias', 20), r('minDmg', 10), r('attackRatingPerLvl', 5)], partial: [{ count: 2, mods: [r('addLightMaxPerLvl', 5)] }] },
    s_isenharts_parry: { mods: [r('defFlat', 40), r('attackRatingPerLvl', 2.5)], partial: [{ count: 3, mods: [r('resFirePerLvl', 1)] }] },
    s_isenharts_case: {
      mods: [r('defFlat', 40), r('mdr', 2, 4)],
      partial: [
        { count: 2, mods: [r('defPerLvl', 2)] },
        { count: 3, mods: [r('resColdPerLvl', 1)] },
      ],
    },
    s_isenharts_horns: { mods: [r('maxDmg', 4, 8), r('dex', 6), r('drFlat', 2, 4)], partial: [{ count: 3, mods: [r('resLightPerLvl', 1)] }] },
    s_vidalas_barb: {
      mods: [r('edPct', 30, 45), r('addLightMin', 1), r('addLightMax', 45)],
      partial: [
        { count: 2, mods: [r('attackRatingPerLvl', 8)] },
        { count: 3, mods: [r('ias', 20)] },
        { count: 4, mods: [r('dexPerLvl', 2)] },
      ],
    },
    s_vidalas_ambush: { mods: [r('defFlat', 50), r('dex', 15, 25)] },
    s_vidalas_snare: { mods: [r('life', 25), r('resCold', 20), r('pierceChance', 30)] },
    s_milabregas_orb: {
      mods: [r('defFlat', 25), r('mf', 20, 60), r('life', 50)],
      partial: [
        { count: 2, mods: [r('procGetHit', 25, 25, 'frost_nova:8')] },
        { count: 3, mods: [r('block', 30)] },
      ],
    },
    s_milabregas_rod: {
      mods: [r('palSkills', 1), r('edPct', 50), r('addColdMin', 35), r('addColdMax', 55), r('lightRadius', 2), r('dmgUndeadPct', 50)],
      partial: [{ count: 2, mods: [r('procHit', 12, 12, 'frost_nova:9')] }],
    },
    s_milabregas_diadem: { mods: [r('addColdMin', 25), r('addColdMax', 35), r('life', 15), r('mana', 15)] },
    s_milabregas_robe: {
      mods: [r('addColdMin', 25), r('addColdMax', 35), r('drFlat', 2), r('thornsFlat', 13), r('defPct', 60, 100)],
      partial: [{ count: 2, mods: [r('procHit', 14, 14, 'frost_nova:8')] }],
    },
    s_cathans_rule: {
      mods: [r('fireSkills', 1, 2), r('fcr', 10), r('dmgUndeadPct', 50), r('procCast', 12, 12, 'blaze:10')],
      partial: [
        { count: 2, mods: [r('mana', 50)] },
        { count: 3, mods: [r('resAll', 10)] },
        { count: 4, mods: [r('reduceDef', 35)] },
      ],
    },
    s_cathans_mesh: {
      mods: [r('frw', 20), r('defFlat', 15), r('reqPct', 50)],
      partial: [
        { count: 3, mods: [r('resFire', 30)] },
        { count: 2, mods: [r('thornsPerLvl', 1)] },
      ],
    },
    s_cathans_visage: {
      mods: [r('manaLeech', 3, 5), r('mana', 20), r('resCold', 25)],
      partial: [
        { count: 2, mods: [r('defPerLvl', 2)] },
        { count: 3, mods: [r('attackRating', 60)] },
      ],
    },
    s_cathans_sigil: { mods: [r('fhr', 10), r('resLight', 20, 30), r('thornsPerLvl', 1)] },
    s_cathans_seal: {
      partial: [
        { count: 2, mods: [r('str', 10)] },
        { count: 3, mods: [r('maxDmg', 10)] },
      ],
    },
    s_tancreds_crowbill: {
      mods: [r('procAtt', 33, 33, 'charged_bolt:12'), r('edPct', 60, 80), r('attackRating', 100, 175), r('mana', 20)],
      partial: [
        { count: 2, mods: [r('ias', 20)] },
        { count: 3, mods: [r('procAtt', 20, 20, 'charged_bolt:12')] },
      ],
    },
    s_tancreds_spine: { mods: [r('edPct', 30, 45), r('str', 15), r('life', 40)], partial: [{ count: 2, mods: [r('defPerLvl', 6)] }] },
    s_tancreds_hobnails: { mods: [r('dex', 10, 20), r('dr', 5, 10)] },
    s_tancreds_weird: {
      mods: [r('addLightMin', 1), r('addLightMax', 45), r('drFlat', 3, 6), r('mdr', 2, 4)],
      partial: [
        { count: 2, mods: [r('mf', 78)] },
        { count: 3, mods: [r('attackRating', 160)] },
      ],
    },
    s_tancreds_skull: { mods: [r('edPct', 20, 30), r('attackRating', 80)] },
    s_sigons_gage: { mods: [r('attackRating', 20), r('str', 10)] },
    s_sigons_visor: { mods: [r('defFlat', 25), r('mana', 30)] },
    s_sigons_wrap: { mods: [r('life', 20), r('resFire', 20)] },
    s_sigons_guard: { mods: [r('allSkills', 1), r('block', 20), r('resCold', 30)] },
    s_infernal_torch: {
      mods: [r('necSkills', 1), r('minDmg', 8), r('dmgUndeadPct', 150), r('deadlyStrike', 20)],
      partial: [
        { count: 2, mods: [r('attackRatingPerLvl', 10)] },
        { count: 3, mods: [r('oskill', 2, 2, 'poison_dagger')] },
      ],
    },
    s_infernal_sign: {
      partial: [
        { count: 2, mods: [r('resPoison', 45)] },
        { count: 3, mods: [r('cbf', 1)] },
      ],
    },
    s_berserkers_headgear: {
      partial: [
        { count: 2, mods: [r('attackRatingPerLvl', 8)] },
        { count: 3, mods: [r('barSkills', 1)] },
      ],
    },
    s_berserkers_hauberk: {
      mods: [r('barSkills', 1), r('mdr', 2)],
      partial: [
        { count: 2, mods: [r('defPerLvl', 4.5)] },
        { count: 3, mods: [r('edMaxPctPerLvl', 3)] },
      ],
    },
    s_berserkers_hatchet: {
      partial: [
        { count: 2, mods: [r('edPct', 50)] },
        { count: 3, mods: [r('maxDmgPerLvl', 1)] },
      ],
    },
    s_deaths_hand: {
      mods: [r('resPoison', 50), r('poisonLength', 45)],
      partial: [
        { count: 2, mods: [r('ias', 30)] },
        { count: 3, mods: [r('maxDmgPerLvl', 0.5)] },
      ],
    },
    s_deaths_touch: {
      mods: [r('edPct', 60, 90), r('lifeLeech', 4)],
      partial: [
        { count: 2, mods: [r('addColdMin', 25), r('addColdMax', 75)] },
        { count: 3, mods: [r('reanimateReturned', 15)] },
      ],
    },
    s_angelic_sickle: {
      mods: [r('maxDmg', 12), r('attackRating', 75), r('dmgUndeadPct', 250)],
      partial: [
        { count: 2, mods: [r('edPct', 75)] },
        { count: 3, mods: [r('ias', 30)] },
        { count: 4, mods: [r('procHit', 10, 10, 'fist_of_the_heavens:1')] },
      ],
    },
    s_angelic_mantle: { mods: [r('dmgUndeadPct', 50, 80), r('defPct', 40), r('drFlat', 3)] },
    s_angelic_halo: { mods: [r('life', 20), r('lifeRegen', 6)] },
    s_angelic_wings: { mods: [r('dmgToMana', 20), r('lightRadius', 3)] },
    s_arctic_horn: { mods: [r('edPct', 50), r('arPct', 20), r('maxColdPerLvl', 2)] },
    s_arctic_binding: { mods: [r('defFlat', 30), r('resCold', 40)] },
    s_arctic_mitts: {
      mods: [r('ias', 10), r('life', 20)],
      partial: [
        { count: 2, mods: [r('attackRating', 50), r('pierceChance', 25)] },
        { count: 3, mods: [r('dex', 10)] },
      ],
    },
    s_arcannas_sign: {
      mods: [r('mana', 35), r('manaRegenPct', 20)],
      partial: [
        { count: 2, mods: [r('mf', 50)] },
        { count: 3, mods: [r('resFire', 30)] },
      ],
    },
    s_arcannas_deathwand: {
      mods: [r('sorcSkills', 1), r('fcr', 10), r('edPct', 50, 75), r('deadlyStrike', 25, 50), r('dmgUndeadPct', 50), r('procCast', 15, 15, 'bone_spear:2')],
      partial: [
        { count: 2, mods: [r('mana', 75)] },
        { count: 3, mods: [r('manaRegenPct', 20)] },
        { count: 4, mods: [r('ias', 40)] },
      ],
    },
    s_arcannas_head: {
      mods: [r('lifeRegen', 10, 14), r('mana', 30, 40), r('manaRegenPct', 20), r('thornsFlat', 12)],
      partial: [
        { count: 2, mods: [r('defPerLvl', 3)] },
        { count: 3, mods: [r('resLight', 25)] },
      ],
    },
    s_arcannas_flesh: {
      mods: [r('fcr', 10), r('drFlat', 3, 6), r('lightRadius', 2)],
      partial: [
        { count: 2, mods: [r('defFlat', 100)] },
        { count: 3, mods: [r('ene', 20)] },
        { count: 4, mods: [r('manaRegenPct', 20)] },
      ],
    },
    s_natalyas_totem: { mods: [r('defFlat', 135, 175), r('str', 10, 20), r('dex', 20, 30), r('resAll', 10, 20), r('mdr', 3, 6)], partial: [{ count: 2, mods: [r('ene', 20)] }] },
    s_natalyas_mark: {
      mods: [r('ias', 40), r('edPct', 150, 200), r('dmgDemonPct', 100, 200), r('dmgUndeadPct', 100, 200), r('addFireMin', 96), r('addFireMax', 136), r('addColdMin', 150), r('addColdMax', 150)],
      partial: [{ count: 3, mods: [r('ignoreDef', 1)] }],
    },
    s_natalyas_shadow: {
      mods: [r('asnShadowSkills', 2, 3), r('defFlat', 150, 225), r('lifePerLvl', 1.5), r('resPoison', 25), r('poisonLength', 75), r('socketsAdded', 1, 3)],
      partial: [{ count: 3, mods: [r('asnSkills', 1)] }],
    },
    s_natalyas_soul: { mods: [r('frw', 40), r('defFlat', 75, 125), r('resCold', 15, 25), r('resLight', 15, 25)], partial: [{ count: 3, mods: [r('kickDmg', 30)] }] },
    s_aldurs_stony_gaze: { mods: [r('summonSkills', 1, 2), r('druidSkills', 1, 2), r('fhr', 25), r('defFlat', 90), r('manaRegenPct', 17), r('resCold', 40, 50), r('lightRadius', 5)] },
    s_aldurs_deception: { mods: [r('eleSkills', 1, 2), r('shapeSkills', 1, 2), r('defFlat', 300), r('str', 20), r('dex', 15), r('resLight', 40, 50), r('reqPct', 50)] },
    s_aldurs_gauntlet: {
      mods: [
        r('ias', 45),
        r('minDmg', 40),
        r('maxDmg', 62),
        r('dmgDemonPct', 200, 250),
        r('dmgUndeadPct', 150, 250),
        r('addLightMin', 50),
        r('addLightMax', 75),
        r('manaLeech', 5),
        r('lifeLeech', 10),
        r('socketsAdded', 2, 3),
      ],
    },
    s_aldurs_advance: { mods: [r('indestructible', 1), r('frw', 40), r('dmgToMana', 10), r('life', 50), r('resFire', 40, 50)] },
    s_immortal_kings_will: {
      mods: [r('barWarcrySkills', 2), r('defFlat', 125), r('gf', 37, 67), r('mf', 25, 40), r('lightRadius', 4), r('socketsAdded', 2)],
      partial: [{ count: 3, mods: [r('dr', 8)] }],
    },
    s_immortal_kings_soul_cage: { mods: [r('procGetHit', 5, 5, 'enchant:28'), r('barCombatSkills', 3, 4), r('defFlat', 300, 550), r('resPoison', 40, 60)] },
    s_immortal_kings_detail: { mods: [r('defFlat', 28, 56), r('str', 20, 25), r('resLight', 26, 33), r('resFire', 23, 28)] },
    s_immortal_kings_forge: { mods: [r('procGetHit', 12, 12, 'charged_bolt:24'), r('defFlat', 45, 90), r('str', 20), r('dex', 20)] },
    s_immortal_kings_pillar: { mods: [r('frw', 40), r('attackRating', 90, 140), r('defFlat', 50, 85), r('life', 38, 54)] },
    s_immortal_kings_stone_crusher: {
      mods: [r('indestructible', 1), r('ias', 45), r('edPct', 175, 225), r('dmgDemonPct', 175, 225), r('dmgUndeadPct', 175, 225), r('crushingBlow', 35, 40)],
      partial: [
        { count: 2, mods: [r('addFireMin', 211), r('addFireMax', 397)] },
        { count: 3, mods: [r('addLightMin', 7), r('addLightMax', 477)] },
        { count: 4, mods: [r('addColdMin', 127), r('addColdMax', 364)] },
        { count: 5, mods: [r('poisonDmg', 682)] },
        { count: 6, mods: [r('addMagicMin', 250), r('addMagicMax', 361)] },
      ],
    },
    s_tal_rashas_fire_spun_cloth: { mods: [r('dex', 20), r('mana', 20, 40), r('dmgToMana', 37), r('mf', 10, 20), r('reqPct', 20)] },
    s_tal_rashas_adjudication: { mods: [r('sorcSkills', 2), r('addLightMin', 3), r('addLightMax', 32), r('life', 40, 60), r('mana', 32, 52), r('resLight', 33)] },
    s_tal_rashas_lidless_eye: {
      mods: [r('fcr', 30), r('oskill', 2, 3, 'fire_mastery'), r('oskill', 2, 3, 'lightning_mastery'), r('oskill', 2, 3, 'cold_mastery'), r('ene', 10), r('life', 57), r('mana', 77)],
    },
    s_tal_rashas_howling_wind: { mods: [r('defFlat', 400), r('resCold', 40), r('resLight', 40), r('resFire', 40), r('mdr', 12, 18), r('mf', 70, 90), r('reqPct', 60)] },
    s_tal_rashas_horadric_crest: { mods: [r('manaLeech', 6, 10), r('lifeLeech', 6, 10), r('defFlat', 45), r('life', 50, 65), r('mana', 25, 35), r('resAll', 10, 20)] },
    s_griswolds_valor: { mods: [r('defPct', 50, 75), r('resAll', 15, 25), r('mf', 30, 50), r('reqPct', 40), r('socketsAdded', 2, 3), r('absorbColdPerLvl', 0.25)] },
    s_griswolds_heart: { mods: [r('palSkills', 1, 2), r('defFlat', 500), r('str', 10, 20), r('reqPct', 40), r('socketsAdded', 2, 3)], partial: [{ count: 2, mods: [r('fcr', 30)] }] },
    s_griswoldss_redemption: { mods: [r('ias', 40), r('edPct', 200, 240), r('dmgUndeadPct', 250), r('reqPct', 20), r('socketsAdded', 3, 5)] },
    s_griswolds_honor: {
      mods: [r('palDefenseSkills', 2), r('fcr', 35), r('block', 20), r('defFlat', 108), r('resAll', 35, 45), r('socketsAdded', 2, 3), r('fbr', 65)],
      partial: [{ count: 2, mods: [r('fhr', 30)] }],
    },
    s_trang_ouls_guise: { mods: [r('fhr', 25), r('defFlat', 80, 100), r('lifeRegen', 20, 30), r('mana', 150), r('thornsFlat', 420, 620)], partial: [{ count: 2, mods: [r('fcr', 30)] }] },
    s_trang_ouls_scales: {
      mods: [r('necSummonSkills', 2), r('frw', 40), r('oskill', 2, 3, 'blood_warp'), r('defPct', 150), r('resPoison', 40), r('reqPct', 40), r('defMissile', 100)],
      partial: [
        { count: 3, mods: [r('resLight', 50)] },
        { count: 4, mods: [r('dr', 25)] },
      ],
    },
    s_trang_ouls_wing: {
      mods: [r('necPoisonSkills', 2), r('block', 30), r('defFlat', 125), r('str', 20, 28), r('dex', 10, 18), r('resFire', 38, 45), r('resPoison', 40)],
      partial: [{ count: 3, mods: [r('piercePoison', 25)] }],
    },
    s_trang_ouls_claws: { mods: [r('necCurseSkills', 2), r('fcr', 20), r('poisonDmgPct', 10, 15), r('defFlat', 30), r('resCold', 30)], partial: [{ count: 4, mods: [r('oskill', 20, 20, 'meteor')] }] },
    s_trang_ouls_girth: { mods: [r('defFlat', 75, 100), r('life', 56, 76), r('lifeRegen', 5, 10), r('mana', 25, 50), r('cbf', 1), r('reqPct', 40)] },
    s_mavinas_true_sight: {
      mods: [r('ias', 30), r('defFlat', 150), r('lifeRegen', 5, 15), r('mana', 25, 45)],
      partial: [
        { count: 2, mods: [r('allSkills', 1)] },
        { count: 3, mods: [r('arPct', 50)] },
        { count: 4, mods: [r('resAll', 25)] },
        { count: 5, mods: [r('fireDmgPct', 5)] },
      ],
    },
    s_mavinas_embrace: {
      mods: [r('procGetHit', 10, 10, 'glacial_spike:13'), r('amzSkills', 1, 2), r('defPerLvl', 4), r('defFlat', 350), r('mdr', 5, 12), r('reqPct', 30)],
      partial: [
        { count: 2, mods: [r('frw', 30)] },
        { count: 3, mods: [r('fhr', 30)] },
      ],
    },
    s_mavinas_icy_clutch: {
      mods: [r('addColdMin', 12), r('addColdMax', 36), r('defFlat', 45, 50), r('str', 8, 12), r('dex', 10, 20), r('cbf', 1), r('gf', 56)],
      partial: [
        { count: 4, mods: [r('addColdMin', 131), r('addColdMax', 252)] },
        { count: 5, mods: [r('coldDmgPct', 5)] },
      ],
    },
    s_mavinas_tenet: { mods: [r('frw', 20), r('manaLeech', 3, 6), r('defFlat', 50), r('lightRadius', 5)] },
    s_mavinas_caster: {
      mods: [r('ias', 40), r('edPct', 230, 288), r('attackRating', 50, 150)],
      partial: [
        { count: 3, mods: [r('procHit', 10, 10, 'nova:25')] },
        { count: 4, mods: [r('amzBowSkills', 2)] },
        { count: 2, mods: [r('addMagicMin', 228), r('addMagicMax', 754)] },
      ],
    },
    s_telling_of_beads: { mods: [r('allSkills', 1), r('resCold', 18), r('resPoison', 35, 50), r('thornsFlat', 24, 30)], partial: [{ count: 3, mods: [r('mana', 100)] }] },
    s_laying_of_hands: {
      mods: [r('procHit', 10, 10, 'holy_bolt:13'), r('ias', 20), r('dmgDemonPct', 150, 200), r('defFlat', 25, 50), r('resFire', 30, 50)],
      partial: [{ count: 2, mods: [r('poisonDmg', 220)] }],
    },
    s_rite_of_passage: { mods: [r('frw', 30), r('defFlat', 25), r('cbf', 1)], partial: [{ count: 3, mods: [r('fhr', 20)] }] },
    s_spiritual_custodian: {
      mods: [r('procGetHit', 25, 25, 'nova:23'), r('dmgUndeadPct', 200, 250), r('poisonDmg', 480, 680), r('defFlat', 305, 415), r('resFire', 40, 55)],
      partial: [{ count: 3, mods: [r('procGetHit', 5, 5, 'bone_armor:18')] }],
    },
    s_credendum: { partial: [{ count: 3, mods: [r('fhr', 20)] }] },
    s_dangoons_teaching: {
      mods: [r('procHit', 33, 33, 'frost_nova:31'), r('ias', 40), r('maxDmgPerLvl', 1.5), r('addFireMin', 40, 60), r('addFireMax', 70, 100), r('dmgUndeadPct', 50)],
      partial: [{ count: 3, mods: [r('allSkills', 2)] }],
    },
    s_heavens_taebaek: {
      mods: [r('indestructible', 1), r('fcr', 40), r('block', 25), r('defFlat', 300, 500), r('mana', 100, 120), r('resLight', 25, 30), r('thornsFlat', 380, 560), r('fbr', 30)],
      partial: [{ count: 3, mods: [r('allSkills', 1)] }],
    },
    s_haemosus_adament: {
      mods: [r('allSkills', 1), r('defFlat', 500), r('life', 50, 100), r('reqPct', 20), r('defMelee', 200, 250), r('defMissile', 200, 250)],
      partial: [{ count: 2, mods: [r('fcr', 20)] }],
    },
    s_ondals_almighty: {
      mods: [r('procHit', 10, 10, 'weaken:13'), r('allSkills', 1, 2), r('fhr', 24), r('defFlat', 50, 150), r('str', 10, 15), r('dex', 10, 20), r('reqPct', 15)],
      partial: [{ count: 2, mods: [r('fcr', 20)] }],
    },
    s_guillaumes_face: { mods: [r('fhr', 30), r('crushingBlow', 35), r('deadlyStrike', 15), r('defPct', 120), r('str', 15)], partial: [{ count: 3, mods: [r('reduceDef', 20)] }] },
    s_wilhelms_pride: { mods: [r('manaLeech', 4, 6), r('lifeLeech', 4, 6), r('defPct', 75), r('resCold', 10, 20)], partial: [{ count: 3, mods: [r('dmgDemonPct', 150)] }] },
    s_magnus_skin: {
      mods: [r('ias', 20), r('attackRating', 100), r('defPct', 50), r('resFire', 15), r('lightRadius', 3), r('pierceChance', 20)],
      partial: [{ count: 3, mods: [r('dmgUndeadPct', 150)] }],
    },
    s_wihtstans_guard: { mods: [r('block', 55), r('defPct', 175), r('lightRadius', 5), r('fbr', 40), r('halfFreeze', 1)], partial: [{ count: 3, mods: [r('edPct', 150)] }] },
    s_hwanins_splendor: { mods: [r('attackRating', 200, 350), r('defPct', 100, 150), r('lifeRegen', 30, 40), r('resCold', 37), r('mdr', 10)] },
    s_hwanins_refuge: { mods: [r('procGetHit', 20, 20, 'static_field:9'), r('defFlat', 200), r('life', 100), r('resPoison', 27)] },
    s_hwanins_seal: { mods: [r('addLightMin', 3), r('addLightMax', 330), r('defPerLvl', 1.5), r('absorbLight', 4, 6), r('dmgToMana', 12)] },
    s_hwanins_justice: {
      mods: [r('procHit', 10, 10, 'ice_blast:3'), r('indestructible', 1), r('ias', 40), r('edPct', 200, 250), r('attackRating', 330), r('addLightMin', 5), r('addLightMax', 25)],
      partial: [{ count: 2, mods: [r('procHit', 20, 20, 'static_field:16')] }],
    },
    s_sazabis_cobalt_redeemer: {
      mods: [r('indestructible', 1), r('ias', 40), r('edPct', 150, 250), r('dmgDemonPct', 318), r('addColdMin', 175), r('addColdMax', 250), r('str', 5), r('dex', 15), r('lifePerKill', 10, 14)],
    },
    s_sazabis_ghost_liberator: {
      mods: [r('fhr', 30), r('dmgDemonPct', 100, 150), r('defFlat', 400), r('str', 25), r('life', 50, 75), r('arDemon', 300)],
      partial: [{ count: 2, mods: [r('lifeRegen', 30)] }],
    },
    s_sazabis_mental_sheath: { mods: [r('allSkills', 1), r('defFlat', 100), r('lifeRegen', 15), r('resLight', 15, 20), r('resFire', 15, 20)] },
    s_bul_kathos_sacred_charge: { mods: [r('ias', 20), r('edPct', 200, 250), r('crushingBlow', 35), r('resAll', 20)], partial: [{ count: 2, mods: [r('ias', 30)] }] },
    s_bul_kathos_tribal_guardian: { mods: [r('ias', 20), r('edPct', 225, 275), r('poisonDmg', 500), r('str', 20), r('resCold', 50)], partial: [{ count: 2, mods: [r('deadlyStrike', 20)] }] },
    s_cow_kings_horns: { mods: [r('allSkills', 1), r('defFlat', 75), r('cbf', 1), r('thornsFlat', 10), r('dmgToMana', 35)] },
    s_cow_kings_hide: { mods: [r('procGetHit', 18, 18, 'chain_lightning:5'), r('defPct', 60), r('life', 30), r('resAll', 15, 25)] },
    s_cow_kings_hoofs: { mods: [r('frw', 30), r('addFireMin', 25), r('addFireMax', 35), r('defFlat', 25, 35), r('dex', 20), r('mf', 25)] },
    s_najs_puzzler: { mods: [r('allSkills', 3), r('fcr', 50), r('edPct', 150), r('addLightMin', 6), r('addLightMax', 450), r('ene', 35), r('mana', 70), r('dmgUndeadPct', 50)] },
    s_najs_light_plate: { mods: [r('allSkills', 1), r('defFlat', 300), r('life', 65), r('resAll', 25), r('dmgToMana', 45), r('reqPct', 60)], partial: [{ count: 2, mods: [r('fcr', 20)] }] },
    s_najs_circlet: {
      mods: [r('procGetHit', 12, 12, 'chain_lightning:5'), r('fcr', 20), r('addFireMin', 25), r('addFireMax', 35), r('defFlat', 75), r('str', 15), r('lightRadius', 5)],
      partial: [{ count: 2, mods: [r('allSkills', 1)] }],
    },
    s_mcauleys_taboo: { mods: [r('ias', 20), r('poisonDmg', 27, 33), r('defFlat', 20, 25), r('life', 40)] },
    s_mcauleys_superstition: {
      mods: [r('fcr', 20), r('edPct', 75), r('addColdMin', 25), r('addColdMax', 75), r('manaLeech', 8), r('mana', 25), r('dmgUndeadPct', 50)],
      partial: [{ count: 2, mods: [r('allSkills', 2), r('splashDmg', 1)] }],
    },
  },
  add: [
    {
      entry: {
        id: 's_infernal_cranium',
        name: 'Crâne infernal',
        set: 'set_infernal_tools',
        base: 'cap',
        lvl: 7,
        reqLvl: 3,
        rarity: 7,
        mods: [r('resAll', 10), r('dmgToMana', 20)],
        partial: [{ count: 2, mods: [r('defPerLvl', 4)] }],
      },
      after: 's_mcauleys_superstition',
    },
    {
      entry: {
        id: 's_sanders_paragon',
        name: 'Parangon de Sander',
        set: 'set_mcauleys_folly',
        base: 'cap',
        lvl: 20,
        reqLvl: 25,
        rarity: 7,
        mods: [r('defPerLvl', 1), r('thornsFlat', 8), r('mf', 35, 70)],
      },
      after: 's_infernal_cranium',
    },
    {
      entry: {
        id: 's_bul_kathos_death_band',
        name: 'Anneau mortel de Bul-Kathos',
        set: 'set_bul_kathos_children',
        base: 'ring',
        lvl: 50,
        reqLvl: 69,
        rarity: 7,
        mods: [r('edPct', 20, 30), r('attackRating', 100), r('resLight', 15, 25), r('dr', 6, 8)],
        partial: [{ count: 2, mods: [r('cbf', 1)] }],
      },
      after: 's_sanders_paragon',
    },
  ],
  remove: ['s_infernal_cranium', 's_sanders_paragon'],
};

/** Registre `sets` : 32 entrée(s) patchée(s) */
export const PD2_SETS_PATCH: TablePatch<SetDef> = {
  patch: {
    set_civerbs_vestments: {
      bonuses: [
        { count: 2, mods: [r('resFire', 25)] },
        { count: 3, mods: [r('dmgUndeadPct', 100), r('str', 15), r('resLight', 25), r('dr', 10)] },
      ],
    },
    set_hsarus_defense: {
      bonuses: [
        { count: 2, mods: [r('thornsFlat', 9)] },
        { count: 3, mods: [r('maxDmg', 5), r('resLight', 25), r('cbf', 1)] },
      ],
    },
    set_cleglaws_brace: {
      bonuses: [
        { count: 2, mods: [r('defense', 50)] },
        { count: 3, mods: [r('defense', 50), r('ias', 20), r('manaLeech', 6), r('crushingBlow', 35)] },
      ],
    },
    set_irathas_finery: {
      bonuses: [
        { count: 2, mods: [r('defFlat', 50)] },
        { count: 3, mods: [r('frw', 20)] },
        { count: 4, mods: [r('dex', 15), r('maxResPoison', 2), r('maxResCold', 2), r('maxResLight', 2), r('maxResFire', 2), r('resAll', 20)] },
      ],
    },
    set_isenharts_armory: {
      bonuses: [
        { count: 2, mods: [r('str', 10)] },
        { count: 3, mods: [r('dex', 10)] },
        { count: 4, mods: [r('frw', 20), r('block', 30), r('arPct', 35), r('lifeLeech', 5), r('resAll', 10)] },
      ],
    },
    set_vidalas_rig: {
      bonuses: [
        { count: 2, mods: [r('attackRating', 75)] },
        { count: 3, mods: [r('dex', 15)] },
        { count: 4, mods: [r('addColdMin', 15), r('addColdMax', 20), r('freezeTarget', 1), r('str', 10), r('pierceChance', 30)] },
      ],
    },
    set_milabregas_regalia: {
      bonuses: [
        { count: 2, mods: [r('attackRating', 75)] },
        { count: 3, mods: [r('attackRating', 125)] },
        { count: 4, mods: [r('palSkills', 2), r('manaLeech', 10), r('lifeLeech', 8), r('resPoison', 15)] },
      ],
    },
    set_cathans_traps: {
      bonuses: [
        { count: 2, mods: [r('addFireMin', 15), r('addFireMax', 20)] },
        { count: 5, mods: [r('fcr', 10), r('ias', 40), r('mana', 20), r('resAll', 25), r('mdr', 3), r('asnTrapSkills', 2)] },
      ],
    },
    set_tancreds_battlegear: {
      bonuses: [
        { count: 2, mods: [r('resAll', 10)] },
        { count: 3, mods: [r('lifeLeech', 5)] },
        { count: 4, mods: [r('slowTarget', 35)] },
        { count: 5, mods: [r('gf', 75), r('maxLightDmgPerLvl', 0.75)] },
      ],
    },
    set_sigons_complete_steel: {
      bonuses: [
        { count: 2, mods: [r('lifeLeech', 10)] },
        { count: 3, mods: [r('defense', 100)] },
        { count: 6, mods: [r('addFireMax', 24), r('mana', 20), r('resFire', 12), r('drFlat', 7), r('thornsFlat', 12)] },
      ],
    },
    set_infernal_tools: {
      items: ['s_infernal_torch', 's_infernal_sign', 's_infernal_cranium'],
      bonuses: [
        { count: 2, mods: [r('fhr', 20), r('manaPerKill', 3)] },
        { count: 3, mods: [r('necSkills', 1), r('arPct', 20), r('manaLeech', 6), r('poisonDmg', 12)] },
      ],
    },
    set_berserkers_garb: {
      bonuses: [
        { count: 2, mods: [r('life', 50)] },
        { count: 3, mods: [r('poisonDmg', 13, 17), r('defense', 75), r('poisonLength', 75), r('barSkills', 1), r('frw', 20)] },
      ],
    },
    set_deaths_disguise: {
      bonuses: [
        { count: 2, mods: [r('lifeLeech', 8)] },
        { count: 3, mods: [r('minDmg', 10), r('arPct', 40), r('resAll', 25)] },
      ],
    },
    set_angelical_raiment: {
      bonuses: [
        { count: 2, mods: [r('dex', 10)] },
        { count: 3, mods: [r('mana', 50)] },
        { count: 4, mods: [r('manaRegenPct', 8), r('resAll', 25), r('cbf', 1), r('mf', 40)] },
      ],
    },
    set_arctic_gear: {
      bonuses: [
        { count: 2, mods: [r('str', 5)] },
        { count: 3, mods: [r('life', 50)] },
        { count: 4, mods: [r('addColdMin', 6), r('addColdMax', 14), r('cbf', 1), r('pierceChance', 30)] },
      ],
    },
    set_arcannas_tricks: {
      bonuses: [
        { count: 2, mods: [r('mana', 25)] },
        { count: 3, mods: [r('life', 50)] },
        { count: 4, mods: [r('mana', 25), r('fcr', 30), r('manaLeech', 5), r('allSkills', 1)] },
      ],
    },
    set_natalyas_odium: {
      bonuses: [
        { count: 2, mods: [r('mdr', 12)] },
        { count: 3, mods: [r('defense', 200)] },
        { count: 4, mods: [r('asnSkills', 2), r('lifeLeech', 8), r('manaLeech', 8), r('defense', 150), r('resAll', 40), r('dr', 20), r('extraShadow', 1)] },
      ],
    },
    set_aldurs_watchtower: {
      bonuses: [
        { count: 2, mods: [r('arPct', 150), r('fcr', 10)] },
        { count: 3, mods: [r('mf', 50), r('fcr', 20)] },
        { count: 4, mods: [r('druidSkills', 3), r('edPct', 350), r('manaLeech', 10), r('defense', 150), r('mana', 150), r('resAll', 50), r('ene', 15)] },
      ],
    },
    set_immortal_king: {
      bonuses: [
        { count: 2, mods: [r('attackRating', 50)] },
        { count: 3, mods: [r('attackRating', 75)] },
        { count: 4, mods: [r('attackRating', 125)] },
        { count: 5, mods: [r('attackRating', 200)] },
        { count: 6, mods: [r('barSkills', 3), r('edPct', 100), r('life', 150), r('resAll', 50), r('mdr', 10), r('splashRadius', 20)] },
      ],
    },
    set_tal_rashas_wrappings: {
      bonuses: [
        { count: 2, mods: [r('lifeRegen', 10)] },
        { count: 3, mods: [r('mf', 50)] },
        { count: 4, mods: [r('fhr', 25)] },
        { count: 5, mods: [r('sorcSkills', 3), r('defense', 150), r('life', 150), r('resAll', 50), r('defMissile', 50)] },
      ],
    },
    set_griswolds_legacy: {
      bonuses: [
        { count: 2, mods: [r('str', 20)] },
        { count: 3, mods: [r('dex', 30)] },
        { count: 4, mods: [r('palSkills', 3), r('attackRating', 200), r('life', 150), r('resAll', 50), r('fcr', 20)] },
      ],
    },
    set_trang_ouls_avatar: {
      bonuses: [
        { count: 2, mods: [r('oskill', 18, 18, 'fire_ball'), r('manaRegenPct', 20)] },
        { count: 3, mods: [r('oskill', 26, 26, 'fire_wall'), r('manaRegenPct', 15)] },
        { count: 4, mods: [r('oskill', 10, 10, 'fire_ball')] },
        { count: 5, mods: [r('manaRegenPct', 15), r('necSkills', 3), r('lifeLeech', 20), r('lifeRegen', 10), r('mana', 100), r('resAll', 50)] },
      ],
    },
    set_mavinas_battle_hymn: {
      bonuses: [
        { count: 2, mods: [r('str', 20)] },
        { count: 3, mods: [r('dex', 30)] },
        { count: 5, mods: [r('amzSkills', 2), r('attackRating', 100), r('defense', 100), r('resAll', 50), r('mf', 100)] },
      ],
    },
    set_the_disciple: {
      bonuses: [
        { count: 2, mods: [r('defense', 150)] },
        { count: 4, mods: [r('str', 10)] },
        { count: 5, mods: [r('allSkills', 2), r('resAll', 50), r('dmgDemonPct', 150), r('dmgUndeadPct', 150)] },
      ],
    },
    set_heavens_brethren: {
      bonuses: [
        { count: 3, mods: [r('lifeRegen', 30)] },
        { count: 4, mods: [r('lifeRegen', 40), r('allSkills', 2), r('resAll', 50), r('cbf', 1), r('lightRadius', 5), r('fcr', 20)] },
      ],
    },
    set_orphans_call: {
      bonuses: [
        { count: 2, mods: [r('life', 50)] },
        { count: 3, mods: [r('thornsFlat', 250)] },
        { count: 4, mods: [r('life', 100), r('defense', 100), r('str', 20), r('dex', 10), r('resAll', 30), r('mf', 80)] },
      ],
    },
    set_hwanins_majesty: {
      bonuses: [
        { count: 2, mods: [r('lifeLeech', 10)] },
        { count: 3, mods: [r('frw', 30)] },
        { count: 4, mods: [r('allSkills', 2), r('lifeLeech', 10), r('resAll', 30), r('defense', 300), r('dmgDemonPct', 100)] },
      ],
    },
    set_sazabis_grand_tribute: {
      bonuses: [
        { count: 2, mods: [r('frw', 40), r('fcr', 40)] },
        { count: 3, mods: [r('lifeLeech', 15), r('lifePct', 27), r('resAll', 30), r('allSkills', 2)] },
      ],
    },
    set_bul_kathos_children: {
      items: ['s_bul_kathos_sacred_charge', 's_bul_kathos_tribal_guardian', 's_bul_kathos_death_band'],
      bonuses: [
        {
          count: 3,
          mods: [
            r('allSkills', 2),
            r('attackRating', 200),
            r('dmgDemonPct', 200),
            r('dmgUndeadPct', 200),
            r('addFireMin', 200),
            r('addFireMax', 200),
            r('defense', 500),
            r('crushingBlow', 25),
            r('deadlyStrike', 25),
          ],
        },
      ],
    },
    set_cow_kings_leathers: {
      bonuses: [
        { count: 2, mods: [r('resPoison', 25)] },
        { count: 3, mods: [r('procGetHit', 25, 25, 'static_field:18'), r('ias', 30), r('str', 20), r('gf', 100), r('mf', 100)] },
      ],
    },
    set_najs_ancient_set: {
      bonuses: [
        { count: 2, mods: [r('defense', 175)] },
        { count: 3, mods: [r('allSkills', 1), r('str', 20), r('dex', 15), r('lifeRegen', 10), r('mana', 100), r('resAll', 50)] },
      ],
    },
    set_mcauleys_folly: {
      items: ['s_mcauleys_riprap', 's_mcauleys_taboo', 's_mcauleys_superstition', 's_sanders_paragon'],
      bonuses: [
        { count: 2, mods: [r('defense', 50)] },
        { count: 3, mods: [r('attackRating', 75)] },
        { count: 4, mods: [r('allSkills', 1), r('lifeLeech', 4), r('mana', 50), r('mf', 50)] },
      ],
    },
  },
};
