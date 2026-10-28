/**
 * Monstres retournés : convertis par le Paladin (Conversion) ou l'Assassin (Souffle mental), ou
 * rendus confus par le Nécromancien (Confusion) ; les monstres attirés (Attraction) reçoivent les
 * coups de leurs voisins. Un monstre converti combat pour le joueur (l'expérience va au joueur) ;
 * un monstre confus frappe au hasard tout ce qui l'entoure, alliés comme ennemis.
 */
import { dist } from '../core/math';
import { emptyPacket, type Monster } from './actors';
import { rollMonsterDamage } from './monster-damage';
import { damageMonster } from './combat';
import type { World } from './world';
import { DT } from './constants';

const buf: Monster[] = [];

/** Un tick de comportement d'un monstre converti ou confus. Renvoie true s'il a agi. */
export function updateControlled(w: World, m: Monster): boolean {
  const converted = (m.convertedUntil ?? 0) > w.tick;
  const confused = (m.confusedUntil ?? 0) > w.tick;
  if (!converted && !confused) return false;
  m.aggro = true;
  const atk = m.def.attacks[0];
  if (m.atkCd[0] > 0) m.atkCd[0]--;
  // cible : le monstre le plus proche (les convertis ne s'attaquent pas entre eux)
  let target: Monster | null = null;
  let bd = 9;
  for (const o of w.monstersNear(m.x, m.y, 9, buf)) {
    if (o === m || o.dead || o.isSummon) continue;
    if (converted && (o.convertedUntil ?? 0) > w.tick) continue;
    const d = dist(m.x, m.y, o.x, o.y);
    if (d < bd) {
      bd = d;
      target = o;
    }
  }
  if ((m.attractUntil ?? 0) > w.tick && m.attractTarget) {
    const lure = w.monsters.find((o) => o.id === m.attractTarget && !o.dead);
    if (lure) {
      target = lure;
      bd = dist(m.x, m.y, lure.x, lure.y);
    }
  }
  if (!target) {
    if (converted) {
      // escorte le joueur
      const p = w.player;
      const d = dist(m.x, m.y, p.x, p.y);
      if (d > 3) {
        w.moveActor(m, ((p.x - m.x) / d) * m.speed * DT, ((p.y - m.y) / d) * m.speed * DT, false);
        m.mode = 'walk';
      } else m.mode = 'idle';
    } else {
      // confus : titube au hasard
      if (w.tick % 20 === m.id % 20) m.facing = w.rng.ai.float(0, Math.PI * 2);
      w.moveActor(m, Math.cos(m.facing) * m.speed * 0.5 * DT, Math.sin(m.facing) * m.speed * 0.5 * DT, false);
      m.mode = 'walk';
    }
    return true;
  }
  const reach = bd - m.radius - target.radius;
  m.facing = Math.atan2(target.y - m.y, target.x - m.x);
  if (reach > atk.range + 0.3) {
    w.moveActor(m, Math.cos(m.facing) * m.speed * DT, Math.sin(m.facing) * m.speed * DT, false);
    m.mode = 'walk';
    return true;
  }
  if (m.atkCd[0] <= 0) {
    m.atkCd[0] = Math.max(8, atk.cooldown);
    m.mode = 'attack';
    m.modeT = 0;
    m.modeLen = atk.frames;
    m.atkApplied = true;
    const pk = emptyPacket(false);
    pk.phys = rollMonsterDamage(w, m, atk) * (converted ? 1 : 0.7);
    damageMonster(w, target, pk, converted ? w.player : null);
  } else m.mode = 'idle';
  return true;
}
