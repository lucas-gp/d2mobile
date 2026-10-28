// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Comportements des compétences du jeu pd2 (lots M9b à M9h : autrefois en dur dans la simulation, src/sim/skill-cast-*.ts,
 * src/sim/skills.ts, src/sim/missile-update.ts, déplacés tels quels), branchés sur les règles nommées `skills.<classe>` et
 * `missiles.explode` du jeu (src/mods/rules.ts) ; la base a ceux de Diablo II LoD 1.13c (src/mods/d2/skills.ts).
 */
import {
  lin,
  type AmazonRules,
  type AssassinRules,
  type BarbarianRules,
  type DruidFormBonus,
  type DruidRules,
  type ModApi,
  type NecromancerRules,
  type PaladinRules,
  type SorceressRules,
} from '../../../src/mods/api';
import { PD2_HARD } from '../data/skills';

/** Images par seconde du moteur */
const TICK_HZ = 25;

/** Réduction de résistance PD2 (Champ statique) : −(4 + niv) jusqu'au niv. 22, puis +½ par niveau */
export function resReduction(lvl: number): number {
  if (lvl <= 0) return 0;
  return lvl <= 22 ? 4 + lvl : 26 + Math.ceil((lvl - 22) / 2);
}

/** Réduction de résistance au feu de l'Inferno (wiki PD2 : −(4 + niv) %, plafonnée à −45 %) */
export function infernoReduction(lvl: number): number {
  return lvl <= 0 ? 0 : Math.min(45, 4 + lvl);
}

/** Durée de la réduction de résistance du Champ statique : 5 s + 0,2 s par point dur de Maîtrise de la Foudre (max 9 s) */
export function staticDuration(masteryHard: number): number {
  return Math.min(9, 5 + 0.2 * Math.max(0, masteryHard));
}

/** Rayon du Champ statique : min(7 + niv, 28)/2 yards (1 unité = 2 yards) */
export function staticRadius(lvl: number): number {
  return Math.min(7 + lvl, 28) / 4 + 1;
}

/** Rayons d'explosion PD2 : Trait de feu et Trait de glace explosent à l'impact (saison 12), boules de l'Hydre perforantes à explosion (saison 13) */
const PD2_EXPLODE: Readonly<Record<string, number>> = { fireball: 2.2, glacial_spike: 2.0, fire_bolt: 1.0, ice_bolt: 1.0, hydra_ball: 1.0 };

/** Valeur d'une table par points durs du wiki (comme la règle skills.hardValue du mod) */
function hard(id: string, table: string, n: number): number {
  const t = PD2_HARD[id]?.[table];
  if (!t) return 0;
  return t[Math.max(0, Math.min(t.length - 1, Math.floor(n)))];
}

export function registerSkillRules(api: ModApi): void {
  api.rules.set('skills.sorceress', () => () => PD2_SORCERESS);
  api.rules.set('skills.amazon', () => () => PD2_AMAZON);
  api.rules.set('skills.barbarian', () => () => PD2_BARBARIAN);
  api.rules.set('skills.masteryOf', () => pd2MasteryOf);
  api.rules.set('skills.paladin', () => () => PD2_PALADIN);
  api.rules.set('skills.necromancer', () => () => PD2_NECROMANCER);
  api.rules.set('skills.druid', () => () => PD2_DRUID);
  api.rules.set('skills.assassin', () => () => PD2_ASSASSIN);
  api.rules.set('missiles.explode', () => (kind) => PD2_EXPLODE[kind]);
}

/**
 * Sorcière PD2 S13 : l'Inferno réduit la résistance au feu pendant le jet et 0,4 s après ; Champ statique −25 % des PV actuels tant
 * qu'ils dépassent 55 / 70 / 85 % des PV max (Normal / Cauchemar / Enfer), réduction de résistance à la foudre pendant 5 s + 0,2 s par
 * point de Maîtrise de la foudre ; malus de −(50 − (niv − 1)) % des sorts pendant 1 s après la Téléportation ; Tempête de foudre toutes
 * les 2 s, −0,04 s par point investi (plancher 1 s) ; Foudre à la cadence normale, Éclair en chaîne et Orbe gelé à la cadence lente ;
 * 3 hydres au total, Hydre mineure comprise, boules de l'Hydre perforantes ; Armure de frisson : gel 0,8 s et dégâts ; Armure glaçante :
 * dégâts au corps à corps, pointe de glace (1,3) contre les projectiles ; Explosion de glace et Éclairs chargés perforants.
 */
const PD2_SORCERESS: SorceressRules = {
  infernoFireRes: infernoReduction,
  infernoResLinger: 0.4,
  staticRadius: (L) => staticRadius(L),
  staticFloor: (d) => [0.55, 0.7, 0.85][d],
  staticStopsAtFloor: true,
  staticLightRes: resReduction,
  staticResSeconds: staticDuration,
  teleportPenaltyPct: (L) => Math.max(0, 50 - (L - 1)),
  thunderStormTicks: (_value, _L, hard) => Math.round(Math.max(1, 2 - 0.04 * hard) * TICK_HZ),
  slowCast: ['chain_lightning', 'frozen_orb'],
  maxHydras: 3,
  hydraPierce: true,
  meteorBurnSeconds: () => undefined,
  blazeTrailSeconds: () => undefined,
  armorMelee: { shiver_armor: { damage: true, freeze: 0.8 }, chilling_armor: { damage: true, freeze: 0 } },
  chillingRangedRadius: 1.3,
  iceBlastPierce: true,
  chargedBoltPierce: true,
  // Chaleur (PD2 S1) : +10 de score d'attaque par niveau (10 + 10 par niveau)
  warmthArFlat: (L) => 10 + 10 * L,
  // Maîtrise du feu : −1 % par niveau (30 au plus) ; du froid : 5 % + 1 % par niveau (table du wiki : −6 % au niveau 1), plafond 45 %
  masteryPierce: (e, L) => (e === 'fire' ? Math.min(30, L) : Math.min(45, 5 + L)),
  armorExtras: true,
  // PD2 S13 : absorbe min(15 + 2(niv−1), 90) % ; coût max(34 − points investis, 14)/16 mana par point
  energyShield: (L, n) => ({ pct: Math.min(90, 15 + 2 * (L - 1)) / 100, manaPerDmg: Math.max(34 - n, 14) / 16 }),
};

/**
 * Amazone PD2 S13 : Flèche magique à 75 % de l'arme (perforante), Flèches de feu et de froid à 50 % ; Tir multiple : −20 % des dégâts
 * d'origine par ennemi traversé ; rayons de la Flèche explosive et de la Flèche de gel selon les points investis (tables du wiki) ; gel
 * de la Flèche de glace : +1,25 image par point de Flèche de froid et de Flèche de gel ; Flèche guidée à 50 % de l'arme, +1 % de
 * conversion en magie par 2 points de Flèche magique, 2 ennemis traversés ; sol en feu de la Flèche d'immolation de 2 yards, 2 s ;
 * Parade : trois attaques à zone de mêlée croissante ; Frappe foudroyante : rebonds à 10,66 yards ; nuage de 6 yards du Javelot de
 * peste ; Furie de la foudre : 6 ennemis traversés ; l'Esquive évite aussi les projectiles ; Valkyrie : +15 % de dégâts par point de
 * Leurre, +40 de score d'attaque par point de Pénétration.
 */
const PD2_AMAZON: AmazonRules = {
  arrowWeaponPct: { magic_arrow: 0.75, fire_arrow: 0.5, cold_arrow: 0.5 },
  magicArrowPierce: true,
  multiShotPct: 1,
  multiShotPierceDecay: 0.2,
  strafePct: 1,
  explodingRadius: (_radius, _L, n) => hard('exploding_arrow', 'Primary Explosion Radius (yards)', n) / 2,
  freezingRadius: (_radius, _L, n) => hard('freezing_arrow', 'Radius (yards)', n) / 2,
  iceArrowFreeze: (chill, L, c, f) => Math.round(lin(chill, L) * TICK_HZ) + Math.floor(1.25 * c) + Math.floor(1.25 * f),
  freezingArrowFreeze: (chill, L) => Math.round(lin(chill, L) * TICK_HZ),
  guidedArrowPct: 0.5,
  guidedArrowConvert: true,
  guidedArrowPierce: 2,
  immolationGround: () => ({ radius: 1.0, seconds: 2 }),
  fendSweep: true,
  lightningStrikeReach: () => 5.33,
  plagueCloudRadius: 3,
  lightningFuryPierce: 6,
  dodgeMissiles: true,
  valkyrieDecoyDmgPct: 15,
  // après une esquive réussie, 4 images (0,16 s) sans nouvelle esquive
  dodgeLockTicks: 4,
  valkyriePenetrateAr: 40,
  // la Valkyrie reçoit vos points investis en Coup critique et lance une Frappe puissante à chaque coup qui porte
  valkyrieStrikes: true,
};

/** Yards → unités du monde (1 unité = 2 yards) */
const yd = (y: number): number => y / 2;

/**
 * Barbare PD2 S13 : 75 % de chances de repousser au Coup violent ; Étourdissement de zone (3,33 yards, dégâts propres et un quart de
 * l'arme) ; Berserk physique qui perce la résistance physique, défense −25 % et réduction des dégâts −10 % ; Frénésie à cinq charges, durée
 * selon les points investis ; Attaque bondissante de zone (5,33 yards) ; Tourbillon à cadence fixe ; Provocation de zone (10,66 yards) ;
 * Ordres de bataille en vie et mana fixes ; Commandement de bataille selon les points investis ; Fétiche sinistre en aura alliée
 * (10,66 yards + 0,66 par niveau).
 */
const PD2_BARBARIAN: BarbarianRules = {
  bashKnockChance: 0.75,
  stunArea: true,
  berserkMagic: false,
  berserkDefensePct: -25,
  berserkDrPct: -10,
  frenzyMaxStacks: 5,
  frenzyDuration: (_d, _L, n) => hard('frenzy', 'Duration (seconds)', n),
  leapAttackRadius: yd(5.33),
  whirlwindFixedFrames: true,
  tauntRadius: yd(10.66),
  battleOrdersPct: false,
  battleCommandSkills: (n) => hard('battle_command', 'All Skills +', n),
  grimWardFear: false,
  grimWardRadius: (_r, L) => yd(10.66 + 0.66 * Math.max(0, L - 1)),
};

/** Maîtrises PD2 : à une main, à deux mains (armes d'hast, lances, bâtons compris), du lancer, des griffes, du javelot et de la lance (Amazone) */
function pd2MasteryOf(kind: string, twoHanded: boolean, classId: string): string | undefined {
  if ((kind === 'javelin' || kind === 'spear') && classId === 'amazon') return 'javelin_mastery';
  if (kind === 'thrown' || kind === 'javelin') return 'throwing_mastery';
  if (kind === 'claw') return 'claw_mastery';
  if (kind === 'bow' || kind === 'crossbow' || kind === 'none' || kind === 'orb') return undefined;
  return twoHanded || kind === 'polearm' || kind === 'spear' || kind === 'staff' ? 'two_hand_mastery' : 'one_hand_mastery';
}

/** Résistance maximale passive des auras de résistance PD2 (tables « Hard Level » du wiki) */
const RESIST_MAX_TABLE: Readonly<Record<string, string>> = {
  resist_fire: 'Passive Maximum Fire Resistance +%',
  resist_cold: 'Passive Maximum Cold Resistance +%',
  resist_lightning: 'Passive Maximum Lightning Resistance +%',
};

/**
 * Paladin PD2 S13 : le monstre tué par le Sacrifice explose ; le Châtiment ne repousse pas (PvE) ; trois coups de Zèle ; Vengeance qui
 * explose et se propage d'ennemi en ennemi ; un Éclair sacré de plus aux niveaux 15 et 25, qui blesse tous les monstres ; Marteau béni
 * ×2,5 contre les morts-vivants ; 4 Éclairs sacrés au plus pour le Poing des cieux ; résistance maximale passive et score d'attaque de la
 * Visée bénie selon les tables par points durs (la Visée bénie réduit la défense ennemie, elle n'a pas de score d'attaque passif).
 */
const PD2_PALADIN: PaladinRules = {
  sacrificeExplodes: true,
  smiteKnockback: false,
  zealHits: () => 3,
  vengeanceChain: true,
  holyBolts: (L) => 1 + (L >= 15 ? 1 : 0) + (L >= 25 ? 1 : 0),
  holyUndeadOnly: false,
  hammerUndeadMul: 2.5,
  fohMaxBolts: () => 4,
  resistMax: (id, n) => hard(id, RESIST_MAX_TABLE[id] ?? '', n),
  blessedAimPassive: () => 0,
  // valeurs par seconde (une impulsion par seconde), appliquées toutes les 0,4 s
  auraPulse: { every: 10, mul: 0.4 },
  prayerHeal: (value, hpMax) => value * 0.4 * (1 + hpMax / 400),
  prayerLikeAuras: [],
  sanctuaryAllMonsters: true,
  sanctuaryUndeadDmgPct: () => 0,
  thornsPct: false,
};

/**
 * Nécromancien PD2 S13 : rayon des malédictions selon les points investis (table du wiki ; Terreur et Confusion : 6 yards), +0,66 yard
 * par trois niveaux de Maîtrise des malédictions (sauf Terreur, Confusion, Attraction) ; Confusion et Attraction réduites de 50 % en
 * Cauchemar et de 75 % en Enfer ; vol de vie de la Connexion vitale selon les points investis ; Armure d'os : +3 par point d'énergie,
 * durée de la table ; nuages de la Dague empoisonnée (au coup, et à la mort de la victime : saison 9) ; Explosion de cadavre : table et
 * 5 à 10 % de la vie du cadavre ; mages et morts ressuscités selon les points investis ; synergies des golems, Golem de fer immunisé au
 * poison.
 */
const PD2_NECROMANCER: NecromancerRules = {
  curseRadius: (id, _radius, _L, n, cm) => {
    let yards = id === 'terror' || id === 'confuse' ? 6 : hard(id, 'Radius (yards)', n);
    if (id !== 'terror' && id !== 'confuse' && id !== 'attract') yards += 0.66 * Math.floor(cm / 3);
    return yards / 2;
  },
  curseDurationMul: (id, d) => (id === 'confuse' || id === 'attract' ? ([1, 0.5, 0.25][d] ?? 1) : 1),
  lifeTapPct: (_value, _L, n) => hard('life_tap', 'Life Steal +%', n),
  boneArmorPerEnergy: 3,
  boneArmorSeconds: (duration, L) => lin(duration, L),
  poisonDaggerClouds: true,
  corpseExplosionPct: false,
  mageCount: (_count, _L, n) => hard('skeletal_mage', 'Number of Magi', n) || 1,
  reviveCount: (_count, _L, n) => Math.max(1, hard('revive', 'Number of Revives', n)),
  golemSynergies: true,
  ironGolemPoisonImmune: true,
};

/**
 * Druide PD2 S13 : Lycanthropie (vie et score d'attaque en forme animale) ; loup-garou : dégâts, vitesse d'attaque, réduction fixe des
 * dégâts physiques et magiques ; ours-garou : dégâts, défense, +10 % de vie, chances de ne pas être interrompu, zone de mêlée +20 % ;
 * Rage sauvage : +10 % de course et +2 % de zone de mêlée par charge (20 % au plus) ; Armure cyclone : +3 par point d'énergie,
 * synergies en points ; Faim : dévore un cadavre ; Griffes de feu : tempête de feu à chaque coup (table « Number of Tendrils ») ; Furie :
 * zone de mêlée +20 % par coup ; Onde de choc : +50 % des dégâts d'arme ; corbeaux par lancer selon les points investis ; lianes
 * indépendantes, esprits et lianes intouchables ; lianes : quantité fixe (synergies Liane solaire, Sage du chêne) ; Sage du chêne : vie
 * fixe et régénération ; Ronces : épines fixes (+5 % par point de Liane charognarde) et frappe mortelle.
 */
const PD2_DRUID: DruidRules = {
  form: (form, L, lyc, nv) => {
    const b: DruidFormBonus = { lifePct: 0, arPct: 0, meleeDmgPct: 0, ias: 0, defPct: 0, uninterrupt: 0, splash: 0, drFlat: 0, mdr: 0 };
    if (lyc > 0) {
      b.lifePct += nv('shape_shifting', 'value', lyc);
      b.arPct += nv('shape_shifting', 'value2', lyc);
    }
    if (form === 'werewolf') {
      b.meleeDmgPct += nv('werewolf', 'value', L);
      b.ias += nv('werewolf', 'value2', L);
      b.drFlat += nv('werewolf', 'v3', L);
      b.mdr += nv('werewolf', 'v4', L);
    } else {
      b.meleeDmgPct += nv('werebear', 'value', L);
      b.defPct += nv('werebear', 'value2', L);
      b.lifePct += 10;
      b.uninterrupt += nv('werebear', 'v3', L);
      b.splash += 20;
    }
    return b;
  },
  feralRage: (stacks, perCharge) => ({ leech: perCharge * stacks, frw: 10 * stacks, splash: Math.min(20, 2 * stacks) }),
  cycloneAbsorb: (base, ene, _synPct, synFlat) => base + 3 * ene + synFlat,
  hungerEatsCorpse: true,
  fireClawsTendrils: (n) => Math.max(1, hard('fire_claws', 'Number of Tendrils', n)),
  furySplash: (i) => 20 * (i + 1),
  shockWaveWeapon: 0.5,
  ravensPerCast: (n) => Math.max(1, hard('raven', 'Ravens per Cast', n)),
  vinesShareSlot: false,
  spiritsUntouchable: true,
  vineGain: (id, value, value2, h) => {
    if (id === 'cycle_of_life') {
      const lo = value + 2 * (h.vines ?? 0);
      return [lo, value2 + 6 * (h.vines ?? 0)];
    }
    const lo = value + 4 * (h.oak_sage ?? 0);
    return [lo, value2 + 12 * (h.oak_sage ?? 0)];
  },
  oakSage: (value, value2, h) => ({ lifePct: 0, life: value, regen: ((value2 + 12 * ((h.cycle_of_life ?? 0) + (h.vines ?? 0))) * 5) / 256 }),
  barbs: (value, value2, h, n) => ({
    thornsFlat: value * (1 + 0.05 * (h.cycle_of_life ?? 0)),
    thornsPct: 0,
    deadly: value2,
    maxDeadly: hard('spirit_barbs', 'Maximum Deadly Strike +%', n),
  }),
  spiritWolfArFlat: false,
};

/**
 * Assassin PD2 S13 : chaque coup au but d'une attaque à charges joue aussitôt l'étage d'un cycle de trois coups partagé, charges de
 * 300 s ; Queue du dragon : conversion du physique en feu et zone de mêlée ; Souffle mental : rayon et étourdissement selon les points
 * investis ; Rapidité : vitesse d'attaque selon les points investis ; Sentinelle de lames : 100 % de l'arme, 2 s ; Bouclier de lames :
 * cadence selon les points investis, 2,66 yards ; tirs des tourelles du moteur, éclairs par tir selon les points investis ; Tourelle de
 * mort : 3 à 5 % de la vie du cadavre, 14 yards.
 */
const PD2_ASSASSIN: AssassinRules = {
  chargesImmediate: true,
  chargeSeconds: () => 300,
  chargeStage: (_id, c) => c,
  dragonTailExplodes: false,
  mindBlast: (n) => ({ radius: hard('mind_blast', 'Base Radius (yards)', n) / 2, stun: hard('mind_blast', 'Stun Length (seconds)', n) }),
  burstIas: (n) => hard('burst_of_speed', 'Attack Speed +%', n),
  bladeSentinelWeapon: 1,
  bladeSentinelSeconds: () => 2,
  bladeShield: (n) => ({ every: Math.max(1, Math.round(hard('blade_shield', 'Damage Frequency (seconds)', n) * TICK_HZ)), radius: 2.66 / 2 }),
  sentryShots: (_id, engine) => engine,
  chargedBolts: (n) => Math.max(1, Math.round(hard('charged_bolt_sentry', 'Number of Bolts', n))),
  deathSentryCorpse: [0.03, 0.05],
  deathSentryRadius: () => 14 / 2,
};
