/**
 * Taille des objets dans l'inventaire (cases, comme Diablo II : casque 2 × 2, armure 2 × 3, bâton 1 × 4…).
 * Table par type avec quelques exceptions de nom ; l'inventaire est une grille de 10 × 4 cases.
 */
import type { ItemBase } from '../types';
import { D2_SIZES } from './sizes-d2';

export function baseSize(b: Pick<ItemBase, 'id' | 'type' | 'tier' | 'twoHanded'>): [number, number] {
  const id = b.id;
  // table D2 (armor.txt / weapons.txt) quand la base en vient ; sinon l'estimation par type ci-dessous
  const exact = D2_SIZES[id];
  if (exact) return exact;
  switch (b.type) {
    case 'staff':
      return [1, 4];
    case 'orb':
    case 'wand':
    case 'dagger':
    case 'thrown':
      return [1, 2];
    case 'sword':
    case 'mace':
    case 'claw':
    case 'scepter':
    case 'javelin':
      return b.twoHanded ? [2, 3] : [1, 3];
    case 'axe':
      return /hand|throwing/.test(id) ? [1, 2] : [2, 3];
    case 'spear':
    case 'polearm':
      return [2, 4];
    case 'bow':
      return /long|war|great|hydra|grand|edge|blade|razor|diamond|ward/.test(id) ? [2, 4] : [2, 3];
    case 'crossbow':
      return [2, 3];
    case 'circlet':
    case 'helm':
    case 'pelt':
    case 'primal':
    case 'head':
    case 'gloves':
    case 'boots':
      return [2, 2];
    case 'armor':
      return [2, 3];
    case 'shield':
      return b.tier > 0 || /large|kite|tower|body|spiked|bone|heater|pavise|aegis|monarch|ward|shield_/.test(id) ? [2, 3] : [2, 2];
    case 'belt':
      return [2, 1];
    case 'largecharm':
      return [1, 2];
    case 'grandcharm':
      return [1, 3];
    default:
      return [1, 1];
  }
}
