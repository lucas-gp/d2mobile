/** Fabrique des bases d'objets : emplacement, châsses et prix par défaut selon le type. */
import type { ItemBase, ItemType } from '../types';

export type B = Omit<ItemBase, 'icon' | 'rarity' | 'price' | 'maxSockets'> & Partial<Pick<ItemBase, 'icon' | 'rarity' | 'price' | 'maxSockets'>>;

const SOCKETS: Partial<Record<ItemType, number>> = {
  staff: 6,
  orb: 3,
  pelt: 3,
  primal: 3,
  head: 2,
  wand: 2,
  bow: 5,
  crossbow: 5,
  polearm: 6,
  spear: 6,
  claw: 3,
  scepter: 5,
  sword: 4,
  dagger: 3,
  mace: 5,
  axe: 5,
  circlet: 3,
  helm: 3,
  armor: 4,
  shield: 4,
};

export function mk(b: B): ItemBase {
  return {
    icon: b.icon ?? b.type,
    rarity: b.rarity ?? 3,
    price: b.price ?? Math.round(20 + b.qlvl * b.qlvl * 0.8),
    maxSockets: b.maxSockets ?? SOCKETS[b.type] ?? 0,
    ...b,
    slot: b.slot ?? slotFor(b.type),
  } as ItemBase;
}

function slotFor(t: ItemType): ItemBase['slot'] {
  switch (t) {
    case 'staff':
    case 'orb':
    case 'wand':
    case 'sword':
    case 'dagger':
    case 'mace':
    case 'axe':
    case 'bow':
    case 'polearm':
    case 'spear':
    case 'javelin':
    case 'claw':
    case 'scepter':
    case 'crossbow':
    case 'thrown':
      return 'mainhand';
    case 'shield':
    case 'head':
      return 'offhand';
    case 'circlet':
    case 'helm':
    case 'pelt':
    case 'primal':
      return 'head';
    case 'armor':
      return 'body';
    case 'gloves':
      return 'gloves';
    case 'boots':
      return 'boots';
    case 'belt':
      return 'belt';
    case 'amulet':
      return 'amulet';
    case 'ring':
      return 'ring';
    default:
      return undefined;
  }
}
