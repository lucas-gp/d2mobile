/**
 * Règles de combat de la base : Diablo II LoD 1.13c (lot M8a). Implémentations des règles nommées `combat.*` (src/mods/rules.ts) quand
 * aucun mod ne les remplace. Sources : tables des MPQ du joueur (DifficultyLevels.txt, MonStats.txt : src/mods/d2/tables.ts) et code du
 * jeu 1.10f tel que reconstitué par D2MOO (D2Game : SUnitDmg.cpp, SkillItem.cpp, SkillNec.cpp ; mêmes formules en 1.13c), cités fonction
 * par fonction. Le moteur n'a pas les unités entières (1/256 de point) de D2 : les valeurs restent en points, arrondies là où D2 arrondit.
 * Module feuille (types et tables seulement).
 */
import type { DamagePacket, Monster, Player } from '../../sim/actors';
import type { World } from '../../sim/world';
import { D2_DIFFICULTY, D2_MONSTER_COMBAT } from './tables';

/** Une résistance de 100 ou plus est une immunité (D2) */
const IMMUNE = 100;
/** Ralentissement du froid d'un monstre absent de MonStats (valeur de D2 pour le joueur, SUNITDMG_GetColdEffect) */
const COLD_EFFECT_DEFAULT = -50;
/** Durée des blessures ouvertes (images, SKILLITEM_EventFunc15_OpenWounds) */
const OPEN_WOUNDS_FRAMES = 200;
/** Images par seconde de D2 (le moteur tourne aussi à 25 Hz) */
const FPS = 25;

/** Boss au sens de D2 : drapeau `boss` de MonStats (Andariel… Baal, Izual, Griswold, Blood Raven…) ; hors MonStats, le rang du moteur */
export function isD2Boss(m: Monster): boolean {
  const t = D2_MONSTER_COMBAT[m.def.id];
  return t ? !!t.boss : m.rank === 'boss';
}

/**
 * Résistance effective d'un monstre. D2 : les réductions des malédictions et des auras (Résistance réduite, Conviction) ne comptent que
 * pour 1/5 sur un monstre dont la résistance de base est d'au moins 100 (SkillNec.cpp : `nValue /= 5`), et cassent l'immunité si la
 * résistance tombe sous 100 ; les pénétrations (maîtrises, « −% à la résistance ennemie ») ne s'appliquent que sous 100
 * (SUNITDMG_ApplyResistancesAndAbsorb : `nResValue < 100`) ; plancher −100 %, aucun plafond sous 100 ; aucune charme de brisure (D2R).
 * `soft` (réduction « douce » d'une compétence) s'applique comme une pénétration.
 */
export function monsterRes(baseRes: number, pierce: number, _sunder: boolean, reduction = 0, soft = 0): { res: number; immune: boolean } {
  let res = baseRes - (baseRes >= IMMUNE ? Math.trunc(reduction / 5) : reduction);
  if (res >= IMMUNE) return { res, immune: true };
  res -= soft + pierce;
  return { res: Math.max(-100, res), immune: false };
}

/**
 * Vol de vie et de mana d'un coup du joueur. D2 (SUNITDMG_ExecuteEvents) : sur les dégâts physiques infligés, plafonnés à la vie qui
 * restait au monstre ; × Drain de MonStats (par difficulté, 0 : rien) ; ÷ LifeStealDivisor / ManaStealDivisor de DifficultyLevels.txt
 * (1 / 2 / 3). `p.leechMul` : part propre à la compétence.
 */
export function leech(w: World, m: Monster, p: DamagePacket, physDealt: number, hpBefore: number): { life: number; mana: number } {
  const pl = w.player;
  const d = w.difficulty;
  const drain = D2_MONSTER_COMBAT[m.def.id]?.drain[d] ?? 100;
  if (drain <= 0) return { life: 0, mana: 0 };
  const base = (Math.min(physDealt, Math.max(0, hpBefore)) * (p.leechMul ?? 1) * drain) / 100;
  return {
    life: pl.d.lifeLeech > 0 ? Math.floor((base * pl.d.lifeLeech) / 100 / D2_DIFFICULTY.LifeStealDivisor[d]) : 0,
    mana: pl.d.manaLeech > 0 ? Math.floor((base * pl.d.manaLeech) / 100 / D2_DIFFICULTY.ManaStealDivisor[d]) : 0,
  };
}

/**
 * Dégâts d'un coup écrasant réussi. D2 (SKILLITEM_EventFunc16_CrushingBlow) : vie actuelle ÷ 4, ÷ 8 pour un boss (MonStats) ou un super-unique ;
 * diviseur doublé pour un projectile ; réduits par la résistance physique positive (plafond 100 %), jamais augmentés par une résistance
 * négative ; en solo, aucun ajustement au nombre de joueurs.
 */
export function crushingBlow(_w: World, m: Monster, p: DamagePacket, _player: Player | null, res: number): number {
  let div = isD2Boss(m) || m.su ? 8 : 4;
  if (p.ar !== undefined || p.ranged) div *= 2;
  const dr = Math.min(100, Math.max(0, res));
  return (Math.floor(m.hp / div) * (100 - dr)) / 100;
}

/**
 * Coup critique et frappe mortelle d'une attaque d'arme. D2 (SUNITDMG_FillDamageValues) : critique de la maîtrise, sinon frappe mortelle
 * des objets, chacun tiré à son tour ; l'un ou l'autre double les dégâts physiques ; aucun plafond.
 */
export function criticalMul(w: World, crit: number): number {
  if (crit > 0 && w.rng.combat.chance(crit / 100)) return 2;
  const deadly = w.player.d.all.get('deadlyStrike') ?? 0;
  if (deadly > 0 && w.rng.combat.chance(deadly / 100)) return 2;
  return 1;
}

/** Valeur de base du saignement par image (1/256 de point) selon le niveau (SKILLITEM_CalculateOpenWoundsHpRegen) */
export function openWoundsPerFrame(clvl: number): number {
  const L = Math.max(1, clvl);
  const v = [9, 18, 27, 36, 45];
  let r: number;
  if (L <= 1) r = 0;
  else if (L > 60) r = v[4] * (L - 60) + 15 * (v[1] + v[2] + v[3]) + 14 * v[0];
  else if (L > 45) r = v[3] * (L - 45) + 15 * (v[1] + v[2]) + 14 * v[0];
  else if (L > 30) r = 15 * v[1] + v[2] * (L - 30) + 14 * v[0];
  else if (L > 15) r = v[1] * (L - 15) + 14 * v[0];
  else r = v[0] * (L - 1);
  return r + 40;
}

/**
 * Blessures ouvertes (objets). D2 (SKILLITEM_EventFunc15_OpenWounds) : chance de l'objet ; saignement de 8 s selon le niveau du
 * personnage, moitié sur un champion ou un unique ; un nouveau saignement remplace l'ancien.
 */
export function openWounds(w: World, t: Monster, _dealt: number): void {
  const chance = w.player.d.all.get('openWounds') ?? 0;
  if (chance <= 0 || t.dead || !w.rng.combat.chance(Math.min(100, chance) / 100)) return;
  let perFrame = openWoundsPerFrame(w.character.level);
  if (t.rank === 'champion' || t.rank === 'unique') perFrame = Math.trunc(perFrame / 2);
  t.bleedDps = (perFrame / 256) * FPS;
  t.bleedStacks = 1;
  t.bleedT = OPEN_WOUNDS_FRAMES;
}

/** Saignement d'une image (D2 : perte de vie de l'état, sans résistance) */
export function bleedTick(m: Monster, dt: number): number {
  return (m.bleedDps ?? 0) * dt;
}

/**
 * Froid et gel infligés à un monstre (froid non bloqué par une immunité). D2 (SUNITDMG_ApplyColdState, SUNITDMG_ApplyFreezeState) :
 * durées réduites par la résistance au froid (table des dégâts : « Clen », « Flen »), puis divisées par MonsterColdDivisor /
 * MonsterFreezeDivisor (1 / 2 / 4) ; ralentissement = coldeffect de MonStats, quelle que soit la source du froid (le ralentissement
 * générique `chillPct` des compétences n'est pas repris ; aucun si coldeffect est nul ou positif) ; un boss ou un unique n'est pas gelé :
 * le gel devient un froid de même durée.
 */
export function chillAndFreeze(w: World, m: Monster, p: DamagePacket, coldRes: () => number): void {
  const d = w.difficulty;
  const effect = D2_MONSTER_COMBAT[m.def.id]?.cold[d] ?? COLD_EFFECT_DEFAULT;
  if (effect >= 0) return;
  const chill = p.chill ?? 0;
  const freeze = p.freeze ?? 0;
  if (chill <= 0 && freeze <= 0) return;
  const keep = (100 - Math.min(100, coldRes())) / 100;
  const cold = (len: number): void => {
    const t = Math.max(1, Math.floor(Math.floor(len * keep) / D2_DIFFICULTY.MonsterColdDivisor[d]));
    m.chillT = Math.max(m.chillT, t);
    m.chillPct = Math.max(m.chillPct, -effect / 100);
  };
  if (chill > 0) cold(chill);
  if (freeze > 0) {
    if (isD2Boss(m) || m.rank === 'unique') cold(freeze);
    else m.freezeT = Math.max(m.freezeT, Math.floor(Math.floor(freeze * keep) / D2_DIFFICULTY.MonsterFreezeDivisor[d]));
  }
}

/** Part absorbée au plus par l'absorption élémentaire en pourcentage (D2 : 40 %, SUNITDMG_ApplyResistancesAndAbsorb) */
export const ABSORB_PCT_MAX = 40;

/**
 * Un coup reçu met-il le joueur en récupération après coup (FHR) ? D2 : seulement si les dégâts du coup atteignent 1/12 de sa vie
 * maximale (Arreat Summit, « Faster Hit Recovery » ; Amazon Basin) : un Déchu qui frappe pour 2 n'interrompt pas un Barbare de 60 points
 * de vie. Le blocage, lui, déclenche toujours sa récupération (FBR).
 */
export function playerHitRecovery(dealt: number, hpMax: number): boolean {
  return dealt * 12 >= hpMax;
}
