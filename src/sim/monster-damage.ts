/** Jet de dégâts brut d'une attaque de monstre. Module séparé de ai.ts pour que mindcontrol.ts n'en dépende pas (cycle). */
import type { MonsterAttack } from '../data/types';
import { MISSILE_DMG } from '../data/curves';
import type { Monster } from './actors';
import { auraDmgMul } from './monster-auras';
import type { World } from './world';

export function rollMonsterDamage(w: World, m: Monster, atk: MonsterAttack): number {
  return w.rng.combat.float(m.dmgMin, m.dmgMax) * atk.dmgMul * (m.dmgMul ?? 1) * auraDmgMul(m, w.tick) * (atk.kind === 'missile' ? MISSILE_DMG[w.difficulty] : 1);
  // les compétences 'cast' appliquent MISSILE_DMG elles-mêmes (castBossSkill) : le jet de dégâts reste brut ici
}
