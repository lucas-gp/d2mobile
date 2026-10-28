/**
 * Règles de progression de la base : Diablo II LoD 1.13c (lot M8f). Implémentation de la règle `xp.levelFactor` (src/mods/rules.ts) :
 * expérience d'un monstre selon l'écart de niveau, d'après le code du jeu 1.10f reconstitué par D2MOO (D2Game :
 * SUNITDMG_ComputeExperienceGain). Module feuille.
 */
import { MAX_LEVEL, XP_TABLE } from '../../data/xp';

/** Facteurs (sur 256) quand le monstre n'est pas plus haut que le personnage, par écart (0 à 10 et plus) */
const BELOW = [256, 256, 256, 256, 256, 256, 207, 159, 110, 61, 13];
/** Facteurs (sur 256) quand le monstre est plus haut et le personnage sous le niveau 25, par écart */
const ABOVE_LOW = [256, 256, 256, 256, 256, 256, 225, 174, 92, 38, 5];

/**
 * Part de l'expérience d'un monstre gagnée selon l'écart de niveau. D2 : monstre de niveau inférieur ou égal, ×(facteur / 256) au-delà
 * de 5 niveaux d'écart ; monstre plus haut, sous le niveau 25 du personnage, même principe (autres facteurs) ; à partir du niveau 25,
 * × niveau du personnage / niveau du monstre dès qu'il est plus haut.
 */
export function xpLevelFactor(clvl: number, mlvl: number): number {
  if (mlvl <= clvl) return BELOW[Math.min(clvl - mlvl, BELOW.length - 1)] / 256;
  if (clvl < 25 || mlvl <= 0) return ABOVE_LOW[Math.min(mlvl - clvl, ABOVE_LOW.length - 1)] / 256;
  return clvl / mlvl;
}

/** Total experience needed to reach level `level` (Experience.txt) */
function xpAt(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return Infinity;
  return XP_TABLE[level - 1];
}

/** Share of the current level's span lost on death, by difficulty (D2: 0 % Normal, 5 % Nightmare, 10 % Hell) */
const DEATH_PCT = [0, 0.05, 0.1];

/**
 * Experience lost on death (rule `death.xpPenalty`, D2 1.13c): the difficulty's share of the current level's span, never below the
 * start of the level. Pure: the game subtracts it.
 */
export function deathXpLoss(c: { xp: number; level: number }, difficulty: number): number {
  const pct = DEATH_PCT[difficulty] ?? 0.1;
  const floor = xpAt(c.level);
  const span = xpAt(c.level + 1) - floor;
  return Math.floor(Math.min(c.xp - floor, span * pct));
}
