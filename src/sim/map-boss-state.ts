/**
 * État d'un boss de carte porté par le monstre (`Monster.mapBoss`, sauvegardé avec lui) : module feuille de types, pour que `actors.ts` le
 * décrive (et l'interface l'affiche) sans dépendre de la logique du boss, qui vient d'un mod (mods/pd2/sim/map-boss.ts).
 */
import type { Element } from '../data/stats';

/** Archétype d'une compétence spéciale de boss de carte */
export type MapBossArchetype = 'nova' | 'cone' | 'rain' | 'wall' | 'charge' | 'summon' | 'aura' | 'pool' | 'blink' | 'shield' | 'dot';
/** Effet de l'aura punitive d'un boss de carte */
export type MapBossAuraFx = 'lower_resist' | 'weaken' | 'amplify_damage' | 'mana_burn' | 'life_drain' | 'chill';

/** Impact différé d'une compétence (résolu au tick `at`) */
export interface MapBossAction {
  at: number;
  arch: MapBossArchetype;
  elem: Element;
  x: number;
  y: number;
  r: number;
  /** Dégâts bruts de l'impact */
  dmg: number;
  /** Cône : direction et demi-angle */
  ang?: number;
  half?: number;
  fx?: MapBossAuraFx;
}

export interface MapBossState {
  zone: string;
  tier: number;
  engaged: boolean;
  startTick: number;
  /** 0 : plus de 75 % ; 1 : sous 75 % ; 2 : sous 50 % ; 3 : sous 25 % */
  phase: number;
  nextAt: number;
  /** Tick où chaque compétence du kit redevient disponible */
  cds: number[];
  lockUntil: number;
  actions: MapBossAction[];
  adds: number[];
  wards: number[];
  shieldUntil: number;
  /** Contrôles reçus récemment (rendements décroissants) */
  cc: number;
  ccTick: number;
  lastFreeze: number;
  lastStun: number;
  outTicks: number;
  leashed: boolean;
  dot: number;
  dotUntil: number;
  dotNext: number;
  dotElem: Element;
  dotDmg: number;
  baseMin: number;
  baseMax: number;
  baseSpeed: number;
  enrage: number;
  haste: boolean;
  frenzy: boolean;
  /** Coup de référence des compétences spéciales (mapBossKitHit, avant enrage) */
  hit: number;
  /** Dégâts infligés au joueur par archétype (impacts différés et poison cumulable ; mesure) */
  dealt: Partial<Record<MapBossArchetype, number>>;
}
