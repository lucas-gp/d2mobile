/**
 * Règles des caractéristiques du personnage du jeu pd2 (lot M8c : autrefois en dur dans src/sim/derive-calc.ts et character.ts,
 * déplacées telles quelles), branchées sur les règles nommées `char.*` du jeu (src/mods/rules.ts) ; la base a celles de Diablo II
 * LoD 1.13c (src/mods/d2/character.ts).
 */
import type { ModApi } from '../../../src/mods/api';

export function registerCharacterRules(api: ModApi): void {
  // PD2 : résistances maximales plafonnées à 90 %
  api.rules.set('char.maxResCap', () => () => 90);
  // le jeu pd2 n'applique ni le ToHitFactor ni le BlockFactor de CharStats (score d'attaque : 5 × (Dextérité − 7) et objets seulement)
  api.rules.set('char.toHitFactor', () => () => 0);
  api.rules.set('char.blockFactor', () => () => 0);
  // lot 321 (rule moved from src/sim/world.ts, unchanged): PD2's rejuvenation potions, 35 % (small) and 65 % (full), at most 2 000 points
  api.rules.set('potion.rejuv', () => () => PD2_REJUV);
}

/** PD2's rejuvenation potions: 35 % and 65 % of life and mana, at most 2 000 points of each */
export const PD2_REJUV = Object.freeze({ small: 0.35, full: 0.65, cap: 2000 });
