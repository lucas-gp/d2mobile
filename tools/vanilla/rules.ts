/**
 * Constantes des règles de la base (Diablo II LoD 1.13c, lot M8) tirées des MPQ du joueur : colonnes numériques de DifficultyLevels.txt,
 * caractéristiques des classes (CharStats.txt)
 * (vol de vie, durée du froid et du gel des monstres, pénalité de résistance…) et colonnes de combat de MonStats.txt par monstre du jeu
 * (Drain : efficacité du vol de vie ; coldeffect : ralentissement du froid, par difficulté ; boss : drapeau de MonStats). Rien n'est écrit ici : voir gen.ts (table
 * `rules`, fichier src/mods/d2/tables.ts).
 */
import { rows, num } from '../audit/common';

type Tri = [number, number, number];

/** Colonnes de DifficultyLevels.txt reprises (toutes numériques), dans l'ordre de la table */
export const DIFFICULTY_COLUMNS = [
  'ResistPenalty',
  'DeathExpPenalty',
  'MonsterSkillBonus',
  'MonsterFreezeDivisor',
  'MonsterColdDivisor',
  'AiCurseDivisor',
  'LifeStealDivisor',
  'ManaStealDivisor',
  'UniqueDamageBonus',
  'ChampionDamageBonus',
  'HireableBossDamagePercent',
  'MonsterCEDamagePercent',
  'StaticFieldMin',
] as const;

/** Une valeur par difficulté (Normal, Cauchemar, Enfer) pour chaque colonne reprise */
export function difficultyLevels(): Record<string, Tri> {
  const r = rows('DifficultyLevels');
  if (r.length < 3) throw new Error('DifficultyLevels.txt : trois difficultés attendues');
  return Object.fromEntries(DIFFICULTY_COLUMNS.map((c) => [c, [0, 1, 2].map((d) => num(r[d][c])) as Tri]));
}

/** Drain, coldeffect et drapeau boss de MonStats.txt pour chaque monstre du jeu (`monsters` : identifiant du jeu → ligne de MonStats, `d2`) */
export function monsterCombat(monsters: Record<string, { d2: string }>): Record<string, { drain: Tri; cold: Tri; boss: boolean }> {
  const byId = new Map(rows('MonStats').map((x) => [x.Id, x]));
  const out: Record<string, { drain: Tri; cold: Tri; boss: boolean }> = {};
  for (const [id, f] of Object.entries(monsters)) {
    const m = byId.get(f.d2);
    if (!m) throw new Error(`MonStats : ligne ${f.d2} absente (monstre ${id})`);
    out[id] = {
      drain: [num(m.Drain), num(m['Drain(N)']), num(m['Drain(H)'])],
      cold: [num(m.coldeffect), num(m['coldeffect(N)']), num(m['coldeffect(H)'])],
      boss: num(m.boss) === 1,
    };
  }
  return out;
}

/** Classe du jeu de chaque ligne de CharStats.txt */
const CHAR_CLASS: Record<string, string> = {
  Amazon: 'amazon',
  Sorceress: 'sorceress',
  Necromancer: 'necromancer',
  Paladin: 'paladin',
  Barbarian: 'barbarian',
  Druid: 'druid',
  Assassin: 'assassin',
};

export interface ClassStats {
  str: number;
  dex: number;
  vit: number;
  ene: number;
  life: number;
  mana: number;
  lifePerLevel: number;
  lifePerVit: number;
  manaPerLevel: number;
  manaPerEne: number;
  stamina: number;
  staminaPerLevel: number;
  staminaPerVit: number;
  runDrain: number;
  toHitFactor: number;
  blockFactor: number;
  manaRegen: number;
}

/**
 * CharStats.txt par classe du jeu : départ (str, dex, vit, int), vie de départ (vit + hpadd), mana de départ (int), gains par niveau et
 * par point (colonnes en quarts de point), endurance de départ et gains, RunDrain ; ToHitFactor (score d'attaque), BlockFactor (blocage
 * avec un bouclier), ManaRegen (secondes pour remplir la réserve de mana)
 */
export function classStats(): Record<string, ClassStats> {
  const out: Record<string, ClassStats> = {};
  for (const r of rows('CharStats')) {
    const id = CHAR_CLASS[r.class];
    if (!id) continue;
    out[id] = {
      str: num(r.str),
      dex: num(r.dex),
      vit: num(r.vit),
      ene: num(r.int),
      life: num(r.vit) + num(r.hpadd),
      mana: num(r.int),
      lifePerLevel: num(r.LifePerLevel) / 4,
      lifePerVit: num(r.LifePerVitality) / 4,
      manaPerLevel: num(r.ManaPerLevel) / 4,
      manaPerEne: num(r.ManaPerMagic) / 4,
      stamina: num(r.stamina),
      staminaPerLevel: num(r.StaminaPerLevel) / 4,
      staminaPerVit: num(r.StaminaPerVitality) / 4,
      runDrain: num(r.RunDrain),
      toHitFactor: num(r.ToHitFactor),
      blockFactor: num(r.BlockFactor),
      manaRegen: num(r.ManaRegen),
    };
  }
  if (Object.keys(out).length !== 7) throw new Error('CharStats.txt : sept classes attendues');
  return out;
}
