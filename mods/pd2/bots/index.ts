/**
 * Bots du jeu pd2 (règle `bots.profile`, lot M13) : plans de compétences des arbres S13, compétences propres à PD2 dans les listes du
 * cerveau (Combustion, Hydre mineure, Enchantement du froid, Tourelle d'éclairs en chaîne, archers squelettes, Profanation), mercenaire
 * de l'usage PD2, boîtes à énigme au Cube, cartes d'endgame, charmes de brisure de l'arène et seuils des tests de bots calibrés sur ce jeu
 * de règles. Repris tels quels du cerveau de la base d'avant le lot (src/sim/bot/brain.ts, arena.ts, tests/bots).
 */
import type { BotRules, ModApi } from '../../../src/mods/api';
import { PD2_BOT_PLANS } from './plans';
import { prepareMap } from './maps';

export { GOOD_ZONE_SHARE, zoneImmuneShare } from './maps';

/** Charme de brisure de référence de l'endgame (RATES.sunder) pour les builds à un seul élément : ARENA_SUNDER=1 */
const SUNDER_CHARM: Readonly<Record<string, string>> = {
  cold: 'u_sunder_cold',
  fire: 'u_sunder_fire',
  fissure: 'u_sunder_fire',
  light: 'u_sunder_light',
  javazon: 'u_sunder_light',
  trapsin: 'u_sunder_light',
  bear: 'u_sunder_phys',
  whirlwind: 'u_sunder_phys',
  frenzy: 'u_sunder_phys',
  zealot: 'u_sunder_phys',
  martial: 'u_sunder_phys',
  bowazon: 'u_sunder_phys',
};

/** Listes écrites en entier (et non dérivées de celles de la base) : une correction des bots de la base ne change pas ceux du jeu pd2 */
export const PD2_BOTS: BotRules = {
  plans: PD2_BOT_PLANS,
  aoe: [
    'frost_nova',
    'blizzard',
    'frozen_orb',
    'fire_ball',
    'meteor',
    'fire_wall',
    'combustion',
    'nova',
    'lightning',
    'chain_lightning',
    'glacial_spike',
    'hydra',
    'lesser_hydra',
    'inferno',
    'firestorm',
    'molten_boulder',
    'eruption',
    'volcano',
    'tornado',
    'twister',
    'arctic_blast',
    'shock_wave',
    'war_cry',
    'blessed_hammer',
    'fist_of_the_heavens',
    'exploding_arrow',
    'freezing_arrow',
    'immolation_arrow',
    'fire_blast',
    'poison_nova',
    'bone_spear',
    'shock_web',
  ],
  // PD2 : tirs avant de disparaître (7, 7 à ~3 cibles par saut, 5 × ~5 éclairs, 5, 5 gerbes d'une seconde), pointes de la Toile
  persistent: {
    blizzard: 2,
    meteor: 1.4,
    fire_wall: 2.5,
    hydra: 6,
    lesser_hydra: 6,
    eruption: 3,
    volcano: 5,
    lightning_sentry: 7,
    chain_lightning_sentry: 21,
    charged_bolt_sentry: 25,
    wake_of_fire: 5,
    wake_of_inferno: 5,
    shock_web: 6,
  },
  noStack: ['hydra', 'lesser_hydra', 'fire_wall', 'volcano'],
  dots: ['desecrate'],
  buffs: ['energy_shield', 'chilling_armor', 'shiver_armor', 'cold_enchant', 'enchant'],
  corpseRaises: ['revive', 'raise_skeleton_archer', 'skeletal_mage', 'raise_skeleton'],
  // plancher du Champ statique PD2 S13 (Normal 55 %, Cauchemar 70 %, Enfer 85 %) : inutile en dessous
  staticCutoff: (d) => [0.6, 0.75, 0.9][d],
  // cible : la plus proche (choix d'avant le lot M13)
  focusRevivers: false,
  // Éclaireuse au niveau 5, puis Garde du désert (Visée bénie en mêlée, Défi sinon) — l'usage PD2
  wantedMerc: (t) => {
    const offers = t.game.mercOffers();
    if (offers.find((o) => o.type.id === 'desert')?.unlocked) return { type: 'desert', variant: t.melee ? 'blessed_aim' : 'defiance' };
    if (offers.find((o) => o.type.id === 'rogue')?.unlocked) return { type: 'rogue', variant: t.build === 'fire' ? 'cold' : 'fire' };
    return null;
  },
  // boîtes à énigme : dix pièces → une boîte, dès qu'un objet porté pourrait en profiter
  townCube: (t) => {
    const g = t.game;
    const c = g.character;
    while ((c.materials.puzzlebox ?? 0) < 1 && (c.materials.puzzlepiece ?? 0) >= 10) if (!g.transmute('puzzlebox', []).ok) break;
  },
  prepareMap,
  arenaCharms: SUNDER_CHARM,
  // niveau 12 en 45 min (taux d'expérience du jeu pd2, plans S13) ; 3 morts au plus pour un Druide ; tout monstre tombe en Normal et en
  // Cauchemar devant le personnage de référence
  checks: { progressionLevel: 12, druidDeaths: 3, combatStrictDifficulties: 2, combatUnkilledMax: 0, campaign: null },
};

export function registerBotRules(api: ModApi): void {
  api.rules.set('bots.profile', () => () => PD2_BOTS);
}
