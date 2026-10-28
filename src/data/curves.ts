// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Courbes séparées de monstres : points de vie, dégâts, score d'attaque, expérience.
 * Les PV sont calibrés sur des durées de mise à mort cibles (voir TTK_TARGETS) contre le
 * DPS attendu d'une Sorcière correctement équipée à ce niveau ; le bot de combat mesure
 * l'écart et on ajuste HP_SCALE ici.
 */
import type { Difficulty, MonsterRank } from './types';
import { levelXp } from './xp';

/** Durées de mise à mort visées (secondes) par rang, pour un joueur au niveau conseillé */
export const TTK_TARGETS: Record<MonsterRank, number> = {
  normal: 0.6,
  minion: 1.0,
  champion: 2.5,
  unique: 5,
  boss: 25,
};

const HP_SCALE = 1;
const DMG_SCALE = 1;

/** Niveau au-delà duquel les PV des monstres croissent de 3 % par niveau au lieu de 7,8 % */
const HP_KNEE = 80;

/** Points de vie de base d'un monstre standard de niveau L (joueur seul). */
export function monsterHp(L: number): number {
  // premiers niveaux adoucis (le personnage n'a qu'un sort de bas niveau, D2 : un Déchu de Tristram
  // tombe en un Éclair de feu) : ×0,29 au niveau 1, ×0,55 au niveau 8 → ×1 au niveau 20
  const early = Math.min(1, 0.25 + (0.75 * L) / 20);
  // coude au-delà du niveau 80 : les dégâts des sorts ne croissent plus que linéairement (niveaux
  // de compétence, synergies), l'exponentielle rendait les cartes (87-90) 3 à 4× trop longues
  const exp = L <= HP_KNEE ? Math.pow(1.078, L) : Math.pow(1.078, HP_KNEE) * Math.pow(1.03, L - HP_KNEE);
  return HP_SCALE * early * (2 + 2.2 * L + 6 * exp);
}

/** Dégâts de base (moyenne d'un coup) */
export function monsterDmg(L: number): number {
  // même coude que les PV : au-delà du niveau 80, +1,5 %/niveau (la vie et les résistances du
  // personnage ne croissent plus guère après 80)
  const exp = L <= HP_KNEE ? Math.pow(1.048, L) : Math.pow(1.048, HP_KNEE) * Math.pow(1.015, L - HP_KNEE);
  // premiers niveaux adoucis (D2 : 1-4 dégâts au niveau 5 en Normal) : ×0,43 au niveau 1 →
  // ×0,7 au niveau 10 → ×1 au niveau 20. Sans cela Feu et Foudre (sans le ralentissement du
  // Froid) mouraient presque à chaque run avant le niveau 16 (bot de progression, 4 graines)
  const early = Math.min(1, 0.3 + (0.7 * L) / 24);
  return DMG_SCALE * early * (2 + 0.55 * L + 1.4 * exp);
}

export function monsterAr(L: number): number {
  return 20 + 14 * L + 0.18 * L * L;
}

export function monsterDef(L: number): number {
  return 10 + 9 * L + 0.1 * L * L;
}

/** Expérience de base d'un monstre de niveau L : table L-XP de D2 (avant multiplicateur de rates.ts) */
export function monsterXp(L: number, diff: Difficulty): number {
  return levelXp(L, diff);
}

type Tri = [number, number, number];

/**
 * Multiplicateurs par rang et par difficulté [Normal, Cauchemar, Enfer] (D2 MonUMod, Arreat Summit « Monster Bonuses ») :
 * vie des sbires ×2/×1,75/×1,5, des champions ×3/×2,5/×2, des uniques ×4/×3/×2 ; dégâts des champions +90/75/66 %
 * (uniques et sbires : aucun bonus hors « Très fort ») ; niveau +2 (champion) / +3 (unique, sbire) ; expérience ×3 / ×5.
 */
export const RANK_MULT: Record<MonsterRank, { hp: Tri; dmg: Tri; xp: number; lvl: number }> = {
  normal: { hp: [1, 1, 1], dmg: [1, 1, 1], xp: 1, lvl: 0 },
  minion: { hp: [2, 1.75, 1.5], dmg: [1, 1, 1], xp: 5, lvl: 3 },
  champion: { hp: [3, 2.5, 2], dmg: [1.9, 1.75, 1.66], xp: 3, lvl: 2 },
  unique: { hp: [4, 3, 2], dmg: [1, 1, 1], xp: 5, lvl: 3 },
  boss: { hp: [1, 1, 1], dmg: [1, 1, 1], xp: 1, lvl: 0 },
};

/**
 * Multiplicateurs supplémentaires par difficulté (en plus du niveau de zone plus élevé). La courbe `monsterHp` n'a qu'une
 * colonne alors que MonLvl.txt en a trois : rapportée à D2 (L-HP × base monstats), elle donne ≈ 0,5-1 en Normal (niveaux 1-45),
 * ≈ 0,4-0,9 en Cauchemar (36-70) et ≈ 0,3-0,7 en Enfer (67-99). Le ×1,4 de Cauchemar rapproche ce creux des deux autres
 * difficultés (les boss de Cauchemar étaient à ≈ 0,4 de D2, audit 03 §3.1).
 */
export const DIFF_MULT: Record<Difficulty, { hp: number; dmg: number; xp: number }> = {
  0: { hp: 1, dmg: 1, xp: 1 },
  // dégâts : pas de multiplicateur en plus du niveau de zone (comme D2) — l'Enfer tuait en 2 s
  1: { hp: 1.4, dmg: 1, xp: 1 },
  // Enfer : dégâts ×0,8. La courbe `monsterDmg` donne ≈ 1,2-1,6 × D2 (L-DM × A1 monstats) aux niveaux 67-99, calibrée quand
  // les élites n'avaient que ×1,5 ; avec les bonus D2 (berserker +198 %, Très fort +99 %, auras, Amplification des dégâts),
  // les morts du bot de cartes doublaient (médiane 0,32 → 0,65). ×0,8 ramène la base à ≈ 1-1,3 × D2 (médiane 0,52).
  2: { hp: 1.12, dmg: 0.8, xp: 1 },
};

/**
 * Régénération des monstres (D2 monstats DamageRegen) : PV max × regen / 4096 par image de 1/25 s, soit ≈ 1,2 %/s pour
 * la valeur courante 2. Elle cesse tant que le monstre subit des dégâts (coup récent, poison, saignement, brûlure).
 */
export const REGEN_PAUSE_TICKS = 50;
export function monsterRegenPerSec(hpMax: number, regen: number): number {
  return (hpMax * regen * 25) / 4096;
}

/**
 * Dégâts des projectiles de monstres par difficulté. La pénalité de résistance (−100 en Enfer)
 * frappe surtout les projectiles élémentaires, tirés à distance par des groupes entiers ; sans
 * mercenaire pour attirer les tirs (choix mobile), un groupe de 8 lanceurs tuait le personnage
 * de référence en Enfer en quelques secondes (arène, docs/JOURNAL.md). La mêlée reste inchangée.
 */
export const MISSILE_DMG: Record<Difficulty, number> = { 0: 1, 1: 0.75, 2: 0.4 };

/** Pénalité de résistance du joueur par difficulté (D2/PD2) */
export const RES_PENALTY: Record<Difficulty, number> = { 0: 0, 1: -40, 2: -100 };
