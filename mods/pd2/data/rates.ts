// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
// Taux du jeu de règles pd2 (lot M8e : autrefois les taux de base de src/data/rates.ts, repris tels quels) : conforts de D2 Mobile
// (butin et expérience relevés pour un jeu en solo et en sessions courtes, mana plus rapide) et taux propres à Project Diablo 2 (cartes,
// orbes, énigme de Larzuk, charmes de brisure). Remplacent ceux de la base (Diablo II LoD 1.13c) par la règle loot.rates.
import type { Rates } from '../../../src/mods/api';

/**
 * Taux du jeu pd2 : la structure de D2 est conservée (formule de rareté, rendements décroissants du magic find, rareté relative des
 * runes, classes de trésor) ; ces multiplicateurs relèvent les taux. Palier « Normal » (défaut, calibre des tests et des bots) ; le
 * joueur choisit un autre palier de butin (réglage lootRate, applyLootPreset).
 */
export const PD2_RATES: Rates = {
  /** Multiplicateur de la probabilité de réussite du test de rareté (formule D2) */
  quality: {
    unique: 3.0,
    set: 3.0,
    rare: 1.6,
    magic: 1.0,
  },
  /** Multiplicateur du poids des runes dans le TC « good » (face aux gemmes et bijoux) */
  runes: 10.0,
  /** Multiplicateur du poids de l'entrée « good » (runes, gemmes, bijoux) des TC de monstres */
  good: 2.0,
  /**
   * Biais des runes hautes (TC Runes 13 à 17) : multiplie la probabilité de monter d'un palier.
   * 0,15 : une rune haute (Vex+) toutes les ~27 h de cartes au volume mesuré (~35 runes/h),
   * les moyennes restent à ~3,5/h (tools/bots/rune-odds.ts ; à 0,4 : une toutes les ~7-10 h).
   */
  highRuneBias: 0.15,
  /** Poids des gemmes */
  gems: 1.5,
  /** Chance qu'une map lâche une map (par monstre élite / boss) */
  maps: 2.5,
  /** Multiplicateur global du NoDrop (plus petit = plus de drops) */
  noDrop: 0.55,
  /** Or */
  gold: 1.5,
  /** Expérience de base (multiplie la table L-XP de D2) */
  xp: 3.0,
  /**
   * Courbe d'accélération de l'expérience selon le niveau du personnage : [niveau, facteur]
   * interpolés linéairement, multipliés par `xp`. Réglée au bot de progression pour atteindre
   * les maps en ~1 h 30 - 2 h (docs/JOURNAL.md, chiffres clés).
   */
  xpCurve: [
    [1, 1.1],
    [15, 1.8],
    [30, 2.7],
    [45, 3.4],
    [60, 4.2],
    [75, 5.3],
    [90, 6.2],
  ] as [number, number][],
  /** Charmes et joyaux */
  charms: 1.5,
  /**
   * Charmes de brisure (sunder) : chance par boss de carte selon le palier (P1…donjon). Clé de
   * l'endgame PD2 contre les immunités ; en PD2 ils viennent des boss « uber », absents ici.
   * DÉCISION (équilibrage des builds) : on les GARDE, assumés comme substitut des ubers PD2. Mesuré à
   * l'arène de classes (ARENA_SUNDER=1, niveau 85-Enfer) : le Froid passe de 41 à 9 morts sur 702
   * combats ; la Foudre n'y gagne rien (PD2 : pas de pénétration de Maîtrise de la foudre, la brisure
   * ne ramène l'immunité qu'à 95 %), le Feu non plus. Jamais multipliés par un palier de butin.
   */
  sunder: [0, 0.03, 0.05, 0.08, 0.15] as number[],
  /**
   * Orbes (monnaie PD2). Inflation des paliers de butin mesurée (mods/pd2/tools/bots/loot-rate-measure.ts, cartes T2,
   * MF 300) : cartes lâchées/h ×1,4 (Rapide), ×1,8 (Très rapide), ×2,4 (Abondant) ; orbes/h ×1,4, ×1,7, ×2,5.
   * Sous le plafond de ~4× Normal : aucun plafonnement de `maps`/`orbs` à Abondant (tests/unit/balance-builds.test.ts).
   */
  orbs: 1.0,
  /**
   * Pièces d'énigme de Larzuk : chance PAR BOSS DE CARTE d'en lâcher une (la moitié sur les boss de la campagne en Enfer). 10 pièces = 1 boîte
   * (châsses sur un unique ou un ensemble). Selon le palier de butin : ≈ 1 boîte toutes les 100 runs (Normal) à toutes les 30 runs (Abondant).
   */
  puzzle: 0.1,
  /** Pièces d'énigme : chance PAR MONSTRE TUÉ (hors boss), en plus de la table « divers » (~0,17 %). ≈ 1,3 pièce/carte (Normal) à ≈ 3,9 (Abondant) de plus. */
  puzzleMob: 0.002,
  /**
   * Secondes pour remplir la réserve de mana sans bonus : compromis entre D2 (≈ 120 s) et le confort
   * mobile (ancienne valeur 25 s). Le mana redevient une vraie ressource sans obliger à boire en continu.
   */
  manaRefillSeconds: 40,
};
