/** Propriété des projectiles et zones créés pendant le lancer d'une ombre (module feuille, voir shadow-cast.ts). */
import type { World } from './world';

/** Propriétaire d'un projectile ou d'une zone créés pendant le lancer d'une ombre */
export function shadowOwner(w: World, owner: number): number {
  return w.actingAs && owner === w.player.id ? w.actingAs.id : owner;
}

export function shadowSpawn(w: World, owner: number): true | undefined {
  return w.actingAs && (owner === w.player.id || owner === w.actingAs.id) ? true : undefined;
}
