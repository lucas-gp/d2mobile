/**
 * Bots de la base : Diablo II LoD 1.13c (lot M13). Implémentation de la règle `bots.profile` (src/mods/rules.ts) quand aucun mod ne la
 * remplace : plans de compétences des builds (arbres de Diablo II, skills-d2.ts), listes de compétences que le cerveau des bots
 * (src/sim/bot/brain.ts) traite à part, choix du mercenaire, préparation de ville propre au jeu de règles (aucune : ni cartes ni boîte à
 * énigme en D2) et seuils des tests de bots (tests/bots). Un mod (pd2 : mods/pd2/bots) fournit les siens. Module feuille (types et
 * tables seulement).
 */
import type { Element } from '../../data/stats';
import type { Difficulty } from '../../data/types';
import type { Game } from '../../sim/game';
import { D2_DIFFICULTY } from './tables';

/** Plan de compétences : le premier élément apprenable (prérequis, niveau requis) reçoit le point */
export type SkillPlan = readonly (readonly [string, number])[];

/** Plan de ville : run du point de passage, ou carte d'endgame à ouvrir depuis l'inventaire */
export interface RunPlan {
  runId: string;
  difficulty: Difficulty;
  map?: { invIndex: number; tier: number };
}

/** Ce que le cerveau du bot expose à la préparation de ville d'un jeu de règles */
export interface BotTown {
  game: Game;
  build: string;
  /** Élément principal du build */
  elem: Element;
  /** Build de mêlée (au contact) */
  melee: boolean;
  /** Vrai si le bot vient de mourir deux fois sur les trois dernières tentatives de `key` (run:difficulté, `map:<palier>`) */
  isRisky(key: string): boolean;
  /** Compte un objet vendu (statistiques du bot) */
  sold(): void;
}

/** Mercenaire voulu ; `rehire` : le reprendre aussi quand seul le sous-type diffère */
export interface WantedMerc {
  type: string;
  variant: string;
  rehire?: boolean;
}

/** Seuils des tests de bots (tests/bots), propres au jeu de règles */
export interface BotChecks {
  /** Bot de progression : niveau visé en 45 min de jeu */
  progressionLevel: number;
  /** Morts tolérées d'un Druide en 45 min de jeu (bot de progression) */
  druidDeaths: number;
  /** Bot de combat : difficultés (0 à n-1) où tout monstre doit tomber devant le personnage de référence */
  combatStrictDifficulties: number;
  /** Bot de combat : combats de ces difficultés où le groupe peut rester debout au bout du temps imparti (hors immunités) */
  combatUnkilledMax: number;
  /**
   * Campagne (jeu de règles sans cartes) : un build qui tue Baal en Normal, ouvrant le Cauchemar, en moins de `minutes` de jeu ; null :
   * non mesuré (jeu pd2 : ses bots de progression et de cartes, mods/pd2/tests/bots)
   */
  campaign: { build: string; minutes: number } | null;
}

export interface BotRules {
  /** Plans de compétences par build (identifiant de build de brain.ts) */
  plans: Readonly<Record<string, SkillPlan>>;
  /** Compétences « de zone » : leur valeur croît avec la densité */
  aoe: readonly string[];
  /** Sorts posés au sol qui durent (nombre de coups pendant leur vie) : pas relancés en boucle au même endroit */
  persistent: Readonly<Record<string, number>>;
  /** Effets posés qui ne se cumulent pas au-delà de leur maximum (hydres, murs) : jamais relancés au même endroit */
  noStack: readonly string[];
  /** Dégâts sur la durée relancés plutôt que cumulés (en plus des compétences de poison) */
  dots: readonly string[];
  /**
   * Armures et enchantements entretenus, par ordre de priorité ; un groupe (tableau) : buffs exclusifs (une seule armure de glace active à
   * la fois, sim/skills.ts `ARMOR_BUFFS`), le premier appris du groupe est lancé quand aucun n'est actif
   */
  buffs: readonly (string | readonly string[])[];
  /** Invocations sur cadavre du Nécromancien, par ordre de priorité */
  corpseRaises: readonly string[];
  /** Part de vie de la cible sous laquelle le Champ statique ne sert plus à rien (plancher du jeu + marge) */
  staticCutoff(difficulty: number): number;
  /** Les monstres qui ressuscitent leur groupe (chamans des Déchus…) sont la cible prioritaire à portée */
  focusRevivers: boolean;
  /** Mercenaire voulu selon les offres du moment ; null : aucun */
  wantedMerc(t: BotTown): WantedMerc | null;
  /** Préparation du Cube propre au jeu de règles, avant chaque recette d'équipement */
  townCube(t: BotTown): void;
  /** Carte d'endgame à ouvrir (préparée), ou null : le bot choisit une run du point de passage */
  prepareMap(t: BotTown): RunPlan | null;
  /** Charme de référence de l'arène par build (`ARENA_SUNDER=1`, niveau 75 et plus), identifiant d'unique */
  arenaCharms: Readonly<Record<string, string>>;
  checks: BotChecks;
}

/**
 * Plans de Diablo II : les builds classiques de LoD 1.13c, compétences et prérequis de Skills.txt (un point dans chaque prérequis, à son
 * niveau requis), synergies de la version. Les points de quête s'ajoutent aux points de niveau.
 */
export const D2_BOT_PLANS: Readonly<Record<string, SkillPlan>> = {
  // Sorcière « Blizzard » : Trait de glace au début, Explosion de glace, Blizzard au niveau 24 ; synergies Trait de glace, Explosion de
  // glace, Pointe glaciale ; Champ statique et Téléportation ; armures de glace
  cold: [
    ['ice_bolt', 4],
    ['frozen_armor', 1],
    ['frost_nova', 1],
    ['ice_blast', 1],
    ['warmth', 1],
    ['static_field', 1],
    ['telekinesis', 1],
    ['ice_blast', 8],
    ['shiver_armor', 1],
    ['glacial_spike', 1],
    ['teleport', 1],
    ['blizzard', 1],
    ['cold_mastery', 1],
    ['chilling_armor', 1],
    ['blizzard', 20],
    ['glacial_spike', 20],
    ['ice_blast', 20],
    ['static_field', 6],
    ['cold_mastery', 10],
    ['frozen_orb', 1],
    ['ice_bolt', 20],
    ['cold_mastery', 20],
    ['warmth', 20],
  ],
  // Sorcière « Boule de feu / Météore » : Trait de feu, Boule de feu (synergie Trait de feu), Météore (Mur de feu en prérequis), Maîtrise
  // du feu ; Explosion de glace pour les immunisés au feu
  fire: [
    ['fire_bolt', 4],
    ['warmth', 1],
    ['frozen_armor', 1],
    ['static_field', 1],
    ['telekinesis', 1],
    ['fire_ball', 1],
    ['fire_bolt', 7],
    ['teleport', 1],
    ['fire_ball', 12],
    ['inferno', 1],
    ['blaze', 1],
    ['fire_wall', 1],
    ['meteor', 1],
    ['fire_ball', 20],
    ['fire_mastery', 1],
    ['meteor', 20],
    ['fire_bolt', 20],
    ['fire_mastery', 10],
    ['ice_bolt', 1],
    ['ice_blast', 12],
    ['fire_mastery', 20],
    ['warmth', 20],
  ],
  // Sorcière « foudre » : Charge électrique, Éclair puis Éclair en chaîne, Maîtrise de la foudre ; Boule de feu pour les immunisés
  light: [
    ['charged_bolt', 4],
    ['static_field', 1],
    ['telekinesis', 1],
    ['warmth', 1],
    ['frozen_armor', 1],
    ['lightning', 1],
    ['nova', 1],
    ['lightning', 6],
    ['teleport', 1],
    ['chain_lightning', 1],
    ['lightning_mastery', 1],
    ['chain_lightning', 20],
    ['lightning', 20],
    ['lightning_mastery', 20],
    ['static_field', 10],
    ['fire_bolt', 1],
    ['fire_ball', 10],
    ['charged_bolt', 20],
    ['warmth', 20],
  ],
  // Druide « vent » : Tornade et Ouragan (Rafale arctique, Armure du cyclone, Tornade en prérequis) ; Tempête de feu, Corbeau et Liane
  // empoisonnée au début (le Druide de D2 n'a rien de solide avant le niveau 12)
  wind: [
    ['firestorm', 3],
    ['raven', 1],
    ['plague_poppy', 1],
    ['arctic_blast', 1],
    ['firestorm', 6],
    ['oak_sage', 1],
    ['cyclone_armor', 1],
    ['arctic_blast', 6],
    ['twister', 1],
    ['tornado', 1],
    ['tornado', 20],
    ['hurricane', 1],
    ['twister', 10],
    ['cyclone_armor', 8],
    ['hurricane', 20],
    ['twister', 20],
    ['cyclone_armor', 20],
    ['arctic_blast', 20],
  ],
  // Druide feu : Fissure et Volcan, Tempête de feu et Rocher en fusion en synergie, Armageddon (Ouragan en prérequis)
  fissure: [
    ['firestorm', 6],
    ['raven', 1],
    ['plague_poppy', 1],
    ['molten_boulder', 1],
    ['eruption', 1],
    ['eruption', 20],
    ['volcano', 1],
    ['firestorm', 12],
    ['arctic_blast', 1],
    ['cyclone_armor', 1],
    ['twister', 1],
    ['tornado', 1],
    ['volcano', 20],
    ['hurricane', 1],
    ['armageddon', 1],
    ['firestorm', 20],
    ['armageddon', 20],
    ['molten_boulder', 20],
  ],
  // Druide ours-garou : Loup-garou (prérequis de l'ours-garou en D2), Ours-garou au niveau 6, Mutilation puis Onde de choc, Lycanthropie,
  // Cœur du glouton (Sage du chêne en prérequis) ; Tempête de feu, Corbeau et Liane empoisonnée avant la forme
  bear: [
    ['firestorm', 3],
    ['raven', 1],
    ['werewolf', 1],
    ['plague_poppy', 1],
    ['werebear', 1],
    ['shape_shifting', 1],
    ['werebear', 5],
    ['maul', 1],
    ['maul', 12],
    ['oak_sage', 1],
    ['heart_wolverine', 1],
    ['shock_wave', 1],
    ['shock_wave', 20],
    ['maul', 20],
    ['werebear', 20],
    ['shape_shifting', 20],
    ['heart_wolverine', 20],
  ],
  // Druide invocateur : loups, loups redoutables, grizzly, Cœur du glouton (Sage du chêne en prérequis), Vigne carnivore ; Corbeau et
  // Liane empoisonnée au début
  summon: [
    ['raven', 1],
    ['plague_poppy', 1],
    ['firestorm', 5],
    ['oak_sage', 1],
    ['spirit_wolf', 1],
    ['cycle_of_life', 1],
    ['spirit_wolf', 5],
    ['plague_poppy', 6],
    ['heart_wolverine', 1],
    ['summon_fenris', 1],
    ['heart_wolverine', 6],
    ['summon_fenris', 10],
    ['grizzly', 1],
    ['grizzly', 20],
    ['summon_fenris', 20],
    ['heart_wolverine', 20],
    ['spirit_wolf', 20],
    ['spirit_barbs', 1],
    ['oak_sage', 20],
  ],
  // Barbare « tourbillon » : Coup violent, Double coup, Tourbillon au niveau 30 (Bond, Bond d'attaque, Concentration en prérequis) ;
  // Maîtrise de l'épée (le kit tient deux épées), Hurlement et Cri de guerre, cris de bataille ; Peau de fer, Vitesse accrue
  whirlwind: [
    ['bash', 1],
    ['double_swing', 4],
    ['sword_mastery', 3],
    ['howl', 1],
    ['taunt', 1],
    ['shout', 1],
    ['stun', 1],
    ['double_swing', 8],
    ['sword_mastery', 8],
    ['leap', 1],
    ['concentrate', 1],
    ['leap_attack', 1],
    ['battle_cry', 1],
    ['battle_orders', 1],
    ['war_cry', 3],
    ['berserk', 1],
    ['iron_skin', 1],
    ['increased_stamina', 1],
    ['increased_speed', 1],
    ['whirlwind', 1],
    ['whirlwind', 20],
    ['sword_mastery', 20],
    ['battle_orders', 10],
    ['natural_resistance', 8],
    ['iron_skin', 10],
    ['war_cry', 12],
    ['battle_command', 1],
    ['shout', 10],
    ['increased_speed', 10],
    ['iron_skin', 20],
    ['battle_orders', 20],
  ],
  // Barbare « frénésie » : deux épées, Double coup puis Frénésie au niveau 24 (Étourdissement, Double lancer en prérequis) ; Maîtrise de
  // l'épée, cris
  frenzy: [
    ['bash', 1],
    ['double_swing', 5],
    ['sword_mastery', 4],
    ['howl', 1],
    ['taunt', 1],
    ['shout', 1],
    ['stun', 1],
    ['double_throw', 1],
    ['double_swing', 10],
    ['sword_mastery', 10],
    ['battle_cry', 1],
    ['battle_orders', 1],
    ['frenzy', 1],
    ['frenzy', 20],
    ['sword_mastery', 20],
    ['double_swing', 20],
    ['iron_skin', 1],
    ['increased_stamina', 1],
    ['increased_speed', 1],
    ['battle_orders', 10],
    ['natural_resistance', 8],
    ['iron_skin', 10],
    ['increased_speed', 10],
    ['war_cry', 1],
    ['battle_command', 1],
    ['shout', 10],
    ['iron_skin', 20],
  ],
  // Paladin « marteau béni » : Châtiment et Zèle au début, Éclair sacré, Visée bénie, Marteau béni au niveau 18 ; Concentration et
  // Vigueur (synergies de D2), Bouclier sacré, Défi
  hammerdin: [
    ['might', 1],
    ['smite', 1],
    ['sacrifice', 1],
    ['holy_bolt', 1],
    ['prayer', 1],
    ['resist_fire', 1],
    ['defiance', 1],
    ['blessed_aim', 1],
    ['zeal', 3],
    ['charge', 1],
    ['cleansing', 1],
    ['blessed_hammer', 1],
    ['concentration', 1],
    ['vigor', 1],
    ['blessed_hammer', 20],
    ['concentration', 20],
    ['holy_shield', 1],
    ['vigor', 20],
    ['blessed_aim', 20],
    ['holy_shield', 20],
    ['defiance', 12],
  ],
  // Paladin « zélote » : Puissance et Sacrifice au début, Zèle au niveau 12, Fanatisme au niveau 30 (Visée bénie, Concentration en
  // prérequis) ; Défi et Vigueur
  zealot: [
    ['might', 3],
    ['sacrifice', 1],
    ['smite', 1],
    ['prayer', 1],
    ['sacrifice', 5],
    ['zeal', 1],
    ['blessed_aim', 1],
    ['zeal', 10],
    ['concentration', 1],
    ['charge', 1],
    ['zeal', 20],
    ['fanaticism', 1],
    ['fanaticism', 20],
    ['sacrifice', 20],
    ['resist_fire', 1],
    ['defiance', 1],
    ['cleansing', 1],
    ['vigor', 8],
    ['blessed_aim', 20],
    ['vigor', 20],
  ],
  // Amazone « javelot » : Estoc et Javelot empoisonné au début, Frappe puissante, Javelot de foudre, Furie de la foudre au niveau 30
  // (Javelot de peste en prérequis) ; Frappe chargée, Coup critique ; passifs de défense
  javazon: [
    ['jab', 1],
    ['inner_sight', 1],
    ['critical_strike', 1],
    ['poison_javelin', 1],
    ['power_strike', 3],
    ['dodge', 1],
    ['lightning_bolt', 1],
    ['slow_movement', 1],
    ['avoid', 1],
    ['lightning_bolt', 8],
    ['plague_javelin', 1],
    ['charged_strike', 1],
    ['decoy', 1],
    ['evade', 1],
    ['lightning_fury', 1],
    ['valkyrie', 1],
    ['lightning_fury', 20],
    ['charged_strike', 10],
    ['power_strike', 20],
    ['lightning_bolt', 20],
    ['charged_strike', 20],
    ['critical_strike', 10],
  ],
  // Amazone « arc » : Flèche magique, Tir multiple, Flèche guidée (Flèche de froid en prérequis) puis Mitraille au niveau 24 ; Pénétration, Perce, Coup critique ;
  // Valkyrie et passifs de défense
  bowazon: [
    ['magic_arrow', 3],
    ['inner_sight', 1],
    ['critical_strike', 3],
    ['multiple_shot', 1],
    ['dodge', 1],
    ['multiple_shot', 8],
    ['slow_movement', 1],
    ['avoid', 1],
    ['cold_arrow', 1],
    ['guided_arrow', 1],
    ['penetrate', 1],
    ['decoy', 1],
    ['evade', 1],
    ['strafe', 1],
    ['multiple_shot', 20],
    ['strafe', 20],
    ['pierce', 1],
    ['valkyrie', 1],
    ['penetrate', 10],
    ['critical_strike', 10],
    ['guided_arrow', 20],
    ['pierce', 10],
    ['critical_strike', 20],
  ],
  // Assassin « pièges » : Explosion de feu au début, Toile de choc → Tourelle à charges → Tourelle foudroyante au niveau 24, Tourelle de
  // mort au niveau 30 (Sillage de feu, Sillage d'inferno) ; Rafale de vitesse, Disparition, Maître des ombres
  trapsin: [
    ['fire_blast', 6],
    ['psychic_hammer', 1],
    ['claw_mastery', 1],
    ['burst_of_speed', 1],
    ['shock_web', 1],
    ['charged_bolt_sentry', 1],
    ['fire_blast', 10],
    ['wake_of_fire', 1],
    ['charged_bolt_sentry', 6],
    ['lightning_sentry', 1],
    ['wake_of_inferno', 1],
    ['lightning_sentry', 20],
    ['death_sentry', 1],
    ['shock_web', 20],
    ['charged_bolt_sentry', 20],
    ['death_sentry', 10],
    ['fade', 1],
    ['cloak_of_shadows', 1],
    ['weapon_block', 1],
    ['shadow_warrior', 1],
    ['shadow_master', 1],
    ['fire_blast', 20],
  ],
  // Assassin « arts martiaux » : Frappe du tigre, Serre du dragon, Griffe du dragon (Maîtrise des griffes), poings de feu, de glace et de
  // foudre, Frappe du phénix au niveau 30 ; Rafale de vitesse, Disparition, Guerrier de l'ombre
  martial: [
    ['tiger_strike', 1],
    ['dragon_talon', 1],
    ['claw_mastery', 1],
    ['fists_of_fire', 1],
    ['psychic_hammer', 1],
    ['burst_of_speed', 1],
    ['dragon_claw', 1],
    ['cobra_strike', 1],
    ['weapon_block', 1],
    ['claws_of_thunder', 1],
    ['cloak_of_shadows', 1],
    ['fade', 1],
    ['blades_of_ice', 1],
    ['shadow_warrior', 1],
    ['phoenix_strike', 1],
    ['phoenix_strike', 20],
    ['claw_mastery', 12],
    ['dragon_claw', 12],
    ['fists_of_fire', 8],
    ['blades_of_ice', 8],
    ['claws_of_thunder', 8],
    ['dragon_talon', 8],
    ['burst_of_speed', 8],
    ['fade', 8],
    ['shadow_warrior', 10],
  ],
  // Nécromancien invocateur : squelettes, mages, golems, Résurrection, Amplification des dégâts
  summoner: [
    ['raise_skeleton', 4],
    ['skeleton_mastery', 1],
    ['amplify_damage', 1],
    ['clay_golem', 1],
    ['teeth', 1],
    ['bone_armor', 1],
    ['raise_skeleton', 8],
    ['skeleton_mastery', 6],
    ['skeletal_mage', 1],
    ['golem_mastery', 1],
    ['corpse_explosion', 1],
    ['raise_skeleton', 20],
    ['skeleton_mastery', 20],
    ['skeletal_mage', 10],
    ['blood_golem', 1],
    ['iron_golem', 1],
    ['summon_resist', 1],
    ['fire_golem', 1],
    ['revive', 1],
    ['weaken', 1],
    ['terror', 1],
    ['decrepify', 1],
    ['revive', 12],
    ['skeletal_mage', 20],
    ['golem_mastery', 12],
    ['amplify_damage', 10],
  ],
  // Nécromancien « os » : Dents, Armure d'os, Lance d'os au niveau 18, Esprit d'os au niveau 30 ; Mur et Prison d'os (synergies de D2),
  // Amplification des dégâts et Décrépitude
  bonemancer: [
    ['teeth', 6],
    ['bone_armor', 1],
    ['amplify_damage', 1],
    ['corpse_explosion', 1],
    ['teeth', 10],
    ['bone_wall', 1],
    ['bone_spear', 1],
    ['bone_spear', 20],
    ['bone_prison', 1],
    ['bone_spirit', 1],
    ['weaken', 1],
    ['iron_maiden', 1],
    ['terror', 1],
    ['decrepify', 1],
    ['bone_spirit', 20],
    ['teeth', 20],
    ['bone_wall', 20],
    ['bone_prison', 20],
    ['bone_armor', 10],
  ],
  // Nécromancien « poison » : Dents et Dague empoisonnée au début, Explosion de poison, Nova de poison au niveau 30 ; Résistance
  // réduite, Amplification des dégâts
  pnova: [
    ['teeth', 6],
    ['bone_armor', 1],
    ['amplify_damage', 1],
    ['corpse_explosion', 1],
    ['poison_dagger', 6],
    ['teeth', 12],
    ['poison_explosion', 1],
    ['weaken', 1],
    ['bone_wall', 1],
    ['bone_spear', 1],
    ['iron_maiden', 1],
    ['life_tap', 1],
    ['terror', 1],
    ['decrepify', 1],
    ['lower_resist', 1],
    ['poison_explosion', 12],
    ['poison_nova', 1],
    ['poison_nova', 20],
    ['poison_explosion', 20],
    ['poison_dagger', 20],
    ['lower_resist', 10],
    ['bone_spear', 20],
  ],
};

/** Mercenaire de D2 : Éclaireuse, puis Garde du désert ; en Cauchemar, Puissance (mêlée) ou Gel sacré (lanceurs), sinon Visée bénie / Défi */
function d2WantedMerc(t: BotTown): WantedMerc | null {
  const offers = t.game.mercOffers();
  const desert = offers.find((o) => o.type.id === 'desert');
  if (desert?.unlocked) {
    const pref = t.melee ? ['might', 'blessed_aim', 'holy_freeze', 'defiance'] : ['holy_freeze', 'might', 'defiance', 'blessed_aim'];
    const variant = pref.find((v) => desert.variants.some((x) => x.id === v)) ?? desert.variants[0]?.id;
    if (!variant) return null;
    // le sous-type du Cauchemar (Puissance, Gel sacré) vaut un nouveau contrat ; sinon on garde le garde déjà embauché
    return { type: 'desert', variant, rehire: variant === 'might' || variant === 'holy_freeze' };
  }
  const rogue = offers.find((o) => o.type.id === 'rogue');
  if (rogue?.unlocked) return { type: 'rogue', variant: t.build === 'fire' ? 'cold' : 'fire' };
  return null;
}

export const D2_BOTS: BotRules = {
  plans: D2_BOT_PLANS,
  aoe: [
    'frost_nova',
    'blizzard',
    'frozen_orb',
    'fire_ball',
    'meteor',
    'fire_wall',
    'inferno',
    'nova',
    'lightning',
    'chain_lightning',
    'glacial_spike',
    'hydra',
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
  // tirs des tourelles de D2 (règle `skills.assassin`, sentryShots : 5 / 5 / 10 / 10) ; la Tourelle à charges tire ~5 éclairs à chaque fois
  persistent: {
    blizzard: 2,
    meteor: 1.4,
    fire_wall: 2.5,
    hydra: 6,
    eruption: 3,
    volcano: 5,
    lightning_sentry: 10,
    charged_bolt_sentry: 25,
    wake_of_fire: 5,
    wake_of_inferno: 10,
    shock_web: 6,
  },
  noStack: ['hydra', 'fire_wall', 'volcano'],
  dots: [],
  // une seule armure de glace à la fois (lancer l'une retire l'autre) : la meilleure apprise
  buffs: ['energy_shield', ['chilling_armor', 'shiver_armor', 'frozen_armor'], 'enchant'],
  corpseRaises: ['revive', 'skeletal_mage', 'raise_skeleton'],
  staticCutoff: (d) => D2_DIFFICULTY.StaticFieldMin[Math.max(0, Math.min(2, d))] / 100 + 0.05,
  focusRevivers: true,
  wantedMerc: d2WantedMerc,
  townCube: () => {},
  prepareMap: () => null,
  arenaCharms: {},
  // combat : 5 groupes de trois champions de grande vie (Seigneur de sang, Régurgitateur, Ver des sables, Ronce, Reine des vers) restent
  // debout en Normal au niveau 20 (mesuré, lot M13) : la Sorcière de référence de D2 (mana rempli en 120 s, chiffres de Skills.txt) vide sa
  // réserve et ses potions avant eux et ne fait plus que frapper du bâton, sous leur régénération
  // progression (mesuré, lot M13, graine 1 : bots de progression en 45 min) : niveau 10 à 12 pour la Sorcière, 15 à 18 pour les quatre
  // Druides ; 1 à 2 morts de Druide avant le niveau 12 (8 avant le niveau 6 au lot 239 : l'Ours-garou n'était jamais appris, faute du
  // Loup-garou dans le plan, et tout coup reçu interrompait le joueur)
  // campagne : le Druide feu tue Baal en Normal à 4 h 20, 4 h 47 et 4 h 48 de jeu (graines 1 à 3), puis Baal en Cauchemar à 7 h 41
  // (graine 1, 1 tentative sur 5) et joue l'Enfer dès 8 h 10 (niveau 73 à 12 h)
  checks: { progressionLevel: 9, druidDeaths: 3, combatStrictDifficulties: 2, combatUnkilledMax: 8, campaign: { build: 'fissure', minutes: 360 } },
};
