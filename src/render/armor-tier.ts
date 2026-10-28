// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Palier d'apparence du torse d'une armure (calques « lit », « med », « hvy » des personnages de Diablo II), lu dans la colonne « Torso » d'armor.txt
 * (0 léger, 1 moyen, 2 lourd ; tools/audit/gen-armor-tier.ts). Sert à choisir la planche importée du personnage.
 * Les armures absentes de la table sont légères.
 */
export type ArmorTier = 'lit' | 'med' | 'hvy';

const TIER: Record<string, ArmorTier> = {
  ancient_armor: 'hvy',
  archon_plate: 'med',
  balrog_skin: 'hvy',
  boneweave: 'med',
  breast_plate: 'hvy',
  chain_mail: 'med',
  chaos_armor: 'hvy',
  cuirass: 'hvy',
  demonhide_armor: 'med',
  diamond_mail: 'med',
  embossed_plate: 'med',
  field_plate: 'hvy',
  full_plate_mail: 'hvy',
  gothic_plate: 'med',
  great_hauberk: 'hvy',
  hard_leather_armor: 'med',
  hellforged_plate: 'hvy',
  kraken_shell: 'hvy',
  lacquered_plate: 'med',
  leather_armor: 'med',
  light_plate: 'med',
  linked_mail: 'med',
  loricated_mail: 'med',
  mage_plate: 'med',
  mesh_armor: 'med',
  ornate_armor: 'hvy',
  plate_mail: 'hvy',
  ring_mail: 'med',
  russet_armor: 'hvy',
  sacred_armor: 'hvy',
  scale_mail: 'med',
  scarab_husk: 'med',
  serpentskin_armor: 'med',
  shadow_plate: 'hvy',
  sharktooth_armor: 'hvy',
  splint_mail: 'hvy',
  templar_coat: 'hvy',
  tigulated_mail: 'med',
  wyrmhide: 'med',
};

export function armorTier(baseId: string | undefined): ArmorTier {
  return (baseId && TIER[baseId]) || 'lit';
}
