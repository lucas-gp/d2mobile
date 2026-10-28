/**
 * Coffre de cartes : sortie d'une carte du coffre vers le sac. Le reste (constantes, ajout, tri) vit dans
 * mapstash-core.ts, sans dépendance à inventory.ts ; ré-exporté ici.
 */
import type { CharacterState } from './character-state';
import { placeInInventory } from './inventory';

export * from './mapstash-core';

/** Sort la carte `idx` du coffre de cartes vers le sac (place requise) ; renvoie l'indice dans le sac, -1 sinon */
export function takeMapFromStash(c: CharacterState, idx: number): number {
  const it = c.mapStash?.[idx];
  if (!it) return -1;
  const at = placeInInventory(c, it);
  if (at >= 0) c.mapStash!.splice(idx, 1);
  return at;
}
