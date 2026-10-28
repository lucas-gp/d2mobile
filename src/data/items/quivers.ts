/**
 * Carquois : un carquois se porte dans l'emplacement secondaire avec l'arme qui lui correspond (arc ou arbalète). Les carquois eux-mêmes
 * (bases, uniques, mots runiques) sont un ajout de Project Diablo 2 : mods/pd2/data/items/quivers.ts.
 */

/** Arme que le carquois accompagne : flèches avec un arc, carreaux avec une arbalète */
function quiverWeapon(b: { id: string }): 'bow' | 'crossbow' {
  return b.id.endsWith('_bolts') ? 'crossbow' : 'bow';
}
export function quiverFits(quiver: { id: string }, weapon: { type: string } | undefined | null): boolean {
  return !!weapon && weapon.type === quiverWeapon(quiver);
}
