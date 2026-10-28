/**
 * Boss de carte : statut de boss (vie, dégâts, enrage, phases) et kits de compétences spéciales par carte.
 * Chaque compétence est un archétype réutilisable (nova, balayage en cône, pluie, mur, charge, invocation, aura,
 * zone persistante, téléportation, bouclier, poison cumulable) teinté par l'élément du thème de la carte.
 * Tout ce qui frappe une zone est télégraphié au sol (marqueur visible au moins 0,7 s avant l'impact) :
 * le joueur l'évite en bougeant. Mise en œuvre : mods/pd2/sim/map-boss.ts.
 */
import type { Element, MapBossArchetype, MapBossAuraFx } from '../../../src/mods/api';

export type { MapBossArchetype, MapBossAuraFx };
type MapBossTheme = 'fire' | 'cold' | 'light' | 'poison' | 'phys' | 'death' | 'shadow';

interface MapBossSkill {
  arch: MapBossArchetype;
  elem: Element;
  /** Phase à partir de laquelle la compétence sert : 0 dès le début, 1 sous 75 % de vie, 2 sous 50 %, 3 sous 25 % */
  phase: 0 | 1 | 2 | 3;
  /** Effet de l'aura (archétype aura) */
  fx?: MapBossAuraFx;
}

/** Ce qui se passe en franchissant 75 %, 50 % et 25 % de vie */
export type MapBossPhaseAction = 'summon' | 'shield' | 'haste' | 'frenzy';

export interface MapBossKit {
  theme: MapBossTheme;
  skills: MapBossSkill[];
  /** Actions des phases 75 / 50 / 25 % */
  phases: [MapBossPhaseAction, MapBossPhaseAction, MapBossPhaseAction];
}

export interface MapBossArchetypeDef {
  name: string;
  /** Recharge propre (s) */
  cd: number;
  /** Délai entre le marqueur au sol et l'impact (s) ; 0 : pas de zone (projectiles visibles, invocation) */
  warn: number;
  /** Dégâts par impact, en coups moyens du boss (avant résistances) */
  dmg: number;
  /** Rayon de la zone (unités) */
  radius: number;
  /** Poids du tirage parmi les compétences prêtes */
  weight: number;
}

/**
 * Catalogue des archétypes. `dmg` est en coups moyens « élémentaires » du boss : la part physique (sans résistance du
 * joueur) et la magie sont pondérées par ELEM_DMG_FACTOR pour que l'effet ressenti soit comparable (75 % de résistance).
 * Ordre de grandeur pour un personnage de ~850 PV à 75 % de résistances : cône ≈ 25 % de vie, impact de pluie ≈ 15 %,
 * projectile de nova ≈ 9 %, mur ≈ 8 %/s, zone ≈ 6 %/s, cumul de poison ≈ 3 %/s par charge (5 au plus). Sans résistances,
 * chaque impact est plafonné (MAP_BOSS_HIT_CAP, mods/pd2/sim/map-boss.ts) : jamais de mort d'un seul coup à pleine vie.
 */
export const MAP_BOSS_ARCHETYPES: Record<MapBossArchetype, MapBossArchetypeDef> = {
  nova: { name: 'Anneau', cd: 9, warn: 0.8, dmg: 2.2, radius: 2, weight: 3 },
  cone: { name: 'Balayage', cd: 10, warn: 1.0, dmg: 6, radius: 7, weight: 3 },
  rain: { name: 'Pluie', cd: 11, warn: 1.0, dmg: 3.5, radius: 1.7, weight: 3 },
  wall: { name: 'Mur', cd: 13, warn: 0.8, dmg: 0.8, radius: 0.9, weight: 2 },
  charge: { name: 'Charge', cd: 10, warn: 1.0, dmg: 5, radius: 2.1, weight: 2 },
  summon: { name: 'Renforts', cd: 22, warn: 0, dmg: 0, radius: 0, weight: 2 },
  aura: { name: 'Aura', cd: 12, warn: 0.9, dmg: 2, radius: 7, weight: 2 },
  pool: { name: 'Zone', cd: 10, warn: 0.8, dmg: 0.7, radius: 2.4, weight: 2 },
  blink: { name: 'Pas de l’ombre', cd: 12, warn: 0.8, dmg: 4.5, radius: 2.6, weight: 2 },
  shield: { name: 'Bouclier', cd: 40, warn: 0, dmg: 0, radius: 0, weight: 1 },
  dot: { name: 'Venin', cd: 10, warn: 0.9, dmg: 0.4, radius: 1.6, weight: 2 },
};

/** Pondération des dégâts par élément : le joueur n'a ni résistance physique ni résistance à la magie, à l'inverse des quatre éléments (75 %) */
export const ELEM_DMG_FACTOR: Record<Element, number> = { phys: 0.32, magic: 0.3, fire: 1, cold: 1, light: 1, poison: 1 };

/** Délai de télégraphie minimal (s) : aucune zone ne frappe sans avoir été visible au moins ce temps */
export const MIN_TELEGRAPH_SEC = 0.7;

/**
 * Vie du boss de carte, multiple de `monsterHp(niveau) × DIFF_MULT` (comme un monstre ordinaire), par palier (1-3 ; 4 : donjon).
 * Le rang unique de l'Enfer ne vaut que ×2 : un boss de carte vaut ×5 à ×15 selon le palier. Les multiplicateurs sont réglés
 * sur le temps de mise à mort mesuré par le bot de combat (mods/pd2/tools/bots/map-boss-audit.ts, docs/internal/audit/map-boss-kits.md) : P1 ≈ 25-40 s,
 * P2 ≈ 45-70 s, P3 ≈ 60-100 s, donjon ≈ 90-150 s pour un personnage d'endgame du niveau du palier.
 */
export const MAP_BOSS_HP: Record<number, number> = { 1: 7.5, 2: 11, 3: 15, 4: 20 };
/** Écart de vie entre espèces, resserré (la fiche d'un Seigneur venimeux vaut 1,8, celle de Baal 60) */
export const MAP_BOSS_HP_SPECIES: [number, number] = [1.2, 2.4];
/**
 * Dégâts des attaques ordinaires de l'espèce : la fiche est ramenée dans cette plage, puis multipliée par le palier. Un combat
 * de boss dure 5 à 10 fois plus longtemps que celui d'un unique : ses coups ordinaires frappent moins fort que ceux d'un unique
 * (mesuré : sur 40-60 s, ils faisaient l'essentiel des morts du bot), ses compétences spéciales (évitables) portent la menace.
 */
export const MAP_BOSS_DMG_SPECIES: [number, number] = [0.9, 1.3];
export const MAP_BOSS_DMG: Record<number, number> = { 1: 0.7, 2: 0.7, 3: 0.7, 4: 0.72 };
/**
 * Coup de référence des compétences spéciales : `monsterDmg(niveau) × DIFF_MULT × MAP_BOSS_KIT_DMG[palier]` (× affixe de dégâts
 * de la carte), indépendant de l'espèce : un Seigneur venimeux et un Chevalier de l'oubli ont des kits aussi dangereux.
 */
export const MAP_BOSS_KIT_DMG: Record<number, number> = { 1: 1.2, 2: 1.25, 3: 1.3, 4: 1.4 };
/** Délai global entre deux compétences spéciales (s), par palier */
export const MAP_BOSS_GCD: Record<number, number> = { 1: 3.4, 2: 3.0, 3: 2.7, 4: 2.4 };
/** Enrage : après ce temps de combat (s), +ENRAGE_STEP de dégâts toutes les 10 s */
export const MAP_BOSS_ENRAGE_SEC: Record<number, number> = { 1: 150, 2: 180, 3: 210, 4: 240 };
export const MAP_BOSS_ENRAGE_STEP = 0.15;
/** Seuils de phase (part de vie) */
export const MAP_BOSS_PHASES = [0.75, 0.5, 0.25] as const;
/** Arène : rayon autour du point d'apparition qui déclenche le combat ; au-delà de LEASH, le boss rentre et regagne sa vie */
export const MAP_BOSS_ARENA_R = 15;
export const MAP_BOSS_LEASH_R = 32;
/** Vie regagnée hors combat (part de la vie max par seconde) */
export const MAP_BOSS_LEASH_REGEN = 0.02;
/** Renforts : par invocation, plafond de renforts vivants */
export const MAP_BOSS_SUMMON_N = 2;
export const MAP_BOSS_SUMMON_CAP = 5;
/** Bouclier : dégâts subis ×SHIELD_TAKEN tant qu'un gardien vit (au plus SHIELD_SEC) */
export const MAP_BOSS_SHIELD_TAKEN = 0.25;
export const MAP_BOSS_SHIELD_SEC = 12;
/** Contrôles (gel, étourdissement) : durée ×0,5 par contrôle reçu dans les 10 dernières secondes, au moins ×0,125 */
export const MAP_BOSS_CC_DR = 0.5;
export const MAP_BOSS_CC_FLOOR = 0.125;
export const MAP_BOSS_CC_RESET_SEC = 10;

const S = (arch: MapBossArchetype, elem: Element, phase: 0 | 1 | 2 | 3 = 0, fx?: MapBossAuraFx): MapBossSkill => ({ arch, elem, phase, ...(fx ? { fx } : {}) });

/** Kits des 37 cartes : 3 à 5 compétences, la dernière souvent réservée aux phases basses */
export const MAP_BOSS_KITS: Record<string, MapBossKit> = {
  /* ---------- Palier 1 ---------- */
  torajan_jungle: { theme: 'poison', skills: [S('pool', 'poison'), S('nova', 'poison'), S('dot', 'poison', 1), S('charge', 'phys', 3)], phases: ['summon', 'haste', 'frenzy'] },
  zoltun_kulle: { theme: 'shadow', skills: [S('rain', 'light'), S('nova', 'cold'), S('wall', 'fire', 1), S('blink', 'magic', 2)], phases: ['summon', 'shield', 'frenzy'] },
  shadows_westmarch: { theme: 'death', skills: [S('pool', 'magic'), S('nova', 'cold'), S('aura', 'magic', 1, 'lower_resist'), S('blink', 'magic', 3)], phases: ['summon', 'haste', 'summon'] },
  phlegethon: { theme: 'fire', skills: [S('wall', 'fire'), S('rain', 'fire'), S('cone', 'fire', 1), S('charge', 'phys', 2)], phases: ['summon', 'haste', 'frenzy'] },
  lost_temple: { theme: 'light', skills: [S('rain', 'light'), S('nova', 'light'), S('aura', 'magic', 1, 'amplify_damage'), S('blink', 'light', 3)], phases: ['summon', 'shield', 'frenzy'] },
  fall_caldeum: { theme: 'phys', skills: [S('charge', 'phys'), S('cone', 'phys'), S('rain', 'phys', 1), S('summon', 'phys', 2)], phases: ['summon', 'shield', 'frenzy'] },
  ancestral_trial: { theme: 'cold', skills: [S('nova', 'cold'), S('cone', 'cold'), S('aura', 'cold', 1, 'chill'), S('charge', 'phys', 2)], phases: ['summon', 'haste', 'frenzy'] },
  /* ---------- Palier 2 ---------- */
  throne_insanity: {
    theme: 'shadow',
    skills: [S('blink', 'magic'), S('cone', 'fire'), S('aura', 'magic', 1, 'weaken'), S('rain', 'fire', 2), S('pool', 'magic', 3)],
    phases: ['summon', 'haste', 'frenzy'],
  },
  sewers_harrogath: {
    theme: 'poison',
    skills: [S('pool', 'poison'), S('dot', 'poison'), S('nova', 'poison', 1), S('charge', 'phys', 2), S('summon', 'phys', 3)],
    phases: ['summon', 'shield', 'frenzy'],
  },
  ashen_plains: { theme: 'fire', skills: [S('rain', 'fire'), S('wall', 'fire'), S('nova', 'fire', 1), S('charge', 'phys', 3)], phases: ['summon', 'haste', 'frenzy'] },
  sescheron: { theme: 'cold', skills: [S('charge', 'phys'), S('cone', 'cold'), S('nova', 'cold', 1), S('rain', 'cold', 3)], phases: ['summon', 'shield', 'frenzy'] },
  sanatorium: {
    theme: 'death',
    skills: [S('pool', 'poison'), S('dot', 'phys'), S('aura', 'magic', 1, 'life_drain'), S('blink', 'magic', 2), S('summon', 'phys', 3)],
    phases: ['summon', 'haste', 'frenzy'],
  },
  ruined_cistern: { theme: 'poison', skills: [S('nova', 'cold'), S('pool', 'poison'), S('cone', 'poison', 1), S('dot', 'poison', 3)], phases: ['summon', 'shield', 'frenzy'] },
  pandemonium_citadel: { theme: 'fire', skills: [S('rain', 'fire'), S('cone', 'fire'), S('wall', 'fire', 1), S('charge', 'phys', 3)], phases: ['summon', 'shield', 'frenzy'] },
  horazon_memory: {
    theme: 'light',
    skills: [S('blink', 'light'), S('nova', 'light'), S('rain', 'light', 1), S('aura', 'magic', 2, 'mana_burn'), S('pool', 'magic', 3)],
    phases: ['summon', 'haste', 'frenzy'],
  },
  halls_torture: { theme: 'fire', skills: [S('wall', 'fire'), S('charge', 'phys'), S('cone', 'phys', 1), S('rain', 'fire', 3)], phases: ['summon', 'shield', 'frenzy'] },
  /* ---------- Palier 3 ---------- */
  blood_moon: {
    theme: 'phys',
    skills: [S('charge', 'phys'), S('dot', 'phys'), S('aura', 'magic', 1, 'life_drain'), S('cone', 'phys', 2), S('summon', 'phys', 3)],
    phases: ['summon', 'haste', 'frenzy'],
  },
  royal_crypts: {
    theme: 'death',
    skills: [S('nova', 'cold'), S('pool', 'magic'), S('aura', 'magic', 1, 'lower_resist'), S('blink', 'magic', 2), S('summon', 'phys', 3)],
    phases: ['summon', 'shield', 'frenzy'],
  },
  river_blood: { theme: 'fire', skills: [S('wall', 'fire'), S('pool', 'poison'), S('nova', 'fire', 1), S('rain', 'fire', 2), S('charge', 'phys', 3)], phases: ['summon', 'haste', 'frenzy'] },
  kyovashad: { theme: 'light', skills: [S('rain', 'light'), S('nova', 'light'), S('aura', 'magic', 1, 'amplify_damage'), S('blink', 'light', 2)], phases: ['summon', 'shield', 'frenzy'] },
  kehjistan_marketplace: {
    theme: 'poison',
    skills: [S('pool', 'poison'), S('dot', 'poison'), S('summon', 'phys', 1), S('nova', 'poison', 2), S('cone', 'poison', 3)],
    phases: ['summon', 'haste', 'frenzy'],
  },
  arreat_battlefield: { theme: 'phys', skills: [S('charge', 'phys'), S('cone', 'phys'), S('rain', 'phys', 1), S('summon', 'phys', 3)], phases: ['summon', 'shield', 'frenzy'] },
  bastion_keep: {
    theme: 'shadow',
    skills: [S('blink', 'magic'), S('pool', 'magic'), S('aura', 'magic', 1, 'weaken'), S('cone', 'cold', 2), S('summon', 'phys', 3)],
    phases: ['summon', 'haste', 'frenzy'],
  },
  demon_road: { theme: 'fire', skills: [S('nova', 'fire'), S('pool', 'poison'), S('summon', 'phys', 1), S('rain', 'fire', 2), S('dot', 'poison', 3)], phases: ['summon', 'shield', 'frenzy'] },
  skovos_stronghold: { theme: 'light', skills: [S('rain', 'light'), S('nova', 'light'), S('charge', 'phys', 1), S('aura', 'magic', 2, 'mana_burn')], phases: ['summon', 'shield', 'frenzy'] },
  /* ---------- Donjons (scarabée) ---------- */
  plains_torment: {
    theme: 'cold',
    skills: [S('nova', 'cold'), S('rain', 'cold'), S('blink', 'magic', 1), S('pool', 'magic', 2), S('aura', 'magic', 3, 'lower_resist')],
    phases: ['summon', 'shield', 'frenzy'],
  },
  sanctuary_sin: {
    theme: 'cold',
    skills: [S('charge', 'phys'), S('cone', 'cold'), S('aura', 'cold', 1, 'chill'), S('rain', 'phys', 2), S('summon', 'phys', 3)],
    phases: ['summon', 'haste', 'frenzy'],
  },
  steppes_daken: { theme: 'phys', skills: [S('charge', 'phys'), S('rain', 'phys'), S('cone', 'phys', 1), S('summon', 'phys', 2), S('dot', 'phys', 3)], phases: ['summon', 'shield', 'frenzy'] },
  /* ---------- Cartes uniques ---------- */
  city_ureh: { theme: 'light', skills: [S('rain', 'light'), S('nova', 'light'), S('blink', 'light', 1), S('aura', 'magic', 2, 'mana_burn')], phases: ['summon', 'haste', 'frenzy'] },
  fallen_gardens: { theme: 'fire', skills: [S('nova', 'fire'), S('rain', 'fire'), S('summon', 'phys', 1), S('wall', 'fire', 3)], phases: ['summon', 'haste', 'frenzy'] },
  imperial_palace: { theme: 'poison', skills: [S('charge', 'phys'), S('pool', 'poison'), S('cone', 'poison', 1), S('summon', 'phys', 2)], phases: ['summon', 'shield', 'frenzy'] },
  djinn_domain: { theme: 'light', skills: [S('blink', 'light'), S('rain', 'light'), S('nova', 'fire', 1), S('cone', 'fire', 3)], phases: ['summon', 'shield', 'frenzy'] },
  zhar_sanctum: {
    theme: 'shadow',
    skills: [S('blink', 'magic'), S('nova', 'cold'), S('rain', 'fire', 1), S('wall', 'fire', 2), S('aura', 'magic', 3, 'mana_burn')],
    phases: ['summon', 'haste', 'frenzy'],
  },
  nakrul_abyss: {
    theme: 'death',
    skills: [S('pool', 'magic'), S('aura', 'magic', 0, 'lower_resist'), S('blink', 'magic', 1), S('dot', 'poison', 2), S('summon', 'phys', 3)],
    phases: ['summon', 'shield', 'frenzy'],
  },
  warlord_blood: { theme: 'phys', skills: [S('charge', 'phys'), S('cone', 'phys'), S('dot', 'phys', 1), S('summon', 'phys', 2)], phases: ['summon', 'haste', 'frenzy'] },
  ruins_vizjun: { theme: 'shadow', skills: [S('rain', 'light'), S('nova', 'cold'), S('wall', 'fire', 1), S('blink', 'magic', 3)], phases: ['summon', 'shield', 'frenzy'] },
  outer_void: {
    theme: 'shadow',
    skills: [S('pool', 'magic'), S('blink', 'magic'), S('nova', 'poison', 1), S('aura', 'magic', 2, 'weaken'), S('summon', 'phys', 3)],
    phases: ['summon', 'haste', 'frenzy'],
  },
};

/** Kit d'une carte (kit générique si la carte n'en a pas : ne devrait pas arriver, test) */
export function mapBossKit(zone: string): MapBossKit {
  return MAP_BOSS_KITS[zone] ?? { theme: 'phys', skills: [S('charge', 'phys'), S('cone', 'phys'), S('rain', 'phys', 1)], phases: ['summon', 'haste', 'frenzy'] };
}
