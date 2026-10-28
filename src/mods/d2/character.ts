/**
 * Règles des caractéristiques du personnage de la base : Diablo II LoD 1.13c (lot M8c). Implémentations des règles `char.*`
 * (src/mods/rules.ts) quand aucun mod ne les remplace. Sources : CharStats.txt des MPQ (src/mods/d2/tables.ts) et code du jeu 1.10f
 * reconstitué par D2MOO (D2Common : Units.cpp ; D2Game : SUnitDmg.cpp). Module feuille (tables seulement).
 */
import { D2_CLASS } from './tables';

/** Plafond des résistances maximales du joueur (D2 : 75 + bonus, 95 au plus : SUNITDMG_ApplyResistancesAndAbsorb) */
export const MAX_RES_CAP = 95;

/** Score d'attaque propre à la classe (CharStats ToHitFactor : UNITS_GetAttackRate, 5 × (Dextérité − 7) + ToHitFactor + objets) */
export const toHitFactor = (classId: string): number => D2_CLASS[classId]?.toHitFactor ?? 0;

/** Blocage propre à la classe, avec un bouclier (CharStats BlockFactor : UNITS_GetBlockRate, (BlockFactor + blocage) × (Dex − 15) / (2 × niveau)) */
export const blockFactor = (classId: string): number => D2_CLASS[classId]?.blockFactor ?? 0;
