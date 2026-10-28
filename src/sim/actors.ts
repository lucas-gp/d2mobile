/** Types des entités de la simulation (données pures, sérialisables). */
import type { MapBossState } from './map-boss-state';
import type { Element } from '../data/stats';
import type { MonsterDef, MonsterRank } from '../data/types';
import type { DerivedStats } from './derived';
import type { Item } from './item';

type Mode = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'death';

interface ActorBase {
  id: number;
  team: 0 | 1;
  x: number;
  y: number;
  /** Position au tick précédent (interpolation du rendu) */
  px: number;
  py: number;
  radius: number;
  facing: number;
  hp: number;
  hpMax: number;
  mode: Mode;
  modeT: number;
  modeLen: number;
  dead: boolean;
  deathTick: number;
  /** Ralentissement (ticks restants) et intensité (0..1) */
  chillT: number;
  chillPct: number;
  freezeT: number;
  stunT: number;
  burnDps: number;
  burnT: number;
  /** Dernier tick où l'acteur a été touché (flash de rendu) */
  lastHitTick: number;
}

export interface Monster extends ActorBase {
  kind: 'monster';
  /** Lot 312: a copy shown in the current zone of an entity of a neighbouring zone joined edge to edge (src/sim/seam-worlds.ts): not simulated here */
  mirror?: true;
  def: MonsterDef;
  mlvl: number;
  rank: MonsterRank;
  name: string;
  /** Modificateurs de champion / unique (ex. 'fireEnchanted', 'extraFast') */
  mods: string[];
  res: Record<Element, number>;
  dmgMin: number;
  dmgMax: number;
  ar: number;
  defense: number;
  xp: number;
  speed: number;
  scale: number;
  tint: number;
  aggro: boolean;
  /** Index d'attaque en cours */
  atk: number;
  atkCd: number[];
  atkTarget: { x: number; y: number };
  atkApplied: boolean;
  spawnX: number;
  spawnY: number;
  leader: number;
  /** Tick jusqu'auquel l'IA ne réévalue pas sa direction (économie) */
  thinkTick: number;
  /** Fuite temporaire (Déchus qui s'égaillent quand un des leurs meurt, comme dans D2) */
  fleeUntil?: number;
  /** Jusqu'à ce tick, le monstre ne guérit plus (« empêche les monstres de guérir ») */
  noHealUntil?: number;
  wanderX: number;
  wanderY: number;
  /** Pour les boss : phase / compteur */
  phase: number;
  /** Loup redoutable : enragé (+100 % de dégâts) jusqu'à ce tick, après avoir dévoré un cadavre */
  rageUntil?: number;
  summoned: number;
  /** Aura (unique « Aura Enchanted ») */
  aura?: string;
  /** Ne lâche pas de butin (invocations) */
  noLoot?: boolean;
  /** Réductions de résistance temporaires (Inferno, Champ statique) : cassent les immunités à ½ */
  red: Partial<Record<Element, { v: number; until: number; soft?: boolean }>>;
  /** Identifiant d'apparition pour éviter les doublons au rechargement */
  spawnKey: string;
  /** Tourelle alliée (Hydre) */
  isSummon?: boolean;
  /** Boss de la run : sa mort termine la run */
  runBoss?: boolean;
  /** Boss de carte : état du combat de boss (phases, compétences, laisse ; mods/pd2/sim/map-boss.ts) */
  mapBoss?: MapBossState;
  /** Dernier mercenaire à l'avoir frappé (vie regagnée par le mercenaire à sa mort) */
  mercHit?: number;
  /** Gardien d'un sceau du Sanctuaire du Chaos */
  sealGuard?: boolean;
  summonSkill?: string;
  summonLevel?: number;
  /** Ombre de l'Assassin : charges d'arts martiaux et cycle propres (buffs « charge_* », « asn_cycle »), échangés avec ceux du joueur le temps d'un lancer */
  shadowCharges?: PlayerBuff[];
  /** Ombre de l'Assassin : tick du prochain lancer de compétence permis */
  shadowNextCast?: number;
  expireTick?: number;
  /** ticks consécutifs d'immobilité d'un allié qui suit le joueur de loin (anti-coincement, voir World.allyStuck) */
  stuckT?: number;
  /** Créature du Druide (loup, corbeau, liane, esprit…) : identifiant de la compétence ; les monstres peuvent la cibler */
  pet?: string;
  /** Corbeaux : coups restants avant de s'envoler */
  hitsLeft?: number;
  /** Cible de la créature, ou du monstre quand il attaque une créature (0 : le joueur) */
  tgt?: number;
  /** Tick the target `tgt` was taken (rule `ai.targetLock`, lot 301) */
  tgtAt?: number;
  /** Poison sur la durée (Rage, Liane empoisonnée) */
  poisonDps?: number;
  poisonT?: number;
  /** Blessures ouvertes (saignement physique sur la durée) */
  bleedDps?: number;
  bleedT?: number;
  /** Nombre d'instances de blessures ouvertes empilées (max 3) */
  bleedStacks?: number;
  /** Cadavre déjà dévoré (lianes, loups redoutables) */
  eaten?: boolean;
  /**
   * Affaiblissements (cris du Barbare, malédictions du Nécromancien) : multiplicateurs de dégâts,
   * de score d'attaque, de défense et de vitesse, valables jusqu'à `debuffUntil`
   */
  dmgMul?: number;
  arMul?: number;
  /** Cartes : vitesse d'attaque (affixe « Rapide ») et vol de vie par coup (affixe « de Sangsue »), en % */
  atkSpdPct?: number;
  leechPct?: number;
  defMul?: number;
  slowMul?: number;
  /** Malédictions PD2 : multiplicateur de vitesse de déplacement (Terreur, Décrépitude) et de cadence d'attaque et de sort (Confusion, Décrépitude) */
  curseMove?: number;
  curseAtk?: number;
  /** Poison de Frappe empoisonnée : à la mort du porteur, un nuage se libère (dégâts par seconde, durée en ticks) */
  psCloud?: { dps: number; ticks: number };
  /** Cadavre créé par Profanation (au plus dix à la fois) */
  desecrated?: boolean;
  debuffUntil?: number;
  /** Malédiction active (une seule à la fois, comme D2) */
  curse?: { id: string; until: number; level: number; src: number; v?: number };
  /** Malédictions actives (PD2 : jusqu'à trois avec Maîtrise des malédictions) ; `curse` est la dernière posée */
  curses?: { id: string; until: number; level: number; src: number; v?: number }[];
  /** Dégâts renvoyés au monstre qui frappe au corps à corps (Vierge de fer, %) */
  reflect?: number;
  /** Projectiles ralentis (Ralentissement) : facteur de vitesse des projectiles tirés, jusqu'à la fin de l'affaiblissement */
  missileMul?: number;
  slowMissileUntil?: number;
  /** Aveuglé (Vision réduite) : ne voit plus qu'à cette distance */
  blindUntil?: number;
  /** Confus : frappe au hasard alliés et ennemis jusqu'à ce tick */
  confusedUntil?: number;
  /** Attraction : ce monstre se jette sur celui d'identifiant attractTarget jusqu'à attractUntil */
  attractUntil?: number;
  attractTarget?: number;
  /** Converti : combat pour le joueur jusqu'à ce tick (Conversion, Souffle mental) */
  convertedUntil?: number;
  /** Aura portée par le monstre (Aura enchantée, auras fixes) et son niveau */
  auraId?: string;
  auraLvl?: number;
  /** Bonus reçus d'une aura alliée (Puissance, Concentration, Fanatisme, Vigueur), valables jusqu'à `until` */
  auraBuff?: { dmg: number; ar: number; spd: number; atk: number; until: number };
  /** Régénération (PV par seconde, D2 DamageRegen ; 0 pour les super-uniques) */
  regen?: number;
  /** Super-unique (clé de SUPER_UNIQUE_DEFS) */
  su?: string;
  /** Relevé par sa propre compétence (Self-resurrect) : ne se relève plus */
  revived?: boolean;
  /** Dernière décharge de l'Enchanté par la foudre */
  lastBoltTick?: number;
}

export interface PlayerBuff {
  id: string;
  level: number;
  until: number;
  /** Charges cumulées (Rage sauvage, Mutilation) */
  stacks?: number;
}

interface PendingCast {
  skill: string;
  tx: number;
  ty: number;
  targetId: number;
  released: boolean;
  releaseAt: number;
  /** Instants (modeT) des frappes suivantes d'une compétence à frappes multiples (voir rhythm.ts) */
  strikes?: number[];
  /** Nombre de frappes suivantes déjà jouées */
  strikesDone?: number;
}

export interface Player extends ActorBase {
  kind: 'player';
  d: DerivedStats;
  mana: number;
  manaMax: number;
  cast: PendingCast | null;
  /** Poison reçu (D2) : dégâts par tick et ticks restants ; le plus fort remplace, sans cumul */
  poisonT: number;
  poisonRate: number;
  /** Soin sur la durée des potions */
  healT: number;
  healPerTick: number;
  manaHealT: number;
  manaHealPerTick: number;
  potionCd: number;
  buffs: PlayerBuff[];
  /** Mana absorbé par Bouclier d'énergie */
  shieldActive: boolean;
  /** Cible de déplacement automatique (ramassage, interaction) */
  goal: { x: number; y: number; kind: 'pickup' | 'interact' | 'move'; ref: number } | null;
  /** Temps de recharge par compétence (tick de disponibilité) */
  cooldowns: Record<string, number>;
  /** Tick de la dernière mort (pour l'écran de mort) */
  lastDeathTick: number;
  /** Tick avant lequel Esquive et Dérobade ne peuvent plus éviter une attaque (délai de 4 images) */
  dodgeAt?: number;
  /** Malus de dégâts des sorts après téléportation (PD2) */
  tpPenaltyUntil: number;
  tpPenaltyPct: number;
  /** Armure du cyclone : dégâts élémentaires encore absorbables */
  absorbPool?: number;
  /** Armure d'os : dégâts physiques encore absorbables */
  boneAbsorb?: number;
  /** Distorsion de sang (PD2) : vie cédée qui revient en 5 s */
  warpRegen?: { left: number; perTick: number };
  /** Malédictions et auras de monstres subies (amplify, weaken, decrepify, defense_curse, lower_resist, conviction) */
  hexes?: Partial<Record<string, { lvl: number; until: number }>>;
}

export interface DamagePacket {
  phys: number;
  fire: number;
  cold: number;
  light: number;
  poison: number;
  magic: number;
  /** Durées d'effets (ticks) */
  chill?: number;
  chillPct?: number;
  freeze?: number;
  stun?: number;
  burn?: { dps: number; ticks: number };
  /** Poison sur la durée infligé aux monstres (dégâts par seconde) */
  poisonDot?: { dps: number; ticks: number };
  /** Coup venant d'un sort (pas de test de toucher) */
  spell: boolean;
  /** Coup d'un projectile (défense contre les projectiles) */
  ranged?: boolean;
  /** Multiplicateur du vol de vie / mana de ce coup (dégâts de zone de mêlée : ½) */
  leechMul?: number;
  /** Compétence source (pour les maîtrises et journaux) */
  skill?: string;
  /** Recul */
  knockback?: number;
  /** Chances (%) de repousser chaque victime (toujours si absent) */
  knockbackPct?: number;
  /** Frappe écrasante % */
  crush?: number;
  /** Efficacité du coup écrasant (+ %, s'ajoute à celle des objets) : Châtiment */
  crushEff?: number;
  /** Score d'attaque d'un projectile d'arme (test de toucher à l'impact) */
  ar?: number;
  /** Pénétration des résistances de l'attaquant (mercenaire : carquois), en points de % par élément */
  pierceRes?: Partial<Record<Element, number>>;
  /** Chance (%) que le projectile traverse sa victime (Perforation) */
  pierceChance?: number;
  /** Perte de dégâts par perforation, en part des dégâts d'origine (Tir multiple : 0,2 par ennemi traversé, plancher 20 %) */
  pierceDecay?: number;
  /** Nombre maximal d'ennemis traversés (Flèche guidée : 2, Furie de la foudre : 6) */
  pierceMax?: number;
  srcX?: number;
  srcY?: number;
}

export function emptyPacket(spell = true): DamagePacket {
  return { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0, spell };
}

export interface Missile {
  id: number;
  kind: string;
  team: 0 | 1;
  owner: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  dmg: DamagePacket;
  pierce: boolean;
  hits: number[];
  /** Point cible (Météore, boule de feu au sol) */
  tx: number;
  ty: number;
  level: number;
  /** Données spécifiques au comportement */
  t0: number;
  aux: number;
  elem: Element;
  /** Hauteur visuelle (rendu) */
  z: number;
  /** Lancer fractionné : 0 en route vers sa portée maximale, 1 sur le chemin du retour (30 % des dégâts, perforant) */
  ret?: number;
  /** Lancé par une ombre de l'Assassin (`owner`) : c'est elle l'attaquante ; disparaît avec elle */
  shadow?: boolean;
  /** Lot 312: a copy shown in the current zone of an entity of a neighbouring zone joined edge to edge (src/sim/seam-worlds.ts): not simulated here */
  mirror?: true;
  dead: boolean;
}

export interface AreaEffect {
  id: number;
  kind: string;
  team: 0 | 1;
  owner: number;
  x: number;
  y: number;
  /** Pour les murs de feu : segment */
  x2: number;
  y2: number;
  radius: number;
  life: number;
  maxLife: number;
  every: number;
  dmg: DamagePacket;
  level: number;
  elem: Element;
  aux: number;
  /** Météore : durée du sol en feu (ticks ; absente : celle du moteur, 40) */
  burn?: number;
  /** Posée par une ombre de l'Assassin (`owner`) : c'est elle l'attaquante ; disparaît avec elle */
  shadow?: boolean;
  /** Lot 312: a copy shown in the current zone of an entity of a neighbouring zone joined edge to edge (src/sim/seam-worlds.ts): not simulated here */
  mirror?: true;
  dead: boolean;
}

export interface GroundItem {
  id: number;
  item: Item;
  x: number;
  y: number;
  dropTick: number;
  /** Visible selon le filtre (0 = masqué) */
  show: number;
  /** Lot 312: a copy shown in the current zone of an entity of a neighbouring zone joined edge to edge (src/sim/seam-worlds.ts): not simulated here */
  mirror?: true;
}

export interface WorldObject {
  id: number;
  kind: string;
  x: number;
  y: number;
  radius: number;
  used: boolean;
  variant?: string;
  ref?: string;
  label: string;
  /** sanctuaire, puits : tick où il se réarme (shrines.txt « reset time ») */
  resetAt?: number;
  /** puits : gorgées restantes */
  uses?: number;
  /** Lot 312: a copy shown in the current zone of an entity of a neighbouring zone joined edge to edge (src/sim/seam-worlds.ts): not simulated here */
  mirror?: true;
}

/** Malédiction `id` active sur un monstre (PD2 : plusieurs à la fois), ou null */
export function activeCurse(m: Monster, id: string, tick: number): NonNullable<Monster['curses']>[number] | null {
  const list = m.curses ?? (m.curse ? [m.curse] : []);
  return list.find((c) => c.id === id && c.until > tick) ?? null;
}

/** Options d'apparition d'un monstre (`spawnMonster`) */
export interface SpawnOptions {
  rank: MonsterRank;
  uniqueName?: string;
  leader?: number;
  inheritMods?: string[];
  noLoot?: boolean;
  /** Gardiens de sceau (leur mort est obligatoire) : résistances de base, sans variante ni immunité */
  baseRes?: boolean;
  /** Boss de carte (mods/pd2/sim/map-boss.ts) : vie et dégâts de boss, sans modificateur aléatoire, kit de compétences */
  mapBoss?: boolean;
}
