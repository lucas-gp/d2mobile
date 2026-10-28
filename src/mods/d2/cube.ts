/**
 * Artisanat de la base : Diablo II LoD 1.13c (lot M10c). Implémentation de la règle `cube.craft` (src/mods/rules.ts) quand aucun mod ne la
 * remplace : par famille et par emplacement, la recette de CubeMain.txt (src/data/cube-d2.ts) — une base précise (et ses versions
 * exceptionnelle et élite) ou un type d'objet d'ItemTypes.txt, une rune, des propriétés fixes. Module feuille (tables seulement).
 */
import { D2_CRAFTS } from '../../data/cube-d2';
import { d2TypeIs } from '../../data/items/itemtypes';
import type { ItemBase, StatRoll } from '../../data/types';

/** Rune et propriétés fixes de l'artisanat d'une famille sur cette base (`slot` : emplacement d'artisanat), null si la recette ne l'accepte pas */
export function craft(family: string, slot: string, base: ItemBase): { rune: string; mods: readonly StatRoll[] } | null {
  const c = D2_CRAFTS[family]?.[slot];
  if (!c) return null;
  const ok = c.accept.some((a) => (a.startsWith('d2:') ? d2TypeIs(base, a.slice(3)) : a === base.id));
  return ok ? { rune: c.rune, mods: c.mods } : null;
}
