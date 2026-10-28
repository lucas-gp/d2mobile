/**
 * Règles des compétences de la base : Diablo II LoD 1.13c (lots M9b à M9h, une classe par lot). Implémentations des règles nommées
 * `skills.<classe>` (src/mods/rules.ts) quand aucun mod ne les remplace : comportements que la simulation lit au
 * lancer (src/sim/skill-cast-*.ts, fichiers de classe de src/sim), les chiffres par niveau venant de Skills.txt (src/data/skills-d2.ts).
 * D'après le code du jeu 1.10f reconstitué par D2MOO (D2Game, SkillSor.cpp : fonctions citées ; faits seulement) et les tables des MPQ
 * (src/mods/d2/tables.ts). Module feuille (types et tables seulement).
 */
import { lin, type Lin } from '../../data/ramp';
import { D2_DIFFICULTY } from './tables';

/** Images par seconde de D2 (le moteur tourne aussi à 25 Hz) */
const FPS = 25;

/** Comportements des compétences de la Sorcière qui dépendent du jeu de règles */
export interface SorceressRules {
  /** Réduction de la résistance au feu par l'Inferno (%, niveau L) ; D2 : aucune */
  infernoFireRes(L: number): number;
  /** Durée de cette réduction après le jet (s) */
  infernoResLinger: number;
  /** Champ statique : rayon (unités) au niveau L, `radius` : chiffre de la compétence */
  staticRadius(L: number, radius: Lin | undefined): number;
  /** Part des PV max sous laquelle le Champ statique ne blesse plus, par difficulté */
  staticFloor(difficulty: number): number;
  /** Le coup s'arrête-t-il au plancher ? D2 : non, il retire sa part des PV actuels tant que la cible est au-dessus */
  staticStopsAtFloor: boolean;
  /** Réduction de la résistance à la foudre du Champ statique (%) et sa durée (s, selon les points durs de Maîtrise de la foudre) */
  staticLightRes(L: number): number;
  staticResSeconds(masteryHard: number): number;
  /** Malus des dégâts des sorts pendant 1 s après la Téléportation (%) */
  teleportPenaltyPct(L: number): number;
  /** Images entre deux éclairs de la Tempête de foudre (`value` : secondes de la compétence, `hard` : ses points durs) */
  thunderStormTicks(value: Lin | undefined, L: number, hard: number): number;
  /** Compétences lancées à la cadence lente de la Sorcière (images de la Foudre) */
  slowCast: readonly string[];
  /** Hydres en jeu au plus (toutes compétences d'hydre confondues) */
  maxHydras: number;
  /** Les boules de feu de l'Hydre traversent-elles les ennemis ? */
  hydraPierce: boolean;
  /** Durée du sol en feu du Météore (s ; undefined : celle du moteur) */
  meteorBurnSeconds(duration: Lin | undefined, L: number): number | undefined;
  /** Durée de la traînée de l'Embrasement (s ; undefined : celle du moteur) */
  blazeTrailSeconds(trail: Lin | undefined, L: number): number | undefined;
  /** Riposte des armures de froid à un coup de mêlée : dégâts de froid de la compétence, gel (s ; 'skill' : chiffre `chill` de la compétence) */
  armorMelee: Readonly<Record<string, { damage: boolean; freeze: number | 'skill' }>>;
  /** Riposte de l'Armure glaçante à un projectile : rayon de l'explosion sur l'attaquant (0 : lui seul) */
  chillingRangedRadius: number;
  /** L'Explosion de glace et les Éclairs chargés traversent-ils les ennemis ? */
  iceBlastPierce: boolean;
  chargedBoltPierce: boolean;
  /** Chaleur : score d'attaque fixe en plus (lot M8d) */
  warmthArFlat(L: number): number;
  /** Maîtrises du feu et du froid : réduction des résistances ennemies (%) ; `value2` : chiffre de la compétence */
  masteryPierce(e: 'fire' | 'cold', L: number, value2: Lin | undefined): number;
  /** Armure de frisson (récupération au blocage) et Armure glaçante (blocage) : bonus de PD2 S12 */
  armorExtras: boolean;
  /** Bouclier d'énergie : part des dégâts absorbée (0..1) et mana par point absorbé (`value` : chiffre de la compétence, `tkHard` : points durs de Télékinésie) */
  energyShield(L: number, hard: number, tkHard: number, value: Lin | undefined): { pct: number; manaPerDmg: number };
}

/**
 * Sorcière de D2 : l'Inferno et le Champ statique ne réduisent aucune résistance ; le Champ statique retire 25 % des PV actuels (calc1)
 * dans son rayon (aurarangecalc), sauf aux monstres déjà sous StaticFieldMin de DifficultyLevels.txt (0 / 33 / 50 % en extension), même si
 * le coup les fait passer dessous (SKILLS_AuraCallback_StaticField) ; aucun malus après la Téléportation (SKILLS_SrvDo027_Teleport) ; la
 * Tempête de foudre frappe toutes les `perdelay` images (SKILLS_SrvDo029_ThunderStorm, colonnes periodic / perdelay) ; Foudre et Éclair
 * en chaîne ont l'animation lente (anim « SQ » de Skills.txt) ; les hydres ne sont pas limitées (petmax 99) et leurs projectiles
 * (missile « hydra ») ne traversent pas ; sol en feu du Météore et traînée de l'Embrasement : durée de leur missile (meteorfire,
 * blaze : Range + niveau × LevRange) ; Armure gelée : gèle l'attaquant de mêlée (calc1, SKILLS_EventFunc02_FrozenArmor), Armure de
 * frisson : dégâts de froid de la compétence sur lui (SKILLS_EventFunc03_ShiverArmor), Armure glaçante : un trait vers l'auteur d'un
 * projectile seulement (SKILLS_EventFunc01_ChillingArmor) ; l'Explosion de glace et les Éclairs chargés ne traversent pas (Pierce de
 * Missiles.txt) ; Chaleur : régénération de mana seulement ; Maîtrise du froid : passive_cold_pierce (passivecalc1), Maîtrise du feu : sans
 * réduction de résistance ; Bouclier d'énergie : calc1 % des dégâts, calc2 / 16 mana par point (SKILLS_EventFunc24_EnergyShield).
 */
export const D2_SORCERESS: SorceressRules = {
  infernoFireRes: () => 0,
  infernoResLinger: 0,
  staticRadius: (L, radius) => lin(radius, L),
  staticFloor: (d) => D2_DIFFICULTY.StaticFieldMin[Math.max(0, Math.min(2, d))] / 100,
  staticStopsAtFloor: false,
  staticLightRes: () => 0,
  staticResSeconds: () => 0,
  teleportPenaltyPct: () => 0,
  thunderStormTicks: (value, L) => Math.max(1, Math.round(lin(value, L) * FPS)),
  slowCast: ['lightning', 'chain_lightning'],
  maxHydras: 99,
  hydraPierce: false,
  meteorBurnSeconds: (duration, L) => lin(duration, L),
  blazeTrailSeconds: (trail, L) => lin(trail, L),
  armorMelee: { frozen_armor: { damage: false, freeze: 'skill' }, shiver_armor: { damage: true, freeze: 0 } },
  chillingRangedRadius: 0,
  iceBlastPierce: false,
  chargedBoltPierce: false,
  warmthArFlat: () => 0,
  masteryPierce: (e, L, value2) => (e === 'cold' ? lin(value2, L) : 0),
  armorExtras: false,
  // SKILLS_EventFunc24_EnergyShield : absorbe calc1 % (min(edmn, 95)), coûte calc2 / 16 mana par point (par5 32 − Télékinésie)
  energyShield: (L, _hard, tk, value) => ({ pct: lin(value, L) / 100, manaPerDmg: Math.max(1, 32 - tk) / 16 }),
};

/** Comportements des compétences de l'Amazone qui dépendent du jeu de règles */
export interface AmazonRules {
  /** Part des dégâts de l'arme des flèches élémentaires (Flèche magique, de feu, de froid) ; absente : toute l'arme (SrcDam 128) */
  arrowWeaponPct: Readonly<Record<string, number>>;
  /** La Flèche magique traverse-t-elle les ennemis ? */
  magicArrowPierce: boolean;
  /** Tir multiple : part des dégâts de l'arme (SrcDam / 128), dégâts perdus par ennemi traversé (part des dégâts d'origine) */
  multiShotPct: number;
  multiShotPierceDecay: number;
  /** Mitraille : part des dégâts de l'arme */
  strafePct: number;
  /** Rayon de l'explosion de la Flèche explosive (unités ; `radius` : chiffre de la compétence, `hard` : points durs) */
  explodingRadius(radius: Lin | undefined, L: number, hard: number): number;
  /** Rayon de la Flèche de gel (unités) */
  freezingRadius(radius: Lin | undefined, L: number, hard: number): number;
  /** Gel de la Flèche de glace (ticks) : `chill` de la compétence (s), points durs de Flèche de froid et de Flèche de gel, synergies de durée (%) */
  iceArrowFreeze(chill: Lin | undefined, L: number, coldArrowHard: number, freezingArrowHard: number, durationSynergyPct: number): number;
  /** Gel de la Flèche de gel (ticks) */
  freezingArrowFreeze(chill: Lin | undefined, L: number, durationSynergyPct: number): number;
  /** Flèche guidée : part des dégâts de l'arme, conversion en magie de 1 % par 2 points de Flèche magique, ennemis traversés au plus (0 : aucun) */
  guidedArrowPct: number;
  guidedArrowConvert: boolean;
  guidedArrowPierce: number;
  /** Sol en feu de la Flèche d'immolation : rayon (unités) et durée (s) */
  immolationGround(radius: Lin | undefined, duration: Lin | undefined, L: number): { radius: number; seconds: number };
  /** Parade : trois attaques à zone croissante (PD2) ; D2 : un coup sur chaque cible adjacente, `count` cibles au plus */
  fendSweep: boolean;
  /** Frappe foudroyante : portée d'un rebond (unités ; `radius` : chiffre de la compétence) */
  lightningStrikeReach(radius: Lin | undefined, L: number): number;
  /** Nuage du Javelot de peste (rayon, unités) */
  plagueCloudRadius: number;
  /** Furie de la foudre : ennemis traversés par le javelot (0 : il s'arrête au premier) */
  lightningFuryPierce: number;
  /** L'Esquive évite-t-elle aussi les projectiles (sinon : Évitement) ? */
  dodgeMissiles: boolean;
  /** Valkyrie : dégâts par point de Leurre (%), score d'attaque par point de Pénétration */
  valkyrieDecoyDmgPct: number;
  valkyriePenetrateAr: number;
  /** Valkyrie : coups critiques des points de Coup critique de l'Amazone et Frappe puissante à chaque coup qui porte (PD2) ; D2 : aucun */
  valkyrieStrikes: boolean;
  /** Images sans nouvelle esquive après une esquive réussie (lot M8d) */
  dodgeLockTicks: number;
}

/**
 * Amazone de D2 (SkillAma.cpp de D2MOO, Skills.txt et Missiles.txt) : une seule flèche par tir, avec toute l'arme (SrcDam 128) et une part
 * convertie en l'élément (DmgCalc1 des missiles magicarrow, firearrow, coldarrow) ; Tir multiple et Mitraille aux trois quarts de l'arme
 * (SrcDam 96), sans perte en traversant ; explosion de la Flèche explosive (3 sous-cases), rayon de la Flèche de gel (calc1, 5 sous-cases) ;
 * gel des Flèches de glace et de gel : ELen de Skills.txt et synergie de durée (ELenSymPerCalc) ; Flèche guidée à toute l'arme, sans
 * conversion ni perforation ; sol en feu de la Flèche d'immolation (calc1 : 3 sous-cases, SHitCalc1 du missile : 100 images) ; Parade :
 * un coup sur chaque cible adjacente ; rebonds de la Frappe foudroyante à 20 sous-cases (aurarangecalc) ; Furie de la foudre : le
 * javelot s'arrête au premier ennemi ; Esquive (mêlée) et Évitement (projectiles) à l'arrêt, Dérobade en marchant ; la Valkyrie n'a
 * aucune synergie de Leurre ni de Pénétration, ni coup critique ni Frappe puissante (lot M13 : la Frappe puissante PD2 lisait des chiffres
 * que la compétence de D2 n'a pas et arrêtait la simulation).
 */
export const D2_AMAZON: AmazonRules = {
  arrowWeaponPct: {},
  magicArrowPierce: false,
  multiShotPct: 0.75,
  multiShotPierceDecay: 0,
  strafePct: 0.75,
  explodingRadius: (radius, L) => lin(radius, L),
  freezingRadius: (radius, L) => lin(radius, L),
  iceArrowFreeze: (chill, L, _c, _f, syn) => Math.round(lin(chill, L) * FPS * (1 + syn / 100)),
  freezingArrowFreeze: (chill, L, syn) => Math.round(lin(chill, L) * FPS * (1 + syn / 100)),
  guidedArrowPct: 1,
  guidedArrowConvert: false,
  guidedArrowPierce: 0,
  immolationGround: (radius, duration, L) => ({ radius: lin(radius, L), seconds: lin(duration, L) }),
  fendSweep: false,
  lightningStrikeReach: (radius, L) => lin(radius, L),
  plagueCloudRadius: 2,
  lightningFuryPierce: 0,
  dodgeMissiles: false,
  valkyrieDecoyDmgPct: 0,
  dodgeLockTicks: 0,
  valkyriePenetrateAr: 0,
  valkyrieStrikes: false,
};

/** Comportements des compétences du Barbare qui dépendent du jeu de règles */
export interface BarbarianRules {
  /** Chance de repousser la cible du Coup violent (1 : toujours) */
  bashKnockChance: number;
  /** Étourdissement à la PD2 : zone de 3,33 yards, dégâts propres et un quart de l'arme ; D2 : la cible seule, l'arme et ses synergies */
  stunArea: boolean;
  /** Berserk : dégâts convertis en magiques (D2) ou physiques perçant la résistance (PD2) ; défense et réduction des dégâts pendant l'effet (%) */
  berserkMagic: boolean;
  berserkDefensePct: number;
  berserkDrPct: number;
  /** Frénésie : charges au plus et durée (s ; `duration` : chiffre de la compétence, `hard` : points durs) */
  frenzyMaxStacks: number;
  frenzyDuration(duration: Lin | undefined, L: number, hard: number): number;
  /** Rayon de l'Attaque bondissante (unités ; 0 : la cible seule) */
  leapAttackRadius: number;
  /** Tourbillon à cadence fixe (PD2 : un coup toutes les 5 images, sans vitesse d'attaque) ; D2 : celle de l'arme */
  whirlwindFixedFrames: boolean;
  /** Rayon de la Provocation (unités ; 0 : la cible seule) */
  tauntRadius: number;
  /** Ordres de bataille : vie et mana en pour cent du maximum (D2) ou en points (PD2) */
  battleOrdersPct: boolean;
  /** Commandement de bataille : compétences en plus (`hard` : ses points durs) */
  battleCommandSkills(hard: number): number;
  /** Fétiche sinistre : terrorise les monstres proches (D2) ou donne une aura aux alliés (PD2) ; rayon (unités) */
  grimWardFear: boolean;
  grimWardRadius(radius: Lin | undefined, L: number): number;
}

/**
 * Barbare de D2 (SkillBar.cpp de D2MOO, Skills.txt) : le Coup violent repousse toujours ; l'Étourdissement frappe la cible seule (arme et
 * synergie du Coup violent) ; le Berserk convertit tous les dégâts en magiques et ramène la défense à 0 (armor_override_percent −100) ;
 * la Frénésie n'a pas de charges (vitesses dm34 / dm56 pendant par7 images après un coup) ; l'Attaque bondissante frappe la cible ; le
 * Tourbillon suit la vitesse de l'arme ; la Provocation vise un monstre ; Ordres de bataille en pour cent (ln34) ; Commandement de bataille :
 * +1 à toutes les compétences (aurastatcalc1) ; le Fétiche sinistre terrorise les monstres dans son rayon (ln12).
 */
export const D2_BARBARIAN: BarbarianRules = {
  bashKnockChance: 1,
  stunArea: false,
  berserkMagic: true,
  berserkDefensePct: -100,
  berserkDrPct: 0,
  frenzyMaxStacks: 1,
  frenzyDuration: (duration, L) => lin(duration, L),
  leapAttackRadius: 0,
  whirlwindFixedFrames: false,
  tauntRadius: 0,
  battleOrdersPct: true,
  battleCommandSkills: () => 1,
  grimWardFear: true,
  grimWardRadius: (radius, L) => lin(radius, L),
};

/**
 * Maîtrise d'armes qui s'applique à une arme (`kind` : type du moteur, `twoHanded` : arme à deux mains, `classId` : classe du
 * personnage) ; D2 : une maîtrise par type d'arme (Maîtrise de l'épée, de la hache, de la masse — sceptres compris —, des armes d'hast, de
 * la lance, du lancer pour les armes de jet), des griffes pour l'Assassin.
 */
export function d2MasteryOf(kind: string): string | undefined {
  switch (kind) {
    case 'sword':
      return 'sword_mastery';
    case 'axe':
      return 'axe_mastery';
    case 'mace':
    case 'scepter':
      return 'mace_mastery';
    case 'polearm':
      return 'pole_arm_mastery';
    case 'spear':
      return 'spear_mastery';
    case 'thrown':
    case 'javelin':
      return 'throwing_mastery';
    case 'claw':
      return 'claw_mastery';
    default:
      return undefined;
  }
}

/** Comportements des compétences du Paladin qui dépendent du jeu de règles */
export interface PaladinRules {
  /** Le monstre tué par le Sacrifice explose-t-il ? */
  sacrificeExplodes: boolean;
  /** Le Châtiment repousse-t-il la cible ? */
  smiteKnockback: boolean;
  /** Coups du Zèle (`count` : chiffre de la compétence) */
  zealHits(count: Lin | undefined, L: number): number;
  /** Vengeance qui explose et se propage (PD2) ; D2 : un coup qui ajoute à l'arme un pourcentage de ses dégâts dans chaque élément */
  vengeanceChain: boolean;
  /** Éclairs sacrés par lancer */
  holyBolts(L: number): number;
  /** Les Éclairs sacrés (et ceux du Poing des cieux) ne blessent-ils que les morts-vivants (D2 : missiles holybolt, sHitPar2 = 1) ? */
  holyUndeadOnly: boolean;
  /** Multiplicateur des dégâts du Marteau béni contre les morts-vivants */
  hammerUndeadMul: number;
  /** Éclairs sacrés du Poing des cieux au plus (`count` : chiffre de la compétence) */
  fohMaxBolts(count: Lin | undefined, L: number): number;
  /** Résistance maximale des auras de résistance (`hard` : points durs ; `active` : l'aura est active) */
  resistMax(id: string, hard: number, active: boolean): number;
  /** Score d'attaque passif de la Visée bénie (%) */
  blessedAimPassive(hard: number): number;
  /** Auras périodiques (lot M8d) : une impulsion toutes les `every` images, dégâts de la table × `mul` */
  auraPulse: { every: number; mul: number };
  /** Soin d'une impulsion de Prière (`value` : chiffre de la compétence, `hpMax` : vie maximale) */
  prayerHeal(value: number, hpMax: number): number;
  /** Auras qui soignent aussi comme la Prière, au niveau de la Prière (D2 : Purification, Méditation : hitpoints = skill('Prayer'.edns)) */
  prayerLikeAuras: readonly string[];
  /** Sanctuaire : frappe-t-il tous les monstres (sinon les morts-vivants seulement) ? Dégâts contre les morts-vivants (%) au niveau L */
  sanctuaryAllMonsters: boolean;
  sanctuaryUndeadDmgPct(L: number): number;
  /** Épines : dégâts renvoyés en pour cent des coups reçus (sinon fixes, et blessures ouvertes) */
  thornsPct: boolean;
}

/**
 * Paladin de D2 (SkillPal.cpp et MissMode.cpp de D2MOO, Skills.txt, Missiles.txt) : le Sacrifice ne fait pas exploser sa victime ; le
 * Châtiment repousse ; Zèle de 2 à 5 coups (calc1) ; Vengeance : un coup qui ajoute calc1-3 % de l'arme en feu, froid et foudre ; un seul
 * Éclair sacré, qui ne blesse que les morts-vivants (et soigne les alliés), comme ceux du Poing des cieux (au plus calc4 cibles dans
 * aurarangecalc) ; Marteau béni : +50 % contre les morts-vivants (dParam1 du missile ; le bonus contre les démons, dParam2, n'est pas repris : le moteur ne classe pas les démons) ; auras de résistance : +points durs
 * de résistance maximale tant qu'elle est active, +points durs / 2 en passif (aurastatcalc2, passivecalc1) ; Visée bénie : +5 % de score
 * d'attaque par point dur en passif (passivecalc1) ; auras périodiques toutes les 50 images (perdelay, SKILL_ComputePeriodicRate) avec les
 * dégâts entiers de la table ; Prière, Purification et Méditation soignent de skill('Prayer'.edns) ; Sanctuaire : morts-vivants
 * seulement, +ln34 % de dégâts contre eux ; Épines : thorns_percent (SKILLS_ApplyThornsDamage).
 */
export const D2_PALADIN: PaladinRules = {
  sacrificeExplodes: false,
  smiteKnockback: true,
  zealHits: (count, L) => Math.max(1, Math.floor(lin(count, L))),
  vengeanceChain: false,
  holyBolts: () => 1,
  holyUndeadOnly: true,
  hammerUndeadMul: 1.5,
  fohMaxBolts: (count, L) => Math.max(1, Math.floor(lin(count, L))),
  resistMax: (_id, hard, active) => (active ? hard : 0) + Math.floor(hard / 2),
  blessedAimPassive: (hard) => 5 * hard,
  auraPulse: { every: 50, mul: 1 },
  prayerHeal: (value) => value,
  prayerLikeAuras: ['cleansing', 'meditation'],
  sanctuaryAllMonsters: false,
  sanctuaryUndeadDmgPct: (L) => 150 + 30 * (L - 1),
  thornsPct: true,
};

/** Comportements des compétences du Nécromancien qui dépendent du jeu de règles */
export interface NecromancerRules {
  /** Rayon d'une malédiction (unités ; `radius` : chiffre de la compétence, `hard` : points durs, `cmLevel` : Maîtrise des malédictions) */
  curseRadius(id: string, radius: Lin | undefined, L: number, hard: number, cmLevel: number): number;
  /** Multiplicateur de la durée d'une malédiction selon la difficulté */
  curseDurationMul(id: string, difficulty: number): number;
  /** Vol de vie de la Connexion vitale (%) */
  lifeTapPct(value: Lin | undefined, L: number, hard: number): number;
  /** Absorption de l'Armure d'os par point d'énergie ; durée de l'armure (s ; D2 : jusqu'à épuisement) */
  boneArmorPerEnergy: number;
  boneArmorSeconds(duration: Lin | undefined, L: number): number;
  /** Nuages de poison de la Dague empoisonnée (au coup et à la mort de la victime empoisonnée) */
  poisonDaggerClouds: boolean;
  /** Explosion de cadavre en pour cent de la vie du cadavre (D2 : `value`–`value2` %, moitié feu, moitié physique) ; sinon table et 5-10 % */
  corpseExplosionPct: boolean;
  /** Mages squelettes et morts ressuscités au plus (`count` : chiffre de la compétence, `hard` : points durs) */
  mageCount(count: Lin | undefined, L: number, hard: number): number;
  reviveCount(count: Lin | undefined, L: number, hard: number): number;
  /** Synergies de dégâts des golems entre eux et avec la Maîtrise des golems ; Golem de fer immunisé au poison */
  golemSynergies: boolean;
  ironGolemPoisonImmune: boolean;
}

/**
 * Nécromancien de D2 (SkillNec.cpp de D2MOO, Skills.txt) : rayon et durée des malédictions de leurs colonnes (aurarangecalc,
 * auralencalc), sans réduction selon la difficulté ; Connexion vitale : vol de vie calc1 ; Armure d'os : absorption de la table et des
 * synergies, jusqu'à épuisement ; la Dague empoisonnée ne libère aucun nuage ; Explosion de cadavre : 70 à 120 % de la vie du cadavre
 * (calc1, calc2), moitié feu, moitié physique ; mages squelettes comme les guerriers et morts ressuscités au niveau de la compétence
 * (petmax) ; golems sans synergies entre eux, Golem de fer sans immunité au poison.
 */
export const D2_NECROMANCER: NecromancerRules = {
  curseRadius: (_id, radius, L) => lin(radius, L),
  curseDurationMul: () => 1,
  lifeTapPct: (value, L) => lin(value, L),
  boneArmorPerEnergy: 0,
  boneArmorSeconds: () => 3600,
  poisonDaggerClouds: false,
  corpseExplosionPct: true,
  mageCount: (count, L) => Math.max(1, Math.floor(lin(count, L))),
  reviveCount: (count, L) => Math.max(1, Math.floor(lin(count, L))),
  golemSynergies: false,
  ironGolemPoisonImmune: false,
};

/** Bonus d'une forme animale du Druide (deltas ajoutés aux statistiques dérivées) */
export interface DruidFormBonus {
  lifePct: number;
  arPct: number;
  meleeDmgPct: number;
  ias: number;
  defPct: number;
  uninterrupt: number;
  splash: number;
  drFlat: number;
  mdr: number;
}

/** Comportements des compétences du Druide qui dépendent du jeu de règles */
export interface DruidRules {
  /**
   * Bonus de la forme (`L` : niveau de la forme, `lyc` : niveau de Lycanthropie ; `nv(id, champ, niveau)` : chiffre d'une compétence),
   * ajoutés dans l'ordre vie, score d'attaque, dégâts, vitesse, défense
   */
  form(form: 'werewolf' | 'werebear', L: number, lyc: number, nv: (id: string, field: string, L: number) => number): DruidFormBonus;
  /** Rage sauvage : vol de vie, vitesse de déplacement et zone de mêlée (%) selon les charges (`perCharge` : vol de vie par charge) */
  feralRage(stacks: number, perCharge: number): { leech: number; frw: number; splash: number };
  /** Armure cyclone : absorption (`base` : table, `ene` : énergie, `synPct` : synergies en %, `synFlat` : synergies en points) */
  cycloneAbsorb(base: number, ene: number, synPct: number, synFlat: number): number;
  /** Faim : dévore un cadavre (buff) ; sinon une morsure qui vole vie et mana */
  hungerEatsCorpse: boolean;
  /** Langues de feu des Griffes de feu à chaque coup (`hard` : points durs) ; 0 : aucune */
  fireClawsTendrils(hard: number): number;
  /** Zone de mêlée de plus au i-ème coup de la Furie (%) */
  furySplash(i: number): number;
  /** Part des dégâts d'arme ajoutée à l'Onde de choc */
  shockWaveWeapon: number;
  /** Corbeaux appelés par lancer (`hard` : points durs) */
  ravensPerCast(hard: number): number;
  /** Les trois lianes partagent-elles une seule place ? */
  vinesShareSlot: boolean;
  /** Créatures du Druide que les monstres ne peuvent ni viser ni blesser (en plus des corbeaux : esprits et lianes ?) */
  spiritsUntouchable: boolean;
  /** Lianes : vie (Liane charognarde) ou mana (Liane solaire) rendus par cadavre [min, max] (`value`, `value2` : table, `pool` : maximum) */
  vineGain(id: string, value: number, value2: number, hard: Record<string, number>, pool: number): [number, number];
  /** Sage du chêne : vie maximale (%), vie fixe, régénération (`value`, `value2` : table) */
  oakSage(value: number, value2: number, hard: Record<string, number>): { lifePct: number; life: number; regen: number };
  /** Esprit des ronces : épines fixes, épines (% des dégâts reçus), frappe mortelle et son plafond */
  barbs(value: number, value2: number, hard: Record<string, number>, maxDeadly: number): { thornsFlat: number; thornsPct: number; deadly: number; maxDeadly: number };
  /** Loups spirituels : le chiffre `value` est-il un score d'attaque fixe (D2 : passif « tohit ») plutôt qu'un pourcentage ? */
  spiritWolfArFlat: boolean;
}

/**
 * Druide de D2 (SkillDruid.cpp de D2MOO, Skills.txt) : loup-garou — vitesse d'attaque dm34, score d'attaque ToHit, vie par2 + Lycanthropie,
 * aucun bonus de dégâts ; ours-garou — dégâts ln12, défense ln34, vie par5 + Lycanthropie ; Rage sauvage : vol de vie par charge et
 * vitesse de déplacement dm34 au nombre de charges (Param3 10, Param4 70) ; Armure cyclone : table × (1 + synergies) ; Faim : morsure
 * (dégâts par5, vol de vie dm12, de mana dm34) ; Griffes de feu : dégâts de feu ajoutés seulement ; Furie et Onde de choc sans zone de
 * mêlée ni arme ; tous les corbeaux d'un coup ; une seule liane à la fois ; esprits et lianes vulnérables ; lianes : part de la vie / du
 * mana maximum par cadavre (dm56) ; Sage du chêne : vie maximale ln12 % ; Ronces : dégâts renvoyés ln34 % ; loups spirituels : score
 * d'attaque fixe.
 */
export const D2_DRUID: DruidRules = {
  form: (form, L, lyc, nv) => {
    const b: DruidFormBonus = { lifePct: 0, arPct: 0, meleeDmgPct: 0, ias: 0, defPct: 0, uninterrupt: 0, splash: 0, drFlat: 0, mdr: 0 };
    const lycLife = lyc > 0 ? nv('shape_shifting', 'value', lyc) : 0;
    if (form === 'werewolf') {
      b.lifePct = nv('werewolf', 'value', L) + lycLife;
      b.ias = nv('werewolf', 'value2', L);
      b.arPct = nv('werewolf', 'v3', L);
    } else {
      b.lifePct = nv('werebear', 'v3', L) + lycLife;
      b.meleeDmgPct = nv('werebear', 'value', L);
      b.defPct = nv('werebear', 'value2', L);
    }
    return b;
  },
  feralRage: (stacks, perCharge) => ({
    leech: perCharge * stacks,
    frw: stacks > 0 ? 10 + Math.floor((110 * stacks * (70 - 10)) / (100 * (stacks + 6))) : 0,
    splash: 0,
  }),
  cycloneAbsorb: (base, _ene, synPct) => Math.floor(base * (1 + synPct / 100)),
  hungerEatsCorpse: false,
  fireClawsTendrils: () => 0,
  furySplash: () => 0,
  shockWaveWeapon: 0,
  ravensPerCast: () => Infinity,
  vinesShareSlot: true,
  spiritsUntouchable: false,
  vineGain: (_id, value, _v2, _hard, pool) => [(pool * value) / 100, (pool * value) / 100],
  oakSage: (value) => ({ lifePct: value, life: 0, regen: 0 }),
  barbs: (value) => ({ thornsFlat: 0, thornsPct: value, deadly: 0, maxDeadly: 0 }),
  spiritWolfArFlat: true,
};

/** Comportements des compétences de l'Assassin qui dépendent du jeu de règles */
export interface AssassinRules {
  /** Charges : effet immédiat de l'étage d'un cycle partagé (PD2 S13) ; sinon elles s'accumulent et les finitions les libèrent (D2) */
  chargesImmediate: boolean;
  /** Durée des charges (s ; `duration` : table) */
  chargeSeconds(duration: Lin | undefined, L: number): number;
  /** Étage joué par la charge n° `c` (1 à 3) d'une compétence, libérée par une finition */
  chargeStage(id: string, c: number): number;
  /** Queue du dragon : coup de pied suivi d'une explosion de feu (`value` % des dégâts, rayon `radius`) ; sinon conversion en feu et zone */
  dragonTailExplodes: boolean;
  /** Souffle mental : rayon (unités) et étourdissement (s) ; `hard` : points durs */
  mindBlast(hard: number, radius: Lin | undefined, stun: Lin | undefined, L: number): { radius: number; stun: number };
  /** Rapidité : vitesse d'attaque (`value` : chiffre de la table au niveau) */
  burstIas(hard: number, value: number): number;
  /** Sentinelle de lames : part des dégâts d'arme ajoutée, durée (s) */
  bladeSentinelWeapon: number;
  bladeSentinelSeconds(duration: Lin | undefined, L: number): number;
  /** Bouclier de lames : un coup toutes les `every` images, dans `radius` unités */
  bladeShield(hard: number, radius: Lin | undefined, L: number): { every: number; radius: number };
  /** Tirs d'une tourelle avant de disparaître (`engine` : chiffre du moteur) ; éclairs par tir de la Tourelle à éclairs chargés */
  sentryShots(id: string, engine: number): number;
  chargedBolts(hard: number): number;
  /** Tourelle de mort : part de la vie du cadavre [min, max] (0..1) et rayon de l'explosion (unités) au niveau L */
  deathSentryCorpse: readonly [number, number];
  deathSentryRadius(L: number): number;
}

/** Tirs des tourelles de D2 (Skills.txt, colonne calc4 des compétences des tourelles : BoltSentry, Wake Of Destruction Sentry…) */
const D2_SENTRY_SHOTS: Readonly<Record<string, number>> = { charged_bolt_sentry: 5, wake_of_fire: 5, lightning_sentry: 10, wake_of_inferno: 10, death_sentry: 5 };

/**
 * Assassin de D2 (SkillAss.cpp de D2MOO, Skills.txt) : les attaques à charges posent une charge par coup au but (3 au plus, auralencalc :
 * 15 s) sans autre effet ; une finition consomme les charges et joue leurs effets (Frappe du cobra : vol de vie et de mana à chaque
 * charge) ; Queue du dragon : explosion de feu de calc1 % des dégâts du coup de pied ; Souffle mental : rayon aurarangecalc,
 * étourdissement ELen ; Rapidité : vitesse d'attaque dm34 ; Sentinelle de lames : SrcDam 48/128 de l'arme, durée calc4 ; Bouclier de lames :
 * rayon aurarangecalc, un coup toutes les 0,4 s (supposé) ; tourelles : tirs de calc4 (« mon death sentry » : 40 à 80 % de la vie du
 * cadavre, rayon 10 + 1 par niveau en demi-cases), Tourelle à éclairs chargés : 5 éclairs par tir (BoltSentry, calc1).
 */
export const D2_ASSASSIN: AssassinRules = {
  chargesImmediate: false,
  chargeSeconds: (duration, L) => lin(duration, L),
  chargeStage: (id, c) => (id === 'cobra_strike' ? 2 : c),
  dragonTailExplodes: true,
  mindBlast: (_hard, radius, stun, L) => ({ radius: lin(radius, L), stun: lin(stun, L) }),
  burstIas: (_hard, value) => value,
  bladeSentinelWeapon: 48 / 128,
  bladeSentinelSeconds: (duration, L) => lin(duration, L),
  bladeShield: (_hard, radius, L) => ({ every: 10, radius: lin(radius, L) }),
  sentryShots: (id, engine) => D2_SENTRY_SHOTS[id] ?? engine,
  chargedBolts: () => 5,
  deathSentryCorpse: [0.4, 0.8],
  deathSentryRadius: (L) => (10 + (L - 1)) / 3,
};
