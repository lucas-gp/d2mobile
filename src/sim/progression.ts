/** Expérience, montée de niveau, pénalité d'écart de niveau (D2), récompenses de progression. */
import { fireProcs } from './procs';
import { XP_TABLE, MAX_LEVEL, expRatio } from '../data/xp';
import { RATES } from '../data/rates';
import { RULES } from '../mods/rules';
import type { Monster } from './actors';
import type { World } from './world';
import type { CharacterState } from './character-state';

/** Expérience cumulée nécessaire pour atteindre le niveau L */
export function xpToReach(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return Infinity;
  return XP_TABLE[level - 1];
}

/** Part de l'expérience gagnée selon l'écart entre niveau du monstre (mlvl) et du personnage (clvl) : règle `xp.levelFactor` */
export function levelDiffMultiplier(clvl: number, mlvl: number): number {
  return RULES['xp.levelFactor'](clvl, mlvl);
}

/** Facteur d'accélération de l'expérience au niveau donné (courbe de rates.ts) */
function xpCurveAt(clvl: number): number {
  const k = RATES.xpCurve;
  if (clvl <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (clvl <= k[i][0]) {
      const [l0, f0] = k[i - 1];
      const [l1, f1] = k[i];
      return f0 + ((f1 - f0) * (clvl - l0)) / (l1 - l0);
    }
  }
  return k[k.length - 1][1];
}

export function xpForKill(w: World, m: Monster): number {
  const c = w.character;
  if (c.level >= MAX_LEVEL) return 0;
  const base = m.xp * RATES.xp * xpCurveAt(c.level);
  const mul = levelDiffMultiplier(c.level, m.mlvl) * expRatio(c.level) * (1 + w.player.d.xpPct / 100);
  let mapBonus = 0;
  for (const mod of w.mapMods) if (mod.id === 'xpBonus') mapBonus += mod.value;
  return Math.floor(base * mul * (1 + mapBonus / 100));
}

/** Ajoute de l'expérience ; gère les montées de niveau multiples. Renvoie le nombre de niveaux gagnés. */
export function addXp(c: CharacterState, amount: number): number {
  if (c.level >= MAX_LEVEL) return 0;
  c.xp += amount;
  let gained = 0;
  while (c.level < MAX_LEVEL && c.xp >= xpToReach(c.level + 1)) {
    c.level++;
    c.statPoints += 5;
    c.skillPoints += 1;
    gained++;
  }
  if (c.level >= MAX_LEVEL) c.xp = xpToReach(MAX_LEVEL);
  return gained;
}

export function gainXp(w: World, amount: number): void {
  const before = w.character.level;
  const g = addXp(w.character, amount);
  if (g > 0) {
    w.refreshPlayer();
    // D2 : la montée de niveau restaure toute la vie et tout le mana
    const p = w.player;
    p.hp = p.hpMax;
    p.mana = p.manaMax;
    for (let l = before + 1; l <= w.character.level; l++) w.events.push({ t: 'levelUp', level: l });
    fireProcs(w, 'LevelUp', null);
  }
}

/** Death penalty: experience lost (rule `death.xpPenalty`; base D2/PD2: 0 % of the level's span in Normal, 5 % in Nightmare, 10 % in Hell) */
export function deathPenalty(c: CharacterState, difficulty: number): number {
  const loss = RULES['death.xpPenalty'](c, difficulty);
  c.xp -= Math.max(0, loss);
  return loss;
}

/**
 * Lot 316 — gold lost at a death, as Diablo II (single player): a share of the gold carried equal to the character's level in percent,
 * at most 20 %, the first 500 gold per level exempt (a level 10 hero with 5 000 gold loses nothing); the stash is never touched, the same
 * in every difficulty. In Diablo II the rest of the gold carried falls on the corpse; the owner chose no corpse (lot 316): only this share
 * is lost, the rest stays carried.
 */
export function deathGoldLoss(level: number, gold: number): number {
  const exempt = 500 * Math.max(1, level);
  const pct = Math.min(20, Math.max(1, level)) / 100;
  return Math.max(0, Math.floor((gold - exempt) * pct));
}

/** Progression dans le niveau en cours (0..1) */
export function levelProgress(c: CharacterState): number {
  if (c.level >= MAX_LEVEL) return 1;
  const a = xpToReach(c.level);
  const b = xpToReach(c.level + 1);
  return (c.xp - a) / (b - a);
}
