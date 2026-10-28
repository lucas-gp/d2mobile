/** Attaques types des monstres (mêlée, projectile, nova) : communes à monsters.ts et monsters-d2.ts. */
import type { MonsterAttack } from './types';

export const melee = (frames = 14, hitFrame = 7, dmgMul = 1, range = 0.6, element: MonsterAttack['element'] = 'phys'): MonsterAttack => ({
  kind: 'melee',
  range,
  frames,
  hitFrame,
  element,
  dmgMul,
  // délai d'IA entre deux coups (D2 : les monstres de mêlée frappent environ une fois par seconde)
  cooldown: 12,
  weight: 10,
});

export const missile = (missileKind: string, element: MonsterAttack['element'], range = 10, dmgMul = 0.8, cooldown = 30): MonsterAttack => ({
  kind: 'missile',
  range,
  frames: 16,
  hitFrame: 9,
  element,
  dmgMul,
  cooldown,
  missile: missileKind,
  weight: 10,
});

export const nova = (element: MonsterAttack['element'], radius: number, dmgMul: number, cooldown: number, weight = 4): MonsterAttack => ({
  kind: 'nova',
  range: radius - 0.5,
  frames: 18,
  hitFrame: 10,
  element,
  dmgMul,
  cooldown,
  radius,
  weight,
});

/** Malédiction lancée sur le joueur (D2 : Weaken, Decrepify, Defense Curse ; Uber Baal PD2 : Lower Resist) */
export const curse = (id: string, cooldown = 200): MonsterAttack => ({
  kind: 'curse',
  range: 9,
  frames: 18,
  hitFrame: 10,
  element: 'magic',
  dmgMul: 0,
  cooldown,
  curse: id,
  weight: 2,
});

/** Soin d'un allié blessé (Soin zakarum, Vortex de soin) */
export const heal = (cooldown = 150): MonsterAttack => ({
  kind: 'heal',
  range: 8,
  frames: 18,
  hitFrame: 10,
  element: 'magic',
  dmgMul: 0,
  cooldown,
  weight: 3,
});

/**
 * Compétence de boss D2 à effet télégraphié (monstats.txt Skill1..8) : Mur de feu (DiabWall, PrimeFirewall, VampireFirewall),
 * Blizzard (Méphisto), Éclair en chaîne (PrimeLightning), éclairs en éventail (MephistoMissile), Prison d'os (DiabPrison), Tentacules (Baal Tentacle).
 */
export const cast = (pattern: NonNullable<MonsterAttack['pattern']>, element: MonsterAttack['element'], range: number, dmgMul: number, cooldown: number, weight = 3, shots = 1): MonsterAttack => ({
  kind: 'cast',
  range,
  frames: 22,
  hitFrame: 12,
  element,
  dmgMul,
  cooldown,
  pattern,
  shots,
  weight,
});
