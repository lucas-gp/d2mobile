/** Explosion à dégâts de zone (module séparé de missiles.ts : dépend du combat, que missiles.ts ne doit pas importer). */
import { dist } from '../core/math';
import type { Element } from '../data/stats';
import type { DamagePacket, Monster } from './actors';
import { damageMonster } from './combat';
import type { World } from './world';

const buf: Monster[] = [];

/** Applique un paquet de dégâts à tous les ennemis dans un rayon. Renvoie le nombre de touchés. */
export function explode(w: World, team: 0 | 1, x: number, y: number, r: number, dmg: DamagePacket, kind: string, elem: Element, owner?: number): number {
  w.events.push({ t: 'impact', kind, x, y, radius: r, elem });
  if (team === 0) {
    // explosion lancée par le mercenaire : c'est lui l'attaquant (vie par victime, découverte d'objets)
    const merc = owner !== undefined && owner !== w.player.id ? w.monsters.find((o) => o.id === owner && o.pet === 'merc') : undefined;
    const hits = w.monstersNear(x, y, r, buf);
    for (const m of hits) {
      if (merc) damageMonster(w, m, dmg, merc);
      else w.hurtMonster(m, dmg);
    }
    return hits.length;
  }
  const p = w.player;
  if (!p.dead && dist(x, y, p.x, p.y) <= r + p.radius) {
    w.hurtPlayerPacket(null, dmg);
    return 1;
  }
  return 0;
}
