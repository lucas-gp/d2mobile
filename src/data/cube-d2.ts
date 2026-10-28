// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Recettes du Cube horadrique de Diablo II LoD 1.13c construites depuis CubeMain.txt (recettes actives d'une partie solo de l'extension :
 * `enabled`, hors `ladder`) : amélioration des runes et artisanat. Généré par tools/vanilla/gen.ts (`npm run vanilla -- cube --write`)
 * depuis les MPQ du joueur : ne pas modifier à la main. Les recettes de la base (src/data/cube.ts) en sont construites ; les autres recettes
 * de la base sont contrôlées contre la table par tests/unit/vanilla-cube.test.ts. Module feuille.
 */
import type { StatRoll } from './types';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

/** Amélioration des runes : rune, nombre, gemme en plus (à partir de Thul), rune obtenue */
export const D2_RUNE_UPGRADES: readonly { from: string; n: number; gem?: string; to: string }[] = [
  { from: 'r01', n: 3, to: 'r02' },
  { from: 'r02', n: 3, to: 'r03' },
  { from: 'r03', n: 3, to: 'r04' },
  { from: 'r04', n: 3, to: 'r05' },
  { from: 'r05', n: 3, to: 'r06' },
  { from: 'r06', n: 3, to: 'r07' },
  { from: 'r07', n: 3, to: 'r08' },
  { from: 'r08', n: 3, to: 'r09' },
  { from: 'r09', n: 3, to: 'r10' },
  { from: 'r10', n: 3, gem: 'gem_topaz_0', to: 'r11' },
  { from: 'r11', n: 3, gem: 'gem_amethyst_0', to: 'r12' },
  { from: 'r12', n: 3, gem: 'gem_sapphire_0', to: 'r13' },
  { from: 'r13', n: 3, gem: 'gem_ruby_0', to: 'r14' },
];

/**
 * Artisanat : famille → emplacement → rune et gemme parfaite de la recette, objets acceptés (bases du jeu : celle de la recette et ses
 * versions exceptionnelle et élite ; ou codes `d2:` d'ItemTypes.txt), propriétés fixes de l'objet d'artisan
 */
export const D2_CRAFTS: Readonly<Record<string, Readonly<Record<string, { rune: string; gem: string; accept: readonly string[]; mods: readonly StatRoll[] }>>>> = {
  hitpower: {
    helm: { rune: 'r06', gem: 'gem_sapphire_4', accept: ['full_helm', 'basinet', 'giant_conch'], mods: [r('procGetHit', 5, 5, 'frost_nova:4'), r('thornsFlat', 3, 7), r('defMissile', 25, 50)] },
    boots: {
      rune: 'r08',
      gem: 'gem_sapphire_4',
      accept: ['chain_boots', 'mesh_boots', 'boneweave_boots'],
      mods: [r('procGetHit', 5, 5, 'frost_nova:4'), r('thornsFlat', 3, 7), r('defMelee', 25, 60)],
    },
    gloves: { rune: 'r09', gem: 'gem_sapphire_4', accept: ['bracers_m', 'heavy_bracers', 'vambraces'], mods: [r('procGetHit', 5, 5, 'frost_nova:4'), r('thornsFlat', 3, 7), r('knockback', 1)] },
    belt: { rune: 'r07', gem: 'gem_sapphire_4', accept: ['heavy_belt', 'battle_belt', 'troll_belt'], mods: [r('procGetHit', 5, 5, 'frost_nova:4'), r('thornsFlat', 3, 7), r('dmgToMana', 5, 10)] },
    shield: { rune: 'r05', gem: 'gem_sapphire_4', accept: ['gothic_shield', 'ancient_shield', 'ward'], mods: [r('procGetHit', 5, 5, 'frost_nova:4'), r('thornsFlat', 3, 10), r('block', 5, 10)] },
    armor: { rune: 'r04', gem: 'gem_sapphire_4', accept: ['field_plate', 'sharktooth_armor', 'kraken_shell'], mods: [r('procGetHit', 5, 5, 'frost_nova:4'), r('thornsFlat', 3, 10), r('fhr', 10, 20)] },
    amulet: { rune: 'r10', gem: 'gem_sapphire_4', accept: ['d2:amul'], mods: [r('procGetHit', 5, 5, 'frost_nova:4'), r('thornsFlat', 3, 10), r('fleeChance', 4, 12)] },
    ring: { rune: 'r11', gem: 'gem_sapphire_4', accept: ['d2:ring'], mods: [r('procGetHit', 5, 5, 'frost_nova:4'), r('thornsFlat', 3, 6), r('dex', 1, 5)] },
    weapon: { rune: 'r03', gem: 'gem_sapphire_4', accept: ['d2:blun'], mods: [r('procGetHit', 5, 5, 'frost_nova:4'), r('thornsFlat', 3, 7), r('edPct', 35, 60)] },
  },
  blood: {
    helm: { rune: 'r08', gem: 'gem_ruby_4', accept: ['helm', 'casque', 'armet'], mods: [r('lifeLeech', 1, 3), r('life', 10, 20), r('deadlyStrike', 5, 10)] },
    boots: { rune: 'r05', gem: 'gem_ruby_4', accept: ['light_plate_boots', 'battle_boots', 'mirrored_boots'], mods: [r('lifeLeech', 1, 3), r('life', 10, 20), r('lifeRegen', 5, 10)] },
    gloves: { rune: 'r04', gem: 'gem_ruby_4', accept: ['heavy_gloves', 'sharkskin_gloves', 'vampirebone_gloves'], mods: [r('lifeLeech', 1, 3), r('life', 10, 20), r('crushingBlow', 5, 10)] },
    belt: { rune: 'r07', gem: 'gem_ruby_4', accept: ['belt_m', 'mesh_belt', 'mithril_coil'], mods: [r('lifeLeech', 1, 3), r('life', 10, 20), r('openWounds', 5, 10)] },
    shield: { rune: 'r06', gem: 'gem_ruby_4', accept: ['spiked_shield', 'barbed_shield', 'blade_barrier'], mods: [r('lifeLeech', 1, 3), r('life', 10, 20), r('thornsFlat', 4, 7)] },
    armor: { rune: 'r10', gem: 'gem_ruby_4', accept: ['plate_mail', 'templar_coat', 'hellforged_plate'], mods: [r('lifeLeech', 1, 3), r('life', 10, 20)] },
    amulet: { rune: 'r11', gem: 'gem_ruby_4', accept: ['d2:amul'], mods: [r('lifeLeech', 1, 4), r('life', 10, 20), r('frw', 5, 10)] },
    ring: { rune: 'r12', gem: 'gem_ruby_4', accept: ['d2:ring'], mods: [r('lifeLeech', 1, 3), r('life', 10, 20), r('str', 1, 5)] },
    weapon: { rune: 'r09', gem: 'gem_ruby_4', accept: ['d2:axe'], mods: [r('lifeLeech', 1, 4), r('life', 10, 20), r('edPct', 35, 60)] },
  },
  caster: {
    helm: { rune: 'r04', gem: 'gem_amethyst_4', accept: ['mask', 'death_mask', 'demonhead'], mods: [r('manaRegenPct', 4, 10), r('mana', 10, 20), r('manaLeech', 1, 4)] },
    boots: { rune: 'r10', gem: 'gem_amethyst_4', accept: ['leather_boots', 'demonhide_boots', 'wyrmhide_boots'], mods: [r('manaRegenPct', 4, 10), r('mana', 10, 20), r('manaPct', 2, 5)] },
    gloves: { rune: 'r09', gem: 'gem_amethyst_4', accept: ['gloves_l', 'demonhide_gloves', 'bramble_mitts'], mods: [r('manaRegenPct', 4, 10), r('mana', 10, 20), r('manaPerKill', 1, 3)] },
    belt: { rune: 'r06', gem: 'gem_amethyst_4', accept: ['light_belt', 'sharkskin_belt', 'vampirefang_belt'], mods: [r('manaRegenPct', 4, 10), r('mana', 10, 20), r('fcr', 5, 10)] },
    shield: { rune: 'r05', gem: 'gem_amethyst_4', accept: ['small_shield', 'round_shield', 'luna'], mods: [r('manaRegenPct', 4, 10), r('mana', 10, 20), r('block', 5, 10)] },
    armor: { rune: 'r07', gem: 'gem_amethyst_4', accept: ['light_plate', 'mage_plate', 'archon_plate'], mods: [r('manaRegenPct', 4, 10), r('mana', 10, 20), r('manaPerKill', 1, 3)] },
    amulet: { rune: 'r08', gem: 'gem_amethyst_4', accept: ['d2:amul'], mods: [r('manaRegenPct', 4, 10), r('mana', 10, 20), r('fcr', 5, 10)] },
    ring: { rune: 'r11', gem: 'gem_amethyst_4', accept: ['d2:ring'], mods: [r('manaRegenPct', 4, 10), r('mana', 10, 20), r('ene', 1, 5)] },
    weapon: { rune: 'r03', gem: 'gem_amethyst_4', accept: ['d2:rod'], mods: [r('manaRegenPct', 4, 10), r('mana', 10, 20), r('manaPct', 1, 5)] },
  },
  safety: {
    helm: { rune: 'r06', gem: 'gem_emerald_4', accept: ['crown', 'grand_crown', 'corona'], mods: [r('drFlat', 1, 4), r('mdr', 1, 2), r('resLight', 5, 10), r('defPct', 10, 30)] },
    boots: { rune: 'r09', gem: 'gem_emerald_4', accept: ['plate_boots', 'war_boots', 'myrmidon_greaves'], mods: [r('drFlat', 1, 4), r('mdr', 1, 2), r('resFire', 5, 10), r('defPct', 10, 30)] },
    gloves: { rune: 'r08', gem: 'gem_emerald_4', accept: ['gaunlets_h', 'war_gauntlets', 'ogre_gauntlets'], mods: [r('drFlat', 1, 4), r('mdr', 1, 2), r('resCold', 5, 10), r('defPct', 10, 30)] },
    belt: { rune: 'r07', gem: 'gem_emerald_4', accept: ['sash_l', 'demonhide_sash', 'spiderweb_sash'], mods: [r('drFlat', 1, 4), r('mdr', 1, 2), r('resPoison', 5, 10), r('defPct', 10, 30)] },
    shield: { rune: 'r04', gem: 'gem_emerald_4', accept: ['kite_shield', 'dragon_shield', 'monarch'], mods: [r('drFlat', 1, 4), r('mdr', 1, 2), r('defPct', 10, 30)] },
    armor: { rune: 'r05', gem: 'gem_emerald_4', accept: ['breast_plate', 'cuirass', 'great_hauberk'], mods: [r('drFlat', 1, 4), r('mdr', 1, 2), r('halfFreeze', 1), r('defPct', 10, 30)] },
    amulet: { rune: 'r10', gem: 'gem_emerald_4', accept: ['d2:amul'], mods: [r('drFlat', 1, 4), r('mdr', 1, 2), r('block', 1, 10)] },
    ring: { rune: 'r11', gem: 'gem_emerald_4', accept: ['d2:ring'], mods: [r('drFlat', 1, 4), r('mdr', 1, 2), r('vit', 1, 5)] },
    weapon: { rune: 'r12', gem: 'gem_emerald_4', accept: ['d2:spea'], mods: [r('drFlat', 1, 4), r('mdr', 1, 2), r('defPct', 5, 10)] },
  },
};
